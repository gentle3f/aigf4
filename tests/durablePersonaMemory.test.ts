import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createDurableMemoryTask} from '../durablePersonaMemory.js';
import {MemoryManager} from '../managers.js';
import {PERSONA_MEMORY_RESPONSE_FORMAT,parsePersonaAutoMemoryResponse} from '../autoMemory.js';
import {buildVpsCharacterPayload} from '../vpsCharacterTransport.js';
import type {PilotJob} from '../generationQueuePilot.js';
const key='custom_9999_vps_memory_fixture',id='12345678-1234-4234-8234-123456789abc',source='fixture-message';
const context={personaKey:key,historyLength:16,checkpoint:8,summaryVersion:3,sourceIds:[source],sceneIds:['main']};
const payload=buildVpsCharacterPayload({model:'glm-5-3-flash-uncensored',messages:[{role:'user',content:'Synthetic evidence'}],responseFormat:PERSONA_MEMORY_RESPONSE_FORMAT});
const draft={kind:'preference' as const,title:'Tea',summary:'The user prefers tea.',importance:3,unresolved:false,sceneId:'main',sourceMessageIds:[source],searchTags:['tea','drink']};
const done:PilotJob={job_id:id,status:'done',result:{choices:[{message:{content:JSON.stringify({memories:[{kind:'preference',title:'Tea',summary:'The user prefers tea.',importance:3,unresolved:false,scene_id:'main',source_message_ids:[source],search_tags:['tea','drink']}]})},finish_reason:'stop'}]}};
function fixture(){
 const map=new Map<string,string>();let state='snapshot',committed=false,calls:string[]=[],fail=false,job=done,writeFails=false,clearFails=false;
 const storage={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{if(writeFails)throw Error('quota');map.set(k,v)},removeItem:(k:string)=>{if(clearFails)throw Error('crash');map.delete(k)}};
 const build=()=>createDurableMemoryTask({storage,lock:fn=>fn(),snapshot:()=>state,newId:()=>id,transport:{submit:async(j,p)=>{calls.push('POST');assert.equal(j,id);assert.deepEqual(p,payload);if(fail)throw Error('offline');return {job_id:j,status:'queued'}},get:async j=>{calls.push('GET');return job}},parse:(r,text)=>parsePersonaAutoMemoryResponse(text,new Set(r.sourceIds)),confirmed:()=>committed,commit:(_r,result)=>{assert.equal(result.length,1);committed=true;return 1}});
 return {build,calls,setState:(s:string)=>state=s,setFail:(v:boolean)=>fail=v,setJob:(j:PilotJob)=>job=j,setWriteFails:(v:boolean)=>writeFails=v,setClearFails:(v:boolean)=>clearFails=v};
}
test('exact persona-memory schema accepted only for GLM and DeepSeek',()=>{assert.deepEqual(payload.response_format,PERSONA_MEMORY_RESPONSE_FORMAT);assert.deepEqual(buildVpsCharacterPayload({model:'deepseek-v4-1-flash-1017-uncensored',messages:[{role:'user',content:'x'}],responseFormat:PERSONA_MEMORY_RESPONSE_FORMAT}).response_format,PERSONA_MEMORY_RESPONSE_FORMAT);assert.throws(()=>buildVpsCharacterPayload({model:'qwen-3-6-plus',messages:[{role:'user',content:'x'}],responseFormat:PERSONA_MEMORY_RESPONSE_FORMAT}),/UNSUPPORTED/);});
test('uncertain POST leaves receipt; reload gets existing job once',async()=>{const f=fixture();f.setFail(true);const a=f.build();await assert.rejects(a.submit(context,payload,'snapshot'),/offline/);assert.equal(a.pending()?.jobId,id);f.setFail(false);assert.deepEqual(await f.build().resume(),{status:'applied',added:1});assert.deepEqual(f.calls,['POST','GET']);assert.equal(a.pending(),null);});
test('changed memory or evidence blocks stale result',async()=>{const f=fixture();const a=f.build();await a.submit(context,payload,'snapshot');f.setState('edited');await assert.rejects(f.build().resume(),/CONTEXT_CHANGED/);assert.deepEqual(f.calls,['POST']);assert.ok(a.pending());});
test('receipt storage failure prevents POST',async()=>{const f=fixture();f.setWriteFails(true);await assert.rejects(f.build().submit(context,payload,'snapshot'),/quota/);assert.equal(f.calls.length,0);});
test('invalid or truncated memory result retained, never retried',async()=>{const f=fixture();const a=f.build();await a.submit(context,payload,'snapshot');const j=structuredClone(done);j.result!.choices[0].finish_reason='length';f.setJob(j);await assert.rejects(a.resume(),/RESULT_INVALID/);assert.ok(a.pending());assert.deepEqual(f.calls,['POST','GET']);});
test('durable commit followed by crash clears receipt without duplicate GET or apply',async()=>{const f=fixture();const a=f.build();await a.submit(context,payload,'snapshot');f.setClearFails(true);await assert.rejects(a.resume(),/crash/);f.setClearFails(false);assert.deepEqual(await f.build().resume(),{status:'applied',added:0});assert.deepEqual(f.calls,['POST','GET']);assert.equal(a.pending(),null);});
function managerFixture(){
 const persona={name:'Fixture',emoji:'x',gender:'female',description:'Synthetic',prompt:'Fixture',greeting:'Hi',avatarPrompt:'',avatarUrl:null,memories:[],lastMemorySummaryUserMessageCount:0,memorySummaryVersion:0};
 let fail=false;const m=new Map<string,string>([['customPersonas',JSON.stringify({[key]:persona})]]);
 const storage={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{if(fail&&k==='customPersonas')throw Error('quota');m.set(k,v)},removeItem:(k:string)=>m.delete(k)};
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});
 return {setFail:(v:boolean)=>fail=v};
}
test('real manager stores checkpoint, entries and job marker together; reload idempotent',()=>{managerFixture();let m=new MemoryManager();assert.ok(m.getPersona(key));assert.equal(m.applyPersonaMemorySummary(key,[draft],8,3,id),1);assert.equal(m.confirmVpsMemoryCommit(key,id),true);m=new MemoryManager();assert.equal(m.confirmVpsMemoryCommit(key,id),true);assert.equal(m.applyPersonaMemorySummary(key,[draft],8,3,id),0);assert.equal(m.getPersona(key)?.memories?.length,1);assert.equal(m.getPersona(key)?.lastMemorySummaryUserMessageCount,8);});
test('real manager quota error rolls back memory, checkpoint and job marker',()=>{const f=managerFixture();const m=new MemoryManager();f.setFail(true);assert.throws(()=>m.applyPersonaMemorySummary(key,[draft],8,3,id),/quota/);assert.equal(m.confirmVpsMemoryCommit(key,id),false);assert.equal(m.getPersona(key)?.memories?.length,0);assert.equal(m.getPersona(key)?.lastMemorySummaryUserMessageCount,0);f.setFail(false);assert.equal(m.applyPersonaMemorySummary(key,[draft],8,3,id),1);});

import {createGenerationHandler} from '../server/generationJobs.js';
test('proxy accepts exact original persona memory schema, rejects substituted schema or Qwen',async()=>{for(const [request,expected] of [[payload,202],[{...payload,model:'deepseek-v4-1-flash-1017-uncensored'},202],[{...payload,model:'qwen-3-6-plus'},400],[{...payload,response_format:{...PERSONA_MEMORY_RESPONSE_FORMAT,json_schema:{...PERSONA_MEMORY_RESPONSE_FORMAT.json_schema,name:'other'}}},400]] as const){let calls=0;const response={code:0,setHeader(){},status(n:number){this.code=n;return this},json(_v:unknown){return this}};const handler=createGenerationHandler({env:{AIGF_VPS_QUEUE_ENABLED:'1',AIGF_VPS_QUEUE_URL:'https://fixture.invalid/',AIGF_VPS_QUEUE_TOKEN:'x'.repeat(64)},authenticate:()=>true,fetchImpl:async(_u,o)=>{calls++;assert.deepEqual(JSON.parse(String(o?.body)).request,request);return new Response(JSON.stringify({job_id:id,status:'queued'}))}});await handler({method:'POST',body:{job_id:id,request}},response);assert.equal(response.code,expected);assert.equal(calls,expected===202?1:0);}});
