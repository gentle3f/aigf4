import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {RoomManager} from '../roomManager.js';
import {parseGroupGeneration} from '../groupChat.js';
import {
  normalizeGroupMemberDisplayName,
  isGroupMemberDisplayNameAvailable,
  withGroupMemberDisplayName,
} from '../groupMemberDisplayName.js';
import type {Persona} from '../managers.js';

const original=():Persona=>({
 name:'BLACKPINK Lisa',
 gender:'female',
 emoji:'★',
 description:'Singer and performer',
 prompt:'Performs with Blackpink',
 greeting:'',
 avatarPrompt:'Blackpink Lisa',
 avatarUrl:null,
 publicIdentityEnabled:true,
 publicIdentity:{
  canonicalName:'Lalisa Manobal',
  kind:'real_person',
  summary:'Member of BLACKPINK',
  visualPrompt:'Lalisa Manobal',
  sourceTitle:'Lisa (rapper)',
  sourceUrl:'https://en.wikipedia.org/wiki/Lisa_(rapper)',
  sourceLanguage:'en',
  verifiedAt:1,
 },
});
const setupStorage=()=>{
 const memory=new Map<string,string>();
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
  getItem:(key:string)=>memory.get(key)??null,
  setItem:(key:string,v:string)=>{memory.set(key,v);},
  removeItem:(key:string)=>{memory.delete(key);},
 }});
};
test('Lisa nickname retains separate Wikipedia identity and original source persona',()=>{
 const input=original(),nick=withGroupMemberDisplayName(input,'Lisa');
 assert.equal(input.name,'BLACKPINK Lisa');
 assert.equal(nick.name,'Lisa');
 assert.equal(nick.publicIdentity?.canonicalName,'Lalisa Manobal');
 assert.equal(nick.publicIdentity?.sourceTitle,'Lisa (rapper)');
 assert.equal(nick.publicIdentity?.sourceUrl,'https://en.wikipedia.org/wiki/Lisa_(rapper)');
});
test('validate short speaker labels without breaking group dialogue delimiters',()=>{
 assert.equal(normalizeGroupMemberDisplayName('  Lisa  '),'Lisa');
 assert.equal(normalizeGroupMemberDisplayName('BLACKPINK   Lisa'),'BLACKPINK Lisa');
 assert.equal(normalizeGroupMemberDisplayName('  '),null);
 assert.equal(normalizeGroupMemberDisplayName('Lisa：「hi」'),null);
 assert.equal(normalizeGroupMemberDisplayName('Lisa\nJennie'),null);
 assert.equal(normalizeGroupMemberDisplayName('<chat>'),null);
 assert.equal(normalizeGroupMemberDisplayName('X'.repeat(33)),null);
});
test('case-insensitive uniqueness avoids ambiguous speaker parsing',()=>{
 assert.equal(isGroupMemberDisplayNameAvailable('Lisa',['Jisoo','lisa']),false);
 assert.equal(isGroupMemberDisplayNameAvailable('Jennie',['Lisa','Jisoo']),true);
});
test('actual RoomManager supports local nickname without changing member ID, global identity or another room',()=>{
 setupStorage();
 const rooms=new RoomManager();
 const source=original();
 const other={...original(),name:'Jennie',publicIdentity:{...original().publicIdentity!,canonicalName:'Jennie Kim'}} satisfies Persona;
 const first=rooms.createRoom('First',[{sourcePersonaKey:'lisa-source',persona:withGroupMemberDisplayName(source,'Lisa')},{sourcePersonaKey:'jennie-source',persona:other}]);
 const second=rooms.createRoom('Second',[{sourcePersonaKey:'lisa-source',persona:source},{sourcePersonaKey:'jennie-source',persona:other}]);
 const lisa=first.members[0];
 assert.equal(lisa.persona.name,'Lisa');
 assert.equal(source.name,'BLACKPINK Lisa');
 assert.equal(first.members[0].persona.publicIdentity?.canonicalName,'Lalisa Manobal');
 const changed=rooms.updateRoom(first.id,room=>{
  const person=room.members.find(x=>x.id===lisa.id);
  if(person)person.persona.name='Lili';
 });
 assert.equal(changed?.members[0].persona.name,'Lili');
 assert.equal(changed?.members[0].id,lisa.id);
 assert.equal(changed?.members[0].sourcePersonaKey,'lisa-source');
 assert.equal(changed?.members[0].persona.publicIdentity?.canonicalName,'Lalisa Manobal');
 assert.equal(rooms.getRoom(second.id)?.members[0].persona.name,'BLACKPINK Lisa');
});
test('group wire parser resolves renamed dialogue speaker to same stable member id',()=>{
 setupStorage();
 const rooms=new RoomManager();
 const first=rooms.createRoom('Test',[{persona:withGroupMemberDisplayName(original(),'Lisa')},{persona:{...original(),name:'Jennie'}}]);
 const reply='<chat>Lisa：「Hello!」\nJennie：「Hi!」</chat><scene>{"location":"chat","reality_layer":"texting","present_member_ids":'+JSON.stringify(first.scene.presentMemberIds)+',"summary":"Hello","unresolved":[]}</scene><npc_candidate>null</npc_candidate>';
 const parsed=parseGroupGeneration(reply,first);
 assert.ok(parsed.segments.some(s=>s.type==='dialogue'&&s.speakerId===first.members[0].id));
 assert.ok(parsed.segments.some(s=>s.type==='dialogue'&&s.speakerId===first.members[1].id));
});
test('new group and existing group UI expose editable names with correct saving boundaries',()=>{
 const create=readFileSync('features/createGroupUi.ts','utf8');
 const info=readFileSync('features/roomInfoUi.ts','utf8');
 const index=readFileSync('index.tsx','utf8');
 assert.match(create,/create-group-member-display-name/);
 assert.match(create,/withGroupMemberDisplayName\(persona, displayName\)/);
 assert.match(create,/isGroupMemberDisplayNameAvailable\(displayName, usedNames\)/);
 assert.match(create,/groupManager\d*\.createRoom|roomManager\.createRoom/);
 assert.match(info,/renameButton\.textContent = '改名'/);
 assert.match(info,/target\.persona\.name = nextName/);
 assert.match(info,/onMemberRenamed\(\)/);
 assert.match(index,/canRenameMember: \(\) => !activeChatRequest/);
});
