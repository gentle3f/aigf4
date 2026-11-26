import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeWorldline,recordWorldlineTurn,reconcileWorldlineChronicle,buildWorldlineVariablePrompt,updateWorldlineRegistry,getWorldline} from '../worldline.js';
import {emptyLedger,appendWorldBatches,parseWorldExtraction,compileWorldLedger} from '../worldLedger.js';
import {resolveWorldline2Parts,saveWorldline2Fixed,saveWorldline2Variable} from '../worldline2Prompt.js';
const msg=(id:string,role:'user'|'model',text:string)=>({id,role,content:{text}});
const u1=msg('u1','user','進入村落'),a1=msg('a1','model','旅人取得青石。'),u2=msg('u2','user','進入古塔'),a2=msg('a2','model','旅人取得紅寶石。');
const initial=()=>makeWorldline('w',{title:'古塔',genre:'fantasy',premise:'尋找古代遺物'},1000);
const world=()=>recordWorldlineTurn(recordWorldlineTurn(initial(),u1.content.text,a1.content.text,1001,'a1'),u2.content.text,a2.content.text,1002,'a2');
test('recall restores world count and timeline and removes recalled ledger evidence',()=>{
 const w=world(), history=[u1,a1,u2,a2], remaining=[u1,a1];
 const rows=[{sourceId:'a1',quote:'取得青石',kind:'inventory',subject:'旅人',key:'石頭',value:'青石',state:'established'},{sourceId:'a2',quote:'取得紅寶石',kind:'inventory',subject:'旅人',key:'寶石',value:'紅寶石',state:'established'}];
 const ledger=appendWorldBatches(emptyLedger(),'w',parseWorldExtraction(JSON.stringify({observations:rows}),history,1003),history);
 const restored=reconcileWorldlineChronicle(w,remaining,1004);
 assert.equal(restored.turnCount,1);assert.equal(restored.chronicle[0].sourceMessageId,'a1');
 const variable=buildWorldlineVariablePrompt(restored)+'\n'+compileWorldLedger(ledger,'w',remaining,'旅人');
 assert.match(variable,/game turn: 1/);assert.match(variable,/青石/);assert.doesNotMatch(variable,/紅寶石|進入古塔/);
 assert.equal(reconcileWorldlineChronicle(restored,remaining),restored);
 const next=recordWorldlineTurn(restored,'留在村落','旅人取得白石。',1005,'new-reply');
 assert.equal(next.turnCount,2);assert.equal(next.chronicle.at(-1)?.sourceMessageId,'new-reply');
});
test('legacy chronicle without source IDs repairs after recall and preserves explicit world settings',()=>{
 const w={...world(),location:'玩家設定地點',facts:['玩家確認規則'],chronicle:world().chronicle.map(({sourceMessageId,...entry})=>entry)};
 const restored=reconcileWorldlineChronicle(w,[u1,a1]);
 assert.equal(restored.turnCount,1);assert.equal(restored.location,w.location);assert.deepEqual(restored.facts,w.facts);
 assert.equal(getWorldline(updateWorldlineRegistry(null,'w',restored),'w')?.chronicle[0].sourceMessageId,'a1');
});
test('recall clears variable override so reused turn number cannot revive abandoned context',()=>{
 const values=new Map<string,string>();const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 saveWorldline2Fixed(store,'w','Fixed rules');saveWorldline2Variable(store,'w',2,'Old scene');
 saveWorldline2Variable(store,'w',1,undefined);
 assert.deepEqual(resolveWorldline2Parts(store,'w',{fixed:'Default',variable:'New scene',turn:2}),{fixed:'Fixed rules',variable:'New scene',turn:2});
});
test('recall action and runtime reconciliation are wired to the active conversation',()=>{
 const actions=readFileSync(new URL('../features/conversationActions.ts',import.meta.url),'utf8');
 const index=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.match(actions,/reconcileWorldlineChronicle\(world,result\.remaining\)/);
 assert.match(actions,/saveWorldline2Variable\(localStorage,conversationKey,restored\.turnCount,undefined\)/);
 assert.match(index,/reconcileWorldlineChronicle\(world,memoryManager\.peekChatHistory\(conversationKey\)\)/);
});
