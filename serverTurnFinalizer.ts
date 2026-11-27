// Pure shared finalization: no DOM, localStorage, network or browser-side writes.
import {decodeVpsWorkflow} from './vpsWorkflow.js';
import {cleanVeniceChatReply,isInvalidVeniceChatReply} from './venice.js';
import {normalizeHongKongTraditional} from './traditionalChinese.js';
import {extractWardrobeEnvelope,normalizeWardrobeState,type WardrobeParticipant} from './wardrobe.js';
import {replyHasNpcSpeech,replyHasUnconfirmedAddressLabel} from './npcDialogue.js';
import {mergeReplySegments,normalizeCcCantoneseLeaks,repliesAreTooSimilar,replyReusesOpeningOrNarrativeBeat,replyReusesCompletedClause,userExplicitlyRequestsContinuation,replyBreaksSpeakerOwnership} from './chatReplyRules.js';
import {applySingleStrictReview} from './engine/reviewApplication.js';
import type {Content,WardrobeState} from './managers.js';
import type {PilotJob} from './generationQueuePilot.js';
import {getWorldline,recordWorldlineTurn,updateWorldlineRegistry,WORLDLINE_SETTING_KEY} from './worldline.js';
import {readDirector,consumeDirectorNext} from './worldlineDirector.js';

export type SingleFinalizeContext={
 personaKey:string;personaName:string;latestUserMessage:string;
 wardrobe:WardrobeState;wardrobeParticipants:WardrobeParticipant[];
 establishedNpcNames:string[];addressedNpcNames:string[];
 recentCandidateReplies:string[];recentReviewReplies:string[];
 requireAttributedNpcSpeech:boolean;
};
export function finalizeSingleWorkflow(job:PilotJob,ctx:SingleFinalizeContext):Content{
 const wf=decodeVpsWorkflow(job);
 const cc=ctx.personaKey==='cc';
 if(wf.version!==(cc?2:1))throw Error('UNSUPPORTED_FINALIZER');
 const initial=extractWardrobeEnvelope(wf.parts[0],ctx.wardrobe,ctx.wardrobeParticipants);
 let text=cleanVeniceChatReply(initial.visibleText),wardrobe=initial.wardrobe;
 const valid=(v:string)=>!!v&&!isInvalidVeniceChatReply(v);
 if(!valid(text))throw Error('INVALID_RESULT');
 for(const part of wf.parts.slice(1)){
  const continuation=cleanVeniceChatReply(part);
  if(!valid(continuation))throw Error('INVALID_RESULT');
  text=mergeReplySegments(text,continuation);
 }
 text=normalizeHongKongTraditional(text);
 const repeats=(v:string,previous:string[])=>!userExplicitlyRequestsContinuation(ctx.latestUserMessage)&&previous.some(p=>repliesAreTooSimilar(p,v)||replyReusesOpeningOrNarrativeBeat(v,p)||replyReusesCompletedClause(v,p));
 const unconfirmed=(v:string)=>replyHasUnconfirmedAddressLabel(v,ctx.latestUserMessage,ctx.personaName,ctx.establishedNpcNames);
 const npcSpeech=(v:string)=>!ctx.addressedNpcNames.length||cc||replyHasNpcSpeech(v,ctx.addressedNpcNames);
 if(repeats(text,ctx.recentCandidateReplies))throw Error('INVALID_RESULT');
 if(cc){
  if(wf.polished!==null){
   const polished=normalizeCcCantoneseLeaks(cleanVeniceChatReply(wf.polished||''));
   const ratio=polished.length/Math.max(text.length,1);
   const refusal=/(?:無法|不能|唔可以).{0,16}(?:協助|處理|生成|改寫|提供)|(?:I cannot|I can't).{0,24}(?:assist|rewrite)/iu.test(polished);
   if(!valid(polished)||refusal||ratio<0.7||ratio>1.55)throw Error('INVALID_RESULT');
   text=polished;
  }else text=normalizeCcCantoneseLeaks(text);
 }
 if(unconfirmed(text)||replyBreaksSpeakerOwnership(text)||repeats(text,ctx.recentCandidateReplies)||(ctx.requireAttributedNpcSpeech&&!npcSpeech(text)))throw Error('INVALID_RESULT');
 text=applySingleStrictReview(text,wf.decision,raw=>{
  const envelope=extractWardrobeEnvelope(raw,wardrobe,ctx.wardrobeParticipants);
  const revised=(cc?normalizeCcCantoneseLeaks:normalizeHongKongTraditional)(cleanVeniceChatReply(envelope.visibleText));
  const ratio=revised.length/Math.max(text.length,1);
  if(!valid(revised)||!envelope.hadValidUpdate||replyBreaksSpeakerOwnership(revised)||unconfirmed(revised)||!npcSpeech(revised)||repeats(revised,ctx.recentReviewReplies)||ratio<0.62||ratio>1.85)return null;
  wardrobe=envelope.wardrobe;
  return revised;
 });
 return {text,wardrobeState:normalizeWardrobeState(wardrobe)};
}
type StatePayload={appSettings:Record<string,string>;[key:string]:unknown};
export function finalizeStoryState(input:{payload:StatePayload;conversationKey:string;replyId:string;latestUserMessage:string;content:Content;worldActive:boolean;directorNextId?:string;at:number}){
 const {conversationKey:key,replyId,latestUserMessage,at}=input;
 const payload=structuredClone(input.payload);
 const content={...input.content,worldlineStoryTurn:input.worldActive};
 if(!input.worldActive)return {content,payload};
 const settings=payload.appSettings;
 if(!settings||typeof settings!=='object')throw Error('WORLDLINE_STATE_MISSING');
 const world=getWorldline(settings[WORLDLINE_SETTING_KEY],key);
 if(!world||world.paused||!content.text)throw Error('WORLDLINE_CONTEXT_CHANGED');
 if(world.chronicle.some(row=>row.sourceMessageId===replyId))throw Error('WORLDLINE_ALREADY_FINALIZED');
 const store={getItem:(k:string)=>settings[k]??null,setItem:(k:string,v:string)=>{settings[k]=v;},removeItem:(k:string)=>{delete settings[k];}};
 const director=readDirector(store,key);
 if(director.next?.id!==input.directorNextId)throw Error('WORLDLINE_CONTEXT_CHANGED');
 const next=recordWorldlineTurn(world,latestUserMessage,content.text,at,replyId);
 settings[WORLDLINE_SETTING_KEY]=JSON.stringify(updateWorldlineRegistry(settings[WORLDLINE_SETTING_KEY],key,next,at));
 if(input.directorNextId){
  content.worldlineVpsDirectorNextId=input.directorNextId;
  consumeDirectorNext(store,key,director);
 }
 return {content,payload};
}

// Adapter consumed by the background worker; the context is the immutable
// admission snapshot, not whichever browser happens to be open later.
export type ServerFinalizerContext={version:1;single:SingleFinalizeContext;worldActive:boolean;directorNextId?:string};
export function finalizeAcceptedSingleJob(row:{job_id:string;reply_id:string;conversation_key:string;created_at:string|Date;state_payload:StatePayload;finalizer_context:unknown},job:PilotJob){
 const c=row.finalizer_context as Partial<ServerFinalizerContext>|null;
 if(!c||c.version!==1||!c.single||typeof c.worldActive!=='boolean'||job.job_id!==row.job_id)throw Error('UNSUPPORTED_FINALIZER');
 const x=c.single;
 if(typeof x.personaKey!=='string'||!x.personaKey||typeof x.personaName!=='string'||typeof x.latestUserMessage!=='string'||!x.latestUserMessage.trim()||!x.wardrobe||!Array.isArray(x.wardrobeParticipants)||![x.establishedNpcNames,x.addressedNpcNames,x.recentCandidateReplies,x.recentReviewReplies].every(a=>Array.isArray(a)&&a.every(v=>typeof v==='string'))||typeof x.requireAttributedNpcSpeech!=='boolean')throw Error('UNSUPPORTED_FINALIZER');
 if(c.directorNextId!==undefined&&typeof c.directorNextId!=='string')throw Error('UNSUPPORTED_FINALIZER');
 const at=new Date(row.created_at).getTime();
 if(!Number.isFinite(at)||at<1)throw Error('INVALID_RESULT');
 return finalizeStoryState({payload:row.state_payload,conversationKey:row.conversation_key,replyId:row.reply_id,latestUserMessage:x.latestUserMessage,content:finalizeSingleWorkflow(job,x),worldActive:c.worldActive,directorNextId:c.directorNextId,at});
}
