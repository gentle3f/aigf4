import {VIDEO_OPTIONS} from './mediaAcceptance.js';
import {getSavedStudioVideo,persistStudioVideo} from './studioMediaStore.js';
import type {PersistedVideoJob} from './videoStudioPersistence.js';
const KEY='aigfAutoVideoAcceptanceV1',CHUNK=256*1024,MAX=8*1024*1024;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
type Receipt={id:string;createdAt:number;queueId?:string;size?:number;sha256?:string};
export function createAutoVideoAcceptance(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,lock:<T>(fn:()=>Promise<T>)=>Promise<T>,fetchImpl:typeof fetch=fetch){
 const read=():Receipt|null=>{const raw=storage.getItem(KEY);if(!raw)return null;const r=JSON.parse(raw);if(!UUID.test(r.id)||!Number.isFinite(r.createdAt))throw Error('AUTO_VIDEO_RECEIPT_INVALID');return r;};
 const write=(r:Receipt)=>{const raw=JSON.stringify(r);storage.setItem(KEY,raw);if(storage.getItem(KEY)!==raw)throw Error('AUTO_VIDEO_RECEIPT_NOT_DURABLE');};
 const call=async(id:string,body?:object,offset?:number)=>{
  const res=await fetchImpl('/api/venice-chat?queue=1'+(body?'':'&job_id='+id+(offset===undefined?'':'&media_offset='+offset)),{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify({job_id:id,request:body})}:{}),signal:AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('AUTO_VIDEO_HTTP_'+res.status);
  const d=await res.json();if(d.job_id!==id)throw Error('AUTO_VIDEO_ID_MISMATCH');return d;
 };
 const studioJob=(r:Receipt):PersistedVideoJob=>({version:1,model:VIDEO_OPTIONS.model,modelName:'Wan autonomous acceptance',queueId:r.queueId!,prompt:VIDEO_OPTIONS.prompt,mode:'text-to-video',queuedAt:r.createdAt});
 return {read,start:()=>lock(async()=>{if(read())throw Error('AUTO_VIDEO_ALREADY_SUBMITTED');const r={id:crypto.randomUUID(),createdAt:Date.now()};write(r);await call(r.id,{video_auto_version:1,model:VIDEO_OPTIONS.model,prompt:VIDEO_OPTIONS.prompt,duration:'5s',resolution:'720p',aspect_ratio:'16:9',adultConfirmed:true});return r;}),
  poll:()=>lock(async()=>{
   const r=read();if(!r)throw Error('AUTO_VIDEO_NO_RECEIPT');
   if(r.queueId&&r.sha256&&r.size){const saved=await getSavedStudioVideo(studioJob(r));if(saved&&saved.blob.size===r.size&&Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await saved.blob.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('')===r.sha256)return {status:'PASS',...r};}
   const j=await call(r.id);
   if(j.status!=='done')return {status:j.status,...r,error:j.error};
   const m=JSON.parse(j.result?.choices?.[0]?.message?.content||'{}');
   if(m.video_auto_version!==1||m.mime!=='video/mp4'||m.chunk_size!==CHUNK||!Number.isInteger(m.size)||m.size<512||m.size>MAX||!/^[a-f0-9]{64}$/.test(m.sha256)||! /^[A-Za-z0-9_-]{1,200}$/.test(m.queue_id))throw Error('AUTO_VIDEO_MANIFEST_INVALID');
   const next={...r,queueId:m.queue_id,size:m.size,sha256:m.sha256};write(next);
   const bytes=new Uint8Array(m.size);
   for(let offset=0;offset<m.size;offset+=CHUNK){const c=await call(r.id,undefined,offset);if(c.offset!==offset||c.size!==m.size||c.sha256!==m.sha256||typeof c.data!=='string'||c.data.length>Math.ceil(CHUNK/3)*4)throw Error('AUTO_VIDEO_CHUNK_INVALID');const b=atob(c.data);if(b.length!==Math.min(CHUNK,m.size-offset))throw Error('AUTO_VIDEO_CHUNK_INVALID');for(let i=0;i<b.length;i++)bytes[offset+i]=b.charCodeAt(i);}
   if(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')!==m.sha256||String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw Error('AUTO_VIDEO_HASH_OR_HEADER_INVALID');
   await persistStudioVideo(studioJob(next),new Blob([bytes],{type:'video/mp4'}));
   return {status:'PASS',...next};
  })
 };
}
