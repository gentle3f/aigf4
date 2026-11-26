import type {PersistedVideoJob} from './videoStudioPersistence.js';
import type {VeniceVideoRetrieveResult} from './veniceVideo.js';
const CHUNK=256*1024,MAX=8*1024*1024;
const KEY='aigfAcceptanceVideoRetrieveV1';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function createSameKeyVideoRetrieval(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,fetchImpl:typeof fetch=fetch){
 return async(j:PersistedVideoJob):Promise<VeniceVideoRetrieveResult>=>{
  const call=async(id:string,body?:object,offset?:number)=>{
   const r=await fetchImpl('/api/venice-chat?queue=1'+(body?'':'&job_id='+id+(offset===undefined?'':'&media_offset='+offset)),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify({job_id:id,request:body})}:{}),signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('VPS_VIDEO_RETRIEVE_HTTP_'+r.status);
   const d=await r.json();if(d.job_id!==id)throw Error('VPS_VIDEO_RETRIEVE_ID_INVALID');return d;
  };
  const raw=storage.getItem(KEY);let receipt=raw?JSON.parse(raw):null;
  if(receipt&&(!UUID.test(receipt.id)||receipt.queueId!==j.queueId))throw Error('VPS_VIDEO_RETRIEVE_RECEIPT_MISMATCH');
  if(!receipt){
   receipt={id:crypto.randomUUID(),queueId:j.queueId};
   const saved=JSON.stringify(receipt);storage.setItem(KEY,saved);if(storage.getItem(KEY)!==saved)throw Error('VPS_VIDEO_RETRIEVE_RECEIPT_NOT_DURABLE');
   await call(receipt.id,{video_retrieve_version:1,model:j.model,queue_id:j.queueId});
   return {kind:'processing',status:'VPS 查詢已提交（不生成）'};
  }
  const d=await call(receipt.id);
  if(['queued','running'].includes(d.status))return {kind:'processing',status:'VPS '+d.status};
  if(d.status!=='done')throw Error('VPS_VIDEO_RETRIEVE_'+String(d.status).toUpperCase()+' — '+(d.error||''));
  const m=JSON.parse(d.result?.choices?.[0]?.message?.content||'{}');
  if(m.video_retrieve_version!==1)throw Error('VPS_VIDEO_RETRIEVE_MANIFEST_INVALID');
  if(['PROCESSING','PENDING','QUEUED','IN_PROGRESS'].includes(m.status)){
   storage.removeItem(KEY);return {kind:'processing',status:m.status};
  }
  if(m.mime!=='video/mp4'||m.chunk_size!==CHUNK||!Number.isInteger(m.size)||m.size<512||m.size>MAX||!/^[a-f0-9]{64}$/.test(m.sha256))throw Error('VPS_VIDEO_RETRIEVE_MANIFEST_INVALID');
  const bytes=new Uint8Array(m.size);
  for(let offset=0;offset<m.size;offset+=CHUNK){
   const c=await call(receipt.id,undefined,offset);
   if(c.offset!==offset||c.size!==m.size||c.sha256!==m.sha256||typeof c.data!=='string'||c.data.length>Math.ceil(CHUNK/3)*4)throw Error('VPS_VIDEO_CHUNK_INVALID');
   const b=atob(c.data);if(b.length!==Math.min(CHUNK,m.size-offset))throw Error('VPS_VIDEO_CHUNK_INVALID');
   for(let i=0;i<b.length;i++)bytes[offset+i]=b.charCodeAt(i);
  }
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==m.sha256)throw Error('VPS_VIDEO_HASH_MISMATCH');
  return {kind:'completed',blob:new Blob([bytes],{type:'video/mp4'})};
 };
}
