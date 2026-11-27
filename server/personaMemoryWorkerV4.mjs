import {QueueHttpError} from './generationOutboxWorker.mjs';
import {planServerPersonaMemory,finalizeServerPersonaMemory} from '../serverPersonaMemory.ts';
import {personas as builtinPersonas} from '../personas.tsx';

export function createPersonaMemoryStore(query){
 return {
  claim:async()=> (await query('select * from aigf_worker.claim_persona_memory_v4()',[])).rows[0]??null,
  prepare:async(j,plan)=>(await query('select aigf_worker.prepare_persona_memory_v4($1,$2,$3,$4::jsonb) as ok',[j.id,j.lease_id,j.revision,JSON.stringify(plan)])).rows[0]?.ok===true,
  release:async(j,queued)=>(await query('select aigf_worker.release_persona_memory_v4($1,$2,$3) as ok',[j.id,j.lease_id,queued])).rows[0]?.ok===true,
  end:async(j,status,outcome)=>(await query('select aigf_worker.end_persona_memory_v4($1,$2,$3,$4) as ok',[j.id,j.lease_id,status,outcome])).rows[0]?.ok===true,
  finish:async(j,persona)=>(await query('select aigf_worker.finish_persona_memory_v4($1,$2,$3,$4::jsonb) as status',[j.id,j.lease_id,j.revision,JSON.stringify(persona)])).rows[0]?.status,
 };
}
const terminal=new Set(['failed','interrupted','cancelled']);
export async function processOnePersonaMemory({store,queue,now=Date.now,defaults=builtinPersonas}){
 const j=await store.claim();if(!j)return 'idle';
 const release=async queued=>await store.release(j,queued)?'waiting':'lease_lost';
 const end=async(status,reason)=>await store.end(j,status,reason)?status:'lease_lost';
 // Shared defaults verified identical across the three current branches.
 const persona=j.persona??(Object.hasOwn(defaults,j.persona_key)?defaults[j.persona_key]:undefined);
 if(j.revision==null||!persona)return end('skipped','persona_missing');
 if(j.status==='pending'){
  let result;
  try{result=await planServerPersonaMemory(j.persona_key,persona,j.history);}
  catch{return end('failed','MEMORY_PLAN_INVALID');}
  if(result.status==='skipped')return end('skipped',result.reason);
  return await store.prepare(j,result.plan)?'prepared':release(false);
 }
 if(!j.plan||!j.prepared_at)return end('failed','MEMORY_PLAN_MISSING');
 let job;
 try{job=await queue.get(j.id);}
 catch(e){
  if(!(e instanceof QueueHttpError)||e.status!==404)return release(j.status==='queued');
  const age=now()-new Date(j.prepared_at).getTime();
  if(j.status==='queued'||!Number.isFinite(age)||age<0||age>=12*60*60*1000)return end('failed','QUEUE_RESULT_EXPIRED');
  try{job=await queue.submit(j.id,j.plan.request);}
  catch(err){
   if(err instanceof QueueHttpError&&[400,409,413,422].includes(err.status))return end('failed','QUEUE_REJECTED');
   return release(false);
  }
 }
 if(job?.job_id!==j.id)return end('failed','INVALID_RESULT');
 if(['queued','running'].includes(job.status))return release(true);
 if(terminal.has(job.status))return end('failed','QUEUE_'+job.status.toUpperCase());
 if(job.status!=='done')return end('failed','INVALID_RESULT');
 if(!job.result){try{job=await queue.get(j.id);}catch{return release(true);}}
 let finalized;
 try{finalized=await finalizeServerPersonaMemory({jobId:j.id,job,plan:j.plan,persona,history:j.history,at:new Date(j.prepared_at).getTime()});}
 catch(e){return e?.message==='MEMORY_CONTEXT_CHANGED'||e?.message==='MEMORY_HISTORY_CHANGED'?end('conflict','MEMORY_CONTEXT_CHANGED'):end('failed','MEMORY_RESULT_INVALID');}
 return (await store.finish(j,finalized.persona))??'lease_lost';
}
