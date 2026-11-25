import { requireAuthenticatedRequest } from '../api/_auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODELS = new Set(['glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus']);
const LIMIT = 256 * 1024;
const SAFE_ERRORS = /^(?:EMPTY_VISIBLE_REPLY(?:_TOKEN_LIMIT)?|INVALID_PROVIDER_(?:RESPONSE|JSON)|PROVIDER_(?:HTTP_[1-5][0-9]{2}|TIMEOUT|DNS_ERROR|TLS_ERROR|NETWORK_ERROR|RESPONSE_TOO_LARGE|FAILURE)); no automatic retry$/;

export function createGenerationHandler({fetchImpl=fetch, authenticate=requireAuthenticatedRequest, env=process.env}={}) {
  return async function handler(req,res) {
    res.setHeader('Cache-Control','no-store');
    if (!authenticate(req,res)) return;
    if (env.VERCEL_ENV === 'production' || env.AIGF_VPS_QUEUE_ENABLED !== '1') return res.status(503).json({error:'QUEUE_DISABLED'});
    const method=req.method;
    if (!['POST','GET'].includes(method)) {
      res.setHeader('Allow','GET, POST');
      return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    }
    let base;
    try {
      base=new URL(env.AIGF_VPS_QUEUE_URL);
      if (base.protocol!=='https:' || base.username || base.password || base.pathname!=='/' || base.search || base.hash) throw Error();
    } catch {return res.status(503).json({error:'QUEUE_NOT_CONFIGURED'});}
    const token=env.AIGF_VPS_QUEUE_TOKEN;
    if (!token || token.length<32) return res.status(503).json({error:'QUEUE_NOT_CONFIGURED'});
    const headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'};
    const accessId=env.AIGF_VPS_ACCESS_CLIENT_ID, accessSecret=env.AIGF_VPS_ACCESS_CLIENT_SECRET;
    if (Boolean(accessId)!==Boolean(accessSecret)) return res.status(503).json({error:'QUEUE_NOT_CONFIGURED'});
    if(accessId){headers['CF-Access-Client-Id']=accessId;headers['CF-Access-Client-Secret']=accessSecret;}
    const jobId=method==='POST'?req.body?.job_id:req.query?.job_id;
    if(typeof jobId!=='string'||!UUID.test(jobId)) return res.status(400).json({error:'INVALID_JOB_ID'});
    let body;
    if(method==='POST') {
      // Text-only pilot. Explicitly reject incompatible payloads before dispatch.
      const p=req.body?.request;
      const allowed=new Set(['model','messages','max_completion_tokens','max_tokens','temperature','top_p','repetition_penalty','stop','seed','venice_parameters']);
      if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.has(k))||!MODELS.has(p.model)
        ||!Array.isArray(p.messages)||p.messages.length<1||p.messages.length>300
        ||p.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||Object.keys(m).some(k=>!['role','content'].includes(k)))) return res.status(400).json({error:'UNSUPPORTED_PILOT_REQUEST'});
      const max=p.max_completion_tokens??p.max_tokens??4096;
      if(!Number.isInteger(max)||max<1||max>8192) return res.status(400).json({error:'INVALID_OUTPUT_LIMIT'});
      const vp=p.venice_parameters??{};
      const allowedVP=new Set(['include_venice_system_prompt','disable_thinking','strip_thinking_response','enable_web_search','enable_web_scraping','enable_web_citations']);
      if(typeof vp!=='object'||Array.isArray(vp)||Object.keys(vp).some(k=>!allowedVP.has(k))||Object.entries(vp).some(([k,v])=>k==='enable_web_search'?v!=='off':typeof v!=='boolean')) return res.status(400).json({error:'UNSUPPORTED_VENICE_PARAMETERS'});
      if(vp.enable_web_scraping===true||vp.enable_web_citations===true) return res.status(400).json({error:'UNSUPPORTED_VENICE_PARAMETERS'});
      body=JSON.stringify({job_id:jobId,request:p});
      if(Buffer.byteLength(body)>LIMIT) return res.status(413).json({error:'REQUEST_TOO_LARGE'});
    }
    try {
      const path=method==='POST'?'/v1/jobs':'/v1/jobs/'+jobId;
      const upstream=await fetchImpl(new URL(path,base),{method,headers,body,redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!upstream.ok) {
        const code=upstream.status;
        return res.status([400,404,409,413,429].includes(code)?code:502).json({error:'QUEUE_HTTP_'+code});
      }
      const d=await upstream.json();
      if(d.job_id!==jobId||!['queued','running','done','failed','interrupted','cancelled'].includes(d.status)) return res.status(502).json({error:'INVALID_QUEUE_RESPONSE'});
      const result=d.result;
      const choice=result?.choices?.[0];
      // Return only visible text and minimal accounting; not provider reasoning or raw metadata.
      const safe={job_id:jobId,status:d.status};
      if(method==='POST') safe.reused=Boolean(d.reused);
      if(method==='GET'&&d.status==='done'){
        const content=choice?.message?.content;
        if(typeof content!=='string'||!content.trim()) return res.status(502).json({error:'INVALID_QUEUE_RESPONSE'});
        safe.result={model:result.model,choices:[{message:{content},finish_reason:choice.finish_reason??null}],usage:result.usage,cost:result.cost};
      }
      if(d.status==='failed'||d.status==='interrupted'||d.status==='cancelled') safe.error=typeof d.error==='string'&&SAFE_ERRORS.test(d.error)?d.error:'JOB_'+d.status.toUpperCase();
      return res.status(method==='POST'?202:200).json(safe);
    } catch {return res.status(503).json({error:'QUEUE_TRANSPORT_UNCERTAIN',job_id:jobId});}
  };
}
export default createGenerationHandler();
