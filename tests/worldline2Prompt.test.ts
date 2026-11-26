import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySystemTexts,getSystemTexts,readFullPromptSettings,writeFullPromptSettings} from '../worldline2Prompt.js';
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
