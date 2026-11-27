import type {PilotWorkflowRequest} from './generationQueuePilot.js';
import type {WardrobeState} from './managers.js';
import type {WardrobeParticipant} from './wardrobe.js';
export type SingleFinalizeContext={
 personaKey:string;personaName:string;latestUserMessage:string;
 wardrobe:WardrobeState;wardrobeParticipants:WardrobeParticipant[];
 establishedNpcNames:string[];addressedNpcNames:string[];
 recentCandidateReplies:string[];recentReviewReplies:string[];
 requireAttributedNpcSpeech:boolean;
};
export type GroupServerContext={version:2;worldActive:false;roomDigest:string;group:{latestUserMessage:string;personaName:string;fallbackMemberId?:string;namedMemberId?:string;recentReplies:string[];ownerV2:boolean;alreadyOfferedNames:string[]}};
export type ServerFinalizerContext={version:1;single:SingleFinalizeContext;worldActive:boolean;directorNextId?:string};

import type {Delta} from './atomicCloudDelta.js';
export type ServerGenerationMarker={version:1;jobId:string;replyId:string};
export type ServerGenerationAdmission={job_id:string;reply_id:string;conversation_key:string;user_message_id:string;plan:PilotWorkflowRequest;finalizer_context:ServerFinalizerContext|GroupServerContext};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SERVER_GENERATION_V4=import.meta.env?.VITE_AIGF_SERVER_GENERATION_V4==='1'&&import.meta.env?.VITE_AIGF_ATOMIC_SYNC_PREVIEW==='1'&&import.meta.env?.VITE_AIGF_VPS_CHAT_PILOT==='1';
export const SERVER_GROUP_GENERATION_V4=SERVER_GENERATION_V4&&import.meta.env?.VITE_AIGF_SERVER_GROUP_GENERATION_V4==='1';
export const createServerGenerationMarker=():ServerGenerationMarker=>({version:1,jobId:crypto.randomUUID(),replyId:crypto.randomUUID()});
export function assertServerGenerationDelta(delta:Delta,admission?:ServerGenerationAdmission){
 const marked=delta.messages.filter(m=>Object.hasOwn(m.content,'vpsServerGeneration'));
 if(!admission){if(marked.length)throw Error('ATOMIC_GENERATION_DRAFT_NOT_ADMITTED');return;}
 if(marked.length!==1||!uuid.test(admission.job_id)||!uuid.test(admission.reply_id)||admission.job_id===admission.reply_id)throw Error('ATOMIC_GENERATION_ADMISSION_INVALID');
 const row=marked[0],content=row.content as {text?:string;vpsServerGeneration?:ServerGenerationMarker};
 const marker=content.vpsServerGeneration;
 if(row.role!=='user'||row.conversation_key!==admission.conversation_key||row.message_id!==admission.user_message_id||marker?.version!==1||marker.jobId!==admission.job_id||marker.replyId!==admission.reply_id||content.text!==(admission.finalizer_context.version===2?admission.finalizer_context.group.latestUserMessage:admission.finalizer_context.single.latestUserMessage)||(admission.finalizer_context.version===2?admission.plan.workflow_version!==3||!/^[a-f0-9]{64}$/.test(admission.finalizer_context.roomDigest):admission.finalizer_context.version!==1||![1,2].includes(admission.plan.workflow_version)))throw Error('ATOMIC_GENERATION_ADMISSION_INVALID');
 if(delta.messages.some(m=>m.conversation_key===row.conversation_key&&m.position>row.position)||delta.remove_conversations.includes(row.conversation_key))throw Error('ATOMIC_GENERATION_NOT_TAIL');
}
export function buildAtomicCommit(request:{operation_id:string;expected_revision:number;new_payload:object;delta:Delta;device:string},admission?:ServerGenerationAdmission){
 assertServerGenerationDelta(request.delta,admission);
 if(!admission)return {name:'wetapp_commit_chat_delta_receipted_v3',args:request};
 if(request.operation_id!==admission.job_id)throw Error('ATOMIC_GENERATION_OPERATION_MISMATCH');
 const {operation_id,...base}=request;
 return {name:'wetapp_accept_generation_v4',args:{...base,...admission}};
}
// Control-flow signal: the server owns the accepted turn. No browser-side reply write.
export class ServerGenerationAccepted extends Error{constructor(){super('SERVER_GENERATION_ACCEPTED');}}
