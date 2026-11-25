import type {TurnHistoryRow} from './durableChatTurn.js';
import {canonicalContextJson,projectCloudContextMessage,hashContextJson,type ContextDigestVersion} from './contextFingerprint.js';
export const VPS_CHAT_MODE_KEY='aigfVpsChatModeV1';
export const VPS_CHAT_BUILD=import.meta.env?.VITE_AIGF_VPS_CHAT_PILOT==='1';
export const VPS_CHAT_MODELS=['glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus'] as const;
export async function digestVpsHistory(history:readonly TurnHistoryRow[],version:ContextDigestVersion=1):Promise<string>{
 return hashContextJson(version===2?canonicalContextJson(history.map(projectCloudContextMessage)):JSON.stringify(history));
}
export function isVpsChatEligible(input:{room:boolean;assistant:boolean;special:boolean;attachments:number;personaKey:string}){
 return !input.assistant&&!input.special&&!input.attachments;
}
