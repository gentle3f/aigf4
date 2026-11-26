import {PGlite} from '../tmp/sync-lab/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
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
 let old;
 await check('actual Worldline snapshot committed to SQL and restored on second device',async()=>{
  const snapshot=await captureStorySnapshot(phone,key,proposed);
  assert.equal(snapshot.record.world.turnCount,1);await commit(await head(),[reply],null,snapshot);
  const remote=await read();const h=await restoreHistory();
  assert.equal(await restoreStorySnapshot(pc,key,h,remote.snapshot),'restored');
  assert.deepEqual(await captureStorySnapshot(pc,key,h),snapshot);old=remote;
 });
 await check('recall atomically removes actual world evidence and variable override, stale result refused',async()=>{
  const rolled=await captureStorySnapshot(pc,key,[]);
  assert.equal(rolled.record.world.turnCount,0);assert.equal(rolled.prompt.variableOverride,undefined);
  await commit(old.head,[],first.message_id,rolled);
  const remote=await read();assert.equal(remote.head.count,0);assert.equal((await restoreHistory()).length,0);
  await restoreStorySnapshot(fresh,key,[],remote.snapshot);
  assert.deepEqual(await captureStorySnapshot(fresh,key,[]),rolled);assert.equal(rolled.prompt.fixedPrompt,'固定寫作設定');assert.equal(Object.keys(rolled.ledger).length,0);
  await assert.rejects(commit(old.head,[b],null,old.snapshot),/REVISION_CONFLICT/);
  await assert.rejects(restoreStorySnapshot(device(),key,[],old.snapshot),/HISTORY_MISMATCH/);
 });
 console.log('WORLDLINE2_STORY_SQL_PASS '+passed+'/2');
}catch(e){console.error('LAB_ERROR',e?.message,e?.code,e?.detail);process.exitCode=1;}finally{await db.close();}
