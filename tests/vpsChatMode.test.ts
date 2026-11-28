import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digestVpsHistory,isVpsChatEligible,selectVpsModel} from '../vpsChatMode.js';
import {createDurableChatTurn} from '../durableChatTurn.js';
const id='12345678-1234-4234-8234-123456789abc',job='12345678-1234-4234-8234-123456789abd',reply='12345678-1234-4234-8234-123456789abe';
const payload={model:'glm-5-3-flash-uncensored',messages:[{role:'user' as const,content:'fixture'}]};
test('eligibility includes CC and group while excluding other special routes',()=>{const base={room:false,assistant:false,special:false,attachments:0,personaKey:'custom-fixture'};assert.equal(isVpsChatEligible(base),true);assert.equal(isVpsChatEligible({...base,personaKey:'cc'}),true);assert.equal(isVpsChatEligible({...base,room:true}),true);for(const change of [{assistant:true},{special:true},{attachments:1}])assert.equal(isVpsChatEligible({...base,...change}),false);});
test('same ID edit invalidates history fingerprint',async()=>{const a=[{id,role:'user',content:{text:'hello'}}],b=JSON.parse(JSON.stringify(a));assert.equal(await digestVpsHistory(a),await digestVpsHistory(b));b[0].content.text='changed';assert.notEqual(await digestVpsHistory(a),await digestVpsHistory(b));});
test('reconcile durable reply without network call and explicit abandon is local only',async()=>{
 const rows=[{id,role:'user'}];const m=new Map<string,string>();let calls=0,confirmed=0;
 const controller=createDurableChatTurn({storage:{getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v)},removeItem:k=>{m.delete(k)}},lock:fn=>fn(),newId:(()=>{const ids=[job,reply,job,reply];return()=>ids.shift()!})(),history:{read:()=>rows,persistUser:async()=>{},persistReply:async()=>{},confirmReply:async()=>{confirmed++}},transport:{submit:async j=>{calls++;return {job_id:j,status:'queued'}},get:async j=>{calls++;return {job_id:j,status:'running'}}}});
 const identity={conversationKey:'fixture',personaKey:'fixture',userMessageId:id,contextDigest:'a'.repeat(64)};
 await controller.submit(identity,payload);await assert.rejects(controller.resume({...identity,contextDigest:'b'.repeat(64)}),/OTHER_CHAT_TURN_PENDING/);assert.equal(calls,1);
 rows.push({id:reply,role:'model'});assert.equal(await controller.reconcileApplied(),true);assert.equal(calls,1);assert.equal(confirmed,1);assert.equal(controller.pending(),null);
 rows.pop();await controller.submit(identity,payload);await controller.abandon(job);assert.equal(calls,2);assert.equal(controller.pending(),null);
});
test('real application uses queue only in VPS-enabled builds, commits via durable history and resumes after unlock',()=>{const s=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');assert.match(s,/if \(request\.vpsTurn\) return runSingleTurnAdapter/);assert.match(s,/reviewCandidate: candidate => strictReviewSingleReply\(request, latestUserMessage, candidate\)/);assert.match(s,/if \(request\.vpsTurn \|\| isAbortError\(error\)\)/);assert.match(s,/makeVpsTurnController\(botContent,typeof generated==='string'\?undefined:generated.scene\)\.apply\(receipt,job,typeof generated==='string'\?generated:generated.text\)/);assert.match(s,/if\(request\.vpsTurn&&request\.room\)return runGroupTurnAdapter/);assert.match(s,/if \(VPS_CHAT_BUILD\) \{ void resumeVpsChatTurn\(true\); void resumeVpsPersonaMemory\(\); void resumeVpsGroupMemory\(\); \}/);assert.match(s,/if \(VPS_CHAT_BUILD&&!ATOMIC_CLOUD_PREVIEW\) return;\n    const manager = await loadSupabaseCloudSyncManager/);assert.match(s,/continuationCount < CHAT_MAX_AUTO_CONTINUES/);assert.match(s,/runDurableChatStage\(/);assert.match(s,/VPS_INVALID_CONTINUATION/);});

test('automatic VPS routing follows existing primary settings without silently switching models',()=>{
 for(const model of ['glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus']){
  assert.equal(selectVpsModel(true,model,false),model);
  assert.equal(selectVpsModel(false,model,false),null);
  assert.equal(selectVpsModel(true,model,true),null);
 }
 assert.equal(selectVpsModel(true,'other-model',false),null);
});
test('engineering controls are confined to the existing more-options menu',()=>{
 const s=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(s,/selectVpsModel\(VPS_CHAT_BUILD,chatModelSettings.primary,/);
 assert.match(s,/moreOptionsMenu.prepend\(toolsEntry\)/);
 assert.match(s,/toolsDialog.showModal\(\)/);
 assert.doesNotMatch(s,/chatView.prepend\(controls\)/);
});
