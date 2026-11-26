import test from 'node:test';
import assert from 'node:assert/strict';
import {readDirector,saveDirector,consumeDirectorNext,formatDirector,effectiveNarrativeStyle,DEFAULT_NARRATIVE_STYLE,NARRATIVE_STYLE_PRESETS} from '../worldlineDirector.js';
import {readFileSync} from 'node:fs';
function fixture(){const m=new Map<string,string>();let n=0;return {store:{getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)},removeItem:(k:string)=>{m.delete(k)}},id:()=>String(++n)};}
test('per-world standing and next-turn instructions persist, next consumed once after accepted response',()=>{
 const {store,id}=fixture();
 saveDirector(store,'a','standing','Slower pace',id);saveDirector(store,'a','next','Describe the room',id);
 const v=readDirector(store,'a');assert.match(formatDirector(v),/Slower pace/);assert.match(formatDirector(v),/Describe the room/);
 assert.deepEqual(readDirector(store,'b'),{});
 assert.equal(consumeDirectorNext(store,'a',v),true);
 assert.equal(consumeDirectorNext(store,'a',v),false);
 assert.equal(readDirector(store,'a').standing?.text,'Slower pace');assert.equal(readDirector(store,'a').next,undefined);
});
test('newly edited instruction is not consumed by old in-flight response; clearing is independent',()=>{
 const {store,id}=fixture();saveDirector(store,'a','next','First',id);const old=readDirector(store,'a');saveDirector(store,'a','next','Second',id);assert.equal(consumeDirectorNext(store,'a',old),false);assert.equal(readDirector(store,'a').next?.text,'Second');
 saveDirector(store,'a','standing','Long term',id);saveDirector(store,'a','next','',id);assert.equal(readDirector(store,'a').standing?.text,'Long term');assert.equal(readDirector(store,'a').next,undefined);
});
test('director preferences are shared by generation and review and are not added to transcript',()=>{
 const s=readFileSync(new URL('../index.tsx',import.meta.url),'utf8');
 assert.equal((s.match(/buildWorldlineRuntimeContext\(request.conversationKey,latestUserMessage,request.director\)/g)||[]).length,4);
 assert.match(s,/memoryManager\.addMessage\(request\.conversationKey, 'model', botContent\);\s*if\(request.mode==='character'&&request.director\?\.next\)/);
 assert.doesNotMatch(s,/model:\s*DEFAULT_CHAT_MODEL_SETTINGS\.primary\s*\|\|\s*VENICE_CHAT_MODEL/);
 assert.match(formatDirector({next:{id:'x',text:'Keep the same location'}}),/cannot override content boundaries/);
});

test('editable narrative style is per world, durable, resettable and preserves existing notes',()=>{
 const {store,id}=fixture();
 assert.equal(effectiveNarrativeStyle(readDirector(store,'a')),DEFAULT_NARRATIVE_STYLE);
 saveDirector(store,'a','standing','Short dialogue',id);
 saveDirector(store,'a','next','Describe the garden',id);
 saveDirector(store,'a','core',NARRATIVE_STYLE_PRESETS[2].text,id);
 const snapshot=readDirector(store,'a');
 assert.equal(effectiveNarrativeStyle(snapshot),NARRATIVE_STYLE_PRESETS[2].text);
 assert.match(formatDirector(snapshot),/Core narrative style/);
 assert.equal(effectiveNarrativeStyle(readDirector(store,'b')),DEFAULT_NARRATIVE_STYLE);
 assert.equal(consumeDirectorNext(store,'a',snapshot),true);
 assert.equal(effectiveNarrativeStyle(readDirector(store,'a')),NARRATIVE_STYLE_PRESETS[2].text);
 saveDirector(store,'a','core','',id);
 assert.equal(effectiveNarrativeStyle(readDirector(store,'a')),DEFAULT_NARRATIVE_STYLE);
 assert.equal(readDirector(store,'a').standing?.text,'Short dialogue');
 assert.match(formatDirector(readDirector(store,'a')),/cannot override content boundaries/);
 assert.throws(()=>saveDirector(store,'a','core','x'.repeat(1501),id));
});
