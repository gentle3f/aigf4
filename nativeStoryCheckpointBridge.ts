import {canonicalContextJson,hashContextJson,projectCloudContextMessage,type CloudContextMessage} from './contextFingerprint.js';
import {createStoryCheckpointSession,type StoryCheckpointSnapshot,type StoryCheckpointTransport,type StoryCheckpointRow} from './storyCheckpointSession.js';
import type {DurableHistory,TurnIdentity,TurnReceipt} from './durableChatTurn.js';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const equal=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const project=(history:readonly CloudContextMessage[]):StoryCheckpointRow[]=>history.map((m,i)=>{
 const r=projectCloudContextMessage(m,i);
 return {message_id:r.id,position:i,role:r.role,speaker_id:r.speakerId||null,content:r.content,created_at_ms:r.createdAt};
});
// Bridge for the existing durable-chat controller, rather than a separate model-generation engine.
// Only the explicitly bound isolated conversation can use this transport.
export function createNativeStoryCheckpointBridge<S extends StoryCheckpointSnapshot>(deps:{
 key:string;site:'worldline1'|'worldline2';storage:Store;transport:StoryCheckpointTransport<S>;
 history:DurableHistory;capture:(key:string)=>Promise<S>;deviceId:string;lock:<T>(fn:()=>Promise<T>)=>Promise<T>;
}){
 const {key,history}=deps;
 const session=createStoryCheckpointSession({...deps,history:history.read});
 type Baseline=Awaited<ReturnType<typeof session.load>>;
 const baseKey='aigfNativeStoryBaseline:'+deps.site+':'+key;
 type Marker={kind:'user'|'reply';id:string;hash:string};
 const marker=():Marker|null=>{const raw=deps.storage.getItem(baseKey);if(!raw)return null;const m=JSON.parse(raw) as Marker;if(!['user','reply'].includes(m.kind)||!m.id||!/^[a-f0-9]{64}$/.test(m.hash))throw Error('NATIVE_STORY_BASELINE_INVALID');return m;};
 const hash=(b:Baseline)=>hashContextJson(canonicalContextJson(b));
 const remember=async(kind:Marker['kind'],id:string,b:Baseline)=>{const m:Marker={kind,id,hash:await hash(b)};const prior=marker();if(prior){if(!equal(prior,m))throw Error('NATIVE_STORY_BASELINE_PENDING');return;}deps.storage.setItem(baseKey,JSON.stringify(m));if(!equal(marker(),m))throw Error('NATIVE_STORY_BASELINE_NOT_DURABLE');};
 const requireBaseline=async(kind:Marker['kind'],id:string,b:Baseline)=>{const m=marker();if(!m||m.kind!==kind||m.id!==id||m.hash!==await hash(b))throw Error('NATIVE_STORY_'+kind.toUpperCase()+'_BASELINE_CHANGED');};
 const clear=()=>deps.storage.removeItem(baseKey);
 const requireKey=(t:TurnIdentity)=>{if(t.conversationKey!==key||!t.worldDigest)throw Error('NATIVE_STORY_SCOPE_INVALID');};
 const recover=async()=>{if(session.pending()&&await session.recover()!=='confirmed')throw Error('NATIVE_STORY_SYNC_UNCERTAIN');};
 const matchesLocal=async(b:Baseline)=>{
  if(b.stale||!equal(b.rows,project(history.read(key))))return false;
  return !!b.snapshot&&equal(b.snapshot,await deps.capture(key));
 };
 const beforeUser=async(userMessageId:string)=>{
  await recover();
  const b=await session.begin(key,true);
  if(b.rows.at(-1)?.role==='user')throw Error('NATIVE_STORY_PREVIOUS_USER_PENDING');
  await remember('user',userMessageId,b);
 };
 const persistUser=async(t:TurnIdentity)=>{
  requireKey(t);
  await history.persistUser(t);
  await recover();
  const remote=await session.load(key);
  if(await matchesLocal(remote)){clear();return;}
  await requireBaseline('user',t.userMessageId,remote);
  if(await session.commit(remote,{kind:'user',id:t.userMessageId})!=='confirmed')throw Error('NATIVE_STORY_USER_NOT_CONFIRMED');
  clear();
 };
 const persistReply=async(r:TurnReceipt,text:string)=>{
  requireKey(r);await recover();
  const b=await session.begin(key);
  if(b.rows.at(-1)?.message_id!==r.userMessageId||b.rows.at(-1)?.role!=='user')throw Error('NATIVE_STORY_REPLY_SOURCE_CHANGED');
  await remember('reply',r.replyId,b);
  await history.persistReply(r,text);
 };
 const confirmReply=async(r:TurnReceipt)=>{
  requireKey(r);
  // Native confirmation must include the world chronicle and one-shot director mutation.
  await history.confirmReply(r);
  await recover();
  const remote=await session.load(key);
  if(await matchesLocal(remote)){clear();return;}
  await requireBaseline('reply',r.replyId,remote);
  if(await session.commit(remote,{kind:'reply',id:r.replyId,userId:r.userMessageId})!=='confirmed')throw Error('NATIVE_STORY_REPLY_NOT_CONFIRMED');
  clear();
 };
 return {beforeUser,session,history:{read:history.read,persistUser,persistReply,confirmReply} satisfies DurableHistory};
}
