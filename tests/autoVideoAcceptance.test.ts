import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAutoVideoAcceptance} from '../autoVideoAcceptance.js';
import {createGenerationHandler} from '../server/generationJobs.js';
test('autonomous receipt survives lost POST, retrieves verified video with GET only',async()=>{
 const map=new Map<string,string>(),storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v)},removeItem:(k:string)=>map.delete(k)};
 let posts=0,id='';const b=Buffer.alloc(1024);b.write('ftyp',4);const sha=createHash('sha256').update(b).digest('hex');
 const fetchImpl:typeof fetch=async(u,o)=>{if(o?.method==='POST'){posts++;const req=JSON.parse(String(o.body));id=req.job_id;assert.equal(req.request.video_auto_version,1);assert.ok([...map.values()].some(v=>v.includes(id)));throw Error('lost response');}return new Response(JSON.stringify(String(u).includes('media_offset=')?{job_id:id,offset:0,size:b.length,sha256:sha,data:b.toString('base64')}:{job_id:id,status:'done',result:{choices:[{message:{content:JSON.stringify({video_auto_version:1,queue_id:'fixture-auto',mime:'video/mp4',chunk_size:262144,size:b.length,sha256:sha})}}]}}));};
 const make=()=>createAutoVideoAcceptance(storage,fn=>fn(),fetchImpl);
 await assert.rejects(make().start(),/lost response/);await assert.rejects(make().start(),/ALREADY_SUBMITTED/);
 assert.equal((await make().poll()).status,'PASS');assert.equal((await make().poll()).status,'PASS');assert.equal(posts,1);
});
test('proxy rejects caller-selected internal stages and higher cost auto video options',async()=>{
 const id='12345678-1234-4234-8234-123456789abc',plan={video_auto_version:1,model:'wan-2-7-enhanced-text-to-video',prompt:'Lake',duration:'5s',resolution:'720p',adultConfirmed:true};
 for(const [request,expected] of [[plan,202],[{...plan,phase:'retrieve'},400],[{...plan,queue_id:'fixture'},400],[{...plan,duration:'15s'},400],[{...plan,resolution:'1080p'},400]] as const){let calls=0;const res={code:0,setHeader(){},status(n:number){this.code=n;return this},json(){return this}};const h=createGenerationHandler({env:{AIGF_VPS_QUEUE_ENABLED:'1',AIGF_VPS_QUEUE_URL:'https://fixture.invalid/',AIGF_VPS_QUEUE_TOKEN:'x'.repeat(64)},authenticate:()=>true,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({job_id:id,status:'queued'}))}});await h({method:'POST',body:{job_id:id,request}},res);assert.equal(res.code,expected);assert.equal(calls,expected===202?1:0);}
});
