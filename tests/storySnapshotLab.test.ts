import test from 'node:test';
import assert from 'node:assert/strict';
import {captureStorySnapshot,restoreStorySnapshot} from '../storySnapshotLab.js';
import {WORLDLINE_SETTING_KEY,makeWorldline,recordWorldlineTurn,updateWorldlineRegistry,getWorldline} from '../worldline.js';
import {WORLD_LEDGER_KEY,emptyLedger,appendWorldBatches,parseWorldExtraction,compileWorldLedger} from '../worldLedger.js';
import {saveDirector,readDirector} from '../worldlineDirector.js';
import {saveWorldline2Fixed,saveWorldline2Variable,readFullPromptSettings} from '../worldline2Prompt.js';
import type {ChatMessage} from '../managers.js';
const msg=(n:number,role:'user'|'model',text:string):ChatMessage=>({id:'20000000-0000-4000-8000-'+String(n).padStart(12,'0'),createdAt:1000+n,role,content:{text,...(role==='model'?{worldlineStoryTurn:true}:{})}});
const history=[msg(1,'user','【世界線開局】\n進入村落'),msg(2,'model','旅人取得青石。'),msg(3,'user','進入古塔'),msg(4,'model','旅人取得紅寶石。')];
function device(){
 const map=new Map<string,string>();
 let failure:string|undefined;
 const store={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{if(k===failure){failure=undefined;throw Error('quota');}map.set(k,v)},removeItem:(k:string)=>{map.delete(k)}};
 return {store,map,fail:(k:string)=>{failure=k}};
}
function seed(){
 const d=device();
 let w=makeWorldline('w',{title:'古塔',genre:'fantasy',premise:'尋找遺物'},1000);
 for(let i=0;i<history.length;i+=2)w=recordWorldlineTurn(w,history[i].content.text!,history[i+1].content.text!,1003+i,history[i+1].id);
 d.store.setItem(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(null,'w',w,1010)));
 const obs=[{sourceId:history[1].id,quote:'取得青石',kind:'inventory',subject:'旅人',key:'石頭',value:'青石',state:'established'},{sourceId:history[3].id,quote:'取得紅寶石',kind:'inventory',subject:'旅人',key:'寶石',value:'紅寶石',state:'established'}];
 d.store.setItem(WORLD_LEDGER_KEY,JSON.stringify(appendWorldBatches(emptyLedger(),'w',parseWorldExtraction(JSON.stringify({observations:obs}),history,1010),history)));
 saveDirector(d.store,'w','standing','使用繁體中文',()=> 'note-a');
 saveWorldline2Fixed(d.store,'w','固定寫作設定');
 saveWorldline2Variable(d.store,'w',2,'古塔情景');
 return d;
}
test('actual Worldline state, director, fixed and variable prompts round trip to another device',async()=>{
 const a=seed(),b=device(),snapshot=await captureStorySnapshot(a.store,'w',history);
 assert.equal(snapshot.record.world?.turnCount,2);
 assert.equal(snapshot.prompt.fixedPrompt,'固定寫作設定');
 assert.equal(snapshot.prompt.variableOverride?.text,'古塔情景');
 assert.equal(Object.values(snapshot.ledger).flatMap(b=>b.observations).length,2);
 assert.equal(await restoreStorySnapshot(b.store,'w',history,snapshot),'restored');
 assert.deepEqual(await captureStorySnapshot(b.store,'w',history),snapshot);
 assert.equal(await restoreStorySnapshot(b.store,'w',history,snapshot),'already-restored');
});
test('recall removes obsolete chronicle and evidence, clears variable and preserves fixed prompt',async()=>{
 const a=seed(),b=device(),remaining=history.slice(0,2);
 const snapshot=await captureStorySnapshot(a.store,'w',remaining);
 assert.equal(snapshot.record.world?.turnCount,1);assert.equal(snapshot.prompt.variableOverride,undefined);
 assert.equal(snapshot.prompt.fixedPrompt,'固定寫作設定');assert.equal(Object.values(snapshot.ledger).flatMap(b=>b.observations).length,1);
 await restoreStorySnapshot(b.store,'w',remaining,snapshot);
 assert.match(compileWorldLedger(b.store.getItem(WORLD_LEDGER_KEY),'w',remaining,'旅人'),/青石/);
 assert.doesNotMatch(JSON.stringify(snapshot),/紅寶石|古塔情景/);
 await assert.rejects(restoreStorySnapshot(device().store,'w',remaining,await captureStorySnapshot(a.store,'w',history)),/HISTORY_MISMATCH/);
});
test('unrelated story is preserved and conflicting local settings are not overwritten',async()=>{
 const a=seed(),b=device(),snapshot=await captureStorySnapshot(a.store,'w',history);
 const other=makeWorldline('other',{title:'Other',genre:'fantasy',premise:'Different'},1000);
 b.store.setItem(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(null,'other',other,1001)));
 await restoreStorySnapshot(b.store,'w',history,snapshot);
 assert.equal(getWorldline(b.store.getItem(WORLDLINE_SETTING_KEY),'other')?.title,'Other');
 saveWorldline2Fixed(b.store,'w','Different local edit');
 const old=await captureStorySnapshot(b.store,'w',history);
 await assert.rejects(restoreStorySnapshot(b.store,'w',history,snapshot),/LOCAL_CONFLICT/);
 assert.equal(readFullPromptSettings(b.store,'w').fixedPrompt,'Different local edit');
 assert.equal(await restoreStorySnapshot(b.store,'w',history,snapshot,old),'restored');
 assert.equal(readDirector(b.store,'w').standing?.id,'note-a');
});
test('failed snapshot restore rolls back earlier storage writes',async()=>{
 const b=device(),snapshot=await captureStorySnapshot(seed().store,'w',history);
 b.fail(WORLD_LEDGER_KEY);
 await assert.rejects(restoreStorySnapshot(b.store,'w',history,snapshot),/quota/);
 assert.equal(b.map.size,0);
});
test('malformed remote preference or stale ledger is rejected before writes',async()=>{
 const snapshot=await captureStorySnapshot(seed().store,'w',history),b=device();
 await assert.rejects(restoreStorySnapshot(b.store,'w',history,{...snapshot,prompt:{...snapshot.prompt,variableOverride:{turn:99,text:'bad'}}}),/PREFERENCES_INVALID/);
 const bad={...snapshot,ledger:{...snapshot.ledger,bad:{sourceId:'bad',fingerprint:'bad',at:1000,observations:[]}}};
 await assert.rejects(restoreStorySnapshot(b.store,'w',history,bad),/LEDGER_INVALID/);
 assert.equal(b.map.size,0);
});
