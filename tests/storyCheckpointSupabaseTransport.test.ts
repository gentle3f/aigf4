import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoryCheckpointSupabaseTransport} from '../storyCheckpointSupabaseTransport.js';
const cfg={projectUrl:'https://fixturelab.supabase.co',productionUrl:'https://fixtureprod.supabase.co',enabled:true,publishableKey:'sb_publishable_fixture'};
test('explicit isolated origin and publishable key required',()=>{
 for(const patch of [{enabled:false},{projectUrl:cfg.productionUrl},{projectUrl:'http://fixturelab.supabase.co'},{projectUrl:'https://fixturelab.supabase.co/path'},{publishableKey:'sb_secret_fixture'}])assert.throws(()=>createStoryCheckpointSupabaseTransport({...cfg,...patch}));
});
test('real Supabase SDK requests exact isolated REST and RPC endpoints',async()=>{
 const calls:{url:string;method:string;body:any}[]=[];
 const mock:typeof fetch=async(input,init)=>{
  const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  assert.equal(u.origin,cfg.projectUrl);assert.equal(init?.redirect,'error');
  const method=init?.method||'GET',body=typeof init?.body==='string'?JSON.parse(init.body):null;
  calls.push({url:u.pathname+u.search,method,body});
  const data=u.pathname.endsWith('read_lab')?{head:{revision:1,count:0,sha256:'a'.repeat(64),contiguous:true},snapshot:null,stale:false}:u.pathname.endsWith('commit_lab')?2:[];
  return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const {transport}=createStoryCheckpointSupabaseTransport(cfg,mock);
 const view=await transport.read('fixture','worldline2');
 await transport.page('fixture',0,20);
 const rev=await transport.commit({key:'fixture',site:'worldline2',head:view.head,append:[],recall:'user-id',snapshot:{version:1,site:'worldline2',key:'fixture',historyDigest:'a'.repeat(64)},deviceId:'device'});
 assert.equal(rev,2);assert.equal(calls.length,3);
 assert.match(calls[0].url,/rpc\/wetapp_story_checkpoint_read_lab/);
 assert.match(calls[1].url,/wetapp_messages\?/);assert.match(calls[1].url,/conversation_key=eq.fixture/);
 assert.equal(calls[2].body.recall_user,'user-id');assert.equal(calls[2].body.expected_revision,1);
 await assert.rejects(transport.page('fixture',0,201),/RANGE_INVALID/);assert.equal(calls.length,3);
});

test('real SDK media upload/download uses isolated bucket and owner-bound manifest',async()=>{
 const uid='10000000-0000-4000-8000-000000000001';
 const files=new Map<string,Blob>();let row:any=null;const calls:string[]=[];
 const mock:typeof fetch=async(input,init)=>{
  const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  assert.equal(u.origin,cfg.projectUrl);assert.equal(init?.redirect,'error');
  const method=init?.method||'GET';calls.push(method+' '+u.pathname);
  const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  if(u.pathname==='/auth/v1/token')return json({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user:{id:uid,email:'fixture@example.invalid'}});
  if(u.pathname==='/rest/v1/wetapp_pilot_media'){
   if(method==='POST'){row=JSON.parse(String(init?.body));assert.equal(row.user_id,uid);delete row.user_id;return new Response(null,{status:201});}
   return json(row?[row]:[]);
  }
  const path=u.pathname.replace(/^\/storage\/v1\/object\/(?:authenticated\/)?aigf-pilot-media\//,'');
  assert.ok(path.startsWith(uid+'/'));
  if(method==='POST'){
   const body=init?.body;
   const blob=body instanceof FormData?body.get('') as Blob:body as Blob;
   assert.ok(blob instanceof Blob);files.set(path,blob);return json({Id:'fixture',Key:'aigf-pilot-media/'+path});
  }
  const blob=files.get(path);assert.ok(blob);return new Response(blob,{headers:{'Content-Type':blob.type}});
 };
 const client=createStoryCheckpointSupabaseTransport(cfg,mock);
 assert.throws(()=>client.getMedia(),/LOGIN_REQUIRED/);
 await client.signIn('fixture@example.invalid','not-real-password');
 const media=client.getMedia(),a={id:'fixture-media',kind:'image' as const,blob:new Blob(['fixture bytes'],{type:'image/webp'}),metadata:{prompt:'fixture'},createdAt:123};
 assert.equal(await media.push(a),'synced');
 assert.equal(await (await media.pull(a.id))!.blob.text(),'fixture bytes');
 assert.equal((await media.list()).length,1);
 assert.equal(calls.filter(x=>x.startsWith('POST /storage/')).length,1);
});
