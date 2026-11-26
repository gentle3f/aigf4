import type {PilotJob,PilotRequest,PilotStorage} from './generationQueuePilot.js';
import type {TurnTransport} from './durableChatTurn.js';
const KEY='aigfVpsPersonaMemoryPendingV1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type MemoryContext={personaKey:string;historyLength:number;checkpoint:number;summaryVersion:number;sourceIds:string[];sceneIds:string[]};
export type MemoryReceipt=MemoryContext&{jobId:string;digest:string;createdAt:number};
type Lock=<T>(work:()=>Promise<T>)=>Promise<T>;
const valid=(r:MemoryReceipt)=>r&&typeof r.personaKey==='string'&&!!r.personaKey&&UUID.test(r.jobId)&&/^[a-f0-9]{64}$/.test(r.digest)&&Number.isSafeInteger(r.historyLength)&&r.historyLength>0&&Number.isSafeInteger(r.checkpoint)&&r.checkpoint>0&&Number.isSafeInteger(r.summaryVersion)&&r.summaryVersion>0&&Number.isFinite(r.createdAt)&&[r.sourceIds,r.sceneIds].every(a=>Array.isArray(a)&&a.length>0&&a.every(s=>typeof s==='string'&&!!s));
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),n=>n.toString(16).padStart(2,'0')).join('');
export function createDurableMemoryTask<T>({storage,transport,lock,snapshot,parse,commit,confirmed,newId=()=>crypto.randomUUID(),now=Date.now,storageKey=KEY}:{
 storage:PilotStorage;transport:TurnTransport;lock:Lock;
 snapshot:(context:MemoryContext)=>string;
 parse:(r:MemoryReceipt,text:string)=>T|null;
 // Synchronous commit; marker and memory state must share one durable write.
 commit:(r:MemoryReceipt,result:T)=>number;
 confirmed:(r:MemoryReceipt)=>boolean;
 newId?:()=>string;now?:()=>number;storageKey?:string;
}){
 function pending():MemoryReceipt|null{const raw=storage.getItem(storageKey);if(!raw)return null;const r=JSON.parse(raw);if(!valid(r))throw Error('MEMORY_RECEIPT_INVALID');return r;}
 function clear(r:MemoryReceipt){if(pending()?.jobId!==r.jobId)throw Error('MEMORY_RECEIPT_CHANGED');storage.removeItem(storageKey);}
 async function verify(r:MemoryReceipt){const s=snapshot(r);if(await hash(s)!==r.digest||snapshot(r)!==s)throw Error('MEMORY_CONTEXT_CHANGED');}
 return {
  pending,
  submit:(context:MemoryContext,payload:PilotRequest,expectedSnapshot:string)=>lock(async()=>{
   if(pending())throw Error('MEMORY_TASK_PENDING');
   if(snapshot(context)!==expectedSnapshot)throw Error('MEMORY_CONTEXT_CHANGED');
   const r:MemoryReceipt={...context,jobId:newId(),digest:await hash(expectedSnapshot),createdAt:now()};
   if(!valid(r))throw Error('MEMORY_RECEIPT_INVALID');
   if(snapshot(context)!==expectedSnapshot)throw Error('MEMORY_CONTEXT_CHANGED');
   storage.setItem(storageKey,JSON.stringify(r));
   const job=await transport.submit(r.jobId,payload);
   if(job.job_id!==r.jobId)throw Error('MEMORY_JOB_ID_MISMATCH');
   return job;
  }),
  resume:()=>lock(async()=>{
   const r=pending();if(!r)return {status:'none' as const};
   if(confirmed(r)){clear(r);return {status:'applied' as const,added:0};}
   await verify(r);
   const job=await transport.get(r.jobId);
   if(job.job_id!==r.jobId)throw Error('MEMORY_JOB_ID_MISMATCH');
   if(job.status==='queued'||job.status==='running')return {status:'pending' as const};
   if(job.status!=='done')throw Error('MEMORY_JOB_'+job.status.toUpperCase());
   const choice=job.result?.choices?.[0];
   if(job.result?.workflow||choice?.finish_reason==='length'||!choice?.message?.content)throw Error('MEMORY_RESULT_INVALID');
   const result=parse(r,choice.message.content);
   if(result===null)throw Error('MEMORY_RESULT_INVALID');
   await verify(r);
   const added=commit(r,result);
   if(!confirmed(r))throw Error('MEMORY_COMMIT_NOT_DURABLE');
   clear(r);return {status:'applied' as const,added};
  }),
  abandon:(jobId:string)=>lock(async()=>{const r=pending();if(!r||r.jobId!==jobId)throw Error('MEMORY_RECEIPT_CHANGED');clear(r);}),
 };
}
export const browserMemoryLock:Lock=async work=>{
 if(!navigator.locks)throw Error('MEMORY_WEB_LOCKS_REQUIRED');
 return navigator.locks.request('aigf-vps-persona-memory-v1',work);
};
