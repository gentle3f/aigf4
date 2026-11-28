import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoryManager,type ChatMessage} from '../managers.js';
import {applyHistoryEdits,historyEdits,isHistoryPointer,decodeHistoryPointer,readHistoryBase} from '../largeHistoryStore.js';

function setup(){
 const m=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>m.get(k)??null,removeItem:(k:string)=>m.delete(k),
 setItem:(k:string,v:string)=>{const total=[...m].filter(([key])=>key!==k).reduce((n,[key,val])=>n+key.length+val.length,0)+k.length+v.length;if(total*2>5*1024*1024)throw new DOMException('Quota exceeded','QuotaExceededError');m.set(k,v);}
 }});
 Object.defineProperty(globalThis,'window',{configurable:true,value:Object.assign(new EventTarget(),{setTimeout,clearTimeout})});
 Object.defineProperty(globalThis,'document',{configurable:true,value:Object.assign(new EventTarget(),{visibilityState:'visible'})});
 return m;
}
const make=(id:string,text:string,role:'user'|'model'='user'):ChatMessage=>({id,role,createdAt:1000,content:{text}});
test('large-history patch handles append, mid-history edits, truncation, removal and empty conversations',()=>{
 const a=make('a','a'),b=make('b','b'),c=make('c','c');
 const base={world:[a,b,c],gone:[a],empty:[]},next={world:[a,make('b','changed'),c,make('d','d')],empty:[],newEmpty:[]};
 assert.deepEqual(applyHistoryEdits(base,historyEdits(base,next)),next);
 assert.deepEqual(applyHistoryEdits(base,historyEdits(base,{world:[a]})),{world:[a]});
 assert.deepEqual(base.world,[a,b,c]);
});
test('37MB cloud install fits simulated 5MiB localStorage, survives reload and durable turns and rollback',async()=>{
 const m=setup(),manager=new MemoryManager();
 await manager.restoreChatRecovery();
 const small=[make('offline','original offline save')];
 manager.setChatHistory('cc',small,true);
 const original=manager.createImportSnapshot();
 const data=Array.from({length:14240},(_,i)=>make('cloud-'+i,('fixture '+i+' ').repeat(260).slice(0,2600),i%2?'model':'user'));
 assert.ok(JSON.stringify(data).length>=37000000);
 await manager.loadAllDataForCloud({chatHistories:{cc:data}},true);
 const raw=m.get('chatHistories')!;
 assert.ok(isHistoryPointer(raw));assert.ok(raw.length<1000);
 const pointer=decodeHistoryPointer(raw);
 assert.equal((await readHistoryBase(pointer.id)).cc.length,14240);
 const reloaded=new MemoryManager();await reloaded.restoreChatRecovery();
 assert.deepEqual(reloaded.peekChatHistory('cc'),data);
 const local=[...data,make('new-user','new user')];reloaded.setChatHistory('cc',local,true);
 reloaded.persistVpsChatTurnUser('cc','new-user');
 reloaded.persistVpsChatTurnReply('cc','new-user','new-model',{text:'new reply'},1001);
 assert.ok(m.get('chatHistories')!.length<2000);
 const reloadedAgain=new MemoryManager();await reloadedAgain.restoreChatRecovery();
 assert.equal(reloadedAgain.peekChatHistory('cc').length,14242);
 assert.equal(reloadedAgain.peekChatHistory('cc').at(-1)?.id,'new-model');
 await reloadedAgain.restoreImportSnapshotForCloud(original);
 const rollback=new MemoryManager();await rollback.restoreChatRecovery();
 assert.deepEqual(rollback.peekChatHistory('cc'),small);
});
