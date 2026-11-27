import {PGlite} from '../tmp/sync-lab/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(),owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const boot=readFileSync(new URL('../supabase/NEW_PROJECT_BOOTSTRAP.sql',import.meta.url),'utf8');
const ddl=boot.slice(boot.indexOf('create table if not exists public.wetapp_profiles'),boot.indexOf('create index if not exists wetapp_messages_conversation_position_idx'));
const policies=boot.slice(boot.indexOf('alter table public.wetapp_profiles enable row level security'),boot.indexOf('insert into storage.buckets'));
const sql=readFileSync(new URL('../supabase/experimental/wetapp_commit_chat_delta_v3.sql',import.meta.url),'utf8');
const empty={conversations:[],messages:[],remove_messages:[],remove_conversations:[]};
const row=(pos,content={text:'synthetic message'})=>({conversation_key:'long-room',message_id:'fixture-'+pos,position:pos,role:pos%2===0?'user':'model',speaker_id:pos%2===0?null:'npc',content,created_at_ms:1000+pos});
const commit=(revision,delta,payload={marker:'changed'})=>db.query('select public.wetapp_commit_chat_delta_v3($1,$2::jsonb,$3::jsonb,$4) as revision',[revision,JSON.stringify(payload),JSON.stringify({...empty,...delta}),'test-device']);
const state=async()=> (await db.query("select revision,payload from public.wetapp_state where user_id=$1",[owner])).rows[0];
const head=async()=> (await db.query("select message_count,(select count(*) from public.wetapp_messages where conversation_key='long-room') actual from public.wetapp_conversations where conversation_key='long-room'")).rows[0];
const fingerprint=async()=> (await db.query("select md5(string_agg(to_jsonb(m)::text,'' order by position)) digest from public.wetapp_messages m where conversation_key='long-room' and position<5536")).rows[0].digest;
let passed=0;const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name)};
try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('fixture.uid',true),'')::uuid $$;create function public.is_wetapp_owner() returns boolean language sql stable as $$select current_setting('fixture.owner',true)='yes'$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;grant execute on function public.is_wetapp_owner() to authenticated;`);
 await db.exec(`create schema storage;create table storage.objects(bucket_id text,name text,metadata jsonb,primary key(bucket_id,name));grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;`);
 await db.exec(ddl+policies+sql);
 await db.query("insert into auth.users(id) values($1),($2)",[owner,other]);
 await db.query("insert into public.wetapp_state(user_id,payload,revision) values($1,'{\"marker\":\"old\"}',480),($2,'{}',1)",[owner,other]);
 await db.query("insert into public.wetapp_conversations(user_id,conversation_key,title,kind,message_count) values($1,'long-room','Room','room',5541),($2,'long-room','Other','room',0)",[owner,other]);
 await db.query("insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,speaker_id,content,created_at_ms) select $1,'long-room','fixture-'||i,i,case when i%2=0 then 'user' else 'model' end,case when i%2=0 then null else 'npc' end,jsonb_build_object('text',repeat('x',3800))||(case when i=0 then jsonb_build_object('imageAssetId','legacy-image','attachments',jsonb_build_array(jsonb_build_object('id','legacy-attachment'))) else '{}'::jsonb end),1000+i from generate_series(0,5535) i",[owner]);
 await db.exec("set role authenticated;set fixture.uid='"+owner+"';set fixture.owner='yes';");
 const old=await fingerprint();
 await check('existing 5536-row room, historical media references unchanged; correct count on atomic append',async()=>{
  await commit(480,{messages:[row(5536)]});assert.equal(Number((await state()).revision),481);assert.equal(Number((await head()).actual),5537);assert.equal((await head()).message_count,5537);assert.equal(await fingerprint(),old);
 });
 await check('stale device cannot change messages or state',async()=>{
  await assert.rejects(commit(480,{messages:[row(0,{text:'overwrite'})]}),/WETAPP_STATE_REVISION_CONFLICT/);assert.equal(await fingerprint(),old);assert.equal(Number((await state()).revision),481);
 });
 await check('noncontiguous update rolls back message and state mutations',async()=>{
  await assert.rejects(commit(481,{messages:[row(5539)]},{marker:'bad'}),/NONCONTIGUOUS_HISTORY/);assert.equal((await state()).payload.marker,'changed');assert.equal(Number((await state()).revision),481);assert.equal(Number((await head()).actual),5537);
 });
 await check('recall and state update share one transaction',async()=>{
  await commit(481,{remove_messages:[{conversation_key:'long-room',message_id:'fixture-5536'}]},{marker:'recall'});assert.equal(Number((await state()).revision),482);assert.equal((await state()).payload.marker,'recall');assert.equal((await head()).message_count,5536);assert.equal(await fingerprint(),old);
 });
 await check('other owner unchanged and anonymous execution denied',async()=>{
  await db.exec('reset role');const r=await db.query("select revision from public.wetapp_state where user_id=$1",[other]);assert.equal(Number(r.rows[0].revision),1);assert.equal((await db.query("select has_function_privilege('anon','public.wetapp_commit_chat_delta_v3(bigint,jsonb,jsonb,text)','EXECUTE') allowed")).rows[0].allowed,false);
 });
 await check('receipted transaction retries same request exactly once and refuses operation ID collision',async()=>{
  await db.exec("set role authenticated;set fixture.uid='"+owner+"';set fixture.owner='yes';");
  const args=[482,JSON.stringify({marker:'receipt'}),JSON.stringify({...empty,messages:[row(5536)]}),'device-receipt','30000000-0000-4000-8000-000000000001'];
  const apply=()=>db.query('select public.wetapp_commit_chat_delta_receipted_v3($1,$2::jsonb,$3::jsonb,$4,$5::uuid) as revision',args);
  assert.equal(Number((await apply()).rows[0].revision),483);
  assert.equal(Number((await apply()).rows[0].revision),483);
  assert.equal(Number((await state()).revision),483);assert.equal((await head()).message_count,5537);
  assert.equal(Number((await db.query('select revision from public.wetapp_chat_delta_receipts_v3')).rows[0].revision),483);
  args[1]=JSON.stringify({marker:'other'});await assert.rejects(apply(),/DELTA_OPERATION_COLLISION/);
  assert.equal((await state()).payload.marker,'receipt');assert.equal(await fingerprint(),old);
 });
 const assetId='character-photo:fixture-photo';
 const idHash=(await db.query("select encode(sha256(convert_to($1,'UTF8')),'hex') as h",[assetId])).rows[0].h;
 const path=owner+'/atomic-v3/'+idHash+'/'+ 'a'.repeat(64);
 const asset={asset_id:assetId,conversation_key:'long-room',kind:'character_photo',storage_path:path,mime_type:'image/webp',byte_size:32,signature:'fixture-v1',metadata:{id:'fixture-photo',personaKey:'long-room'},created_at_ms:10000};
 await check('unstaged media rolls back new messages and revision',async()=>{
  await assert.rejects(commit(483,{messages:[row(5537)],media:{upsert:[asset],remove:[]}}),/INVALID_OR_UNSTAGED_MEDIA/);
  assert.equal(Number((await state()).revision),483);assert.equal((await head()).message_count,5537);
 });
 await check('staged media metadata and linked message commit atomically; stale writers denied',async()=>{
  await db.exec('reset role');await db.query("insert into storage.objects values('wetapp-private',$1,'{\"size\":32}')",[path]);await db.exec('set role authenticated');
  await commit(483,{messages:[row(5537,{text:'photo',imageAssetId:'fixture-photo'})],media:{upsert:[asset],remove:[]}});
  assert.equal(Number((await state()).revision),484);assert.equal((await db.query('select storage_path from public.wetapp_media')).rows[0].storage_path,path);
  await assert.rejects(commit(483,{media:{upsert:[],remove:[assetId]}}),/WETAPP_STATE_REVISION_CONFLICT/);
  assert.equal((await db.query('select count(*) n from public.wetapp_media')).rows[0].n,1);
 });
 await check('media removal deletes manifest without deleting physical object or historical data',async()=>{
  await commit(484,{remove_messages:[{conversation_key:'long-room',message_id:'fixture-5537'}],media:{upsert:[],remove:[assetId]}});
  assert.equal(Number((await state()).revision),485);assert.equal((await db.query('select count(*) n from public.wetapp_media')).rows[0].n,0);
  assert.equal((await db.query('select count(*) n from storage.objects')).rows[0].n,1);
  assert.equal(await fingerprint(),old);
 });
 console.log('PRODUCTION_DELTA_SQL_PASS '+passed+'/9');
}catch(e){console.error(e);process.exitCode=1}finally{await db.close()}
