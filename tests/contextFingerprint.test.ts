import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {digestVpsHistory} from '../vpsChatMode.js';
import {digestGroupContext} from '../durableGroupTurn.js';
import {canonicalContextJson} from '../contextFingerprint.js';
import {MemoryManager,type ChatMessage} from '../managers.js';
import {RoomManager} from '../roomManager.js';
import {SupabaseCloudSyncManager} from '../supabaseCloudSync.js';
import {createDurableChatTurn,type TurnReceipt} from '../durableChatTurn.js';
import {createGenerationHandler} from '../server/generationJobs.js';
import {buildVpsWorkflowPayload} from '../vpsWorkflow.js';
const reverseKeys=(v:any):any=>Array.isArray(v)?v.map(reverseKeys):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reverseKeys(v[k])])):v;
const rows:ChatMessage[]=[{role:'user',content:{text:'Hello',roomSceneBeforeTurn:{presentMemberIds:['a','b']} as any}},{id:'fixture-photo',role:'model',createdAt:5,content:{imageAssetId:'asset-1',imageUrl:'blob:fixture',text:'Photo'}},{id:'12345678-1234-4234-8234-123456789ab3',createdAt:8,role:'user',content:{text:'Next'}}];
test('canonical fingerprints retain values and array order; legacy defaults unchanged',async()=>{
 const reordered=reverseKeys(rows);
 assert.notEqual(await digestVpsHistory(rows),await digestVpsHistory(reordered));
 // Legacy ID fallback is deliberately based on original cloud projection, so reorder existing IDs only.
 assert.equal(await digestVpsHistory(rows.slice(1),2),await digestVpsHistory(reordered.slice(1),2));
 const b=structuredClone(rows.slice(1));b[1].content.text='Changed';assert.notEqual(await digestVpsHistory(rows.slice(1),2),await digestVpsHistory(b,2));
 assert.notEqual(await digestVpsHistory(rows.slice(1),2),await digestVpsHistory(rows.slice(1).reverse(),2));
 const c=structuredClone(rows);c[0].content.roomSceneBeforeTurn!.presentMemberIds.reverse();assert.notEqual(await digestVpsHistory(rows,2),await digestVpsHistory(c,2));
 const d=structuredClone(rows);d[1].content.imageAssetId='asset-2';assert.notEqual(await digestVpsHistory(rows,2),await digestVpsHistory(d,2));
 const e=structuredClone(rows);delete e[1].content.imageAssetId;const f=structuredClone(e);delete f[1].content.imageUrl;assert.notEqual(await digestVpsHistory(e,2),await digestVpsHistory(f,2));
});
test('actual cloud projection and restore plus JSONB-style reorder preserve V2 history fingerprint',async()=>{
 const map=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k)}});
 const m=new MemoryManager(),rm=new RoomManager();m.setChatHistory('fixture',rows,true);
 const sync=new SupabaseCloudSyncManager(m,rm,{onStateChange:()=>{},onRemoteApplied:()=>{}}) as any;
 const before=await digestVpsHistory(m.peekChatHistory('fixture'),2);
 const exported=sync.collectLocalMessages('fixture-user').messages;
 assert.equal(exported.length,3);assert.equal(exported[1].content.imageUrl,undefined);
 await sync.applyRemoteData({schemaVersion:1,customPersonas:{},diaries:{},interests:{},rooms:{version:2,rooms:[]},appSettings:{}},reverseKeys(exported),false);
 const after=m.peekChatHistory('fixture');assert.equal(after[2].id,rows[2].id);assert.equal(await digestVpsHistory(after,2),before);
});
test('group object reordering and display timestamps do not change V2, real scene and member changes do',async()=>{
 const room:any={id:'room',title:'Fixture',updatedAt:1,members:[{id:'a',persona:{name:'A',avatarUrl:'blob:old',prompt:'fixture'}},{id:'b',persona:{name:'B'}}],scene:{location:'home',presentMemberIds:['a','b']},sharedMemories:[{title:'Tea',summary:'Tea'}]};
 const b=reverseKeys(room);b.updatedAt=2;b.members[0].persona.avatarUrl='data:image/png;base64,fixture';assert.equal(await digestGroupContext(room,2),await digestGroupContext(b,2));assert.notEqual(await digestGroupContext(room),await digestGroupContext(b));
 b.scene.location='park';assert.notEqual(await digestGroupContext(room,2),await digestGroupContext(b,2));b.scene.location='home';b.members.reverse();assert.notEqual(await digestGroupContext(room,2),await digestGroupContext(b,2));
});
test('V1 receipts remain valid; V2 recovery is versioned and rejects unknown version',async()=>{
 const jid='12345678-1234-4234-8234-123456789ab1',rid='12345678-1234-4234-8234-123456789ab2',uid=rows[2].id!;
 const receipt:TurnReceipt={jobId:jid,replyId:rid,userMessageId:uid,conversationKey:'fixture',personaKey:'fixture',model:'glm-5-3-flash-uncensored',createdAt:1234,workflowVersion:1,contextDigest:'a'.repeat(64)};
 const map=new Map<string,string>();const c=createDurableChatTurn({storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v)},removeItem:k=>{map.delete(k)}},lock:fn=>fn(),history:{read:()=>[rows[2]],persistUser:async()=>{},persistReply:async()=>{},confirmReply:async()=>{}},transport:{submit:async()=>{throw Error('MUST_NOT_POST')},get:async()=>({job_id:jid,status:'queued'})}});
 await c.adoptRecovery(receipt);assert.equal(c.pending()?.contextDigestVersion,undefined);await c.abandon(jid);
 await c.adoptRecovery({...receipt,contextDigestVersion:2});assert.equal(c.pending()?.contextDigestVersion,2);await c.abandon(jid);
 await assert.rejects(c.adoptRecovery({...receipt,contextDigestVersion:3 as any}),/INVALID/);
 const plan=buildVpsWorkflowPayload({model:receipt.model,messages:[{role:'user',content:'Hello'}]},{editorPrompt:'Review',authoritativePrompt:'Synthetic',reviewHistory:[],latestUserMessage:'Hello',promptCacheKey:'wetapp-review-v1-fixture'});
 for(const version of [undefined,2,3]){let calls=0;const res={code:0,setHeader(){},status(n:number){this.code=n;return this},json(){return this}};const handler=createGenerationHandler({env:{APP_SESSION_SECRET:'fixture-secret',AIGF_VPS_QUEUE_ENABLED:'1',AIGF_VPS_QUEUE_URL:'https://fixture.invalid/',AIGF_VPS_QUEUE_TOKEN:'x'.repeat(64)},authenticate:()=>true,fetchImpl:async(_u,o)=>{calls++;assert.equal(JSON.parse(String(o?.body)).recovery.receipt.contextDigestVersion,version);return new Response(JSON.stringify({job_id:jid,status:'queued'}));}});await handler({method:'POST',body:{job_id:jid,request:plan,recovery_receipt:{...receipt,contextDigestVersion:version}}},res);assert.equal(res.code,version===3?400:202);assert.equal(calls,version===3?0:1);}
});
