import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {SupabaseCloudSyncManager} from '../supabaseCloudSync.js';
import {MemoryManager} from '../managers.js';
import {RoomManager} from '../roomManager.js';
import {readCloudSyncIndex,writeCloudSyncIndexesAtomically} from '../cloudSyncIndexStore.js';
import {readAtomicBaseline,saveAtomicBaseline,pendingAtomicJournal,planAtomicDelta,prepareAtomicJournal,retireStaleAtomicJournal} from '../atomicCloudDelta.js';
import {mergeBaseIndex,readMergeBase,equalMergeSnapshot} from '../atomicCloudMerge.js';
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
 const initial=x.collectLocalMessages();await saveAtomicBaseline(uid,base,mergeBaseIndex(uid,base,{conversations:initial.conversations,messages:initial.messages.slice(0,1),payload}));
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

async function mergeFixture(uid:string){
 const f=await fixture(uid);
 const original=f.x.collectLocalMessages(),base={conversations:original.conversations,messages:original.messages.slice(0,1),payload};
 await saveAtomicBaseline(uid,7,mergeBaseIndex(uid,7,base));
 f.advance();
 const other={conversation_key:'other',title:'Other',kind:'persona'};
 const remoteMessage={conversation_key:'other',message_id:'other-u',position:0,role:'user',speaker_id:null,content:{text:'remote'},created_at_ms:3};
 const previousFrom=f.x.client.from;
 f.x.client.from=(table:string)=>{if(table!=='wetapp_state')return previousFrom(table);const chain={select:()=>chain,maybeSingle:async()=>({data:{revision:8,payload},error:null})};return chain;};
 f.x.fetchAllRows=async(table:string)=>table==='wetapp_conversations'?[...base.conversations,other]:table==='wetapp_messages'?[...base.messages,remoteMessage]:[];
 let current=structuredClone(original);
 f.x.collectLocalMessages=()=>current;
 let installs=0;
 f.x.createCloudPullTransactionSnapshot=async()=>structuredClone(current);
 f.x.rollbackCloudPullTransaction=async(s:any)=>{current=s;};
 f.x.applyRemoteData=async(_payload:any,rows:any[],_merge:boolean,conversations:any[])=>{installs++;current={conversations,messages:rows,hashes:{}};};
 return {...f,base,original,current:()=>current,installs:()=>installs,change:()=>{current.messages.push({conversation_key:'fixture-room',message_id:'later',position:2,role:'user',speaker_id:null,content:{text:'later'},created_at_ms:4});}};
}
test('manager commits and installs three-way merge, then publishes indexes',async()=>{
 const uid='atomic-merge-1',f=await mergeFixture(uid);
 assert.equal(await f.x.pushLocalToCloud(),true);
 assert.deepEqual(f.calls,['GET','POST']);assert.equal(f.installs(),1);
 assert.equal(f.current().messages.length,3);
 assert.equal(await pendingAtomicJournal(uid),null);assert.equal(await readAtomicBaseline(uid),9);
 assert.equal((await readMergeBase(uid,9))!.messages.length,3);
 assert.equal(f.m.has(pending),false);
});
test('confirmed merge with lost response resumes with GET only and installs once',async()=>{
 const uid='atomic-merge-2',f=await mergeFixture(uid);f.lose();
 assert.equal(await f.x.pushLocalToCloud(),false);assert.equal(f.installs(),0);
 assert.ok((await pendingAtomicJournal(uid))?.mergeInstall);assert.equal(await readAtomicBaseline(uid),7);
 f.online();assert.equal(await f.x.pushLocalToCloud(),true);
 assert.deepEqual(f.calls,['GET','POST','GET','GET']);assert.equal(f.installs(),1);
 assert.equal(await readAtomicBaseline(uid),9);assert.equal(await pendingAtomicJournal(uid),null);
});
test('new local edit after confirmed merge is not overwritten and receipt stays recoverable',async()=>{
 const uid='atomic-merge-3',f=await mergeFixture(uid);f.lose();
 assert.equal(await f.x.pushLocalToCloud(),false);f.change();f.online();
 assert.equal(await f.x.pushLocalToCloud(),false);assert.equal(f.installs(),0);
 assert.equal(f.current().messages.at(-1)?.message_id,'later');assert.ok((await pendingAtomicJournal(uid))?.mergeInstall);
 assert.equal(await readAtomicBaseline(uid),7);assert.deepEqual(f.calls,['GET','POST','GET','GET']);
});

test('real local managers install verified merge and restore durable messages on reload',async()=>{
 const uid='atomic-real-install',f=await fixture(uid);
 delete f.x.collectLocalMessages;delete f.x.buildStatePayload;
 const mem=f.x.memoryManager as MemoryManager;
 mem.setChatHistory('cc',[{id:'fixture-u',role:'user',createdAt:1000,content:{text:'original'}}],true);
 const local=await f.x.captureAtomicLocal(uid),merged=structuredClone(local);
 const group=merged.messages.filter((r:any)=>r.conversation_key==='cc');
 merged.messages.push({conversation_key:'cc',message_id:'fixture-r',position:group.length,role:'model',speaker_id:null,content:{text:'remote reply'},created_at_ms:1001});
 await f.x.installAtomicMerge(uid,f.x.sessionGeneration,{local,merged});
 assert.ok(equalMergeSnapshot(await f.x.captureAtomicLocal(uid),merged));
 assert.equal(mem.peekChatHistory('cc').at(-1)?.id,'fixture-r');
 const reopened=new MemoryManager();
 assert.equal(reopened.peekChatHistory('cc').at(-1)?.id,'fixture-r');
});

test('stale request retired only after higher revision and confirmed receipt absence',async()=>{
 const uid='atomic-stale-retirement',f=await fixture(uid);
 await prepareAtomicJournal(uid,{expected_revision:7,new_payload:payload,delta:planAtomicDelta([],[],{},{},{}),device:'test'},{});
 assert.equal(await retireStaleAtomicJournal(uid,7,async()=>null,()=>{}),false);
 assert.equal(await retireStaleAtomicJournal(uid,8,async()=>8,()=>{}),false);
 await assert.rejects(retireStaleAtomicJournal(uid,8,async()=>{throw Error('network')},()=>{}),/network/);
 assert.ok(await pendingAtomicJournal(uid));
 assert.equal(await retireStaleAtomicJournal(uid,8,async()=>null,()=>{}),true);
 assert.equal(await pendingAtomicJournal(uid),null);
 assert.equal(await readAtomicBaseline(uid),7);
});

test('manager stages media then commits linked metadata in one receipted delta',async()=>{
 const uid='atomic-media-manager',f=await fixture(uid),blob=new Blob(['image fixture'],{type:'image/webp'}),files=new Map<string,Blob>();
 f.x.collectLocalMedia=async()=>[{asset_id:'character-photo:fixture',conversation_key:'fixture-room',kind:'character_photo',storage_path:'unused-legacy-path',mime_type:blob.type,byte_size:blob.size,signature:'image-v1',metadata:{id:'fixture'},created_at_ms:1000,blob}];
 f.x.client.storage={from:(bucket:string)=>{assert.equal(bucket,'wetapp-private');return {upload:async(path:string,b:Blob,opts:any)=>{assert.equal(opts.upsert,false);f.calls.push('UPLOAD');files.set(path,b);return {error:null};},download:async(path:string)=>{f.calls.push('DOWNLOAD');return {data:files.get(path),error:null};}};}};
 const previousRPC=f.x.client.rpc;
 f.x.client.rpc=async(name:string,req:any)=>{assert.equal(req.delta.media.upsert.length,1);assert.equal(req.delta.media.upsert[0].asset_id,'character-photo:fixture');assert.ok(files.has(req.delta.media.upsert[0].storage_path));assert.equal('blob' in req.delta.media.upsert[0],false);return previousRPC(name,req);};
 assert.equal(await f.x.pushLocalToCloud(),true);
 assert.deepEqual(f.calls,['UPLOAD','DOWNLOAD','GET','POST']);
 assert.deepEqual(await readCloudSyncIndex(mediaIndex),{'character-photo:fixture':'image-v1'});assert.equal(await pendingAtomicJournal(uid),null);
});

test('confirmed remote media removal only removes previously indexed unchanged local assets, rollback restores bytes',async()=>{
 const {saveCharacterPhotoAsset,getCharacterPhotoAsset,deleteCharacterPhotoAsset}=await import('../photoStore.js');
 const uid='atomic-media-delete',f=await fixture(uid),blob=new Blob(['photo bytes'],{type:'image/webp'});
 const id='atomic-remove-fixture',other='atomic-unknown-fixture';
 for(const key of [id,other])await saveCharacterPhotoAsset({id:key,personaKey:'cc',prompt:'fixture',createdAt:1000,blob});
 f.x.collectLocalMedia=async()=>[id,other].map(key=>({asset_id:'character-photo:'+key,kind:'character_photo',signature:'v1',metadata:{id:key},blob}));
 await writeCloudSyncIndexesAtomically({[mediaIndex]:{['character-photo:'+id]:'v1'}});
 const transaction=await f.x.createCloudPullTransactionSnapshot();
 await f.x.pullMedia([],false,transaction);
 assert.equal(await getCharacterPhotoAsset(id),undefined);
 assert.ok(await getCharacterPhotoAsset(other));
 await f.x.rollbackCloudPullTransaction(transaction);
 assert.equal(await (await getCharacterPhotoAsset(id))!.blob.text(),'photo bytes');
 await deleteCharacterPhotoAsset(id);await deleteCharacterPhotoAsset(other);
});

test('ordinary site push preserves unknown cloud settings from confirmed baseline',async()=>{
 const uid='atomic-foreign-settings',f=await fixture(uid),original=f.x.collectLocalMessages();
 const prior={...payload,appSettings:{foreignStorySetting:'keep-me'}};
 await saveAtomicBaseline(uid,7,mergeBaseIndex(uid,7,{conversations:original.conversations,messages:original.messages.slice(0,1),payload:prior}));
 const rpc=f.x.client.rpc;
 f.x.client.rpc=async(name:string,req:any)=>{assert.equal(req.new_payload.appSettings.foreignStorySetting,'keep-me');return rpc(name,req);};
 assert.equal(await f.x.pushLocalToCloud(),true);
 assert.equal((await readMergeBase(uid,8))!.payload && ((await readMergeBase(uid,8))!.payload as any).appSettings.foreignStorySetting,'keep-me');
});

test('first login establishes remote baseline despite startup pending marker',async()=>{
 const f=await fixture('atomic-first-setup'),uid='atomic-first-login';
 f.x.session={user:{id:uid,email:'fixture@example.invalid'}};
 delete f.x.collectLocalMessages;delete f.x.buildStatePayload;delete f.x.collectLocalMedia;
 f.x.roomManager.ensureIuGroupRoom(f.x.memoryManager);
 assert.equal(await readAtomicBaseline(uid),0);
 const row={user_id:uid,conversation_key:'cc',message_id:'first-remote',position:0,role:'user',speaker_id:null,content:{text:'remote message'},created_at_ms:1000};
 const conversation={user_id:uid,conversation_key:'cc',title:'CC',kind:'persona',message_count:1};
 f.x.client.from=(table:string)=>{assert.equal(table,'wetapp_state');const chain={select:()=>chain,maybeSingle:async()=>({data:{revision:3,payload,source_device_id:'remote'},error:null})};return chain;};
 f.x.fetchAllRows=async(table:string)=>table==='wetapp_conversations'?[conversation]:table==='wetapp_messages'?[row]:[];
 await f.x.initialSync(uid,f.x.sessionGeneration);
 assert.equal(await readAtomicBaseline(uid),3);
 assert.equal(f.x.memoryManager.peekChatHistory('cc').at(-1)?.id,'first-remote');
 assert.equal((await readMergeBase(uid,3))!.messages.length,1);
 assert.deepEqual(f.calls,[]);
});
test('first login with real unsynced local chat preserves it and refuses replacement',async()=>{
 const f=await fixture('atomic-first-existing-setup'),uid='atomic-first-existing';
 f.x.session={user:{id:uid,email:'fixture@example.invalid'}};
 f.x.memoryManager.setChatHistory('cc',[{id:'unsynced',role:'user',createdAt:1000,content:{text:'local unsynced'}}],true);
 await f.x.initialSync(uid,f.x.sessionGeneration);
 assert.equal(await readAtomicBaseline(uid),0);
 assert.equal(f.x.memoryManager.peekChatHistory('cc').at(-1)?.id,'unsynced');
 assert.equal(f.m.get(pending),'true');assert.deepEqual(f.calls,[]);
});

const generationJob='00000000-0000-4000-8000-000000000091',generationReply='00000000-0000-4000-8000-000000000092';
function generationFixture(){
 const marker={version:1,jobId:generationJob,replyId:generationReply};
 const plan={workflow_version:1 as const,primary:{model:'fixture',messages:[{role:'user' as const,content:'new'}]},review:{model:'fixture',messages:[]}};
 const admission={job_id:generationJob,reply_id:generationReply,conversation_key:'fixture-room',user_message_id:'new',plan,finalizer_context:{version:1 as const,worldActive:false,single:{personaKey:'fixture',personaName:'Fixture',latestUserMessage:'new',wardrobe:{user:'',characters:{}},wardrobeParticipants:[],establishedNpcNames:[],addressedNpcNames:[],recentCandidateReplies:[],recentReviewReplies:[],requireAttributedNpcSpeech:false}}};
 return {marker,admission};
}
async function withV4(uid:string){
 const f=await fixture(uid),{marker,admission}=generationFixture();
 const original=f.x.collectLocalMessages;
 f.x.collectLocalMessages=()=>{const current=original();current.messages[1]={...current.messages[1],role:'user',speaker_id:null,content:{text:'new',vpsServerGeneration:marker}};return current;};
 const calls:string[]=[];
 const rpc=f.x.client.rpc;
 f.x.client.rpc=async(name:string,req:any)=>{
  calls.push(name);assert.equal(name,'wetapp_accept_generation_v4');assert.equal(req.job_id,generationJob);assert.equal(req.reply_id,generationReply);assert.deepEqual(req.plan,admission.plan);assert.deepEqual(req.finalizer_context,admission.finalizer_context);assert.equal('operation_id' in req,false);
  const {job_id,reply_id,conversation_key,user_message_id,plan,finalizer_context,...args}=req;
  return rpc('wetapp_commit_chat_delta_receipted_v3',{...args,operation_id:job_id});
 };
 return {...f,admission,rpcCalls:calls};
}
test('V4 marked draft cannot escape through normal V3 autosync',async()=>{
 const f=await withV4('atomic-v4-draft');
 assert.equal(await f.x.pushLocalToCloud(),false);assert.deepEqual(f.calls,[]);assert.equal(await pendingAtomicJournal('atomic-v4-draft'),null);
 assert.equal(f.m.get(pending),'true');
 await f.x.admitServerGeneration(f.admission);
 assert.deepEqual(f.rpcCalls,['wetapp_accept_generation_v4']);assert.deepEqual(f.calls,['GET','POST','GET']);assert.equal(await readAtomicBaseline('atomic-v4-draft'),8);
 assert.equal(await pendingAtomicJournal('atomic-v4-draft'),null);
});
test('V4 lost acknowledgement leaves exact immutable plan and deterministic job ID in journal; retry is GET only',async()=>{
 const uid='atomic-v4-lost',f=await withV4(uid);
 f.lose();await assert.rejects(f.x.admitServerGeneration(f.admission),/offline read/);
 const j=await pendingAtomicJournal(uid);assert.equal(j?.request.operation_id,generationJob);assert.deepEqual(j?.generation,f.admission);
 assert.equal(await retireStaleAtomicJournal(uid,9,async()=>null,()=>{}),false);
 f.online();assert.equal(await f.x.pushLocalToCloud(),true);
 assert.deepEqual(f.rpcCalls,['wetapp_accept_generation_v4']);assert.equal(await readAtomicBaseline(uid),8);assert.equal(await pendingAtomicJournal(uid),null);
});
test('V4 stale admission never falls through to V3 merge',async()=>{
 const uid='atomic-v4-stale',f=await withV4(uid);f.advance();
 await assert.rejects(f.x.admitServerGeneration(f.admission),/ATOMIC_GENERATION_BASELINE_CHANGED/);
 assert.deepEqual(f.rpcCalls,[]);assert.equal(await pendingAtomicJournal(uid),null);assert.equal(f.m.get(pending),'true');
});

test('V4 admission tolerates equivalent historical marker with changed legacy hash',async()=>{
 const uid='atomic-v4-historical-marker',f=await withV4(uid);
 const oldMarker={version:1,jobId:'00000000-0000-4000-8000-000000000081',replyId:'00000000-0000-4000-8000-000000000082'};
 const collect=f.x.collectLocalMessages;
 f.x.collectLocalMessages=()=>{const x=collect();x.messages[0].content={vpsServerGeneration:oldMarker,text:'old'};x.hashes[id]='new-key-order';return x;};
 const x=f.x.collectLocalMessages();const baseline=structuredClone(x.messages[0]);baseline.content={text:'old',vpsServerGeneration:oldMarker};
 await saveAtomicBaseline(uid,7,mergeBaseIndex(uid,7,{conversations:x.conversations,messages:[baseline],payload}));
 await f.x.admitServerGeneration(f.admission);assert.deepEqual(f.rpcCalls,['wetapp_accept_generation_v4']);
});
test('V4 recovery moves only positively unsubmitted draft, not existing server job',async()=>{
 const f=await withV4('atomic-v4-recovery');
 let restored=0;f.x.getServerGenerationStatus=async()=>null;
 assert.equal(await f.x.recoverUnsubmittedGeneration(generationJob,()=>restored++),'draft');assert.equal(restored,1);
 f.x.getServerGenerationStatus=async()=> 'queued';
 assert.equal(await f.x.recoverUnsubmittedGeneration(generationJob,()=>restored++),'accepted');assert.equal(restored,1);
});
test('V4 preflight detects stale revision before creating local draft',async()=>{
 const f=await fixture('atomic-v4-preflight');f.m.delete(pending);
 await f.x.preflightServerGeneration();
 f.advance();f.x.reloadFromCloud=async()=>{};
 await assert.rejects(f.x.preflightServerGeneration(),/ATOMIC_GENERATION_BASELINE_CHANGED/);
 assert.deepEqual(f.calls,[]);
});
