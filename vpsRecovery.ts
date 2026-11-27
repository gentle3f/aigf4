import type {TurnReceipt} from './durableChatTurn.js';
import type {PilotJobStatus} from './generationQueuePilot.js';
import {createVpsChatTransport} from './vpsCharacterTransport.js';
import {decodeVpsWorkflow} from './vpsWorkflow.js';
export type RecoveryRow={receipt:TurnReceipt;status:PilotJobStatus;updated:number};
export async function listVpsRecovery(fetchImpl:typeof fetch=fetch):Promise<RecoveryRow[]>{
 const r=await fetchImpl('/api/venice-chat?queue=1&recovery=1',{credentials:'same-origin',cache:'no-store'});
 if(!r.ok)throw Error('RECOVERY_HTTP_'+r.status);
 const d=await r.json();
 if(!Array.isArray(d.receipts)||d.receipts.length>50)throw Error('RECOVERY_LIST_INVALID');
 return d.receipts;
}
export async function readVpsRecoveryText(row:RecoveryRow,fetchImpl:typeof fetch=fetch){
 const job=await createVpsChatTransport(fetchImpl).get(row.receipt.jobId);
 const w=decodeVpsWorkflow(job);
 if(w.version!==row.receipt.workflowVersion)throw Error('TURN_WORKFLOW_RESULT_MISMATCH');
 // This is provider output, not a validated/committed character reply.
 return w.decision.decision==='revise'?w.decision.revisedResponse:w.polished||w.parts.join('\n');
}

// Cross-device recovery is discovery-only. Never re-submit when the server has
// no receipt, and never attach a reply to a different history.
export async function findMatchingVpsRecovery(rows:RecoveryRow[],key:string,history:readonly import('./durableChatTurn.js').TurnHistoryRow[],worldDigest?:string):Promise<RecoveryRow|null>{
 const tail=history.at(-1);
 if(!tail?.id||tail.role!=='user')return null;
 const {digestVpsHistory}=await import('./vpsChatMode.js');
 const digest=await digestVpsHistory(history,2);
 const matches=rows.filter(row=>row.receipt.conversationKey===key&&row.receipt.userMessageId===tail.id&&row.receipt.contextDigestVersion===2&&row.receipt.contextDigest===digest&&!row.receipt.roomDigest&&row.receipt.worldDigest===worldDigest&&['queued','running','done'].includes(row.status));
 return matches.length===1?matches[0]:null;
}
