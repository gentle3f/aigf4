import {retrieveCompletedMedia} from './mediaArchiveV4.mjs';
import {QueueHttpError} from './generationOutboxWorker.mjs';
export function createStudioMediaStore(query){
 return {
  claim:async()=> (await query('select * from aigf_worker.claim_studio_media_v4()',[])).rows[0]??null,
  release:async(j,code=null)=>(await query('select aigf_worker.release_studio_media_v4($1,$2,$3) as ok',[j.job_id,j.lease_id,code])).rows[0]?.ok===true,
  finish:async(j,r)=>(await query('select aigf_worker.finish_studio_media_v4($1,$2,$3,$4,$5::bytea) as status',[j.job_id,j.lease_id,r.mime,r.sha256,r.bytes])).rows[0]?.status
 };
}
export async function processOneStudioMedia({store,queue,now=Date.now}){
 const j=await store.claim();if(!j)return 'idle';
 const release=async(code=null)=>await store.release(j,code)?code?'failed':'waiting':'lease_lost';
 let r;
 try{r=await retrieveCompletedMedia({id:j.job_id,kind:j.kind,queue});}
 catch(e){
  if(e instanceof QueueHttpError&&e.status===404){const age=now()-new Date(j.created_at).getTime();return release(Number.isFinite(age)&&age>=12*60*60*1000?'QUEUE_RESULT_EXPIRED':null);}
  if(e?.message?.startsWith('MEDIA_'))return release(e.message);
  return release();
 }
 if(r.status==='waiting')return release();
 if(r.status==='failed')return release(r.reason);
 return await store.finish(j,r);
}
