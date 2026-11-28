import test from 'node:test';
import assert from 'node:assert/strict';
import {makeStatePatch,isStatePatch,type StatePatch} from '../cloudStatePatch.js';
function apply(base:object,patch:StatePatch){
 const x=structuredClone(base) as any;
 for(const e of patch.edits){let p=x;for(const k of e.path.slice(0,-1))p=p[k];const leaf=e.path.at(-1)!;if('value' in e)p[leaf]=e.value;else delete p[leaf];}return x;
}
test('unchanged 9 MB of settings produces exactly an empty patch',()=>{
 const base={rooms:[{id:'r',history:'x'.repeat(4600000)}],appSettings:{ledger:'y'.repeat(4600000)}};
 const p=makeStatePatch(base,structuredClone(base))!;
 assert.equal(JSON.stringify(p),'{"version":1,"edits":[]}');
 assert.deepEqual(apply(base,p),base);
});
test('nested edits, removals, nulls, arrays and JSON object ordering are lossless',()=>{
 const base={rooms:{rooms:[{name:'a',memory:'x'.repeat(10000)},{name:'b',tags:['x','y']}]},appSettings:{old:'a',long:'l'.repeat(10000)},customPersonas:{p:{name:'old'}}};
 const next=structuredClone(base) as any;
 next.rooms.rooms[1].name='B';next.rooms.rooms[1].tags.push('z');delete next.appSettings.old;next.appSettings.nil=null;next.customPersonas.p.name='new';
 const p=makeStatePatch(base,next)!;
 assert.ok(isStatePatch(p));assert.deepEqual(apply(base,p),next);assert.ok(JSON.stringify(p).length<500);
 assert.deepEqual(makeStatePatch({z:'long'.repeat(100),a:1},{a:1,z:'long'.repeat(100)}),{version:1,edits:[]});
});
test('invalid or larger patches are rejected or use full snapshot fallback',()=>{
 assert.equal(makeStatePatch({x:1},{x:2}),null);
 assert.equal(isStatePatch({version:1,edits:[{path:[],value:1}]}),false);
 assert.equal(isStatePatch({version:1,edits:[{path:['x'],remove:false}]}),false);
 assert.equal(isStatePatch({version:1,edits:[{path:['x'],remove:true,value:1}]}),false);
});
