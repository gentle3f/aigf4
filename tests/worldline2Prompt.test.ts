import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySystemTexts,getSystemTexts,readFullPromptSettings,writeFullPromptSettings,resolveWorldline2Context,saveWorldline2Context} from '../worldline2Prompt.js';
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

test('bottom worldline prompt can be saved, completely cleared and restored',()=>{
 const values=new Map<string,string>();
 const store={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)},removeItem:(k:string)=>{values.delete(k)}};
 const original='Current world and memory';
 writeFullPromptSettings(store,'a',{review:false,saved:'Old full system snapshot'});
 saveWorldline2Context(store,'a','User-edited world context');
 assert.equal(resolveWorldline2Context(store,'a',original),'User-edited world context');
 assert.equal(readFullPromptSettings(store,'a').saved,undefined);
 assert.equal(readFullPromptSettings(store,'a').review,false);
 assert.equal(resolveWorldline2Context(store,'b',original),original);
 saveWorldline2Context(store,'a','');
 assert.equal(resolveWorldline2Context(store,'a',original),'');
 saveWorldline2Context(store,'a',undefined);
 assert.equal(resolveWorldline2Context(store,'a',original),original);
});
test('bottom worldline editor saves actual generated context override',()=>{
 const ui=readFileSync(new URL('../features/worldlineDirectorUi.ts',import.meta.url),'utf8');
 const index=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/preview\.readOnly\s*=\s*true/);
 assert.match(ui,/saveWorldline2Context\(localStorage,key,preview\.value\)/);
 assert.match(index,/resolveWorldline2Context\(localStorage,key,generated\)/);
});
