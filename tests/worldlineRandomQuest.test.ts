import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildRandomMainQuestMessages, normalizeRandomMainQuest } from '../worldlineRandomQuest.js';
import type { RandomMainQuestInput } from '../worldlineRandomQuest.js';
const input:RandomMainQuestInput={
    title:'九天試煉',genre:'xianxia',
    premise:'轉生落魄門派弟子，世界各個宗門有獨立利益',
    protagonist:'隱姓埋名的成年劍修',
    goldenFinger:'可以看見每個重要抉擇的三條可能後果',
};
test('random main quest uses user-defined genre, world, hero and golden finger, not static plots',()=>{
    const messages=buildRandomMainQuestMessages(input);
    assert.equal(messages.length,2);
    assert.equal(messages[0].role,'system');
    assert.equal(messages[1].role,'user');
    const prompt=String(messages[1].content);
    assert.match(prompt,/九天試煉/);
    assert.match(prompt,/修仙／玄幻/);
    assert.match(prompt,/落魄門派弟子/);
    assert.match(prompt,/劍修/);
    assert.match(prompt,/三條可能後果/);
    assert.match(String(messages[0].content),/long-running MAIN STORY ARC/);
    assert.doesNotMatch(prompt,/固定主線模板/);
});
test('reroll actively avoids repeating the preceding main quest',()=>{
    const messages=buildRandomMainQuestMessages({...input,previousQuest:'上次修煉大會有人偷走劍譜'});
    assert.match(String(messages[1].content),/Do NOT repeat/);
    assert.match(String(messages[1].content),/偷走劍譜/);
});
test('generated main quest accepts a multi-paragraph original narrative with bounded size',()=>{
    const original='主線概述：宗門內部長老互相猜忌，一份古代契約忽然指向失落的前朝王庭。主角掌握三條命運分歧，但代價卻要由同伴付出。';
    const result=normalizeRandomMainQuest(original);
    assert.ok(result.includes('宗門內部'));
    assert.ok(result.includes('三條命運分歧'));
    assert.ok(!result.startsWith('主線概述：'));
    const long='這是一條相互牽動的世界主線與命運後果。'.repeat(60);
    assert.ok(Array.from(normalizeRandomMainQuest(long)).length<=520);
});
test('generator fails closed on empty, apology or incomplete content',()=>{
    assert.throws(()=>normalizeRandomMainQuest(''));
    assert.throws(()=>normalizeRandomMainQuest('抱歉，我無法提供這種劇情。'));
    assert.throws(()=>normalizeRandomMainQuest('第一章'));
});
test('Worldline UI supports reroll, auto-generate on blank, manual override and loading gate',()=>{
    const ui=readFileSync(new URL('../features/worldlineUi.ts',import.meta.url),'utf8');
    const app=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
    assert.match(ui,/AI 隨機生成主線/);
    assert.match(ui,/再抽一條新主線/);
    assert.match(ui,/if\(!quest\.value\.trim\(\)\)await generateQuest\(\)/);
    assert.match(ui,/if\(quest\.value\.trim\(\)!==previousQuest\)/);
    assert.match(ui,/if\(startInProgress\|\|generatingQuest\)return/);
    assert.match(app,/generateRandomQuest: async input =>/);
    assert.match(app,/generateChatTextWithTimeout\(/);
    assert.match(app,/normalizeRandomMainQuest\(result\.text\)/);
    assert.match(app,/temperature: 1\.04/);
});
