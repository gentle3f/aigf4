import { requireAuthenticatedRequest } from '../api/_auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODELS = new Set(['glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus']);
const REVIEW_MODELS=new Set(["glm-5-3-flash-uncensored","deepseek-v4-1-flash-1017-uncensored"]);
const REVIEW_FORMAT={"type":"json_schema","json_schema":{"name":"strict_chat_review","strict":true,"schema":{"type":"object","additionalProperties":false,"required":["decision","issues","revised_response"],"properties":{"decision":{"type":"string","enum":["keep","revise"]},"issues":{"type":"array","maxItems":8,"items":{"type":"string","enum":["request_mismatch","identity","speaker_ownership","continuity","reality_layer","wardrobe","state","replayed_beat","persona_voice","third_party_speech","user_agency","incomplete_ending","group_narration","other"]}},"revised_response":{"type":"string"}}}}};
const PERSONA_MEMORY_FORMAT={"type":"json_schema","json_schema":{"name":"persona_memory_update_v3","strict":true,"schema":{"type":"object","additionalProperties":false,"required":["memories"],"properties":{"memories":{"type":"array","maxItems":12,"items":{"type":"object","additionalProperties":false,"required":["kind","title","summary","importance","unresolved","scene_id","source_message_ids","search_tags"],"properties":{"kind":{"type":"string","enum":["relationship","vulnerability","promise","preference","event","boundary"]},"title":{"type":"string"},"summary":{"type":"string"},"importance":{"type":"integer","minimum":1,"maximum":5},"unresolved":{"type":"boolean"},"scene_id":{"type":"string"},"source_message_ids":{"type":"array","minItems":1,"items":{"type":"string"}},"search_tags":{"type":"array","minItems":2,"maxItems":10,"items":{"type":"string"}}}}}}}}};
const canonical=value=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const LIMIT = 256 * 1024;
const SAFE_ERRORS = /^(?:EMPTY_VISIBLE_REPLY(?:_TOKEN_LIMIT)?|INVALID_PROVIDER_(?:RESPONSE|JSON)|WORKFLOW_(?:TRUNCATED|REVIEW_INVALID)|PROVIDER_(?:HTTP_[1-5][0-9]{2}|TIMEOUT|DNS_ERROR|TLS_ERROR|NETWORK_ERROR|RESPONSE_TOO_LARGE|FAILURE)); no automatic retry$/;

const CANDIDATE_MARKER='__AIGF_CANDIDATE_V1__';
function validateTextPayload(p) {
  const allowed=new Set(['model','messages','max_completion_tokens','max_tokens','temperature','top_p','repetition_penalty','stop','seed','venice_parameters','reasoning_effort','prompt_cache_key','response_format']);
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!allowed.has(k))||!MODELS.has(p.model)
    ||!Array.isArray(p.messages)||p.messages.length<1||p.messages.length>300
    ||p.messages.some(m=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||Object.keys(m).some(k=>!['role','content'].includes(k)))) return 'UNSUPPORTED_PILOT_REQUEST';
  if(p.reasoning_effort!==undefined&&p.reasoning_effort!=='none') return 'UNSUPPORTED_REASONING_EFFORT';
  if(p.prompt_cache_key!==undefined&&(typeof p.prompt_cache_key!=='string'||!/^wetapp-(chat|review)-v1-[a-z0-9]{1,32}$/.test(p.prompt_cache_key))) return 'INVALID_PROMPT_CACHE_KEY';
  if(p.response_format!==undefined&&(!REVIEW_MODELS.has(p.model)||![canonical(REVIEW_FORMAT),canonical(PERSONA_MEMORY_FORMAT)].includes(canonical(p.response_format)))) return 'UNSUPPORTED_REVIEW_SCHEMA';
  const max=p.max_completion_tokens??p.max_tokens??4096;
  if(!Number.isInteger(max)||max<1||max>8192) return 'INVALID_OUTPUT_LIMIT';
  const vp=p.venice_parameters??{};
  const allowedVP=new Set(['include_venice_system_prompt','disable_thinking','strip_thinking_response','enable_web_search','enable_web_scraping','enable_web_citations']);
  if(typeof vp!=='object'||Array.isArray(vp)||Object.keys(vp).some(k=>!allowedVP.has(k))||Object.entries(vp).some(([k,v])=>k==='enable_web_search'?v!=='off':typeof v!=='boolean')) return 'UNSUPPORTED_VENICE_PARAMETERS';
  if(vp.enable_web_scraping===true||vp.enable_web_citations===true) return 'UNSUPPORTED_VENICE_PARAMETERS';
  return null;
}
function validateWorkflowPayload(p) {
  if(!p||typeof p!=='object'||Array.isArray(p)||![1,2].includes(p.workflow_version)||Object.keys(p).sort().join(',')!==(p.workflow_version===2?'polish,primary,review,workflow_version':'primary,review,workflow_version'))return 'UNSUPPORTED_WORKFLOW';
  const primaryError=validateTextPayload(p.primary),reviewError=validateTextPayload(p.review);
  if(primaryError||reviewError)return primaryError||reviewError;
  if(p.workflow_version===2){const e=validateTextPayload(p.polish);if(e)return e;if(!REVIEW_MODELS.has(p.polish.model)||p.polish.response_format!==undefined||p.polish.messages.length!==2||p.polish.messages[0].role!=='system'||p.polish.messages[0].content.includes(CANDIDATE_MARKER)||p.polish.messages[1].role!=='user'||p.polish.messages[1].content!==CANDIDATE_MARKER)return 'INVALID_POLISH_PLAN';}
  if(p.primary.response_format!==undefined||p.review.model!=='glm-5-3-flash-uncensored'||canonical(p.review.response_format)!==canonical(REVIEW_FORMAT))return 'UNSUPPORTED_WORKFLOW';
  if(p.primary.messages.at(-1).role!=='user'||p.review.messages.at(-1).role!=='user')return 'UNSUPPORTED_WORKFLOW';
  const occurrences=p.review.messages.reduce((n,m)=>n+m.content.split(CANDIDATE_MARKER).length-1,0);
  if(occurrences!==1||!p.review.messages.at(-1).content.includes(CANDIDATE_MARKER))return 'INVALID_WORKFLOW_MARKER';
  return null;
}
const safeUsage=u=>u&&typeof u==='object'?Object.fromEntries(Object.entries(u).filter(([k,v])=>['prompt_tokens','completion_tokens','total_tokens'].includes(k)&&Number.isFinite(v)&&v>=0)):undefined;
const safeCost=c=>c&&typeof c==='object'?Object.fromEntries(Object.entries(c).filter(([k,v])=>['usd','diem'].includes(k)&&Number.isFinite(v)&&v>=0)):undefined;
function safeWorkflow(w) {
  if(!w||![1,2].includes(w.version)||!Array.isArray(w.parts)||w.parts.length<1||w.parts.length>3||w.parts.some(p=>typeof p!=='string'||!p.trim())||!Array.isArray(w.stages)||w.stages.length<2||w.stages.length>(w.version===2?6:5))return null;
  if(w.version===2&&w.polished!==null&&(typeof w.polished!=='string'||!w.polished.trim()||/<\/?wardrobe/i.test(w.polished)))return null;
  const review=w.review?.choices?.[0],content=review?.message?.content;
  if(typeof content!=='string'||!content.trim())return null;
  const phases=w.stages.map(s=>s?.phase);
  const expected=['primary',...(w.parts.length>=2?['continuation-1']:[]),...(w.parts.length===3?['continuation-2']:[]),...(w.version===2?['cc-polish']:[]),'review-1'];
  if(phases.length===expected.length+1)expected.push('review-2');
  if(phases.join(',')!==expected.join(','))return null;
  return {version:w.version,parts:w.parts,...(w.version===2?{polished:w.polished}:{}),review:{model:typeof w.review.model==='string'?w.review.model:undefined,choices:[{message:{content},finish_reason:typeof review.finish_reason==='string'?review.finish_reason:null}],usage:safeUsage(w.review.usage),cost:safeCost(w.review.cost)},stages:w.stages.map(s=>({phase:s.phase,model:typeof s.model==='string'?s.model:undefined,finish_reason:typeof s.finish_reason==='string'?s.finish_reason:null,usage:safeUsage(s.usage),cost:safeCost(s.cost)}))};
}

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
      const validation=p&&typeof p==='object'&&'workflow_version' in p?validateWorkflowPayload(p):validateTextPayload(p);
      if(validation)return res.status(400).json({error:validation});
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
        if(result.workflow!==undefined){
          const workflow=safeWorkflow(result.workflow);
          if(!workflow||workflow.parts.join('\n')!==content)return res.status(502).json({error:'INVALID_QUEUE_RESPONSE'});
          safe.result.workflow=workflow;
        }
      }
      if(d.status==='failed'||d.status==='interrupted'||d.status==='cancelled') safe.error=typeof d.error==='string'&&SAFE_ERRORS.test(d.error)?d.error:'JOB_'+d.status.toUpperCase();
      return res.status(method==='POST'?202:200).json(safe);
    } catch {return res.status(503).json({error:'QUEUE_TRANSPORT_UNCERTAIN',job_id:jobId});}
  };
}
export default createGenerationHandler();
