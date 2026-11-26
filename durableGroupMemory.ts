import type {ChatRoom,RoomMemoryEntry} from './roomManager.js';
import type {ChatMessage} from './managers.js';
import type {MemoryContext} from './durablePersonaMemory.js';
export const GROUP_MEMORY_KEY='aigfVpsGroupMemoryPendingV1';
export function roomMemorySnapshot(room:ChatRoom,history:readonly ChatMessage[],context:MemoryContext,controlled:readonly string[],exclusions:readonly string[]){
 if(history.length<context.historyLength)throw Error('MEMORY_HISTORY_CHANGED');
 return JSON.stringify({roomId:room.id,members:room.members.map(m=>({id:m.id,name:m.persona.name,canonicalName:m.persona.publicIdentity?.canonicalName,prompt:m.persona.prompt,soul:m.soul,memories:m.memories})),sharedSoul:room.sharedSoul,sharedMemories:room.sharedMemories,checkpoint:room.lastSummarizedUserMessageCount,version:room.memorySummaryVersion,history:history.slice(0,context.historyLength),controlled:[...controlled].sort(),exclusions});
}
export function groupMemoryAliases(room:ChatRoom){
 const aliases=new Map<string,string>();
 for(const m of room.members)for(const raw of [m.id,m.persona.name,m.persona.publicIdentity?.canonicalName])if(raw?.trim()){
   const k=raw.trim().toLocaleLowerCase();
   if(aliases.has(k)&&aliases.get(k)!==m.id)throw Error('MEMORY_AMBIGUOUS_MEMBER_ALIAS');
   aliases.set(k,m.id);
 }
 return aliases;
}
export function groupMemoryPresence(history:readonly ChatMessage[],ids:ReadonlyMap<ChatMessage,string>,sources:ReadonlySet<string>){
 const present=new Map<string,Set<string>>();
 let active:readonly string[]|undefined;
 for(const message of history){
  if(message.role==='user')active=message.content.roomSceneBeforeTurn?.presentMemberIds;
  const id=ids.get(message);
  if(id&&sources.has(id)){
   if(!active?.length)throw Error('MEMORY_MISSING_HISTORICAL_PRESENCE');
   present.set(id,new Set(active));
  }
 }
 if(present.size!==sources.size)throw Error('MEMORY_EVIDENCE_MISSING');
 return present;
}
type Draft=Omit<RoomMemoryEntry,'id'|'createdAt'|'pinned'>;
export function constrainGroupMemories(entries:Draft[],presence:ReadonlyMap<string,ReadonlySet<string>>,room:ChatRoom,context:MemoryContext):Draft[]{
 const members=new Set(room.members.map(m=>m.id));
 const scenes=new Set(context.sceneIds);
 return entries.map(entry=>{
  const sources=entry.sourceMessageIds||[];
  if(!sources.length||sources.some(s=>!presence.has(s)))throw Error('MEMORY_EVIDENCE_MISSING');
  const eligible=new Set(sources.flatMap(s=>[...presence.get(s)!]));
  const knowers=[...new Set(entry.knowerIds||[])];
  if(!knowers.length||knowers.some(id=>!members.has(id)||!eligible.has(id)))throw Error('MEMORY_KNOWLEDGE_SCOPE');
  const perspectives=(entry.perspectives||[]).filter(p=>knowers.includes(p.memberId));
  if(knowers.some(id=>!perspectives.some(p=>p.memberId===id)))throw Error('MEMORY_MISSING_PERSPECTIVE');
  return {...entry,knowerIds:knowers,perspectives,visibility:knowers.length===members.size?'shared':'restricted',sceneId:entry.sceneId&&scenes.has(entry.sceneId)?entry.sceneId:context.sceneIds.at(-1)||'main'};
 });
}
