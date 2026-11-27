import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {submitDurableVideo,createVpsVideoSubmission} from '../vpsVideoSubmission.js';
import {sanitizePersistedVideoJob,type PersistedVideoJob} from '../videoStudioPersistence.js';
import {retrieveAutonomousStudioVideo} from '../vpsAutoVideoStudio.js';
import {getSavedStudioVideo,persistStudioVideo} from '../studioMediaStore.js';
test('studio autonomous submission resumes via GET and saves by stable VPS ID',async()=>{
 let receipt:PersistedVideoJob|null=null,posts=0;const id='12345678-1234-4234-8234-123456789abc',raw=Buffer.alloc(1024);raw.write('ftyp',4);const sha=createHash('sha256').update(raw).digest('hex');
 const fetchImpl:typeof fetch=async(u,o)=>{if(o?.method==='POST'){posts++;assert.equal(JSON.parse(String(o.body)).request.video_auto_version,1);assert.equal(receipt?.autonomous,true);throw Error('offline');}return new Response(JSON.stringify(String(u).includes('media_offset')?{job_id:id,offset:0,size:raw.length,sha256:sha,data:raw.toString('base64')}:{job_id:id,status:'done',result:{choices:[{message:{content:JSON.stringify({video_auto_version:1,queue_id:'provider-fixture',mime:'video/mp4',size:raw.length,sha256:sha,chunk_size:262144})}}]}}));};
 await assert.rejects(submitDurableVideo({options:{model:'wan-2-7-enhanced-text-to-video',prompt:'Lake',duration:'5s',resolution:'720p',adultConfirmed:true},modelName:'Wan',storage:{read:()=>receipt,write:r=>{receipt=sanitizePersistedVideoJob(r);return !!receipt}},lock:fn=>fn(),transport:createVpsVideoSubmission(fetchImpl),onStored:()=>{},autonomous:true,newId:()=>id}),/offline/);
 const job=receipt!;assert.ok(job);assert.equal(await getSavedStudioVideo(job),null);const blob=await retrieveAutonomousStudioVideo(job,undefined,fetchImpl);assert.ok(blob);const saved=await persistStudioVideo(job,blob);assert.equal((await getSavedStudioVideo(job))?.id,saved.id);assert.equal(posts,1);
});

test('cloud registration failure prevents paid video submission and retains receipt',async()=>{
 let receipt:PersistedVideoJob|null=null,posts=0;
 await assert.rejects(submitDurableVideo({options:{model:'wan-2-7-enhanced-text-to-video',prompt:'Lake',duration:'5s',resolution:'720p',adultConfirmed:true},modelName:'Wan',storage:{read:()=>receipt,write:r=>{receipt=r;return true}},lock:fn=>fn(),transport:createVpsVideoSubmission(async()=>{posts++;throw Error('unexpected')}),onStored:()=>{},autonomous:true,beforeSubmit:async r=>{assert.equal(receipt,r);throw Error('registration offline')}}),/registration offline/);
 assert.equal(posts,0);assert.ok(receipt);
});
