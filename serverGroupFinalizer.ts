// Shared browser/server group response normalization and validation.
import type {GroupGenerationResult} from './groupChat.js';
import {parseGroupGeneration,groupNarrationUsesFirstPerson} from './groupChat.js';
import type {ChatRoom} from './roomManager.js';
import {emptyWardrobeState,normalizeWardrobeState} from './wardrobe.js';
import {normalizeHongKongTraditional as normalizeTraditionalChineseLeaks} from './traditionalChinese.js';
import {normalizeGroupV2OwnerReply} from './groupV2PersonalTrial.js';
import {isUnconfirmedAddressPrefixName} from './npcDialogue.js';
import {repliesAreTooSimilar,userExplicitlyRequestsContinuation} from './chatReplyRules.js';
import {applyGroupStrictReview} from './engine/reviewApplication.js';
import {decodeVpsWorkflow} from './vpsWorkflow.js';
import type {PilotJob} from './generationQueuePilot.js';
import type {Content} from './managers.js';
export const normalizeGroupGenerationTraditional = (result: GroupGenerationResult): GroupGenerationResult => {
    const segments = result.segments.map(segment => ({
        ...segment,
        text: normalizeTraditionalChineseLeaks(segment.text),
    }));
    const text = segments.map(segment => segment.type === 'narration'
        ? `（${segment.text}）`
        : `${segment.speakerName || segment.speakerId}：「${segment.text}」`).join('\n');
    return {
        ...result,
        text,
        segments,
        scene: {
            ...result.scene,
            location: normalizeTraditionalChineseLeaks(result.scene.location),
            summary: normalizeTraditionalChineseLeaks(result.scene.summary),
            unresolved: result.scene.unresolved.map(normalizeTraditionalChineseLeaks),
            wardrobe: result.scene.wardrobe ? {
                user: normalizeTraditionalChineseLeaks(result.scene.wardrobe.user),
                characters: Object.fromEntries(Object.entries(result.scene.wardrobe.characters)
                    .map(([key, outfit]) => [key, normalizeTraditionalChineseLeaks(outfit)])),
            } : emptyWardrobeState(),
            memberStates: Object.fromEntries(Object.entries(result.scene.memberStates || {}).map(([memberId, state]) => [
                memberId,
                {
                    posture: normalizeTraditionalChineseLeaks(state.posture),
                    action: normalizeTraditionalChineseLeaks(state.action),
                    attention: normalizeTraditionalChineseLeaks(state.attention),
                    innerThought: normalizeTraditionalChineseLeaks(state.innerThought),
                    chemistry: normalizeTraditionalChineseLeaks(state.chemistry),
                },
            ])),
        },
        npcCandidate: result.npcCandidate ? {
            ...result.npcCandidate,
            name: normalizeTraditionalChineseLeaks(result.npcCandidate.name),
            description: normalizeTraditionalChineseLeaks(result.npcCandidate.description),
        } : undefined,
    };
};

export type GroupFinalizeContext={latestUserMessage:string;personaName:string;fallbackMemberId?:string;namedMemberId?:string;recentReplies:string[];ownerV2:boolean;alreadyOfferedNames:string[]};
export function finalizeGroupWorkflow(job:PilotJob,room:ChatRoom,c:GroupFinalizeContext){
 const wf=decodeVpsWorkflow(job);
 if(wf.version!==3)throw Error('UNSUPPORTED_FINALIZER');
 const repeats=(text:string)=>!userExplicitlyRequestsContinuation(c.latestUserMessage)&&c.recentReplies.some(p=>repliesAreTooSimilar(p,text));
 const candidate=normalizeGroupGenerationTraditional(parseGroupGeneration(wf.parts[0],room,c.fallbackMemberId));
 const normalized=c.ownerV2?normalizeGroupV2OwnerReply(candidate):candidate;
 if(normalized.npcCandidate&&isUnconfirmedAddressPrefixName(normalized.npcCandidate.name,c.latestUserMessage,c.personaName,room.members.map(m=>m.persona.name)))normalized.npcCandidate=undefined;
 if(repeats(normalized.text))throw Error('INVALID_RESULT');
 return applyGroupStrictReview(normalized,wf.decision,raw=>{
  try{
   const revision=normalizeGroupGenerationTraditional(parseGroupGeneration(raw,room,c.fallbackMemberId));
   if(groupNarrationUsesFirstPerson(revision)||repeats(revision.text))return null;
   if(c.namedMemberId&&!revision.segments.some(s=>s.type==='dialogue'&&s.speakerId===c.namedMemberId))return null;
   return {...revision,scene:{...revision.scene,memberStates:normalized.scene.memberStates||revision.scene.memberStates},npcCandidate:revision.npcCandidate||normalized.npcCandidate};
  }catch{return null;}
 });
}
export function finalizeGroupScene(room:ChatRoom,generated:GroupGenerationResult,c:GroupFinalizeContext,jobId:string,replyId:string,at:number){
 const next=structuredClone(room);
 next.scene=structuredClone(generated.scene);
 if(next.scene.realityLayer!==room.scene.realityLayer||!next.scene.realityEpochId)next.scene.realityEpochId=replyId;
 next.updatedAt=at;next.lastVpsSceneJobId=jobId;
 const content:Content={text:generated.text,segments:generated.segments,wardrobeState:normalizeWardrobeState(generated.scene.wardrobe)};
 const npc=generated.npcCandidate;
 if(npc&&room.members.length<8){
  const norm=(v:string)=>v.trim().toLocaleLowerCase();
  const known=new Set([...room.members.flatMap(m=>[m.persona.name,m.persona.publicIdentity?.canonicalName||'']),...c.alreadyOfferedNames].map(norm));
  if(!known.has(norm(npc.name))&&!isUnconfirmedAddressPrefixName(npc.name,c.latestUserMessage,c.personaName,room.members.map(m=>m.persona.name)))content.npcProposal={...npc,id:replyId+'-npc',status:'pending',createdAt:at};
 }
 return {content,room:next};
}

import {digestServerGroupContext} from './durableGroupTurn.js';

export type GroupServerContext={version:2;group:GroupFinalizeContext;worldActive:false;roomDigest:string};
export async function finalizeAcceptedGroupJob(row:{job_id:string;reply_id:string;conversation_key:string;created_at:string|Date;state_payload:Record<string,unknown>;finalizer_context:unknown},job:PilotJob){
 const c=row.finalizer_context as Partial<GroupServerContext>|null,g=c?.group;
 if(!c||c.version!==2||c.worldActive!==false||!g||typeof g.latestUserMessage!=='string'||!g.latestUserMessage.trim()||typeof g.personaName!=='string'||typeof g.ownerV2!=='boolean'||![g.recentReplies,g.alreadyOfferedNames].every(a=>Array.isArray(a)&&a.every(v=>typeof v==='string'))||typeof c.roomDigest!=='string'||job.job_id!==row.job_id)throw Error('UNSUPPORTED_FINALIZER');
 const payload=structuredClone(row.state_payload);
 const rooms=payload.rooms as {version:number;rooms:ChatRoom[]}|undefined;
 if(rooms?.version!==2||!Array.isArray(rooms.rooms))throw Error('GROUP_CONTEXT_CHANGED');
 const index=rooms.rooms.findIndex(r=>r.id===row.conversation_key);
 const room=rooms.rooms[index];
 if(!room||room.type!=='group'||await digestServerGroupContext(room)!==c.roomDigest)throw Error('GROUP_CONTEXT_CHANGED');
 if(g.fallbackMemberId&&!room.scene.presentMemberIds.includes(g.fallbackMemberId)||g.namedMemberId&&!room.scene.presentMemberIds.includes(g.namedMemberId))throw Error('GROUP_CONTEXT_CHANGED');
 const at=new Date(row.created_at).getTime();
 if(!Number.isFinite(at)||at<1)throw Error('INVALID_RESULT');
 const generated=finalizeGroupWorkflow(job,room,g);
 const result=finalizeGroupScene(room,generated,g,row.job_id,row.reply_id,at);
 rooms.rooms[index]=result.room;
 return {content:result.content,payload};
}
