// Server-only retrieval of an existing completed media job.
// No model invocation, no resubmission, no provider URL or credentials returned.
import {createHash} from 'node:crypto';
export const MEDIA_CHUNK=256*1024,MEDIA_MAX=8*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const validKind=k=>k==='image'||k==='video';
function validHeader(kind,bytes){
 if(kind==='image')return bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'&&bytes.readUInt32LE(4)+8===bytes.length;
 return bytes.toString('ascii',4,8)==='ftyp';
}
export async function retrieveCompletedMedia({id,kind,queue}){
 if(!uuid.test(id)||!validKind(kind))throw Error('MEDIA_JOB_INVALID');
 const job=await queue.get(id);
 if(job?.job_id!==id)throw Error('MEDIA_JOB_MISMATCH');
 if(['queued','running'].includes(job.status))return {status:'waiting'};
 if(['failed','interrupted','cancelled'].includes(job.status))return {status:'failed',reason:'QUEUE_'+job.status.toUpperCase()};
 if(job.status!=='done'||job.result?.workflow)throw Error('MEDIA_MANIFEST_INVALID');
 let m;try{m=JSON.parse(job.result?.choices?.[0]?.message?.content);}catch{throw Error('MEDIA_MANIFEST_INVALID');}
 const mime=kind==='image'?'image/webp':'video/mp4';
 if(m?.mime!==mime||m.chunk_size!==MEDIA_CHUNK||!Number.isSafeInteger(m.size)||m.size<512||m.size>MEDIA_MAX||!digest.test(m.sha256)||!(kind==='image'?m.image_submit_version===1:m.video_auto_version===1&&typeof m.queue_id==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(m.queue_id)))throw Error('MEDIA_MANIFEST_INVALID');
 const bytes=Buffer.alloc(m.size);
 for(let offset=0;offset<m.size;offset+=MEDIA_CHUNK){
  const c=await queue.media(id,offset);
  if(c?.job_id!==id||c.offset!==offset||c.size!==m.size||c.sha256!==m.sha256||typeof c.data!=='string'||c.data.length>Math.ceil(MEDIA_CHUNK/3)*4||!/^[A-Za-z0-9+/]+={0,2}$/.test(c.data))throw Error('MEDIA_CHUNK_INVALID');
  const b=Buffer.from(c.data,'base64');
  if(b.toString('base64')!==c.data||b.length!==Math.min(MEDIA_CHUNK,m.size-offset))throw Error('MEDIA_CHUNK_INVALID');
  b.copy(bytes,offset);
 }
 if(createHash('sha256').update(bytes).digest('hex')!==m.sha256||!validHeader(kind,bytes))throw Error('MEDIA_HASH_OR_HEADER_INVALID');
 return {status:'verified',mime,sha256:m.sha256,bytes};
}
// Archive transport must publish only after the storage readback matches.
export async function archiveExistingMedia({id,kind,queue,archive}){
 const existing=await archive.read(id);
 if(existing){
  if(existing.kind!==kind||!digest.test(existing.sha256)||!Buffer.isBuffer(existing.bytes)||existing.bytes.length<512||existing.bytes.length>MEDIA_MAX||existing.mime!==(kind==='image'?'image/webp':'video/mp4')||createHash('sha256').update(existing.bytes).digest('hex')!==existing.sha256||!validHeader(kind,existing.bytes))throw Error('MEDIA_ARCHIVE_COLLISION');
  return {status:'archived',sha256:existing.sha256,size:existing.bytes.length};
 }
 const r=await retrieveCompletedMedia({id,kind,queue});
 if(r.status!=='verified')return r;
 // putIfAbsent is atomic and idempotent; never replace a different asset.
 await archive.putIfAbsent(id,{kind,mime:r.mime,sha256:r.sha256,bytes:r.bytes});
 const saved=await archive.read(id);
 if(!saved||saved.kind!==kind||saved.mime!==r.mime||saved.sha256!==r.sha256||!Buffer.isBuffer(saved.bytes)||!saved.bytes.equals(r.bytes))throw Error('MEDIA_ARCHIVE_READBACK_FAILED');
 return {status:'archived',sha256:r.sha256,size:r.bytes.length};
}
