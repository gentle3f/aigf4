import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryManager} from '../managers.js';
import {encodeChatHistoryStorage,decodeChatHistoryStorage} from '../chatHistoryStorage.js';
import {createDurableChatTurn} from '../durableChatTurn.js';
import type {ChatMessage} from '../managers.js';
const user='12345678-1234-4234-8234-123456789abc',job='12345678-1234-4234-8234-123456789abd',reply='12345678-1234-4234-8234-123456789abe';
const key='vps-test-conversation',turn={conversationKey:key,personaKey:key,userMessageId:user};
function setup(){
 let fail=false;
 const map=new Map<string,string>([['chatHistories',encodeChatHistoryStorage({[key]:[{id:user,role:'user',createdAt:1,content:{text:'fixture'}}]})]]);
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{if(fail&&k==='chatHistories')throw Error('quota');map.set(k,v)},removeItem:(k:string)=>map.delete(k)};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
 return {storage,map,setFail:(v:boolean)=>{fail=v}};
}
test('real history manager durable commit and repeat across reload',()=>{
 const f=setup();let m=new MemoryManager();m.persistVpsChatTurnUser(key,user);m.persistVpsChatTurnReply(key,user,reply,{text:'OK'});
 m=new MemoryManager();m.persistVpsChatTurnReply(key,user,reply,{text:'OK'});
 const stored=decodeChatHistoryStorage<Record<string,ChatMessage[]>>(f.map.get('chatHistories')!);
 assert.equal(stored[key].filter(x=>x.id===reply).length,1);assert.equal(stored[key].at(-1)?.content.text,'OK');
});
test('quota failure does not append in-memory reply or falsely confirm durable write',()=>{
 const f=setup();const m=new MemoryManager();f.setFail(true);
 assert.throws(()=>m.persistVpsChatTurnReply(key,user,reply,{text:'OK'}),/quota/);
 assert.ok(!m.peekChatHistory(key).some(x=>x.id===reply));assert.throws(()=>m.confirmVpsChatTurnMessage(key,reply,'model'),/NOT_DURABLE/);
 f.setFail(false);m.persistVpsChatTurnReply(key,user,reply,{text:'OK'});assert.equal(m.peekChatHistory(key).filter(x=>x.id===reply).length,1);
});
test('journal + real MemoryManager survive reload, retain result on failed durable write',async()=>{
 const f=setup();const payload={model:'glm-5-3-flash-uncensored',messages:[{role:'user' as const,content:'fixture'}]};
 const calls:string[]=[];
 const build=()=>{const m=new MemoryManager();const ids=[job,reply];return createDurableChatTurn({storage:f.storage,newId:()=>ids.shift()!,lock:fn=>fn(),history:{read:k=>m.peekChatHistory(k),persistUser:async t=>m.persistVpsChatTurnUser(t.conversationKey,t.userMessageId),persistReply:async(r,text)=>m.persistVpsChatTurnReply(r.conversationKey,r.userMessageId,r.replyId,{text}),confirmReply:async r=>m.confirmVpsChatTurnMessage(r.conversationKey,r.replyId,'model')},transport:{submit:async j=>{calls.push('POST');return {job_id:j,status:'queued'}},get:async j=>{calls.push('GET');return {job_id:j,status:'done',result:{choices:[{message:{content:'OK'}}]}}}}})};
 await build().submit(turn,payload);let c=build();let r=(await c.resume())!;f.setFail(true);await assert.rejects(c.apply(r.receipt,r.job,'OK'),/quota/);assert.ok(c.pending());
 f.setFail(false);c=build();r=(await c.resume())!;await c.apply(r.receipt,r.job,'OK');assert.equal(c.pending(),null);
 assert.equal(new MemoryManager().peekChatHistory(key).filter(x=>x.id===reply).length,1);assert.deepEqual(calls,['POST','GET','GET']);
});
