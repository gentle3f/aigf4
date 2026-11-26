import test from 'node:test';
import assert from 'node:assert/strict';
import {acceptanceCases,createAcceptanceRunner,type AcceptanceCase} from '../vpsAcceptance.js';
import {createGenerationHandler} from '../server/generationJobs.js';
import type {PilotJob} from '../generationQueuePilot.js';
const id='12345678-1234-4234-8234-123456789abc';
test('all seven synthetic plans pass exact proxy validation without provider calls',async()=>{
 assert.equal(acceptanceCases.length,7);
 for(const c of acceptanceCases){let calls=0;const response={code:0,setHeader(){},status(n:number){this.code=n;return this},json(){return this}};
 const handler=createGenerationHandler({env:{AIGF_VPS_QUEUE_ENABLED:'1',AIGF_VPS_QUEUE_URL:'https://fixture.invalid/',AIGF_VPS_QUEUE_TOKEN:'x'.repeat(64)},authenticate:()=>true,fetchImpl:async(_u,o)=>{calls++;assert.deepEqual(JSON.parse(String(o?.body)).request,c.request);return new Response(JSON.stringify({job_id:id,status:'queued'}));}});
 await handler({method:'POST',body:{job_id:id,request:c.request}},response);
 assert.equal(response.code,202,c.id);assert.equal(calls,1,c.id);
 }
});
const cases=acceptanceCases.slice(0,2).map(c=>({...c,check:()=> 'synthetic pass'}));
function fixture(){
 const map=new Map<string,string>();let lose=false,fail=false,seq=0;const calls:string[]=[];
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{if(fail)throw Error('quota');map.set(k,v)},removeItem:(k:string)=>map.delete(k)};
 const newId=()=>id.slice(0,-1)+String(++seq);
 const transport={submit:async(j:string)=>{calls.push('POST '+j);if(lose)throw Error('offline');return {job_id:j,status:'queued'} as PilotJob},get:async(j:string)=>{calls.push('GET '+j);return {job_id:j,status:'done'} as PilotJob}};
 const build=()=>createAcceptanceRunner({storage,transport,lock:fn=>fn(),cases,newId});
 return {build,calls,lose:(v:boolean)=>lose=v,fail:(v:boolean)=>fail=v};
}
test('lost POST is never resent, next case starts only after existing terminal result',async()=>{
 const f=fixture();f.lose(true);const a=f.build();await assert.rejects(a.step(),/offline/);const old=a.read().rows[0].jobId;f.lose(false);
 const b=f.build();assert.equal(await b.step(),'next');assert.equal(await b.step(),'pending');assert.equal(await b.step(),'complete');assert.equal(await b.step(),'complete');
 assert.equal(f.calls.length,4);assert.deepEqual(f.calls.slice(0,2),['POST '+old,'GET '+old]);assert.equal(b.read().rows.filter(r=>r.status==='pass').length,2);
});
test('journal write failure blocks submission',async()=>{const f=fixture();f.fail(true);await assert.rejects(f.build().step(),/quota/);assert.equal(f.calls.length,0);});
test('strict review actual schema and group memory scope reject malformed or absent participant',()=>{
 const mk=(content:string):PilotJob=>({job_id:id,status:'done',result:{choices:[{message:{content},finish_reason:'stop'}]}});
 assert.match(acceptanceCases[0].check(mk('{"decision":"keep","issues":[],"revised_response":""}')),/keep/);
 assert.throws(()=>acceptanceCases[0].check(mk('<keep/>')));
 assert.throws(()=>acceptanceCases.at(-1)!.check(mk('{"memories":[{"source_message_ids":["fixture-1"],"perspectives":[{"member_id":"c"}]}]}')),/SCOPE/);
});
