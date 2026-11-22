/** AIGF Worldline v1 — durable interactive-story state.
 * Worldline is a GAME MODE attached to an existing conversation, not a rewrite
 * of the chat or a separate competing database.
 */
export const WORLDLINE_SETTING_KEY = 'aigf4WorldlineRegistryV1';
export const WORLDLINE_SCHEMA = 'aigf-worldline-registry-v1';
export type WorldlineGenre = 'xianxia' | 'isekai' | 'system' | 'rebirth' | 'apocalypse' | 'fantasy' | 'custom';
export type WorldlineTone = 'free' | 'story';
export type WorldlineRelationshipMode = 'normal' | 'adult';
export type WorldlineNpc = { id: string; name: string; role: string; motivation: string; relationship: string };
export type WorldlineChronicle = { id: string; input: string; outcome: string; turn: number };
export interface Worldline {
    conversationKey: string;
    title: string;
    genre: WorldlineGenre;
    premise: string;
    protagonist: string;
    worldRules: string;
    goldenFinger: string;
    goldenFingerRule: string;
    mainQuest: string;
    questProgress: string;
    chapter: string;
    location: string;
    ability: string;
    inventory: string[];
    threads: string[];
    npcs: WorldlineNpc[];
    facts: string[];
    chronicle: WorldlineChronicle[];
    tone: WorldlineTone;
    relationshipMode: WorldlineRelationshipMode;
    turnCount: number;
    createdAt: number;
    updatedAt: number;
    paused: boolean;
}
export type WorldlineRecord = { updatedAt: number; world: Worldline | null };
export type WorldlineRegistry = {
    schema: typeof WORLDLINE_SCHEMA;
    records: Record<string, WorldlineRecord>;
};
export interface WorldlineStartOptions {
    title: string;
    genre: WorldlineGenre;
    premise: string;
    protagonist?: string;
    goldenFinger?: string;
    mainQuest?: string;
    relationshipMode?: WorldlineRelationshipMode;
    tone?: WorldlineTone;
}
const MAX_WORLDS = 16;
const MAX_JSON_CHARS = 280_000;
const genres: readonly WorldlineGenre[] = [
    'xianxia','isekai','system','rebirth','apocalypse','fantasy','custom',
];
const clean = (value: unknown, max: number) =>
    typeof value === 'string'
        ? value.replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max)
        : '';
const stamp = (raw: unknown) =>
    typeof raw === 'number' && Number.isSafeInteger(raw) && raw > 0 && raw < 9e15 ? raw : 1;
const validKey = (key: string) => Boolean(key && key.length <= 180 && !/[\u0000-\u001f\u007f]/u.test(key));
const arr = (input: unknown, limit: number, maxLength: number): string[] =>
    Array.isArray(input)
        ? input.filter(v=>typeof v==='string').slice(-limit).map(v=>clean(v,maxLength)).filter(Boolean)
        : [];
export const normalizeWorldline = (input: Worldline): Worldline => {
    const genre = genres.includes(input.genre) ? input.genre : 'custom';
    const npcs: WorldlineNpc[] = (Array.isArray(input.npcs) ? input.npcs : []).slice(-24)
        .filter(v=>v && typeof v === 'object')
        .map((v,i)=>({
            id: clean(v.id,70) || 'npc-'+i,
            name: clean(v.name,80),
            role: clean(v.role,180),
            motivation: clean(v.motivation,240),
            relationship: clean(v.relationship,200),
        })).filter(v=>Boolean(v.name));
    const chronicle: WorldlineChronicle[] = (Array.isArray(input.chronicle) ? input.chronicle : [])
        .slice(-14).filter(v=>v && typeof v==='object')
        .map((v,i)=>({ id:clean(v.id,80)||'turn-'+i,
            input:clean(v.input,170), outcome:clean(v.outcome,270),
            turn:Math.max(0,Math.min(1_000_000,Number.isInteger(v.turn)?v.turn:0))}));
    return {
        conversationKey: clean(input.conversationKey,180),
        title:clean(input.title,100)||'未命名世界',
        genre, premise:clean(input.premise,1700),
        protagonist:clean(input.protagonist,300)||'由玩家自由決定主角身份',
        worldRules:clean(input.worldRules,1500),
        goldenFinger:clean(input.goldenFinger,700)||'由故事世界自然生成金手指；規則可以逐步揭示',
        goldenFingerRule:clean(input.goldenFingerRule,550),
        mainQuest:clean(input.mainQuest,550)||'由序章建立有長期後果的主線，玩家可以偏離',
        questProgress:clean(input.questProgress,650),
        chapter:clean(input.chapter,120)||'序章',
        location:clean(input.location,160)||'開局場景待揭曉',
        ability:clean(input.ability,180)||'初始狀態',
        inventory:arr(input.inventory,30,180),
        threads:arr(input.threads,16,260),
        npcs, facts:arr(input.facts,32,320),chronicle,
        tone:input.tone === 'free' ? 'free' : 'story',
        relationshipMode:input.relationshipMode === 'adult' ? 'adult' : 'normal',
        turnCount:Math.max(0,Math.min(1_000_000,Number.isInteger(input.turnCount)?input.turnCount:0)),
        createdAt:stamp(input.createdAt), updatedAt:stamp(input.updatedAt),
        paused:input.paused===true,
    };
};
export const makeWorldline = (conversationKey:string,options:WorldlineStartOptions,now=Date.now()):Worldline => {
    if(!validKey(conversationKey))throw Error('INVALID_WORLDLINE_CONVERSATION_KEY');
    const premise=clean(options.premise,1700);
    if(!premise)throw Error('請先輸入世界背景或想玩嘅故事方向。');
    return normalizeWorldline({
        conversationKey,title:options.title||'新世界線',genre:options.genre,
        premise,protagonist:options.protagonist||'由玩家自行決定',
        goldenFinger:options.goldenFinger||'由世界自行創造一個有獨特玩法的金手指',
        goldenFingerRule:'依照已知故事規則運作；不得無故失效或改寫已確認能力',
        worldRules:'由開局建立並延續；未確認的細節保持開放',
        mainQuest:options.mainQuest||'由開局建立主線：有明確牽引、代價與持續後果，但不強迫立即完成',
        questProgress:'尚未展開',chapter:'序章',location:'開局場景待揭曉',
        ability:'初始狀態',inventory:[],threads:[],npcs:[],facts:[],chronicle:[],
        tone:options.tone==='free'?'free':'story',
        relationshipMode:options.relationshipMode==='adult'?'adult':'normal',
        turnCount:0,createdAt:now,updatedAt:now,paused:false,
    });
};
export const emptyWorldlineRegistry=():WorldlineRegistry=>({schema:WORLDLINE_SCHEMA,records:{}});
export const parseWorldlineRegistry=(raw:unknown):WorldlineRegistry=>{
    let input:unknown=raw;
    if(typeof raw==='string') {
        if(raw.length>MAX_JSON_CHARS)return emptyWorldlineRegistry();
        try{input=JSON.parse(raw);}catch{return emptyWorldlineRegistry();}
    }
    if(!input||typeof input!=='object'||Array.isArray(input))return emptyWorldlineRegistry();
    const rec=input as Record<string,unknown>;
    if(rec.schema!==WORLDLINE_SCHEMA || !rec.records || typeof rec.records!=='object'
        || Array.isArray(rec.records))return emptyWorldlineRegistry();
    const rows:Array<[string,WorldlineRecord]>=[];
    for(const [key,rawEntry] of Object.entries(rec.records)){
        if(!validKey(key)||!rawEntry||typeof rawEntry!=='object')continue;
        const entry=rawEntry as WorldlineRecord;
        const updatedAt=stamp(entry.updatedAt);
        if(entry.world===null){rows.push([key,{updatedAt,world:null}]);continue;}
        if(!entry.world||typeof entry.world!=='object')continue;
        if(entry.world.conversationKey!==key)continue;
        rows.push([key,{updatedAt,world:normalizeWorldline(entry.world)}]);
    }
    rows.sort((a,b)=>b[1].updatedAt-a[1].updatedAt || a[0].localeCompare(b[0]));
    return {schema:WORLDLINE_SCHEMA,records:Object.fromEntries(rows.slice(0,MAX_WORLDS))};
};
export const mergeWorldlineRegistries=(local:unknown,remote:unknown):WorldlineRegistry=>{
    const left=parseWorldlineRegistry(local).records;
    const right=parseWorldlineRegistry(remote).records;
    const records:Record<string,WorldlineRecord>={};
    for(const key of new Set([...Object.keys(left),...Object.keys(right)])){
        const a=left[key],b=right[key];
        if(!a)records[key]=b;
        else if(!b)records[key]=a;
        else if(a.updatedAt>b.updatedAt)records[key]=a;
        else if(b.updatedAt>a.updatedAt)records[key]=b;
        else records[key]=(a.world===null||b.world===null)
            ? {updatedAt:a.updatedAt,world:null}
            : JSON.stringify(a.world)<=JSON.stringify(b.world)?a:b;
    }
    return parseWorldlineRegistry({schema:WORLDLINE_SCHEMA,records});
};
export const getWorldline=(register:unknown,key:string):Worldline|null=>{
    if(!validKey(key))return null;
    return parseWorldlineRegistry(register).records[key]?.world||null;
};
export const updateWorldlineRegistry=(register:unknown,key:string,world:Worldline|null,now=Date.now()):WorldlineRegistry=>{
    if(!validKey(key))throw Error('INVALID_WORLDLINE_CONVERSATION_KEY');
    const base=parseWorldlineRegistry(register);
    const previous=base.records[key];
    const nextTime=Math.max(stamp(now),(previous?.updatedAt||0)+1);
    const normalized=world?normalizeWorldline({...world,conversationKey:key,updatedAt:nextTime}):null;
    return parseWorldlineRegistry({schema:WORLDLINE_SCHEMA,records:{
        ...base.records,[key]:{updatedAt:nextTime,world:normalized},
    }});
};
export const recordWorldlineTurn=(world:Worldline,userInput:string,modelText:string,now=Date.now()):Worldline=>{
    const turn=world.turnCount+1;
    return normalizeWorldline({...world,turnCount:turn,updatedAt:now,
        chronicle:[...world.chronicle,{
            id:'turn-'+turn,input:clean(userInput,170),
            outcome:clean(modelText,270),turn,
        }].slice(-14)});
};
const genreNames:Record<WorldlineGenre,string>={
    xianxia:'修仙／玄幻',isekai:'異世界／穿越',system:'系統流',
    rebirth:'重生',apocalypse:'末世／科幻',fantasy:'奇幻冒險',custom:'自訂世界',
};
export const worldlineGenreLabel=(genre:WorldlineGenre)=>genreNames[genre];
export const buildWorldlinePrompt=(world:Worldline):string=>{
    if(world.paused)return '';
    const short=(items:string[],limit=12)=>items.slice(-limit).map(v=>'- '+v).join('\n')||'- 尚未確立';
    return [
        'AIGF WORLDLINE — PERSISTENT INTERACTIVE STORY MODE (fictional world, not real-world news):',
        `World: ${world.title}; genre: ${genreNames[world.genre]}; chapter: ${world.chapter}; game turn: ${world.turnCount}; location: ${world.location}.`,
        `Player-defined premise: ${world.premise}`,
        `Protagonist: ${world.protagonist}; current abilities: ${world.ability}.`,
        `World constraints and established rules: ${world.worldRules||'Unresolved; introduce coherent rules as the fiction develops.'}`,
        `Golden finger / system: ${world.goldenFinger}. Its known rules: ${world.goldenFingerRule}.`,
        `Main storyline: ${world.mainQuest}. Progress so far: ${world.questProgress}.`,
        `Story pacing: ${world.tone==='free'?'OPEN-WORLD: do not force quests; background factions/NPCs continue acting.':'SERIALIZED STORY: maintain a meaningful long arc, foreshadowing and real stakes, but never railroad the player.'}`,
        `Relationship mode: ${world.relationshipMode==='adult'?'adult fiction involving adults only; romantic/intimate relationships can intersect the main plot without reducing NPCs to rewards':'normal romance and relationships as appropriate to context'}.`,
        'Inventory / treasures:',short(world.inventory,16),
        'Unresolved subplot and faction pressures:',short(world.threads,10),
        'Player-confirmed durable world facts (do not silently contradict):',short(world.facts,15),
        'Recurring NPCs (have their own goals; do not automatically join the fixed chat cast):',
        ...(world.npcs.length?world.npcs.slice(-15).map(n=>`- ${n.name}: ${n.role}; wants ${n.motivation}; connection: ${n.relationship}.`):['- Not established yet; introduce characters only when a plausible scene calls for them.']),
        'Recent timeline (summarized excerpts, not canonical verified facts):',
        ...(world.chronicle.length?world.chronicle.slice(-6).map(turn=>`- #${turn.turn} player: ${turn.input}; scene: ${turn.outcome}`):['- The world has not begun.']),
        'WORLD DIRECTOR CONTRACT:',
        '- This is an ongoing novel-like playable reality, NOT a one-off surprise card, rigid choice menu, or quest checklist. Begin inside a concrete scene and let it evolve across many turns.',
        '- The world exists beyond the player: factions move, NPCs pursue separate aims, secrets have owners, alliances change and actions have irreversible consequences when established.',
        '- Follow the latest player action first. Never silently act or consent on the player’s behalf. Offer natural openings, not compulsory numbered options.',
        '- Give the protagonist unusual capabilities as defined by the golden finger, with creative uses, progression and coherent costs. Do NOT nerf or replace the golden finger without an in-world cause.',
        '- Maintain long-running main and side arcs, meaningful setbacks and victories; do not solve the entire central mystery in the first reply or repeat identical dramatic hooks.',
        '- New NPCs can be friends, rivals, family, mentors, strangers, villains and adult love interests of different genders. Their existence does not require joining the fixed group roster.',
        '- Romance and adult intimacy are optional narrative paths and can influence loyalties and story consequences, but characters do not exist solely to serve the protagonist.',
        '- Preserve the existing characters, speech styles and memories if this world is attached to an existing group. They may acquire new in-world identities without erasing their existing selves.',
        '- The world-state panel contains PLAYER-EDITED confirmed facts. Never claim a newly invented location, item, relationship, victory or mission is already saved there. If the player wants it recorded, they can update the ledger.',
        '- When the scene naturally warrants it, have the setting or an NPC initiate change without waiting for a special random-event button. Quiet chapters are also valuable.',
        '- Reply in natural Traditional Chinese, reflect the user\'s stated language style, and keep a clear distinction between narration, in-world dialogue and optional system notifications.',
    ].join('\n');
};
export const buildWorldlineOpening=(world:Worldline):string=>
    [
        '【世界線開局】請直接開始第一幕，唔需要再問我設計題目。',
        `世界：${world.title}／${genreNames[world.genre]}。`,
        `我嘅設定：${world.premise}。`,
        `主角身份：${world.protagonist}。金手指：${world.goldenFinger}。`,
        `主線方向：${world.mainQuest}。`,
        '直接展示一個具體、有戲劇張力但合理嘅開場，令世界人物自行行動。',
        '安排主線伏筆、至少一個具有自己目的的NPC，但唔好第一輪就完結故事。',
        '唔需要列出任務列表或者問我想玩邊個選項；等我自由回應。',
    ].join('\n');
