import {canonicalContextJson,hashContextJson,type CloudContextMessage} from './contextFingerprint.js';
import {prepareAppendCheckpoint,type CheckpointPlan,type CheckpointRow} from './cloudAppendCheckpoint.js';
export type CheckpointHead={revision:number;history:CheckpointRow[];payload:object};
export type CheckpointTransport={read:(conversation:string)=>Promise<CheckpointHead>;commit:(plan:CheckpointPlan)=>Promise<number>};
const KEY='aigfCloudCheckpointLabV1';
type Receipt={version:1;conversationKey:string;expectedRevision:number;baselineHash:string;resultHash:string};
const hash=(v:unknown)=>hashContextJson(canonicalContextJson(v));
const equal=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
// Explicit isolated-lab session. No production endpoint or automatic sync calls.
export function createCloudCheckpointSession(deps:{
 storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;
 transport:CheckpointTransport;
 history:(key:string)=>readonly CloudContextMessage[];
 lock:<T>(fn:()=>Promise<T>)=>Promise<T>;
 deviceId:string;
}){
 function pending():Receipt|null{
  const raw=deps.storage.getItem(KEY);if(!raw)return null;
  const r=JSON.parse(raw);
  if(r?.version!==1||typeof r.conversationKey!=='string'||!r.conversationKey||r.conversationKey.length>256||!Number.isSafeInteger(r.expectedRevision)||r.expectedRevision<1||! /^[a-f0-9]{64}$/.test(r.baselineHash)||! /^[a-f0-9]{64}$/.test(r.resultHash))throw Error('CHECKPOINT_RECEIPT_INVALID');
  return r;
 }
 async function inspect(r:Receipt){
  const actual=await deps.transport.read(r.conversationKey);
  const digest=await hash(actual);
  if(actual.revision===r.expectedRevision+1&&digest===r.resultHash){
   deps.storage.removeItem(KEY);return 'confirmed' as const;
  }
  if(actual.revision===r.expectedRevision&&digest===r.baselineHash)return 'not-confirmed' as const;
  return 'conflict-or-later-update' as const;
 }
 return {pending,
  recover:()=>deps.lock(async()=>{const r=pending();return r?inspect(r):'none' as const;}),
  // Explicit retry only: the same revision, same baseline and same intended result.
  // The SQL revision CAS allows at most one of two overlapping attempts to commit.
  retryPending:()=>deps.lock(async()=>{
   const r=pending();if(!r)throw Error('CHECKPOINT_NO_PENDING');
   const status=await inspect(r);
   if(status!=='not-confirmed')return status;
   const baseline=await deps.transport.read(r.conversationKey);
   if(baseline.revision!==r.expectedRevision||await hash(baseline)!==r.baselineHash)throw Error('CHECKPOINT_BASELINE_CHANGED');
   const plan=prepareAppendCheckpoint({revision:baseline.revision,conversationKey:r.conversationKey,deviceId:deps.deviceId,remoteHistory:baseline.history,localHistory:deps.history(r.conversationKey),payload:baseline.payload});
   if(await hash({revision:baseline.revision+1,history:[...plan.expected_history,...plan.append_messages],payload:plan.new_payload})!==r.resultHash)throw Error('CHECKPOINT_LOCAL_RESULT_CHANGED');
   const result=await deps.transport.commit(plan);
   if(result!==r.expectedRevision+1)throw Error('CHECKPOINT_REVISION_UNEXPECTED');
   return inspect(r);
  }),
  // Retire a conflicting receipt only after the owner explicitly acknowledges the
  // current remote revision. Local messages are left intact for manual recovery.
  retireConflict:(observedRevision:number)=>deps.lock(async()=>{
   const r=pending();if(!r)throw Error('CHECKPOINT_NO_PENDING');
   const actual=await deps.transport.read(r.conversationKey);
   if(actual.revision!==observedRevision||actual.revision<=r.expectedRevision)throw Error('CHECKPOINT_CONFLICT_NOT_CONFIRMED');
   if(actual.revision===r.expectedRevision+1&&await hash(actual)===r.resultHash){deps.storage.removeItem(KEY);return 'confirmed' as const;}
   const archiveKey=KEY+'Conflict';
   if(deps.storage.getItem(archiveKey))throw Error('CHECKPOINT_CONFLICT_ARCHIVE_EXISTS');
   const archive=JSON.stringify({receipt:r,observedRevision,retiredAt:Date.now()});
   deps.storage.setItem(archiveKey,archive);
   if(deps.storage.getItem(archiveKey)!==archive)throw Error('CHECKPOINT_ARCHIVE_NOT_DURABLE');
   deps.storage.removeItem(KEY);
   return 'retired-local-preserved' as const;
  }),
  submit:(conversationKey:string,baseline:CheckpointHead)=>deps.lock(async()=>{
   if(pending())throw Error('CHECKPOINT_ALREADY_PENDING');
   const actual=await deps.transport.read(conversationKey);
   if(!equal(actual,baseline))throw Error('CHECKPOINT_BASELINE_CHANGED');
   // Stage 1: text only. Preserve the exact cloud state payload, do not upload stale local settings.
   const plan=prepareAppendCheckpoint({revision:baseline.revision,conversationKey,deviceId:deps.deviceId,remoteHistory:baseline.history,localHistory:deps.history(conversationKey),payload:baseline.payload});
   const r:Receipt={version:1,conversationKey,expectedRevision:baseline.revision,baselineHash:await hash(baseline),resultHash:await hash({revision:baseline.revision+1,history:[...plan.expected_history,...plan.append_messages],payload:plan.new_payload})};
   deps.storage.setItem(KEY,JSON.stringify(r));
   const saved=pending();if(!saved||!equal(saved,r))throw Error('CHECKPOINT_RECEIPT_NOT_DURABLE');
   const result=await deps.transport.commit(plan);
   if(result!==baseline.revision+1)throw Error('CHECKPOINT_REVISION_UNEXPECTED');
   return inspect(r);
  })
 };
}
