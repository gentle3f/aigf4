import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeAcceptedGroupJob} from '../serverGroupFinalizer.js';
import {digestServerGroupContext} from '../durableGroupTurn.js';
import type {ChatRoom,RoomMember} from '../roomManager.js';
import type {PilotJob} from '../generationQueuePilot.js';
const member=(id:string,name:string):RoomMember=>({id,joinedAt:1,soul:[],memories:[],persona:{name,emoji:'*',gender:'female',description:'Garden guide',prompt:'Talk about plants',greeting:'Hello',avatarPrompt:'',avatarUrl:null}});
const room:ChatRoom={id:'room-test',type:'group',title:'Garden',description:'Garden group',leadMemberId:'a',members:[member('a','Anna'),member('b','Beth'),member('c','Cara')],scene:{id:'scene',location:'garden',realityLayer:'physical',realityEpochId:'old-epoch',presentMemberIds:['a','b'],summary:'Garden visit',unresolved:[],startedAt:1},sharedSoul:[],sharedMemories:[],createdAt:1,updatedAt:1,lastSummarizedUserMessageCount:0};
const raw='<chat>Anna：「花园的银杏很漂亮。」\\nBeth：「我们去看看喷泉。」</chat><scene>{"location":"花园","reality_layer":"texting","present_member_ids":["a","b"],"summary":"安排参观","unresolved":[]}</scene><npc_candidate>null</npc_candidate>'.replace('\\n','\n');
const job=(candidate=raw,decision={decision:'keep',issues:[],revised_response:''}):PilotJob=>({job_id:'job',status:'done',result:{choices:[{message:{content:candidate}}],workflow:{version:3,parts:[candidate],review:{choices:[{message:{content:JSON.stringify(decision)}}]},stages:[{phase:'primary'},{phase:'review-1'}]}}});
async function row(){return {job_id:'job',reply_id:'reply',conversation_key:room.id,created_at:new Date(2000),state_payload:{rooms:{version:2,rooms:[structuredClone(room),{...structuredClone(room),id:'other'}]},customPersonas:{x:{name:'Unchanged'}}},finalizer_context:{version:2,worldActive:false,roomDigest:await digestServerGroupContext(room),group:{latestUserMessage:'What is in the garden?',personaName:'Anna',fallbackMemberId:'a',namedMemberId:'a',recentReplies:[],ownerV2:false,alreadyOfferedNames:[]}}};}
test('server group finalizer saves segments, scene, epoch, wardrobe and leaves other state untouched',async()=>{
 const r=await row();const out=await finalizeAcceptedGroupJob(r,job());const saved=(out.payload.rooms as typeof r.state_payload.rooms).rooms;
 assert.equal(out.content.segments?.length,2);assert.match(out.content.text!,/銀杏/);assert.equal(saved[0].scene.realityLayer,'texting');assert.equal(saved[0].scene.realityEpochId,'reply');assert.equal(saved[0].lastVpsSceneJobId,'job');assert.deepEqual(saved[1],r.state_payload.rooms.rooms[1]);assert.deepEqual(out.payload.customPersonas,r.state_payload.customPersonas);assert.equal(r.state_payload.rooms.rooms[0].scene.realityLayer,'physical');
});
test('stale group snapshot and repetitive candidate are rejected',async()=>{
 const r=await row();r.state_payload.rooms.rooms[0].scene.location='changed';
 await assert.rejects(finalizeAcceptedGroupJob(r,job()),/GROUP_CONTEXT_CHANGED/);
 const valid=await row();const out=await finalizeAcceptedGroupJob(valid,job());valid.finalizer_context.group.recentReplies=[out.content.text!];
 await assert.rejects(finalizeAcceptedGroupJob(valid,job()),/INVALID_RESULT/);
});
test('NPC proposal preserved once, already-offered name excluded',async()=>{
 const r=await row();const withNpc=raw.replace('<npc_candidate>null</npc_candidate>','<npc_candidate>{"name":"Dora","gender":"female","description":"Garden guide"}</npc_candidate>');
 const out=await finalizeAcceptedGroupJob(r,job(withNpc));assert.equal(out.content.npcProposal?.name,'Dora');assert.equal(out.content.npcProposal?.id,'reply-npc');
 r.finalizer_context.group.alreadyOfferedNames=['Dora'];assert.equal((await finalizeAcceptedGroupJob(r,job(withNpc))).content.npcProposal,undefined);
});
