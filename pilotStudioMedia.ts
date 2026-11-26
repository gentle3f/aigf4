import {createPilotMediaSync,type PilotMedia} from './pilotMediaSync.js';
import {STUDIO_MEDIA_KEY,readStudioImageMetadata,readStudioVideoMetadata} from './studioMediaStore.js';
import {getCharacterPhotoAsset,saveCharacterPhotoAsset,type CharacterPhotoAsset} from './photoStore.js';
import {getChatAttachment,saveChatAttachment,type StoredChatAttachment} from './chatMediaStore.js';
import {canonicalContextJson} from './contextFingerprint.js';

type Sync=ReturnType<typeof createPilotMediaSync>;
const sha=async(b:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
const imageMedia=(a:CharacterPhotoAsset):PilotMedia=>{const studio=readStudioImageMetadata(a.personaKey,a.id,a.studio);if(!studio)throw Error('PILOT_STUDIO_IMAGE_INVALID');return {id:a.id,kind:'image',blob:a.blob,createdAt:a.createdAt,metadata:{prompt:a.prompt,studio}};};
const videoMedia=(a:StoredChatAttachment):PilotMedia=>{const studio=readStudioVideoMetadata(a.conversationKey,a.id,a.studio);if(!studio)throw Error('PILOT_STUDIO_VIDEO_INVALID');return {id:a.id,kind:'video',blob:a.blob,createdAt:a.createdAt,metadata:{name:a.name,studio}};};
const same=async(a:PilotMedia,b:PilotMedia)=>a.kind===b.kind&&a.createdAt===b.createdAt&&a.blob.type===b.blob.type&&a.blob.size===b.blob.size&&canonicalContextJson(a.metadata)===canonicalContextJson(b.metadata)&&await sha(a.blob)===await sha(b.blob);
export async function restorePilotStudioAsset(a:PilotMedia){
 if(a.kind==='image'){
  const studio=readStudioImageMetadata(STUDIO_MEDIA_KEY,a.id,a.metadata.studio);
  if(!studio||typeof a.metadata.prompt!=='string')throw Error('PILOT_STUDIO_IMAGE_INVALID');
  const existing=await getCharacterPhotoAsset(a.id);
  if(existing){if(!await same(imageMedia(existing),a))throw Error('PILOT_STUDIO_LOCAL_COLLISION');return;}
  await saveCharacterPhotoAsset({id:a.id,personaKey:STUDIO_MEDIA_KEY,blob:a.blob,prompt:a.metadata.prompt,createdAt:a.createdAt,studio});
 }else{
  const studio=readStudioVideoMetadata(STUDIO_MEDIA_KEY,a.id,a.metadata.studio);
  if(!studio||typeof a.metadata.name!=='string')throw Error('PILOT_STUDIO_VIDEO_INVALID');
  const existing=await getChatAttachment(a.id);
  if(existing){if(!await same(videoMedia(existing),a))throw Error('PILOT_STUDIO_LOCAL_COLLISION');return;}
  await saveChatAttachment({id:a.id,conversationKey:STUDIO_MEDIA_KEY,blob:a.blob,name:a.metadata.name,mimeType:a.blob.type,createdAt:a.createdAt,studio});
 }
}
let active:Sync|null=null;
const pendingKey='aigfPilotStudioMediaPendingV1';
type Pending={id:string;kind:'image'|'video'};
const pending=():Pending[]=>{try{const x=JSON.parse(localStorage.getItem(pendingKey)||'[]');return Array.isArray(x)?x.filter(v=>v&&typeof v.id==='string'&&['image','video'].includes(v.kind)):[];}catch{return [];}};
const remember=(p:Pending)=>{const items=pending();if(!items.some(x=>x.id===p.id))localStorage.setItem(pendingKey,JSON.stringify([...items,p]));};
const forget=(id:string)=>localStorage.setItem(pendingKey,JSON.stringify(pending().filter(x=>x.id!==id)));
let work:Promise<unknown>=Promise.resolve();
const serial=<T>(fn:()=>Promise<T>)=>{const next=work.then(fn,fn);work=next.catch(()=>{});return next;};
const push=async(p:Pending,s:Sync)=>{const a=p.kind==='image'?await getCharacterPhotoAsset(p.id):await getChatAttachment(p.id);if(!a)throw Error('PILOT_STUDIO_LOCAL_MISSING');await s.push(p.kind==='image'?imageMedia(a as CharacterPhotoAsset):videoMedia(a as StoredChatAttachment));forget(p.id);};
export async function enablePilotStudioMedia(s:Sync){active=s;return refreshPilotStudioMedia();}
export async function refreshPilotStudioMedia(){
 const s=active;if(!s)return {restored:0,pending:0};
 return serial(async()=>{
  let restored=0;
  for(const p of pending())await push(p,s);
  for(const row of await s.list()){const a=await s.pull(row.asset_id);if(!a)throw Error('PILOT_STUDIO_REMOTE_MISSING');await restorePilotStudioAsset(a);restored++;}
  return {restored,pending:pending().length};
 });
}
// Called only after newly generated results have been saved to the existing local stores.
export function queuePilotStudioMedia(kind:Pending['kind'],id:string){
 const s=active;if(!s)return;
 try{remember({kind,id});void serial(()=>push({kind,id},s)).catch(e=>console.warn('Pilot studio media sync pending:',e));}
 catch(e){console.warn('Pilot studio media journal unavailable:',e);}
}
