import test from 'node:test';
import assert from 'node:assert/strict';
import {readDirector,saveDirector,consumeDirectorNext,formatDirector,effectiveNarrativeStyle,DEFAULT_NARRATIVE_STYLE,NARRATIVE_STYLE_PRESETS,CREATIVE_SECTIONS,effectiveCreativeSection,effectiveDirectorPreface,DEFAULT_DIRECTOR_PREFACE} from '../worldlineDirector.js';
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

test('separate creative sections are independently saved, previewed and restored',()=>{
 const {store,id}=fixture();
 saveDirector(store,'a','pacing','Slow scene changes',id);
 saveDirector(store,'a','characters','Distinct speaking styles',id);
 saveDirector(store,'a','next','Describe the forest',id);
 const snapshot=readDirector(store,'a');
 assert.match(formatDirector(snapshot),/Slow scene changes/);
 assert.match(formatDirector(snapshot),/Distinct speaking styles/);
 assert.match(formatDirector(snapshot),/cannot override content boundaries/);
 assert.equal(effectiveCreativeSection(readDirector(store,'b'),'pacing'),CREATIVE_SECTIONS[0].text);
 consumeDirectorNext(store,'a',snapshot);
 assert.equal(readDirector(store,'a').pacing?.text,'Slow scene changes');
 saveDirector(store,'a','pacing','',id);
 assert.equal(effectiveCreativeSection(readDirector(store,'a'),'pacing'),CREATIVE_SECTIONS[0].text);
 assert.equal(readDirector(store,'a').characters?.text,'Distinct speaking styles');
});
test('studio previews actual saved director formatter and uses individual reset controls',()=>{
 const s=readFileSync(new URL('../features/worldlineDirectorUi.ts',import.meta.url),'utf8');
 assert.match(s,/preview\.value=formatDirector\(readDirector\(localStorage,key\)\)/);
 assert.match(s,/preview\.readOnly=true/);
 assert.match(s,/saveDirector\(localStorage,key,section\.key,value\)/);
});

test('creative preface can be edited independently and reset; fixed rules remain unchanged',()=>{
 const {store,id}=fixture();
 const initial=formatDirector(readDirector(store,'a'));
 saveDirector(store,'a','preface','Tell the story as a historical chronicle',id);
 const edited=formatDirector(readDirector(store,'a'));
 assert.match(edited,/Tell the story as a historical chronicle/);
 assert.equal(edited.split('\n').slice(1).join('\n'),initial.split('\n').slice(1).join('\n'));
 assert.equal(effectiveDirectorPreface(readDirector(store,'b')),DEFAULT_DIRECTOR_PREFACE);
 saveDirector(store,'a','preface','',id);
 assert.equal(formatDirector(readDirector(store,'a')),initial);
});
