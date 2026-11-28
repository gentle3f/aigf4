import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMessageManifest,planMessageBlockPull,manifestMatchesRows,advanceMessageManifest,type MessageManifest,type MessageBlock} from '../cloudMessageBlocks.js';
import type {DeltaRow,Delta} from '../atomicCloudDelta.js';
const rows=(key:string,n:number):DeltaRow[]=>Array.from({length:n},(_,position)=>({conversation_key:key,message_id:key+'-'+position,position,role:position%2?'model':'user',speaker_id:null,content:{text:'fixture '+position},created_at_ms:position+1}));
const blocks=(key:string,n:number,digest='a'):MessageBlock[]=>Array.from({length:Math.ceil(n/32)},(_,i)=>[key,i,digest.repeat(64),Math.min(32,n-i*32),true]);
const before:MessageManifest={revision:485,blocks:[...blocks('world',1029),...blocks('other',14240)]};
test('new reply downloads only last block, keeps 15k prior messages and checks exact positions',()=>{
 const base=[...rows('world',1029),...rows('other',14240)];
 const remote={revision:486,blocks:[...blocks('world',1030),...blocks('other',14240)]};
 remote.blocks[32][2]='b'.repeat(64);
 assert.ok(parseMessageManifest(remote));
 const plan=planMessageBlockPull(remote,before,base);
 assert.equal(plan.changed.length,1);
 assert.equal(plan.changed[0][0],'world');assert.equal(plan.changed[0][1],32);
 assert.equal(plan.reused.length,15264);
 const full=[...plan.reused,...rows('world',1030).slice(1024)];
 assert.ok(manifestMatchesRows(remote,full));
 assert.equal(full.length,15270);
});
test('edits and deletes invalidate old and new blocks, even after a local commit',()=>{
 const base=rows('world',100),previous={revision:7,blocks:blocks('world',100)};
 const delta:Delta={conversations:[],messages:[{...base[1],position:65}],remove_messages:[{conversation_key:'world',message_id:'world-33'}],remove_conversations:[]};
 const next=advanceMessageManifest(previous,base,delta);
 assert.equal(next.revision,8);assert.deepEqual(next.blocks.map(b=>b[1]),[3]);
 assert.ok(parseMessageManifest(next,true));assert.equal(parseMessageManifest(next),null);
});
test('deleted conversation is not resurrected; malformed manifest falls back',()=>{
 const base=[...rows('world',100),...rows('deleted',32)];
 const prior={revision:3,blocks:[...blocks('world',100),...blocks('deleted',32)]};
 const next={revision:4,blocks:blocks('world',100)};
 const plan=planMessageBlockPull(next,prior,base);
 assert.equal(plan.reused.length,100);assert.equal(plan.changed.length,0);
 assert.equal(parseMessageManifest({revision:4,blocks:[['world',0,'a'.repeat(64),32,false]]}),null);
 assert.equal(parseMessageManifest({revision:4,blocks:[...blocks('world',32),...blocks('world',32)]}),null);
 assert.equal(parseMessageManifest({revision:4,blocks:[['world',1,'a'.repeat(64),1,true]]}),null);
});
