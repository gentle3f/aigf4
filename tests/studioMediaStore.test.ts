import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {getSavedStudioImage,persistStudioImage,listSavedStudioImages,deleteSavedStudioImage,getSavedStudioVideo,persistStudioVideo,listSavedStudioVideos,deleteSavedStudioVideo,imageAssetId,videoAssetId,STUDIO_MEDIA_KEY} from '../studioMediaStore.js';
import {saveCharacterPhotoAsset,getCharacterPhotoAsset} from '../photoStore.js';
import {saveChatAttachment,getChatAttachment} from '../chatMediaStore.js';
import type {ImageReceipt} from '../vpsImageJob.js';
import type {PersistedVideoJob} from '../videoStudioPersistence.js';
const image=(jobId:string):ImageReceipt=>({version:1,jobId,prompt:'A quiet lake',modelName:'Qwen Image 3',aspectRatio:'16:9',seed:42,createdAt:1234});
const video=(queueId:string):PersistedVideoJob=>({version:1,model:'wan-2-7-enhanced-text-to-video',modelName:'Wan',queueId,prompt:'A cloud over a lake',mode:'text-to-video',queuedAt:1234});
const photoBlob=new Blob([new Uint8Array(1024).fill(42)],{type:'image/webp'});
const videoBlob=new Blob([new Uint8Array(2048).fill(65)],{type:'video/mp4'});
test('background image stored in existing photo database, readback and replay are idempotent',async()=>{
 const r=image('12345678-1234-4234-8234-123456789ab1');assert.equal(await getSavedStudioImage(r),null);
 const a=await persistStudioImage(r,photoBlob);assert.equal(a.personaKey,STUDIO_MEDIA_KEY);assert.equal(a.studio?.seed,42);
 assert.deepEqual(new Uint8Array(await a.blob.arrayBuffer()),new Uint8Array(await photoBlob.arrayBuffer()));
 const b=await persistStudioImage(r,photoBlob);assert.equal(b.id,a.id);assert.equal((await listSavedStudioImages()).filter(a=>a.id===b.id).length,1);
 await assert.rejects(persistStudioImage(r,new Blob([new Uint8Array(1024).fill(12)],{type:'image/webp'})),/COLLISION/);
 await deleteSavedStudioImage(a.id);assert.equal(await getSavedStudioImage(r),null);
});
test('video written to existing attachment store, metadata retained, no duplicate on retry',async()=>{
 const j=video('fixture-video-1');assert.equal(await getSavedStudioVideo(j),null);const a=await persistStudioVideo(j,videoBlob);
 assert.equal(a.conversationKey,STUDIO_MEDIA_KEY);assert.equal(a.studio?.prompt,j.prompt);assert.match(a.id,/^[a-z0-9-]+$/i);
 assert.equal((await persistStudioVideo(j,videoBlob)).id,a.id);assert.equal((await listSavedStudioVideos()).filter(a=>a.id===videoAssetId(j)).length,1);
 assert.deepEqual(new Uint8Array(await (await getSavedStudioVideo(j))!.blob.arrayBuffer()),new Uint8Array(await videoBlob.arrayBuffer()));
 await assert.rejects(persistStudioVideo(j,new Blob([new Uint8Array(2048).fill(22)],{type:'video/mp4'})),/COLLISION/);
 await deleteSavedStudioVideo(a.id);assert.equal(await getSavedStudioVideo(j),null);
});
test('unrelated existing photos or attachments never overwritten or deleted by studio',async()=>{
 const r=image('12345678-1234-4234-8234-123456789ab2');const id=imageAssetId(r.jobId);
 await saveCharacterPhotoAsset({id,personaKey:'unrelated',blob:photoBlob,prompt:r.prompt,createdAt:r.createdAt});
 await assert.rejects(persistStudioImage(r,photoBlob),/COLLISION/);await assert.rejects(deleteSavedStudioImage(id),/SCOPE/);assert.equal((await getCharacterPhotoAsset(id))?.personaKey,'unrelated');
 const j=video('fixture-video-2'),vId=videoAssetId(j);await saveChatAttachment({id:vId,conversationKey:'unrelated',name:'old.mp4',mimeType:'video/mp4',createdAt:1,blob:videoBlob});
 await assert.rejects(persistStudioVideo(j,videoBlob),/COLLISION/);await assert.rejects(deleteSavedStudioVideo(vId),/SCOPE/);assert.equal((await getChatAttachment(vId))?.conversationKey,'unrelated');
});
test('storage failure leaves no saved asset, retry can store the same job',async()=>{
 const r=image('12345678-1234-4234-8234-123456789ab3'),original=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(){throw new Error('quota');};
 try{await assert.rejects(persistStudioImage(r,photoBlob),/quota/);}finally{IDBObjectStore.prototype.put=original;}
 assert.equal(await getSavedStudioImage(r),null);assert.ok(await persistStudioImage(r,photoBlob));
});
test('reject unresolved video submission and wrong blob type',async()=>{
 const j=video('fixture-video-3');assert.throws(()=>videoAssetId({...j,submissionId:j.queueId}),/ID_INVALID/);
 await assert.rejects(persistStudioVideo(j,photoBlob),/INVALID/);
 await assert.rejects(persistStudioImage(image('12345678-1234-4234-8234-123456789ab4'),videoBlob),/INVALID/);
});
