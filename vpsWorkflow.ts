import {buildVpsCharacterPayload,VPS_REVIEW_MODELS} from './vpsCharacterTransport.js';
import {buildStrictReviewRequest} from './engine/review/reviewRequestBuilder.js';
import {parseStrictReviewDecision} from './engine/review/reviewResultParser.js';
import {STRICT_REVIEW_RESPONSE_FORMAT} from './strictReview.js';
import type {VeniceTextGenerationOptions,VeniceMessage} from './venice.js';
import type {PilotJob,PilotWorkflowRequest} from './generationQueuePilot.js';
export const CANDIDATE_MARKER='__AIGF_CANDIDATE_V1__';
export function buildVpsWorkflowPayload(primaryOptions:VeniceTextGenerationOptions,review:{editorPrompt:string;authoritativePrompt:string;reviewHistory:readonly VeniceMessage[];latestUserMessage:string;promptCacheKey:string},polishPrompt?:string):PilotWorkflowRequest{
 const primary=buildVpsCharacterPayload(primaryOptions);
 if(primary.response_format)throw Error('VPS_WORKFLOW_PRIMARY_SCHEMA');
 const {messages}=buildStrictReviewRequest({...review,candidateResponse:CANDIDATE_MARKER});
 const reviewPayload=buildVpsCharacterPayload({model:VPS_REVIEW_MODELS[0],messages,temperature:0.18,topP:0.82,repetitionPenalty:1.02,stop:[],responseFormat:STRICT_REVIEW_RESPONSE_FORMAT,promptCacheKey:review.promptCacheKey});
 const occurrences=reviewPayload.messages.reduce((n,m)=>n+m.content.split(CANDIDATE_MARKER).length-1,0);
 if(occurrences!==1||!reviewPayload.messages.at(-1)?.content.includes(CANDIDATE_MARKER))throw Error('VPS_WORKFLOW_MARKER');
 const plan: PilotWorkflowRequest=polishPrompt?{workflow_version:2,primary,review:reviewPayload,polish:buildVpsCharacterPayload({model:VPS_REVIEW_MODELS[0],messages:[{role:'system',content:polishPrompt},{role:'user',content:CANDIDATE_MARKER}],temperature:.25,topP:.8,repetitionPenalty:1.02})}:{workflow_version:1,primary,review:reviewPayload};
 if(new TextEncoder().encode(JSON.stringify({job_id:'00000000-0000-4000-8000-000000000000',request:plan})).length>256*1024)throw Error('VPS_WORKFLOW_TOO_LARGE');
 return plan;
}
export function decodeVpsWorkflow(job:PilotJob){
 const workflow=job.result?.workflow;
 if(job.status!=='done'||!workflow||![1,2].includes(workflow.version)||!Array.isArray(workflow.parts)||workflow.parts.length<1||workflow.parts.length>3||workflow.parts.some(p=>typeof p!=='string'||!p.trim()))throw Error('VPS_WORKFLOW_RESULT_INVALID');
 if(job.result?.choices?.[0]?.message?.content!==workflow.parts.join('\n')||!Array.isArray(workflow.stages))throw Error('VPS_WORKFLOW_RESULT_INVALID');
 const expected=['primary',...(workflow.parts.length>=2?['continuation-1']:[]),...(workflow.parts.length===3?['continuation-2']:[]),...(workflow.version===2?['cc-polish']:[]),'review-1'];
 const phases=workflow.stages.map(s=>s?.phase);
 if(phases.length===expected.length+1)expected.push('review-2');
 if(phases.join(',')!==expected.join(','))throw Error('VPS_WORKFLOW_RESULT_INVALID');
 if(workflow.version===2&&workflow.polished!==null&&(typeof workflow.polished!=='string'||!workflow.polished.trim()||/<\/?wardrobe/i.test(workflow.polished)))throw Error('VPS_WORKFLOW_POLISH_INVALID');
 const review=workflow.review?.choices?.[0];
 if(review?.finish_reason==='length'||typeof review?.message?.content!=='string')throw Error('VPS_WORKFLOW_REVIEW_INVALID');
 const decision=parseStrictReviewDecision(review.message.content);
 if(!decision)throw Error('VPS_WORKFLOW_REVIEW_INVALID');
 return {version:workflow.version,parts:workflow.parts,polished:workflow.polished,decision};
}
