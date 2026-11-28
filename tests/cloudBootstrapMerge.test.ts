import assert from 'node:assert/strict';
import test from 'node:test';
import {mergeBootstrapHistoryMaps} from '../cloudMessageMerge.js';
const m=(id:string,createdAt:number,text=id)=>({id,createdAt,role:'user' as const,content:{text}});
test('first sign-in keeps remote-only history and all offline appended message IDs',()=>{
 const a=m('a',1),b=m('b',2),c=m('c',3,'same'),d=m('d',3,'same');
 const local={world:[a,b,c,d]},remote={world:[a,b],other:[m('e',4)]};
 const merged=mergeBootstrapHistoryMaps(local,remote);
 assert.deepEqual(merged.world.map(x=>x.id),['a','b','c','d']);
 assert.deepEqual(merged.other,remote.other);
 assert.equal(local.world.length,4);
});
test('first sign-in retains longer remote history and local-only worlds',()=>{
 const a=m('a',1),b=m('b',2);
 const merged=mergeBootstrapHistoryMaps({world:[a],mine:[m('c',3)]},{world:[a,b]});
 assert.deepEqual(merged.world,[a,b]);
 assert.equal(merged.mine[0].id,'c');
});
test('divergent history and changed shared ID fail without touching either side',()=>{
 const a=m('a',1),b=m('b',2),c=m('c',3);
 const local={world:[a,b]},remote={world:[a,c]};
 assert.throws(()=>mergeBootstrapHistoryMaps(local,remote),/ATOMIC_BOOTSTRAP_HISTORY_CONFLICT/);
 assert.throws(()=>mergeBootstrapHistoryMaps({world:[m('a',1,'changed')]},{world:[a]}),/ATOMIC_BOOTSTRAP_HISTORY_CONFLICT/);
 assert.deepEqual(local.world,[a,b]);assert.deepEqual(remote.world,[a,c]);
});
test('duplicate IDs cannot be imported or discarded silently',()=>{
 assert.throws(()=>mergeBootstrapHistoryMaps({world:[m('a',1),m('a',2)]},{}),/ATOMIC_BOOTSTRAP_INVALID_HISTORY/);
});

test('legacy singleton or contiguous slice already included in cloud retains every cloud row',()=>{
 const a=m('a',1),b=m('b',2),c=m('c',3);
 assert.deepEqual(mergeBootstrapHistoryMaps({room:[c]},{room:[a,b,c]}).room,[a,b,c]);
 assert.deepEqual(mergeBootstrapHistoryMaps({room:[b,c]},{room:[a,b,c]}).room,[a,b,c]);
 assert.throws(()=>mergeBootstrapHistoryMaps({room:[m('c',3,'edited')]},{room:[a,b,c]}),/ATOMIC_BOOTSTRAP_HISTORY_CONFLICT/);
 assert.throws(()=>mergeBootstrapHistoryMaps({room:[m('different',3,'c')]},{room:[a,b,c]}),/ATOMIC_BOOTSTRAP_HISTORY_CONFLICT/);
});
