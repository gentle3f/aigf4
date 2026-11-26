import test from 'node:test';
import assert from 'node:assert/strict';
import {createPilotMediaSync,type PilotMediaRow,type PilotMediaTransport} from '../pilotMediaSync.js';
const uid='10000000-0000-4000-8000-000000000001';
const setup=()=>{
 const rows=new Map<string,PilotMediaRow>(),files=new Map<string,Blob>();let uploads=0,inserts=0,loseUpload=false,loseInsert=false;
 const t:PilotMediaTransport={read:async id=>rows.get(id)||null,list:async()=>[...rows.values()],upload:async(p,b)=>{uploads++;if(files.has(p))throw Error('exists');files.set(p,b);if(loseUpload)throw Error('lost upload');},download:async p=>{const b=files.get(p);if(!b)throw Error('missing');return b;},insert:async r=>{inserts++;if(rows.has(r.asset_id))throw Error('exists');rows.set(r.asset_id,r);if(loseInsert)throw Error('lost insert');}};
 return {rows,files,t,calls:()=>({uploads,inserts}),lose:()=>{loseUpload=true;loseInsert=true;}};
};
const image={id:'studio-image-v1-10000000-0000-4000-8000-000000000002',kind:'image' as const,blob:new Blob(['fixture image'],{type:'image/webp'}),createdAt:1,metadata:{prompt:'fixture'}};
const video={id:'studio-video-v1-abc-fixture',kind:'video' as const,blob:new Blob(['fixture video'],{type:'video/mp4'}),createdAt:2,metadata:{name:'fixture.mp4'}};
test('image and video exact byte roundtrip, no duplicate upload',async()=>{
 const f=setup(),a=createPilotMediaSync(uid,f.t),b=createPilotMediaSync(uid,f.t);
 for(const x of [image,video]){assert.equal(await a.push(x),'synced');const p=await b.pull(x.id);assert.equal(await p!.blob.text(),await x.blob.text());assert.deepEqual(p!.metadata,x.metadata);assert.equal(await b.push(x),'already-synced');}
 assert.deepEqual(f.calls(),{uploads:2,inserts:2});
});
test('lost upload and insert response reconciled by readback without duplicate writes',async()=>{
 const f=setup();f.lose();const a=createPilotMediaSync(uid,f.t);
 assert.equal(await a.push(image),'synced');assert.equal(await a.push(image),'already-synced');assert.deepEqual(f.calls(),{uploads:1,inserts:1});
});
test('reject changed asset identity and corrupt remote bytes',async()=>{
 const f=setup(),a=createPilotMediaSync(uid,f.t);await a.push(image);
 await assert.rejects(a.push({...image,blob:new Blob(['other'],{type:'image/webp'})}),/ID_COLLISION/);
 f.files.set(f.rows.get(image.id)!.storage_path,new Blob(['bad'],{type:'image/webp'}));await assert.rejects(a.pull(image.id),/BYTES_MISMATCH/);
 assert.deepEqual(f.calls(),{uploads:1,inserts:1});
});
test('reject foreign paths and unsupported MIME types before storage write',async()=>{
 const f=setup(),a=createPilotMediaSync(uid,f.t);await assert.rejects(a.push({...image,blob:new Blob(['x'],{type:'text/plain'})}),/MANIFEST_INVALID/);
 await a.push(image);f.rows.get(image.id)!.storage_path='other/'+image.id+'/'+'a'.repeat(64);await assert.rejects(a.pull(image.id),/MANIFEST_INVALID/);
});
