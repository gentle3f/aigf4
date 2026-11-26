import {canonicalContextJson,hashContextJson,projectCloudContextMessage,type CloudContextMessage} from './contextFingerprint.js';
import {prepareAppendCheckpoint,type CheckpointRow} from './cloudAppendCheckpoint.js';

export type CheckpointHeadV2={revision:number;count:number;sha256:string;contiguous:boolean};
export type CheckpointPlanV2={expected_revision:number;target_conversation:string;expected_history_sha256:string;expected_count:number;append_messages:CheckpointRow[];new_device_id:string};
export type CheckpointTransportV2={head:(key:string)=>Promise<CheckpointHeadV2>;page:(key:string,offset:number,limit:number)=>Promise<CheckpointRow[]>;append:(plan:CheckpointPlanV2)=>Promise<number>};
const equal=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const hash=(v:unknown)=>hashContextJson(canonicalContextJson(v));
const KEY='aigfCloudCheckpointV2Receipt';
const PAGE=200;
const validHead=(h:CheckpointHeadV2)=>Number.isSafeInteger(h?.revision)&&h.revision>=1&&Number.isSafeInteger(h.count)&&h.count>=0&&h.count<=2147483615&&/^[a-f0-9]{64}$/.test(h.sha256)&&h.contiguous===true;
export function projectCheckpointHistory(history:readonly CloudContextMessage[]):CheckpointRow[]{
 return history.map((m,i)=>{const r=projectCloudContextMessage(m,i);return {message_id:r.id,position:i,role:r.role,speaker_id:r.speakerId||null,content:r.content,created_at_ms:r.createdAt};});
}
export async function readConsistentCheckpoint(transport:CheckpointTransportV2,key:string){
 const head=await transport.head(key);
 if(!validHead(head))throw Error('CHECKPOINT_HEAD_INVALID');
 const rows:CheckpointRow[]=[];
 for(let offset=0;offset<head.count;offset+=PAGE){
  const size=Math.min(PAGE,head.count-offset),page=await transport.page(key,offset,size);
  if(!Array.isArray(page)||page.length!==size||page.some((r,i)=>r.position!==offset+i))throw Error('CHECKPOINT_PAGE_CHANGED');
  rows.push(...page);
 }
 if(new Set(rows.map(r=>r.message_id)).size!==rows.length)throw Error('CHECKPOINT_DUPLICATE_ID');
 if(!equal(head,await transport.head(key)))throw Error('CHECKPOINT_HEAD_CHANGED');
 return {head,rows};
}
type Receipt={version:2;key:string;head:CheckpointHeadV2;baselineHash:string;resultHash:string;resultCount:number};
// Isolated experimental session. No automatic production sync or network configuration.
export function createCheckpointV2Session(deps:{storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;transport:CheckpointTransportV2;history:(key:string)=>readonly CloudContextMessage[];deviceId:string;lock:<T>(fn:()=>Promise<T>)=>Promise<T>}){
 function pending():Receipt|null{
  const raw=deps.storage.getItem(KEY);if(!raw)return null;
  const r=JSON.parse(raw) as Receipt;
  if(r.version!==2||typeof r.key!=='string'||!r.key||r.key.length>256||!validHead(r.head)||!Number.isSafeInteger(r.resultCount)||r.resultCount<=r.head.count||r.resultCount>r.head.count+32||![r.baselineHash,r.resultHash].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)))throw Error('CHECKPOINT_RECEIPT_INVALID');
  return r;
 }
 async function inspect(r:Receipt){
  const current=await readConsistentCheckpoint(deps.transport,r.key);
  const digest=await hash(current.rows);
  if(current.head.revision>=r.head.revision+1&&current.head.count===r.resultCount&&digest===r.resultHash){
   deps.storage.removeItem(KEY);return 'confirmed' as const;
  }
  if(equal(current.head,r.head)&&digest===r.baselineHash)return 'not-confirmed' as const;
  return 'conflict-or-later-update' as const;
 }
 return {pending,recover:()=>deps.lock(async()=>{const r=pending();return r?inspect(r):'none' as const;}),
 submit:(key:string)=>deps.lock(async()=>{
  if(pending())throw Error('CHECKPOINT_ALREADY_PENDING');
  const baseline=await readConsistentCheckpoint(deps.transport,key);
  const plan=prepareAppendCheckpoint({revision:baseline.head.revision,conversationKey:key,deviceId:deps.deviceId,remoteHistory:baseline.rows,localHistory:deps.history(key),payload:{}});
  const request:CheckpointPlanV2={expected_revision:baseline.head.revision,target_conversation:key,expected_history_sha256:baseline.head.sha256,expected_count:baseline.head.count,append_messages:plan.append_messages,new_device_id:deps.deviceId};
  if(new TextEncoder().encode(JSON.stringify(request)).length>1048576)throw Error('CHECKPOINT_APPEND_TOO_LARGE');
  const r:Receipt={version:2,key,head:baseline.head,baselineHash:await hash(baseline.rows),resultHash:await hash([...baseline.rows,...request.append_messages]),resultCount:baseline.rows.length+request.append_messages.length};
  if(!equal(projectCheckpointHistory(deps.history(key)),[...baseline.rows,...request.append_messages]))throw Error('CHECKPOINT_LOCAL_CHANGED');
  deps.storage.setItem(KEY,JSON.stringify(r));
  if(!equal(pending(),r))throw Error('CHECKPOINT_RECEIPT_NOT_DURABLE');
  if(await deps.transport.append(request)!==r.head.revision+1)throw Error('CHECKPOINT_REVISION_UNEXPECTED');
  return inspect(r);
 }),
 // Read-only validation of a second device's restored history before queue adoption.
 verifyRestored:(key:string)=>deps.lock(async()=>{
  const snapshot=await readConsistentCheckpoint(deps.transport,key);
  if(!equal(snapshot.rows,projectCheckpointHistory(deps.history(key))))throw Error('CHECKPOINT_LOCAL_HISTORY_MISMATCH');
  return snapshot.head;
 })};
}
