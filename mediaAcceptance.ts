import {createVpsImageTransport,submitDurableImage,readImageReceipt,IMAGE_RECEIPT_KEY} from './vpsImageJob.js';
import {createVpsVideoSubmission,submitDurableVideo,VPS_VIDEO_MODEL} from './vpsVideoSubmission.js';
import {sanitizePersistedVideoJob,type PersistedVideoJob} from './videoStudioPersistence.js';
import {getSavedStudioImage,persistStudioImage,getSavedStudioVideo,persistStudioVideo} from './studioMediaStore.js';
import type {VeniceVideoRetrieveResult} from './veniceVideo.js';
const PREFIX='aigfAcceptanceMediaV1:';
export const IMAGE_OPTIONS={mode:'generate' as const,model:'qwen-image-3',prompt:'A peaceful empty lake at sunrise, landscape photograph, mountains and soft clouds, no people, no text.',aspectRatio:'1:1',resolution:'1K',variants:1,adultConfirmed:true};
export const VIDEO_OPTIONS={model:VPS_VIDEO_MODEL,prompt:'Five second static-camera nature shot of gentle ripples on an empty mountain lake at sunrise. No people, no text.',duration:'5s' as const,resolution:'720p',aspectRatio:'16:9',audio:false,adultConfirmed:true};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Report={id:string;size:number;mime:string;sha256:string;cloudSizeEligible:boolean};
const digest=async(b:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
export function createMediaAcceptance({storage,lock,fetchImpl=fetch,retrieveVideo,cleanupVideo}:{storage:Store;lock:<T>(work:()=>Promise<T>)=>Promise<T>;fetchImpl?:typeof fetch;retrieveVideo:(job:PersistedVideoJob)=>Promise<VeniceVideoRetrieveResult>;cleanupVideo:(job:PersistedVideoJob)=>Promise<void>}){
 const store:Store={getItem:k=>storage.getItem(PREFIX+k),setItem:(k,v)=>{storage.setItem(PREFIX+k,v);if(storage.getItem(PREFIX+k)!==v)throw Error('MEDIA_ACCEPTANCE_JOURNAL_FAILED');},removeItem:k=>storage.removeItem(PREFIX+k)};
 const images=createVpsImageTransport(fetchImpl),videos=createVpsVideoSubmission(fetchImpl);
 const videoKey='video-receipt';
 const readVideo=()=>{const raw=store.getItem(videoKey);if(!raw)return null;const j=sanitizePersistedVideoJob(JSON.parse(raw));if(!j||j.model!==VPS_VIDEO_MODEL||j.prompt!==VIDEO_OPTIONS.prompt)throw Error('MEDIA_VIDEO_RECEIPT_INVALID');return j;};
 const writeVideo=(j:PersistedVideoJob)=>{store.setItem(videoKey,JSON.stringify(j));return true;};
 const report=(k:string):Report|null=>{const raw=store.getItem(k);if(!raw)return null;const r=JSON.parse(raw);if(typeof r?.id!=='string'||!Number.isSafeInteger(r.size)||r.size<=0||typeof r.mime!=='string'||! /^[a-f0-9]{64}$/.test(r.sha256)||typeof r.cloudSizeEligible!=='boolean')throw Error('MEDIA_ACCEPTANCE_REPORT_INVALID');return r;};
 async function saveReport(key:string,id:string,blob:Blob){const r:Report={id,size:blob.size,mime:blob.type,sha256:await digest(blob),cloudSizeEligible:blob.size<=50*1024*1024};store.setItem(key,JSON.stringify(r));return r;}
 return {read:()=>({image:report('image-report'),video:report('video-report'),imagePending:readImageReceipt(store)?.jobId??null,videoPending:readVideo()?.queueId??null}),
  imageStep:()=>lock(async()=>{
   if(report('image-report'))return 'done';
   let r=readImageReceipt(store);
   if(!r){await submitDurableImage({options:IMAGE_OPTIONS,modelName:'Qwen Image 3 (acceptance)',storage:store,lock:fn=>fn(),transport:images});return 'pending';}
   const existing=await getSavedStudioImage(r);
   const blob=existing?.blob??await images.retrieve(r);
   if(!blob)return 'pending';
   const saved=existing??await persistStudioImage(r,blob);
   await saveReport('image-report',saved.id,saved.blob);
   return 'done';
  }),
  videoStep:(allowNew:boolean)=>lock(async()=>{
   if(report('video-report'))return 'done';
   let j=readVideo();
   if(!j){
    if(!allowNew)throw Error('MEDIA_VIDEO_CONFIRMATION_REQUIRED');
    await submitDurableVideo({options:VIDEO_OPTIONS,modelName:'Wan (acceptance)',storage:{read:readVideo,write:writeVideo},lock:fn=>fn(),transport:videos,onStored:()=>{}});
    return 'pending';
   }
   if(j.submissionId){const resolved=await videos.resolve(j);if(!resolved)return 'pending';writeVideo(resolved);j=resolved;}
   const existing=await getSavedStudioVideo(j);
   if(existing){await saveReport('video-report',existing.id,existing.blob);return 'done';}
   const v=await retrieveVideo(j);
   if(v.kind==='processing')return 'pending';
   if(!v.blob)throw Error('MEDIA_VIDEO_URL_ONLY_NO_DURABLE_BLOB');
   const b=new Uint8Array(await v.blob.slice(0,12).arrayBuffer());
   if(b.length<12||String.fromCharCode(...b.slice(4,8))!=='ftyp')throw Error('MEDIA_VIDEO_MP4_HEADER_INVALID');
   const saved=await persistStudioVideo(j,v.blob);
   await saveReport('video-report',saved.id,saved.blob);
   try{await cleanupVideo(j);}catch{/* local artifact already durable; cleanup is not part of acceptance */}
   return 'done';
  })
 };
}
