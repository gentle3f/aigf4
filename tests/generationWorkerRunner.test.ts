import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkerConfig,verifyWorkerDatabase,runWorkerLoop} from '../server/runGenerationOutboxV4.mjs';
const valid='postgresql://aigf_v4_pilot_worker:fixture@db.hmrcvjxdmedrjjcjbtmd.supabase.co:5432/postgres';
const read=(url=valid)=>(path:string)=>path.endsWith('database-url')?url:'x'.repeat(40);
test('pilot worker credentials are required and production or unsafe URLs rejected',()=>{
 assert.equal(readWorkerConfig({CREDENTIALS_DIRECTORY:'/fixture'},read()).connectionString,valid);
 assert.throws(()=>readWorkerConfig({},read()),/CREDENTIALS_DIRECTORY/);
 for(const url of [valid.replace('hmrcvjxdmedrjjcjbtmd','ebinyocojscfnxskybax'),valid.replace('aigf_v4_pilot_worker','postgres'),valid+'?sslmode=disable'])assert.throws(()=>readWorkerConfig({CREDENTIALS_DIRECTORY:'/fixture'},read(url)),/V4_/);
});
test('database startup requires dedicated restricted role',async()=>{
 const row={login:'aigf_v4_pilot_worker',worker_role:true,can_claim:true,direct_messages:false,direct_state:false,direct_outbox:false,elevated:false};
 await verifyWorkerDatabase(async()=>({rows:[row]}));
 for(const field of ['direct_messages','direct_state','direct_outbox','elevated'])await assert.rejects(verifyWorkerDatabase(async()=>({rows:[{...row,[field]:true}]})),/V4_DATABASE_ROLE_CHECK_FAILED/);
});
test('worker loop recovers a temporary failure then processes completed work and stops cleanly',async()=>{
 const stop=new AbortController(),logs:string[]=[],waits:number[]=[];let n=0;
 const status=await runWorkerLoop({signal:stop.signal,processOne:async()=>{n++;if(n===1)throw Error('private error text');if(n===2)return 'done';stop.abort();return 'idle';},pause:async(ms:number)=>{waits.push(ms);},log:(s:string)=>logs.push(s)});
 assert.equal(status,'stopped');assert.deepEqual(logs,['V4_WORKER transient_error','V4_WORKER done']);assert.ok(waits[0]>=2000);assert.equal(n,3);
});
test('single step returns exactly one iteration',async()=>{
 let calls=0;assert.equal(await runWorkerLoop({once:true,processOne:async()=>{calls++;return 'waiting'},log:()=>{}}),'waiting');assert.equal(calls,1);
});

test('production must be explicitly selected with distinct exact project and login',async()=>{
 const prod=valid.replace('aigf_v4_pilot_worker','aigf_v4_production_worker').replace('hmrcvjxdmedrjjcjbtmd','ebinyocojscfnxskybax');
 const env={CREDENTIALS_DIRECTORY:'/fixture',AIGF_V4_TARGET:'production'};
 assert.equal(readWorkerConfig(env,read(prod)).login,'aigf_v4_production_worker');
 assert.throws(()=>readWorkerConfig(env,read(valid)),/V4_/);
 assert.throws(()=>readWorkerConfig({CREDENTIALS_DIRECTORY:'/fixture'},read(prod)),/V4_/);
 assert.throws(()=>readWorkerConfig(env,read(prod.replace('/postgres','/other'))),/V4_/);
 const row={login:'aigf_v4_production_worker',worker_role:true,can_claim:true,direct_messages:false,direct_state:false,direct_outbox:false,elevated:false};
 await verifyWorkerDatabase(async()=>({rows:[row]}),'aigf_v4_production_worker');
 await assert.rejects(verifyWorkerDatabase(async()=>({rows:[row]})),/V4_DATABASE_ROLE_CHECK_FAILED/);
});
