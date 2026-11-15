import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  estimateLargeJsonTokens,
  extractAssistantJsonPatchExport,
  isAssistantJsonFile,
  patchAssistantJsonSave,
  prepareAssistantJsonSave,
  supportsAssistantLargeJson,
} from '../assistantLargeSave.js';

const model = 'deepseek-v4-1-flash-1017-uncensored';

test('DeepSeek V4.1 1017 long context accepts complete >65k JSON saves', () => {
  assert.equal(supportsAssistantLargeJson(model), true);
  assert.equal(supportsAssistantLargeJson('venice-uncensored-1-2'), false);
  assert.equal(isAssistantJsonFile('Luna_SAVE.JSON'), true);
  const source = JSON.stringify({
    id: 'luna-test',
    history: [{speaker:'player',text:'故事原文'.repeat(60_000)}],
    nested: {friends:[{name:'角色甲', loyalty:7},{name:'角色乙',loyalty:3}]},
  },null,2);
  assert.ok(source.length > 100_000);
  const prepared = prepareAssistantJsonSave('Luna_save.json',source,model);
  assert.equal(prepared.longContext,true);
  const compact = JSON.stringify(JSON.parse(source));
  assert.ok(prepared.context.includes(compact));
  assert.equal(prepared.providedCharacters,compact.length);
  assert.deepEqual(JSON.parse(compact),JSON.parse(source));
  assert.ok(estimateLargeJsonTokens(compact)>0);
});

test('Other models cannot silently receive oversized Luna files',()=>{
  const big = JSON.stringify({log:'a'.repeat(80_000)});
  assert.throws(()=>prepareAssistantJsonSave('save.json',big,'qwen-3-8-27b'),/請先.*DeepSeek/);
  assert.throws(()=>prepareAssistantJsonSave('save.json','bad '+ 'x'.repeat(70_000),model),/有效 JSON/);
  assert.throws(()=>prepareAssistantJsonSave('save.json',JSON.stringify({s:'漢'.repeat(520_000)}),model),/上下文預算/);
});

test('Patch manifest parser accepts valid JSON pointers but not unsafe paths',()=>{
  const manifest = {
    format:'wetapp-json-patch-v1',sourceFile:'Luna_save.json',filename:'Luna_fixed.json',
    operations:[{op:'replace',path:'/characters/0/displayName',value:'夜千嬋'}],
  };
  const text='\x60\x60\x60json\n'+JSON.stringify(manifest)+'\n\x60\x60\x60';
  assert.deepEqual(extractAssistantJsonPatchExport(text),manifest);
  for(const path of ['/__proto__/polluted','/constructor/prototype','/nested/~2bad','', 'a']) {
    const malformed={...manifest,operations:[{...manifest.operations[0],path}]};
    assert.equal(extractAssistantJsonPatchExport(JSON.stringify(malformed)),null);
  }
  assert.equal(extractAssistantJsonPatchExport('some prose'),null);
});

test('Patch only changes targeted nested paths and original source remains untouched',()=>{
  const data={
    version:'2026.11',
    diary:[{id:1,notes:'unmodified'},{id:2,notes:'target'}],
    kakao:{'Jisoo/Lisa':{messages:[{text:'original'}]}},
    unknown:'保留資料',
  };
  const source=JSON.stringify(data);
  const manifest=extractAssistantJsonPatchExport(JSON.stringify({
    format:'wetapp-json-patch-v1',sourceFile:'test.json',filename:'fixed.json',
    operations:[
      {op:'replace',path:'/diary/1/notes',value:'fixed'},
      {op:'add',path:'/kakao/Jisoo~1Lisa/messages/-',value:{text:'next'}},
      {op:'remove',path:'/diary/0'},
    ],
  }));
  assert.ok(manifest);
  const fixed=patchAssistantJsonSave(source,manifest);
  const result=JSON.parse(fixed.json);
  assert.deepEqual(result.diary,[{id:2,notes:'fixed'}]);
  assert.equal(result.kakao['Jisoo/Lisa'].messages[0].text,'original');
  assert.equal(result.kakao['Jisoo/Lisa'].messages[1].text,'next');
  assert.equal(result.unknown,data.unknown);
  assert.equal(result.version,data.version);
  assert.deepEqual(JSON.parse(source),data);
});

test('Invalid patch path aborts rather than generating a silently corrupted save',()=>{
  const source='{"a":[{"v":2}]}';
  const patch=(operations:unknown[])=>extractAssistantJsonPatchExport(JSON.stringify({
    format:'wetapp-json-patch-v1',sourceFile:'test.json',filename:'fixed.json',operations,
  }))!;
  assert.throws(()=>patchAssistantJsonSave(source,patch([{op:'replace',path:'/b',value:5}])),/不存在/);
  assert.throws(()=>patchAssistantJsonSave(source,patch([{op:'remove',path:'/a/5'}])),/超出範圍/);
  assert.throws(()=>patchAssistantJsonSave(source,patch([{op:'replace',path:'/a/0/v',value:3},{op:'replace',path:'/a/9',value:5}])),/超出範圍/);
  assert.equal(extractAssistantJsonPatchExport(JSON.stringify({
    format:'wetapp-json-patch-v1',sourceFile:'test.json',filename:'fixed.json',
    operations:[{op:'replace',path:'/a/0/v'}],
  })),null);
});

test('Venice assistant rehydrates original save on follow-up and preserves separate character chat path',()=>{
  const app=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
  assert.match(app,/loadPreviousAssistantLargeSaveContext/);
  assert.match(app,/getChatAttachmentBlob\(source.assetId\)/);
  assert.match(app,/historyTextFiles\.set/);
  assert.match(app,/previousLargeJsonContext/);
  assert.match(app,/assistantMode \?\s+await loadPreviousAssistantLargeSaveContext/);
  assert.match(app,/patchAssistantJsonSave\(await blob.text\(\), patchExport\)/);
  assert.match(app,/const jsonExport = patchExport \|\| archiveExport \? null : extractAssistantJsonExport/);
  assert.match(app,/supportsAssistantLargeJson/);
});
