// Durable world ledger planning/finalization. Reuses existing evidence validator.
import {getWorldline} from './worldline.js';
import {WORLD_LEDGER_KEY,appendWorldBatches,pendingWorldSources,selectWorldBatch,compileWorldLedger,buildRecoverableWorldExtractionMessages,parseRecoverableWorldExtraction,scopedWorldLedger,mergeLedgers,type WorldBatch} from './worldLedger.js';
import type {WorldSource} from './worldOs.js';
import type {PilotJob,PilotRequest} from './generationQueuePilot.js';
import {buildVpsCharacterPayload} from './vpsCharacterTransport.js';
import {canonicalContextJson,hashContextJson} from './contextFingerprint.js';

export type LedgerSnapshot={key:string;registry:unknown;ledger:unknown;history:WorldSource[];model:string};
type Evidence={id:string;digest:string};
export type LedgerPlan={version:1;worldCreatedAt:number;model:string;sources:Evidence[];allSources:Evidence[];attempt:number;pendingCount?:number;partial:WorldBatch[];request:PilotRequest};
const digestSource=(s:WorldSource)=>hashContextJson(canonicalContextJson({id:s.id,role:s.role,text:s.content.text}));
const evidence=async(sources:WorldSource[])=>Promise.all(sources.map(async s=>({id:s.id!,digest:await digestSource(s)})));
function requestFor(s:LedgerSnapshot,batch:WorldSource[]){
 const first=s.history.findIndex(m=>m.id===batch[0].id);
 const context=compileWorldLedger(s.ledger,s.key,s.history.slice(0,Math.max(0,first)),'',4200);
 return buildVpsCharacterPayload({model:s.model,messages:buildRecoverableWorldExtractionMessages(batch,context),maxCompletionTokens:5000,temperature:0.1,stop:[]});
}
export async function planServerWorldLedger(s:LedgerSnapshot):Promise<LedgerPlan|null>{
 const w=getWorldline(s.registry,s.key);
 if(!w||w.paused||s.history.at(-1)?.role!=='model')return null;
 const pending=pendingWorldSources(s.ledger,s.key,s.history);
 // Keep the latest turn current, then process oldest missing evidence.
 const recent=pending.at(-1)?.id===s.history.at(-1)?.id;
 const batch=selectWorldBatch(pending,recent);
 if(!batch.length)return null;
 const sources=await evidence(batch);
 return {version:1,worldCreatedAt:w.createdAt,model:s.model,sources,allSources:sources,attempt:1,pendingCount:pending.length,partial:[],request:requestFor(s,batch)};
}
async function verify(s:LedgerSnapshot,p:LedgerPlan){
 const w=getWorldline(s.registry,s.key);
 if(!w||w.paused||w.createdAt!==p.worldCreatedAt)throw Error('LEDGER_CONTEXT_CHANGED');
 const byId=new Map(s.history.map(m=>[m.id,m]));
 for(const v of p.allSources){
  const m=byId.get(v.id);
  if(!m||await digestSource(m)!==v.digest)throw Error('LEDGER_CONTEXT_CHANGED');
 }
 return p.sources.map(e=>byId.get(e.id)!);
}
export async function finalizeServerWorldLedger(s:LedgerSnapshot,p:LedgerPlan,job:PilotJob,attemptId:string,at:number){
 const batch=await verify(s,p);
 if(job.job_id!==attemptId||job.status!=='done'||job.result?.workflow)throw Error('LEDGER_RESULT_INVALID');
 const c=job.result?.choices?.[0];
 let rows:WorldBatch[]=[];
 if(c?.finish_reason!=='length'&&typeof c?.message?.content==='string'){
  try{rows=parseRecoverableWorldExtraction(c.message.content,batch,at).rows;}catch{/* malformed output: bounded smaller batch */}
 }
 // Accumulate validated partial observations without overwriting complete evidence.
 const partialLedger=appendWorldBatches(null,s.key,[...p.partial,...rows],s.history);
 const partial=Object.values(partialLedger.worlds[s.key]||{});
 const complete=rows.some(r=>!r.incomplete);
 if(!complete&&batch.length>1&&p.attempt<4){
  const next=batch.slice(0,Math.ceil(batch.length/2));
  return {kind:'retry' as const,plan:{...p,attempt:p.attempt+1,partial,sources:await evidence(next),request:requestFor({...s,model:p.model},next)}};
 }
 if(!partial.length)return {kind:'deferred' as const};
 const merged=appendWorldBatches(s.ledger,s.key,partial,s.history);
 return {kind:'save' as const,ledger:JSON.stringify(merged),complete:partial.filter(r=>!r.incomplete).length,deferred:!complete};
}
