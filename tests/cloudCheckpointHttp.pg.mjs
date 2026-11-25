import 'fake-indexeddb/auto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createLoopbackCheckpointTransport} from '../cloudCheckpointLabTransport.js';
import {MemoryManager} from '../managers.js';
import {RoomManager} from '../roomManager.js';
import {SupabaseCloudSyncManager} from '../supabaseCloudSync.js';
import {createCloudCheckpointSession} from '../cloudCheckpointSession.js';
import {digestVpsHistory} from '../vpsChatMode.js';
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
const payload={schemaVersion:1,customPersonas:{},diaries:{},interests:{},rooms:{version:2,rooms:[]},appSettings:{}};
const state=async()=>{const r=await db.query("select revision,payload from public.wetapp_state where user_id=$1",[owner]);const m=await db.query("select message_id,position,role,speaker_id,content,created_at_ms from public.wetapp_messages where user_id=$1 and conversation_key='fixture' order by position",[owner]);const c=await db.query("select message_count from public.wetapp_conversations where user_id=$1 and conversation_key='fixture'",[owner]);return {revision:Number(r.rows[0]?.revision),payload:r.rows[0]?.payload,rows:m.rows.map(x=>({...x,created_at_ms:Number(x.created_at_ms)})),count:c.rows[0]?.message_count};};
const call=(rev,expected,append,payload={marker:'new'},device='device-a')=>db.query('select public.wetapp_append_chat_checkpoint_v1($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6) as revision',[rev,'fixture',JSON.stringify(expected),JSON.stringify(append),JSON.stringify(payload),device]);
let passed=0;let server;
async function check(label,fn){await fn();passed++;console.log('PASS '+label);}
try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('fixture.uid',true),'')::uuid $$;create function public.is_wetapp_owner() returns boolean language sql stable as $$select current_setting('fixture.owner',true)='yes'$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;grant execute on function public.is_wetapp_owner() to authenticated;`);
 await db.exec(ddl+policies+sql);
 await db.query("insert into auth.users(id,email) values($1,'fixture-a@example.invalid'),($2,'fixture-b@example.invalid')",[owner,other]);
 await db.query("insert into public.wetapp_state(user_id,payload,revision) values($1,$3::jsonb,1),($2,'{}',1)",[owner,other,JSON.stringify(payload)]);
 await db.query("insert into public.wetapp_conversations(user_id,conversation_key,message_count) values($1,'fixture',1),($2,'fixture',0)",[owner,other]);
 await db.query("insert into public.wetapp_messages(user_id,conversation_key,message_id,position,role,content,created_at_ms) values($1,'fixture',$2,0,'user',$3::jsonb,$4)",[owner,first.message_id,JSON.stringify(first.content),first.created_at_ms]);
 await db.exec("set role authenticated;set fixture.uid='"+owner+"';set fixture.owner='yes';");

 await db.query('update public.wetapp_state set payload=$2::jsonb where user_id=$1',[owner,JSON.stringify(payload)]);
 let commits=0,lost=false,failBefore=false;
 const read=async()=>{const s=await state();return {revision:s.revision,history:s.rows,payload:s.payload};};
 const token='fixture-loopback-only';
 server=createServer(async(req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   if(req.headers.authorization!=='Bearer '+token)return send(401,{error:'unauthorized'});
   if(req.method==='GET'&&req.url==='/checkpoint?conversation=fixture')return send(200,await read());
   if(req.method!=='POST'||req.url!=='/checkpoint')return send(404,{error:'not found'});
   let body='';for await(const chunk of req){body+=chunk;if(body.length>1048576)return send(413,{error:'too large'});}
   const plan=JSON.parse(body);if(plan.target_conversation!=='fixture')return send(400,{error:'invalid conversation'});
   commits++;if(failBefore){res.destroy();return;}
   const result=await call(plan.expected_revision,plan.expected_history,plan.append_messages,plan.new_payload,plan.new_device_id);
   if(lost){res.destroy();return;}
   return send(200,{revision:Number(result.rows[0].revision)});
  }catch(e){send(409,{error:'checkpoint rejected'});}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port+'/';
 const transport=createLoopbackCheckpointTransport(base,token);
 await check('loopback endpoint blocks missing authentication and external origins',async()=>{
  assert.throws(()=>createLoopbackCheckpointTransport('https://example.invalid/',token),/LAB_ORIGIN/);
  assert.equal((await fetch(base+'checkpoint?conversation=fixture')).status,401);
  assert.deepEqual(await transport.read('fixture'),await read());
 });
 const device=id=>{const map=new Map();const storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};const activate=()=>Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
  activate();const memory=new MemoryManager(),room=new RoomManager(),sync=new SupabaseCloudSyncManager(memory,room,{onStateChange:()=>{},onRemoteApplied:()=>{}});const session=()=>createCloudCheckpointSession({storage,transport,history:k=>memory.peekChatHistory(k),lock:fn=>fn(),deviceId:id});
  const restore=async()=>{activate();const h=await read();await sync.applyRemoteData(h.payload,h.history.map(r=>({...r,conversation_key:'fixture'})),false);return h;};
  return {activate,memory,restore,session,storage};};
 const A=device('device-a'),B=device('device-b');
 let baseA=await A.restore(),baseB=await B.restore();
 await check('two real App managers restore matching cloud history fingerprints',async()=>{assert.equal(await digestVpsHistory(A.memory.peekChatHistory('fixture'),2),await digestVpsHistory(B.memory.peekChatHistory('fixture'),2));});
 await check('durable App reply survives lost RPC response; recovery does not replay',async()=>{
  A.activate();A.memory.persistVpsChatTurnUser('fixture',first.message_id);A.memory.persistVpsChatTurnReply('fixture',first.message_id,a.message_id,{text:'A reply'});
  lost=true;await assert.rejects(A.session().submit('fixture',baseA),/fetch failed|socket|network/i);lost=false;assert.ok(A.session().pending());
  assert.equal(await A.session().recover(),'confirmed');assert.equal(A.session().pending(),null);assert.equal(commits,1);
  const h=await read();assert.equal(h.revision,2);assert.equal(h.history[1].message_id,a.message_id);assert.deepEqual(h.payload,payload);
 });
 await check('second device with stale baseline cannot upload or overwrite newer data',async()=>{
  B.activate();B.memory.persistVpsChatTurnReply('fixture',first.message_id,'20000000-0000-4000-8000-000000000099',{text:'Conflicting reply'});
  await assert.rejects(B.session().submit('fixture',baseB),/BASELINE_CHANGED/);assert.equal(commits,1);assert.equal(B.session().pending(),null);
  assert.equal(B.memory.peekChatHistory('fixture').at(-1).content.text,'Conflicting reply');
 });
 await check('explicit restore then append from device B and restore to A',async()=>{
  // The conflicting synthetic reply is explicitly discarded in this test only.
  baseB=await B.restore();B.memory.setChatHistory('fixture',[...B.memory.peekChatHistory('fixture'),{id:b.message_id,role:'user',createdAt:b.created_at_ms,content:b.content}],true);
  assert.equal(await B.session().submit('fixture',baseB),'confirmed');assert.equal(commits,2);
  baseA=await A.restore();assert.equal(baseA.revision,3);assert.equal(A.memory.peekChatHistory('fixture').at(-1).id,b.message_id);
  assert.equal(await digestVpsHistory(A.memory.peekChatHistory('fixture'),2),await digestVpsHistory(B.memory.peekChatHistory('fixture'),2));assert.deepEqual(baseA.payload,payload);
 });
 await check('uncertain before commit remains pending; no automatic resend',async()=>{
  A.activate();A.memory.persistVpsChatTurnReply('fixture',b.message_id,'20000000-0000-4000-8000-000000000004',{text:'Unsent reply'});failBefore=true;
  await assert.rejects(A.session().submit('fixture',baseA),/fetch failed|socket|network/i);failBefore=false;assert.equal(await A.session().recover(),'not-confirmed');assert.equal(commits,3);assert.ok(A.session().pending());await assert.rejects(A.session().submit('fixture',baseA),/ALREADY_PENDING/);assert.equal(commits,3);assert.equal((await read()).revision,3);
 });
 await check('explicit retry blocks changed local result then commits identical original plan once',async()=>{
  A.activate();const original=structuredClone(A.memory.peekChatHistory('fixture'));
  A.memory.setChatHistory('fixture',[...original.slice(0,-1),{...original.at(-1),content:{text:'Different'}}],true);
  await assert.rejects(A.session().retryPending(),/LOCAL_RESULT_CHANGED/);assert.equal(commits,3);
  A.memory.setChatHistory('fixture',original,true);
  assert.equal(await A.session().retryPending(),'confirmed');assert.equal(commits,4);assert.equal((await read()).revision,4);assert.equal(A.session().pending(),null);
 });
 await check('advanced remote revision allows explicit conflict retirement without deleting local draft',async()=>{
  baseA=await A.restore();baseB=await B.restore();A.activate();
  A.memory.setChatHistory('fixture',[...A.memory.peekChatHistory('fixture'),{id:row(5,4,'user','Local draft').message_id,createdAt:1005,role:'user',content:{text:'Local draft'}}],true);
  failBefore=true;await assert.rejects(A.session().submit('fixture',baseA));failBefore=false;
  B.activate();B.memory.setChatHistory('fixture',[...B.memory.peekChatHistory('fixture'),{id:row(6,4,'user','Remote draft').message_id,createdAt:1006,role:'user',content:{text:'Remote draft'}}],true);
  assert.equal(await B.session().submit('fixture',baseB),'confirmed');
  A.activate();assert.equal(await A.session().recover(),'conflict-or-later-update');
  await assert.rejects(A.session().retryPending().then(s=>{if(s==='conflict-or-later-update')throw Error('CONFLICT');}),/CONFLICT/);
  await assert.rejects(A.session().retireConflict(4),/CONFLICT_NOT_CONFIRMED/);
  assert.equal(await A.session().retireConflict(5),'retired-local-preserved');
  assert.equal(A.memory.peekChatHistory('fixture').at(-1).content.text,'Local draft');
  assert.equal(A.session().pending(),null);assert.ok(A.storage.getItem('aigfCloudCheckpointLabV1Conflict'));
  assert.equal((await read()).history.at(-1).content.text,'Remote draft');
 });
 console.log('APP_HTTP_SQL_LAB_PASS '+passed+'/8');
}finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await db.close();}
