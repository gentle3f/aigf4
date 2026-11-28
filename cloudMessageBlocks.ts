import type {Delta,DeltaRow} from './atomicCloudDelta.js';
import {readCloudSyncIndex} from './cloudSyncIndexStore.js';
export const MESSAGE_BLOCK_SIZE=32;
export type MessageBlock=[key:string,block:number,digest:string,count:number,valid:boolean];
export type MessageManifest={revision:number;blocks:MessageBlock[]};
export const blockIndexKey=(uid:string)=>'wetappMessageBlocksV1:'+uid;
const keyOf=(key:string,block:number)=>JSON.stringify([key,block]);
const rowKey=(row:Pick<DeltaRow,'conversation_key'|'position'>)=>keyOf(row.conversation_key,Math.floor(row.position/MESSAGE_BLOCK_SIZE));
export function parseMessageManifest(raw:unknown,partial=false):MessageManifest|null{
 if(!raw||typeof raw!=='object')return null;
 const {revision,blocks}=raw as MessageManifest;
 if(!Number.isSafeInteger(revision)||revision<1||!Array.isArray(blocks))return null;
 const seen=new Set<string>(),groups=new Map<string,MessageBlock[]>();
 for(const b of blocks){
  if(!Array.isArray(b)||b.length!==5||typeof b[0]!=='string'||!b[0]||!Number.isSafeInteger(b[1])||b[1]<0||typeof b[2]!=='string'||! /^[a-f0-9]{64}$/.test(b[2])||!Number.isSafeInteger(b[3])||b[3]<1||b[3]>MESSAGE_BLOCK_SIZE||b[4]!==true)return null;
  const k=keyOf(b[0],b[1]);if(seen.has(k))return null;seen.add(k);
  const g=groups.get(b[0])||[];g.push(b);groups.set(b[0],g);
 }
 if(!partial)for(const g of groups.values()){
  g.sort((a,b)=>a[1]-b[1]);
  if(g.some((b,i)=>b[1]!==i||(i<g.length-1&&b[3]!==MESSAGE_BLOCK_SIZE)))return null;
 }
 return {revision,blocks};
}
export const messageManifestIndex=(uid:string,manifest:MessageManifest)=>({[blockIndexKey(uid)]:{json:JSON.stringify(manifest)}});
export async function readMessageManifest(uid:string,revision:number):Promise<MessageManifest|null>{
 const raw=(await readCloudSyncIndex(blockIndexKey(uid))).json;if(!raw)return null;
 try{const m=parseMessageManifest(JSON.parse(raw),true);return m?.revision===revision?m:null;}catch{return null;}
}
function groupRows<T extends DeltaRow>(rows:readonly T[]){
 const out=new Map<string,T[]>();
 for(const row of rows){const k=rowKey(row),list=out.get(k)||[];list.push(row);out.set(k,list);}
 return out;
}
export function validateBlockRows<T extends DeltaRow>(block:MessageBlock,rows:readonly T[]):boolean{
 return rows.length===block[3]&&new Set(rows.map(r=>r.message_id)).size===rows.length&&[...rows].sort((a,b)=>a.position-b.position).every((r,i)=>r.conversation_key===block[0]&&r.position===block[1]*MESSAGE_BLOCK_SIZE+i);
}
export function manifestMatchesRows(manifest:MessageManifest,rows:readonly DeltaRow[]):boolean{
 const groups=groupRows(rows);
 return groups.size===manifest.blocks.length&&manifest.blocks.every(b=>validateBlockRows(b,groups.get(keyOf(b[0],b[1]))||[]));
}
export function planMessageBlockPull<T extends DeltaRow>(current:MessageManifest,previous:MessageManifest,base:readonly T[]){
 const old=new Map(previous.blocks.map(b=>[keyOf(b[0],b[1]),b])),groups=groupRows(base);
 const reused:T[]=[],changed:MessageBlock[]=[];
 for(const b of current.blocks){
  const k=keyOf(b[0],b[1]),p=old.get(k),rows=groups.get(k)||[];
  if(p&&p[2]===b[2]&&p[3]===b[3]&&validateBlockRows(b,rows))reused.push(...rows);else changed.push(b);
 }
 return {reused,changed};
}
export function advanceMessageManifest(previous:MessageManifest,base:readonly DeltaRow[],delta:Delta):MessageManifest{
 const oldRows=new Map(base.map(r=>[JSON.stringify([r.conversation_key,r.message_id]),r]));
 const affected=new Set<string>(),gone=new Set(delta.remove_conversations);
 for(const r of [...delta.messages,...delta.remove_messages]){
  const old=oldRows.get(JSON.stringify([r.conversation_key,r.message_id]));if(old)affected.add(rowKey(old));
  if('position' in r&&typeof r.position==='number')affected.add(rowKey({conversation_key:r.conversation_key,position:r.position}));
 }
 return {revision:previous.revision+1,blocks:previous.blocks.filter(b=>!gone.has(b[0])&&!affected.has(keyOf(b[0],b[1])))};
}
