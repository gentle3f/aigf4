import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorldline,updateWorldlineRegistry} from '../worldline.js';
import {planServerWorldLedger,finalizeServerWorldLedger} from '../serverWorldLedger.js';
import {projectWorld,WORLD_LEDGER_SCHEMA} from '../worldLedger.js';
import type {WorldSource} from '../worldOs.js';
const key='garden',world=makeWorldline(key,{title:'Garden',genre:'fantasy',premise:'Explore a garden'},1000);
const registry=JSON.stringify(updateWorldlineRegistry(null,key,world,1000));
const history:WorldSource[]=[{id:'u',role:'user',content:{text:'Visit the garden.'}},{id:'r',role:'model',content:{text:'A ginkgo tree stands beside a fountain.'}}];
const s={key,registry,history,ledger:JSON.stringify({schema:WORLD_LEDGER_SCHEMA,worlds:{other:{}}}),model:'glm-5-3-flash-uncensored'};
const job=(value:unknown)=>({job_id:'attempt',status:'done' as const,result:{choices:[{message:{content:JSON.stringify(value)}}]}});
const observation={sourceId:'s2',quote:'A ginkgo tree',kind:'location',subject:'Garden',key:'feature',value:'Ginkgo tree',state:'established'};
test('server ledger preserves evidence, other worlds, and complete source coverage',async()=>{
 const p=await planServerWorldLedger(s);assert.ok(p);assert.equal(p.sources.length,2);
 const r=await finalizeServerWorldLedger(s,p,job({reviewedSourceIds:['s1','s2'],observations:[observation]}),'attempt',2000);
 assert.equal(r.kind,'save');if(r.kind!=='save')return;
 const projection=projectWorld(r.ledger,key,history);assert.equal(projection.processed,2);assert.equal(projection.timeline[0].sourceId,'r');assert.ok(JSON.parse(r.ledger).worlds.other);
 assert.equal(await planServerWorldLedger({...s,ledger:r.ledger}),null);
});
test('invalid quote cannot become established; adaptive retry shrinks batch and stops',async()=>{
 const p=await planServerWorldLedger(s);assert.ok(p);
 const r=await finalizeServerWorldLedger(s,p,job({reviewedSourceIds:['s2'],observations:[{...observation,quote:'A fake quotation'}]}),'attempt',2000);
 assert.equal(r.kind,'retry');if(r.kind!=='retry')return;
 assert.equal(r.plan.sources.length,1);assert.equal(r.plan.attempt,2);
 const terminal=await finalizeServerWorldLedger(s,r.plan,job({observations:[]}), 'attempt',3000);
 assert.equal(terminal.kind,'deferred');
});
test('edited source or reset world rejects paid result; later messages can coexist',async()=>{
 const p=await planServerWorldLedger(s);assert.ok(p);
 const output=job({reviewedSourceIds:['s1','s2'],observations:[observation]});
 await assert.rejects(finalizeServerWorldLedger({...s,history:[history[0],{...history[1],content:{text:'Changed evidence'}}]},p,output,'attempt',2000),/LEDGER_CONTEXT_CHANGED/);
 const reset=JSON.stringify(updateWorldlineRegistry(null,key,makeWorldline(key,{title:'New world',genre:'fantasy',premise:'Start again'},3000),3000));
 await assert.rejects(finalizeServerWorldLedger({...s,registry:reset},p,output,'attempt',2000),/LEDGER_CONTEXT_CHANGED/);
 const r=await finalizeServerWorldLedger({...s,history:[...history,{id:'later',role:'user',content:{text:'New question'}}]},p,output,'attempt',2000);assert.equal(r.kind,'save');
});
