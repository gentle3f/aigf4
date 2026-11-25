import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMediaAcceptance,IMAGE_OPTIONS,VIDEO_OPTIONS} from '../mediaAcceptance.js';
import {getCharacterPhotoAsset} from '../photoStore.js';
import {getChatAttachment} from '../chatMediaStore.js';
test('lost image/video dispatch recovered by GET; actual durable stores and reports; no double charge',async()=>{
 const map=new Map<string,string>(),jobs=new Map<string,string>(),calls:string[]=[];
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},removeItem:(k:string)=>map.delete(k)};
 const bytes=Buffer.alloc(1024,42),sha=createHash('sha256').update(bytes).digest('hex');
 const video=Buffer.alloc(1024,0);video.write('ftyp',4);
 let cleanup=0,retrieves=0,urlOnly=true;
 const fetchImpl:typeof fetch=async(u,o)=>{
  if(o?.method==='POST'){const b=JSON.parse(String(o.body));jobs.set(b.job_id,b.request.image_submit_version?'image':'video');calls.push('POST');assert.ok([...map.values()].some(v=>v.includes(b.job_id)));throw Error('lost response');}
  const url=new URL(String(u),'https://fixture.invalid');const id=url.searchParams.get('job_id')!;
  calls.push('GET');const kind=jobs.get(id);assert.ok(kind);
  const result=kind==='image'?{image_submit_version:1,size:bytes.length,sha256:sha,mime:'image/webp',chunk_size:262144}:{video_submit_version:1,model:VIDEO_OPTIONS.model,queue_id:'acceptance-fixture-video'};
  return new Response(JSON.stringify(url.searchParams.has('media_offset')?{job_id:id,offset:0,size:bytes.length,sha256:sha,data:bytes.toString('base64')}:{job_id:id,status:'done',result:{choices:[{message:{content:JSON.stringify(result)}}]}}));
 };
 const make=()=>createMediaAcceptance({storage,lock:fn=>fn(),fetchImpl,retrieveVideo:async()=>{retrieves++;return urlOnly?{kind:'completed',downloadUrl:'https://fixture.invalid/video'}:{kind:'completed',blob:new Blob([video],{type:'video/mp4'})}},cleanupVideo:async j=>{cleanup++;assert.ok((await getChatAttachment('studio-video-v1-'+Buffer.from(j.model).toString('hex')+'-'+j.queueId))?.blob.size);}});
 await assert.rejects(make().imageStep(),/lost response/);
 assert.equal(await make().imageStep(),'done');
 const image=make().read().image!;assert.equal(image.sha256,sha);assert.equal((await getCharacterPhotoAsset(image.id))?.blob.size,1024);
 assert.equal(await make().imageStep(),'done');
 await assert.rejects(make().videoStep(false),/CONFIRMATION_REQUIRED/);
 await assert.rejects(make().videoStep(true),/lost response/);
 await assert.rejects(make().videoStep(false),/URL_ONLY/);assert.equal(cleanup,0);
 urlOnly=false;assert.equal(await make().videoStep(false),'done');
 const report=make().read().video!;assert.equal(report.size,1024);assert.equal((await getChatAttachment(report.id))?.blob.size,1024);
 assert.equal(await make().videoStep(false),'done');assert.equal(cleanup,0);assert.equal(retrieves,2);
 assert.equal(calls.filter(c=>c==='POST').length,2);assert.equal(IMAGE_OPTIONS.variants,1);assert.equal(VIDEO_OPTIONS.duration,'5s');
});

test('adopt existing provider ID without new generation',async()=>{const m=new Map<string,string>();let calls=0,gets=0;const media=createMediaAcceptance({storage:{getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v)},removeItem:k=>m.delete(k)},lock:fn=>fn(),fetchImpl:async()=>{calls++;throw Error('NO_NEW_REQUEST')},retrieveVideo:async j=>{gets++;assert.equal(j.queueId,'existing-queue-fixture');return {kind:'processing',status:'PROCESSING'}},cleanupVideo:async()=>{throw Error('NO_DELETE')}});await media.adoptProviderVideo('existing-queue-fixture');assert.equal(await media.videoStep(false),'pending');assert.equal(calls,0);assert.equal(gets,1);await assert.rejects(media.adoptProviderVideo('different'),/ADOPTION_BLOCKED/);});
