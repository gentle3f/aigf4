import {canonicalContextJson,hashContextJson} from './contextFingerprint.js';
import {digestVpsHistory,VPS_CHAT_MODELS} from './vpsChatMode.js';
import type {TurnHistoryRow} from './durableChatTurn.js';
export type DispatchIntent={version:1;model:string;personaKey:string;priorDigest:string;worldDigest?:string;createdAt:number};
const hex=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x);
export function readDispatchIntent(row:TurnHistoryRow|undefined):DispatchIntent|null{
 const v=(row?.content as {vpsDispatchIntent?:DispatchIntent}|undefined)?.vpsDispatchIntent;
 return row?.role==='user'&&uuid(row.id)&&v?.version===1&&VPS_CHAT_MODELS.some(m=>m===v.model)&&typeof v.personaKey==='string'&&!!v.personaKey&&hex(v.priorDigest)&&(v.worldDigest===undefined||hex(v.worldDigest))&&Number.isSafeInteger(v.createdAt)&&v.createdAt===row.createdAt?v:null;
}
export async function matchDispatchIntent(history:readonly TurnHistoryRow[],personaKey:string,worldDigest?:string,now=Date.now()){
 const v=readDispatchIntent(history.at(-1));
 if(!v||v.personaKey!==personaKey||v.worldDigest!==worldDigest||now-v.createdAt>12*60*60*1000||v.createdAt>now+60000)return null;
 return await digestVpsHistory(history.slice(0,-1),2)===v.priorDigest?v:null;
}
const asUuid=(h:string)=>h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);
export async function dispatchReceiptSeed(conversationKey:string,row:TurnHistoryRow){
 const intent=readDispatchIntent(row);
 if(!intent)return undefined;
 const root=canonicalContextJson(['aigf-worldline2-dispatch-v1',conversationKey,row.id]);
 return {jobId:asUuid(await hashContextJson(root+':job')),replyId:asUuid(await hashContextJson(root+':reply')),createdAt:intent.createdAt};
}
