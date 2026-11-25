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
