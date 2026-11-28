import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWorldIdeaMessages,parseWorldIdeas,ideaToWorldOptions,WORLD_TOPICS} from '../worldlineQuickStart.js';
import {makeWorldline,buildWorldlineOpening} from '../worldline.js';
const ideas=Array.from({length:3},(_,i)=>({title:'世界方案'+i,genre:'fantasy',premise:'在一座古老城鎮，玩家發現失落圖書館與獨立勢力互相爭奪資源。'+i,protagonist:'初來乍到嘅旅人',goldenFinger:'可以解讀失落文字',mainQuest:'調查失落圖書館嘅來源，發掘不同勢力真正目標，並探索未知文明。'}));
test('topic selection and optional preference generate three complete independent drafts in one model request',()=>{
 const messages=buildWorldIdeaMessages({topics:['修仙／玄幻','經營／建立勢力'],comment:'由普通人開始',previous:[]});
 assert.equal(messages.length,2);assert.match(messages[0].content as string,/exactly three/);
 assert.deepEqual(JSON.parse(messages[1].content as string),{topics:['修仙／玄幻','經營／建立勢力'],preferences:'由普通人開始',avoidRepeating:[]});
 assert.ok(WORLD_TOPICS.length>=10);
});
test('zero choices and reroll are supported without mandatory fields',()=>{
 const input=JSON.parse(buildWorldIdeaMessages({topics:[],comment:'',previous:parseWorldIdeas(JSON.stringify(ideas))})[1].content as string);
 assert.equal(input.topics.length,0);assert.equal(input.preferences,'');assert.equal(input.avoidRepeating.length,3);
});
test('validated drafts become existing Worldline settings and opening without a separate quest generation',()=>{
 for(const idea of parseWorldIdeas('```json\n'+JSON.stringify(ideas)+'\n```')){
  const world=makeWorldline('fixture',ideaToWorldOptions(idea),123);
  assert.equal(world.title,idea.title);assert.equal(world.mainQuest,idea.mainQuest);assert.equal(world.goldenFinger,idea.goldenFinger);
  assert.match(buildWorldlineOpening(world),/【世界線開局】/);
 }
 assert.throws(()=>parseWorldIdeas(JSON.stringify(ideas.slice(0,2))));
 assert.throws(()=>parseWorldIdeas(JSON.stringify([ideas[0],ideas[0],ideas[2]])));
 assert.throws(()=>parseWorldIdeas(JSON.stringify([{...ideas[0],mainQuest:''},ideas[1],ideas[2]])));
 assert.throws(()=>parseWorldIdeas('not json'));
});
test('new-world UI routes to quick start, with manual edit and explicit start only after a selection',()=>{
 const ui=readFileSync(new URL('../features/worldlineUi.ts',import.meta.url),'utf8');
 assert.match(ui,/if\(source==='new'\)openQuickStart\(deps\)/);
 assert.match(ui,/const results=await deps.generateWorldIdeas\(input\)/);
 assert.match(ui,/startWorld\(deps,dialog,ideaToWorldOptions\(idea\)\)/);
 assert.match(ui,/openStart\(deps,'new',ideaToWorldOptions\(idea\)\)/);
 assert.match(ui,/const key=attachKey\|\|deps.createNarratorConversation\(opts.title\)/);
});
