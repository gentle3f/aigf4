import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckpointV2Session,projectCheckpointHistory,readConsistentCheckpoint,type CheckpointPlanV2,type CheckpointTransportV2} from '../cloudCheckpointV2.js';
import {digestVpsHistory} from '../vpsChatMode.js';
const msg=(i:number,role='user')=>({id:'20000000-0000-4000-8000-'+String(i).padStart(12,'0'),role,createdAt:i,content:{text:'Synthetic '+i}});
function fixture(n=1){
 const baseline=Array.from({length:n},(_,i)=>msg(i+1));
 let rows=projectCheckpointHistory(baseline),revision=1,sha='a'.repeat(64),calls=0,fail='',change=false;
 let lastPlan:CheckpointPlanV2|undefined;
 const transport:CheckpointTransportV2={
  head:async()=>({revision,count:rows.length,sha256:sha,contiguous:true}),
  page:async(_key,offset,limit)=>{const result=rows.slice(offset,offset+limit);if(change){revision++;change=false;}return result;},
  append:async p=>{calls++;lastPlan=p;if(fail==='before')throw Error('offline');
   assert.equal(p.expected_revision,revision);assert.equal(p.expected_count,rows.length);assert.equal(p.expected_history_sha256,sha);
   rows=[...rows,...p.append_messages];revision++;sha='b'.repeat(64);if(fail==='after')throw Error('offline');return revision;}
 };
 const device=(history=baseline.slice())=>{
  const map=new Map<string,string>();
  const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},removeItem:(k:string)=>{map.delete(k)}};
  return {history,session:createCheckpointV2Session({storage,transport,history:()=>history,deviceId:'fixture',lock:fn=>fn()})};
 };
 return {device,transport,baseline,fail:(s:string)=>{fail=s},change:()=>{change=true},calls:()=>calls,plan:()=>lastPlan,restore:()=>rows.map(r=>({id:r.message_id,role:r.role,createdAt:r.created_at_ms,content:r.content as {text:string}}))};
}
test('large history pages are verified; only new user message is submitted',async()=>{
 const f=fixture(5536),a=f.device();a.history.push(msg(5537));assert.equal(await a.session.submit('w'),'confirmed');assert.equal(f.calls(),1);
 assert.equal(f.plan()?.append_messages.length,1);assert.ok(JSON.stringify(f.plan()).length<1024);assert.equal(f.plan()?.expected_count,5536);
 const b=f.device(f.restore());await b.session.verifyRestored('w');assert.equal(await digestVpsHistory(a.history,2),await digestVpsHistory(b.history,2));
});
test('lost response after commit is confirmed with GET only and no repeated append',async()=>{
 const f=fixture(),a=f.device();a.history.push(msg(2));f.fail('after');await assert.rejects(a.session.submit('w'),/offline/);assert.ok(a.session.pending());assert.equal(await a.session.recover(),'confirmed');assert.equal(f.calls(),1);assert.equal(a.session.pending(),null);
});
test('lost response before commit retains receipt without retry',async()=>{
 const f=fixture(),a=f.device();a.history.push(msg(2));f.fail('before');await assert.rejects(a.session.submit('w'),/offline/);assert.equal(await a.session.recover(),'not-confirmed');await assert.rejects(a.session.submit('w'),/ALREADY_PENDING/);assert.equal(f.calls(),1);
});
test('concurrent change during paging rejects snapshot and never appends',async()=>{
 const f=fixture(250);f.change();await assert.rejects(readConsistentCheckpoint(f.transport,'w'),/HEAD_CHANGED/);assert.equal(f.calls(),0);
});
test('local edit or divergent device cannot overwrite matching remote prefix',async()=>{
 const f=fixture(),a=f.device();a.history[0]={...msg(1),content:{text:'edited'}};a.history.push(msg(2));await assert.rejects(a.session.submit('w'),/HISTORY_CONFLICT/);await assert.rejects(a.session.verifyRestored('w'),/MISMATCH/);assert.equal(f.calls(),0);
});
test('two devices receive same history and original user/reply IDs',async()=>{
 const f=fixture(),phone=f.device();phone.history.push(msg(2));await phone.session.submit('w');
 const pc=f.device(f.restore());await pc.session.verifyRestored('w');pc.history.push(msg(3,'model'));await pc.session.submit('w');
 const again=f.device(f.restore());await again.session.verifyRestored('w');assert.deepEqual(again.history.map(x=>x.id),[msg(1).id,msg(2).id,msg(3).id]);assert.equal(f.calls(),2);
});
