import test from 'node:test';
import assert from 'node:assert/strict';
import {readDirector,saveDirector,consumeDirectorNext,formatDirector} from '../worldlineDirector.js';
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
 assert.match(s,/memoryManager\.addMessage\(request\.conversationKey, 'model', botContent\);\s*if\(request.mode==='character'&&!request.vpsTurn\?\.identity.worldDigest&&request.director\?\.next\)/);
 assert.match(s,/if\(used&&director.next\?\.id===used\)consumeDirectorNext\(localStorage,r.conversationKey,director\)/);
 assert.doesNotMatch(s,/model:\s*DEFAULT_CHAT_MODEL_SETTINGS\.primary\s*\|\|\s*VENICE_CHAT_MODEL/);
 assert.match(formatDirector({next:{id:'x',text:'Keep the same location'}}),/cannot override content boundaries/);
});
