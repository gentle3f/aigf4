import test from 'node:test';
import assert from 'node:assert/strict';
import {planServerPersonaMemory,finalizeServerPersonaMemory} from '../serverPersonaMemory.js';
import {applyPersonaMemorySummaryState} from '../personaMemoryState.js';
import type {Persona,ChatMessage} from '../managers.js';
import type {PilotJob} from '../generationQueuePilot.js';
const persona:Persona={name:'Guide',emoji:'🌿',gender:'female',description:'Garden guide',prompt:'Guide visitors',greeting:'Hello',avatarPrompt:'',avatarUrl:null};
const turns=():ChatMessage[]=>Array.from({length:8},(_,i)=>[{id:'u'+i,role:'user' as const,content:{text:'Visit garden '+i}},{id:'r'+i,role:'model' as const,content:{text:'We observed a tree '+i}}]).flat();
const id='00000000-0000-4000-8000-000000000101';
const result=(memories:unknown[]):PilotJob=>({job_id:id,status:'done',result:{choices:[{message:{content:JSON.stringify({memories})}}]}});
const memory={kind:'event',title:'Garden visit',summary:'The visitor explored the garden.',importance:4,source_message_ids:['u0','r0']};
test('server plans only completed eligible turns with stable source IDs',async()=>{
 const h=turns();assert.deepEqual(await planServerPersonaMemory('fixture',persona,h.slice(0,2)),{status:'skipped',reason:'threshold'});
 assert.deepEqual(await planServerPersonaMemory('fixture',persona,h.slice(0,-1)),{status:'skipped',reason:'incomplete_turn'});
 const p=await planServerPersonaMemory('fixture',persona,h);assert.equal(p.status,'ready');if(p.status!=='ready')return;
 assert.equal(p.plan.context.checkpoint,8);assert.equal(p.plan.context.sourceIds.length,16);assert.equal(p.plan.request.max_completion_tokens,4200);
});
test('server applies verified memory once, rejects stale evidence and preserves unrelated persona fields',async()=>{
 const h=turns(),p=await planServerPersonaMemory('fixture',persona,h);assert.equal(p.status,'ready');if(p.status!=='ready')return;
 const input={jobId:id,job:result([memory]),plan:p.plan,persona,history:h,at:1234};
 const r=await finalizeServerPersonaMemory(input);assert.equal(r.added,1);assert.equal(r.persona.memories?.length,1);
 assert.equal(r.persona.lastMemorySummaryUserMessageCount,8);assert.equal(r.persona.lastVpsMemoryJobId,id);
 assert.equal(r.persona.memories?.[0].createdAt,1234);assert.equal(r.persona.prompt,persona.prompt);assert.equal(persona.memories,undefined);
 const repeat=await finalizeServerPersonaMemory({...input,persona:r.persona});assert.equal(repeat.added,0);assert.deepEqual(repeat.persona,r.persona);
 const edit=structuredClone(h);edit[0].content.text='Changed evidence';await assert.rejects(finalizeServerPersonaMemory({...input,history:edit}),/MEMORY_CONTEXT_CHANGED/);
 await assert.rejects(finalizeServerPersonaMemory({...input,job:result([{...memory,source_message_ids:['imaginary']}])}),/MEMORY_RESULT_INVALID/);
 const append=[...h,{id:'later',role:'user' as const,content:{text:'New question'}}];
 assert.equal((await finalizeServerPersonaMemory({...input,history:append})).added,1);
});
test('shared reducer deduplicates with evidence and preserves pinned memories',()=>{
 const p=structuredClone(persona);
 const entry={kind:'event' as const,title:'Garden visit',summary:'The visitor explored the garden.',importance:3,sourceMessageIds:['u0']};
 assert.equal(applyPersonaMemorySummaryState(p,[entry],8,3,'job1',{newId:()=> 'memory1',now:()=>1}),1);
 p.memories![0].pinned=true;
 assert.equal(applyPersonaMemorySummaryState(p,[{...entry,importance:5,sourceMessageIds:['u0','r0']}],9,3,'job2'),0);
 assert.equal(p.memories![0].pinned,true);assert.equal(p.memories![0].importance,5);assert.deepEqual(p.memories![0].sourceMessageIds,['u0','r0']);
});

test('historical backlog advances oldest pending turns without resetting old checkpoints',async()=>{
 const h=Array.from({length:70},(_,i)=>[{id:'u'+i,role:'user' as const,content:{text:'Visit garden '+i}},{id:'r'+i,role:'model' as const,content:{text:'Observe a tree '+i}}]).flat();
 const p=await planServerPersonaMemory('fixture',persona,h);assert.equal(p.status,'ready');if(p.status!=='ready')return;
 assert.equal(p.plan.context.checkpoint,16);assert.ok(p.plan.context.sourceIds.includes('u0'));assert.ok(!p.plan.context.sourceIds.includes('u69'));
 const a=await finalizeServerPersonaMemory({jobId:id,job:result([memory]),plan:p.plan,persona,history:h,at:1});
 const next=await planServerPersonaMemory('fixture',a.persona,h);assert.equal(next.status,'ready');if(next.status!=='ready')return;
 assert.equal(next.plan.context.checkpoint,30);assert.ok(next.plan.context.sourceIds.includes('u14'));assert.ok(next.plan.context.sourceIds.includes('u29'));
 const legacy={...persona,lastMemorySummaryUserMessageCount:60,memorySummaryVersion:1};
 const l=await planServerPersonaMemory('fixture',legacy,h);assert.equal(l.status,'ready');if(l.status==='ready')assert.equal(l.plan.context.checkpoint,70);
 assert.deepEqual(await planServerPersonaMemory('fixture',{...legacy,lastMemorySummaryUserMessageCount:70},h),{status:'skipped',reason:'threshold'});
 const broken=h.filter(m=>m.id!=='r0');assert.deepEqual(await planServerPersonaMemory('fixture',persona,broken),{status:'skipped',reason:'incomplete_historical_turn'});
});
