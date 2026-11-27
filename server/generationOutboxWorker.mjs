// Server-only worker core. No browser dependency and no user access token required.
// Store is a restricted PostgreSQL RPC adapter; queue is the existing VPS queue.
// Finalizer must be supplied explicitly: raw provider output is not a finished chat reply.
export class QueueHttpError extends Error{
 constructor(status){super('QUEUE_HTTP_'+status);this.status=status;}
}
export function createLocalGenerationQueue({base='http://127.0.0.1:18781',token,fetchImpl=fetch}){
 if(typeof token!=='string'||token.length<32)throw Error('QUEUE_TOKEN_REQUIRED');
 const u=new URL(base);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.pathname!=='/'||u.username||u.password||u.search||u.hash)throw Error('LOCAL_QUEUE_REQUIRED');
 async function call(path,method,body){
  const r=await fetchImpl(new URL(path,u),{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new QueueHttpError(r.status);
  return r.json();
 }
 return {get:id=>call('/v1/jobs/'+id,'GET'),media:(id,offset)=>call('/v1/jobs/'+id+'/media/'+offset,'GET'),submit:(id,plan)=>call('/v1/jobs','POST',{job_id:id,request:plan})};
}
export function createPostgresOutboxStore(query){
 return {
  claim:async()=> (await query('select * from aigf_worker.claim_generation_v4()',[])).rows[0]??null,
  release:async(j,queued)=>(await query('select aigf_worker.release_generation_v4($1,$2,$3) as ok',[j.job_id,j.lease_id,queued])).rows[0]?.ok===true,
  fail:async(j,code)=>(await query('select aigf_worker.fail_generation_v4($1,$2,$3) as ok',[j.job_id,j.lease_id,code])).rows[0]?.ok===true,
  finish:async(j,result)=>(await query('select * from aigf_worker.finish_generation_v4($1,$2,$3::jsonb,$4::jsonb)',[j.job_id,j.lease_id,JSON.stringify(result.content),JSON.stringify(result.payload)])).rows[0],
 };
}
const terminal={failed:'QUEUE_FAILED',interrupted:'QUEUE_INTERRUPTED',cancelled:'QUEUE_CANCELLED'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const confirmed=(ok,status)=>ok?status:'lease_lost';
export async function processOneGeneration({store,queue,finalize,now=Date.now}){
 if(typeof finalize!=='function')throw Error('SERVER_FINALIZER_REQUIRED');
 const j=await store.claim();
 if(!j)return 'idle';
 if(!uuid.test(j.job_id)||!uuid.test(j.lease_id))throw Error('INVALID_OUTBOX_JOB');
 const release=async queued=>confirmed(await store.release(j,queued),'waiting');
 const fail=async code=>confirmed(await store.fail(j,code),'failed');
 // The context must remain at the revision which admitted the turn. A stale
 // snapshot cannot be silently merged or replaced with an earlier state payload.
 if(j.state_payload==null)return confirmed(await store.fail(j,'CONTEXT_CHANGED'),'conflict');
 let job;
 try{job=await queue.get(j.job_id);}
 catch(e){
  if(!(e instanceof QueueHttpError)||e.status!==404)return release(j.status==='queued');
  // A known-submitted job missing from the queue must never be recreated.
  // Accepted jobs can recover uncertain submission using the exact same ID
  // only within a window strictly shorter than the existing queue's 24h TTL.
  const age=now()-new Date(j.created_at).getTime();
  if(j.status==='queued'||!Number.isFinite(age)||age<0||age>=12*60*60*1000)return fail('QUEUE_RESULT_EXPIRED');
  try{job=await queue.submit(j.job_id,j.plan);}
  catch(err){
   if(err instanceof QueueHttpError&&[400,409,413,422].includes(err.status))return fail('QUEUE_REJECTED');
   return release(false);
  }
 }
 if(job?.job_id!==j.job_id)return fail('INVALID_RESULT');
 if(['queued','running'].includes(job.status))return release(true);
 if(Object.hasOwn(terminal,job.status))return fail(terminal[job.status]);
 if(job.status!=='done')return fail('INVALID_RESULT');
 // POST can return an existing done receipt without result; GET the result.
 if(!job.result){try{job=await queue.get(j.job_id);}catch{return release(true);}}
 if(job?.job_id!==j.job_id||job.status!=='done'||!job.result)return fail('INVALID_RESULT');
 let result;
 try{result=await finalize(j,job);}
 catch(e){if(e?.message==='UNSUPPORTED_FINALIZER')return fail('UNSUPPORTED_FINALIZER');return fail('INVALID_RESULT');}
 if(!result||typeof result.content?.text!=='string'||!result.content.text.trim()||!result.payload||typeof result.payload!=='object'||Array.isArray(result.payload))return fail('INVALID_RESULT');
 // If this RPC loses its acknowledgement, the committed state remains done.
 // If it fails before commit, the lease expires and the next worker GETs the same job.
 const r=await store.finish(j,result);
 return r?.status??'lease_lost';
}
