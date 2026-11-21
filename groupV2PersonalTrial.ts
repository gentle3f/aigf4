/**
 * Group V2 per-room mode synced through existing Supabase app-settings state.
 * Defaults to V1; old per-device trial keys remain readable for migration.
 * No new SQL table, conversation mutation or scene/character migration.
 */
import { GROUP_V2_SYNCED_MODES_KEY, setPersistedAppSetting } from './appSettings.js';
import { parseGroupModeRegister, recordGroupMode } from './groupModeSync.js';

export const GROUP_V2_PERSONAL_TRIAL_SETTING_PREFIX='aigf4GroupPersonalTrialV1:';
export type PersonalTrialStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const keyFor=(roomId:string):string=>{
 if(typeof roomId!=='string'||!roomId.trim()||roomId.length>160)
  throw Error('INVALID_ROOM_ID');
 return GROUP_V2_PERSONAL_TRIAL_SETTING_PREFIX+encodeURIComponent(roomId);
};
const getStorage=():PersonalTrialStorage|undefined=>{
 try{return typeof localStorage==='undefined'?undefined:localStorage;}catch{return undefined;}
};
export const isGroupV2PersonalTrialEnabled=(roomId:string,store:PersonalTrialStorage|undefined=getStorage()):boolean=>{
 try{
  if(!store)return false;
  const raw=store.getItem(GROUP_V2_SYNCED_MODES_KEY);
  const mode=parseGroupModeRegister(raw).rooms[roomId];
  if(mode)return mode.enabled;
  return store.getItem(keyFor(roomId))==='enabled';
 }catch{return false;}
};
export const setGroupV2PersonalTrialEnabled=(roomId:string,enabled:boolean,
 store:PersonalTrialStorage|undefined=getStorage()):boolean=>{
 if(!store)throw Error('PERSONAL_TRIAL_LOCAL_STORAGE_UNAVAILABLE');
 const legacy=keyFor(roomId);
 const updated=JSON.stringify(recordGroupMode(store.getItem(GROUP_V2_SYNCED_MODES_KEY),roomId,enabled,Date.now()));
 // Only the actual browser app-settings path triggers Supabase cloud sync.
 if(store===getStorage())setPersistedAppSetting(GROUP_V2_SYNCED_MODES_KEY,updated);
 else store.setItem(GROUP_V2_SYNCED_MODES_KEY,updated);
 // Remove historical per-device mode after the new mode is safely persisted.
 store.removeItem(legacy);
 if(isGroupV2PersonalTrialEnabled(roomId,store)!==enabled)
  throw Error('PERSONAL_TRIAL_SETTING_NOT_PERSISTED');
 return enabled;
};
/** Owner-only V2 behavior guidance. Preserve the live tagged Group envelope
 * and current history parser; never substitute the research JSON experiment.
 */
export const GROUP_V2_OWNER_PERSONAL_GUIDANCE = [
  "OWNER-ONLY V2 TRIAL: preserve the existing live Group <chat>...</chat><scene>...</scene><npc_candidate>...</npc_candidate> transport envelope, NOT a standalone JSON reply. Existing fixed-member, memory and scene contracts remain authoritative.",
  "OWNER IDENTITY: the USER is a separate participant with a stable owner actor ID. Use the OWNER IDENTITY LEDGER for user-confirmed name, pronouns and language; when a detail is missing, keep it UNKNOWN. Never infer user identity from a character name, nickname, roleplay title, past model guesses or another member. A latest direct owner correction takes precedence over mistaken earlier generated text.",
  "AGENT, BODY-PART OWNER AND OBJECT: for each action first resolve (1) actor, (2) whose hand/body part, (3) target/person affected. Example: 使用者用自己的手碰角色甲的肩膀 = the OWNER's hand touches character A's shoulder, NOT the character moving their own hand, and NOT touching the OWNER's hand. Never silently swap actor/patient, ownership or pronouns. In a character's dialogue 我 = THAT character; in a user's message 我 = OWNER only.",
  "LANGUAGE: Follow the owner-confirmed language in the OWNER IDENTITY LEDGER; otherwise mirror the latest user's written language and avoid unrequested switches between Traditional Chinese, Cantonese slang or English. Older generated dialogue never establishes an owner language preference. Preserve established voices without random dialect changes.",
  "DIRECT ANSWER FIRST: When the user addresses a member, that member responds to the actual latest question with meaningful, direct speech, typically 1–3 conversational sentences; another member may follow up with a causal reaction. Do not replace an answer with empty filler, a one-word exclamation, endless questions, or unrelated narration.",
  "PRESERVE ENVIRONMENTAL VIBE: Keep atmospheric scene and grounded sensory details; typically just one or two meaningful narration beats, not a forced quota of five to ten alternating lines. The characters may speak more than once, but do not chop one monologue into many same-person bubbles. Reduce repeated eye, blush, lip, trembling and breathing templates.",
  "INTERACTION: Let each present member have distinctive own goals, specific observations and reactions to what others SAID, not a round-robin roll-call. Do not force everyone to speak, invent another member's private memories, switch locations or clothes, or claim physical touch while remote texting.",
  "DIALOGUE QUOTES: Each Display Name：「...」 line must have only one outer quotation pair. Never nest redundant wrappers such as Display Name：「「...」」 or add the speaker name again within the spoken text.",
  "Keep identity, user consent, private boundaries and optional chemistry / inner_thought / member_states. Follow only the EXISTING live Group tagged output contract, never an incompatible research format."
].join('\n');

/**
 * Opt-in-only presentation/serialization repair. The exported JSON currently
 * contains redundant enclosing quote pairs in individual dialogue segments.
 * Keep history intact: normalize ONLY newly generated V2 turn before saving.
 */
import type { GroupGenerationResult } from './groupChat.js';

export const normalizeGroupV2OwnerReply = (reply: GroupGenerationResult): GroupGenerationResult => {
 const segments = reply.segments.map(segment => {
  if(segment.type !== 'dialogue') return segment;
  let value = segment.text.trim();
  for (const [open, close] of [['「','」'],['『','』'],['“','”']] as const) {
   while (value.startsWith(open+open) && value.endsWith(close+close)) {
    value = value.slice(open.length, -close.length).trim();
   }
  }
  return value === segment.text ? segment : {...segment,text:value};
 });
 if(segments.every((segment,index)=>segment===reply.segments[index])) return reply;
 const text = segments.map(segment => {
  if (segment.type === 'narration') {
   return /^[（(][\s\S]*[）)]$/u.test(segment.text) ? segment.text : '（'+segment.text+'）';
  }
  const speaker=segment.speakerName||segment.speakerId;
  return /^[「『“"]/u.test(segment.text)
   ? speaker+'：'+segment.text
   : speaker+'：「'+segment.text+'」';
 }).join('\n\n');
 return {...reply,segments,text};
};
