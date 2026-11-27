import test from 'node:test';
import assert from 'node:assert/strict';
import {stageAtomicMedia,type AtomicMediaAsset} from '../atomicCloudMedia.js';
const uid='10000000-0000-4000-8000-000000000001';
const asset=(id:string,bytes:string,signature='v1',kind='character_photo'):AtomicMediaAsset=>{const blob=new Blob([bytes],{type:kind==='attachment'?'video/mp4':'image/webp'});return {asset_id:id,conversation_key:'cc',kind,storage_path:'legacy-path',mime_type:blob.type,byte_size:blob.size,signature,metadata:{id},created_at_ms:100,blob};};
const setup=()=>{const files=new Map<string,Blob>();let sends=0,lose=false;return {files,io:{upload:async(p:string,b:Blob)=>{sends++;if(files.has(p))throw Error('exists');files.set(p,b);if(lose)throw Error('lost upload');},download:async(p:string)=>{const b=files.get(p);if(!b)throw Error('missing');return b;}},lose:()=>lose=true,sends:()=>sends};};
test('unchanged legacy media skipped; new image, attachment, avatar stage separately',async()=>{
 const f=setup(),old=asset('old','old'),a=asset('image','new'),b=asset('video','new','v1','attachment'),c=asset('avatar','avatar','v1','persona_avatar');
 const r=await stageAtomicMedia(uid,[old,a,b,c],{old:'v1',gone:'v1'},f.io,()=>{});
 assert.equal(r.upsert.length,3);assert.deepEqual(r.remove,['gone']);assert.equal(f.sends(),3);assert.equal(new Set(r.upsert.map(x=>x.storage_path)).size,3);
 for(const m of r.upsert){assert.match(m.storage_path,/\/atomic-v3\/[a-f0-9]{64}\/[a-f0-9]{64}$/);assert.equal('blob' in m,false);}
});
test('lost upload response verifies exact bytes; changed content uses different path',async()=>{
 const f=setup();f.lose();const a=asset('one','old');
 const first=await stageAtomicMedia(uid,[a],{},f.io,()=>{}),retry=await stageAtomicMedia(uid,[a],{},f.io,()=>{});
 assert.equal(first.upsert[0].storage_path,retry.upsert[0].storage_path);
 const next=await stageAtomicMedia(uid,[asset('one','new','v2')],{one:'v1'},f.io,()=>{});
 assert.notEqual(first.upsert[0].storage_path,next.upsert[0].storage_path);assert.equal(await f.files.get(first.upsert[0].storage_path)!.text(),'old');assert.equal(f.files.size,2);
});
test('corrupt readback refuses manifest and preserves prior data',async()=>{
 const f=setup(),a=asset('one','new');
 await assert.rejects(stageAtomicMedia(uid,[a],{}, {...f.io,download:async()=>new Blob(['bad'],{type:'image/webp'})},()=>{}),/BYTES_MISMATCH/);
});
