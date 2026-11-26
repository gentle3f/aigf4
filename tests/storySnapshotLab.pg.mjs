import 'fake-indexeddb/auto';
import {MemoryManager} from '../managers.js';
import {createDurableChatTurn} from '../durableChatTurn.js';
import {createNativeStoryCheckpointBridge} from '../nativeStoryCheckpointBridge.js';
import {digestVpsHistory} from '../vpsChatMode.js';
import {PGlite} from '../tmp/sync-lab/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createStoryCheckpointSession} from '../storyCheckpointSession.js';
import {captureStorySnapshot,restoreStorySnapshot} from '../storySnapshotLab.js';
import {makeWorldline,recordWorldlineTurn,updateWorldlineRegistry,WORLDLINE_SETTING_KEY} from '../worldline.js';
import {emptyLedger,appendWorldBatches,parseWorldExtraction,WORLD_LEDGER_KEY} from '../worldLedger.js';
import {saveDirector} from '../worldlineDirector.js';
import {saveWorldline2Fixed,saveWorldline2Variable} from '../worldline2Prompt.js';
const db=new PGlite();
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const boot=readFileSync(new URL('../supabase/NEW_PROJECT_BOOTSTRAP.sql',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/experimental/wetapp_append_chat_checkpoint_v2.sql',import.meta.url),'utf8')+'\n'+readFileSync(new URL('../supabase/experimental/wetapp_story_checkpoint_lab.sql',import.meta.url),'utf8');
const ddl=boot.slice(boot.indexOf('create table if not exists public.wetapp_profiles'),boot.indexOf('create index if not exists wetapp_messages_conversation_position_idx'));
const policies=boot.slice(boot.indexOf('alter table public.wetapp_profiles enable row level security'),boot.indexOf('insert into storage.buckets'));
const row=(n,pos,role,text)=>({message_id:'20000000-0000-4000-8000-'+String(n).padStart(12,'0'),position:pos,role,speaker_id:null,content:{text},created_at_ms:1000+n});
const first=row(1,0,'user','Synthetic baseline'),a=row(2,1,'model','A reply'),b=row(3,2,'user','B next');
const state=async()=>{const r=await db.query("select revision,payload from public.wetapp_state where user_id=$1",[owner]);const m=await db.query("select message_id,position,role,speaker_id,content,created_at_ms from public.wetapp_messages where user_id=$1 and conversation_key='fixture' order by position",[owner]);const c=await db.query("select message_count from public.wetapp_conversations where user_id=$1 and conversation_key='fixture'",[owner]);return {revision:Number(r.rows[0]?.revision),payload:r.rows[0]?.payload,rows:m.rows.map(x=>({...x,created_at_ms:Number(x.created_at_ms)})),count:c.rows[0]?.message_count};};
const call=(rev,expected,append,payload={marker:'new'},device='device-a')=>db.query('select public.wetapp_append_chat_checkpoint_v1($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6) as revision',[rev,'fixture',JSON.stringify(expected),JSON.stringify(append),JSON.stringify(payload),device]);
let passed=0;
async function check(label,fn){await fn();passed++;console.log('PASS '+label);}
try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('fixture.uid',true),'')::uuid $$;create function public.is_wetapp_owner() returns boolean language sql stable as $$select current_setting('fixture.owner',true)='yes'$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;grant execute on function public.is_wetapp_owner() to authenticated;`);
 await db.exec(ddl+policies+sql);
 await db.query("insert into auth.users(id,email) values($1,'fixture-a@example.invalid'),($2,'fixture-b@example.invalid')",[owner,other]);
 await db.query("insert into public.wetapp_state(user_id,payload,revision) values($1,'{\"marker\":\"baseline\"}',1),($2,'{}',1)",[owner,other]);
 await db.query("insert into public.wetapp_conversations(user_id,conversation_key,message_count) values($1,'fixture',1),($2,'fixture',0)",[owner,other]);
 await db.query("insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,content,created_at_ms) values($1,'fixture',$2,0,'user',$3::jsonb,$4)",[owner,first.message_id,JSON.stringify(first.content),first.created_at_ms]);
 await db.exec("set role authenticated;set fixture.uid='"+owner+"';set fixture.owner='yes';");

 const head=async()=> (await db.query("select public.wetapp_chat_checkpoint_head_v2('fixture') as head")).rows[0].head;
 const append=(h,m)=>db.query("select public.wetapp_append_chat_checkpoint_v2($1,'fixture',$2,$3,$4::jsonb,'fixture-device') as revision",[h.revision,h.sha256,h.count,JSON.stringify(m)]);


 const read=async()=>(await db.query("select public.wetapp_story_checkpoint_read_lab('fixture','worldline2') as result")).rows[0].result;
 const commit=async(h,rows,recall,snap)=>db.query("select public.wetapp_story_checkpoint_commit_lab('fixture','worldline2',$1,$2,$3,$4::jsonb,$5,$6::jsonb,'device-a') as revision",[h.revision,h.sha256,h.count,JSON.stringify(rows),recall,JSON.stringify(snap)]);
 const restoreHistory=async()=> (await state()).rows.map(r=>({id:r.message_id,createdAt:r.created_at_ms,role:r.role,speakerId:r.speaker_id||undefined,content:r.content}));
 let writes=0,loseResponse=false;
 const transport={read:async()=>read(),page:async(_key,offset,limit)=>(await state()).rows.slice(offset,offset+limit),commit:async(req)=>{
  writes++;await commit(req.head,req.append,req.recall,req.snapshot);
  if(loseResponse)throw Error('SIMULATED_LOST_RESPONSE');
  return (await read()).head.revision;
 }};
 const session=(store,history)=>createStoryCheckpointSession({site:'worldline2',storage:store,transport,history:()=>history(),capture:()=>captureStorySnapshot(store,'fixture',history()),deviceId:'lab-device',lock:fn=>fn()});
 const device=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
 const phone=device(),pc=device(),fresh=device();
 const key='fixture';
 const reply={...a,content:{text:'旅人取得青石。',worldlineStoryTurn:true}};
 const history=await restoreHistory();
 const w=makeWorldline(key,{title:'古塔',genre:'fantasy',premise:'尋找遺物'},1000);
 phone.setItem(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(null,key,recordWorldlineTurn(w,first.content.text,reply.content.text,1010,reply.message_id),1011)));
 const proposed=[...history,{id:reply.message_id,role:'model',createdAt:reply.created_at_ms,content:reply.content}];
 const obs=[{sourceId:reply.message_id,quote:'取得青石',kind:'inventory',subject:'旅人',key:'石頭',value:'青石',state:'established'}];
 phone.setItem(WORLD_LEDGER_KEY,JSON.stringify(appendWorldBatches(emptyLedger(),key,parseWorldExtraction(JSON.stringify({observations:obs}),proposed,1011),proposed)));
 saveDirector(phone,key,'standing','繁體中文',()=> 'note-a');saveWorldline2Fixed(phone,key,'固定寫作設定');saveWorldline2Variable(phone,key,1,'當輪情景');
 let old,phoneHistory=history,pcHistory;
 const phoneSync=session(phone,()=>phoneHistory),pcSync=session(pc,()=>pcHistory);
 await check('actual Worldline snapshot committed to SQL and restored on second device',async()=>{
  const snapshot=await captureStorySnapshot(phone,key,proposed);
  assert.equal(snapshot.record.world.turnCount,1);
  const baseline=await phoneSync.begin(key,true);phoneHistory=proposed;
  loseResponse=true;await assert.rejects(phoneSync.commit(baseline,{kind:'reply',id:reply.message_id,userId:first.message_id}),/SIMULATED_LOST_RESPONSE/);loseResponse=false;
  assert.equal(writes,1);assert.equal(await phoneSync.recover(),'confirmed');assert.equal(writes,1);assert.equal(phoneSync.pending(),null);
  const remote=await read();const h=await restoreHistory();
  assert.equal(await restoreStorySnapshot(pc,key,h,remote.snapshot),'restored');
  assert.deepEqual(await captureStorySnapshot(pc,key,h),snapshot);old=remote;pcHistory=h;
 });
 await check('recall atomically removes actual world evidence and variable override, stale result refused',async()=>{
  const rolled=await captureStorySnapshot(pc,key,[]);
  assert.equal(rolled.record.world.turnCount,0);assert.equal(rolled.prompt.variableOverride,undefined);
  const baseline=await pcSync.begin(key);pcHistory=[];
  assert.equal(await pcSync.commit(baseline,{kind:'recall',userId:first.message_id}),'confirmed');assert.equal(writes,2);
  const remote=await read();assert.equal(remote.head.count,0);assert.equal((await restoreHistory()).length,0);
  await restoreStorySnapshot(fresh,key,[],remote.snapshot);
  assert.deepEqual(await captureStorySnapshot(fresh,key,[]),rolled);assert.equal(rolled.prompt.fixedPrompt,'固定寫作設定');assert.equal(Object.keys(rolled.ledger).length,0);
  await assert.rejects(commit(old.head,[b],null,old.snapshot),/REVISION_CONFLICT/);
  await assert.rejects(restoreStorySnapshot(device(),key,[],old.snapshot),/HISTORY_MISMATCH/);
 });
 await check('new user sync, second-device accepted reply, and stale baseline rejection use same session',async()=>{
  let freshHistory=[];
  const firstDevice=session(fresh,()=>freshHistory);
  const prior=await firstDevice.begin(key);
  const nextUser={id:b.message_id,role:'user',createdAt:b.created_at_ms,content:{text:'進入新村落'}};
  freshHistory=[nextUser];
  assert.equal(await firstDevice.commit(prior,{kind:'user',id:nextUser.id}),'confirmed');assert.equal(writes,3);
  const nextDevice=device(),remote=await read();let nextHistory=await restoreHistory();
  await restoreStorySnapshot(nextDevice,key,nextHistory,remote.snapshot);
  const secondDevice=session(nextDevice,()=>nextHistory),base=await secondDevice.begin(key);
  const resultId=row(8,1,'model','新回覆').message_id;
  const newReply={id:resultId,role:'model',createdAt:1100,content:{text:'旅人見到新村落。',worldlineStoryTurn:true}};
  const current=remote.snapshot.record.world;
  nextDevice.setItem(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(nextDevice.getItem(WORLDLINE_SETTING_KEY),key,recordWorldlineTurn(current,nextUser.content.text,newReply.content.text,1110,resultId),1111)));
  nextHistory=[...nextHistory,newReply];
  assert.equal(await secondDevice.commit(base,{kind:'reply',id:resultId,userId:nextUser.id}),'confirmed');assert.equal(writes,4);
  await assert.rejects(firstDevice.commit(prior,{kind:'user',id:nextUser.id}),/BASELINE_CHANGED/);
  const confirmed=await read();assert.equal(confirmed.snapshot.record.world.turnCount,1);assert.equal(confirmed.head.count,2);
  assert.deepEqual((await restoreHistory()).map(m=>m.id),[nextUser.id,resultId]);
 });
 await check('real native chat controller and MemoryManager sync user before VPS POST, then recover committed reply exactly once',async()=>{
  const store=device(),remote=await read(),initial=await restoreHistory();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:store});
  let manager=new MemoryManager();manager.setChatHistory(key,initial,true);
  await restoreStorySnapshot(store,key,initial,remote.snapshot);
  const u=row(20,2,'user','Native chat user'),jobId=row(21,0,'model','').message_id,replyId=row(22,0,'model','').message_id;
  const calls=[];
  const queue={submit:async id=>{calls.push('POST');assert.equal((await read()).head.count,3);return {job_id:id,status:'queued'};},get:async id=>{calls.push('GET');return {job_id:id,status:'done',result:{choices:[{message:{content:'旅人走入村落。'}}]}};}};
  const make=()=>{
   const bridge=createNativeStoryCheckpointBridge({key,site:'worldline2',storage:store,transport,deviceId:'native-test',lock:fn=>fn(),capture:k=>captureStorySnapshot(store,k,manager.peekChatHistory(k)),history:{
    read:k=>manager.peekChatHistory(k),
    persistUser:async t=>manager.persistVpsChatTurnUser(t.conversationKey,t.userMessageId),
    persistReply:async(r,text)=>manager.persistVpsChatTurnReply(r.conversationKey,r.userMessageId,r.replyId,{text,worldlineStoryTurn:true}),
    confirmReply:async r=>{manager.confirmVpsChatTurnMessage(r.conversationKey,r.replyId,'model');const s=await captureStorySnapshot(store,key,manager.peekChatHistory(key));const w=s.record.world;if(!w.chronicle.some(c=>c.sourceMessageId===r.replyId)){const last=manager.peekChatHistory(key).at(-1);store.setItem(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(store.getItem(WORLDLINE_SETTING_KEY),key,recordWorldlineTurn(w,u.content.text,last.content.text,last.createdAt,r.replyId),last.createdAt)));}}
   }});
   const ids=[jobId,replyId];return {bridge,controller:createDurableChatTurn({storage:store,history:bridge.history,transport:queue,lock:fn=>fn(),newId:()=>ids.shift()})};
  };
  let {bridge,controller}=make();await bridge.beforeUser(u.message_id);
  manager.setChatHistory(key,[...initial,{id:u.message_id,role:'user',createdAt:u.created_at_ms,content:u.content}],true);
  const turn={conversationKey:key,personaKey:key,userMessageId:u.message_id,contextDigestVersion:2,contextDigest:await digestVpsHistory(manager.peekChatHistory(key),2),worldDigest:'a'.repeat(64)};
  await controller.submit(turn,{model:'glm-5-3-flash-uncensored',messages:[{role:'user',content:'Native chat user'}]});
  assert.deepEqual(calls,['POST']);
  manager=new MemoryManager();({bridge,controller}=make());const pending=await controller.resume();
  loseResponse=true;await assert.rejects(controller.apply(pending.receipt,pending.job,'旅人走入村落。'),/SIMULATED_LOST_RESPONSE/);loseResponse=false;
  assert.ok(controller.pending());
  manager=new MemoryManager();({bridge,controller}=make());assert.equal(await controller.reconcileApplied(),true);
  assert.equal(controller.pending(),null);assert.deepEqual(calls,['POST','GET']);
  const final=await read();assert.equal(final.head.count,4);assert.equal(final.snapshot.record.world.turnCount,2);assert.equal((await restoreHistory()).filter(m=>m.id===replyId).length,1);
  assert.equal(writes,6);
 });
 await check('director and fixed/variable settings sync without changing message history; stale device cannot overwrite',async()=>{
  const local=device();let h=await restoreHistory();const before=await read();
  await restoreStorySnapshot(local,key,h,before.snapshot);
  const a=session(local,()=>h);const baseline=await a.begin(key);
  saveDirector(local,key,'standing','測試設定',()=> 'setting-new');saveWorldline2Fixed(local,key,'新的固定測試規則');
  const turn=(await captureStorySnapshot(local,key,h)).record.world.turnCount;
  saveWorldline2Variable(local,key,turn,'新的變數測試');
  assert.equal(await a.commit(baseline,{kind:'settings'}),'confirmed');
  const after=await read();assert.equal(after.head.count,before.head.count);assert.equal(after.head.sha256,before.head.sha256);assert.equal(after.head.revision,before.head.revision+1);
  const b=device();await restoreStorySnapshot(b,key,h,after.snapshot);
  assert.equal((await captureStorySnapshot(b,key,h)).prompt.fixedPrompt,'新的固定測試規則');
  assert.equal((await captureStorySnapshot(b,key,h)).prompt.variableOverride.text,'新的變數測試');
  await assert.rejects(a.commit(baseline,{kind:'settings'}),/BASELINE_CHANGED/);
 });
 await check('evidence-linked ledger-only checkpoint restores on second device; stale extraction cannot survive recall',async()=>{
  const a=device(),b=device();let h=await restoreHistory(),other=h.slice();const prior=await read();
  await restoreStorySnapshot(a,key,h,prior.snapshot);await restoreStorySnapshot(b,key,other,prior.snapshot);
  const x=session(a,()=>h),y=session(b,()=>other),baseline=await x.begin(key),stale=await y.begin(key);
  const latest=h.at(-1),sourceId=latest.id;
  const batch=parseWorldExtraction(JSON.stringify({observations:[{sourceId,quote:'走入村落',kind:'location',subject:'旅人',key:'location',value:'村落',state:'established'}]}),[latest],1200);
  a.setItem(WORLD_LEDGER_KEY,JSON.stringify(appendWorldBatches(a.getItem(WORLD_LEDGER_KEY),key,batch,h)));
  assert.equal(await x.commit(baseline,{kind:'settings'}),'confirmed');
  const after=await read();assert.equal(after.head.sha256,prior.head.sha256);assert.equal(after.head.count,prior.head.count);assert.equal(after.snapshot.ledger[sourceId].observations[0].value,'村落');
  const fresh=device();await restoreStorySnapshot(fresh,key,h,after.snapshot);
  assert.deepEqual((await captureStorySnapshot(fresh,key,h)).ledger,after.snapshot.ledger);
  await assert.rejects(y.commit(stale,{kind:'settings'}),/BASELINE_CHANGED/);
  const base=await x.begin(key);const user=h.at(-2);h=h.slice(0,-2);
  assert.equal(await x.commit(base,{kind:'recall',userId:user.id}),'confirmed');
  assert.equal((await read()).snapshot.ledger[sourceId],undefined);
  await assert.rejects(x.commit(base,{kind:'settings'}),/BASELINE_CHANGED/);
 });
 console.log('WORLDLINE2_STORY_SQL_PASS '+passed+'/6');
}catch(e){console.error('LAB_ERROR',e?.message,e?.code,e?.detail);process.exitCode=1;}finally{await db.close();}
