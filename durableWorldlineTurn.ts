import type {Worldline} from './worldline.js';
import {recordWorldlineTurn,normalizeWorldline} from './worldline.js';
import {canonicalContextJson,hashContextJson} from './contextFingerprint.js';
import type {TurnReceipt,TurnHistoryRow} from './durableChatTurn.js';
import {digestVpsHistory} from './vpsChatMode.js';

// Store only a fingerprint in the receipt. The submitted request remains on the queue.
export const digestWorldlineContext=(world:Worldline,ledger:unknown,preferences:unknown)=>hashContextJson(canonicalContextJson({world,ledger,preferences}));
export async function verifyWorldlineAppliedPrefix(history:readonly TurnHistoryRow[],r:TurnReceipt,chronicleExists:boolean){
 const i=history.findIndex(row=>row.id===r.userMessageId&&row.role==='user');
 const j=history.findIndex(row=>row.id===r.replyId&&row.role==='model');
 if(i<0||j!==i+1||!r.worldDigest||r.contextDigestVersion!==2||!r.contextDigest)throw Error('WORLDLINE_REPLY_PREFIX_INVALID');
 if(await digestVpsHistory(history.slice(0,i+1),2)!==r.contextDigest)throw Error('TURN_HISTORY_CHANGED');
 if(!chronicleExists&&j!==history.length-1)throw Error('WORLDLINE_CHRONICLE_ORDER_CHANGED');
 return {userIndex:i,replyIndex:j};
}
// Legacy Worldline 1: only remove explicitly source-linked chronicle entries; never guess older history.
export function removeRecalledWorldlineSources(world:Worldline,removed:readonly string[]){
 const ids=new Set(removed);
 const kept=world.chronicle.filter(row=>!row.sourceMessageId||!ids.has(row.sourceMessageId));
 const count=world.chronicle.length-kept.length;
 if(!count)return world;
 const start=Math.max(0,world.turnCount-world.chronicle.length);
 return normalizeWorldline({...world,turnCount:Math.max(0,world.turnCount-count),chronicle:kept.map((row,i)=>({...row,turn:start+i+1,id:'turn-'+(start+i+1)})),updatedAt:Date.now()});
}
export function commitWorldlineReply(world:Worldline,replyId:string,user:string,reply:string){
 if(world.chronicle.some(row=>row.sourceMessageId===replyId))return world;
 return recordWorldlineTurn(world,user,reply,Date.now(),replyId);
}
