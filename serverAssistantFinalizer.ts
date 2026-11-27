// Ordinary assistant text only, preserving the existing assistant cleaner.
import {buildVeniceTextPayload,cleanVeniceAssistantReply} from './venice.js';
import {repliesAreTooSimilar,userExplicitlyRequestsContinuation} from './chatReplyRules.js';
import {VPS_CHAT_MODELS} from './vpsChatMode.js';
import type {PilotJob,PilotRequest} from './generationQueuePilot.js';
export type AssistantServerContext={version:3;assistant:{latestUserMessage:string;recentReplies:string[]};worldActive:false};
export function buildAssistantServerPlan(options:Parameters<typeof buildVeniceTextPayload>[0]):PilotRequest{
 if(options.enableWebSearch||options.responseFormat||!VPS_CHAT_MODELS.some(m=>m===options.model)||options.messages.some(m=>typeof m.content!=='string'))throw Error('ASSISTANT_BACKGROUND_UNSUPPORTED');
 const {stream:_,...payload}=buildVeniceTextPayload({...options,onTextDelta:undefined});
 if(payload.messages.length<1||payload.messages.length>300||payload.messages.at(-1)?.role!=='user'||JSON.stringify(payload).length>240000)throw Error('ASSISTANT_BACKGROUND_PLAN_INVALID');
 return payload as PilotRequest;
}
export function finalizeAcceptedAssistantJob(row:{job_id:string;state_payload:object;finalizer_context:unknown},job:PilotJob){
 const c=row.finalizer_context as Partial<AssistantServerContext>|null;
 if(!c||c.version!==3||c.worldActive!==false||!c.assistant||typeof c.assistant.latestUserMessage!=='string'||!c.assistant.latestUserMessage.trim()||!Array.isArray(c.assistant.recentReplies)||!c.assistant.recentReplies.every(s=>typeof s==='string')||job.job_id!==row.job_id||job.status!=='done'||job.result?.workflow)throw Error('UNSUPPORTED_FINALIZER');
 const choice=job.result?.choices?.[0];
 if(typeof choice?.message?.content!=='string'||choice.finish_reason==='length'||choice.finish_reason==='content_filter')throw Error('INVALID_RESULT');
 const text=cleanVeniceAssistantReply(choice.message.content);
 if(!text||(!userExplicitlyRequestsContinuation(c.assistant.latestUserMessage)&&c.assistant.recentReplies.some(r=>repliesAreTooSimilar(text,r))))throw Error('INVALID_RESULT');
 return {content:{text},payload:structuredClone(row.state_payload)};
}
