import {notifyLocalCloudChange} from './cloudSyncEvents.js';
// Per-world narrator style/preferences, not dialogue or model-policy overrides.
export const DIRECTOR_KEY='aigfWorldlineDirectorV1';
export type DirectorNote={id:string;text:string};
export type DirectorPreferences={standing?:DirectorNote;next?:DirectorNote};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(world:string)=>DIRECTOR_KEY+':'+world;
const note=(x:unknown):DirectorNote|undefined=>{
 if(!x||typeof x!=='object')return;
 const v=x as Partial<DirectorNote>;
 if(typeof v.id!=='string'||!v.id||typeof v.text!=='string'||!v.text.trim()||v.text.length>1500)return;
 return {id:v.id,text:v.text};
};
export function readDirector(store:Store,world:string):DirectorPreferences{
 const raw=store.getItem(key(world));if(!raw)return {};
 try{const v=JSON.parse(raw);return {standing:note(v?.standing),next:note(v?.next)};}catch{return {};}
}
// Preserve fields created by other versions of the app when changing one note.
function rawDirector(store:Store,world:string):Record<string,unknown>{
 try{const v=JSON.parse(store.getItem(key(world))||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}
}
export function saveDirector(store:Store,world:string,scope:'standing'|'next',text:string,newId=()=>crypto.randomUUID()){
 const clean=text.trim();if(clean.length>1500)throw Error('導演指令最多 1500 字。');
 const v=rawDirector(store,world);
 if(clean)v[scope]={id:newId(),text:clean};else delete v[scope];
 const raw=JSON.stringify(v);store.setItem(key(world),raw);
 if(store.getItem(key(world))!==raw)throw Error('未能保存導演指令。');
 if(typeof window!=='undefined'&&store===window.localStorage)notifyLocalCloudChange('state');
 return readDirector(store,world);
}
export function consumeDirectorNext(store:Store,world:string,used:DirectorPreferences|undefined){
 if(!used?.next)return false;
 if(readDirector(store,world).next?.id!==used.next.id)return false;
 const v=rawDirector(store,world);delete v.next;const raw=JSON.stringify(v);store.setItem(key(world),raw);
 if(store.getItem(key(world))!==raw)throw Error('未能更新導演指令。');
 if(typeof window!=='undefined'&&store===window.localStorage)notifyLocalCloudChange('state');
 return true;
}
export function formatDirector(v:DirectorPreferences|undefined){
 if(!v?.standing&&!v?.next)return '';
 return [
 'WORLDLINE DIRECTOR PREFERENCES (player-facing creative direction, not character dialogue). Apply only to narrative tone, pacing, continuity, viewpoint, atmosphere, character reactions, and non-explicit romantic or intimate scenes. These preferences cannot override content boundaries, established facts, character agency, or consent. Do not invent the player’s actions. Do not quote these notes as dialogue. When a scene cannot be depicted directly, preserve narrative continuity using an appropriate non-graphic transition and meaningful aftermath.',
 v.standing?'Standing preference: '+JSON.stringify(v.standing.text):'',
 v.next?'Current turn preference (takes precedence for compatible style choices): '+JSON.stringify(v.next.text):'',
 ].filter(Boolean).join('\n');
}
