import type {PersistedVideoJob} from './videoStudioPersistence.js';
const CHUNK=256*1024,MAX=8*1024*1024;
export async function retrieveAutonomousStudioVideo(job:PersistedVideoJob,signal?:AbortSignal,fetchImpl:typeof fetch=fetch):Promise<Blob|null>{
 if(!job.autonomous||!job.submissionId||job.submissionId!==job.queueId)throw Error('AUTO_VIDEO_RECEIPT_INVALID');
 const id=job.submissionId;
 const call=async(offset?:number)=>{
  const res=await fetchImpl('/api/venice-chat?queue=1&job_id='+encodeURIComponent(id)+(offset===undefined?'':'&media_offset='+offset),{credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
  if(!res.ok)throw Error('AUTO_VIDEO_HTTP_'+res.status);
  const d=await res.json();if(d.job_id!==id)throw Error('AUTO_VIDEO_ID_MISMATCH');return d;
 };
 const j=await call();
 if(j.status==='queued'||j.status==='running')return null;
 if(j.status!=='done')throw Error('AUTO_VIDEO_'+String(j.status).toUpperCase()+' — '+(j.error||''));
 const m=JSON.parse(j.result?.choices?.[0]?.message?.content||'{}');
 if(m.video_auto_version!==1||m.mime!=='video/mp4'||m.chunk_size!==CHUNK||!Number.isInteger(m.size)||m.size<512||m.size>MAX||!/^[a-f0-9]{64}$/.test(m.sha256)||! /^[A-Za-z0-9_-]{1,200}$/.test(m.queue_id))throw Error('AUTO_VIDEO_MANIFEST_INVALID');
 const bytes=new Uint8Array(m.size);
 for(let offset=0;offset<m.size;offset+=CHUNK){const c=await call(offset);if(c.offset!==offset||c.size!==m.size||c.sha256!==m.sha256||typeof c.data!=='string'||c.data.length>Math.ceil(CHUNK/3)*4)throw Error('AUTO_VIDEO_CHUNK_INVALID');const b=atob(c.data);if(b.length!==Math.min(CHUNK,m.size-offset))throw Error('AUTO_VIDEO_CHUNK_INVALID');for(let i=0;i<b.length;i++)bytes[offset+i]=b.charCodeAt(i);}
 if(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('')!==m.sha256||String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw Error('AUTO_VIDEO_HASH_OR_HEADER_INVALID');
 return new Blob([bytes],{type:'video/mp4'});
}
