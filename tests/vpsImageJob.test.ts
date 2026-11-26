import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {IMAGE_RECEIPT_KEY,buildImagePlan,createVpsImageTransport,readImageReceipt,submitDurableImage} from '../vpsImageJob.js';
import {createGenerationHandler} from '../server/generationJobs.js';
const id='12345678-1234-4234-8234-123456789abc',options={mode:'generate' as const,model:'qwen-image-3',prompt:'A quiet lake',variants:1,adultConfirmed:true};
const bytes=Buffer.alloc(262144+700,42),sha=createHash('sha256').update(bytes).digest('hex');
const manifest={image_submit_version:1,size:bytes.length,sha256:sha,mime:'image/webp',chunk_size:262144};
function fixture(){
 const map=new Map<string,string>();let fail=false,lost=false,corrupt=false;const calls:string[]=[];
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{if(fail)throw Error('quota');map.set(k,v)},removeItem:(k:string)=>map.delete(k)};
 const transport=createVpsImageTransport(async(u,o)=>{
  const url=String(u);calls.push(o!.method!);
  if(o!.method==='POST'){assert.equal(readImageReceipt(storage)?.jobId,id);if(lost)throw Error('offline');return new Response(JSON.stringify({job_id:id,status:'queued'}));}
  const match=url.match(/media_offset=(\d+)/);
  if(!match)return new Response(JSON.stringify({job_id:id,status:'done',result:{choices:[{message:{content:JSON.stringify(manifest)}}]}}));
  const offset=Number(match[1]),data=Buffer.from(bytes.subarray(offset,offset+262144));if(corrupt&&offset===0)data[0]^=1;
  return new Response(JSON.stringify({job_id:id,offset,size:bytes.length,sha256:sha,data:data.toString('base64')}));
 });
 const submit=()=>submitDurableImage({options,modelName:'Qwen',storage,lock:fn=>fn(),transport,newId:()=>id});
 return {storage,transport,submit,calls,fail:(v:boolean)=>fail=v,lost:(v:boolean)=>lost=v,corrupt:(v:boolean)=>corrupt=v};
}
test('image receipt before POST, lost response recovered via GET and verified chunks',async()=>{const f=fixture();f.lost(true);await assert.rejects(f.submit(),/offline/);const r=readImageReceipt(f.storage)!;const b=await f.transport.retrieve(r);assert.equal(b?.type,'image/webp');assert.deepEqual(Buffer.from(await b!.arrayBuffer()),bytes);assert.deepEqual(f.calls,['POST','GET','GET','GET']);assert.ok(f.storage.getItem(IMAGE_RECEIPT_KEY));});
test('quota failure before POST and existing receipt blocks duplicate',async()=>{const f=fixture();f.fail(true);await assert.rejects(f.submit(),/quota/);assert.equal(f.calls.length,0);f.fail(false);await f.submit();await assert.rejects(f.submit(),/PENDING_EXISTS/);assert.deepEqual(f.calls,['POST']);});
test('corrupt media rejected with receipt retained',async()=>{const f=fixture();const r=await f.submit();f.corrupt(true);await assert.rejects(f.transport.retrieve(r),/HASH_MISMATCH/);assert.ok(readImageReceipt(f.storage));});
test('limited pilot rejects edit, reference image and multiple variants',()=>{for(const change of [{mode:'edit' as const},{sourceImageBase64:'fixture'},{variants:2},{adultConfirmed:false},{model:'other'}])assert.throws(()=>buildImagePlan({...options,...change}),/UNSUPPORTED/);});
test('proxy checks exact offsets, chunk encoding and image plan, no raw metadata',async()=>{
 const request=buildImagePlan(options);
 for(const [method,body,query,expected] of [['POST',{job_id:id,request},{},202],['POST',{job_id:id,request:{...request,safe_mode:false}},{},400],['GET',undefined,{job_id:id,media_offset:'1'},400],['GET',undefined,{job_id:id,media_offset:'0'},200]] as const){
  let calls=0;let value:any;const res={code:0,setHeader(){},status(n:number){this.code=n;return this},json(v:any){value=v;return this}};
  const handler=createGenerationHandler({env:{AIGF_VPS_QUEUE_ENABLED:'1',AIGF_VPS_QUEUE_URL:'https://fixture.invalid/',AIGF_VPS_QUEUE_TOKEN:'x'.repeat(64)},authenticate:()=>true,fetchImpl:async(u)=>{calls++;if(method==='GET'){assert.match(String(u),/\/media\/0$/);return new Response(JSON.stringify({job_id:id,offset:0,size:bytes.length,sha256:sha,data:bytes.subarray(0,262144).toString('base64'),secret:'HIDDEN'}));}return new Response(JSON.stringify({job_id:id,status:'queued'}));}});
  await handler({method,body,query},res);assert.equal(res.code,expected);assert.equal(calls,expected===400?0:1);assert.ok(!JSON.stringify(value).includes('HIDDEN'));
 }
});
