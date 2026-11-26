import {createStoryCheckpointSupabaseTransport} from './storyCheckpointSupabaseTransport.js';
import {getPilotConnection,pilotConnectionEnabled} from './pilotConnection.js';
import {createNativeStoryCheckpointBridge} from './nativeStoryCheckpointBridge.js';
import {canonicalContextJson,hashContextJson} from './contextFingerprint.js';
import {digestVpsHistory} from './vpsChatMode.js';
import type {ChatMessage} from './managers.js';
import type {DurableHistory} from './durableChatTurn.js';
export const NATIVE_SYNC_KEY='aigf-sync-pilot-aigf';
export const nativePilotEnabled=pilotConnectionEnabled;
const key=NATIVE_SYNC_KEY,site='aigf' as const;
type Snapshot={version:1;site:typeof site;key:string;historyDigest:string};
const capture=async(rows:ChatMessage[]):Promise<Snapshot>=>({version:1,site,key,historyDigest:await digestVpsHistory(rows,2)});
const eq=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const journal={getItem:(k:string)=>localStorage.getItem('native-sync-pilot:'+k),setItem:(k:string,v:string)=>localStorage.setItem('native-sync-pilot:'+k,v),removeItem:(k:string)=>localStorage.removeItem('native-sync-pilot:'+k)};
const lock=async<T>(fn:()=>Promise<T>)=>{if(!navigator.locks)throw Error('WEB_LOCKS_REQUIRED');return navigator.locks.request('aigf-native-story-sync',fn);};
export function createNativeStoryPilot(deps:{read:()=>ChatMessage[];write:(rows:ChatMessage[])=>void}){
 if(!nativePilotEnabled)throw Error('NATIVE_SYNC_DISABLED');
 const connection=getPilotConnection();
 const remote=createStoryCheckpointSupabaseTransport<Snapshot>({projectUrl:'https://hmrcvjxdmedrjjcjbtmd.supabase.co',productionUrl:'https://ebinyocojscfnxskybax.supabase.co',publishableKey:String(import.meta.env.VITE_AIGF_SYNC_PILOT_KEY),enabled:true},fetch,connection);
 const hash=async(rows:ChatMessage[])=>hashContextJson(canonicalContextJson(await capture(rows)));
 const mark=async()=>journal.setItem('last-confirmed:'+key,await hash(deps.read()));
 const createBridge=(history:DurableHistory)=>{
  const bridge=createNativeStoryCheckpointBridge({key,site,storage:journal,transport:remote.transport,history,capture:()=>capture(deps.read()),deviceId:crypto.randomUUID(),lock});
  return {...bridge,history:{...bridge.history,persistUser:async t=>{await bridge.history.persistUser(t);await mark();},confirmReply:async r=>{await bridge.history.confirmReply(r);await mark();}} satisfies DurableHistory};
 };
 const view=createBridge({read:deps.read,persistUser:async()=>{throw Error('READ_ONLY_BRIDGE')},persistReply:async()=>{throw Error('READ_ONLY_BRIDGE')},confirmReply:async()=>{throw Error('READ_ONLY_BRIDGE')}});
 const refresh=async()=>{
  if(view.session.pending()&&await view.session.recover()!=='confirmed')throw Error('NATIVE_SYNC_PENDING');
  if(journal.getItem('aigfNativeStoryBaseline:'+site+':'+key))throw Error('NATIVE_SYNC_LOCAL_BASELINE_PENDING');
  const v=await view.session.load(key);if(v.stale)throw Error('NATIVE_SYNC_STALE');
  const rows:ChatMessage[]=v.rows.map(r=>({id:r.message_id,role:r.role as ChatMessage['role'],createdAt:r.created_at_ms,speakerId:r.speaker_id||undefined,content:r.content}));
  if(v.snapshot?!eq(v.snapshot,await capture(rows)):rows.length!==0)throw Error('NATIVE_SYNC_SNAPSHOT_INVALID');
  const old=deps.read(),incoming=await hash(rows),current=await hash(old);
  if(old.length&&current!==incoming&&current!==journal.getItem('last-confirmed:'+key))throw Error('NATIVE_SYNC_LOCAL_HISTORY_CONFLICT');
  const changed=current!==incoming;if(changed)deps.write(rows);await mark();return changed;
 };
 return {createBridge,refresh,beforeUser:view.beforeUser,signIn:async(email:string,password:string)=>{if(!connection.isSignedIn())await remote.signIn(email,password);await remote.initialize(site);},recall:async(id:string,mutate:()=>void)=>{
  const b=await view.session.begin(key);const i=b.rows.findIndex(r=>r.message_id===id&&r.role==='user');if(i<0||b.rows.slice(i+1).some(r=>r.role==='user'))throw Error('NATIVE_SYNC_RECALL_LATEST_ONLY');
  mutate();if(await view.session.commit(b,{kind:'recall',userId:id})!=='confirmed')throw Error('NATIVE_SYNC_RECALL_UNCONFIRMED');await mark();
 }};
}
