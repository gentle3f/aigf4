import {getCharacterPhotoAsset,saveCharacterPhotoAsset,listCharacterPhotoAssets,deleteCharacterPhotoAsset,type CharacterPhotoAsset} from './photoStore.js';
import {getChatAttachment,saveChatAttachment,listChatAttachments,deleteChatAttachment,type StoredChatAttachment} from './chatMediaStore.js';
import type {ImageReceipt} from './vpsImageJob.js';
import type {PersistedVideoJob} from './videoStudioPersistence.js';
export const STUDIO_MEDIA_KEY='__aigf_studio_media_v1__';
const IMAGE_PREFIX='studio-image-v1-';
const VIDEO_PREFIX='studio-video-v1-';
export const imageAssetId=(jobId:string)=>IMAGE_PREFIX+jobId;
export function videoAssetId(job:PersistedVideoJob){
 if((job.submissionId&&!(job.autonomous===true&&job.submissionId===job.queueId&&job.model==='wan-2-7-enhanced-text-to-video'&&job.mode==='text-to-video'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job.queueId)))||!/^[a-zA-Z0-9_-]{1,200}$/.test(job.queueId)||!/^[a-zA-Z0-9._:-]{1,100}$/.test(job.model))throw Error('STUDIO_VIDEO_ID_INVALID');
 return VIDEO_PREFIX+Array.from(new TextEncoder().encode(job.model),b=>b.toString(16).padStart(2,'0')).join('')+'-'+job.queueId;
}
export type StudioImageMetadata={version:1;modelName:string;aspectRatio?:string;resolution?:string;seed?:number};
export type StudioVideoMetadata={version:1;model:string;modelName:string;queueId:string;prompt:string};
const sha=async(b:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
const imageValid=(a:CharacterPhotoAsset|undefined,id:string)=>!!a&&a.id===id&&a.personaKey===STUDIO_MEDIA_KEY&&a.blob.type==='image/webp'&&a.blob.size>=512&&a.blob.size<=8*1024*1024;
const videoValid=(a:StoredChatAttachment|undefined,id:string)=>!!a&&a.id===id&&a.conversationKey===STUDIO_MEDIA_KEY&&a.blob.type.startsWith('video/')&&a.blob.size>0&&a.blob.size<=100*1024*1024;
export async function getSavedStudioImage(r:ImageReceipt){
 const a=await getCharacterPhotoAsset(imageAssetId(r.jobId));
 if(!a)return null;
 if(!imageValid(a,imageAssetId(r.jobId))||a.prompt!==r.prompt||a.createdAt!==r.createdAt)throw Error('STUDIO_IMAGE_COLLISION');
 return a;
}
export async function persistStudioImage(r:ImageReceipt,blob:Blob){
 const id=imageAssetId(r.jobId),existing=await getSavedStudioImage(r);
 const asset:CharacterPhotoAsset={id,personaKey:STUDIO_MEDIA_KEY,blob,prompt:r.prompt,createdAt:r.createdAt,studio:{version:1,modelName:r.modelName,aspectRatio:r.aspectRatio,resolution:r.resolution,seed:r.seed}};
 if(!imageValid(asset,id))throw Error('STUDIO_IMAGE_INVALID');
 if(existing){if(await sha(existing.blob)!==await sha(blob))throw Error('STUDIO_IMAGE_COLLISION');return existing;}
 await saveCharacterPhotoAsset(asset);
 const saved=await getSavedStudioImage(r);
 if(!saved||await sha(saved.blob)!==await sha(blob))throw Error('STUDIO_IMAGE_NOT_DURABLE');
 return saved;
}
export async function getSavedStudioVideo(job:PersistedVideoJob){
 const id=videoAssetId(job),asset=await getChatAttachment(id);
 if(!asset)return null;
 if(!videoValid(asset,id)||asset.studio?.queueId!==job.queueId||asset.studio?.model!==job.model||asset.studio?.prompt!==job.prompt)throw Error('STUDIO_VIDEO_COLLISION');
 return asset;
}
export async function persistStudioVideo(job:PersistedVideoJob,blob:Blob){
 const id=videoAssetId(job),existing=await getSavedStudioVideo(job);
 const asset:StoredChatAttachment={id,conversationKey:STUDIO_MEDIA_KEY,blob,name:'venice-'+job.queueId+'.mp4',mimeType:blob.type,createdAt:job.queuedAt,studio:{version:1,model:job.model,modelName:job.modelName,queueId:job.queueId,prompt:job.prompt}};
 if(!videoValid(asset,id))throw Error('STUDIO_VIDEO_INVALID');
 if(existing){if(await sha(existing.blob)!==await sha(blob))throw Error('STUDIO_VIDEO_COLLISION');return existing;}
 await saveChatAttachment(asset);
 const saved=await getSavedStudioVideo(job);
 if(!saved||await sha(saved.blob)!==await sha(blob))throw Error('STUDIO_VIDEO_NOT_DURABLE');
 return saved;
}
export async function listSavedStudioImages(){return (await listCharacterPhotoAssets(STUDIO_MEDIA_KEY)).filter(a=>a.id.startsWith(IMAGE_PREFIX)&&imageValid(a,a.id));}
export async function listSavedStudioVideos(){return (await listChatAttachments(STUDIO_MEDIA_KEY)).filter(a=>a.id.startsWith(VIDEO_PREFIX)&&videoValid(a,a.id)&&a.studio?.version===1);}
export async function deleteSavedStudioImage(id:string){const a=await getCharacterPhotoAsset(id);if(!id.startsWith(IMAGE_PREFIX)||!imageValid(a,id))throw Error('STUDIO_IMAGE_SCOPE');await deleteCharacterPhotoAsset(id);}
export async function deleteSavedStudioVideo(id:string){const a=await getChatAttachment(id);if(!id.startsWith(VIDEO_PREFIX)||!videoValid(a,id))throw Error('STUDIO_VIDEO_SCOPE');await deleteChatAttachment(id);}

export function readStudioImageMetadata(scope:string,id:string,raw:unknown):StudioImageMetadata|undefined{
 if(scope!==STUDIO_MEDIA_KEY||!/^studio-image-v1-[a-f0-9-]{36}$/.test(id)||!raw||typeof raw!=='object')return undefined;
 const m=raw as Partial<StudioImageMetadata>;
 if(m.version!==1||typeof m.modelName!=='string'||!m.modelName.trim()||m.modelName.length>200)return undefined;
 return {version:1,modelName:m.modelName,...(typeof m.aspectRatio==='string'&&m.aspectRatio.length<=16?{aspectRatio:m.aspectRatio}:{}),...(typeof m.resolution==='string'&&m.resolution.length<=32?{resolution:m.resolution}:{}),...(Number.isSafeInteger(m.seed)?{seed:m.seed}:{})};
}
export function readStudioVideoMetadata(scope:string,id:string,raw:unknown):StudioVideoMetadata|undefined{
 if(scope!==STUDIO_MEDIA_KEY||!id.startsWith(VIDEO_PREFIX)||!raw||typeof raw!=='object')return undefined;
 const m=raw as Partial<StudioVideoMetadata>;
 if(m.version!==1||typeof m.model!=='string'||typeof m.queueId!=='string'||typeof m.modelName!=='string'||!m.modelName.trim()||m.modelName.length>200||typeof m.prompt!=='string'||!m.prompt.trim()||m.prompt.length>10000)return undefined;
 try{if(videoAssetId({model:m.model,queueId:m.queueId} as PersistedVideoJob)!==id)return undefined;}catch{return undefined;}
 return {version:1,model:m.model,modelName:m.modelName,queueId:m.queueId,prompt:m.prompt};
}
