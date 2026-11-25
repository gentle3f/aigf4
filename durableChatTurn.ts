// G7A: durable logical chat-turn receipt. No provider calls without a durable user message.
import type {PilotJob, PilotRequest, PilotSubmission, PilotStorage} from './generationQueuePilot.js';
const KEY='aigfVpsChatTurnV1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type TurnIdentity={conversationKey:string;personaKey:string;userMessageId:string;contextDigest?:string};
export type TurnStage='continuation-1'|'continuation-2'|'review-1'|'review-2'|'review-3';
export type StageReceipt={jobId:string;requestDigest:string;model:string};
export type TurnReceipt=TurnIdentity&{jobId:string;replyId:string;createdAt:number;model:string;workflowVersion?:1|2;stages?:Partial<Record<TurnStage,StageReceipt>>};
const STAGES=new Set<string>(['continuation-1','continuation-2','review-1','review-2','review-3']);
const validStages=(r:TurnReceipt)=>{
 if(r.stages===undefined)return true;
 if(!r.stages||typeof r.stages!=='object'||Array.isArray(r.stages))return false;
 const ids=new Set([r.jobId,r.replyId]);
 return Object.entries(r.stages).every(([phase,stage])=>{
   if(!STAGES.has(phase)||!stage||typeof stage.jobId!=='string'||!UUID.test(stage.jobId)||ids.has(stage.jobId)||typeof stage.requestDigest!=='string'||!/^[a-f0-9]{64}$/.test(stage.requestDigest)||typeof stage.model!=='string'||!stage.model)return false;
   ids.add(stage.jobId);return true;
 });
};
const stableJson=(v:unknown):string=>JSON.stringify(v,(_k,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
const requestDigest=async(payload:PilotRequest)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson(payload)))),n=>n.toString(16).padStart(2,'0')).join('');
export type TurnHistoryRow={id?:string;role:string};
export type DurableHistory={
  read:(conversationKey:string)=>readonly TurnHistoryRow[];
  // Must resolve only after persistence succeeds, not merely an in-memory append.
  persistUser:(turn:TurnIdentity)=>Promise<void>;
  persistReply:(receipt:TurnReceipt,content:string)=>Promise<void>;
  // Must also confirm a pre-existing reply is durable before receipt removal.
  confirmReply:(receipt:TurnReceipt)=>Promise<void>;
};
export type TurnTransport={submit:(id:string,payload:PilotSubmission)=>Promise<PilotJob>;get:(id:string)=>Promise<PilotJob>};
type Lock=<T>(work:()=>Promise<T>)=>Promise<T>;
const same=(a:TurnIdentity,b:TurnIdentity)=>a.conversationKey===b.conversationKey&&a.personaKey===b.personaKey&&a.userMessageId===b.userMessageId&&a.contextDigest===b.contextDigest;
const valid=(r:TurnReceipt)=>!!r&&typeof r.conversationKey==='string'&&!!r.conversationKey&&typeof r.personaKey==='string'&&!!r.personaKey&&UUID.test(r.userMessageId)&&UUID.test(r.jobId)&&UUID.test(r.replyId)&&r.jobId!==r.replyId&&Number.isFinite(r.createdAt)&&typeof r.model==='string'&&!!r.model&&(r.contextDigest===undefined||/^[a-f0-9]{64}$/.test(r.contextDigest))&&validStages(r)&&(r.workflowVersion===undefined||([1,2].includes(r.workflowVersion)&&r.stages===undefined));
export function createDurableChatTurn({storage,history,transport,lock,newId=()=>crypto.randomUUID(),now=Date.now}:{
 storage:PilotStorage;history:DurableHistory;transport:TurnTransport;lock:Lock;newId?:()=>string;now?:()=>number;
}){
 function pending():TurnReceipt|null{
   const raw=storage.getItem(KEY);if(!raw)return null;
   const r=JSON.parse(raw);if(!valid(r))throw Error('TURN_RECEIPT_INVALID');return r;
 }
 function inspect(r:TurnReceipt){
   const rows=history.read(r.conversationKey);
   const user=rows.findIndex(m=>m.id===r.userMessageId&&m.role==='user');
   const reply=rows.findIndex(m=>m.id===r.replyId);
   if(reply>=0&&rows[reply].role!=='model')throw Error('TURN_REPLY_ID_CONFLICT');
   if(reply>=0&&user>=0&&reply>user)return 'already-applied' as const;
   if(reply>=0)throw Error('TURN_REPLY_ID_CONFLICT');
   if(user<0)return 'missing-user' as const;
   if(user!==rows.length-1)return 'history-changed' as const;
   return 'ready' as const;
 }
 function clear(r:TurnReceipt){
   const current=pending();if(!current||current.jobId!==r.jobId)throw Error('TURN_RECEIPT_CHANGED');
   storage.removeItem(KEY);
 }
 async function fetchStatus(r:TurnReceipt){
   const j=await transport.get(r.jobId);
   if(j.job_id!==r.jobId)throw Error('TURN_JOB_ID_MISMATCH');
   return j;
 }
 return {
   pending,
   reconcileApplied:()=>lock(async()=>{
     const r=pending();if(!r||inspect(r)!=='already-applied')return false;
     await history.confirmReply(r);clear(r);return true;
   }),
   abandon:(jobId:string)=>lock(async()=>{
     const r=pending();if(!r||r.jobId!==jobId)throw Error('TURN_RECEIPT_CHANGED');
     clear(r);
   }),
   submit:(turn:TurnIdentity,payload:PilotSubmission)=>lock(async()=>{
     const prior=pending();
     if(prior){
       if(!same(prior,turn))throw Error('OTHER_CHAT_TURN_PENDING');
       // A lost POST response is ambiguous; do not resubmit even if GET is 404.
       return fetchStatus(prior);
     }
     const r:TurnReceipt={...turn,jobId:newId(),replyId:newId(),createdAt:now(),model:'workflow_version' in payload?payload.primary.model:payload.model,...('workflow_version' in payload?{workflowVersion:payload.workflow_version}:{})};
     if(!valid(r))throw Error('TURN_RECEIPT_INVALID');
     if(inspect(r)!=='ready')throw Error('TURN_HISTORY_CHANGED');
     await history.persistUser(turn);
     if(inspect(r)!=='ready')throw Error('TURN_HISTORY_CHANGED');
     storage.setItem(KEY,JSON.stringify(r));
     const j=await transport.submit(r.jobId,payload);
     if(j.job_id!==r.jobId)throw Error('TURN_JOB_ID_MISMATCH');
     return j;
   }),
   resume:(turn?:TurnIdentity)=>lock(async()=>{
     const r=pending();if(!r)return null;
     if(turn&&!same(r,turn))throw Error('OTHER_CHAT_TURN_PENDING');
     return {receipt:r,job:await fetchStatus(r),historyState:inspect(r)};
   }),
   // A child operation is journaled in the SAME receipt before its first POST.
   // An existing stage can only GET; even 404 is not authority to create another job.
   stage:async(parent:TurnReceipt,phase:TurnStage,payload:PilotRequest)=>{
     if(!STAGES.has(phase))throw Error('TURN_STAGE_INVALID');
     const digest=await requestDigest(payload);
     return lock(async()=>{
       const current=pending();
       if(!current||current.jobId!==parent.jobId||!same(current,parent)||current.replyId!==parent.replyId)throw Error('TURN_RECEIPT_CHANGED');
       if(inspect(current)!=='ready')throw Error('TURN_HISTORY_CHANGED');
       if(current.workflowVersion!==undefined)throw Error('TURN_WORKFLOW_NO_CLIENT_STAGE');
       const existing=current.stages?.[phase];
       if(existing){
         if(existing.requestDigest!==digest||existing.model!==payload.model)throw Error('TURN_STAGE_REQUEST_CHANGED');
         const j=await transport.get(existing.jobId);
         if(j.job_id!==existing.jobId)throw Error('TURN_JOB_ID_MISMATCH');
         return j;
       }
       const stage={jobId:newId(),requestDigest:digest,model:payload.model};
       const updated={...current,stages:{...current.stages,[phase]:stage}};
       if(!valid(updated))throw Error('TURN_STAGE_INVALID');
       storage.setItem(KEY,JSON.stringify(updated));
       const j=await transport.submit(stage.jobId,payload);
       if(j.job_id!==stage.jobId)throw Error('TURN_JOB_ID_MISMATCH');
       return j;
     });
   },
   apply:(r:TurnReceipt,job:PilotJob,acceptedText:string)=>lock(async()=>{
     const current=pending();
     if(!current||current.jobId!==r.jobId||!same(current,r)||current.replyId!==r.replyId)throw Error('TURN_RECEIPT_CHANGED');
     if(job.job_id!==current.jobId||job.status!=='done'||!job.result?.choices?.[0]?.message?.content?.trim())throw Error('TURN_RESULT_NOT_READY');
     if(current.workflowVersion!==job.result?.workflow?.version)throw Error('TURN_WORKFLOW_RESULT_MISMATCH');
     if(!acceptedText.trim())throw Error('TURN_REPLY_REJECTED');
     const state=inspect(current);
     if(state==='already-applied'){
       await history.confirmReply(current);clear(current);return 'already-applied' as const;
     }
     if(state!=='ready')throw Error('TURN_HISTORY_CHANGED');
     await history.persistReply(current,acceptedText);
     if(inspect(current)!=='already-applied')throw Error('TURN_REPLY_NOT_PERSISTED');
     await history.confirmReply(current);clear(current);return 'applied' as const;
   }),
 };
}
// No unsafe fallback when cross-tab exclusion is unavailable.
export const browserTurnLock:Lock=async work=>{
 if(!navigator.locks)throw Error('TURN_WEB_LOCKS_REQUIRED');
 return navigator.locks.request('aigf-vps-chat-turn-v1',work);
};
