import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  encodeJsonPointer,
  prepareIndexedAssistantJson,
  resolveJsonPointer,
  MAX_JSON_INDEX_CONTEXT_CHARACTERS,
} from '../assistantJsonIndex.js';
import { prepareAssistantJsonSave } from '../assistantLargeSave.js';

const model='deepseek-v4-1-flash-1017-uncensored';
const save = {
  schemaVersion: 'Luna-v2',
  roleProfiles: {
    'Jisoo/Lisa': { name:'Jisoo', greeting:'你好', history:'角色資料保留'},
    'Yeon': { name:'Yeon', greeting:'您好', history:'冇改動'},
  },
  kakao: {
    messages: [
      { id:1, actor:'Jisoo', text:'舊稱呼錯誤', timestamp:101 },
      { id:2, actor:'Lisa', text:'訊息內容都要保存', timestamp:102 },
      { id:3, actor:'Jisoo', text:'Alice 與 Bob 交談', timestamp:103 },
    ],
  },
  longLog: Array.from({length:26000}, (_,i)=>({
    id:i, speaker:i%2?'旁白':'player',
    content:'這是無關的長篇歷史劇情與角色日常，請保留原始內容。'.repeat(5),
  })),
};

test('oversized Luna JSON becomes a truthful bounded index, without changing original values', () => {
  const raw = JSON.stringify(save);
  assert.ok(raw.length > 2_100_000);
  const original = JSON.parse(raw);
  const prepared = prepareAssistantJsonSave('Luna_SAVE.json',raw,model,'Jisoo 舊稱呼錯誤，請找到相關對話');
  assert.equal(prepared.indexed,true);
  assert.equal(prepared.longContext,true);
  assert.ok(prepared.context.length <= MAX_JSON_INDEX_CONTEXT_CHARACTERS);
  assert.match(prepared.context,/INDEXED LUNA JSON FILE \(PARTIAL INSPECTION\)/);
  assert.match(prepared.context,/THE MODEL HAS NOT READ THE WHOLE FILE/);
  assert.match(prepared.context,/Jisoo/);
  assert.match(prepared.context,/舊稱呼錯誤/);
  assert.deepEqual(JSON.parse(raw),original);
});

test('query-directed retrieval selects different messages on subsequent turns', () => {
  const raw = JSON.stringify(save);
  const a = prepareIndexedAssistantJson('save.json',raw,'Jisoo 舊稱呼錯誤');
  const b = prepareIndexedAssistantJson('save.json',raw,'Lisa 訊息');
  assert.ok(a.context.includes('/kakao/messages/0'));
  assert.ok(b.context.includes('/kakao/messages/1'));
  assert.ok(a.emittedPaths.some(p=>p==='/kakao/messages/0'));
  assert.ok(b.emittedPaths.some(p=>p==='/kakao/messages/1'));
});

test('explicit JSON Pointer retrieves nested path and escaped slash keys', () => {
  const raw = JSON.stringify(save);
  const x = prepareIndexedAssistantJson('save.json',raw,'讀取 /roleProfiles/Jisoo~1Lisa');
  assert.deepEqual(x.explicitPaths,['/roleProfiles/Jisoo~1Lisa']);
  assert.match(x.context,/EXPLICIT REQUESTED PATH \/roleProfiles\/Jisoo~1Lisa/);
  assert.equal((resolveJsonPointer(save,'/roleProfiles/Jisoo~1Lisa') as any).name,'Jisoo');
  assert.deepEqual(encodeJsonPointer(['roleProfiles','Jisoo/Lisa']),'/roleProfiles/Jisoo~1Lisa');
  assert.throws(()=>resolveJsonPointer(save,'/__proto__/polluted'),/不安全/);
  assert.throws(()=>resolveJsonPointer(save,'/kakao/messages/9000000'),/超出範圍/);
});

test('extremely large single string is clearly excerpted; missing paths are explicit', () => {
  const raw=JSON.stringify({ chapter:{ prose:'青青子衿'.repeat(620_000) } });
  const indexed=prepareIndexedAssistantJson('save.json',raw,'請讀取 @/chapter/prose');
  assert.ok(indexed.context.length<=MAX_JSON_INDEX_CONTEXT_CHARACTERS);
  assert.match(indexed.context,/EXCERPT ONLY/);
  const missing=prepareIndexedAssistantJson('save.json',raw,'讀取 /chapter/not-here');
  assert.match(missing.context,/not available/);
  assert.match(missing.context,/NOT READ THE WHOLE FILE/);
});

test('indexed context never exceeds response budget despite numerous matching records', () => {
  const raw=JSON.stringify({
    messages:Array.from({length:3200}, (_,i)=>({id:i,text:'Jisoo 語言不正確'.repeat(100)})),
  });
  const indexed=prepareIndexedAssistantJson('save.json',raw,'Jisoo 語言不正確');
  assert.ok(indexed.context.length <= MAX_JSON_INDEX_CONTEXT_CHARACTERS);
  assert.ok(indexed.visitedNodes > 100);
  assert.ok(indexed.emittedPaths.length > 0);
});
