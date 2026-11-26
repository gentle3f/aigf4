import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseCloudSyncManager} from '../supabaseCloudSync.js';
import {MemoryManager} from '../managers.js';
import {RoomManager} from '../roomManager.js';
import {readCloudSyncIndex,writeCloudSyncIndexesAtomically} from '../cloudSyncIndexStore.js';
import {readAtomicBaseline,saveAtomicBaseline,pendingAtomicJournal,planAtomicDelta} from '../atomicCloudDelta.js';
import {mergeBaseIndex,readMergeBase} from '../atomicCloudMerge.js';
const pending='wetappCloudPendingV1',messageIndex='wetappCloudMessageIndexV1',convIndex='wetappCloudConversationIndexV1',mediaIndex='wetappCloudMediaIndexV1',stateIndex='wetappCloudStateEntityIndexV1';
const id='fixture-room\u0000old';
const payload={schemaVersion:1,customPersonas:{},diaries:{},interests:{},rooms:{version:2,rooms:[]},appSettings:{}};
async function fixture(uid:string,base=7){
 const m=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>m.set(k,String(v)),removeItem:(k:string)=>m.delete(k)}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true,locks:{request:async(_name:string,fn:()=>Promise<unknown>)=>fn()}}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{setTimeout,clearTimeout})});
 Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{visibilityState:'visible'})});
 await writeCloudSyncIndexesAtomically({[messageIndex]:{[id]:'old-hash'},[convIndex]:{'fixture-room':'1'},[mediaIndex]:{},[stateIndex]:{}});
 await saveAtomicBaseline(uid,base);
 const sync=new SupabaseCloudSyncManager(new MemoryManager(),new RoomManager(),{onStateChange:()=>{},onRemoteApplied:()=>{}},false,()=>true,true);
 const x=sync as any;const receipts=new Map<string,number>(),calls:string[]=[];
 let rev=base,lose=false,readFail=false;
 x.session={user:{id:uid,email:'fixture@example.invalid'}};
 x.schedulePush=()=>{};x.schedulePull=()=>{};x.buildStatePayload=async()=>payload;
 x.collectLocalMedia=async()=>[];
 x.collectLocalMessages=()=>({conversations:[{conversation_key:'fixture-room',title:'Room',kind:'room'}],messages:[{conversation_key:'fixture-room',message_id:'old',position:0,role:'user',speaker_id:null,content:{text:'old'},created_at_ms:1},{conversation_key:'fixture-room',message_id:'new',position:1,role:'model',speaker_id:'npc',content:{text:'new'},created_at_ms:2}],hashes:{[id]:'old-hash',['fixture-room\u0000new']:'new-hash'}});
 x.readCloudStateHead=async()=>({revision:rev,sourceDeviceId:'device'});
 x.client={from:(table:string)=>{assert.equal(table,'wetapp_chat_delta_receipts_v3');let op='';const chain={select:()=>chain,eq:(k:string,v:string)=>{if(k==='operation_id')op=v;return chain;},maybeSingle:async()=>{calls.push('GET');if(readFail)throw Error('offline read');return {data:receipts.has(op)?{revision:receipts.get(op)}:null,error:null};}};return chain;},rpc:async(name:string,req:any)=>{calls.push('POST');assert.equal(name,'wetapp_commit_chat_delta_receipted_v3');assert.equal(req.expected_revision,rev);assert.equal(req.delta.messages.length,1);assert.equal(req.delta.messages[0].message_id,'new');rev++;receipts.set(req.operation_id,rev);if(lose){readFail=true;throw Error('lost response');}return {data:rev,error:null};}};
 m.set(pending,'true');
 return {x,m,calls,lose:()=>lose=true,online:()=>{readFail=false;lose=false;},advance:()=>rev++};
}
test('actual manager commits a delta through one RPC and only updates indexes after confirmed revision',async()=>{
 const f=await fixture('atomic-1');assert.equal(await f.x.pushLocalToCloud(),true);assert.deepEqual(f.calls,['GET','POST']);
 assert.equal(await readAtomicBaseline('atomic-1'),8);assert.equal(await pendingAtomicJournal('atomic-1'),null);
 assert.equal((await readCloudSyncIndex(messageIndex))['fixture-room\u0000new'],'new-hash');assert.equal(f.m.has(pending),false);
});
test('lost response leaves original indexes and durable journal; next invocation checks GET only',async()=>{
 const f=await fixture('atomic-2');f.lose();assert.equal(await f.x.pushLocalToCloud(),false);
 assert.ok(await pendingAtomicJournal('atomic-2'));assert.deepEqual(await readCloudSyncIndex(messageIndex),{[id]:'old-hash'});
 f.online();assert.equal(await f.x.pushLocalToCloud(),true);assert.deepEqual(f.calls,['GET','POST','GET','GET']);
 assert.equal(await readAtomicBaseline('atomic-2'),8);assert.equal(await pendingAtomicJournal('atomic-2'),null);assert.equal(f.m.get(pending),'true');
});
test('stale baseline and new media both refuse all cloud mutations',async()=>{
 const f=await fixture('atomic-3');f.advance();assert.equal(await f.x.pushLocalToCloud(),false);assert.deepEqual(f.calls,[]);assert.equal(f.m.get(pending),'true');
 const g=await fixture('atomic-4');g.x.collectLocalMedia=async()=>[{asset_id:'photo',signature:'new'}];assert.equal(await g.x.pushLocalToCloud(),false);assert.deepEqual(g.calls,[]);assert.equal(await pendingAtomicJournal('atomic-4'),null);
});
test('whole conversation deletion does not include contradictory individual row deletes',()=>{
 const d=planAtomicDelta([],[],{}, {'a\u0000x':'1','b\u0000y':'2'},{a:'1'});
 assert.deepEqual(d.remove_conversations,['a']);assert.deepEqual(d.remove_messages,[{conversation_key:'b',message_id:'y'}]);
});

test('manager stages a stable three-way conflict plan without remote writes or local replacement',async()=>{
 const uid='atomic-merge-plan-1',f=await fixture(uid);
 const local=f.x.collectLocalMessages(),base={conversations:local.conversations,messages:local.messages.slice(0,1),payload};
 await saveAtomicBaseline(uid,7,mergeBaseIndex(uid,7,base));
 f.advance();
 const other={conversation_key:'other',title:'Other',kind:'persona'};
 const remoteMessage={conversation_key:'other',message_id:'other-u',position:0,role:'user',speaker_id:null,content:{text:'remote'},created_at_ms:3};
 f.x.client.from=(table:string)=>{assert.equal(table,'wetapp_state');const chain={select:()=>chain,maybeSingle:async()=>({data:{revision:8,payload},error:null})};return chain;};
 f.x.fetchAllRows=async(table:string)=>table==='wetapp_conversations'?[...base.conversations,other]:table==='wetapp_messages'?[...base.messages,remoteMessage]:[];
 assert.equal(await f.x.pushLocalToCloud(),false);
 const plan=await readCloudSyncIndex('wetappAtomicMergePlanV3:'+uid);
 assert.equal(plan.remoteRevision,'8');assert.equal(JSON.parse(plan.merged).messages.length,3);
 assert.equal(JSON.parse(plan.local).messages.length,2);assert.equal(JSON.parse(plan.remote).messages.length,2);
 assert.deepEqual(f.calls,[]);assert.equal(await pendingAtomicJournal(uid),null);
 assert.equal(await readAtomicBaseline(uid),7);assert.equal((await readMergeBase(uid,7))!.messages.length,1);
 assert.equal(f.m.get(pending),'true');
});
