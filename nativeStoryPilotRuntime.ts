import {createStoryCheckpointSupabaseTransport} from './storyCheckpointSupabaseTransport.js';
import {captureStorySnapshot,restoreStorySnapshot,type StorySnapshotV2} from './storySnapshotLab.js';
import {createNativeStoryCheckpointBridge} from './nativeStoryCheckpointBridge.js';
import {canonicalContextJson,hashContextJson} from './contextFingerprint.js';
import {WORLDLINE_SETTING_KEY,parseWorldlineRegistry,makeWorldline,updateWorldlineRegistry} from './worldline.js';
import {WORLD_LEDGER_KEY,parseLedger} from './worldLedger.js';
import {DIRECTOR_KEY} from './worldlineDirector.js';
import type {ChatMessage} from './managers.js';
import type {DurableHistory} from './durableChatTurn.js';

export const NATIVE_SYNC_KEY='aigf-sync-pilot-worldline2';
const key=NATIVE_SYNC_KEY,site='worldline2' as const;
const publishableKey=String(import.meta.env?.VITE_AIGF_SYNC_PILOT_KEY||'');
export const nativePilotEnabled=import.meta.env?.VITE_AIGF_VPS_CHAT_PILOT==='1'&&!!publishableKey;
const eq=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const journal={getItem:(k:string)=>localStorage.getItem('native-sync-pilot:'+k),setItem:(k:string,v:string)=>localStorage.setItem('native-sync-pilot:'+k,v),removeItem:(k:string)=>localStorage.removeItem('native-sync-pilot:'+k)};
const lock=async<T>(fn:()=>Promise<T>)=>{if(!navigator.locks)throw Error('WEB_LOCKS_REQUIRED');return navigator.locks.request('aigf-native-story-sync',fn);};
export function createNativeStoryPilot(deps:{read:()=>ChatMessage[];write:(rows:ChatMessage[])=>void}){
 if(!nativePilotEnabled)throw Error('NATIVE_SYNC_DISABLED');
 const remote=createStoryCheckpointSupabaseTransport<StorySnapshotV2>({projectUrl:'https://hmrcvjxdmedrjjcjbtmd.supabase.co',productionUrl:'https://ebinyocojscfnxskybax.supabase.co',publishableKey,enabled:true});
 const read=()=>deps.read();
 const capture=()=>captureStorySnapshot(localStorage,key,read());
 const markConfirmed=async()=>journal.setItem('last-confirmed:'+key,await hashContextJson(canonicalContextJson(await capture())));
 const createBridge=(history:DurableHistory)=>{
  const bridge=createNativeStoryCheckpointBridge({key,site,storage:journal,transport:remote.transport,history,capture,deviceId:crypto.randomUUID(),lock});
  return {...bridge,history:{...bridge.history,persistUser:async(t)=>{await bridge.history.persistUser(t);await markConfirmed();},confirmReply:async(r)=>{await bridge.history.confirmReply(r);await markConfirmed();}} satisfies DurableHistory};
 };
 const viewBridge=createBridge({read,persistUser:async()=>{throw Error('READ_ONLY_BRIDGE')},persistReply:async()=>{throw Error('READ_ONLY_BRIDGE')},confirmReply:async()=>{throw Error('READ_ONLY_BRIDGE')}});
 const refresh=async()=>{
  // Never discard an uncertain operation, even when switching devices.
  if(viewBridge.session.pending()&&await viewBridge.session.recover()!=='confirmed')throw Error('NATIVE_SYNC_PENDING');
  if(journal.getItem('aigfNativeStoryBaseline:'+site+':'+key))throw Error('NATIVE_SYNC_LOCAL_BASELINE_PENDING');
  const v=await viewBridge.session.load(key);
  if(v.stale)throw Error('NATIVE_SYNC_STALE');
  const rows:ChatMessage[]=v.rows.map(r=>({id:r.message_id,role:r.role as ChatMessage['role'],createdAt:r.created_at_ms,speakerId:r.speaker_id||undefined,content:r.content}));
  const scratchMap=new Map<string,string>(),scratch={getItem:(k:string)=>scratchMap.get(k)??null,setItem:(k:string,v:string)=>{scratchMap.set(k,v)},removeItem:(k:string)=>{scratchMap.delete(k)}};
  if(v.snapshot)await restoreStorySnapshot(scratch,key,rows,v.snapshot);
  else{if(rows.length)throw Error('NATIVE_SYNC_MISSING_SNAPSHOT');scratch.setItem(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(null,key,makeWorldline(key,{title:'古塔同步測試',genre:'fantasy',premise:'旅人探索古塔，記錄沿途發現。'},1000),1000)));}
  const registry=parseWorldlineRegistry(localStorage.getItem(WORLDLINE_SETTING_KEY)),ledger=parseLedger(localStorage.getItem(WORLD_LEDGER_KEY));
  registry.records[key]=parseWorldlineRegistry(scratch.getItem(WORLDLINE_SETTING_KEY)).records[key];
  ledger.worlds[key]=parseLedger(scratch.getItem(WORLD_LEDGER_KEY)).worlds[key]||{};
  const keys=[WORLDLINE_SETTING_KEY,WORLD_LEDGER_KEY,DIRECTOR_KEY+':'+key,'aigfWorldline2FullPrompt:'+key];
  const before=keys.map(k=>localStorage.getItem(k)),old=read();
  const values=[JSON.stringify(registry),JSON.stringify(ledger),scratch.getItem(keys[2]),scratch.getItem(keys[3])];
  const incoming=await captureStorySnapshot(scratch,key,rows);
  const localRecord=parseWorldlineRegistry(localStorage.getItem(WORLDLINE_SETTING_KEY)).records[key];
  const current=localRecord?await capture():null;
  const incomingHash=await hashContextJson(canonicalContextJson(incoming));
  const currentHash=current?await hashContextJson(canonicalContextJson(current)):null;
  const last=journal.getItem('last-confirmed:'+key);
  if(currentHash&&currentHash!==incomingHash&&currentHash!==last)throw Error('NATIVE_SYNC_LOCAL_SETTINGS_CONFLICT');
  const changed=!eq(old,rows)||!eq(current,incoming);
  if(changed){
   let written=0;try{for(let i=0;i<keys.length;i++){const value=values[i];if(value===null)localStorage.removeItem(keys[i]);else localStorage.setItem(keys[i],value);written++;}deps.write(rows);}
   catch(e){for(let i=written-1;i>=0;i--){if(before[i]===null)localStorage.removeItem(keys[i]);else localStorage.setItem(keys[i],before[i]!);}throw e;}
  }
  journal.setItem('last-confirmed:'+key,incomingHash);
  return changed;
 };
 const beginSnapshotUpdate=async()=>{const b=await viewBridge.session.begin(key,true);if(b.rows.at(-1)?.role==='user')throw Error('NATIVE_SYNC_TURN_PENDING');return b;};
 const commitSnapshotUpdate=async(b:Awaited<ReturnType<typeof beginSnapshotUpdate>>,mutate:()=>void)=>{
  const current=await viewBridge.session.begin(key,true);
  if(!eq(b,current))throw Error('NATIVE_SYNC_SNAPSHOT_BASELINE_CHANGED');
  const keys=[WORLDLINE_SETTING_KEY,WORLD_LEDGER_KEY,DIRECTOR_KEY+':'+key,'aigfWorldline2FullPrompt:'+key];
  const before=keys.map(k=>localStorage.getItem(k));
  try{mutate();if(await viewBridge.session.commit(b,{kind:'settings'})!=='confirmed')throw Error('NATIVE_SYNC_SETTINGS_UNCONFIRMED');}
  catch(e){if(!viewBridge.session.pending()){for(let i=0;i<keys.length;i++){if(before[i]===null)localStorage.removeItem(keys[i]);else localStorage.setItem(keys[i],before[i]!);}}throw e;}
  await markConfirmed();
 };
 return {createBridge,refresh,getMedia:remote.getMedia,beginSnapshotUpdate,commitSnapshotUpdate,saveSettings:async(mutate:()=>void)=>commitSnapshotUpdate(await beginSnapshotUpdate(),mutate),signIn:async(email:string,password:string)=>{await remote.signIn(email,password);await remote.initialize(site);},beforeUser:(id:string)=>viewBridge.beforeUser(id),recall:async(id:string,mutate:()=>void)=>{
  const b=await viewBridge.session.begin(key);
  const i=b.rows.findIndex(r=>r.message_id===id&&r.role==='user');if(i<0||b.rows.slice(i+1).some(r=>r.role==='user'))throw Error('NATIVE_SYNC_RECALL_LATEST_ONLY');
  mutate();
  if(await viewBridge.session.commit(b,{kind:'recall',userId:id})!=='confirmed')throw Error('NATIVE_SYNC_RECALL_UNCONFIRMED');
  await markConfirmed();
 }};
}
export function askNativePilotLogin(connect:(email:string,password:string)=>Promise<void>){
 const d=document.createElement('dialog');d.className='wl-dialog';const body=document.createElement('form');body.className='wl-form';
 const title=document.createElement('h2');title.textContent='同步測試故事';const email=document.createElement('input');email.className='wl-input';email.type='email';email.placeholder='測試電郵';email.required=true;email.autocomplete='username';const pwd=document.createElement('input');pwd.className='wl-input';pwd.type='password';pwd.required=true;pwd.placeholder='測試帳戶密碼';pwd.autocomplete='current-password';const send=document.createElement('button');send.className='wl-button wl-primary';send.type='submit';send.textContent='登入並開啟對話';const close=document.createElement('button');close.type='button';close.className='wl-button';close.textContent='取消';close.onclick=()=>d.close();const status=document.createElement('p');status.className='wl-note';status.textContent='獨立測試資料庫，不影響正式聊天。';body.append(title,email,pwd,send,close,status);d.append(body);document.body.append(d);d.addEventListener('close',()=>{pwd.value='';d.remove();});body.onsubmit=e=>{e.preventDefault();const p=pwd.value;pwd.value='';send.disabled=true;void connect(email.value.trim(),p).then(()=>d.close()).catch(e=>{status.textContent='登入或同步未完成：'+(e instanceof Error?e.message:'UNKNOWN');send.disabled=false;});};d.showModal();
}
