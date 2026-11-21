import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeGroupRoomTitle } from '../groupRoomTitle.js';
import {
  isGroupV2PersonalTrialEnabled,
  setGroupV2PersonalTrialEnabled,
  GROUP_V2_OWNER_PERSONAL_GUIDANCE,
} from '../groupV2PersonalTrial.js';
import { RoomManager } from '../roomManager.js';

const root = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('group room title normalization rejects empty/protocol/control and accepts human names', () => {
  assert.equal(normalizeGroupRoomTitle('  夜晚    傾偈  '), '夜晚 傾偈');
  assert.equal(normalizeGroupRoomTitle('Hello / 夜晚'),'Hello / 夜晚');
  assert.equal(normalizeGroupRoomTitle('　　'), null);
  assert.equal(normalizeGroupRoomTitle('X'.repeat(49)), null);
  assert.equal(normalizeGroupRoomTitle('<chat>'), null);
  assert.equal(normalizeGroupRoomTitle('One\nTwo'), 'One Two');
  assert.equal(normalizeGroupRoomTitle('A\u0000B'), null);
});

test('changing room title preserves IDs, members, memory and chat identity', () => {
  const entries = new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{ configurable:true, value: {
    getItem:(key:string)=>entries.get(key)??null,
    setItem:(key:string,val:string)=>entries.set(key,val),
    removeItem:(key:string)=>entries.delete(key)
  }});
  const p:any={name:'Lisa',emoji:'🌟',gender:'female',description:'Singer',prompt:'',
      greeting:'',avatarPrompt:'Lisa',avatarUrl:null,memory:''};
  const q:any={...p,name:'Jennie'};
  const manager=new RoomManager();
  const first=manager.createRoom('Initial', [{persona:p},{persona:q}]);
  const second=manager.createRoom('Separate', [{persona:p},{persona:q}]);
  const before=manager.getRoom(first.id)!;
  const IDs=before.members.map(x=>x.id);
  const update=manager.updateRoom(first.id,room=>{ room.title=normalizeGroupRoomTitle('New Group')!; });
  assert.equal(update?.title,'New Group');
  assert.equal(manager.getRoom(second.id)?.title,'Separate');
  assert.deepEqual(update?.members.map(x=>x.id),IDs);
  assert.equal(update?.id,first.id);
  assert.deepEqual(update?.sharedMemories,before.sharedMemories);
});

test('V1 is default, V2 toggle only affects selected group and supports instant rollback',()=>{
  const values=new Map<string,string>();
  const store={getItem:(k:string)=>values.get(k)??null,
    setItem:(k:string,v:string)=>{values.set(k,v);},
    removeItem:(k:string)=>{values.delete(k);}};
  assert.equal(isGroupV2PersonalTrialEnabled('rA',store),false);
  setGroupV2PersonalTrialEnabled('rA',true,store);
  assert.equal(isGroupV2PersonalTrialEnabled('rA',store),true);
  assert.equal(isGroupV2PersonalTrialEnabled('rB',store),false);
  setGroupV2PersonalTrialEnabled('rA',false,store);
  assert.equal(isGroupV2PersonalTrialEnabled('rA',store),false);
  assert.equal(values.size,0);
});

test('V2 experimental guidance retains original tagged transport, group identity, memory firewall',()=>{
  assert.match(GROUP_V2_OWNER_PERSONAL_GUIDANCE,/existing live Group <chat>/);
  assert.match(GROUP_V2_OWNER_PERSONAL_GUIDANCE,/BODY-PART OWNER/);
  assert.match(GROUP_V2_OWNER_PERSONAL_GUIDANCE,/DIRECT ANSWER FIRST/);
  assert.match(GROUP_V2_OWNER_PERSONAL_GUIDANCE,/private memories/);
});

test('production source owns separate rename-title and member-nickname action',()=>{
  const info=root('features/roomInfoUi.ts');
  const index=root('index.tsx');
  const create=root('features/createGroupUi.ts');
  assert.match(info,/renameRoomButton\.textContent = '修改群組名稱'/);
  assert.match(info,/draft\.title = title/);
  assert.match(info,/target\.persona\.name = nextName/);
  assert.match(info,/roomInfoTitle\.appendChild\(renameRoomButton\)/);
  assert.match(index,/chatHeaderName\.textContent = updated\.title/);
  assert.match(index,/renderPersonaList\(\);/);
  assert.match(create,/create-group-member-display-name/);
});

test('V2 is wired into current production generation with opt-in UI and backwards V1 compatibility',()=>{
  const index=root('index.tsx');
  const prompt=root('groupChatPrompt.ts');
  const info=root('features/roomInfoUi.ts');
  assert.match(index,/isGroupV2PersonalTrialEnabled\(request\.room\.id\)/);
  assert.match(index,/groupV2OwnerTrial \? 'owner-v2' : 'legacy'/);
  assert.match(index,/groupV2OwnerTrial\s*\? normalizeGroupV2OwnerReply\(generated\)/);
  assert.match(index,/loadOwnerProfile\(localStorage\)/);
  assert.match(prompt,/presentationPolicy: GroupPresentationPolicy = 'legacy'/);
  assert.match(prompt,/presentationPolicy === 'owner-v2'/);
  assert.match(info,/群聊引擎/);
  assert.match(info,/只影響此裝置、此群組之後的新回覆/);
  assert.match(info,/setGroupV2Enabled\(room\.id, next\)/);
});
