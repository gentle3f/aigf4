import {buildVeniceTextPayload,type VeniceTextGenerationOptions,type VeniceTextGenerationResult} from './venice.js';
import {STRICT_REVIEW_RESPONSE_FORMAT} from './strictReview.js';
import {PERSONA_MEMORY_RESPONSE_FORMAT,ROOM_MEMORY_RESPONSE_FORMAT} from './autoMemory.js';
export const VPS_REVIEW_MODELS=["glm-5-3-flash-uncensored","deepseek-v4-1-flash-1017-uncensored"] as const;
const canonical=(value:unknown)=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
import {parseVenicePromptCacheUsage} from './veniceCache.js';
import {QueuePilotError,type PilotJob,type PilotRequest,type PilotSubmission} from './generationQueuePilot.js';
import type {TurnTransport} from './durableChatTurn.js';

const MODELS=new Set(['glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus']);
export function buildVpsCharacterPayload(options:VeniceTextGenerationOptions):PilotRequest{
 if(!MODELS.has(options.model)||options.onTextDelta||(options.responseFormat&&(!VPS_REVIEW_MODELS.some(m=>m===options.model)||![canonical(STRICT_REVIEW_RESPONSE_FORMAT),canonical(PERSONA_MEMORY_RESPONSE_FORMAT),canonical(ROOM_MEMORY_RESPONSE_FORMAT)].includes(canonical(options.responseFormat))))||options.enableWebSearch||options.messages.some(m=>typeof m.content!=='string'))throw Error('UNSUPPORTED_VPS_CHARACTER_REQUEST');
 const raw=buildVeniceTextPayload(options);
 const payload=JSON.parse(JSON.stringify(raw)) as PilotRequest;
 if(payload.max_completion_tokens!==undefined&&(!Number.isInteger(payload.max_completion_tokens)||payload.max_completion_tokens<1||payload.max_completion_tokens>8192))throw Error('VPS_OUTPUT_LIMIT');
 if(payload.prompt_cache_key!==undefined&&!/^wetapp-(chat|review)-v1-[a-z0-9]{1,32}$/.test(payload.prompt_cache_key))throw Error('VPS_CACHE_KEY');
 if(new TextEncoder().encode(JSON.stringify({job_id:'00000000-0000-4000-8000-000000000000',request:payload})).length>256*1024)throw Error('VPS_REQUEST_TOO_LARGE');
 return payload;
}
export function createVpsChatTransport(fetchImpl:typeof fetch=fetch):TurnTransport{
 async function call(id:string,payload?:PilotSubmission):Promise<PilotJob>{
  let res:Response;
  try{res=await fetchImpl('/api/venice-chat?queue=1'+(payload?'':'&job_id='+encodeURIComponent(id)),{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify({job_id:id,request:payload})}:{})});}
  catch{throw new QueuePilotError('QUEUE_TRANSPORT_UNCERTAIN',id);}
  if(!res.ok)throw new QueuePilotError('QUEUE_HTTP_'+res.status,id,res.status);
  let j:PilotJob;
  try{j=await res.json();}catch{throw new QueuePilotError('INVALID_QUEUE_RESPONSE',id);}
  if(j.job_id!==id||!['queued','running','done','failed','interrupted','cancelled'].includes(j.status))throw new QueuePilotError('INVALID_QUEUE_RESPONSE',id);
  return j;
 }
 return {submit:(id,payload)=>call(id,payload),get:id=>call(id)};
}
export function decodeVpsCharacterResult(job:PilotJob,model:string):VeniceTextGenerationResult{
 const result=job.result,choice=result?.choices?.[0];
 if(job.status!=='done'||!choice?.message?.content?.trim())throw Error('VPS_RESULT_NOT_READY');
 return {model:result?.model||model,text:choice.message.content,promptTokens:result?.usage?.prompt_tokens,completionTokens:result?.usage?.completion_tokens,promptCacheUsage:parseVenicePromptCacheUsage(result?.usage),finishReason:choice.finish_reason??null};
}
