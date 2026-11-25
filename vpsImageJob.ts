import type {VeniceImageRequest} from './veniceImage.js';
export const IMAGE_RECEIPT_KEY='aigfVpsImageJobV1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CHUNK=256*1024,MAX=8*1024*1024;
export type ImageReceipt={version:1;jobId:string;prompt:string;modelName:string;aspectRatio?:string;resolution?:string;seed?:number;createdAt:number};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export function readImageReceipt(storage:Store):ImageReceipt|null{
 const raw=storage.getItem(IMAGE_RECEIPT_KEY);if(!raw)return null;
 const r=JSON.parse(raw);
 if(r?.version!==1||!UUID.test(r.jobId)||typeof r.prompt!=='string'||!r.prompt.trim()||typeof r.modelName!=='string'||!Number.isFinite(r.createdAt))throw Error('VPS_IMAGE_RECEIPT_INVALID');
 return r;
}
export function buildImagePlan(o:VeniceImageRequest){
 if(o.mode!=='generate'||o.model!=='qwen-image-3'||o.sourceImageBase64||o.adultConfirmed!==true||(o.variants??1)!==1||!o.prompt.trim()||o.prompt.length>10000)throw Error('VPS_IMAGE_UNSUPPORTED');
 return {image_submit_version:1,model:o.model,prompt:o.prompt,negative_prompt:o.negativePrompt,aspect_ratio:o.aspectRatio,resolution:o.resolution,width:o.width,height:o.height,steps:o.steps,seed:o.seed};
}
export function createVpsImageTransport(fetchImpl:typeof fetch=fetch){
 async function call(id:string,payload?:ReturnType<typeof buildImagePlan>,offset?:number,signal?:AbortSignal){
  const res=await fetchImpl('/api/venice-chat?queue=1'+(payload?'':'&job_id='+encodeURIComponent(id)+(offset===undefined?'':'&media_offset='+offset)),{method:payload?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(payload?{body:JSON.stringify({job_id:id,request:payload})}:{}),signal});
  if(!res.ok)throw Error(res.status===401?'VENICE_AUTH_REQUIRED':'VPS_IMAGE_HTTP_'+res.status);
  const data=await res.json();if(data.job_id!==id)throw Error('VPS_IMAGE_RESULT_INVALID');return data;
 }
 return {
  submit:async(id:string,p:ReturnType<typeof buildImagePlan>,signal?:AbortSignal)=>{const d=await call(id,p,undefined,signal);if(!['queued','running','done'].includes(d.status))throw Error('VPS_IMAGE_'+String(d.status).toUpperCase());},
  retrieve:async(r:ImageReceipt,signal?:AbortSignal):Promise<Blob|null>=>{
   const j=await call(r.jobId,undefined,undefined,signal);
   if(j.status==='queued'||j.status==='running')return null;
   if(j.status!=='done')throw Error('VPS_IMAGE_'+String(j.status).toUpperCase());
   let m;try{m=JSON.parse(j.result?.choices?.[0]?.message?.content)}catch{throw Error('VPS_IMAGE_MANIFEST_INVALID');}
   if(m?.image_submit_version!==1||m.mime!=='image/webp'||m.chunk_size!==CHUNK||!Number.isInteger(m.size)||m.size<512||m.size>MAX||!/^[a-f0-9]{64}$/.test(m.sha256))throw Error('VPS_IMAGE_MANIFEST_INVALID');
   const bytes=new Uint8Array(m.size);
   for(let offset=0;offset<m.size;offset+=CHUNK){
    const c=await call(r.jobId,undefined,offset,signal);
    if(c.offset!==offset||c.size!==m.size||c.sha256!==m.sha256||typeof c.data!=='string'||c.data.length>Math.ceil(CHUNK/3)*4)throw Error('VPS_IMAGE_CHUNK_INVALID');
    const raw=atob(c.data);
    if(raw.length!==Math.min(CHUNK,m.size-offset))throw Error('VPS_IMAGE_CHUNK_INVALID');
    for(let k=0;k<raw.length;k++)bytes[offset+k]=raw.charCodeAt(k);
   }
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
   if(hash!==m.sha256)throw Error('VPS_IMAGE_HASH_MISMATCH');
   return new Blob([bytes],{type:'image/webp'});
  }
 };
}
export async function submitDurableImage(input:{options:VeniceImageRequest;modelName:string;storage:Store;lock:<T>(work:()=>Promise<T>)=>Promise<T>;transport:ReturnType<typeof createVpsImageTransport>;newId?:()=>string}){
 const plan=buildImagePlan(input.options);
 return input.lock(async()=>{
  if(readImageReceipt(input.storage))throw Error('VPS_IMAGE_PENDING_EXISTS');
  const r:ImageReceipt={version:1,jobId:(input.newId??(()=>crypto.randomUUID()))(),prompt:input.options.prompt,modelName:input.modelName,aspectRatio:input.options.aspectRatio,resolution:input.options.resolution,seed:input.options.seed,createdAt:Date.now()};
  input.storage.setItem(IMAGE_RECEIPT_KEY,JSON.stringify(r));
  await input.transport.submit(r.jobId,plan,input.options.signal);
  return r;
 });
}
