import {PGlite} from '../tmp/sync-lab/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const boot=readFileSync(new URL('../supabase/NEW_PROJECT_BOOTSTRAP.sql',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/experimental/wetapp_append_chat_checkpoint_v1.sql',import.meta.url),'utf8');
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
 const baseline=await state();
 await check('first device atomic state + chat append',async()=>{assert.equal(Number((await call(1,[first],[a])).rows[0].revision),2);assert.deepEqual(await state(),{revision:2,payload:{marker:'new'},rows:[first,a],count:2});});
 const afterA=await state();
 await check('stale revision rejects without any mutation',async()=>{await assert.rejects(call(1,[first],[b]),/WETAPP_STATE_REVISION_CONFLICT/);assert.deepEqual(await state(),afterA);});
 await check('same revision but edited remote baseline rejects',async()=>{await assert.rejects(call(2,[{...first,content:{text:'wrong'}},a],[b]),/WETAPP_HISTORY_CONFLICT/);assert.deepEqual(await state(),afterA);});
 await check('second device refreshed baseline appends',async()=>{await call(2,[first,a],[b],{marker:'device-b'},'device-b');assert.deepEqual(await state(),{revision:3,payload:{marker:'device-b'},rows:[first,a,b],count:3});});
 const afterB=await state();
 await check('failure after first insert rolls back both rows and state',async()=>{await assert.rejects(call(3,[first,a,b],[row(4,3,'model','valid'),{...row(5,4,'user','bad'),position:99}]),/INVALID_APPEND_MESSAGE/);assert.deepEqual(await state(),afterB);});
 await check('duplicate message ID rolls back transaction',async()=>{await assert.rejects(call(3,[first,a,b],[{...a,position:3}]));assert.deepEqual(await state(),afterB);});
 await check('non-owner and anon denied; no other account writes',async()=>{await db.exec("set fixture.owner='no';");await assert.rejects(call(3,[first,a,b],[row(6,3,'model','no')]),/NOT_AUTHORIZED/);await db.exec("set role anon;");await assert.rejects(call(3,[first,a,b],[row(6,3,'model','no')]));await db.exec("reset role;set role authenticated;set fixture.owner='yes';");assert.deepEqual(await state(),afterB);const r=await db.query("select * from public.wetapp_state where user_id=$1",[other]);assert.equal(r.rows.length,0);});
 await check('media append rejected atomically',async()=>{await assert.rejects(call(3,[first,a,b],[{...row(7,3,'model','photo'),content:{imageAssetId:'fixture'}}]),/INVALID_APPEND_MESSAGE/);assert.deepEqual(await state(),afterB);});
 console.log('SYNC_LAB_PASS '+passed+'/8');
}finally{await db.close();}
