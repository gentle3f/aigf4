import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableChatTurn,type TurnReceipt} from '../durableChatTurn.js';
import {listVpsRecovery,readVpsRecoveryText} from '../vpsRecovery.js';
import {buildVpsWorkflowPayload} from '../vpsWorkflow.js';
import {createGenerationHandler} from '../server/generationJobs.js';
const jid='12345678-1234-4234-8234-123456789ab1',rid='12345678-1234-4234-8234-123456789ab2',uid='12345678-1234-4234-8234-123456789ab3';
const receipt:TurnReceipt={jobId:jid,replyId:rid,userMessageId:uid,conversationKey:'fixture',personaKey:'fixture',model:'glm-5-3-flash-uncensored',createdAt:1234,workflowVersion:1,contextDigest:'a'.repeat(64)};
const row={receipt,status:'done' as const,updated:1234};
const result={job_id:jid,status:'done' as const,result:{choices:[{message:{content:'Hello'}}],workflow:{version:1 as const,parts:['Hello'],stages:[{phase:'primary'},{phase:'review-1'}],review:{choices:[{message:{content:'{"decision":"keep","issues":[],"revised_response":""}'}}]}}}};
function fixture(rows:{id:string;role:string}[]=[{id:uid,role:'user'}],rejectContext=false){
 const map=new Map<string,string>(),calls:string[]=[];
 const c=createDurableChatTurn({storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v)},removeItem:k=>{map.delete(k)}},lock:fn=>fn(),history:{read:()=>rows,persistUser:async()=>{if(rejectContext)throw Error('CONTEXT_CHANGED')},persistReply:async(r)=>{rows.push({id:r.replyId,role:'model'})},confirmReply:async()=>{calls.push('CONFIRM')}},transport:{submit:async()=>{throw Error('MUST_NOT_POST')},get:async()=>{calls.push('GET');return result}}});
 return {c,rows,calls};
}
test('fresh device with matching durable history can adopt original reply ID and GET only',async()=>{const f=fixture();assert.equal(await f.c.adoptRecovery(receipt),'adopted');assert.equal(f.c.pending()?.replyId,rid);const resumed=(await f.c.resume())!;assert.equal(await f.c.apply(resumed.receipt,resumed.job,'Hello'),'applied');assert.equal(f.rows.filter(r=>r.id===rid).length,1);assert.deepEqual(f.calls,['GET','CONFIRM']);assert.equal(f.c.pending(),null);});
test('missing history, changed context, later messages, or existing pending block adoption',async()=>{for(const f of [fixture([]),fixture([{id:uid,role:'user'},{id:'new',role:'user'}]),fixture(undefined,true)]){await assert.rejects(f.c.adoptRecovery(receipt));assert.equal(f.c.pending(),null);assert.deepEqual(f.calls,[]);}const f=fixture();await f.c.adoptRecovery(receipt);await assert.rejects(f.c.adoptRecovery(receipt),/PENDING/);});
test('already applied reply not duplicated; confirms existing scene/reply',async()=>{const f=fixture([{id:uid,role:'user'},{id:rid,role:'model'}]);assert.equal(await f.c.adoptRecovery(receipt),'already-applied');assert.equal(f.c.pending(),null);assert.deepEqual(f.calls,['CONFIRM']);});
test('read-only result recovery without local history uses only GET',async()=>{const requests:string[]=[];const fetchImpl=async(u:any,o:any)=>{requests.push(String(u));assert.notEqual(o.method,'POST');return new Response(JSON.stringify(String(u).includes('recovery=1')?{receipts:[row]}:result));};assert.deepEqual(await listVpsRecovery(fetchImpl),[row]);assert.equal(await readVpsRecoveryText(row,fetchImpl),'Hello');assert.equal(requests.length,2);});
test('proxy scope is derived server-side, listing requires app auth and strips unrelated fields',async()=>{
 const plan=buildVpsWorkflowPayload({model:receipt.model,messages:[{role:'user',content:'Hello'}]},{editorPrompt:'Review',authoritativePrompt:'Synthetic',reviewHistory:[],latestUserMessage:'Hello',promptCacheKey:'wetapp-review-v1-fixture'});
 const env={APP_SESSION_SECRET:'fixture-secret',AIGF_VPS_QUEUE_ENABLED:'1',AIGF_VPS_QUEUE_URL:'https://fixture.invalid/',AIGF_VPS_QUEUE_TOKEN:'x'.repeat(64)};
 let scope:string|undefined;let calls=0;
 const request=async(method:string,body:any,query:any,authenticated=true,config=env)=>{
  let value:any;const res={code:0,setHeader(){},status(n:number){this.code=n;return this},json(v:any){value=v;return this}};
  const handler=createGenerationHandler({env:config,authenticate:(_r,res)=>{if(!authenticated)res.status(401).json({error:'Unauthorized'});return authenticated;},fetchImpl:async(u,o)=>{calls++;if(method==='POST'){const p=JSON.parse(String(o?.body));assert.deepEqual(p.recovery.receipt,receipt);assert.match(p.recovery.scope,/^[a-f0-9]{64}$/);scope=p.recovery.scope;return new Response(JSON.stringify({job_id:jid,status:'queued'}));}assert.equal(String(u),'https://fixture.invalid/v1/recovery/'+scope);return new Response(JSON.stringify({receipts:[{...row,secret:'HIDDEN'}]}));}});
  await handler({method,body,query},res);return {code:res.code,value};
 };
 assert.equal((await request('POST',{job_id:jid,request:plan,recovery_receipt:receipt},{ })).code,202);
 assert.equal((await request('GET',undefined,{recovery:'1'},false)).code,401);
 assert.equal((await request('GET',undefined,{recovery:'1'},true,{...env,VERCEL_ENV:'production'} as any)).code,503);
 assert.equal((await request('POST',{job_id:jid,request:plan,recovery_receipt:{...receipt,secret:'x'}},{})).code,400);
 assert.deepEqual((await request('GET',undefined,{recovery:'1'})).value,{receipts:[row]});
 assert.equal(calls,2);
});
