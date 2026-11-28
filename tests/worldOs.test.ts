import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {buildWorldReadModel,compileWorldRecall,type WorldSource,type WorldObservation} from '../worldOs.js';
const h:WorldSource[]=[
 {id:'a',role:'model',content:{text:'青禾在古洞與旅人建立合作關係。她原是山門守衛。'}},
 {id:'b',role:'user',content:{text:'研究符文能量，暫時提出假設，沒有完成實驗。'}},
 {id:'c',role:'model',content:{text:'符文引擎仍有散熱問題。青禾離開山門去找師傅。'}},
 {id:'s',role:'system',content:{text:'假人物通知：距離下月初一'}},
 {id:'d',role:'model',content:{text:'青禾後來在北城找到師傅。散熱方案尚未完成。'}},
];
const memories:WorldObservation[]=[
 {id:'m1',kind:'relationship',title:'青禾與古洞',summary:'青禾與旅人合作。',sourceMessageIds:['a']},
 {id:'m2',kind:'event',title:'符文研究',summary:'提出假設，不是實驗結果。',sourceMessageIds:['b','c'],unresolved:true},
 {id:'m3',kind:'event',title:'北城重逢',summary:'青禾找到師傅。',sourceMessageIds:['d']},
 {id:'m4',kind:'event',title:'壞引用',summary:'不應出現。',sourceMessageIds:['s']},
 {id:'m5',kind:'event',title:'未來事件',summary:'不應洩漏。',sourceMessageIds:['future']},
];
test('read model derives chronological source-backed records without mutating or importing chat',()=>{
 const snapshot=JSON.stringify([h,memories]);
 const model=buildWorldReadModel(h,memories);
 assert.equal(model.sources.size,4);
 assert.equal(model.records.length,3);
 assert.equal(model.rejected,2);
 assert.deepEqual(model.records[1].sourceIds,['b','c']);
 assert.equal(model.records[1].first,1);
 assert.equal(model.records[1].last,2);
 assert.equal(JSON.stringify([h,memories]),snapshot);
});
test('historical replay cannot use future or cross-branch source references',()=>{
 const prefix=buildWorldReadModel(h.slice(0,3),memories);
 assert.equal(prefix.records.length,2);
 const recall=compileWorldRecall(prefix,'青禾的往事');
 assert.match(recall,/古洞/);
 assert.doesNotMatch(recall,/北城|未來事件|距離下月初一/);
});
test('open threads and source excerpts stay available with a new short user input',()=>{
 const recall=compileWorldRecall(buildWorldReadModel(h,memories),'繼續研究符文');
 assert.match(recall,/符文研究/);
 assert.match(recall,/open/);
 assert.match(recall,/不是實驗結果/);
 assert.match(recall,/散熱問題/);
 assert.match(recall,/NOT authoritative current values/);
 assert.doesNotMatch(recall,/壞引用/);
});
test('large history produces a bounded prompt and no mutations',()=>{
 const big=Array.from({length:600},(_,i)=>({id:'id'+i,role:'model' as const,content:{text:'舊世界事件符文及山門狀態'.repeat(100)}}));
 const records=big.map((s,i)=>({id:'m'+i,kind:'event',title:'符文事件'+i,summary:'研究仍未完成。'.repeat(35),sourceMessageIds:[s.id],unresolved:i%2===0}));
 const compiled=compileWorldRecall(buildWorldReadModel(big,records),'山門符文',4000);
 assert.ok(compiled.length<=4000);
 assert.equal(big.length,600);
});
test('Worldline narrator receives actual saved memory and bypasses automatic NPC promotion',()=>{
 const app=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(app,/compileWorldRecall\(buildWorldReadModel\(memoryManager\.peekChatHistory\(conversationKey\), persona\.memories \|\| \[\]\)/);
 assert.match(app,/request\.mode === 'character' && !getActiveWorldline\(request\.conversationKey, false\) && !isWorldlineNarrator\(request\)\) \{\s*const proposals = createObservedNpcPromotionProposals/);
 assert.match(app,/const narrator = isWorldlineNarrator\(request\)/);
});

test('Worldline stories bypass contextual photo and cast proposals but keep manual photo flow',()=>{
 const app=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(app,/const allowContextActions = !getActiveWorldline\(conversationKey, false\)/);
 assert.match(app,/allowContextActions && isExplicitCharacterPhotoRequest\(userMessage\)/);
 assert.match(app,/!allowContextActions\|\|conversationKey===NATIVE_SYNC_KEY\?null:createExplicitNpcPromotionProposal/);
 assert.match(app,/generated\.npcCandidate && !getActiveWorldline\(request\.conversationKey, false\)/);
 assert.match(app,/if \(request\.mode === 'photo' \|\| \(request\.mode === 'character' && request\.characterPhotoRequest\)\)/);
 assert.match(app,/characterPhotoRequest: true,/);
});
