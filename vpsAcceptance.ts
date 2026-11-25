import {buildVpsCharacterPayload,VPS_REVIEW_MODELS} from './vpsCharacterTransport.js';
import {buildVpsWorkflowPayload,decodeVpsWorkflow} from './vpsWorkflow.js';
import {STRICT_REVIEW_RESPONSE_FORMAT} from './strictReview.js';
import {parseStrictReviewDecision} from './engine/review/reviewResultParser.js';
import {PERSONA_MEMORY_RESPONSE_FORMAT,ROOM_MEMORY_RESPONSE_FORMAT,buildPersonaAutoMemoryMessages,buildRoomAutoMemoryMessages,parsePersonaAutoMemoryResponse,parseRoomAutoMemoryResponse} from './autoMemory.js';
import type {PilotJob,PilotSubmission,PilotStorage} from './generationQueuePilot.js';
import type {TurnTransport} from './durableChatTurn.js';
const [glm,deepseek]=VPS_REVIEW_MODELS;
const KEY='aigfVpsAcceptanceSuiteV1';
const sources=new Set(['fixture-1','fixture-2']);
const editor='Audit the candidate for consistency with the task and authoritative context. Keep if correct, otherwise revise. Return the requested JSON schema.';
const user='Say hello and suggest a cup of tea.';
const review={editorPrompt:editor,authoritativePrompt:'You are a friendly fictional character. Keep the conversation concise and consistent.',reviewHistory:[],latestUserMessage:user,promptCacheKey:'wetapp-review-v1-acceptance'};
const primary=(model:string,system:string,message:string)=>({model,messages:[{role:'system' as const,content:system},{role:'user' as const,content:message}],maxCompletionTokens:768,temperature:.2,stop:[]});
const structured=(model:string,format:typeof STRICT_REVIEW_RESPONSE_FORMAT,messages:ReturnType<typeof primary>['messages'])=>buildVpsCharacterPayload({...primary(model,'',''),messages,maxCompletionTokens:1024,responseFormat:format});
const text=(j:PilotJob)=>{const c=j.result?.choices?.[0];if(!c?.message?.content?.trim()||c.finish_reason==='length')throw Error('EMPTY_OR_TRUNCATED');return c.message.content;};
function checkReview(j:PilotJob){const s=text(j);const p=JSON.parse(s);if(!['keep','revise'].includes(p.decision)||!Array.isArray(p.issues)||typeof p.revised_response!=='string'||!parseStrictReviewDecision(s))throw Error('REVIEW_SCHEMA_INVALID');return 'JSON '+p.decision;}
function memory(j:PilotJob,group:boolean){
 const raw=text(j);const v=JSON.parse(raw);if(!Array.isArray(v.memories)||!v.memories.length||v.memories.some((m:any)=>!Array.isArray(m.source_message_ids)||!m.source_message_ids.length||m.source_message_ids.some((id:string)=>!sources.has(id))))throw Error('MEMORY_EVIDENCE_INVALID');
 if(group&&v.memories.some((m:any)=>!Array.isArray(m.perspectives)||!m.perspectives.length||m.perspectives.some((p:any)=>!['a','b'].includes(p.member_id))))throw Error('MEMORY_SCOPE_INVALID');
 const parsed=group?parseRoomAutoMemoryResponse(raw,new Map([['a','a'],['b','b'],['c','c']]),sources):parsePersonaAutoMemoryResponse(raw,sources);
 if(!parsed?.length)throw Error('MEMORY_PARSE_INVALID');return parsed.length+' entries';
}
const evidence='[scene: fixture-scene; present: a,b]\n[fixture-1] USER to A and B: Please remember permanently that I prefer tea, not coffee.\n[fixture-2] A: I promise to remember this. B: I heard it. C is absent and was not told.';
export type AcceptanceCase={id:string;title:string;request:PilotSubmission;check:(j:PilotJob)=>string};
function work(version:1|2|3,model:string):AcceptanceCase{
 const group=version===3;
 const msg=group?'Return exactly a complete tagged response: <chat>A: Hello!</chat><scene>{"location":"cafe"}</scene><npc_candidate>null</npc_candidate>':user;
 const plan=buildVpsWorkflowPayload(primary(model,group?'Follow the requested tagged format exactly.':'Answer briefly in Hong Kong Cantonese.',msg),{...review,latestUserMessage:msg,authoritativePrompt:group?'A and B are fictional participants. Preserve the chat, scene and npc_candidate tags.':review.authoritativePrompt},version===2?'Proofread the Cantonese text without changing meaning. Output only the corrected text.':undefined,group);
 plan.review.max_completion_tokens=1024;if(plan.workflow_version===2)plan.polish.max_completion_tokens=768;
 return {id:'workflow-'+version,title:['','普通聊天自主工作流','CC 校稿工作流','群組結構化工作流'][version],request:plan,check:j=>{const r=decodeVpsWorkflow(j);if(r.version!==version)throw Error('WORKFLOW_VERSION');return 'review '+r.decision.decision+(version===2?(r.polished===null?' / 原文保留':' / 校稿完成'):'');}};
}
export const acceptanceCases:AcceptanceCase[]=[
 ...VPS_REVIEW_MODELS.map((model,i)=>({id:'review-'+i,title:(i===0?'GLM':'DeepSeek')+' 結構化審核',request:structured(model,STRICT_REVIEW_RESPONSE_FORMAT,primary(model,'Return strict JSON: decision keep, issues empty, revised_response empty.','Candidate says hello correctly.').messages),check:checkReview})),
 work(1,glm),work(2,deepseek),work(3,glm),
 {id:'persona-memory',title:'一對一記憶格式',request:structured(glm,PERSONA_MEMORY_RESPONSE_FORMAT,buildPersonaAutoMemoryMessages('A','',evidence) as ReturnType<typeof primary>['messages']),check:j=>memory(j,false)},
 {id:'group-memory',title:'群組記憶格式及知情範圍',request:structured(glm,ROOM_MEMORY_RESPONSE_FORMAT,buildRoomAutoMemoryMessages('a=A,b=B,c=C','',evidence) as ReturnType<typeof primary>['messages']),check:j=>memory(j,true)}
];
type RecordRow={id:string;jobId:string;status:'pending'|'pass'|'fail';detail?:string};
type Journal={version:1;rows:RecordRow[]};
export function createAcceptanceRunner({storage,transport,lock,cases=acceptanceCases,newId=()=>crypto.randomUUID()}:{storage:PilotStorage;transport:TurnTransport;lock:<T>(f:()=>Promise<T>)=>Promise<T>;cases?:AcceptanceCase[];newId?:()=>string}){
 function read():Journal{const raw=storage.getItem(KEY);if(!raw)return {version:1,rows:[]};const j=JSON.parse(raw) as Journal;if(j.version!==1||!Array.isArray(j.rows)||j.rows.length>cases.length||j.rows.some((r,i)=>r.id!==cases[i].id||! /^[a-f0-9-]{36}$/.test(r.jobId)||!['pending','pass','fail'].includes(r.status)||(r.status==='pending'&&i!==j.rows.length-1)))throw Error('ACCEPTANCE_JOURNAL_INVALID');return j;}
 const write=(j:Journal)=>storage.setItem(KEY,JSON.stringify(j));
 return {read,step:()=>lock(async()=>{
   const j=read();let row=j.rows.at(-1),job:PilotJob;
   if(row?.status==='pending'){job=await transport.get(row.jobId);}
   else {if(j.rows.length===cases.length)return 'complete' as const;const c=cases[j.rows.length];row={id:c.id,jobId:newId(),status:'pending'};j.rows.push(row);write(j);job=await transport.submit(row.jobId,c.request);}
   if(job.job_id!==row.jobId)throw Error('ACCEPTANCE_JOB_MISMATCH');
   if(job.status==='queued'||job.status==='running')return 'pending' as const;
   if(job.status==='done'){try{row.detail=cases[j.rows.length-1].check(job);row.status='pass';}catch(e){row.status='fail';row.detail=e instanceof Error?e.message:'VALIDATION_FAILED';}}
   else{row.status='fail';row.detail=job.status+(job.error?': '+job.error:'');}
   write(j);return j.rows.length===cases.length?'complete' as const:'next' as const;
 })};
}
