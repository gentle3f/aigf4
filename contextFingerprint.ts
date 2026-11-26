// JSONB changes object key order; never change array order or meaningful values.
export type ContextDigestVersion=1|2;
export const CURRENT_CONTEXT_DIGEST_VERSION=2 as const;
export function canonicalContextJson(value:unknown):string{
 return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
}
export const legacyCloudHash=(value:string)=>{
 let hash=0x811c9dc5;
 for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,0x01000193);}
 return (hash>>>0).toString(36);
};
export type CloudContextMessage={id?:string;role:string;createdAt?:number;speakerId?:string;content?:object};
export function projectCloudContextMessage(message:CloudContextMessage,position:number){
 const content=JSON.parse(JSON.stringify(message.content||{}));
 if(typeof content.imageUrl==='string'&&/^(blob:|data:)/.test(content.imageUrl)&&typeof content.imageAssetId==='string'&&content.imageAssetId)delete content.imageUrl;
 const fallbackId='legacy-'+position+'-'+legacyCloudHash(JSON.stringify({role:message.role,speakerId:message.speakerId,content}));
 return {id:message.id||fallbackId,createdAt:Number(message.createdAt||position+1),speakerId:message.speakerId||undefined,role:message.role,content};
}
export async function hashContextJson(value:string){
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
}
