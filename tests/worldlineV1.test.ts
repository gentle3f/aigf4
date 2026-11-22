import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
    WORLDLINE_SETTING_KEY,WORLDLINE_SCHEMA,makeWorldline,normalizeWorldline,
    getWorldline,parseWorldlineRegistry,updateWorldlineRegistry,
    mergeWorldlineRegistries,recordWorldlineTurn,buildWorldlinePrompt,buildWorldlineOpening,
} from '../worldline.js';
import {PERSISTED_APP_SETTING_KEYS} from '../appSettings.js';
const file=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const make=()=>makeWorldline('room-abc',{
 title:'逆命九天',genre:'xianxia',premise:'轉生廢柴，想活出不受控制的人生',
 goldenFinger:'命運推演系統',mainQuest:'七日內查出宗門內奸',
 protagonist:'一個有自己選擇權的成年人',
 relationshipMode:'adult',tone:'story',
},1000);
test('Worldline generates persistent creative premise without overriding chosen powers or protagonist',()=>{
 const world=make();
 assert.equal(world.goldenFinger,'命運推演系統');
 assert.equal(world.mainQuest,'七日內查出宗門內奸');
 assert.equal(world.protagonist,'一個有自己選擇權的成年人');
 assert.equal(world.relationshipMode,'adult');
 assert.equal(world.turnCount,0);
 assert.match(buildWorldlineOpening(world),/命運推演系統/);
 assert.match(buildWorldlinePrompt(world),/長篇|SERIALIZED STORY/);
 assert.match(buildWorldlinePrompt(world),/NPCs/);
 assert.match(buildWorldlinePrompt(world),/golden finger/);
 assert.match(buildWorldlinePrompt(world),/consent/);
});
test('Worldline connects to existing Supabase state settings without a new schema',()=>{
 assert.ok(PERSISTED_APP_SETTING_KEYS.includes(WORLDLINE_SETTING_KEY));
 assert.equal(WORLDLINE_SCHEMA,'aigf-worldline-registry-v1');
 const world=make();
 const updated=updateWorldlineRegistry(null,world.conversationKey,world,2000);
 assert.deepEqual(getWorldline(JSON.stringify(updated),'room-abc'),normalizeWorldline({...world,updatedAt:2000}));
 assert.equal(getWorldline(updated,'other-room'),null);
 assert.equal(parseWorldlineRegistry('not-json').schema,WORLDLINE_SCHEMA);
});
test('Cloud merge selects newer world state, safely preserves separate groups, and honors deletions',()=>{
 const a=make(),b=makeWorldline('room-other',{
 title:'下城',genre:'apocalypse',premise:'末世避難城市生存',goldenFinger:'時間回溯',
 },4000);
 let local=updateWorldlineRegistry(null,'room-abc',a,5000);
 const remote=updateWorldlineRegistry(null,'room-other',b,6000);
 const merged=mergeWorldlineRegistries(local,remote);
 assert.equal(getWorldline(merged,'room-abc')?.title,'逆命九天');
 assert.equal(getWorldline(merged,'room-other')?.title,'下城');
 const del=updateWorldlineRegistry(local,'room-abc',null,7000);
 assert.equal(getWorldline(mergeWorldlineRegistries(merged,del),'room-abc'),null);
 assert.equal(getWorldline(mergeWorldlineRegistries(del,local),'room-abc'),null);
 const newer=updateWorldlineRegistry(local,'room-abc',{...a,mainQuest:'找出失落星圖'},8000);
 assert.equal(getWorldline(mergeWorldlineRegistries(del,newer),'room-abc')?.mainQuest,'找出失落星圖');
});
test('Worldline chronicles each successful turn without inventing quests or auto advancing story day',()=>{
 let world=make();
 for(let i=0;i<25;i++)world=recordWorldlineTurn(world,'我去探索山門 '+i,'長老提出奇怪的測試 '+i,3000+i);
 assert.equal(world.turnCount,25);
 assert.equal(world.chronicle.length,14);
 assert.equal(world.chronicle[0].turn,12);
 assert.equal(world.location,'開局場景待揭曉');
 assert.equal(world.questProgress,'尚未展開');
 assert.match(buildWorldlinePrompt(world),/24/);
});
test('Saved facts and recurring NPC retain their own agenda without forced new group membership',()=>{
 const world=make();
 world.npcs=[{id:'npc1',name:'蘭若',role:'敵對宗門使者',motivation:'奪回家族寶器',relationship:'暫時互不信任'}];
 world.facts=['魔門令牌只能開啟一次'];
 world.inventory=['破舊劍匣'];
 world.threads=['宗門大比與家族糾紛'];
 const copy=normalizeWorldline(world);
 const prompt=buildWorldlinePrompt(copy);
 assert.match(prompt,/蘭若/);
 assert.match(prompt,/奪回家族寶器/);
 assert.match(prompt,/魔門令牌只能開啟一次/);
 assert.match(prompt,/破舊劍匣/);
 assert.match(prompt,/NPCs can be friends/i);
 assert.match(prompt,/not automatically join/i);
});
test('Paused world does not inject director prompt into normal chat',()=>{
 const world=make();
 assert.equal(buildWorldlinePrompt({...world,paused:true}),'');
 assert.equal(getWorldline(null,'room-abc'),null);
});
test('Worldline source has fresh-world and existing-room entrances and actual per-turn plumbing',()=>{
 const index=file('index.tsx'),panel=file('features/worldlineUi.ts');
 assert.match(index,/aigf-new-worldline-btn/);
 assert.match(index,/aigf-worldline-menu-btn/);
 assert.match(index,/openWorldline\('new'\)/);
 assert.match(index,/getActiveWorldline\(request\.conversationKey\)/);
 assert.match(index,/buildWorldlinePrompt\(world\)/);
 assert.match(index,/recordWorldlineTurn\(world, triggeringMessage, botContent\.text/);
 assert.match(index,/name: '世界敘述者'/);
 assert.match(index,/WORLD NARRATOR \/ GAME MASTER/);
 assert.match(panel,/buildWorldlineOpening\(world\)/);
 assert.match(panel,/將目前群組／角色帶入新世界/);
 assert.match(panel,/發動金手指/);
 assert.match(panel,/人物關係支線/);
 assert.match(panel,/記錄世界人物/);
 assert.match(panel,/setPersistedAppSetting|save\(key,world\)/);
});
test('Worldline local store rejects oversized and malformed input without touching conversations',()=>{
 const world=make();
 assert.throws(()=>makeWorldline('',{title:'a',genre:'custom',premise:'x'}));
 assert.throws(()=>makeWorldline('room',{title:'a',genre:'custom',premise:' '}));
 assert.equal(parseWorldlineRegistry('a'.repeat(300_000)).schema,WORLDLINE_SCHEMA);
 const malicious={schema:WORLDLINE_SCHEMA,records:{'room-abc':{updatedAt:999,world:{
  ...world,conversationKey:'wrong-room'
 }}}};
 assert.equal(getWorldline(malicious,'room-abc'),null);
 assert.equal(world.chronicle.length,0);
});
