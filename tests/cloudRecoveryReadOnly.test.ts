import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudRecoveryFetch} from '../cloudRecoveryFetch.js';
import {SupabaseCloudSyncManager} from '../supabaseCloudSync.js';
import {MemoryManager} from '../managers.js';
import {RoomManager} from '../roomManager.js';
const base='https://fixture.supabase.co';
test('read-only transport permits existing password and refresh auth, exact reads, rejects all writes and cross-origin',async()=>{
 const calls:string[]=[];const f=createCloudRecoveryFetch(base,async(u,o)=>{calls.push(String(u));assert.equal(o?.redirect,'error');return new Response('{}')});
 for(const [path,method] of [['/rest/v1/wetapp_state','GET'],['/rest/v1/wetapp_messages','HEAD'],['/rest/v1/wetapp_media','GET'],['/storage/v1/object/authenticated/wetapp-private/fixture','GET'],['/auth/v1/token?grant_type=password','POST'],['/auth/v1/token?grant_type=refresh_token','POST']])await f(base+path,{method});
 for(const [path,method] of [['/rest/v1/wetapp_state','POST'],['/rest/v1/wetapp_messages','DELETE'],['/rest/v1/rpc/wetapp_save_state_if_revision','POST'],['/storage/v1/object/wetapp-private/fixture','POST'],['/storage/v1/object/wetapp-private','DELETE'],['/auth/v1/signup','POST'],['/auth/v1/user','PUT'],['/auth/v1/logout','POST'],['/rest/v1/unknown','GET'],['/storage/v1/object/public/wetapp-private/fixture','GET']])await assert.rejects(f(base+path,{method}),/READ_ONLY/);
 await assert.rejects(f('https://outside.invalid/rest/v1/wetapp_state'),/READ_ONLY/);
 await assert.rejects(f(new Request(base+'/rest/v1/wetapp_state',{method:'PATCH',body:'{}'})),/READ_ONLY/);
 assert.equal(calls.length,6);
});
function fixture(revisionChange=false){
 const map=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k)}});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
 const memory=new MemoryManager(),rooms=new RoomManager();let applied=0,reads=0;
 const sync=new SupabaseCloudSyncManager(memory,rooms,{onStateChange:()=>{},onRemoteApplied:()=>{applied++}},true) as any;
 const session={user:{id:'fixture-user',email:sync.getOwnerEmail()}};
 const messages=[{conversation_key:'cc',message_id:'fixture-id',position:0,created_at_ms:123,role:'user',speaker_id:null,content:{text:'Synthetic cloud message'}}];
 const payload={schemaVersion:1,customPersonas:{},diaries:{},interests:{},rooms:{version:2,rooms:[]},appSettings:{}};
 sync.client={from:(table:string)=>({select:(_cols:string)=>({maybeSingle:async()=>({data:{revision:revisionChange&&++reads>=3?2:1,payload,source_device_id:'other-device'},error:null}),order(){return this},range:async()=>({data:table==='wetapp_messages'?messages:[],error:null})})})};
 return {sync,memory,session,map,applied:()=>applied};
}
test('login does not restore or upload; explicit read-only pull restores original message ID; no repeated overwrite',async()=>{
 const f=fixture();await f.sync.applySession(f.session);assert.equal(f.applied(),0);assert.equal(f.sync.getState().phase,'synced');
 await assert.rejects(f.sync.syncNow(),/READ_ONLY/);assert.equal(await f.sync.pushLocalToCloud(),false);assert.equal(await f.sync.recoverCloudSafely(),false);assert.equal(await f.sync.pushPendingResearchTurns(),false);
 await f.sync.reloadFromCloud();assert.equal(f.applied(),1);assert.equal(f.memory.peekChatHistory('cc')[0]?.id,'fixture-id');
 await assert.rejects(f.sync.reloadFromCloud(),/未有聊天紀錄/);assert.equal(f.applied(),1);
});
test('cloud revision changed during read: block apply and preserve empty local state',async()=>{
 const f=fixture(true);await f.sync.applySession(f.session);await assert.rejects(f.sync.reloadFromCloud(),/REVISION_CHANGED/);assert.equal(f.applied(),0);assert.equal(f.memory.peekChatHistory('cc').length,0);
});
