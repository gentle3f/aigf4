import type {ChatRoom} from './roomManager.js';
import type {ChatMessage} from './managers.js';
import type {PilotRequest,PilotJob} from './generationQueuePilot.js';
import type {MemoryContext} from './durablePersonaMemory.js';
import {buildMemoryTurnBatches,buildRoomAutoMemoryMessages,parseRoomAutoMemoryResponse,ROOM_MEMORY_RESPONSE_FORMAT} from './autoMemory.js';
import {AUTO_MEMORY_SUMMARY_VERSION,AUTO_MEMORY_TURN_INTERVAL,AUTO_MEMORY_MIN_IMPORTANCE} from './autoMemoryPolicy.js';
import {getManualMemoryControlledSourceIds,getManualMemoryLongTermExclusionSummaries,autoMemoryMatchesManualDecision} from './memoryPolicy.js';
import {buildVpsCharacterPayload,VPS_REVIEW_MODELS} from './vpsCharacterTransport.js';
import {canonicalContextJson,hashContextJson} from './contextFingerprint.js';
import {groupMemoryAliases,groupMemoryPresence,roomMemorySnapshot,constrainGroupMemories} from './durableGroupMemory.js';
import {contentToGroupHistoryText} from './groupChat.js';
import {applyRoomMemorySummaryState} from './roomMemoryState.js';

export type GroupMemoryPlan={request:PilotRequest;context:MemoryContext&{digest:string}};
const skip=(reason:string)=>({status:'skipped' as const,reason});
const idsFor=(history:ChatMessage[])=>new Map(history.map(m=>[m,m.id!]));
const digest=(room:ChatRoom,history:ChatMessage[],context:MemoryContext)=>hashContextJson(canonicalContextJson(JSON.parse(roomMemorySnapshot(room,history,context,[...getManualMemoryControlledSourceIds(history)],getManualMemoryLongTermExclusionSummaries(history)))));
export async function planServerGroupMemory(room:ChatRoom|undefined,history:ChatMessage[]):Promise<{status:'ready';plan:GroupMemoryPlan}|ReturnType<typeof skip>>{
 if(!room)return skip('room_missing');
 const conversational=history.filter(m=>m.role!=='system');
 if(conversational.at(-1)?.role!=='model')return skip('incomplete_turn');
 const ids=history.map(m=>m.id?.trim());
 if(ids.some(id=>!id)||new Set(ids).size!==history.length)return skip('unstable_source_ids');
 const count=history.filter(m=>m.role==='user').length,checkpoint=Number(room.lastSummarizedUserMessageCount||0);
 if(!Number.isSafeInteger(checkpoint)||checkpoint<0||checkpoint>count)return skip('checkpoint_invalid');
 // Never rewind an existing checkpoint or skip the oldest unprocessed turn.
 // One immutable queue request covers one batch. The database schedules bounded
 // successor batches only after a successful checkpoint commit.
 if(count-checkpoint<AUTO_MEMORY_TURN_INTERVAL)return skip('threshold');
 const batches=buildMemoryTurnBatches(history,checkpoint,'auto');
 const batch=batches[0];
 if(!batch||batch.throughUserMessageCount<=checkpoint)return skip('threshold');
 // Reject incomplete user-only turns in historical data rather than marking them processed.
 let userSeen=false,modelSeen=false;
 for(const m of batch.messages){
  if(m.role==='user'){if(userSeen&&!modelSeen)return skip('incomplete_historical_turn');userSeen=true;modelSeen=false;}
  if(m.role==='model'&&userSeen)modelSeen=true;
 }
 if(userSeen&&!modelSeen)return skip('incomplete_historical_turn');
 const controlled=getManualMemoryControlledSourceIds(history),sourceIds=new Set<string>(),sceneIds=new Set<string>();
 let suppress=false,scene:ChatRoom['scene']|undefined;
 const lines=batch.messages.flatMap(m=>{
  if(m.role==='user'){suppress=controlled.has(m.id!);scene=m.content.roomSceneBeforeTurn;}
  if(suppress||!m.id||m.role==='system')return [];
  const text=(m.role==='user'?m.content.text||'':contentToGroupHistoryText(m.content,room)).replace(/\u0000/gu,'').trim().slice(0,7000);
  if(!text)return [];
  if(!scene?.presentMemberIds.length)throw Error('MEMORY_MISSING_HISTORICAL_PRESENCE');
  const sceneId=scene.id||'main';sourceIds.add(m.id);sceneIds.add(sceneId);
  return [`[MESSAGE_ID=${m.id}][SCENE_ID=${sceneId}][PRESENT=${scene.presentMemberIds.join(',')}][${m.role==='user'?'USER':'GROUP_REPLY'}]\n${text}`];
 });
 if(!lines.length)return skip('no_evidence');
 groupMemoryAliases(room);groupMemoryPresence(history,idsFor(history),sourceIds);
 const context:MemoryContext={personaKey:room.id,historyLength:history.length,checkpoint:batch.throughUserMessageCount,summaryVersion:AUTO_MEMORY_SUMMARY_VERSION,sourceIds:[...sourceIds],sceneIds:[...sceneIds]};
 const existing=room.sharedMemories.slice(-64).map(m=>`- [${m.kind}${m.sourceMessageIds?.length?' sources='+m.sourceMessageIds.join(','):''}${m.searchTags?.length?' tags='+m.searchTags.slice(0,10).join('|'):''}] ${m.title}: ${m.summary.replace(/\s+/gu,' ').slice(0,280)}`).join('\n');
 const request=buildVpsCharacterPayload({model:VPS_REVIEW_MODELS[0],messages:buildRoomAutoMemoryMessages(room.members.map(m=>m.id+'='+m.persona.name).join(', '),existing,lines.join('\n\n')),maxCompletionTokens:4200,temperature:0.2,topP:0.85,repetitionPenalty:1.04,stop:[],responseFormat:ROOM_MEMORY_RESPONSE_FORMAT});
 return {status:'ready',plan:{request,context:{...context,digest:await digest(room,history,context)}}};
}
export async function finalizeServerGroupMemory(input:{jobId:string;job:PilotJob;plan:GroupMemoryPlan;room:ChatRoom;history:ChatMessage[];at:number}){
 const {jobId,job,plan,room,history,at}=input,c=plan.context;
 if(room.lastVpsMemoryJobId===jobId)return {room:structuredClone(room),added:0};
 if(job.job_id!==jobId||job.status!=='done'||job.result?.workflow)throw Error('MEMORY_RESULT_INVALID');
 const choice=job.result?.choices?.[0];
 if(choice?.finish_reason==='length'||!choice?.message?.content)throw Error('MEMORY_RESULT_INVALID');
 if(await digest(room,history,c)!==c.digest)throw Error('MEMORY_CONTEXT_CHANGED');
 const memories=parseRoomAutoMemoryResponse(choice.message.content,groupMemoryAliases(room),new Set(c.sourceIds));
 if(memories===null)throw Error('MEMORY_RESULT_INVALID');
 const controlled=getManualMemoryControlledSourceIds(history),exclusions=getManualMemoryLongTermExclusionSummaries(history);
 const presence=groupMemoryPresence(history.slice(0,c.historyLength),idsFor(history),new Set(c.sourceIds));
 const entries=constrainGroupMemories(memories,presence,room,c).filter(m=>m.sourceMessageIds?.every(id=>!controlled.has(id))).filter(m=>Number(m.importance??3)>=AUTO_MEMORY_MIN_IMPORTANCE).filter(m=>!autoMemoryMatchesManualDecision(m.summary,exclusions));
 const next=structuredClone(room);let i=0;
 const added=applyRoomMemorySummaryState(next,entries,c.checkpoint,c.summaryVersion,jobId,{newId:()=>`memory-${jobId}-${++i}`,now:()=>at});
 return {room:next,added};
}
