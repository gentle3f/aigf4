import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createStudioMediaRecovery,readArchivedStudioBlob,type StudioRecoveryRow,type StudioRecoveryTransport} from '../studioMediaRecoveryClient.js';
import {getSavedStudioImage} from '../studioMediaStore.js';
import type {ImageReceipt} from '../vpsImageJob.js';
const id='12345678-1234-4234-8234-123456789abd',receipt:ImageReceipt={version:1,jobId:id,prompt:'Synthetic lake',modelName:'Fixture',createdAt:1000};
const bytes=Buffer.alloc(262144+700,42),sha256=createHash('sha256').update(bytes).digest('hex');
const row:StudioRecoveryRow={job_id:id,kind:'image',receipt,status:'archived',mime:'image/webp',sha256,byte_size:bytes.length};
function fixture(){
 const calls:string[]=[];let bad=false,fail=false;
 const t:StudioRecoveryTransport={register:async()=>{calls.push('register');return 'pending'},list:async()=>[row],chunk:async(job_id,offset)=>{calls.push('chunk');const b=Buffer.from(bytes.subarray(offset,offset+262144));if(bad)b[0]^=1;return {job_id,offset,size:bytes.length,sha256,data:b.toString('base64')}},sync:async()=>{calls.push('sync');assert.ok(await getSavedStudioImage(receipt));if(fail)throw Error('offline')},confirm:async()=>{calls.push('confirm');return 'transferred'}};
 return {t,calls,bad:()=>bad=true,fail:()=>fail=true};
}
test('verified media restored to original store before cloud transfer confirmation',async()=>{const f=fixture(),c=createStudioMediaRecovery(f.t);await c.registerImage(receipt);assert.equal((await c.list('image')).length,1);assert.equal((await c.list('video')).length,0);const a=await c.transfer(row);assert.equal(a.id,'studio-image-v1-'+id);assert.deepEqual(f.calls,['register','chunk','chunk','sync','confirm']);});
test('failed sync never confirms transfer; local bytes survive',async()=>{const f=fixture();f.fail();await assert.rejects(createStudioMediaRecovery(f.t).transfer(row),/offline/);assert.ok(await getSavedStudioImage(receipt));assert.ok(!f.calls.includes('confirm'));});
test('corrupted archive bytes rejected before local save or sync',async()=>{const f=fixture();f.bad();await assert.rejects(readArchivedStudioBlob(row,f.t),/HASH_MISMATCH/);assert.ok(!f.calls.includes('sync'));});

test('another device transfers archive during download, no duplicate writes',async()=>{
 const f=fixture();let lists=0;
 f.t.chunk=async()=>{throw Error('chunk missing')};
 f.t.list=async()=>{lists++;return [{...row,status:'transferred',mime:null,sha256:null,byte_size:null}]};
 await assert.rejects(createStudioMediaRecovery(f.t).transfer(row),/ALREADY_TRANSFERRED/);
 assert.equal(lists,1);assert.ok(!f.calls.includes('sync'));assert.ok(!f.calls.includes('confirm'));
});
test('transferred receipt only resolves when matching local asset exists',async()=>{
 const f=fixture(),c=createStudioMediaRecovery(f.t);
 assert.ok(await c.localAsset({...row,status:'transferred'}));
 const other='12345678-1234-4234-8234-123456789abe';
 assert.equal(await c.localAsset({...row,job_id:other,receipt:{...receipt,jobId:other},status:'transferred'}),null);
});
