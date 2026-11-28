import {readCloudSyncIndex,writeCloudSyncIndexesAtomically} from './cloudSyncIndexStore.js';
import type {CloudMergeSnapshot} from './atomicCloudMerge.js';
import {assertServerGenerationDelta, type ServerGenerationAdmission} from './serverGenerationAdmission.js';
import type {AtomicMediaDelta} from './atomicCloudMedia.js';
import {isStatePatch,type StatePatch} from './cloudStatePatch.js';
export type DeltaRow={conversation_key:string;message_id:string;position:number;role:string;speaker_id:string|null;content:object;created_at_ms:number};
export type DeltaConversation={conversation_key:string;title:string;kind:string};
export type Delta={conversations:DeltaConversation[];messages:DeltaRow[];remove_messages:{conversation_key:string;message_id:string}[];remove_conversations:string[];media?:AtomicMediaDelta};
export function planAtomicDelta(conversations:DeltaConversation[],messages:DeltaRow[],hashes:Record<string,string>,oldHashes:Record<string,string>,oldConversations:Record<string,string>):Delta{
 const current=new Set(conversations.map(c=>c.conversation_key));
 const gone=Object.keys(oldConversations).filter(k=>!current.has(k));
 const ids=(r:DeltaRow)=>r.conversation_key+'\u0000'+r.message_id;
 return {
  conversations:conversations.map(({conversation_key,title,kind})=>({conversation_key,title,kind})),
  messages:messages.filter(m=>oldHashes[ids(m)]!==hashes[ids(m)]).map(({conversation_key,message_id,position,role,speaker_id,content,created_at_ms})=>({conversation_key,message_id,position,role,speaker_id,content,created_at_ms})),
  remove_messages:Object.keys(oldHashes).filter(k=>!Object.hasOwn(hashes,k)).flatMap(k=>{const i=k.indexOf('\u0000');if(i<0)throw Error('ATOMIC_INDEX_INVALID');const conversation_key=k.slice(0,i);return gone.includes(conversation_key)?[]:[{conversation_key,message_id:k.slice(i+1)}];}),
  remove_conversations:gone,
 };
}
const journalKey=(uid:string)=>'wetappAtomicDeltaJournalV3:'+uid;
const baselineKey=(uid:string)=>'wetappAtomicDeltaBaselineV3:'+uid;
export type AtomicRequest={expected_revision:number;new_payload:object;delta:Delta;device:string;operation_id:string};
export type MergeInstallation={local:CloudMergeSnapshot;merged:CloudMergeSnapshot};
export type AtomicJournal={request:AtomicRequest;indexes:Record<string,Record<string,string>>;mergeInstall?:MergeInstallation;generation?:ServerGenerationAdmission;statePatch?:StatePatch};
type Journal=AtomicJournal;
export const readAtomicBaseline=async(uid:string)=>Number((await readCloudSyncIndex(baselineKey(uid))).revision||0);
export const saveAtomicBaseline=async(uid:string,revision:number,extra:Record<string,Record<string,string>>={})=>{if(!Number.isSafeInteger(revision)||revision<1)throw Error('ATOMIC_BASELINE_REQUIRED');await writeCloudSyncIndexesAtomically({...extra,[baselineKey(uid)]:{revision:String(revision)}});};
export const pendingAtomicJournal=async(uid:string):Promise<Journal|null>=>{
 const raw=(await readCloudSyncIndex(journalKey(uid))).json;if(!raw)return null;
 const j=JSON.parse(raw) as Journal;
 if(!j.request||!j.indexes||!Number.isSafeInteger(j.request.expected_revision)||j.request.expected_revision<1||!/^[a-f0-9-]{36}$/.test(j.request.operation_id))throw Error('ATOMIC_JOURNAL_INVALID');
 if(j.statePatch!==undefined&&!isStatePatch(j.statePatch))throw Error('ATOMIC_STATE_PATCH_INVALID');
 assertServerGenerationDelta(j.request.delta,j.generation);
 if(j.generation&&j.generation.job_id!==j.request.operation_id)throw Error('ATOMIC_GENERATION_OPERATION_MISMATCH');
 return j;
};
export const prepareAtomicJournal=async(uid:string,request:Omit<AtomicRequest,'operation_id'>,indexes:Journal['indexes'],mergeInstall?:MergeInstallation,generation?:ServerGenerationAdmission,statePatch?:StatePatch)=>{
 if(await pendingAtomicJournal(uid))throw Error('ATOMIC_OPERATION_PENDING');
 assertServerGenerationDelta(request.delta,generation);
 if(generation&&mergeInstall)throw Error('ATOMIC_GENERATION_MERGE_REQUIRED');
 const j:Journal={request:{...request,operation_id:generation?.job_id??crypto.randomUUID()},indexes,...(mergeInstall?{mergeInstall}:{}),...(generation?{generation}:{}),...(statePatch?{statePatch}:{})};
 await writeCloudSyncIndexesAtomically({[journalKey(uid)]:{json:JSON.stringify(j)}});
 return j;
};
export async function completeAtomicJournal(uid:string,j:Journal,transport:{read:(id:string)=>Promise<number|null>;commit:(request:AtomicRequest)=>Promise<number>},assertCurrent:()=>void,installMerge?:(installation:MergeInstallation)=>Promise<void>){
 assertCurrent();
 let revision=await transport.read(j.request.operation_id);assertCurrent();
 if(revision===null){
  try{revision=await transport.commit(j.request);}
  catch(e){
   assertCurrent();
   // A disconnected response is not evidence of failure. Verify the operation receipt before retrying.
   revision=await transport.read(j.request.operation_id);
   if(revision===null)throw e;
  }
 }
 assertCurrent();
 if(revision!==j.request.expected_revision+1)throw Error('ATOMIC_RECEIPT_REVISION_MISMATCH');
 if(j.mergeInstall){if(!installMerge)throw Error('ATOMIC_MERGE_INSTALL_REQUIRED');await installMerge(j.mergeInstall);assertCurrent();}
 await writeCloudSyncIndexesAtomically({...j.indexes,[baselineKey(uid)]:{revision:String(revision)}},[journalKey(uid),...(j.mergeInstall?['wetappAtomicMergePlanV3:'+uid]:[])]);
 return revision;
}

/** Only retire a request when its expected revision is irreversibly stale and
 * a subsequent authenticated receipt read confirms that it was not committed. */
export async function retireStaleAtomicJournal(uid:string,observedRevision:number,readReceipt:(id:string)=>Promise<number|null>,assertCurrent:()=>void){
 const j=await pendingAtomicJournal(uid);
 if(!j||j.generation||observedRevision<=j.request.expected_revision)return false;
 assertCurrent();
 if(await readReceipt(j.request.operation_id)!==null)return false;
 assertCurrent();
 if((await pendingAtomicJournal(uid))?.request.operation_id!==j.request.operation_id)return false;
 await writeCloudSyncIndexesAtomically({},[journalKey(uid),...(j.mergeInstall?['wetappAtomicMergePlanV3:'+uid]:[])]);
 return true;
}
