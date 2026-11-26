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
