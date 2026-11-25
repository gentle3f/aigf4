// G7A: durable logical chat-turn receipt. No provider calls without a durable user message.
import type {PilotJob, PilotRequest, PilotStorage} from './generationQueuePilot.js';
const KEY='aigfVpsChatTurnV1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export type TurnIdentity={conversationKey:string;personaKey:string;userMessageId:string;contextDigest?:string};
export type TurnReceipt=TurnIdentity&{jobId:string;replyId:string;createdAt:number;model:string};
export type TurnHistoryRow={id?:string;role:string};
export type DurableHistory={
  read:(conversationKey:string)=>readonly TurnHistoryRow[];
  // Must resolve only after persistence succeeds, not merely an in-memory append.
  persistUser:(turn:TurnIdentity)=>Promise<void>;
  persistReply:(receipt:TurnReceipt,content:string)=>Promise<void>;
  // Must also confirm a pre-existing reply is durable before receipt removal.
  confirmReply:(receipt:TurnReceipt)=>Promise<void>;
};
export type TurnTransport={submit:(id:string,payload:PilotRequest)=>Promise<PilotJob>;get:(id:string)=>Promise<PilotJob>};
type Lock=<T>(work:()=>Promise<T>)=>Promise<T>;
const same=(a:TurnIdentity,b:TurnIdentity)=>a.conversationKey===b.conversationKey&&a.personaKey===b.personaKey&&a.userMessageId===b.userMessageId&&a.contextDigest===b.contextDigest;
const valid=(r:TurnReceipt)=>!!r&&typeof r.conversationKey==='string'&&!!r.conversationKey&&typeof r.personaKey==='string'&&!!r.personaKey&&UUID.test(r.userMessageId)&&UUID.test(r.jobId)&&UUID.test(r.replyId)&&r.jobId!==r.replyId&&Number.isFinite(r.createdAt)&&typeof r.model==='string'&&!!r.model&&(r.contextDigest===undefined||/^[a-f0-9]{64}$/.test(r.contextDigest));
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
   submit:(turn:TurnIdentity,payload:PilotRequest)=>lock(async()=>{
     const prior=pending();
     if(prior){
       if(!same(prior,turn))throw Error('OTHER_CHAT_TURN_PENDING');
       // A lost POST response is ambiguous; do not resubmit even if GET is 404.
       return fetchStatus(prior);
     }
     const r:TurnReceipt={...turn,jobId:newId(),replyId:newId(),createdAt:now(),model:payload.model};
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
   apply:(r:TurnReceipt,job:PilotJob,acceptedText:string)=>lock(async()=>{
     const current=pending();
     if(!current||current.jobId!==r.jobId||!same(current,r)||current.replyId!==r.replyId)throw Error('TURN_RECEIPT_CHANGED');
     if(job.job_id!==current.jobId||job.status!=='done'||!job.result?.choices?.[0]?.message?.content?.trim())throw Error('TURN_RESULT_NOT_READY');
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
