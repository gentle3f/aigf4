import {PGlite} from '../tmp/sync-lab/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import {createCheckpointV2Session} from '../cloudCheckpointV2.js';
import {digestVpsHistory} from '../vpsChatMode.js';
import assert from 'node:assert/strict';
const db=new PGlite();
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const boot=readFileSync(new URL('../supabase/NEW_PROJECT_BOOTSTRAP.sql',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/experimental/wetapp_append_chat_checkpoint_v2.sql',import.meta.url),'utf8');
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
 const h=await head();
 await check('head returns only revision, count, digest and contiguity',async()=>{assert.deepEqual(Object.keys(h).sort(),['contiguous','count','revision','sha256']);assert.equal(h.count,1);assert.match(h.sha256,/^[a-f0-9]{64}$/);assert.equal(h.contiguous,true);});
 await check('append preserves cloud state payload; stale revision rejected',async()=>{const before=await state();await append(h,[a]);const after=await state();assert.equal(after.revision,2);assert.deepEqual(after.payload,before.payload);assert.equal(after.count,2);await assert.rejects(append(h,[b]),/REVISION_CONFLICT/);assert.deepEqual(await state(),after);});
 await check('same revision legacy row edit detected by server digest',async()=>{const old=await head();await db.query("update public.wetapp_messages set content=jsonb_build_object('text','edited') where user_id=$1 and message_id=$2",[owner,a.message_id]);const after=await state();assert.notEqual((await head()).sha256,old.sha256);await assert.rejects(append(old,[b]),/HISTORY_CONFLICT/);assert.deepEqual(await state(),after);});
 await check('invalid second append rolls back first',async()=>{const current=await head(),before=await state();await assert.rejects(append(current,[b,{...row(4,3,'model','invalid'),position:99}]),/INVALID_APPEND_MESSAGE/);assert.deepEqual(await state(),before);});
 await check('non-owner cannot get digest or append',async()=>{const current=await head();await db.exec("set fixture.owner='no'");assert.equal(await head(),null);await assert.rejects(append(current,[b]),/NOT_AUTHORIZED/);await db.exec("set fixture.owner='yes'");});
 await check('5,536 row history exceeding old 8 MiB baseline works with small append request',async()=>{
  await db.query("insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,content,created_at_ms) select $1,'fixture','legacy-'||i::text,i,'user',jsonb_build_object('text',repeat(md5(i::text),125)),1000+i from generate_series(2,5535) i",[owner]);
  const size=Number((await db.query("select pg_column_size(jsonb_agg(jsonb_build_object('message_id',message_id,'position',position,'role',role,'speaker_id',speaker_id,'content',content,'created_at_ms',created_at_ms) order by position,message_id)) as size from public.wetapp_messages where user_id=$1 and conversation_key='fixture'",[owner])).rows[0].size);
  assert.ok(size>8388608);
  const current=await head();assert.equal(current.count,5536);assert.ok(current.contiguous);
  const tail=row(7,5536,'model','Short reply');assert.ok(JSON.stringify({revision:current.revision,sha256:current.sha256,count:current.count,append:[tail]}).length<1024);
  await append(current,[tail]);assert.equal((await head()).count,5537);assert.equal((await head()).revision,current.revision+1);console.log('LARGE_BASELINE_BYTES '+size);
 });
 await check('actual SQL plus two client checkpoint sessions recover one committed append',async()=>{
  const transport={head:async()=>head(),page:async(_key,offset,limit)=>{const r=await db.query("select message_id,position,role,speaker_id,content,created_at_ms from public.wetapp_messages where user_id=$1 and conversation_key='fixture' order by position offset $2 limit $3",[owner,offset,limit]);return r.rows.map(x=>({...x,created_at_ms:Number(x.created_at_ms)}));},append:async p=>{calls++;const result=await append({revision:p.expected_revision,sha256:p.expected_history_sha256,count:p.expected_count},p.append_messages);if(lost)throw Error('lost after commit');return Number(result.rows[0].revision);}};
  let calls=0,lost=true;
  const restore=async()=>{const h=await head(),rows=await transport.page('fixture',0,h.count);return rows.map(r=>({id:r.message_id,createdAt:r.created_at_ms,role:r.role,speakerId:r.speaker_id||undefined,content:r.content}));};
  const device=history=>{const m=new Map();return createCheckpointV2Session({storage:{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},transport,history:()=>history,deviceId:'fixture-device',lock:fn=>fn()});};
  const history=await restore(),before=history.length,phone=device(history);history.push({id:'20000000-0000-4000-8000-000000000008',createdAt:9001,role:'user',content:{text:'New user message'}});
  await assert.rejects(phone.submit('fixture'),/lost after commit/);assert.ok(phone.pending());assert.equal(await phone.recover(),'confirmed');assert.equal(calls,1);
  const desktopHistory=await restore(),desktop=device(desktopHistory);await desktop.verifyRestored('fixture');
  assert.equal(await digestVpsHistory(history,2),await digestVpsHistory(desktopHistory,2));assert.equal(desktopHistory.length,before+1);
  lost=false;desktopHistory.push({id:'20000000-0000-4000-8000-000000000009',createdAt:9002,role:'model',content:{text:'Accepted reply'}});
  assert.equal(await desktop.submit('fixture'),'confirmed');assert.equal(calls,2);
  const reopened=await restore();assert.equal(reopened.at(-1).id,'20000000-0000-4000-8000-000000000009');assert.equal(reopened.length,before+2);
 });
 console.log('V2_DIGEST_SQL_PASS '+passed+'/7');
}catch(e){console.error('LAB_ERROR',e?.message,e?.code,e?.detail);process.exitCode=1;}finally{await db.close();}
