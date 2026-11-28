import { mergeBootstrapHistoryMaps, type ChatHistoryMap } from './cloudMessageMerge.js';
import type { ChatMessage, Persona } from './managers.js';
import { WORLDLINE_SETTING_KEY } from './worldline.js';
import { WORLD_LEDGER_KEY } from './worldLedger.js';

type State = {histories:ChatHistoryMap;personas:Record<string,Persona>;diaries:Record<string,any>;interests:Record<string,any>;settings:Record<string,string>};
const obj=(v:any)=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sameText=(a:ChatMessage,b:ChatMessage)=>a.id===b.id&&a.role===b.role&&Number(a.createdAt||0)===Number(b.createdAt||0)&&(a.speakerId||'')===(b.speakerId||'')&&(a.content?.text||'')===(b.content?.text||'');
const portable=(m:ChatMessage)=>!m.content?.imageUrl&&!m.content?.imageAssetId&&!m.content?.attachments?.length&&!Object.hasOwn(m.content||{},'vpsServerGeneration');
const parse=(raw:string|undefined,field:string)=>{if(!raw)return null;const data=JSON.parse(raw);if(!obj(data)||!obj(data[field]))throw Error('ATOMIC_BOOTSTRAP_WORLD_STATE_CONFLICT');return data;};
export function forkBootstrapTextWorlds(state:State,remote:ChatHistoryMap,blocked:ReadonlySet<string>,remoteSettings:Record<string,string>={},remotePersonas:Record<string,unknown>={},fallbackPersonas:Record<string,Persona>={}){
 const local=structuredClone(state),forks:Record<string,string>=Object.create(null),skipped:Record<string,string>=Object.create(null);
 const registry=parse(local.settings[WORLDLINE_SETTING_KEY],'records');
 const ledger=parse(local.settings[WORLD_LEDGER_KEY],'worlds');
 const remoteRegistry=parse(remoteSettings[WORLDLINE_SETTING_KEY],'records');
 const remoteLedger=parse(remoteSettings[WORLD_LEDGER_KEY],'worlds');
 for(const [key,a] of Object.entries(local.histories)){
  const b=remote[key], record=registry?.records[key],persona=local.personas[key]||fallbackPersonas[key];
  const assistant=key==='venice_ai'&&!record?.world;
  if(!b?.length||!a.length)continue;
  if((!assistant&&(!key.startsWith('custom_')||!record?.world||record.world.conversationKey!==key))||!persona||persona.avatarUrl||blocked.has(key)){
   skipped[key]=!key.startsWith('custom_')?'NOT_CUSTOM':!record?.world?'NO_WORLD':record.world.conversationKey!==key?'WORLD_KEY':!persona?'NO_PERSONA':persona.avatarUrl?'AVATAR':'MEDIA_OR_ROOM';continue;
  }
  const n=Math.min(a.length,b.length);let prefix=0;while(prefix<n&&sameText(a[prefix],b[prefix]))prefix++;
  // Only independently diverged text-only worlds with a proven common ancestor.
  if(assistant){try{mergeBootstrapHistoryMaps({[key]:a},{[key]:b});continue;}catch{/* Preserve both independent complete assistant histories. */}}
  if((!assistant&&(prefix===0||prefix===n))||!a.every(portable)){skipped[key]=prefix===0?'NO_SHARED_PREFIX':prefix===n?'PREFIX_OR_METADATA':'ATTACHMENT_OR_GENERATION';continue;}
  if(a.some(m=>!m.id)||new Set(a.map(m=>m.id)).size!==a.length){skipped[key]='INVALID_IDS';continue;}
  const tail=String(a.at(-1)!.id).replace(/[^a-zA-Z0-9_-]/gu,'_').slice(0,80);
  const target='custom_sync_'+key.replace(/[^a-zA-Z0-9_-]/gu,'_').slice(0,60)+'_'+tail;
  const director='aigfWorldlineDirectorV1:';
  if(!tail||Object.hasOwn(local.histories,target)||Object.hasOwn(remote,target)||Object.hasOwn(local.personas,target)||Object.hasOwn(remotePersonas,target)||Object.hasOwn(registry?.records||{},target)||Object.hasOwn(remoteRegistry?.records||{},target)||Object.hasOwn(ledger?.worlds||{},target)||Object.hasOwn(remoteLedger?.worlds||{},target)||Object.hasOwn(local.settings,director+target)||Object.hasOwn(remoteSettings,director+target))throw Error('ATOMIC_BOOTSTRAP_WORLD_FORK_CONFLICT');
  forks[key]=target;
  local.histories[target]=a;delete local.histories[key];
  local.personas[target]={...persona,conversationLabel:(persona.conversationLabel||persona.name)+(assistant?'（本機對話備份）':'（本機進度）')};
  // The legacy cloud can contain text rows without a persona. Keep that archive visible, without inventing world state.
  if(assistant||Object.hasOwn(remotePersonas,key))delete local.personas[key];
  else local.personas[key]={...persona,conversationLabel:(persona.conversationLabel||persona.name)+'（雲端舊分支）'};
  for(const map of [local.diaries,local.interests])if(Object.hasOwn(map,key)){map[target]=map[key];delete map[key];}
  if(record&&registry){registry.records[target]={...record,world:record.world?{...record.world,conversationKey:target}:null};delete registry.records[key];}
  if(ledger&&Object.hasOwn(ledger.worlds,key)){ledger.worlds[target]=ledger.worlds[key];delete ledger.worlds[key];}
  if(Object.hasOwn(local.settings,director+key)){local.settings[director+target]=local.settings[director+key];delete local.settings[director+key];}
 }
 if(Object.keys(forks).length){
  if(registry)local.settings[WORLDLINE_SETTING_KEY]=JSON.stringify(registry);
  if(ledger)local.settings[WORLD_LEDGER_KEY]=JSON.stringify(ledger);
 }
 return {local,forks,skipped};
}
