import type {VeniceVideoQueueOptions} from './veniceVideo.js';
import type {PersistedVideoJob} from './videoStudioPersistence.js';
export const VPS_VIDEO_MODEL='wan-2-7-enhanced-text-to-video';
export function buildVpsVideoSubmission(options:VeniceVideoQueueOptions){
 if(options.model!==VPS_VIDEO_MODEL||options.sourceImageDataUrl||options.adultConfirmed!==true||typeof options.prompt!=='string'||!options.prompt.trim()||options.prompt.length>10000||!['5s','10s','15s'].includes(options.duration)||options.audio===true||(options.resolution!==undefined&&!['720p','1080p'].includes(options.resolution))||(options.aspectRatio!==undefined&&!['16:9','9:16','1:1'].includes(options.aspectRatio))||(options.negativePrompt!==undefined&&options.negativePrompt.length>10000))throw Error('VPS_VIDEO_UNSUPPORTED');
 return {video_submit_version:1,model:options.model,duration:options.duration,prompt:options.prompt,negative_prompt:options.negativePrompt,resolution:options.resolution,aspect_ratio:options.aspectRatio,audio:options.audio,adultConfirmed:true};
}
export function createVpsVideoSubmission(fetchImpl:typeof fetch=fetch){
 async function call(id:string,payload?:object,signal?:AbortSignal){
  const response=await fetchImpl('/api/venice-chat?queue=1'+(payload?'':'&job_id='+encodeURIComponent(id)),{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify({job_id:id,request:payload})}:{}),signal});
  if(!response.ok)throw Error(response.status===401?'VENICE_AUTH_REQUIRED':'VPS_VIDEO_HTTP_'+response.status);
  const job=await response.json();
  if(job.job_id!==id||!['queued','running','done','failed','interrupted','cancelled'].includes(job.status))throw Error('VPS_VIDEO_INVALID_RECEIPT');
  return job;
 }
 return {
  submit:async(id:string,payload:object,signal?:AbortSignal)=>{await call(id,payload,signal);},
  resolve:async(pending:PersistedVideoJob,signal?:AbortSignal):Promise<PersistedVideoJob|null>=>{
   if(!pending.submissionId||pending.submissionId!==pending.queueId)throw Error('VPS_VIDEO_INVALID_RECEIPT');
   const j=await call(pending.submissionId,undefined,signal);
   if(j.status==='queued'||j.status==='running')return null;
   if(j.status!=='done')throw Error('VPS_VIDEO_'+j.status.toUpperCase()+(typeof j.error==='string'&&/^(?:PROVIDER_HTTP_[1-5][0-9]{2}|PROVIDER_(?:TIMEOUT|DNS_ERROR|TLS_ERROR|NETWORK_ERROR|FAILURE)|INVALID_PROVIDER_(?:RESPONSE|JSON)); no automatic retry$/.test(j.error)?' — '+j.error:''));
   const content=j.result?.choices?.[0]?.message?.content;
   if(typeof content!=='string'||j.result?.workflow)throw Error('VPS_VIDEO_INVALID_RESULT');
   let d;try{d=JSON.parse(content);}catch{throw Error('VPS_VIDEO_INVALID_RESULT');}
   if(d?.video_submit_version!==1||d.model!==pending.model||typeof d.queue_id!=='string'||! /^[a-z0-9_-]{1,200}$/i.test(d.queue_id))throw Error('VPS_VIDEO_INVALID_RESULT');
   let downloadUrl:string|undefined;
   if(d.download_url!==undefined){try{const u=new URL(d.download_url);if(u.protocol!=='https:'||u.username||u.password||!u.hostname||d.download_url.length>4096)throw Error();downloadUrl=d.download_url;}catch{throw Error('VPS_VIDEO_INVALID_RESULT');}}
   const {submissionId:_,...rest}=pending;
   return {...rest,queueId:d.queue_id,downloadUrl};
  }
 };
}
export async function submitDurableVideo(input:{options:VeniceVideoQueueOptions;modelName:string;storage:{read:()=>PersistedVideoJob|null;write:(r:PersistedVideoJob)=>boolean};lock:<T>(fn:()=>Promise<T>)=>Promise<T>;transport:ReturnType<typeof createVpsVideoSubmission>;onStored:(r:PersistedVideoJob)=>void;autonomous?:boolean;newId?:()=>string;now?:()=>number}){
 const legacy=buildVpsVideoSubmission(input.options);
 if(input.autonomous&&(legacy.duration!=='5s'||legacy.resolution!=='720p'))throw Error('VPS_VIDEO_UNSUPPORTED');
 const {video_submit_version,...options}=legacy;
 const payload=input.autonomous?{video_auto_version:1,...options}:legacy;
 return input.lock(async()=>{
   if(input.storage.read())throw Error('VPS_VIDEO_PENDING_EXISTS');
   const id=(input.newId??(()=>crypto.randomUUID()))();
   const receipt:PersistedVideoJob={version:1,model:input.options.model,modelName:input.modelName,queueId:id,submissionId:id,...(input.autonomous?{autonomous:true as const}:{}),prompt:input.options.prompt,mode:'text-to-video',queuedAt:(input.now??Date.now)()};
   if(!input.storage.write(receipt))throw Error('VPS_VIDEO_RECEIPT_NOT_DURABLE');
   input.onStored(receipt);
   await input.transport.submit(id,payload,input.options.signal);
   return receipt;
 });
}
