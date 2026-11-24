import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { researchText,captureResearchMessages,buildWorldResearchExport } from '../worldResearch.js';
test('research preserves textual prompt but not media, credentials, or hidden reasoning',()=>{
 const messages=captureResearchMessages([{role:'system',content:'世界狀態：青禾守衛。'},{role:'user',content:[{type:'text',text:'去古門'},{type:'image_url',image_url:{url:'data:image/png;base64,AAAA'}}]}]);
 assert.deepEqual(messages[0].content,{text:'世界狀態：青禾守衛。',originalChars:'世界狀態：青禾守衛。'.length,truncated:false});
 assert.doesNotMatch(JSON.stringify(messages),/AAAA|image_url/);
 const s=JSON.stringify(researchText('sk-abcdefghijklmnopqrstuvwxyz <think>secret reasoning</think>'));
 assert.doesNotMatch(s,/abcdefghijklmnopqrstuvwxyz|secret reasoning/);
});
test('long text explicitly marks truncation',()=>{
 const r=researchText('x'.repeat(310000)) as {text:string;truncated:boolean;originalChars:number};
 assert.equal(r.truncated,true);assert.equal(r.text.length,300000);assert.equal(r.originalChars,310000);
});
test('export has transparent scope and no manufactured cost without browser storage',async()=>{
 const result=await buildWorldResearchExport('world-one');
 assert.equal(result.scope,'world-one');assert.equal(result.eventCount,0);assert.equal(result.storage,'this browser only');
});
test('actual generation, validation, final persistence and both ZIP paths are wired',()=>{
 const app=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 const files=readFileSync(new URL('../fileManager.ts',import.meta.url),'utf8');
 assert.match(app,/captureResearchMessages\(options.messages\)/);
 assert.match(app,/kind:'model-output'/);
 assert.match(app,/stage:'ledger-validation'/);
 assert.match(app,/kind:'rejected'/);
 assert.match(app,/kind:'final-story'/);
 assert.match(files,/buildWorldResearchExport\(personaKey\)/);
 assert.match(files,/buildWorldResearchExport\(\)/);
});
