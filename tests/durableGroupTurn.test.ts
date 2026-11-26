import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager,type ChatRoom} from '../roomManager.js';
import {MemoryManager,type Persona} from '../managers.js';
import {encodeChatHistoryStorage} from '../chatHistoryStorage.js';
import {createDurableChatTurn} from '../durableChatTurn.js';
import {createGroupCommit,digestGroupContext} from '../durableGroupTurn.js';
import type {PilotJob} from '../generationQueuePilot.js';
const key='room-vps-fixture',user='12345678-1234-4234-8234-123456789ab1',job='12345678-1234-4234-8234-123456789ab2',reply='12345678-1234-4234-8234-123456789ab3';
const persona:Persona={name:'Fixture',emoji:'x',gender:'female',description:'Synthetic',prompt:'Fixture',greeting:'Hi',avatarPrompt:'',avatarUrl:null};
const room:ChatRoom={id:key,type:'group',title:'Fixture',description:'Fixture',leadMemberId:'one',members:['one','two'].map(id=>({id,persona:{...persona,name:id},joinedAt:1,soul:[],memories:[]})),scene:{id:'scene-1',location:'home',realityLayer:'physical',realityEpochId:'epoch-1',presentMemberIds:['one','two'],summary:'old',unresolved:[],startedAt:1},sharedSoul:[],sharedMemories:[],createdAt:1,updatedAt:1,lastSummarizedUserMessageCount:0};
const result:PilotJob={job_id:job,status:'done',result:{choices:[{message:{content:'Fixture reply'}}]}};
async function fixture(){
 const map=new Map<string,string>([['chatHistories',encodeChatHistoryStorage({[key]:[{id:user,role:'user',createdAt:1,content:{text:'fixture'}}]})]]);
 let failRoom=false,failHistory=false,failClear=false;const calls:string[]=[];
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{if((failRoom&&k==='aigf4RoomsV2')||(failHistory&&k==='chatHistories'))throw Error('quota');map.set(k,v)},removeItem:(k:string)=>{if(failClear&&k==='aigfVpsChatTurnV1')throw Error('crash');map.delete(k)}};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
 const initial=new RoomManager();initial.saveRoom(room);
 const identity={conversationKey:key,personaKey:'one',userMessageId:user,roomDigest:await digestGroupContext(initial.getRoom(key)!),roomMemberId:'one'};
 const build=()=>{
  const rm=new RoomManager(),mm=new MemoryManager();
  const group=createGroupCommit({readRoom:id=>rm.getRoom(id),readHistory:id=>mm.peekChatHistory(id),writeReply:(r,c)=>mm.persistVpsChatTurnReply(r.conversationKey,r.userMessageId,r.replyId,c),confirmReply:r=>mm.confirmVpsChatTurnMessage(r.conversationKey,r.replyId,'model'),confirmScene:(id,j)=>rm.confirmVpsSceneCommit(id,j),writeScene:(id,j,s,scene)=>rm.persistVpsSceneCommit(id,j,s,scene)});
  const ids=[job,reply];
  const c=createDurableChatTurn({storage,lock:fn=>fn(),newId:()=>ids.shift()!,transport:{submit:async j=>{calls.push('POST');return {job_id:j,status:'queued'}},get:async()=>{calls.push('GET');return result}},history:{read:k=>mm.peekChatHistory(k),persistUser:async r=>mm.persistVpsChatTurnUser(r.conversationKey,r.userMessageId),persistReply:async(r,text)=>group.persistReply(r,{text,segments:[{type:'dialogue',speakerId:'one',text}]},{...rm.getRoom(key)!.scene,location:'park',summary:'new'}),confirmReply:group.confirm}});
  return {c,rm,mm};
 };
 const submit=async()=>{const a=build();await a.c.submit(identity,{model:'glm-5-3-flash-uncensored',messages:[{role:'user',content:'fixture'}]});return a};
 return {build,submit,calls,failRoom:(v:boolean)=>failRoom=v,failHistory:(v:boolean)=>failHistory=v,failClear:(v:boolean)=>failClear=v};
}
test('group reply and room scene durable, stable ID, no duplicate',async()=>{const f=await fixture();const a=await f.submit();await a.c.apply(a.c.pending()!,result,'Fixture reply');const b=f.build();assert.equal(b.rm.getRoom(key)?.scene.location,'park');assert.equal(b.rm.confirmVpsSceneCommit(key,job),true);assert.equal(b.mm.peekChatHistory(key).filter(m=>m.id===reply).length,1);assert.equal(b.c.pending(),null);});
test('room quota failure after reply persists: reload repairs scene without network or duplicate',async()=>{const f=await fixture();const a=await f.submit();f.failRoom(true);await assert.rejects(a.c.apply(a.c.pending()!,result,'Fixture reply'),/quota/);assert.equal(a.mm.peekChatHistory(key).filter(m=>m.id===reply).length,1);assert.equal(a.rm.getRoom(key)?.scene.location,'home');assert.ok(a.c.pending());f.failRoom(false);const b=f.build();assert.equal(await b.c.reconcileApplied(),true);assert.equal(b.rm.getRoom(key)?.scene.location,'park');assert.equal(b.mm.peekChatHistory(key).filter(m=>m.id===reply).length,1);assert.deepEqual(f.calls,['POST']);});
test('history write fails: scene never advances',async()=>{const f=await fixture();const a=await f.submit();f.failHistory(true);await assert.rejects(a.c.apply(a.c.pending()!,result,'Fixture reply'),/quota/);assert.equal(a.rm.getRoom(key)?.scene.location,'home');assert.ok(a.c.pending());assert.equal(a.mm.peekChatHistory(key).filter(m=>m.id===reply).length,0);});
test('edited room context blocks stale reply',async()=>{const f=await fixture();const a=await f.submit();a.rm.updateRoom(key,r=>{r.scene.location='new room'});await assert.rejects(a.c.apply(a.c.pending()!,result,'Fixture reply'),/GROUP_CONTEXT_CHANGED/);assert.equal(a.rm.getRoom(key)?.scene.location,'new room');assert.equal(a.mm.peekChatHistory(key).filter(m=>m.id===reply).length,0);});
test('edited room after partial commit blocks old scene overwrite',async()=>{const f=await fixture();const a=await f.submit();f.failRoom(true);await assert.rejects(a.c.apply(a.c.pending()!,result,'Fixture reply'),/quota/);f.failRoom(false);const b=f.build();b.rm.updateRoom(key,r=>{r.scene.location='edited'});await assert.rejects(b.c.reconcileApplied(),/GROUP_CONTEXT_CHANGED/);assert.equal(b.rm.getRoom(key)?.scene.location,'edited');assert.ok(b.c.pending());});
test('crash after scene commit before clearing receipt: no repeat scene write',async()=>{const f=await fixture();const a=await f.submit();f.failClear(true);await assert.rejects(a.c.apply(a.c.pending()!,result,'Fixture reply'),/crash/);const before=a.rm.getRoom(key)?.updatedAt;f.failClear(false);const b=f.build();assert.equal(await b.c.reconcileApplied(),true);assert.equal(b.rm.getRoom(key)?.updatedAt,before);assert.deepEqual(f.calls,['POST']);});
