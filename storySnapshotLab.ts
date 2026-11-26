import {WORLDLINE_SETTING_KEY,parseWorldlineRegistry,reconcileWorldlineChronicle,type WorldlineRecord} from './worldline.js';
import {WORLD_LEDGER_KEY,parseLedger,getValidBatches,type WorldBatch} from './worldLedger.js';
import {DIRECTOR_KEY,readDirector,type DirectorPreferences} from './worldlineDirector.js';
import {readFullPromptSettings,type PromptSettings} from './worldline2Prompt.js';
import {digestVpsHistory} from './vpsChatMode.js';
import {canonicalContextJson} from './contextFingerprint.js';
import type {ChatMessage} from './managers.js';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type StorySnapshotV2={version:1;site:'worldline2';key:string;historyDigest:string;record:WorldlineRecord;ledger:Record<string,WorldBatch>;director:DirectorPreferences;prompt:PromptSettings};
const equal=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const promptKey=(key:string)=>'aigfWorldline2FullPrompt:'+key;
const directorKey=(key:string)=>DIRECTOR_KEY+':'+key;
const validKey=(key:string)=>typeof key==='string'&&key.length>0&&key.length<=180&&!['__proto__','constructor','prototype'].includes(key);
export async function captureStorySnapshot(store:Store,key:string,history:readonly ChatMessage[]):Promise<StorySnapshotV2>{
 if(!validKey(key))throw Error('STORY_KEY_INVALID');
 const registry=parseWorldlineRegistry(store.getItem(WORLDLINE_SETTING_KEY));
 const record=registry.records[key];if(!record?.world)throw Error('STORY_NOT_FOUND');
 const repaired=reconcileWorldlineChronicle(record.world,history,record.world.updatedAt);
 const prompt=readFullPromptSettings(store,key);
 if(repaired!==record.world||prompt.variableOverride?.turn!==repaired.turnCount)delete prompt.variableOverride;
 const ledger=Object.fromEntries(getValidBatches(store.getItem(WORLD_LEDGER_KEY),key,history).map(b=>[b.sourceId,b]));
 const director=readDirector(store,key);
 return {version:1,site:'worldline2',key,historyDigest:await digestVpsHistory(history,2),record:{...record,world:repaired},ledger,director,prompt};
}
// Lab-only restore: history must already be verified and installed by the caller.
// Existing divergent local state requires explicit baseline acknowledgement.
export async function restoreStorySnapshot(store:Store,key:string,history:readonly ChatMessage[],snapshot:StorySnapshotV2,expectedLocal?:StorySnapshotV2){
 if(!validKey(key)||snapshot?.version!==1||snapshot.site!=='worldline2'||snapshot.key!==key||snapshot.record?.world?.conversationKey!==key)throw Error('STORY_SNAPSHOT_INVALID');
 if(await digestVpsHistory(history,2)!==snapshot.historyDigest)throw Error('STORY_HISTORY_MISMATCH');
 const registry=parseWorldlineRegistry(store.getItem(WORLDLINE_SETTING_KEY));
 const ledger=parseLedger(store.getItem(WORLD_LEDGER_KEY));
 const record=parseWorldlineRegistry({schema:registry.schema,records:{[key]:snapshot.record}}).records[key];
 if(!record?.world||!equal(record,snapshot.record))throw Error('STORY_RECORD_INVALID');
 const normalized=parseLedger({schema:ledger.schema,worlds:{[key]:snapshot.ledger}});
 const valid=Object.fromEntries(getValidBatches(normalized,key,history).map(b=>[b.sourceId,b]));
 if(!equal(valid,snapshot.ledger))throw Error('STORY_LEDGER_INVALID');
 const temporary:Store={getItem:k=>k===directorKey(key)?JSON.stringify(snapshot.director):k===promptKey(key)?JSON.stringify(snapshot.prompt):null,setItem:()=>{},removeItem:()=>{}};
 if(!equal(readDirector(temporary,key),snapshot.director)||!equal(readFullPromptSettings(temporary,key),snapshot.prompt)||snapshot.prompt.variableOverride&&snapshot.prompt.variableOverride.turn!==record.world.turnCount)throw Error('STORY_PREFERENCES_INVALID');
 const keys=[WORLDLINE_SETTING_KEY,WORLD_LEDGER_KEY,directorKey(key),promptKey(key)];
 const before=keys.map(k=>store.getItem(k));
 const existing=registry.records[key]||ledger.worlds[key]||before[2]!==null||before[3]!==null;
 if(existing){
  const current=await captureStorySnapshot(store,key,history);
  if(equal(current,snapshot))return 'already-restored' as const;
  if(!expectedLocal||!equal(current,expectedLocal))throw Error('STORY_LOCAL_CONFLICT');
 }
 if(!equal(before,keys.map(k=>store.getItem(k))))throw Error('STORY_LOCAL_CHANGED');
 registry.records[key]=record;
 ledger.worlds[key]=valid;
 const values=[JSON.stringify(registry),JSON.stringify(ledger),JSON.stringify(snapshot.director),JSON.stringify(snapshot.prompt)];
 let written=0;
 try{
  for(let i=0;i<keys.length;i++){store.setItem(keys[i],values[i]);written++;if(store.getItem(keys[i])!==values[i])throw Error('STORY_RESTORE_WRITE_FAILED');}
 }catch(error){
  for(let i=written-1;i>=0;i--){if(before[i]===null)store.removeItem(keys[i]);else store.setItem(keys[i],before[i]!);}
  throw error;
 }
 return 'restored' as const;
}
