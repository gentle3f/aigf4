import type {VeniceMessage} from './venice.js';
import type {WorldlineGenre,WorldlineStartOptions} from './worldline.js';
export const WORLD_TOPICS=[
 ['修仙／玄幻','xianxia'],['異世界／穿越','isekai'],['系統流','system'],['重生／改變命運','rebirth'],
 ['末世生存','apocalypse'],['科幻／探索','apocalypse'],['魔法／奇幻','fantasy'],['都市生活','custom'],
 ['懸疑／推理','custom'],['歷史／架空王朝','custom'],['經營／建立勢力','custom'],['學院／成長','custom'],
 ['超能力／超自然','fantasy'],['冒險／尋寶','fantasy'],
] as const satisfies readonly (readonly [string,WorldlineGenre])[];
export type WorldIdea={title:string;genre:WorldlineGenre;premise:string;protagonist:string;goldenFinger:string;mainQuest:string};
export type WorldIdeaInput={topics:string[];comment:string;previous?:WorldIdea[]};
const genres:WorldlineGenre[]=['xianxia','isekai','system','rebirth','apocalypse','fantasy','custom'];
export const buildWorldIdeaMessages=(input:WorldIdeaInput):VeniceMessage[]=>[
 {role:'system',content:[
 'You are an inventive interactive-fiction world designer. Propose exactly three distinct, immediately playable story worlds in natural Traditional Chinese.',
 'Each option must stand on its own: a distinctive title, genre, concrete world and opening situation, the protagonist starting identity, a fitting unusual ability or resource (or explicitly no special ability for grounded settings), and a long-term story arc with independent forces and stakes.',
 'Make the three options differ in premise, protagonist role, conflicts and game mechanics, not merely names. Respect selected topics and user preferences; if multiple topics are chosen, mix them creatively or offer different combinations. If no topics are given, explore three different directions.',
 'Leave the player free to act; do not choose their dialogue, actions or feelings. Do not prewrite the full first chapter or reveal its resolution.',
 'Use only a JSON array of exactly three objects with keys title, genre, premise, protagonist, goldenFinger, mainQuest.',
 'genre must be one of xianxia, isekai, system, rebirth, apocalypse, fantasy, custom. Title 6–30 Chinese characters; premise 90–180; protagonist 20–60; goldenFinger 30–100; mainQuest 60–130. No Markdown or commentary.',
 ].join(' ')},
 {role:'user',content:JSON.stringify({topics:input.topics.slice(0,14),preferences:input.comment.trim().slice(0,1000),avoidRepeating:(input.previous||[]).slice(0,3).map(x=>({title:x.title,premise:x.premise.slice(0,200)}))})},
];
const clean=(x:unknown,max:number)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max):'';
export function parseWorldIdeas(raw:string):WorldIdea[]{
 if(typeof raw!=='string')throw Error('未收到世界構想。');
 const text=raw.replace(/<think>[\s\S]*?<\/think>/giu,'').trim().replace(/^```(?:json)?\s*|\s*```$/giu,'');
 let data:unknown;try{data=JSON.parse(text);}catch{throw Error('AI 未能生成完整世界構想，請再抽一次。');}
 if(!Array.isArray(data)||data.length!==3)throw Error('未能取得三個完整世界，請再試。');
 const ideas=data.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||!genres.includes(row.genre))throw Error('世界題材格式有誤，請再試。');
  const idea:WorldIdea={title:clean(row.title,100),genre:row.genre,premise:clean(row.premise,1700),protagonist:clean(row.protagonist,300),goldenFinger:clean(row.goldenFinger,700),mainQuest:clean(row.mainQuest,550)};
  if(idea.title.length<2||idea.premise.length<30||idea.protagonist.length<4||idea.goldenFinger.length<4||idea.mainQuest.length<20)throw Error('世界構想未完整，請再抽一次。');
  return idea;
 });
 const unique=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu,'');
 if(new Set(ideas.map(x=>unique(x.title))).size!==3||new Set(ideas.map(x=>unique(x.premise))).size!==3)throw Error('AI 提供了重複世界，請再抽一次。');
 return ideas;
}
export const ideaToWorldOptions=(idea:WorldIdea):WorldlineStartOptions=>({...idea,tone:'story',relationshipMode:'normal'});

export type ExistingWorldInput={work:string;character:string;startingPoint:string;comment:string;previous?:WorldIdea[]};
export const buildExistingWorldMessages=(input:ExistingWorldInput):VeniceMessage[]=>[
 {role:'system',content:[
 'Create exactly three playable alternate-timeline starting concepts set in the named fictional work. Use natural Traditional Chinese.',
 'Respect the specified work, continuity, playable character and starting point. If the character is blank, offer appropriate playable identities; if the starting point is blank, propose three distinct entry points. If specified, keep that entry point in all options and vary the initial dilemma instead.',
 'The player controls the selected character completely. Other characters retain independent personalities, relationships, goals and knowledge appropriate to the chosen point. Use the known setting, power system and established events before the start; do not grant later powers, invent established canon, or force the original plot outcome.',
 'Distinguish known setting from newly invented alternate-timeline possibilities. Treat uncertain details as open rather than authoritative. Do not reproduce passages or dialogue from the work. Create original scenes and conflicts. Avoid spoiling future revelations unless requested.',
 'Do not introduce a new system or special ability unless the player requests it. Preserve the character’s capabilities at the chosen point; for a self-created character, provide a fitting starting ability or resource.',
 'Output only a JSON array of exactly three distinct objects with keys title, genre, premise, protagonist, goldenFinger, mainQuest. Genre must be xianxia, isekai, system, rebirth, apocalypse, fantasy, or custom. Title 6–30 Chinese characters; premise 120–250; protagonist 20–90; goldenFinger 30–120; mainQuest 60–140. No markdown or commentary.',
 ].join(' ')},
 {role:'user',content:JSON.stringify({work:input.work.trim().slice(0,100),playableCharacter:input.character.trim().slice(0,100)||'AI 選擇',startingPoint:input.startingPoint.trim().slice(0,200)||'AI 建議不同起點',preferences:input.comment.trim().slice(0,1000),avoidRepeating:(input.previous||[]).slice(0,3).map(x=>({title:x.title,premise:x.premise.slice(0,200)}))})},
];
// Keep user-selected work/character/timeline in the durable premise even if the draft omits them.
export function existingIdeaToWorldOptions(idea:WorldIdea,input:ExistingWorldInput):WorldlineStartOptions{
 const fixed=['作品世界：'+input.work.trim().slice(0,100),
  input.character.trim()?'玩家扮演：'+input.character.trim().slice(0,100):'',
  input.startingPoint.trim()?'指定起點：'+input.startingPoint.trim().slice(0,200):'',
  '從指定起點建立獨立世界線；原著此前已發生嘅事件作為背景，之後由玩家行動決定，不預設原著結局。',
  '保留該時點人物、關係、能力與世界規則；未確認的原著細節保持開放。',
  input.comment.trim()?'玩家偏好：'+input.comment.trim().slice(0,1000):'',
 ].filter(Boolean).join('。');
 const room=Math.max(0,1700-fixed.length-2);
 return {...ideaToWorldOptions(idea),title:(input.work.trim().slice(0,60)+' · '+idea.title).slice(0,100),
  premise:fixed+'。'+idea.premise.slice(0,room),
  protagonist:input.character.trim()?('玩家扮演 '+input.character.trim().slice(0,100)+'；'+idea.protagonist).slice(0,300):idea.protagonist};
}
