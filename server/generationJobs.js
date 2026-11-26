import {createHmac} from 'node:crypto';
import { requireAuthenticatedRequest } from '../api/_auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODELS = new Set(['glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus']);
const REVIEW_MODELS=new Set(["glm-5-3-flash-uncensored","deepseek-v4-1-flash-1017-uncensored"]);
const REVIEW_FORMAT={"type":"json_schema","json_schema":{"name":"strict_chat_review","strict":true,"schema":{"type":"object","additionalProperties":false,"required":["decision","issues","revised_response"],"properties":{"decision":{"type":"string","enum":["keep","revise"]},"issues":{"type":"array","maxItems":8,"items":{"type":"string","enum":["request_mismatch","identity","speaker_ownership","continuity","reality_layer","wardrobe","state","replayed_beat","persona_voice","third_party_speech","user_agency","incomplete_ending","group_narration","other"]}},"revised_response":{"type":"string"}}}}};
const PERSONA_MEMORY_FORMAT={"type":"json_schema","json_schema":{"name":"persona_memory_update_v3","strict":true,"schema":{"type":"object","additionalProperties":false,"required":["memories"],"properties":{"memories":{"type":"array","maxItems":12,"items":{"type":"object","additionalProperties":false,"required":["kind","title","summary","importance","unresolved","scene_id","source_message_ids","search_tags"],"properties":{"kind":{"type":"string","enum":["relationship","vulnerability","promise","preference","event","boundary"]},"title":{"type":"string"},"summary":{"type":"string"},"importance":{"type":"integer","minimum":1,"maximum":5},"unresolved":{"type":"boolean"},"scene_id":{"type":"string"},"source_message_ids":{"type":"array","minItems":1,"items":{"type":"string"}},"search_tags":{"type":"array","minItems":2,"maxItems":10,"items":{"type":"string"}}}}}}}}};
const ROOM_MEMORY_FORMAT={"type":"json_schema","json_schema":{"name":"room_memory_update_v3","strict":true,"schema":{"type":"object","additionalProperties":false,"required":["memories"],"properties":{"memories":{"type":"array","maxItems":12,"items":{"type":"object","additionalProperties":false,"required":["kind","title","shared_summary","subject_ids","importance","visibility","unresolved","scene_id","source_message_ids","search_tags","perspectives"],"properties":{"kind":{"type":"string","enum":["relationship","vulnerability","promise","preference","event","boundary"]},"title":{"type":"string"},"shared_summary":{"type":"string"},"subject_ids":{"type":"array","minItems":1,"items":{"type":"string"}},"importance":{"type":"integer","minimum":1,"maximum":5},"visibility":{"type":"string","enum":["restricted","shared"]},"unresolved":{"type":"boolean"},"scene_id":{"type":"string"},"source_message_ids":{"type":"array","minItems":1,"items":{"type":"string"}},"search_tags":{"type":"array","minItems":2,"maxItems":10,"items":{"type":"string"}},"perspectives":{"type":"array","minItems":1,"items":{"type":"object","additionalProperties":false,"required":["member_id","salience","knowledge","memory"],"properties":{"member_id":{"type":"string"},"salience":{"type":"integer","minimum":1,"maximum":5},"knowledge":{"type":"string","enum":["experienced","witnessed","told"]},"memory":{"type":"string"}}}}}}}}}}};
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
  if(p.response_format!==undefined&&(!REVIEW_MODELS.has(p.model)||![canonical(REVIEW_FORMAT),canonical(PERSONA_MEMORY_FORMAT),canonical(ROOM_MEMORY_FORMAT)].includes(canonical(p.response_format)))) return 'UNSUPPORTED_REVIEW_SCHEMA';
  const max=p.max_completion_tokens??p.max_tokens??4096;
  if(!Number.isInteger(max)||max<1||max>8192) return 'INVALID_OUTPUT_LIMIT';
  const vp=p.venice_parameters??{};
  const allowedVP=new Set(['include_venice_system_prompt','disable_thinking','strip_thinking_response','enable_web_search','enable_web_scraping','enable_web_citations']);
  if(typeof vp!=='object'||Array.isArray(vp)||Object.keys(vp).some(k=>!allowedVP.has(k))||Object.entries(vp).some(([k,v])=>k==='enable_web_search'?v!=='off':typeof v!=='boolean')) return 'UNSUPPORTED_VENICE_PARAMETERS';
  if(vp.enable_web_scraping===true||vp.enable_web_citations===true) return 'UNSUPPORTED_VENICE_PARAMETERS';
  return null;
}
function validateWorkflowPayload(p) {
  if(!p||typeof p!=='object'||Array.isArray(p)||![1,2,3].includes(p.workflow_version)||Object.keys(p).sort().join(',')!==(p.workflow_version===2?'polish,primary,review,workflow_version':'primary,review,workflow_version'))return 'UNSUPPORTED_WORKFLOW';
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
  if(!w||![1,2,3].includes(w.version)||!Array.isArray(w.parts)||w.parts.length<1||w.parts.length>3||w.parts.some(p=>typeof p!=='string'||!p.trim())||!Array.isArray(w.stages)||w.stages.length<2||w.stages.length>(w.version===2?6:5))return null;
  if(w.version===2&&w.polished!==null&&(typeof w.polished!=='string'||!w.polished.trim()||/<\/?wardrobe/i.test(w.polished)))return null;
  const review=w.review?.choices?.[0],content=review?.message?.content;
  if(typeof content!=='string'||!content.trim())return null;
  if(w.version===3&&w.parts.length!==1)return null;
  const phases=w.stages.map(s=>s?.phase);
  const expected=['primary',...(w.parts.length>=2?['continuation-1']:[]),...(w.parts.length===3?['continuation-2']:[]),...(w.version===2?['cc-polish']:[]),'review-1'];
  if(phases.length===expected.length+1)expected.push('review-2');
  if(phases.join(',')!==expected.join(','))return null;
  return {version:w.version,parts:w.parts,...(w.version===2?{polished:w.polished}:{}),review:{model:typeof w.review.model==='string'?w.review.model:undefined,choices:[{message:{content},finish_reason:typeof review.finish_reason==='string'?review.finish_reason:null}],usage:safeUsage(w.review.usage),cost:safeCost(w.review.cost)},stages:w.stages.map(s=>({phase:s.phase,model:typeof s.model==='string'?s.model:undefined,finish_reason:typeof s.finish_reason==='string'?s.finish_reason:null,usage:safeUsage(s.usage),cost:safeCost(s.cost)}))};
}

function validateAutoVideo(p){
 if(!p||p.video_auto_version!==1||p.duration!=='5s'||p.resolution!=='720p'||'video_submit_version' in p)return 'INVALID_AUTO_VIDEO';
 const {video_auto_version,...rest}=p;
 return validateVideoSubmission({...rest,video_submit_version:1});
}
function validateVideoRetrieval(p){
 return p&&p.video_retrieve_version===1&&p.model==='wan-2-7-enhanced-text-to-video'&&typeof p.queue_id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(p.queue_id)&&Object.keys(p).sort().join(',')==='model,queue_id,video_retrieve_version'?null:'INVALID_VIDEO_RETRIEVAL';
}
function validateVideoSubmission(p){
  if(!p||typeof p!=='object'||Array.isArray(p)||p.video_submit_version!==1||p.model!=='wan-2-7-enhanced-text-to-video'||p.adultConfirmed!==true||Object.keys(p).some(k=>!['video_submit_version','model','prompt','negative_prompt','duration','resolution','aspect_ratio','audio','adultConfirmed'].includes(k)))return 'UNSUPPORTED_VIDEO_SUBMISSION';
  if(typeof p.prompt!=='string'||!p.prompt.trim()||p.prompt.length>10000||!['5s','10s','15s'].includes(p.duration))return 'INVALID_VIDEO_SUBMISSION';
  if(p.negative_prompt!==undefined&&(typeof p.negative_prompt!=='string'||p.negative_prompt.length>10000))return 'INVALID_VIDEO_SUBMISSION';
  if(p.resolution!==undefined&&!['720p','1080p'].includes(p.resolution))return 'INVALID_VIDEO_SUBMISSION';
  if(p.aspect_ratio!==undefined&&!['16:9','9:16','1:1'].includes(p.aspect_ratio))return 'INVALID_VIDEO_SUBMISSION';
  if(p.audio!==undefined&&p.audio!==false)return 'INVALID_VIDEO_SUBMISSION';
  return null;
}
const MEDIA_CHUNK=256*1024,MEDIA_MAX=8*1024*1024;
function validateImageSubmission(p){
  if(!p||typeof p!=='object'||Array.isArray(p)||p.image_submit_version!==1||p.model!=='qwen-image-3'||Object.keys(p).some(k=>!['image_submit_version','model','prompt','negative_prompt','aspect_ratio','resolution','width','height','steps','seed'].includes(k)))return 'UNSUPPORTED_IMAGE_SUBMISSION';
  if(typeof p.prompt!=='string'||!p.prompt.trim()||p.prompt.length>10000)return 'INVALID_IMAGE_SUBMISSION';
  if(p.negative_prompt!==undefined&&(typeof p.negative_prompt!=='string'||p.negative_prompt.length>7500))return 'INVALID_IMAGE_SUBMISSION';
  if(p.aspect_ratio!==undefined&&!['1:1','3:2','2:3','4:3','3:4','4:5','16:9','9:16','21:9'].includes(p.aspect_ratio))return 'INVALID_IMAGE_SUBMISSION';
  if(p.resolution!==undefined&&!['1K','2K','1k','2k','1024','2048'].includes(p.resolution))return 'INVALID_IMAGE_SUBMISSION';
  for(const [k,lo,hi] of [['width',256,1280],['height',256,1280],['steps',1,50],['seed',-999999999,999999999]])if(p[k]!==undefined&&(!Number.isInteger(p[k])||p[k]<lo||p[k]>hi))return 'INVALID_IMAGE_SUBMISSION';
  return null;
}
function safeMediaChunk(d,id,offset){
  if(!d||d.job_id!==id||d.offset!==offset||!Number.isInteger(d.size)||d.size<512||d.size>MEDIA_MAX||offset>=d.size||typeof d.sha256!=='string'||!/^[a-f0-9]{64}$/.test(d.sha256)||typeof d.data!=='string'||d.data.length>Math.ceil(MEDIA_CHUNK/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(d.data))return null;
  const data=Buffer.from(d.data,'base64');
  if(data.toString('base64')!==d.data||data.length!==Math.min(MEDIA_CHUNK,d.size-offset))return null;
  return {job_id:id,offset,size:d.size,sha256:d.sha256,data:d.data};
}
const recoveryStatuses=new Set(['queued','running','done','failed','interrupted','cancelled']);
function validRecoveryReceipt(r){
 const short=v=>typeof v==='string'&&v.length>0&&v.length<=256;
 const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const uuid=v=>typeof v==='string'&&UUID.test(v);
 return r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).every(k=>['jobId','replyId','createdAt','model','workflowVersion','conversationKey','personaKey','userMessageId','contextDigest','contextDigestVersion','roomDigest','roomMemberId','worldDigest'].includes(k))&&[1,2,3].includes(r.workflowVersion)&&MODELS.has(r.model)&&[r.jobId,r.replyId,r.userMessageId].every(uuid)&&new Set([r.jobId,r.replyId,r.userMessageId]).size===3&&short(r.conversationKey)&&short(r.personaKey)&&digest(r.contextDigest)&&(r.contextDigestVersion===undefined||[1,2].includes(r.contextDigestVersion))&&(r.worldDigest===undefined||(digest(r.worldDigest)&&r.contextDigestVersion===2))&&Number.isSafeInteger(r.createdAt)&&r.createdAt>0&&r.createdAt<100000000000000&&(r.workflowVersion===3?digest(r.roomDigest)&&short(r.roomMemberId):r.roomDigest===undefined&&r.roomMemberId===undefined);
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
    const listing=req.query?.recovery==='1';
    const receipt=method==='POST'?req.body?.recovery_receipt:undefined;
    let scope;
    if(listing||receipt!==undefined){
      if(!env.APP_SESSION_SECRET)return res.status(503).json({error:'RECOVERY_NOT_CONFIGURED'});
      scope=createHmac('sha256',env.APP_SESSION_SECRET).update('aigf-vps-private-app-recovery-v2:worldline2').digest('hex');
    }
    if(listing){
      if(method!=='GET'||req.query?.job_id!==undefined||req.query?.media_offset!==undefined)return res.status(400).json({error:'INVALID_RECOVERY_QUERY'});
      try{
        const upstream=await fetchImpl(new URL('/v1/recovery/'+scope,base),{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
        if(!upstream.ok)return res.status(502).json({error:'RECOVERY_HTTP_'+upstream.status});
        const d=await upstream.json();
        if(!Array.isArray(d.receipts)||d.receipts.length>50||d.receipts.some(x=>!validRecoveryReceipt(x?.receipt)||!recoveryStatuses.has(x.status)||!Number.isFinite(x.updated)))return res.status(502).json({error:'INVALID_RECOVERY_LIST'});
        return res.status(200).json({receipts:d.receipts.map(x=>({receipt:x.receipt,status:x.status,updated:x.updated}))});
      }catch{return res.status(503).json({error:'RECOVERY_UNAVAILABLE'});}
    }
    const jobId=method==='POST'?req.body?.job_id:req.query?.job_id;
    if(typeof jobId!=='string'||!UUID.test(jobId)) return res.status(400).json({error:'INVALID_JOB_ID'});
    const offsetRaw=req.query?.media_offset;
    let offset;
    if(offsetRaw!==undefined){
      if(method!=='GET'||typeof offsetRaw!=='string'||!/^(0|[1-9][0-9]{0,7})$/.test(offsetRaw))return res.status(400).json({error:'INVALID_MEDIA_OFFSET'});
      offset=Number(offsetRaw);
      if(offset>=MEDIA_MAX||offset%MEDIA_CHUNK!==0)return res.status(400).json({error:'INVALID_MEDIA_OFFSET'});
    }
    let body;
    if(method==='POST') {
      // Text-only pilot. Explicitly reject incompatible payloads before dispatch.
      const p=req.body?.request;
      const validation=p&&typeof p==='object'&&'video_auto_version' in p?validateAutoVideo(p):p&&typeof p==='object'&&'video_retrieve_version' in p?validateVideoRetrieval(p):p&&typeof p==='object'&&'image_submit_version' in p?validateImageSubmission(p):p&&typeof p==='object'&&'video_submit_version' in p?validateVideoSubmission(p):p&&typeof p==='object'&&'workflow_version' in p?validateWorkflowPayload(p):validateTextPayload(p);
      if(validation)return res.status(400).json({error:validation});
      if(receipt!==undefined&&(!validRecoveryReceipt(receipt)||receipt.jobId!==jobId||receipt.workflowVersion!==p.workflow_version||receipt.model!==p.primary?.model))return res.status(400).json({error:'INVALID_RECOVERY_RECEIPT'});
      body=JSON.stringify({job_id:jobId,request:p,...(receipt!==undefined?{recovery:{scope,receipt}}:{})});
      if(Buffer.byteLength(body)>LIMIT) return res.status(413).json({error:'REQUEST_TOO_LARGE'});
    }
    try {
      const path=method==='POST'?'/v1/jobs':'/v1/jobs/'+jobId+(offset!==undefined?'/media/'+offset:'');
      const upstream=await fetchImpl(new URL(path,base),{method,headers,body,redirect:'error',signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!upstream.ok) {
        const code=upstream.status;
        return res.status([400,404,409,413,429].includes(code)?code:502).json({error:'QUEUE_HTTP_'+code});
      }
      const d=await upstream.json();
      if(offset!==undefined){
        const chunk=safeMediaChunk(d,jobId,offset);
        return chunk?res.status(200).json(chunk):res.status(502).json({error:'INVALID_MEDIA_CHUNK'});
      }
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
