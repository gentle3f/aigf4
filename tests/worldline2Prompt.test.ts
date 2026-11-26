import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySystemTexts,getSystemTexts,readFullPromptSettings,writeFullPromptSettings,resolveWorldline2Parts,saveWorldline2Fixed,saveWorldline2Variable,composeWorldline2Parts} from '../worldline2Prompt.js';
import type {VeniceMessage} from '../venice.js';
test('complete system text including retry is editable; no user message is changed',()=>{
 const messages:VeniceMessage[]=[{role:'system',content:'Default instructions'},{role:'system',content:'Retry instructions'},{role:'user',content:'Continue the story'}];
 const long='A fictional world. '.repeat(2000);
 const edited=applySystemTexts(messages,[long,'']);
 assert.deepEqual(getSystemTexts(edited),[long,'']);
 assert.equal(edited[2],messages[2]);
 assert.equal(messages[0].content,'Default instructions');
});
test('full prompt settings are per-world and empty prompt is a valid saved value',()=>{
 const values=new Map<string,string>();
 const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 assert.deepEqual(readFullPromptSettings(store,'a'),{review:true});
 writeFullPromptSettings(store,'a',{review:false,saved:''});
 assert.deepEqual(readFullPromptSettings(store,'a'),{review:false,saved:''});
 assert.deepEqual(readFullPromptSettings(store,'b'),{review:true});
});
test('single and group generation use the actual edited request before provider call',()=>{
 const s=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.equal((s.match(/await editWorldline2Request\(request\.conversationKey,messages,request\.controller\.signal\)/g)||[]).length,2);
 assert.equal((s.match(/messages\.splice\(0,messages\.length,\.\.\.edited\)/g)||[]).length,2);
});

test('fixed prompt edits persist while variable context follows subsequent turns',()=>{
 const values=new Map<string,string>();
 const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 const initial={fixed:'Default writing rules',variable:'Scene one',turn:1};
 writeFullPromptSettings(store,'a',{review:false,saved:'Old full system snapshot',worldContext:'Old world snapshot'});
 saveWorldline2Fixed(store,'a','Custom writing rules');
 saveWorldline2Variable(store,'a',1,'Edited scene');
 assert.deepEqual(resolveWorldline2Parts(store,'a',initial),{fixed:'Custom writing rules',variable:'Edited scene',turn:1});
 const next={...initial,variable:'Scene two and new memories',turn:2};
 assert.equal(composeWorldline2Parts(resolveWorldline2Parts(store,'a',next)),'Custom writing rules\n\nScene two and new memories');
 assert.deepEqual(resolveWorldline2Parts(store,'b',next),next);
 assert.equal(readFullPromptSettings(store,'a').saved,'Old full system snapshot');
 assert.equal(readFullPromptSettings(store,'a').worldContext,'Old world snapshot');
 saveWorldline2Fixed(store,'a','');
 assert.equal(resolveWorldline2Parts(store,'a',next).fixed,'');
 saveWorldline2Fixed(store,'a',undefined);
 saveWorldline2Variable(store,'a',2,'');
 assert.equal(resolveWorldline2Parts(store,'a',next).variable,'');
 saveWorldline2Variable(store,'a',2,undefined);
 assert.deepEqual(resolveWorldline2Parts(store,'a',next),next);
});
test('director settings wire editable fixed and per-turn variable sections to generation',()=>{
 const ui=readFileSync(new URL('../features/worldlineDirectorUi.ts',import.meta.url),'utf8');
 const index=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/\.readOnly\s*=\s*true/);
 assert.match(ui,/saveWorldline2Fixed\(localStorage,key,value\)/);
 assert.match(ui,/saveWorldline2Variable\(localStorage,key,previewContext\(\)\.turn,value\)/);
 assert.match(index,/resolveWorldline2Parts\(localStorage,key,generated\)/);
});
