import {canonicalContextJson,projectCloudContextMessage,type CloudContextMessage} from './contextFingerprint.js';
export type CheckpointRow={message_id:string;position:number;role:string;speaker_id:string|null;content:object;created_at_ms:number};
export type CheckpointPlan={expected_revision:number;target_conversation:string;expected_history:CheckpointRow[];append_messages:CheckpointRow[];new_payload:object;new_device_id:string};
const same=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function project(history:readonly CloudContextMessage[]):CheckpointRow[]{
 return history.map((m,i)=>{const r=projectCloudContextMessage(m,i);return {message_id:r.id,position:i,role:r.role,speaker_id:r.speakerId||null,content:r.content,created_at_ms:r.createdAt};});
}
export function prepareAppendCheckpoint(input:{revision:number;conversationKey:string;deviceId:string;remoteHistory:CheckpointRow[];localHistory:readonly CloudContextMessage[];payload:object}):CheckpointPlan{
 const {revision,conversationKey,deviceId,remoteHistory,localHistory,payload}=input;
 if(!Number.isSafeInteger(revision)||revision<1||!conversationKey||conversationKey.length>256||!deviceId||deviceId.length>256||!payload||Array.isArray(payload))throw Error('INVALID_CHECKPOINT');
 const all=project(localHistory);
 if(remoteHistory.some((r,i)=>r.position!==i)||!same(remoteHistory,all.slice(0,remoteHistory.length)))throw Error('WETAPP_HISTORY_CONFLICT');
 const tail=all.slice(remoteHistory.length);
 const media=(v:object)=>{const x=v as Record<string,unknown>;return ['imageUrl','imageAssetId','imageGeneration','photoProposal','photoIntent'].some(k=>Object.hasOwn(x,k))||(Object.hasOwn(x,'attachments')&&!same(x.attachments,[]));};
 if(localHistory.slice(remoteHistory.length).some(r=>r.content&&media(r.content)))throw Error('CHECKPOINT_MEDIA_UNSUPPORTED');
 if(!tail.length||tail.length>32||tail.some(r=>!UUID.test(r.message_id)||!['user','model','system'].includes(r.role)||!Number.isSafeInteger(r.created_at_ms)||r.created_at_ms<0))throw Error('INVALID_APPEND_MESSAGE');
 if(new Set(all.map(r=>r.message_id)).size!==all.length)throw Error('DUPLICATE_MESSAGE_ID');
 return structuredClone({expected_revision:revision,target_conversation:conversationKey,expected_history:remoteHistory,append_messages:tail,new_payload:payload,new_device_id:deviceId});
}
export function inspectCheckpointOutcome(plan:CheckpointPlan,remote:{revision:number;history:CheckpointRow[];payload:object}){
 const full=[...plan.expected_history,...plan.append_messages];
 if(remote.revision===plan.expected_revision+1&&same(remote.history,full)&&same(remote.payload,plan.new_payload))return 'confirmed' as const;
 if(remote.revision===plan.expected_revision&&same(remote.history,plan.expected_history))return 'not-confirmed' as const;
 return 'conflict-or-later-update' as const;
}
