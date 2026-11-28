import type {DeltaRow} from './atomicCloudDelta.js';

type LegacyRow=DeltaRow&{source_device_id?:string};
const allowed=new Set(['venice_ai','room_iu_jennie_irene_v1']);

/** Legacy writer could leave a complete position-zero sequence from each device.
 * Only normalize independently contiguous, temporally disjoint sequences.
 * Preserve every ID/content/timestamp and never infer a deletion. */
export function normalizeLegacyRemotePositions<T extends LegacyRow>(rows:readonly T[]):T[]{
 const groups=new Map<string,T[]>();
 for(const row of rows){const g=groups.get(row.conversation_key)||[];g.push(row);groups.set(row.conversation_key,g);}
 const result:T[]=[];
 for(const [key,g] of groups){
  const sorted=[...g].sort((a,b)=>a.position-b.position);
  if(g.some(r=>!r.message_id)||new Set(g.map(r=>r.message_id)).size!==g.length)throw Error('ATOMIC_MERGE_CONFLICT:invalid-history:'+key);
  if(sorted.every((r,i)=>r.position===i)){result.push(...sorted);continue;}
  const fail=()=>{throw Error('ATOMIC_MERGE_CONFLICT:invalid-history:'+key);};
  if(!allowed.has(key))fail();
  const devices=new Map<string,T[]>();
  for(const r of g){if(!r.source_device_id||!Number.isSafeInteger(Number(r.created_at_ms))||Number(r.created_at_ms)<=0)fail();const device=r.source_device_id!;const list=devices.get(device)||[];list.push(r);devices.set(device,list);}
  if(devices.size<2)fail();
  const blocks=[...devices.values()].map(list=>{
   const ordered=[...list].sort((a,b)=>a.position-b.position);
   if(ordered.some((r,i)=>r.position!==i))fail();
   let min=Infinity,max=-Infinity;
   for(const r of ordered){const t=Number(r.created_at_ms);min=Math.min(min,t);max=Math.max(max,t);}
   return {ordered,min,max};
  }).sort((a,b)=>a.min-b.min);
  for(let i=1;i<blocks.length;i++)if(blocks[i-1].max>=blocks[i].min)fail();
  result.push(...blocks.flatMap(b=>b.ordered).map((r,i)=>({...r,position:i})));
 }
 return result;
}
