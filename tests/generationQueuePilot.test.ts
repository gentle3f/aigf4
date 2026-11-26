import test from 'node:test';
import assert from 'node:assert/strict';
import {createQueuePilotClient} from '../generationQueuePilot.js';
const id='12345678-1234-4234-8234-123456789abc';
const payload={model:'glm-5-3-flash-uncensored',messages:[{role:'user' as const,content:'Synthetic'}]};
const fixture=()=>{const map=new Map<string,string>();return {getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},removeItem:(k:string)=>{map.delete(k)}};};
test('persist before dispatch, restart recovers by GET, explicit acknowledge',async()=>{
 const storage=fixture();const calls:string[]=[];
 const c=createQueuePilotClient({storage,newId:()=>id,fetchImpl:async(_,o)=>{assert.ok(c.pending());calls.push(o!.method!);return new Response(JSON.stringify({job_id:id,status:'queued'}));}});
 await c.submit(payload);await assert.rejects(c.submit(payload),/ALREADY_PENDING/);
 const restart=createQueuePilotClient({storage,fetchImpl:async(u,o)=>{calls.push(o!.method!);assert.match(String(u),new RegExp(id));return new Response(JSON.stringify({job_id:id,status:'done',result:{choices:[{message:{content:'OK'}}]}}));}});
 assert.equal((await restart.resume())?.status,'done');assert.deepEqual(calls,['POST','GET']);assert.ok(restart.pending());restart.acknowledge(id);assert.equal(restart.pending(),null);
});
test('uncertain POST never reissued automatically',async()=>{
 const storage=fixture();let count=0;
 const c=createQueuePilotClient({storage,newId:()=>id,fetchImpl:async()=>{count++;throw Error('offline');}});
 await assert.rejects(c.submit(payload),/TRANSPORT_UNCERTAIN/);assert.equal(count,1);assert.equal(c.pending()?.jobId,id);
 await assert.rejects(c.submit(payload),/ALREADY_PENDING/);assert.equal(count,1);
});
test('storage failure prevents outbound request',async()=>{
 const storage=fixture();storage.setItem=()=>{throw Error('storage failed')};let count=0;
 const c=createQueuePilotClient({storage,newId:()=>id,fetchImpl:async()=>{count++;return new Response('{}')}});
 await assert.rejects(c.submit(payload),/storage failed/);assert.equal(count,0);
});
