import type {TurnHistoryRow} from './durableChatTurn.js';
export const VPS_CHAT_MODE_KEY='aigfVpsChatModeV1';
export const VPS_CHAT_BUILD=import.meta.env?.VITE_AIGF_VPS_CHAT_PILOT==='1';
export const VPS_CHAT_MODELS=['glm-5-3-flash-uncensored','deepseek-v4-1-flash-1017-uncensored','qwen-3-6-plus'] as const;
export async function digestVpsHistory(history:readonly TurnHistoryRow[]):Promise<string>{
 const data=new TextEncoder().encode(JSON.stringify(history));
 const hash=await crypto.subtle.digest('SHA-256',data);
 return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}
export function isVpsChatEligible(input:{room:boolean;assistant:boolean;special:boolean;attachments:number;personaKey:string}){
 return !input.room&&!input.assistant&&!input.special&&!input.attachments&&input.personaKey!=='cc';
}
