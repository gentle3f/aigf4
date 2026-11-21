import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GROUP_V2_SYNCED_MODES_KEY, PERSISTED_APP_SETTING_KEYS } from '../appSettings.js';
import {
    parseGroupModeRegister,
    mergeGroupModeRegisters,
    recordGroupMode,
} from '../groupModeSync.js';
import {
    isGroupV2PersonalTrialEnabled,
    setGroupV2PersonalTrialEnabled,
    GROUP_V2_PERSONAL_TRIAL_SETTING_PREFIX,
} from '../groupV2PersonalTrial.js';
import { RoomManager } from '../roomManager.js';
import type { Persona } from '../managers.js';
import { buildGroupAgencyContext, collectGroupAgencyOpportunities } from '../groupAgency.js';
import { collectStoryFacts, buildStoryCausalityLedger } from '../groupCausality.js';

const file=(name:string)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const persona=(name:string):Persona=>({
 name,gender:'female',emoji:'✦',description:'Independent creative person',
 prompt:'Lives in an imaginary story',greeting:'',avatarPrompt:name,avatarUrl:null,
 memory:'',
});
const makeRoom=()=>{
 const db=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
  getItem:(k:string)=>db.get(k)??null,
  setItem:(k:string,v:string)=>db.set(k,v),
  removeItem:(k:string)=>db.delete(k),
 }});
 const manager=new RoomManager();
 const room=manager.createRoom('故事',[{persona:persona('Lisa')},{persona:persona('Jennie')}]);
 return {manager,room,db};
};

test('group modes use one recognized cloud-state key and preserve explicit V1 rollback across devices',()=>{
 assert.ok(PERSISTED_APP_SETTING_KEYS.includes(GROUP_V2_SYNCED_MODES_KEY));
 const s1=new Map<string,string>();
 const first={getItem:(k:string)=>s1.get(k)??null,
  setItem:(k:string,v:string)=>{s1.set(k,v);},
  removeItem:(k:string)=>{s1.delete(k);}};
 first.setItem(GROUP_V2_PERSONAL_TRIAL_SETTING_PREFIX+'rA','enabled');
 assert.equal(isGroupV2PersonalTrialEnabled('rA',first),true);
 setGroupV2PersonalTrialEnabled('rA',true,first);
 assert.ok(first.getItem(GROUP_V2_SYNCED_MODES_KEY));
 assert.equal(first.getItem(GROUP_V2_PERSONAL_TRIAL_SETTING_PREFIX+'rA'),null);
 setGroupV2PersonalTrialEnabled('rA',false,first);
 assert.equal(isGroupV2PersonalTrialEnabled('rA',first),false);
 const s2={getItem:(k:string)=>s1.get(k)??null,
  setItem:(k:string,v:string)=>{s1.set(k,v);},
  removeItem:(k:string)=>{s1.delete(k);}};
 assert.equal(isGroupV2PersonalTrialEnabled('rA',s2),false);
 assert.equal(parseGroupModeRegister(s2.getItem(GROUP_V2_SYNCED_MODES_KEY)).rooms.rA.enabled,false);
});

test('concurrent device mode values merge by timestamp without reactivating a rolled-back room',()=>{
 const left=recordGroupMode(null,'roomA',true,100);
 const right=recordGroupMode(null,'roomA',false,110);
 const third=recordGroupMode(null,'roomB',true,105);
 const merged=mergeGroupModeRegisters(left,mergeGroupModeRegisters(right,third));
 assert.equal(merged.rooms.roomA.enabled,false);
 assert.equal(merged.rooms.roomB.enabled,true);
 assert.equal(mergeGroupModeRegisters(merged,left).rooms.roomA.enabled,false);
 const tie=mergeGroupModeRegisters(
  recordGroupMode(null,'roomA',true,100),
  recordGroupMode(null,'roomA',false,100),
 );
 assert.equal(tie.rooms.roomA.enabled,false);
 assert.deepEqual(parseGroupModeRegister('{bad').rooms,{});
});

test('room agency is grounded in persistent personal objectives, not a speaking quota',()=>{
 const {manager,room}=makeRoom();
 const [lisa,jennie]=room.members;
 manager.updateRoom(room.id,r=>{
  r.agencyGoals={[lisa.id]:'完成自己答應過的畫作'};
  r.scene.unresolved=['海邊旅行還沒決定日期'];
  r.scene.memberStates={
   [jennie.id]:{posture:'',action:'準備打電話',attention:'',innerThought:'',chemistry:''}
  };
 });
 const current=manager.getRoom(room.id)!;
 const cues=collectGroupAgencyOpportunities(current,'跟大家聊聊旅行');
 assert.ok(cues.some(x=>x.memberId===lisa.id && x.origin==='owner-goal'));
 assert.ok(cues.some(x=>x.memberId===jennie.id && x.origin==='existing-visible-action'));
 const context=buildGroupAgencyContext(current,'跟大家聊聊旅行');
 assert.match(context,/海邊旅行/);
 assert.match(context,/NOT commands or speaking quotas/);
 const direct=collectGroupAgencyOpportunities(current,'Lisa，你幾時畫好？');
 assert.ok(direct.every(x=>x.memberId===lisa.id));
});

test('owner-confirmed story event tracks actors separately from witnesses and survives correction',()=>{
 const {manager,room}=makeRoom();
 const [lisa,jennie]=room.members;
 manager.addEpisodicMemories(room.id,[{
  kind:'event',title:'海邊決定',summary:'Lisa 決定開車，Jennie 聽她講',
  participants:[lisa.id],subjectIds:[lisa.id],knowerIds:[lisa.id,jennie.id],
  visibility:'shared',importance:5,ownerConfirmed:true,
  perspectives:[
    {memberId:lisa.id,salience:5,knowledge:'experienced',summary:'Lisa 決定開車'},
    {memberId:jennie.id,salience:3,knowledge:'told',summary:'Jennie 聽她講'},
  ],
 }]);
 const before=manager.getRoom(room.id)!;
 const fact=before.sharedMemories.at(-1)!;
 assert.equal(fact.ownerConfirmed,true);
 assert.deepEqual(fact.subjectIds,[lisa.id]);
 assert.deepEqual(new Set(fact.knowerIds),new Set([lisa.id,jennie.id]));
 assert.ok(collectStoryFacts(before).some(x=>x.provenance==='owner-confirmed'));
 assert.match(buildStoryCausalityLedger(before),/ACTORS:/);
 manager.setMemorySubjectIds(room.id,fact.id,[lisa.id,jennie.id]);
 const after=manager.getRoom(room.id)!;
 assert.equal(after.sharedMemories.at(-1)?.subjectIds?.length,2);
 const original=after.members[0].memories.find(e=>e.id===fact.id)!;
 manager.updateMemory(room.id,lisa.id,fact.id,'memory',{
  title:'海邊新計劃',summary:'Lisa 提出新路線，Jennie 知道',
 });
 const corrected=manager.getRoom(room.id)!;
 const changed=corrected.members[0].memories.find(e=>e.id===fact.id)!;
 assert.equal(changed.ownerConfirmed,true);
 assert.equal(changed.correctionHistory?.at(-1)?.previousSummary,original.summary);
});


test('correcting a private member memory never certifies the old canonical summary or leaks it room-wide',()=>{
 const {manager,room}=makeRoom();
 const [lisa,jennie]=room.members;
 manager.addEpisodicMemories(room.id,[{
  kind:'event',title:'私下計劃',summary:'早前模型估計她想搬走',
  participants:[lisa.id],subjectIds:[lisa.id],knowerIds:[lisa.id],
  visibility:'restricted',importance:4,ownerConfirmed:false,
  perspectives:[{memberId:lisa.id,salience:4,knowledge:'experienced',
   summary:'早前模型估計她想搬走'}],
 }]);
 const before=manager.getRoom(room.id)!;
 const fact=before.sharedMemories.find(x=>x.title==='私下計劃')!;
 assert.equal(fact.ownerConfirmed,false);
 manager.updateMemory(room.id,lisa.id,fact.id,'memory',{
  title:'私人更正',summary:'其實她只係想出門買花',
 });
 const corrected=manager.getRoom(room.id)!;
 assert.equal(corrected.sharedMemories.find(x=>x.id===fact.id)?.ownerConfirmed,false);
 assert.equal(corrected.members[0].memories.find(x=>x.id===fact.id)?.ownerConfirmed,true);
 assert.equal(corrected.members[1].memories.some(x=>x.id===fact.id),false);
 assert.doesNotMatch(buildStoryCausalityLedger(corrected),/早前模型估計她想搬走/);
 assert.doesNotMatch(buildStoryCausalityLedger(corrected),/其實她只係想出門買花/);
});

test('UI2 is default and classic fallback can be chosen from home menu',()=>{
 const html=file('index.html'), source=file('index.tsx');
 assert.match(html,/let storedPreference = 'v2'/);
 assert.match(html,/params\.get\('ui'\) === 'classic'/);
 assert.match(html,/wetappUiPreferenceV1/);
 assert.match(source,/aigf-layout-style-toggle/);
 assert.match(source,/url\.searchParams\.delete\('ui'\)/);
 assert.match(source,/window\.location\.assign\(url\.toString\(\)\)/);
});

test('time branch and memory verification are exposed in normal user workflow',()=>{
 const main=file('index.tsx'),memory=file('features/roomMemoryUi.ts');
 assert.match(main,/latest-branch-menu-btn/);
 assert.match(main,/createTimelineBranch\(lastUser\.id\)/);
 assert.match(memory,/aigf-memory-search/);
 assert.match(memory,/檢查原始訊息及更正歷史/);
 assert.match(memory,/ownerConfirmed: true/);
 assert.match(memory,/setMemorySubjectIds\(room\.id, entry\.id, selectedSubjects\)/);
});
