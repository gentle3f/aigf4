import {QueueHttpError} from './generationOutboxWorker.mjs';
import {planServerWorldLedger,finalizeServerWorldLedger} from '../serverWorldLedger.ts';
export function createWorldLedgerStore(query){
 return {
  claim:async()=> (await query('select * from aigf_worker.claim_world_ledger_v4()',[])).rows[0]??null,
  prepare:async(j,plan)=>(await query('select aigf_worker.prepare_world_ledger_v4($1,$2,$3,$4::jsonb) as ok',[j.id,j.lease_id,j.revision,JSON.stringify(plan)])).rows[0]?.ok===true,
  release:async(j,queued)=>(await query('select aigf_worker.release_world_ledger_v4($1,$2,$3) as ok',[j.id,j.lease_id,queued])).rows[0]?.ok===true,
  end:async(j,status,outcome)=>(await query('select aigf_worker.end_world_ledger_v4($1,$2,$3,$4) as ok',[j.id,j.lease_id,status,outcome])).rows[0]?.ok===true,
  finish:async(j,r)=>(await query('select aigf_worker.finish_world_ledger_v4($1,$2,$3,$4,$5) as status',[j.id,j.lease_id,j.revision,r.ledger,r.deferred])).rows[0]?.status,
 };
}
export async function processOneWorldLedger({store,queue,now=Date.now}){
 const j=await store.claim();if(!j)return 'idle';
 const release=async queued=>await store.release(j,queued)?'waiting':'lease_lost';
 const end=async(status,reason)=>await store.end(j,status,reason)?status:'lease_lost';
 const snapshot={key:j.conversation_key,registry:j.registry,ledger:j.ledger,history:j.history,model:j.model};
 if(j.revision==null)return end('conflict','LEDGER_CONTEXT_CHANGED');
 if(j.status==='pending'){
  let plan;try{plan=await planServerWorldLedger(snapshot);}catch{return end('failed','LEDGER_PLAN_INVALID');}
  if(!plan)return end('skipped','no_pending_sources');
  return await store.prepare(j,plan)?'prepared':release(false);
 }
 if(!j.plan||!j.prepared_at)return end('failed','LEDGER_PLAN_MISSING');
 let job;
 try{job=await queue.get(j.attempt_id);}
 catch(e){
  if(!(e instanceof QueueHttpError)||e.status!==404)return release(j.status==='queued');
  const age=now()-new Date(j.prepared_at).getTime();
  if(j.status==='queued'||!Number.isFinite(age)||age<0||age>=12*60*60*1000)return end('failed','QUEUE_RESULT_EXPIRED');
  try{job=await queue.submit(j.attempt_id,j.plan.request);}
  catch(err){if(err instanceof QueueHttpError&&[400,409,413,422].includes(err.status))return end('failed','QUEUE_REJECTED');return release(false);}
 }
 if(job?.job_id!==j.attempt_id)return end('failed','INVALID_RESULT');
 if(['queued','running'].includes(job.status))return release(true);
 if(['failed','interrupted','cancelled'].includes(job.status))return end('failed','QUEUE_'+job.status.toUpperCase());
 if(job.status!=='done')return end('failed','INVALID_RESULT');
 if(!job.result){try{job=await queue.get(j.attempt_id);}catch{return release(true);}}
 let r;
 try{r=await finalizeServerWorldLedger(snapshot,j.plan,job,j.attempt_id,new Date(j.prepared_at).getTime());}
 catch(e){return e?.message==='LEDGER_CONTEXT_CHANGED'?end('conflict','LEDGER_CONTEXT_CHANGED'):end('failed','LEDGER_RESULT_INVALID');}
 if(r.kind==='retry')return await store.prepare(j,r.plan)?'prepared':release(true);
 if(r.kind==='deferred')return end('skipped','deferred_evidence');
 return (await store.finish(j,r))??'lease_lost';
}
