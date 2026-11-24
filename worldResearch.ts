/** Worldline diagnostics: local, opt-in by using Worldline, export only.
 * Never stores HTTP headers, credentials, media payloads or hidden reasoning.
 * No additional model calls and no automatic research upload.
 */
export type ResearchContext={conversationKey:string;requestId?:number;stage:string;sourceIds?:string[]};
export type ResearchEvent={id:string;at:number;context:ResearchContext;data:Record<string,unknown>};
export const WORLD_RESEARCH_SCHEMA='worldline-research-v1';
const DB='aigf4WorldlineResearchV1', STORE='events';
const pending=new Set<Promise<void>>();
let failedWrites=0;
const MAX_TEXT=300000;
const cleanText=(s:string)=>s
 .replace(/data:[^\s"'<>]+;base64,[A-Za-z0-9+/=]+/giu,'[media omitted]')
 .replace(/\b(?:sk-|sk-or-v1-)[A-Za-z0-9_-]{20,}/gu,'[credential omitted]')
 .replace(/<think>[\s\S]*?<\/think>/giu,'[reasoning omitted]');
export const researchText=(value:unknown)=>{
 if(typeof value==='string'){
  const text=cleanText(value);return {text:text.slice(0,MAX_TEXT),originalChars:value.length,truncated:text.length>MAX_TEXT};
 }
 if(Array.isArray(value))return value.map(part=>{
  if(part&&typeof part==='object'&&'type' in part&&part.type==='text'&&'text' in part)return {type:'text',content:researchText(part.text)};
  return {type:'non-text',omitted:true};
 });
 return {omitted:true};
};
export const captureResearchMessages=(messages:readonly {role:string;content:unknown}[])=>messages.map(m=>({role:m.role,content:researchText(m.content)}));
const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open(DB,1);
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE)){
  const store=request.result.createObjectStore(STORE,{keyPath:'id'});
  store.createIndex('conversation','context.conversationKey');
 }};
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
const put=async (row:ResearchEvent)=>{
 const db=await open();
 try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  tx.objectStore(STORE).put(row);
 });}finally{db.close();}
};
export const recordWorldResearch=(context:ResearchContext,data:Record<string,unknown>)=>{
 if(typeof indexedDB==='undefined'||!context.conversationKey)return;
 try{
  const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random();
  const row={id,at:Date.now(),context:{...context},data};
  const work=put(row).catch(()=>{failedWrites++;});
  pending.add(work);void work.finally(()=>pending.delete(work));
 }catch{failedWrites++;}
};
export const listWorldResearch=async (key?:string):Promise<ResearchEvent[]>=>{
 await Promise.all([...pending]);
 if(typeof indexedDB==='undefined')return [];
 const db=await open();
 try{return await new Promise<ResearchEvent[]>((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);
  const request=key?store.index('conversation').getAll(key):store.getAll();
  request.onsuccess=()=>resolve((request.result as ResearchEvent[]).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)));
  request.onerror=()=>reject(request.error);
 });}finally{db.close();}
};
export const buildWorldResearchExport=async (key?:string)=>{
 const events=await listWorldResearch(key);
 return {schema:WORLD_RESEARCH_SCHEMA,createdAt:Date.now(),scope:key||'all',storage:'this browser only',failedWritesThisSession:failedWrites,
  notes:['Capture starts at this release, not retroactive. Text inputs are sanitized, media omitted, and very long text truncated explicitly.','No inferred monetary cost: usage fields report provider tokens; actual cost may be unknown.','No automatic diagnosis of missing facts or personality drift; compare exact captured context with source journal.','Diagnostic events may contain private story material; share intentionally.'],
  eventCount:events.length,events};
};
