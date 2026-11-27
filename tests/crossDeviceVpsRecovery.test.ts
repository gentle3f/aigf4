import test from 'node:test';
import assert from 'node:assert/strict';
import {findMatchingVpsRecovery} from '../vpsRecovery.js';
import {digestVpsHistory} from '../vpsChatMode.js';
import {createDurableChatTurn,type TurnReceipt} from '../durableChatTurn.js';
const history=[{id:'11111111-1111-4111-8111-111111111111',role:'user',createdAt:1000,content:{text:'fixture'}}];
const receipt:TurnReceipt={conversationKey:'fixture',personaKey:'fixture',userMessageId:history[0].id,contextDigestVersion:2,contextDigest:await digestVpsHistory(history,2),jobId:'22222222-2222-4222-8222-222222222222',replyId:'33333333-3333-4333-8333-333333333333',model:'glm-5-3-flash-uncensored',workflowVersion:1,createdAt:1001};
const row={receipt,status:'done' as const,updated:1002};
test('second device discovers exact server receipt after cloud restore',async()=>{
 assert.equal((await findMatchingVpsRecovery([row],'fixture',history))?.receipt.jobId,receipt.jobId);
 assert.equal(await findMatchingVpsRecovery([row],'different',history),null);
 assert.equal(await findMatchingVpsRecovery([row],'fixture',[{...history[0],content:{text:'edited'}}]),null);
 assert.equal(await findMatchingVpsRecovery([row,row],'fixture',history),null);
 assert.equal(await findMatchingVpsRecovery([{...row,status:'failed'}],'fixture',history),null);
 assert.equal(await findMatchingVpsRecovery([],'fixture',history),null);
});
test('adopted receipt on second device only GETs existing job and applies once',async()=>{
 const rows=[...history];const storage=new Map<string,string>();let submits=0,gets=0,applies=0;
 const controller=createDurableChatTurn({storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{storage.set(k,v)},removeItem:k=>{storage.delete(k)}},history:{read:()=>rows,persistUser:async()=>{},persistReply:async(r,text)=>{applies++;rows.push({id:r.replyId,role:'model',createdAt:r.createdAt+1,content:{text}})},confirmReply:async()=>{}},transport:{submit:async()=>{submits++;throw Error('unexpected POST')},get:async id=>{gets++;return {job_id:id,status:'done',result:{choices:[{message:{content:'fixture response'}}],workflow:{version:1}}} as any}},lock:async work=>work()});
 const found=await findMatchingVpsRecovery([row],'fixture',rows);assert.ok(found);
 assert.equal(await controller.adoptRecovery(found.receipt),'adopted');
 const resumed=await controller.resume();assert.ok(resumed);
 await controller.apply(resumed.receipt,resumed.job,'fixture response');
 assert.equal(gets,1);assert.equal(submits,0);assert.equal(applies,1);
 assert.equal(await findMatchingVpsRecovery([row],'fixture',rows),null);
 assert.equal(controller.pending(),null);
});
