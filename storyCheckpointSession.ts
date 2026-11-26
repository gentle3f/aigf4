import {canonicalContextJson,hashContextJson,projectCloudContextMessage,type CloudContextMessage} from './contextFingerprint.js';
import {digestVpsHistory} from './vpsChatMode.js';

type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Site='worldline1'|'worldline2'|'aigf';
export type StoryCheckpointSnapshot={version:1;site:Site;key:string;historyDigest:string};
export type StoryCheckpointHead={revision:number;count:number;sha256:string;contiguous:boolean};
export type StoryCheckpointRow={message_id:string;position:number;role:string;speaker_id:string|null;content:object;created_at_ms:number};
type View<S>={head:StoryCheckpointHead;snapshot:S|null;stale:boolean};
export type StoryCheckpointTransport<S>={read:(key:string,site:Site)=>Promise<View<S>>;page:(key:string,offset:number,limit:number)=>Promise<StoryCheckpointRow[]>;commit:(request:{key:string;site:Site;head:StoryCheckpointHead;append:StoryCheckpointRow[];recall:string|null;snapshot:S;deviceId:string})=>Promise<number>};
type Baseline<S>=View<S>&{key:string;rows:StoryCheckpointRow[]};
type Operation={kind:'user';id:string}|{kind:'reply';id:string;userId:string}|{kind:'recall';userId:string}|{kind:'settings'};
type Journal={version:1;key:string;revision:number;beforeHash:string;afterHash:string;afterCount:number};
const equal=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const digest=(v:unknown)=>hashContextJson(canonicalContextJson(v));
const validDigest=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const validHead=(h:StoryCheckpointHead)=>Number.isSafeInteger(h?.revision)&&h.revision>=1&&Number.isSafeInteger(h.count)&&h.count>=0&&h.contiguous===true&&validDigest(h.sha256);
const rowsOf=(history:readonly CloudContextMessage[]):StoryCheckpointRow[]=>history.map((m,i)=>{const r=projectCloudContextMessage(m,i);return {message_id:r.id,position:i,role:r.role,speaker_id:r.speakerId||null,content:r.content,created_at_ms:r.createdAt};});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const media=(r:StoryCheckpointRow)=>{const c=r.content as Record<string,unknown>;return ['imageUrl','imageAssetId','imageGeneration','photoProposal','photoIntent'].some(k=>Object.hasOwn(c,k))||(Object.hasOwn(c,'attachments')&&!equal(c.attachments,[]));};
// Experimental shared operation boundary. Transport is injected; no production network calls.
export function createStoryCheckpointSession<S extends StoryCheckpointSnapshot>(deps:{site:Site;storage:Store;transport:StoryCheckpointTransport<S>;history:(key:string)=>readonly CloudContextMessage[];capture:(key:string)=>Promise<S>;deviceId:string;lock:<T>(work:()=>Promise<T>)=>Promise<T>}){
 const journalKey='aigfStoryCheckpointLab:'+deps.site;
 const pending=():Journal|null=>{
  const raw=deps.storage.getItem(journalKey);if(!raw)return null;const j=JSON.parse(raw) as Journal;
  if(j.version!==1||typeof j.key!=='string'||!j.key||!Number.isSafeInteger(j.revision)||j.revision<1||!Number.isSafeInteger(j.afterCount)||j.afterCount<0||!validDigest(j.beforeHash)||!validDigest(j.afterHash))throw Error('STORY_SYNC_JOURNAL_INVALID');
  return j;
 };
 const assertSnapshot=async(key:string,history:readonly CloudContextMessage[],s:S)=>{
  if(s?.version!==1||s.site!==deps.site||s.key!==key||s.historyDigest!==await digestVpsHistory(history,2))throw Error('STORY_SYNC_SNAPSHOT_MISMATCH');
 };
 const read=async(key:string):Promise<Baseline<S>>=>{
  const a=await deps.transport.read(key,deps.site);
  if(!validHead(a?.head)||typeof a.stale!=='boolean'||(a.stale&&a.snapshot!==null))throw Error('STORY_SYNC_HEAD_INVALID');
  const rows:StoryCheckpointRow[]=[];
  for(let offset=0;offset<a.head.count;offset+=200){const size=Math.min(200,a.head.count-offset),page=await deps.transport.page(key,offset,size);if(!Array.isArray(page)||page.length!==size||page.some((r,i)=>r.position!==offset+i))throw Error('STORY_SYNC_PAGE_CHANGED');rows.push(...page);}
  if(new Set(rows.map(r=>r.message_id)).size!==rows.length||!equal(a,await deps.transport.read(key,deps.site)))throw Error('STORY_SYNC_HEAD_CHANGED');
  return {...a,key,rows};
 };
 const content=(b:Baseline<S>)=>({rows:b.rows,snapshot:b.snapshot,stale:b.stale});
 const inspect=async(j:Journal)=>{
  const current=await read(j.key),h=await digest(content(current));
  if(current.head.revision>j.revision&&current.head.count===j.afterCount&&h===j.afterHash){deps.storage.removeItem(journalKey);return 'confirmed' as const;}
  if(current.head.revision===j.revision&&h===j.beforeHash)return 'not-confirmed' as const;
  return 'conflict' as const;
 };
 return {pending,load:(key:string)=>deps.lock(()=>read(key)),recover:()=>deps.lock(async()=>{const j=pending();return j?inspect(j):'none' as const;}),
  begin:(key:string,initialize=false)=>deps.lock(async()=>{
   if(pending())throw Error('STORY_SYNC_PENDING');
   const b=await read(key);
   if(b.stale||!equal(b.rows,rowsOf(deps.history(key))))throw Error('STORY_SYNC_LOCAL_HISTORY_CONFLICT');
   if(b.snapshot===null){if(!initialize)throw Error('STORY_SYNC_INITIALIZATION_REQUIRED');}
   else {const local=await deps.capture(key);await assertSnapshot(key,deps.history(key),local);if(!equal(local,b.snapshot))throw Error('STORY_SYNC_LOCAL_STATE_CONFLICT');}
   return b;
  }),
  commit:(baseline:Baseline<S>,op:Operation)=>deps.lock(async()=>{
   if(pending())throw Error('STORY_SYNC_PENDING');
   const current=await read(baseline.key);
   if(current.stale||!equal(current,baseline))throw Error('STORY_SYNC_BASELINE_CHANGED');
   const history=deps.history(baseline.key),next=rowsOf(history);
   let append:StoryCheckpointRow[]=[],recall:string|null=null;
   if(op.kind==='settings'){
    if(!equal(next,baseline.rows)||baseline.rows.at(-1)?.role==='user')throw Error('STORY_SYNC_SETTINGS_HISTORY_CHANGED');
   }else if(op.kind==='recall'){
    const i=baseline.rows.findIndex(r=>r.message_id===op.userId&&r.role==='user');
    if(i<0||baseline.rows.slice(i+1).some(r=>r.role==='user')||baseline.rows.slice(i).some(media)||!equal(next,baseline.rows.slice(0,i)))throw Error('STORY_SYNC_RECALL_INVALID');
    recall=op.userId;
   }else{
    const row=next.at(-1);
    if(next.length!==baseline.rows.length+1||!equal(next.slice(0,-1),baseline.rows)||!row||row.message_id!==op.id||!UUID.test(op.id)||row.role!==(op.kind==='user'?'user':'model')||media(row)||baseline.rows.some(r=>r.message_id===op.id))throw Error('STORY_SYNC_APPEND_INVALID');
    if(op.kind==='reply'&&(baseline.rows.at(-1)?.role!=='user'||baseline.rows.at(-1)?.message_id!==op.userId))throw Error('STORY_SYNC_REPLY_SOURCE_CHANGED');
    append=[row];
   }
   const snapshot=await deps.capture(baseline.key);
   await assertSnapshot(baseline.key,history,snapshot);
   if(!equal(next,rowsOf(deps.history(baseline.key))))throw Error('STORY_SYNC_LOCAL_CHANGED');
   const j:Journal={version:1,key:baseline.key,revision:baseline.head.revision,beforeHash:await digest(content(baseline)),afterHash:await digest({rows:next,snapshot,stale:false}),afterCount:next.length};
   if(!equal(next,rowsOf(deps.history(baseline.key))))throw Error('STORY_SYNC_LOCAL_CHANGED');
   deps.storage.setItem(journalKey,JSON.stringify(j));
   if(!equal(pending(),j))throw Error('STORY_SYNC_JOURNAL_NOT_DURABLE');
   const revision=await deps.transport.commit({key:baseline.key,site:deps.site,head:baseline.head,append,recall,snapshot,deviceId:deps.deviceId});
   if(revision!==baseline.head.revision+1)throw Error('STORY_SYNC_REVISION_UNEXPECTED');
   return inspect(j);
  })
 };
}
