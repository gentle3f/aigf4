import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {archiveExistingMedia,retrieveCompletedMedia,MEDIA_CHUNK} from '../server/mediaArchiveV4.mjs';
const id='12345678-1234-4234-8234-123456789abc';
function fixture(kind='image'){
 const bytes=Buffer.alloc(MEDIA_CHUNK+700,42);
 if(kind==='image'){bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WEBP',8);}
 else bytes.write('ftyp',4);
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const manifest={...(kind==='image'?{image_submit_version:1}:{video_auto_version:1,queue_id:'fixture'}),mime:kind==='image'?'image/webp':'video/mp4',chunk_size:MEDIA_CHUNK,size:bytes.length,sha256};
 let status='done',damage=false,lost=false,reads=0,posts=0;
 const queue={get:async()=>{reads++;return {job_id:id,status,result:{choices:[{message:{content:JSON.stringify(manifest)}}]}}},media:async(_,offset)=>{const data=Buffer.from(bytes.subarray(offset,offset+MEDIA_CHUNK));if(damage)data[0]^=1;return {job_id:id,offset,size:bytes.length,sha256,data:data.toString('base64')};},submit:()=>{posts++;throw Error('NO_SUBMIT');}};
 const assets=new Map(),archive={read:async id=>assets.get(id),putIfAbsent:async(id,v)=>{if(!assets.has(id))assets.set(id,v);if(lost)throw Error('lost ack');}};
 return {kind,bytes,queue,archive,assets,manifest,status:v=>status=v,damage:()=>damage=true,lost:()=>lost=true,counts:()=>({reads,posts})};
}
for(const kind of ['image','video'])test(kind+' completed job archived exactly once, no new generation',async()=>{const f=fixture(kind);const a=await archiveExistingMedia({id,kind,...f});assert.equal(a.status,'archived');assert.deepEqual(f.assets.get(id).bytes,f.bytes);assert.deepEqual(await archiveExistingMedia({id,kind,...f}),a);assert.deepEqual(f.counts(),{reads:1,posts:0});});
test('pending and failed jobs never store media',async()=>{const f=fixture();f.status('running');assert.equal((await archiveExistingMedia({id,...f})).status,'waiting');f.status('failed');assert.equal((await archiveExistingMedia({id,...f})).status,'failed');assert.equal(f.assets.size,0);});
test('corrupt chunks never publish',async()=>{const f=fixture();f.damage();await assert.rejects(archiveExistingMedia({id,...f}),/HASH_OR_HEADER/);assert.equal(f.assets.size,0);});
test('lost archive acknowledgement recovers from existing bytes without re-fetching queue',async()=>{const f=fixture();f.lost();await assert.rejects(archiveExistingMedia({id,...f}),/lost ack/);assert.equal((await archiveExistingMedia({id,...f})).status,'archived');assert.deepEqual(f.counts(),{reads:1,posts:0});});
test('invalid existing object cannot be silently replaced',async()=>{const f=fixture();f.assets.set(id,{kind:'image',mime:'image/webp',sha256:'a'.repeat(64),bytes:f.bytes});await assert.rejects(archiveExistingMedia({id,...f}),/COLLISION/);assert.equal(f.counts().reads,0);});
test('wrong media type rejects existing queue result',async()=>{const f=fixture('video');await assert.rejects(retrieveCompletedMedia({id,queue:f.queue,kind:'image'}),/MANIFEST_INVALID/);});
