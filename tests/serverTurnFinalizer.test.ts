import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeSingleWorkflow,finalizeStoryState,type SingleFinalizeContext} from '../serverTurnFinalizer.js';
import {makeWorldline,updateWorldlineRegistry,getWorldline,WORLDLINE_SETTING_KEY} from '../worldline.js';
import {DIRECTOR_KEY} from '../worldlineDirector.js';
import type {PilotJob} from '../generationQueuePilot.js';
const ctx:SingleFinalizeContext={personaKey:'fixture',personaName:'A',latestUserMessage:'What do you see?',wardrobe:{user:'coat',characters:{a:'jacket'}},wardrobeParticipants:[{key:'a',label:'A'}],establishedNpcNames:[],addressedNpcNames:[],recentCandidateReplies:[],recentReviewReplies:[],requireAttributedNpcSpeech:false};
const wrap=(text:string,review={decision:'keep',issues:[],revised_response:''},extra:Partial<PilotJob>={}):PilotJob=>({job_id:'fixture',status:'done',result:{choices:[{message:{content:text}}],workflow:{version:1,parts:[text],review:{choices:[{message:{content:JSON.stringify(review)}}]},stages:[{phase:'primary'},{phase:'review-1'}]}},...extra});
const candidate='我看见窗外有一棵树，远处还有一座山。<wardrobe>{"characters":{"a":"blue jacket"}}</wardrobe>';
test('server finalizer uses shared cleanup, traditional conversion and wardrobe parser',()=>{
 const r=finalizeSingleWorkflow(wrap(candidate),ctx);
 assert.equal(r.text,'我看見窗外有一棵樹，遠處還有一座山。');assert.equal(r.wardrobeState?.characters.a,'blue jacket');assert.equal(r.wardrobeState?.user,'coat');
});
test('server applies valid revision, retains original candidate for invalid revision',()=>{
 const revised='我看見窗外有一棵樹，遠處還有兩座山。<wardrobe>{"characters":{"a":"green jacket"}}</wardrobe>';
 const accepted=finalizeSingleWorkflow(wrap(candidate,{decision:'revise',issues:[],revised_response:revised}),ctx);
 assert.match(accepted.text!,/兩座山/);assert.equal(accepted.wardrobeState?.characters.a,'green jacket');
 const rejected=finalizeSingleWorkflow(wrap(candidate,{decision:'revise',issues:[],revised_response:'invalid'}),ctx);
 assert.match(rejected.text!,/一座山/);assert.equal(rejected.wardrobeState?.characters.a,'blue jacket');
});
test('repeated reply and invalid workflow not published',()=>{
 assert.throws(()=>finalizeSingleWorkflow(wrap(candidate),{...ctx,recentCandidateReplies:['我看見窗外有一棵樹，遠處還有一座山。']}),/INVALID_RESULT/);
 assert.throws(()=>finalizeSingleWorkflow(wrap(candidate,undefined,{status:'running'}),ctx),/VPS_WORKFLOW_RESULT_INVALID/);
});
test('worldline chronicle and one-turn director instruction committed together, untouched state preserved',()=>{
 const key='fixture',other='other',world=makeWorldline(key,{title:'Forest',genre:'fantasy',premise:'Explore a forest'},1000),otherWorld=makeWorldline(other,{title:'Other',genre:'fantasy',premise:'Other story'},1000);
 const registry=updateWorldlineRegistry(updateWorldlineRegistry(null,key,world,1000),other,otherWorld,1000);
 const dirKey=DIRECTOR_KEY+':'+key;
 const payload={appSettings:{[WORLDLINE_SETTING_KEY]:JSON.stringify(registry),[dirKey]:JSON.stringify({standing:{id:'standing',text:'Short replies'},next:{id:'next',text:'Focus on trees'}}),unrelated:'keep'},diaries:{old:'unchanged'}};
 const before=JSON.stringify(payload);
 const input={payload,conversationKey:key,replyId:'reply-1',latestUserMessage:ctx.latestUserMessage,content:finalizeSingleWorkflow(wrap(candidate),ctx),worldActive:true,directorNextId:'next',at:2000};
 const r=finalizeStoryState(input);
 assert.equal(JSON.stringify(payload),before);assert.equal(r.payload.appSettings.unrelated,'keep');assert.deepEqual(r.payload.diaries,payload.diaries);
 const after=getWorldline(r.payload.appSettings[WORLDLINE_SETTING_KEY],key)!;
 assert.equal(after.turnCount,world.turnCount+1);assert.equal(after.chronicle.at(-1)?.sourceMessageId,'reply-1');assert.equal(r.content.worldlineStoryTurn,true);
 assert.deepEqual(getWorldline(r.payload.appSettings[WORLDLINE_SETTING_KEY],other),getWorldline(payload.appSettings[WORLDLINE_SETTING_KEY],other));
 assert.deepEqual(JSON.parse(r.payload.appSettings[dirKey]),{standing:{id:'standing',text:'Short replies'}});
 assert.throws(()=>finalizeStoryState({...input,payload:r.payload}),/WORLDLINE_ALREADY_FINALIZED/);
 assert.throws(()=>finalizeStoryState({...input,directorNextId:'wrong'}),/WORLDLINE_CONTEXT_CHANGED/);
});
