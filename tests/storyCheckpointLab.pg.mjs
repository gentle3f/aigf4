import {PGlite} from '../tmp/sync-lab/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import {createCheckpointV2Session} from '../cloudCheckpointV2.js';
import {digestVpsHistory} from '../vpsChatMode.js';
import assert from 'node:assert/strict';
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

 const snapshot=(turn)=>({world:{turnCount:turn,chronicle:turn?[{sourceMessageId:a.message_id}]:[]},director:{standing:{id:'style',text:'Traditional Chinese'}},prompt:{fixedPrompt:'Preserve style',variableOverride:null}});
 const read=async(site='worldline2')=>(await db.query("select public.wetapp_story_checkpoint_read_lab('fixture',$1) as result",[site])).rows[0].result;
 const commit=async(h,rows,recall,snap,site='worldline2')=>db.query("select public.wetapp_story_checkpoint_commit_lab('fixture',$1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,'device-a') as revision",[site,h.revision,h.sha256,h.count,JSON.stringify(rows),recall,JSON.stringify(snap)]);
 await check('append and per-site story snapshot are atomically stored without changing unrelated payload',async()=>{
  const before=await state();await commit(await head(),[a],null,snapshot(1));
  const actual=await read();assert.equal(actual.head.count,2);assert.deepEqual(actual.snapshot,snapshot(1));assert.equal(actual.stale,false);
  assert.deepEqual((await state()).payload,before.payload);assert.equal((await read('worldline1')).snapshot,null);
 });
 await check('stale receiver cannot append or change the saved snapshot',async()=>{
  const h=await head();const before=await state();const old=await read();await assert.rejects(commit({...h,revision:h.revision-1},[b],null,snapshot(2)),/REVISION_CONFLICT/);assert.deepEqual(await state(),before);assert.deepEqual(await read(),old);
 });
 await check('another site advances shared history; previous site snapshot is invalidated, not silently reused',async()=>{
  await commit(await head(),[b],null,snapshot(2),'worldline1');assert.equal((await read()).stale,true);assert.equal((await read()).snapshot,null);assert.deepEqual((await read('worldline1')).snapshot,snapshot(2));
 });
 await check('cannot recall an earlier user turn while a later user turn exists',async()=>{
  const before=await state();await assert.rejects(commit(await head(),[],first.message_id,snapshot(0)),/RECALL_NOT_LATEST_TURN/);assert.deepEqual(await state(),before);
 });
 await check('recall latest user turn atomically removes tail and invalidates pending old history fingerprint',async()=>{
  const prior=await head();await commit(prior,[],b.message_id,snapshot(1));const after=await read();assert.equal(after.head.count,2);assert.deepEqual(after.snapshot,snapshot(1));assert.equal((await read('worldline1')).stale,true);
  await assert.rejects(commit(prior,[row(4,3,'model','Late reply')],null,snapshot(3)),/REVISION_CONFLICT/);
  assert.equal((await state()).rows.some(r=>r.message_id===b.message_id),false);
 });
 await check('non-owner cannot read or commit',async()=>{
  const h=await head();await db.exec("set fixture.owner='no'");assert.equal(await read(),null);await assert.rejects(commit(h,[b],null,snapshot(2)),/NOT_AUTHORIZED/);await db.exec("set fixture.owner='yes'");
 });
 await check('returning to an earlier history hash does not revive a stale snapshot from another site',async()=>{
  const before=await read('worldline2');
  await commit(await head(),[b],null,snapshot(2),'worldline1');
  await commit(await head(),[],b.message_id,snapshot(1),'worldline1');
  const after=await read('worldline2');
  assert.equal(after.head.sha256,before.head.sha256);assert.equal(after.stale,true);assert.equal(after.snapshot,null);
 });
 await check('recall of media-linked turn is refused and leaves records unchanged',async()=>{
  await db.query("insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,content,created_at_ms) values($1,'fixture',$2,2,'user',$3::jsonb,1003)",[owner,b.message_id,JSON.stringify({text:'Photo',attachments:[{assetId:'synthetic'}]})]);
  const before=await state();
  await assert.rejects(commit(await head(),[],b.message_id,snapshot(1)),/RECALL_MEDIA_UNSUPPORTED/);
  assert.deepEqual(await state(),before);
 });
 await check('recall a completed turn removes both user and model rows with snapshot rollback',async()=>{
  await db.query("delete from public.wetapp_messages where user_id=$1 and conversation_key='fixture' and message_id=$2",[owner,b.message_id]);
  const response=row(4,3,'model','Completed reply');
  await commit(await head(),[b,response],null,{...snapshot(2),world:{turnCount:2,chronicle:[{sourceMessageId:a.message_id},{sourceMessageId:response.message_id}]}});
  await commit(await head(),[],b.message_id,snapshot(1));
  assert.equal((await read()).head.count,2);assert.deepEqual((await read()).snapshot,snapshot(1));
  assert.equal((await state()).rows.some(r=>[b.message_id,response.message_id].includes(r.message_id)),false);
 });
 await check('database error after chat append rolls back both chat and snapshot changes',async()=>{
  await db.exec("reset role; create function public.fail_story_snapshot_fixture() returns trigger language plpgsql as $$ begin raise exception 'FIXTURE_SNAPSHOT_FAILURE'; end $$; create trigger fail_story_snapshot_fixture before insert or update on public.wetapp_story_checkpoint_lab for each row execute function public.fail_story_snapshot_fixture(); set role authenticated;");
  const before=await state(),prior=await read();
  await assert.rejects(commit(await head(),[b],null,snapshot(2)),/FIXTURE_SNAPSHOT_FAILURE/);
  assert.deepEqual(await state(),before);assert.deepEqual(await read(),prior);
  await db.exec("reset role;drop trigger fail_story_snapshot_fixture on public.wetapp_story_checkpoint_lab;drop function public.fail_story_snapshot_fixture();set role authenticated;");
 });
 console.log('STORY_CHECKPOINT_SQL_PASS '+passed+'/10');
}catch(e){console.error('LAB_ERROR',e?.message,e?.code,e?.detail);process.exitCode=1;}finally{await db.close();}
