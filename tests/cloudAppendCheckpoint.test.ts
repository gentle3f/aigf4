import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAppendCheckpoint,inspectCheckpointOutcome} from '../cloudAppendCheckpoint.js';
const a={id:'20000000-0000-4000-8000-000000000001',role:'user',createdAt:1001,content:{text:'Synthetic baseline'}};
const b={id:'20000000-0000-4000-8000-000000000002',role:'model',createdAt:1002,content:{text:'A reply'}};
const row={message_id:a.id,position:0,role:'user',speaker_id:null,content:{text:'Synthetic baseline'},created_at_ms:1001};
const fixture={revision:1,conversationKey:'fixture',deviceId:'a',remoteHistory:[row],localHistory:[a,b],payload:{marker:'new'}};
test('append plan preserves original row IDs and baseline, refuses edits or deletions',()=>{const p=prepareAppendCheckpoint(fixture);assert.deepEqual(p.expected_history,[row]);assert.equal(p.append_messages[0].message_id,b.id);assert.equal(p.append_messages[0].position,1);assert.throws(()=>prepareAppendCheckpoint({...fixture,localHistory:[{...a,content:{text:'edited'}},b]}),/HISTORY_CONFLICT/);assert.throws(()=>prepareAppendCheckpoint({...fixture,localHistory:[b]}),/HISTORY_CONFLICT/);assert.throws(()=>prepareAppendCheckpoint({...fixture,localHistory:[a,a]}),/DUPLICATE/);});
test('uncertain commit outcome only confirmed by exact revision, rows and state; no replay',()=>{const p=prepareAppendCheckpoint(fixture);assert.equal(inspectCheckpointOutcome(p,{revision:2,history:[...p.expected_history,...p.append_messages],payload:p.new_payload}),'confirmed');assert.equal(inspectCheckpointOutcome(p,{revision:1,history:p.expected_history,payload:{}}),'not-confirmed');assert.equal(inspectCheckpointOutcome(p,{revision:3,history:[...p.expected_history,...p.append_messages],payload:p.new_payload}),'conflict-or-later-update');assert.equal(inspectCheckpointOutcome(p,{revision:2,history:[...p.expected_history,...p.append_messages],payload:{marker:'changed'}}),'conflict-or-later-update');});

test('media append is excluded until storage transaction strategy exists',()=>{assert.throws(()=>prepareAppendCheckpoint({...fixture,localHistory:[a,{...b,content:{text:'photo',imageAssetId:'fixture',imageUrl:'blob:fixture'}}]}),/MEDIA_UNSUPPORTED/);});
