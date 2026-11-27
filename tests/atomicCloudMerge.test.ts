import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeAtomicSnapshots,preserveForeignCloudSettings,type CloudMergeSnapshot} from '../atomicCloudMerge.js';
import type {DeltaRow} from '../atomicCloudDelta.js';
const c=(key:string)=>({conversation_key:key,title:key,kind:'persona'});
const m=(key:string,id:string,position:number,role='user'):DeltaRow=>({conversation_key:key,message_id:id,position,role,speaker_id:null,content:{text:'same'},created_at_ms:1000});
const base:CloudMergeSnapshot={conversations:[c('a'),c('b')],messages:[m('a','a0',0),m('a','a1',1,'model'),m('b','b0',0),m('b','b1',1,'model')],payload:{customPersonas:{a:{name:'A'},b:{name:'B'}},appSettings:{x:'old',y:'old'}}};
const copy=()=>structuredClone(base);
test('independent conversations and independent state keys merge; no signature dedupe',()=>{
 const l=copy(),r=copy();l.messages.push(m('a','a2',2),m('a','a3',3,'model'));r.messages.push(m('b','b2',2),m('b','b3',3,'model'));
 (l.payload as any).appSettings.x='local';(r.payload as any).appSettings.y='remote';
 const merged=mergeAtomicSnapshots(base,l,r);
 assert.equal(merged.messages.length,8);assert.deepEqual({...((merged.payload as any).appSettings)},{x:'local',y:'remote'});
});
test('same history append retains complete turns in order, distinct IDs despite equal text/time',()=>{
 const l=copy(),r=copy();l.messages.push(m('a','local-u',2),m('a','local-r',3,'model'));r.messages.push(m('a','remote-u',2),m('a','remote-r',3,'model'));
 const rows=mergeAtomicSnapshots(base,l,r).messages.filter(m=>m.conversation_key==='a');
 assert.deepEqual(rows.map(m=>m.message_id),['a0','a1','remote-u','remote-r','local-u','local-r']);assert.deepEqual(rows.map(m=>m.position),[0,1,2,3,4,5]);
});
test('remote deletion is preserved when local history unchanged; deletion versus edit blocks',()=>{
 const l=copy(),r=copy();r.conversations=r.conversations.filter(c=>c.conversation_key!=='a');r.messages=r.messages.filter(m=>m.conversation_key!=='a');
 assert.deepEqual(mergeAtomicSnapshots(base,l,r).conversations.map(c=>c.conversation_key),['b']);
 l.messages.push(m('a','a2',2));assert.throws(()=>mergeAtomicSnapshots(base,l,r),/conversation-delete-or-create/);
});
test('conflicting state, overlapping IDs, edited prefix and incomplete turns refuse automatic merge',()=>{
 const l=copy(),r=copy();(l.payload as any).appSettings.x='one';(r.payload as any).appSettings.x='two';assert.throws(()=>mergeAtomicSnapshots(base,l,r),/state/);
 const a=copy(),b=copy();a.messages.push(m('a','same-id',2),m('a','l',3,'model'));b.messages.push(m('a','same-id',2),m('a','r',3,'model'));assert.throws(()=>mergeAtomicSnapshots(base,a,b),/overlapping-turn/);
 a.messages[0].content={text:'edited'};assert.throws(()=>mergeAtomicSnapshots(base,a,b),/history-edit/);
 const c=copy(),d=copy();c.messages.push(m('a','l',2));d.messages.push(m('a','r',2),m('a','r2',3,'model'));assert.throws(()=>mergeAtomicSnapshots(base,c,d),/incomplete-turn/);
});

test('unsupported settings are carried forward without importing them into the runtime',()=>{
 const owned=(k:string)=>k==='veniceAssistantModel';
 const base={appSettings:{veniceAssistantModel:'old',worldline:'story-v1',director:'director-v1'}};
 const local={appSettings:{veniceAssistantModel:'new',worldline:'accidental-local-value'}};
 assert.deepEqual(preserveForeignCloudSettings(local,base,owned).appSettings,{veniceAssistantModel:'new',worldline:'story-v1',director:'director-v1'});
 assert.deepEqual(preserveForeignCloudSettings({appSettings:{}},base,owned).appSettings,{worldline:'story-v1',director:'director-v1'});
});
