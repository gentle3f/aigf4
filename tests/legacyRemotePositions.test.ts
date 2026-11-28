import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLegacyRemotePositions} from '../legacyRemotePositions.js';
const row=(id:string,p:number,t:number,device:string,key='venice_ai')=>({conversation_key:key,message_id:id,position:p,created_at_ms:t,source_device_id:device,role:'user',speaker_id:null,content:{text:id}});
test('legacy device blocks remain intact; every original message ID and content preserved',()=>{
 const rows=[row('b0',0,40,'B'),row('a1',1,20,'A'),row('a0',0,10,'A'),row('b1',1,50,'B')];
 const fixed=normalizeLegacyRemotePositions(rows);
 assert.deepEqual(fixed.map(r=>[r.message_id,r.position]),[['a0',0],['a1',1],['b0',2],['b1',3]]);
 assert.deepEqual(fixed.map(({position,...r})=>r),[rows[2],rows[1],rows[0],rows[3]].map(({position,...r})=>r));
 assert.equal(rows[0].position,0);
});
test('unknown conversation, overlapping times, same device duplicates and missing positions fail closed',()=>{
 for(const rows of [[row('a',0,10,'A','other'),row('b',0,20,'B','other')],[row('a',0,10,'A'),row('b',1,30,'A'),row('c',0,20,'B')],[row('a',0,10,'A'),row('b',0,20,'A')],[row('a',0,10,'A'),row('b',2,20,'B')]])assert.throws(()=>normalizeLegacyRemotePositions(rows),/invalid-history/);
});
