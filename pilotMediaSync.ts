import {canonicalContextJson} from './contextFingerprint.js';
export type PilotMedia={id:string;kind:'image'|'video';blob:Blob;createdAt:number;metadata:Record<string,unknown>};
export type PilotMediaRow={asset_id:string;kind:'image'|'video';sha256:string;mime_type:string;byte_size:number;storage_path:string;metadata:Record<string,unknown>;created_at_ms:number};
export type PilotMediaTransport={read:(id:string)=>Promise<PilotMediaRow|null>;list:()=>Promise<PilotMediaRow[]>;upload:(path:string,blob:Blob)=>Promise<void>;download:(path:string)=>Promise<Blob>;insert:(row:PilotMediaRow)=>Promise<void>};
const eq=(a:unknown,b:unknown)=>canonicalContextJson(a)===canonicalContextJson(b);
const uuid=/^[a-f0-9-]{36}$/;
const validId=(s:string)=>/^[a-zA-Z0-9_-]{1,300}$/.test(s);
const types={image:['image/webp','image/png','image/jpeg'],video:['video/mp4','video/webm']};
const sha=async(b:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
export function createPilotMediaSync(uid:string,transport:PilotMediaTransport){
 if(!uuid.test(uid))throw Error('PILOT_MEDIA_OWNER_INVALID');
 const verifyRow=(r:PilotMediaRow)=>{
  if(!validId(r.asset_id)||!['image','video'].includes(r.kind)||!types[r.kind]?.includes(r.mime_type)||!Number.isSafeInteger(r.byte_size)||r.byte_size<1||r.byte_size>52428800||!/^[a-f0-9]{64}$/.test(r.sha256)||r.storage_path!==uid+'/'+r.asset_id+'/'+r.sha256||!Number.isSafeInteger(r.created_at_ms)||r.created_at_ms<0||!r.metadata||typeof r.metadata!=='object'||Array.isArray(r.metadata))throw Error('PILOT_MEDIA_MANIFEST_INVALID');
 };
 const verifyBlob=async(r:PilotMediaRow,b:Blob)=>{if(b.size!==r.byte_size||b.type!==r.mime_type||await sha(b)!==r.sha256)throw Error('PILOT_MEDIA_BYTES_MISMATCH');};
 const same=async(r:PilotMediaRow,expected:PilotMediaRow)=>{verifyRow(r);if(!eq(r,expected))throw Error('PILOT_MEDIA_ID_COLLISION');};
 return {
  list:async()=>{const rows=await transport.list();for(const r of rows)verifyRow(r);return rows;},
  push:async(a:PilotMedia)=>{
   const digest=await sha(a.blob),row:PilotMediaRow={asset_id:a.id,kind:a.kind,sha256:digest,mime_type:a.blob.type,byte_size:a.blob.size,storage_path:uid+'/'+a.id+'/'+digest,metadata:JSON.parse(canonicalContextJson(a.metadata)),created_at_ms:a.createdAt};
   verifyRow(row);
   const existing=await transport.read(a.id);
   if(existing){await same(existing,row);await verifyBlob(existing,await transport.download(existing.storage_path));return 'already-synced' as const;}
   // An upload may succeed even if the response is lost. Verify bytes before publishing metadata.
   try{await transport.upload(row.storage_path,a.blob);}catch(e){try{await verifyBlob(row,await transport.download(row.storage_path));}catch{throw e;}}
   await verifyBlob(row,await transport.download(row.storage_path));
   try{await transport.insert(row);}catch(e){const saved=await transport.read(a.id);if(!saved)throw e;await same(saved,row);}
   const saved=await transport.read(a.id);if(!saved)throw Error('PILOT_MEDIA_NOT_CONFIRMED');await same(saved,row);
   return 'synced' as const;
  },
  pull:async(id:string)=>{if(!validId(id))throw Error('PILOT_MEDIA_ID_INVALID');const r=await transport.read(id);if(!r)return null;verifyRow(r);if(r.asset_id!==id)throw Error('PILOT_MEDIA_ID_COLLISION');const blob=await transport.download(r.storage_path);await verifyBlob(r,blob);return {id:r.asset_id,kind:r.kind,blob,metadata:r.metadata,createdAt:r.created_at_ms} satisfies PilotMedia;}
 };
}
