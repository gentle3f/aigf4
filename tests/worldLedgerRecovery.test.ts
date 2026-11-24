import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLedger,parseWorldExtraction,appendWorldBatches,projectWorld,pendingWorldSources,selectWorldBatch,parseRecoverableWorldExtraction,recoverWorldExtraction,mergeLedgers,buildRecoverableWorldExtractionMessages} from '../worldLedger.js';
import type {WorldSource} from '../worldOs.js';
const history:WorldSource[]=Array.from({length:40},(_,i)=>({id:'msg-'+i,role:'model',content:{text:'守衛青禾在第'+i+'日抵達古門。'}}));
const row=(id:string,quote:string)=>({sourceId:id,quote,kind:'location',subject:'青禾',key:'location',value:'古門',state:'change'});
const response=(ids:string[],observations:unknown[]=[])=>JSON.stringify({reviewedSourceIds:ids,observations});
test('old 24 completed sources remain intact; remaining sources use smaller batches',()=>{
 const old=appendWorldBatches(emptyLedger(),'world',parseWorldExtraction('{"observations":[]}',history.slice(0,24)),history);
 assert.equal(projectWorld(old,'world',history).processed,24);
 const batch=selectWorldBatch(pendingWorldSources(old,'world',history));
 assert.equal(batch.length,8);assert.equal(batch[0].id,'msg-24');
 const result=parseRecoverableWorldExtraction(response(['s1','s2'],[row('s1','守衛青禾在第24日抵達古門'),row('s2','不存在的證據')]),batch);
 const next=appendWorldBatches(old,'world',result.rows,history);
 assert.equal(projectWorld(next,'world',history).processed,25);
 assert.equal(pendingWorldSources(next,'world',history)[0].id,'msg-25');
});
test('bad evidence leaves just its own source incomplete and keeps validated evidence',()=>{
 const batch=history.slice(0,2);
 const result=parseRecoverableWorldExtraction(response(['s1','s2'],[row('s1','守衛青禾在第0日抵達古門'),row('s1','錯誤的原文'),row('s2','守衛青禾在第1日抵達古門')]),batch);
 assert.equal(result.rows[0].incomplete,true);assert.equal(result.rows[0].observations.length,1);
 assert.equal(result.rows[1].incomplete,undefined);
 const ledger=appendWorldBatches(null,'w',result.rows,batch);
 assert.equal(projectWorld(ledger,'w',batch).partial,1);assert.equal(projectWorld(ledger,'w',batch).processed,1);
 assert.deepEqual(pendingWorldSources(ledger,'w',batch).map(x=>x.id),['msg-0']);
});
test('missing source coverage and unknown source IDs cannot falsely mark all complete',()=>{
 const missing=parseRecoverableWorldExtraction('{"observations":[]}',history.slice(0,2));
 assert.equal(missing.rows.length,0);
 const unknown=parseRecoverableWorldExtraction(response(['s1','s2'],[row('s99','守衛青禾在第0日抵達古門')]),history.slice(0,2));
 assert.equal(unknown.rows.filter(r=>!r.incomplete).length,0);
});
test('unique whitespace-only quote repair stores exact original evidence',()=>{
 const source:WorldSource={id:'original',role:'model',content:{text:'青禾\n抵達 古門。'}};
 const result=parseRecoverableWorldExtraction(response(['s1'],[row('s1','青禾抵達古門')]),[source]);
 assert.equal(result.rows[0].observations[0].quote,'青禾\n抵達 古門');
 assert.equal(result.rows[0].incomplete,undefined);
});
test('malformed JSON automatically shrinks 8 to 4 to 2 and saves valid records',async()=>{
 const sizes:number[]=[];
 const r=await recoverWorldExtraction(history.slice(0,8),async batch=>{
  sizes.push(batch.length);return batch.length>2?'{"observations":[':response(['s1','s2']);
 });
 assert.deepEqual(sizes,[8,4,2]);assert.equal(r.rows.length,2);assert.equal(r.deferred.length,0);
});
test('stubborn single source is deferred, not marked complete; retry count bounded',async()=>{
 const sizes:number[]=[];
 const r=await recoverWorldExtraction(history.slice(0,8),async batch=>{sizes.push(batch.length);return 'invalid';});
 assert.deepEqual(sizes,[8,4,2,1]);assert.deepEqual(r.deferred,['msg-0']);assert.equal(r.rows.length,0);
});
test('a complete source cannot be replaced by a newer partial retry in cloud merge',()=>{
 const sources=history.slice(0,1);
 const full=appendWorldBatches(null,'w',parseRecoverableWorldExtraction(response(['s1']),sources,100).rows,sources);
 const partial=appendWorldBatches(null,'w',parseRecoverableWorldExtraction(response(['s1'],[row('s1','守衛青禾在第0日抵達古門'),row('s1','錯誤原文')]),sources,200).rows,sources);
 assert.equal(projectWorld(mergeLedgers(full,partial),'w',sources).processed,1);
 assert.equal(projectWorld(mergeLedgers(partial,full),'w',sources).processed,1);
});
test('extraction sends short source IDs and explicit coverage contract',()=>{
 const messages=buildRecoverableWorldExtractionMessages(history.slice(0,2),'');
 assert.match(String(messages[0].content),/reviewedSourceIds/);
 assert.match(String(messages[1].content),/"id":"s1"/);
 assert.doesNotMatch(String(messages[1].content),/"id":"msg-0"/);
});
