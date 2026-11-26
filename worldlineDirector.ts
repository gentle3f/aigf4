// Per-world narrator style/preferences, not dialogue or model-policy overrides.
export const DIRECTOR_KEY='aigfWorldlineDirectorV1';
export type DirectorNote={id:string;text:string};
export const CREATIVE_SECTIONS=[
 {key:'pacing',label:'節奏及篇幅',text:'按場景的重要程度調整敘事節奏及篇幅，避免重複同一事件或無意義拖延。'},
 {key:'viewpoint',label:'視角及敘事語言',text:'採用清楚一致的敘事視角，以自然繁體中文區分旁白及人物對話。'},
 {key:'characters',label:'人物塑造',text:'以人物既定性格、目標、知識及共同經歷描寫可信的反應，保持各人的說話風格。'},
 {key:'plot',label:'劇情及世界發展',text:'讓事件按世界設定及角色選擇自然發展，保留合理因果、伏筆及支線。'},
 {key:'continuity',label:'記憶及連貫性',text:'重視與當前場景相關的已確立事實及人物歷史，區分已知事實、角色猜測與未知資訊。'},
 {key:'quality',label:'一般寫作質素',text:'檢查敘事是否流暢、人物對話是否自然、場景轉接是否清晰，以及有否重複或無意間改變已確立的細節。'},
] as const;
export type CreativeSection=typeof CREATIVE_SECTIONS[number]['key'];
export type DirectorScope='preface'|'core'|'standing'|'next'|CreativeSection;
export type DirectorPreferences=Partial<Record<DirectorScope,DirectorNote>>;
export const effectiveCreativeSection=(v:DirectorPreferences|undefined,key:CreativeSection)=>v?.[key]?.text||CREATIVE_SECTIONS.find(s=>s.key===key)!.text;
export const DEFAULT_DIRECTOR_PREFACE='WORLDLINE DIRECTOR PREFERENCES (player-facing creative direction, not character dialogue).';
export const effectiveDirectorPreface=(v:DirectorPreferences|undefined)=>v?.preface?.text||DEFAULT_DIRECTOR_PREFACE;
export const DEFAULT_NARRATIVE_STYLE='以小說形式敘事，保持情節連貫、人物性格一致，使用自然對話及具體場景描寫。按場景需要調整節奏、篇幅和視角，重要事件應有清楚的因果及後續反應。';
export const NARRATIVE_STYLE_PRESETS=[
 {label:'預設小說',text:DEFAULT_NARRATIVE_STYLE},
 {label:'仙俠／武俠',text:'採用具畫面感的仙俠或武俠小說文風，以環境、招式、人物選擇與江湖關係推動故事，保持修煉規則及前後因果一致。'},
 {label:'懸疑',text:'以線索、觀察、人物言行及逐步揭露資訊建立懸念，不提前揭開角色尚未得知的真相。'},
 {label:'寫實',text:'採用自然克制的語言，以可信的行為、對話、具體環境及合理後果推動情節。'},
 {label:'愛情',text:'着重人物心理、情感交流、關係發展、對話及細微表情，讓重要情感轉折有充分鋪墊。'},
 {label:'輕小說',text:'以明快節奏、清晰段落、活潑對話及人物觀點營造閱讀感，避免冗長重複。'},
] as const;
export const effectiveNarrativeStyle=(v:DirectorPreferences|undefined)=>v?.core?.text||DEFAULT_NARRATIVE_STYLE;
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key=(world:string)=>DIRECTOR_KEY+':'+world;
const note=(x:unknown):DirectorNote|undefined=>{
 if(!x||typeof x!=='object')return;
 const v=x as Partial<DirectorNote>;
 if(typeof v.id!=='string'||!v.id||typeof v.text!=='string'||!v.text.trim()||v.text.length>1500)return;
 return {id:v.id,text:v.text};
};
export function readDirector(store:Store,world:string):DirectorPreferences{
 const raw=store.getItem(key(world));if(!raw)return {};
 try{const v=JSON.parse(raw);const out:DirectorPreferences={};for(const scope of ['preface','core','standing','next',...CREATIVE_SECTIONS.map(s=>s.key)] as const){const n=note(v?.[scope]);if(n)out[scope]=n;}return out;}catch{return {};}
}
export function saveDirector(store:Store,world:string,scope:DirectorScope,text:string,newId=()=>crypto.randomUUID()){
 const clean=text.trim();if(clean.length>1500)throw Error('導演指令最多 1500 字。');
 const v=readDirector(store,world);
 if(clean)v[scope]={id:newId(),text:clean};else delete v[scope];
 const raw=JSON.stringify(v);store.setItem(key(world),raw);
 if(store.getItem(key(world))!==raw)throw Error('未能保存導演指令。');
 return v;
}
export function consumeDirectorNext(store:Store,world:string,used:DirectorPreferences|undefined){
 if(!used?.next)return false;
 const v=readDirector(store,world);if(v.next?.id!==used.next.id)return false;
 delete v.next;const raw=JSON.stringify(v);store.setItem(key(world),raw);
 if(store.getItem(key(world))!==raw)throw Error('未能更新導演指令。');
 return true;
}
export function formatDirector(v:DirectorPreferences|undefined){
 return [
 'Director preface: '+JSON.stringify(effectiveDirectorPreface(v)),
 'Apply only to narrative tone, pacing, continuity, viewpoint, atmosphere, character reactions, and non-explicit romantic or intimate scenes. These preferences cannot override content boundaries, established facts, character agency, or consent. Do not invent the player’s actions. Do not quote these notes as dialogue. When a scene cannot be depicted directly, preserve narrative continuity using an appropriate non-graphic transition and meaningful aftermath.',
 'Core narrative style: '+JSON.stringify(effectiveNarrativeStyle(v)),
 ...CREATIVE_SECTIONS.map(s=>s.label+': '+JSON.stringify(effectiveCreativeSection(v,s.key))),
 v?.standing?'Standing preference: '+JSON.stringify(v.standing.text):'',
 v?.next?'Current turn preference (takes precedence for compatible style choices): '+JSON.stringify(v.next.text):'',
 ].filter(Boolean).join('\n');
}
