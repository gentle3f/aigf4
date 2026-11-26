import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {restorePilotStudioAsset} from '../pilotStudioMedia.js';
import {listSavedStudioImages,listSavedStudioVideos,videoAssetId,STUDIO_MEDIA_KEY} from '../studioMediaStore.js';
import {getCharacterPhotoAsset,saveCharacterPhotoAsset} from '../photoStore.js';
import {getChatAttachment} from '../chatMediaStore.js';
import type {PersistedVideoJob} from '../videoStudioPersistence.js';
test('verified remote assets restore to actual original Studio stores without duplicates or replacing unrelated data',async()=>{
 const image={id:'studio-image-v1-12345678-1234-4234-8234-123456789ab5',kind:'image' as const,blob:new Blob([new Uint8Array(1024).fill(23)],{type:'image/webp'}),createdAt:1000,metadata:{prompt:'Lake',studio:{version:1,modelName:'Image fixture',seed:4}}};
 const videoJob={version:1,model:'wan-2-7-enhanced-text-to-video',modelName:'Wan',queueId:'fixture-media-video',prompt:'Lake',mode:'text-to-video',queuedAt:1234} as PersistedVideoJob;
 const video={id:videoAssetId(videoJob),kind:'video' as const,blob:new Blob([new Uint8Array(2048).fill(16)],{type:'video/mp4'}),createdAt:1001,metadata:{name:'lake.mp4',studio:{version:1,model:videoJob.model,modelName:videoJob.modelName,prompt:videoJob.prompt,queueId:videoJob.queueId}}};
 for(let i=0;i<2;i++){await restorePilotStudioAsset(image);await restorePilotStudioAsset(video);}
 assert.equal((await listSavedStudioImages()).filter(a=>a.id===image.id).length,1);
 assert.equal((await listSavedStudioVideos()).filter(a=>a.id===video.id).length,1);
 assert.equal((await getCharacterPhotoAsset(image.id))!.personaKey,STUDIO_MEDIA_KEY);
 assert.equal((await getChatAttachment(video.id))!.conversationKey,STUDIO_MEDIA_KEY);
 const collision={...image,id:'studio-image-v1-12345678-1234-4234-8234-123456789ab6'};
 await saveCharacterPhotoAsset({id:collision.id,personaKey:'unrelated',blob:image.blob,prompt:'Original',createdAt:1000});
 await assert.rejects(restorePilotStudioAsset(collision),/INVALID|COLLISION/);
 assert.equal((await getCharacterPhotoAsset(collision.id))!.prompt,'Original');
});
