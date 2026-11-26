import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableChatTurn} from '../durableChatTurn.js';
import type {TurnIdentity, TurnReceipt, TurnHistoryRow} from '../durableChatTurn.js';
import type {PilotJob} from '../generationQueuePilot.js';
const id='12345678-1234-4234-8234-123456789abc',jobId='12345678-1234-4234-8234-123456789abd',replyId='12345678-1234-4234-8234-123456789abe';
const turn={conversationKey:'room-a',personaKey:'persona-a',userMessageId:id};
const payload={model:'glm-5-3-flash-uncensored',messages:[{role:'user' as const,content:'fixture'}]};
function fixture(){
 const map=new Map<string,string>();const rows:TurnHistoryRow[]=[{id,role:'user'}];const events:string[]=[];
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{events.push('receipt');map.set(k,v)},removeItem:(k:string)=>{events.push('clear');map.delete(k)}};
 const history={read:()=>rows,persistUser:async(t:TurnIdentity)=>{assert.equal(t.userMessageId,id);events.push('user-durable')},persistReply:async(r:TurnReceipt)=>{events.push('reply-durable');rows.push({id:r.replyId,role:'model'})},confirmReply:async()=>{events.push('confirm')}};
 const done:PilotJob={job_id:jobId,status:'done',result:{choices:[{message:{content:'OK'}}]}};
 const transport={submit:async(j:string)=>{assert.equal(j,jobId);events.push('POST');return {job_id:j,status:'queued' as const}},get:async(j:string)=>{assert.equal(j,jobId);events.push('GET');return done}};
 let tail=Promise.resolve();
 const lock=<T>(work:()=>Promise<T>)=>{const run=tail.then(work);tail=run.then(()=>{},()=>{});return run};
 const build=()=>{const ids=[jobId,replyId];return createDurableChatTurn({storage,history,transport,lock,newId:()=>ids.shift()!})};
 return {build,history,transport,storage,rows,events,done};
}
test('persist user and receipt before dispatch; restart GET and apply once',async()=>{
 const f=fixture();const a=f.build();await a.submit(turn,payload);
 assert.deepEqual(f.events,['user-durable','receipt','POST']);
 const b=f.build();const r=(await b.resume())!;assert.equal(r.historyState,'ready');
 assert.equal(await b.apply(r.receipt,r.job,'cleaned OK'),'applied');assert.equal(b.pending(),null);
 assert.equal(f.rows.filter(x=>x.role==='model').length,1);assert.deepEqual(f.events.slice(-4),['GET','reply-durable','confirm','clear']);
});
test('lost POST response remains pending and only GET on repeated submission',async()=>{
 const f=fixture();f.transport.submit=async()=>{f.events.push('POST');throw Error('offline')};
 const a=f.build();await assert.rejects(a.submit(turn,payload),/offline/);
 await f.build().submit(turn,payload);assert.equal(f.events.filter(x=>x==='POST').length,1);assert.equal(f.events.at(-1),'GET');
});
test('404 after uncertain POST cannot trigger another POST',async()=>{
 const f=fixture();f.transport.submit=async()=>{f.events.push('POST');throw Error('offline')};f.transport.get=async()=>{throw Error('404')};
 const a=f.build();await assert.rejects(a.submit(turn,payload));await assert.rejects(a.submit(turn,payload),/404/);assert.ok(a.pending());assert.equal(f.events.filter(x=>x==='POST').length,1);
});
test('user storage failure prevents outbound call',async()=>{
 const f=fixture();f.history.persistUser=async()=>{throw Error('quota')};const a=f.build();await assert.rejects(a.submit(turn,payload),/quota/);assert.equal(a.pending(),null);assert.ok(!f.events.includes('POST'));
});
test('receipt storage failure prevents outbound call',async()=>{
 const f=fixture();f.storage.setItem=()=>{throw Error('quota')};const a=f.build();await assert.rejects(a.submit(turn,payload),/quota/);assert.ok(!f.events.includes('POST'));
});
test('crash after reply durable but before receipt removal: no duplicate',async()=>{
 const f=fixture();const a=f.build();await a.submit(turn,payload);const r=(await a.resume())!;
 f.history.confirmReply=async()=>{throw Error('crash')};await assert.rejects(a.apply(r.receipt,r.job,'OK'),/crash/);assert.ok(a.pending());
 f.history.confirmReply=async()=>{};const b=f.build();assert.equal(await b.apply(r.receipt,r.job,'OK'),'already-applied');assert.equal(f.rows.filter(x=>x.role==='model').length,1);assert.equal(b.pending(),null);
});
test('history changed or deleted never inserts into wrong turn',async()=>{
 const f=fixture();const a=f.build();await a.submit(turn,payload);const r=(await a.resume())!;
 f.rows.push({id:'later',role:'user'});await assert.rejects(a.apply(r.receipt,r.job,'OK'),/HISTORY_CHANGED/);
 f.rows.length=0;await assert.rejects(a.apply(r.receipt,r.job,'OK'),/HISTORY_CHANGED/);assert.ok(a.pending());
});
test('wrong job, empty or unfinished result rejected',async()=>{
 const f=fixture();const a=f.build();await a.submit(turn,payload);const r=(await a.resume())!;
 for(const j of [{...r.job,job_id:'wrong'},{...r.job,status:'running' as const},{...r.job,result:{choices:[{message:{content:' '}}]}}])await assert.rejects(a.apply(r.receipt,j,'OK'),/RESULT_NOT_READY/);
 await assert.rejects(a.apply(r.receipt,r.job,' '),/REPLY_REJECTED/);assert.ok(a.pending());
});
test('cross-tab lock serializes submit and blocks another turn',async()=>{
 const f=fixture();const a=f.build(),b=f.build();await Promise.all([a.submit(turn,payload),b.submit(turn,payload)]);
 assert.equal(f.events.filter(x=>x==='POST').length,1);await assert.rejects(b.submit({...turn,conversationKey:'other'},payload),/OTHER_CHAT_TURN_PENDING/);
});
test('persistence failure after reply append preserves receipt',async()=>{
 const f=fixture();const a=f.build();await a.submit(turn,payload);const r=(await a.resume())!;f.history.persistReply=async()=>{throw Error('quota')};
 await assert.rejects(a.apply(r.receipt,r.job,'OK'),/quota/);assert.ok(a.pending());assert.equal(f.rows.length,1);
});

test('recall retires pending job and a late result cannot restore deleted turn',async()=>{
 const f=fixture();const a=f.build();await a.submit(turn,payload);const r=(await a.resume())!;
 const result=await a.recall(turn.conversationKey,()=>{f.rows.splice(0);return true;});
 assert.equal(result,true);assert.equal(a.pending(),null);
 await assert.rejects(a.apply(r.receipt,r.job,'OK'),/RECEIPT_CHANGED/);
 assert.equal(f.rows.length,0);assert.equal(f.events.filter(x=>x==='POST').length,1);
});
test('recall serializes against result application and never leaves its reply behind',async()=>{
 const f=fixture();const a=f.build();await a.submit(turn,payload);const r=(await a.resume())!;
 await Promise.all([a.apply(r.receipt,r.job,'OK'),a.recall(turn.conversationKey,()=>{f.rows.splice(0);return true;})]);
 assert.equal(f.rows.length,0);assert.equal(a.pending(),null);
});
test('failed recall preserves receipt; unrelated recall does not retire it',async()=>{
 const f=fixture();const a=f.build();await a.submit(turn,payload);
 await assert.rejects(a.recall(turn.conversationKey,()=>{throw Error('quota')}),/quota/);assert.ok(a.pending());
 await a.recall('other',()=>true);assert.ok(a.pending());
 await a.recall(turn.conversationKey,()=>null);assert.ok(a.pending());
});
