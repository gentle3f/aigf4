import {canonicalContextJson} from './contextFingerprint.js';
import {readCloudSyncIndex} from './cloudSyncIndexStore.js';
import type {DeltaRow,DeltaConversation} from './atomicCloudDelta.js';
export type CloudMergeSnapshot={conversations:DeltaConversation[];messages:DeltaRow[];payload:object};
const eq=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const clone=<T>(x:T):T=>structuredClone(x);
const conflict=(kind:string):never=>{throw Error('ATOMIC_MERGE_CONFLICT:'+kind);};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
function value(base:unknown,local:unknown,remote:unknown):unknown{
 if(eq(local,remote))return clone(local);
 if(eq(base,local))return clone(remote);
 if(eq(base,remote))return clone(local);
 if(obj(base)&&obj(local)&&obj(remote)){
  const out:Record<string,unknown>=Object.create(null);
  for(const k of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
   const v=value(Object.hasOwn(base,k)?base[k]:undefined,Object.hasOwn(local,k)?local[k]:undefined,Object.hasOwn(remote,k)?remote[k]:undefined);
   if(v!==undefined)out[k]=v;
  }
  return out;
 }
 return conflict('state');
}
function split(s:CloudMergeSnapshot){
 const groups=new Map<string,{meta:DeltaConversation;rows:DeltaRow[]}>();
 for(const c of s.conversations){
  if(groups.has(c.conversation_key))conflict('duplicate-conversation');
  groups.set(c.conversation_key,{meta:{conversation_key:c.conversation_key,title:c.title,kind:c.kind},rows:[]});
 }
 for(const r of s.messages){
  const g=groups.get(r.conversation_key);
  if(!g)throw Error('ATOMIC_MERGE_MISSING_CONVERSATION');
  const {conversation_key,message_id,position,role,speaker_id,content,created_at_ms}=r;
  g.rows.push({conversation_key,message_id,position,role,speaker_id,content,created_at_ms});
 }
 for(const g of groups.values()){
  g.rows.sort((a,b)=>a.position-b.position);
  if(g.rows.some((r,i)=>r.position!==i||!r.message_id)||new Set(g.rows.map(r=>r.message_id)).size!==g.rows.length)conflict('invalid-history');
 }
 return groups;
}
export function mergeAtomicSnapshots(base:CloudMergeSnapshot,local:CloudMergeSnapshot,remote:CloudMergeSnapshot):CloudMergeSnapshot{
 const b=split(base),l=split(local),r=split(remote);
 const out:CloudMergeSnapshot={conversations:[],messages:[],payload:value(base.payload,local.payload,remote.payload) as object};
 for(const key of new Set([...r.keys(),...l.keys(),...b.keys()])){
  const a=b.get(key),x=l.get(key),y=r.get(key);
  let merged:typeof a;
  if(eq(x,y))merged=x;
  else if(eq(a,x))merged=y;
  else if(eq(a,y))merged=x;
  else{
   if(!a||!x||!y)throw Error('ATOMIC_MERGE_CONFLICT:conversation-delete-or-create');
   const meta=value(a.meta,x.meta,y.meta) as DeltaConversation;
   let rows:DeltaRow[];
   if(eq(x.rows,y.rows))rows=x.rows;
   else if(eq(a.rows,x.rows))rows=y.rows;
   else if(eq(a.rows,y.rows))rows=x.rows;
   else{
    // Only append-only, complete turns can safely be combined. Preserve server order
    // and append the entire local block; never sort by wall-clock or dedupe by text.
    const n=a.rows.length;
    if(!eq(x.rows.slice(0,n),a.rows)||!eq(y.rows.slice(0,n),a.rows)||x.rows.length<=n||y.rows.length<=n)throw Error('ATOMIC_MERGE_CONFLICT:history-edit');
    const localTail=x.rows.slice(n),remoteTail=y.rows.slice(n);
    if(a.rows.at(-1)?.role==='user'||localTail[0]?.role!=='user'||remoteTail[0]?.role!=='user'||localTail.at(-1)?.role!=='model'||remoteTail.at(-1)?.role!=='model')throw Error('ATOMIC_MERGE_CONFLICT:incomplete-turn');
    const ids=new Set(y.rows.map(m=>m.message_id));
    if(localTail.some(m=>ids.has(m.message_id)))throw Error('ATOMIC_MERGE_CONFLICT:overlapping-turn');
    rows=[...y.rows,...localTail].map((m,i)=>({...m,position:i}));
   }
   merged={meta,rows};
  }
  if(merged){out.conversations.push(clone(merged.meta));out.messages.push(...clone(merged.rows));}
 }
 return out;
}

export const mergeBaseKey=(uid:string)=>'wetappAtomicMergeBaseV3:'+uid;
export function normalizeMergeSnapshot(s:CloudMergeSnapshot):CloudMergeSnapshot{
 const g=split(s),conversations:DeltaConversation[]=[],messages:DeltaRow[]=[];
 for(const key of [...g.keys()].sort()){const x=g.get(key)!;conversations.push(clone(x.meta));messages.push(...clone(x.rows));}
 return {conversations,messages,payload:clone(s.payload)};
}
export const equalMergeSnapshot=(a:CloudMergeSnapshot,b:CloudMergeSnapshot)=>eq(normalizeMergeSnapshot(a),normalizeMergeSnapshot(b));
export const mergeBaseIndex=(uid:string,revision:number,snapshot:CloudMergeSnapshot)=>({[mergeBaseKey(uid)]:{revision:String(revision),snapshot:JSON.stringify(normalizeMergeSnapshot(snapshot))}});
export async function readMergeBase(uid:string,revision:number):Promise<CloudMergeSnapshot|null>{
 const data=await readCloudSyncIndex(mergeBaseKey(uid));
 if(Number(data.revision)!==revision||!data.snapshot)return null;
 return normalizeMergeSnapshot(JSON.parse(data.snapshot));
}
