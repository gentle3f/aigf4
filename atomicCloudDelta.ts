import {readCloudSyncIndex,writeCloudSyncIndexesAtomically} from './cloudSyncIndexStore.js';
export type DeltaRow={conversation_key:string;message_id:string;position:number;role:string;speaker_id:string|null;content:object;created_at_ms:number};
export type DeltaConversation={conversation_key:string;title:string;kind:string};
export type Delta={conversations:DeltaConversation[];messages:DeltaRow[];remove_messages:{conversation_key:string;message_id:string}[];remove_conversations:string[]};
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
type Journal={request:AtomicRequest;indexes:Record<string,Record<string,string>>};
export const readAtomicBaseline=async(uid:string)=>Number((await readCloudSyncIndex(baselineKey(uid))).revision||0);
export const saveAtomicBaseline=async(uid:string,revision:number)=>{if(!Number.isSafeInteger(revision)||revision<1)throw Error('ATOMIC_BASELINE_REQUIRED');await writeCloudSyncIndexesAtomically({[baselineKey(uid)]:{revision:String(revision)}});};
export const pendingAtomicJournal=async(uid:string):Promise<Journal|null>=>{
 const raw=(await readCloudSyncIndex(journalKey(uid))).json;if(!raw)return null;
 const j=JSON.parse(raw) as Journal;
 if(!j.request||!j.indexes||!Number.isSafeInteger(j.request.expected_revision)||j.request.expected_revision<1||!/^[a-f0-9-]{36}$/.test(j.request.operation_id))throw Error('ATOMIC_JOURNAL_INVALID');
 return j;
};
export const prepareAtomicJournal=async(uid:string,request:Omit<AtomicRequest,'operation_id'>,indexes:Journal['indexes'])=>{
 if(await pendingAtomicJournal(uid))throw Error('ATOMIC_OPERATION_PENDING');
 const j:Journal={request:{...request,operation_id:crypto.randomUUID()},indexes};
 await writeCloudSyncIndexesAtomically({[journalKey(uid)]:{json:JSON.stringify(j)}});
 return j;
};
export async function completeAtomicJournal(uid:string,j:Journal,transport:{read:(id:string)=>Promise<number|null>;commit:(request:AtomicRequest)=>Promise<number>},assertCurrent:()=>void){
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
 await writeCloudSyncIndexesAtomically({...j.indexes,[baselineKey(uid)]:{revision:String(revision)}},[journalKey(uid)]);
 return revision;
}
