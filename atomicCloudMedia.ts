export type AtomicMediaRow={asset_id:string;conversation_key:string|null;kind:string;storage_path:string;mime_type:string;byte_size:number;signature:string;metadata:Record<string,unknown>;created_at_ms:number};
export type AtomicMediaAsset=AtomicMediaRow&{blob:Blob};
export type AtomicMediaDelta={upsert:AtomicMediaRow[];remove:string[]};
const sha=async(b:BufferSource)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
export async function stageAtomicMedia(uid:string,assets:AtomicMediaAsset[],previous:Record<string,string>,io:{upload:(path:string,blob:Blob,mime:string)=>Promise<void>;download:(path:string)=>Promise<Blob>},assertCurrent:()=>void):Promise<AtomicMediaDelta>{
 const ids=new Set<string>(),upsert:AtomicMediaRow[]=[];
 for(const a of assets){
  if(!a.asset_id||ids.has(a.asset_id)||typeof a.signature!=='string')throw Error('ATOMIC_MEDIA_ID_INVALID');
  ids.add(a.asset_id);
  if(previous[a.asset_id]===a.signature)continue;
  if(!['persona_avatar','room_avatar','character_photo','attachment'].includes(a.kind)||!a.mime_type||a.blob.size!==a.byte_size||a.byte_size<1||a.byte_size>52428800)throw Error('ATOMIC_MEDIA_INVALID');
  const hash=await sha(await a.blob.arrayBuffer()),idHash=await sha(new TextEncoder().encode(a.asset_id));
  const path=uid+'/atomic-v3/'+idHash+'/'+hash;
  const verify=async()=>{const b=await io.download(path);if(b.size!==a.byte_size||await sha(await b.arrayBuffer())!==hash)throw Error('ATOMIC_MEDIA_BYTES_MISMATCH');};
  assertCurrent();
  try{await io.upload(path,a.blob,a.mime_type);}catch(e){try{await verify();}catch{throw e;}}
  await verify();assertCurrent();
  const {blob:_blob,...row}=a;
  upsert.push({...row,storage_path:path});
 }
 return {upsert,remove:Object.keys(previous).filter(id=>!ids.has(id))};
}
