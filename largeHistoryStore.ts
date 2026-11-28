import type {ChatMessage} from './managers.js';
import {decodeChatHistoryStorage,encodeChatHistoryStorage} from './chatHistoryStorage.js';

export type Histories=Record<string,ChatMessage[]>;
type Edit={key:string;remove?:true;start?:number;end?:number;insert?:ChatMessage[]};
export type HistoryPointer={id:string;edits:Edit[]};
const PREFIX='idb-history-v1:';
export const isHistoryPointer=(raw:string|null):raw is string=>!!raw&&raw.startsWith(PREFIX);
export function decodeHistoryPointer(raw:string):HistoryPointer{
 if(!isHistoryPointer(raw))throw Error('HISTORY_POINTER_INVALID');
 const value=decodeChatHistoryStorage<HistoryPointer>(raw.slice(PREFIX.length));
 if(!value||typeof value.id!=='string'||!value.id||!Array.isArray(value.edits))throw Error('HISTORY_POINTER_INVALID');
 return value;
}
export const encodeHistoryPointer=(id:string,edits:Edit[]=[])=>PREFIX+encodeChatHistoryStorage({id,edits});
const equal=(a:ChatMessage,b:ChatMessage)=>a===b||JSON.stringify(a)===JSON.stringify(b);
export function historyEdits(base:Histories,next:Histories):Edit[]{
 const out:Edit[]=[];
 for(const key of new Set([...Object.keys(base),...Object.keys(next)])){
  if(!Object.hasOwn(next,key)){out.push({key,remove:true});continue;}
  const a=base[key]||[],b=next[key];
  let start=0;while(start<Math.min(a.length,b.length)&&equal(a[start],b[start]))start++;
  if(Object.hasOwn(base,key)&&start===a.length&&start===b.length)continue;
  let suffix=0;while(suffix<Math.min(a.length-start,b.length-start)&&equal(a[a.length-1-suffix],b[b.length-1-suffix]))suffix++;
  out.push({key,start,end:a.length-suffix,insert:b.slice(start,b.length-suffix)});
 }
 return out;
}
export function applyHistoryEdits(base:Histories,edits:Edit[]):Histories{
 const out=structuredClone(base);
 for(const e of edits){
  if(!e||typeof e.key!=='string'||['__proto__','constructor','prototype'].includes(e.key))throw Error('HISTORY_EDIT_INVALID');
  if(e.remove){delete out[e.key];continue;}
  const a=out[e.key]||[],start=e.start!,end=e.end!;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>a.length||!Array.isArray(e.insert))throw Error('HISTORY_EDIT_INVALID');
  out[e.key]=[...a.slice(0,start),...structuredClone(e.insert),...a.slice(end)];
 }
 return out;
}
function transaction<T>(mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 return new Promise((resolve,reject)=>{
  const open=indexedDB.open('wetapp-large-history-v1',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('snapshots');
  open.onerror=()=>reject(open.error);
  open.onsuccess=()=>{
   const db=open.result,tx=db.transaction('snapshots',mode),req=fn(tx.objectStore('snapshots'));
   tx.oncomplete=()=>{db.close();resolve(req.result);};
   tx.onabort=()=>{db.close();reject(tx.error||Error('HISTORY_IDB_ABORT'));};
   tx.onerror=()=>{db.close();reject(tx.error||Error('HISTORY_IDB_ERROR'));};
  };
 });
}
export async function writeHistoryBase(histories:Histories):Promise<string>{
 const id=crypto.randomUUID();
 // Store a complete structured snapshot; publish its pointer only after the IDB transaction completes.
 await transaction('readwrite',s=>s.add(histories,id));
 const restored=await readHistoryBase(id);
 if(JSON.stringify(restored)!==JSON.stringify(histories))throw Error('HISTORY_IDB_VERIFY_FAILED');
 return id;
}
export async function readHistoryBase(id:string):Promise<Histories>{
 const data=await transaction<Histories|undefined>('readonly',s=>s.get(id));
 if(!data||typeof data!=='object'||Array.isArray(data))throw Error('HISTORY_IDB_BASE_MISSING');
 return data;
}
