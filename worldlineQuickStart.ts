import type {VeniceMessage} from './venice.js';
import type {WorldlineGenre,WorldlineStartOptions} from './worldline.js';
export const WORLD_TOPICS=[
 ['修仙／玄幻','xianxia'],['異世界／穿越','isekai'],['系統流','system'],['重生／改變命運','rebirth'],
 ['末世生存','apocalypse'],['科幻／探索','apocalypse'],['魔法／奇幻','fantasy'],['都市生活','custom'],
 ['懸疑／推理','custom'],['歷史／架空王朝','custom'],['經營／建立勢力','custom'],['學院／成長','custom'],
 ['超能力／超自然','fantasy'],['冒險／尋寶','fantasy'],
] as const satisfies readonly (readonly [string,WorldlineGenre])[];
export type WorldIdea={title:string;genre:WorldlineGenre;premise:string;protagonist:string;goldenFinger:string;mainQuest:string};
export type WorldRecommendationMode='similar'|'different'|'inspiration'|'blind';
export type WorldIdeaInput={topics:string[];comment:string;previous?:WorldIdea[];recommendation?:WorldRecommendationMode;pastGenres?:WorldlineGenre[]};
export const worldIdeaCount=(input:WorldIdeaInput)=>input.recommendation==='inspiration'?6:input.recommendation==='blind'?1:3;
const genres:WorldlineGenre[]=['xianxia','isekai','system','rebirth','apocalypse','fantasy','custom'];
export const buildWorldIdeaMessages=(input:WorldIdeaInput):VeniceMessage[]=>[
 {role:'system',content:[
 'You are an inventive interactive-fiction world designer. Propose exactly '+(worldIdeaCount(input)===3?'three':worldIdeaCount(input))+' distinct, immediately playable story worlds in natural Traditional Chinese.',
 'Each option must stand on its own: a distinctive title, genre, concrete world and opening situation, the protagonist starting identity, a fitting unusual ability or resource (or explicitly no special ability for grounded settings), and a long-term story arc with independent forces and stakes.',
 'Make the options differ in premise, protagonist role, conflicts and game mechanics, not merely names. Respect selected topics and user preferences; if multiple topics are chosen, mix them creatively or offer different combinations. If no topics are given, explore different directions.',
 input.recommendation==='similar'?'Use the genre history as a weak preference signal, never as proof of what the player liked; devise new worlds with related themes.':input.recommendation==='different'?'Prioritize genres and mechanics unlike the supplied genre history.':input.recommendation==='inspiration'?'Offer six contrasting fresh directions across several genres.':input.recommendation==='blind'?'Design one surprising world whose identity, powers and central mystery can unfold naturally through the first scene and later discoveries. Do not reveal all secrets at once.':'',
 'Leave the player free to act; do not choose their dialogue, actions or feelings. Do not prewrite the full first chapter or reveal its resolution.',
 'Use only a JSON array of exactly '+worldIdeaCount(input)+' objects with keys title, genre, premise, protagonist, goldenFinger, mainQuest.',
 'genre must be one of xianxia, isekai, system, rebirth, apocalypse, fantasy, custom. Title 6–30 Chinese characters; premise 90–180; protagonist 20–60; goldenFinger 30–100; mainQuest 60–130. No Markdown or commentary.',
 ].join(' ')},
 {role:'user',content:JSON.stringify({topics:input.topics.slice(0,14),preferences:input.comment.trim().slice(0,1000),avoidRepeating:(input.previous||[]).slice(0,6).map(x=>({title:x.title,premise:x.premise.slice(0,200)})),...(input.recommendation?{recommendation:input.recommendation,pastGenres:(input.pastGenres||[]).slice(0,12)}:{})})},
];
const clean=(x:unknown,max:number)=>typeof x==='string'?x.replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max):'';
export function parseWorldIdeas(raw:string,count=3):WorldIdea[]{
 if(typeof raw!=='string')throw Error('未收到世界構想。');
 const text=raw.replace(/<think>[\s\S]*?<\/think>/giu,'').trim().replace(/^```(?:json)?\s*|\s*```$/giu,'');
 let data:unknown;try{data=JSON.parse(text);}catch{throw Error('AI 未能生成完整世界構想，請再抽一次。');}
 if(![1,3,6].includes(count)||!Array.isArray(data)||data.length!==count)throw Error('未能取得完整世界構想，請再試。');
 const ideas=data.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||!genres.includes(row.genre))throw Error('世界題材格式有誤，請再試。');
  const idea:WorldIdea={title:clean(row.title,100),genre:row.genre,premise:clean(row.premise,1700),protagonist:clean(row.protagonist,300),goldenFinger:clean(row.goldenFinger,700),mainQuest:clean(row.mainQuest,550)};
  if(idea.title.length<2||idea.premise.length<30||idea.protagonist.length<4||idea.goldenFinger.length<4||idea.mainQuest.length<20)throw Error('世界構想未完整，請再抽一次。');
  return idea;
 });
 const unique=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu,'');
 if(new Set(ideas.map(x=>unique(x.title))).size!==count||new Set(ideas.map(x=>unique(x.premise))).size!==count)throw Error('AI 提供了重複世界，請再抽一次。');
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

export const FUSION_STYLES=[
 ['character','人物穿越'],['power','能力融合'],['collision','世界碰撞'],['civilization','文明競爭'],['laws','法則融合'],['auto','由 AI 自由決定'],
] as const;
export type FusionStyle=typeof FUSION_STYLES[number][0];
export type FusionWorldInput={first:string;second:string;style:FusionStyle;comment:string;previous?:WorldIdea[]};
export const buildFusionWorldMessages=(input:FusionWorldInput):VeniceMessage[]=>[
 {role:'system',content:[
 'Design exactly three distinct playable fictional crossover worlds in Traditional Chinese. Combine both requested settings, works, civilizations or fictional mechanics substantively, not merely their names.',
 'Respect the chosen fusion approach: character transfer, power integration, world collision, civilization competition, shared underlying laws, or an automatically selected approach. Explain in each premise how the settings coexist, their initial contact, compatibility, limitations, independent factions and concrete opening dilemma.',
 'For power or law fusion establish coherent interactions, avoid arbitrary power scaling, preserve recognizable rules where compatible, and explicitly label newly invented rules as crossover rules. Treat uncertain canon as open. Do not reproduce original passages or dialogue.',
 'Respect optional player preferences, avoid predetermined player actions and future spoilers, and allow alternative outcomes.',
 'Return only a JSON array of exactly three objects with title, genre, premise, protagonist, goldenFinger, mainQuest. genre must be xianxia, isekai, system, rebirth, apocalypse, fantasy, custom. Premise 150–350 Chinese characters, protagonist 20–80, goldenFinger 40–140, mainQuest 60–160. No Markdown.',
 ].join(' ')},
 {role:'user',content:JSON.stringify({first:input.first.trim().slice(0,100),second:input.second.trim().slice(0,100),fusion:FUSION_STYLES.find(x=>x[0]===input.style)?.[1]||'由 AI 自由決定',preferences:input.comment.trim().slice(0,700),avoidRepeating:(input.previous||[]).slice(0,3).map(x=>({title:x.title,premise:x.premise.slice(0,200)}))})},
];
export function fusionIdeaToWorldOptions(idea:WorldIdea,input:FusionWorldInput):WorldlineStartOptions{
 const fixed='融合來源：'+input.first.trim().slice(0,100)+' ＋ '+input.second.trim().slice(0,100)+'。融合方向：'+(FUSION_STYLES.find(x=>x[0]===input.style)?.[1]||'由 AI 自由決定')+'。以本世界已建立嘅兼容規則及因果為準，原著唔預設結局。'+(input.comment.trim()?'玩家偏好：'+input.comment.trim().slice(0,700)+'。':'');
 return {...ideaToWorldOptions(idea),premise:fixed+idea.premise.slice(0,Math.max(0,1700-fixed.length))};
}
