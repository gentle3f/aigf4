import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchReceiptSeed,matchDispatchIntent} from '../vpsDispatchIntent.js';
import {digestVpsHistory} from '../vpsChatMode.js';
import {createDurableChatTurn,type TurnHistoryRow,type TurnReceipt} from '../durableChatTurn.js';
const before:TurnHistoryRow[]=[{id:'00000000-0000-4000-8000-000000000001',role:'model',createdAt:1000,content:{text:'Hello'}}];
const createdAt=2000,worldDigest='a'.repeat(64);
const user:TurnHistoryRow={id:'00000000-0000-4000-8000-000000000002',role:'user',createdAt,content:{text:'Continue',vpsDispatchIntent:{version:1,model:'glm-5-3-flash-uncensored',personaKey:'persona',createdAt,priorDigest:await digestVpsHistory(before,2),worldDigest}}};
const history=[...before,user];
test('restored pending intent must match prior chat and world, and cannot retry expired or unmarked turns',async()=>{
 const restored=JSON.parse(JSON.stringify(history));
 assert.equal((await matchDispatchIntent(restored,'persona',worldDigest,3000))?.model,'glm-5-3-flash-uncensored');
 assert.equal(await matchDispatchIntent(restored,'different',worldDigest,3000),null);
 assert.equal(await matchDispatchIntent(restored,'persona','b'.repeat(64),3000),null);
 assert.equal(await matchDispatchIntent(restored,'persona',worldDigest,createdAt+13*3600000),null);
 assert.equal(await matchDispatchIntent([user],'persona',worldDigest,3000),null);
 assert.equal(await matchDispatchIntent([...before,{...user,content:{text:'Continue'}}],'persona',worldDigest,3000),null);
});
test('two devices use the same durable job and reply IDs for one synced message',async()=>{
 const a=await dispatchReceiptSeed('conversation',user),b=await dispatchReceiptSeed('conversation',JSON.parse(JSON.stringify(user)));
 assert.deepEqual(a,b);assert.ok(a);assert.notEqual(a.jobId,a.replyId);
 assert.notDeepEqual(a,await dispatchReceiptSeed('different',user));
 const receipts:TurnReceipt[]=[];let actualCreates=0;const seen=new Set<string>();
 const make=()=>{const storage=new Map<string,string>();return createDurableChatTurn({storage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{storage.set(k,v)},removeItem:k=>{storage.delete(k)}},history:{read:()=>history,persistUser:async()=>{},persistReply:async()=>{},confirmReply:async()=>{}},receiptSeed:async()=>a,lock:async work=>work(),transport:{submit:async(id,_payload,r)=>{if(!seen.has(id)){seen.add(id);actualCreates++;}receipts.push(r!);return {job_id:id,status:'queued'};},get:async id=>({job_id:id,status:'queued'})}});};
 const identity={conversationKey:'conversation',personaKey:'persona',userMessageId:user.id!,contextDigestVersion:2 as const,contextDigest:await digestVpsHistory(history,2),worldDigest};
 const request={workflow_version:1 as const,primary:{model:'glm-5-3-flash-uncensored',messages:[{role:'user' as const,content:'Continue'}]},review:{model:'glm-5-3-flash-uncensored',messages:[{role:'user' as const,content:'Review'}]}};
 await Promise.all([make().submit(identity,request),make().submit(identity,request)]);
 assert.equal(actualCreates,1);assert.deepEqual(receipts[0],receipts[1]);
});
