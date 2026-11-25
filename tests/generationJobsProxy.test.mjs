import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationHandler} from '../api/generation-jobs.js';
const id='12345678-1234-4234-8234-123456789abc';
const env={AIGF_VPS_QUEUE_ENABLED:'1',AIGF_VPS_QUEUE_URL:'https://queue.example.invalid/',AIGF_VPS_QUEUE_TOKEN:'x'.repeat(64)};
const payload={job_id:id,request:{model:'glm-5-3-flash-uncensored',messages:[{role:'user',content:'Synthetic'}],max_completion_tokens:128}};
async function call({method='POST',body=payload,query={job_id:id},authorized=true,config=env,upstream,fail=false}={}){
 const calls=[];const response={code:0,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(d){this.data=d;return this}};
 const handler=createGenerationHandler({env:config,authenticate:(req,res)=>{if(authorized)return true;res.status(401).json({error:'Unauthorized'});return false},fetchImpl:async(u,o)=>{calls.push({url:String(u),...o});if(fail)throw Error('secret');return upstream??new Response(JSON.stringify({job_id:id,status:'queued',reused:false}),{status:202});}});
 await handler({method,body,query,headers:{}},response);return {response,calls};
}
test('auth and disabled gate fail before remote',async()=>{for(const opts of [{authorized:false},{config:{}},{config:{...env,AIGF_VPS_QUEUE_URL:'http://example.invalid'}}]){const r=await call(opts);assert.equal(r.calls.length,0);assert.ok([401,503].includes(r.response.code));}});
test('submit same ID and server-only credentials',async()=>{const r=await call();assert.equal(r.response.code,202);assert.equal(r.calls[0].url,'https://queue.example.invalid/v1/jobs');assert.equal(JSON.parse(r.calls[0].body).job_id,id);assert.equal(r.calls[0].headers.Authorization,'Bearer '+env.AIGF_VPS_QUEUE_TOKEN);assert.equal(r.calls[0].redirect,'error');assert.ok(!JSON.stringify(r.response.data).includes(env.AIGF_VPS_QUEUE_TOKEN));});
test('reject incompatible inputs',async()=>{for(const patch of [{model:'other'},{messages:[{role:'user',content:[]}]},{response_format:{}},{max_tokens:9000},{venice_parameters:{enable_web_search:'on'}}]){const r=await call({body:{...payload,request:{...payload.request,max_completion_tokens:undefined,...patch}}});assert.equal(r.response.code,400);assert.equal(r.calls.length,0);}});
test('GET strips hidden reasoning and raw provider fields',async()=>{const r=await call({method:'GET',upstream:new Response(JSON.stringify({job_id:id,status:'done',result:{model:'glm',choices:[{message:{content:'OK',reasoning_content:'hidden'},finish_reason:'stop'}],usage:{total_tokens:3},prompt_text:'hidden'}}))});assert.equal(r.response.code,200);assert.equal(r.response.data.result.choices[0].message.content,'OK');assert.ok(!JSON.stringify(r.response.data).includes('hidden'));assert.equal(r.calls[0].url,'https://queue.example.invalid/v1/jobs/'+id);});
test('transport uncertainty and no retry',async()=>{const r=await call({fail:true});assert.equal(r.calls.length,1);assert.equal(r.response.code,503);assert.equal(r.response.data.job_id,id);assert.equal(r.response.data.error,'QUEUE_TRANSPORT_UNCERTAIN');});
test('upstream empty output and mismatched ID rejected',async()=>{for(const d of [{job_id:id,status:'done',result:{choices:[{message:{content:''}}]}},{job_id:'wrong',status:'queued'}]){const r=await call({method:'GET',upstream:new Response(JSON.stringify(d))});assert.equal(r.response.code,502);}});
test('provider error safe category only',async()=>{const r=await call({method:'GET',upstream:new Response(JSON.stringify({job_id:id,status:'failed',error:'PROVIDER_HTTP_401; no automatic retry'}))});assert.equal(r.response.data.error,'PROVIDER_HTTP_401; no automatic retry');const x=await call({method:'GET',upstream:new Response(JSON.stringify({job_id:id,status:'failed',error:'secret raw body'}))});assert.equal(x.response.data.error,'JOB_FAILED');});

test('duplicate finished POST returns receipt without requiring result',async()=>{const r=await call({upstream:new Response(JSON.stringify({job_id:id,status:'done',reused:true}),{status:202})});assert.equal(r.response.code,202);assert.deepEqual(r.response.data,{job_id:id,status:'done',reused:true});});

test('production cannot enable pilot even with queue env set',async()=>{const r=await call({config:{...env,VERCEL_ENV:'production'}});assert.equal(r.response.code,503);assert.equal(r.calls.length,0);});
