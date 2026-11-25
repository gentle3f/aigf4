import type {CheckpointHead,CheckpointTransport} from './cloudCheckpointSession.js';
import type {CheckpointPlan} from './cloudAppendCheckpoint.js';
// Lab-only endpoint. Never accepts a production origin or a remote host.
export function createLoopbackCheckpointTransport(base:string,token:string,fetchImpl:typeof fetch=fetch):CheckpointTransport{
 const u=new URL(base);
 if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||!u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash||!token)throw Error('CHECKPOINT_LAB_ORIGIN_REQUIRED');
 async function call(path:string,body?:CheckpointPlan){
  const res=await fetchImpl(new URL(path,u),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})});
  if(!res.ok)throw Error('CHECKPOINT_HTTP_'+res.status);
  return res.json();
 }
 return {read:async conversation=>{
  const d=await call('/checkpoint?conversation='+encodeURIComponent(conversation));
  if(!Number.isSafeInteger(d?.revision)||d.revision<1||!Array.isArray(d.history)||!d.payload||typeof d.payload!=='object'||Array.isArray(d.payload))throw Error('CHECKPOINT_HEAD_INVALID');
  return d as CheckpointHead;
 },commit:async plan=>{
  const d=await call('/checkpoint',plan);
  if(!Number.isSafeInteger(d?.revision)||d.revision<1)throw Error('CHECKPOINT_REVISION_INVALID');
  return d.revision;
 }};
}
