// Browser-independent persona memory planning and result application.
import type {Persona,ChatMessage} from './managers.js';
import type {PilotRequest,PilotJob} from './generationQueuePilot.js';
import {buildMemoryTurnBatches,buildPersonaAutoMemoryMessages,parsePersonaAutoMemoryResponse,PERSONA_MEMORY_RESPONSE_FORMAT} from './autoMemory.js';
import {AUTO_MEMORY_SUMMARY_VERSION,AUTO_MEMORY_TURN_INTERVAL,AUTO_MEMORY_MIN_IMPORTANCE} from './autoMemoryPolicy.js';
import {getManualMemoryControlledSourceIds,getManualMemoryLongTermExclusionSummaries,autoMemoryMatchesManualDecision} from './memoryPolicy.js';
import {buildVpsCharacterPayload,VPS_REVIEW_MODELS} from './vpsCharacterTransport.js';
import {canonicalContextJson,hashContextJson} from './contextFingerprint.js';
import {applyPersonaMemorySummaryState} from './personaMemoryState.js';

type Context={personaKey:string;historyLength:number;checkpoint:number;summaryVersion:number;sourceIds:string[];sceneIds:string[];digest:string};
export type ServerMemoryPlan={request:PilotRequest;context:Context};
export type MemoryPlanResult={status:'ready';plan:ServerMemoryPlan}|{status:'skipped';reason:string};
const evidenceText=(text:string)=>text.replace(/\u0000/gu,'').trim().slice(0,7000);
function snapshot(persona:Persona,history:ChatMessage[],length:number){
 if(history.length<length)throw Error('MEMORY_HISTORY_CHANGED');
 return canonicalContextJson({
  name:persona.name,prompt:persona.prompt,memory:persona.memory,soul:persona.soul||[],memories:persona.memories||[],
  count:Number(persona.lastMemorySummaryUserMessageCount||0),version:Number(persona.memorySummaryVersion||0),job:persona.lastVpsMemoryJobId,
  history:history.slice(0,length),controlled:[...getManualMemoryControlledSourceIds(history)].sort(),exclusions:getManualMemoryLongTermExclusionSummaries(history),
 });
}
export async function planServerPersonaMemory(personaKey:string,persona:Persona|undefined,history:ChatMessage[]):Promise<MemoryPlanResult>{
 const skip=(reason:string)=>({status:'skipped' as const,reason});
 if(!persona||!personaKey)return skip('persona_missing');
 if(history.at(-1)?.role!=='model')return skip('incomplete_turn');
 const ids=history.map(m=>m.id?.trim());
 if(ids.some(id=>!id)||new Set(ids).size!==history.length)return skip('unstable_source_ids');
 const count=history.filter(m=>m.role==='user').length;
 const checkpoint=Number(persona.lastMemorySummaryUserMessageCount||0);
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
 const controlled=getManualMemoryControlledSourceIds(history);
 const sourceIds=new Set<string>(),sceneIds=new Set<string>();
 let suppress=false;
 const lines=batch.messages.flatMap(m=>{
  if(m.role==='user')suppress=controlled.has(m.id!);
  if(suppress||!m.id)return [];
  const text=evidenceText(m.content.text||'');if(!text)return [];
  const scene=m.content.roomSceneBeforeTurn?.id||'main';
  sourceIds.add(m.id);sceneIds.add(scene);
  return [`[MESSAGE_ID=${m.id}][SCENE_ID=${scene}][${m.role==='user'?'USER':persona.name}]\n${text}`];
 });
 if(!lines.length)return skip('no_evidence');
 const existing=(persona.memories||[]).slice(-64).map(m=>{
  const sources=m.sourceMessageIds?.length?' sources='+m.sourceMessageIds.join(','):'';
  const tags=m.searchTags?.length?' tags='+m.searchTags.slice(0,10).join('|'):'';
  return `- [${m.kind}${sources}${tags}] ${m.title}: ${m.summary.replace(/\s+/gu,' ').slice(0,280)}`;
 }).join('\n');
 const request=buildVpsCharacterPayload({model:VPS_REVIEW_MODELS[0],messages:buildPersonaAutoMemoryMessages(persona.name,existing,lines.join('\n\n')),maxCompletionTokens:4200,temperature:0.2,topP:0.85,repetitionPenalty:1.04,stop:[],responseFormat:PERSONA_MEMORY_RESPONSE_FORMAT});
 return {status:'ready',plan:{request,context:{personaKey,historyLength:history.length,checkpoint:batch.throughUserMessageCount,summaryVersion:AUTO_MEMORY_SUMMARY_VERSION,sourceIds:[...sourceIds],sceneIds:[...sceneIds],digest:await hashContextJson(snapshot(persona,history,history.length))}}};
}
export async function finalizeServerPersonaMemory(input:{jobId:string;job:PilotJob;plan:ServerMemoryPlan;persona:Persona;history:ChatMessage[];at:number}){
 const {jobId,job,plan,persona,history,at}=input,c=plan.context;
 if(persona.lastVpsMemoryJobId===jobId)return {persona:structuredClone(persona),added:0};
 if(job.job_id!==jobId||job.status!=='done'||job.result?.workflow)throw Error('MEMORY_RESULT_INVALID');
 const choice=job.result?.choices?.[0];
 if(choice?.finish_reason==='length'||!choice?.message?.content)throw Error('MEMORY_RESULT_INVALID');
 if(await hashContextJson(snapshot(persona,history,c.historyLength))!==c.digest)throw Error('MEMORY_CONTEXT_CHANGED');
 const memories=parsePersonaAutoMemoryResponse(choice.message.content,new Set(c.sourceIds));
 if(memories===null)throw Error('MEMORY_RESULT_INVALID');
 const controlled=getManualMemoryControlledSourceIds(history),exclusions=getManualMemoryLongTermExclusionSummaries(history),ids=new Set(history.map(m=>m.id));
 const scenes=new Set(c.sceneIds);
 const entries=memories.filter(m=>m.sourceMessageIds?.length&&m.sourceMessageIds.every(id=>ids.has(id)&&!controlled.has(id)))
  .filter(m=>Number(m.importance??3)>=AUTO_MEMORY_MIN_IMPORTANCE)
  .filter(m=>!autoMemoryMatchesManualDecision(m.summary,exclusions))
  .map(m=>({...m,sceneId:m.sceneId&&scenes.has(m.sceneId)?m.sceneId:c.sceneIds.at(-1)||'main'}));
 const next=structuredClone(persona);let index=0;
 const added=applyPersonaMemorySummaryState(next,entries,c.checkpoint,c.summaryVersion,jobId,{newId:()=>`memory-${jobId}-${++index}`,now:()=>at});
 return {persona:next,added};
}
