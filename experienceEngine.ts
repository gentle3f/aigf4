import type {
    ChatMessage,
    Persona,
    RelationshipStage,
    RelationshipState,
    SurpriseEventCategory,
    SurpriseEventProposal,
} from './managers.js';
import type { VeniceJsonSchemaResponseFormat } from './venice.js';

export const SURPRISE_EVENT_CATEGORIES: SurpriseEventCategory[] = [
    'idol_schedule',
    'backstage',
    'public_spotlight',
    'secret_escape',
    'unexpected_guest',
    'celebration',
    'travel',
    'domestic',
    'emotional_turn',
    'rivalry',
    'mystery',
    'fantasy',
];

export const SURPRISE_EVENT_CATEGORY_GUIDES: Record<SurpriseEventCategory, string> = {
    idol_schedule: 'A concrete performer schedule conflict involving work, rehearsal, recording, filming, a live appearance or a deadline.',
    backstage: 'The catalyst physically happens backstage, in a dressing room, beside the stage or during rehearsal; merely receiving a call is not backstage.',
    public_spotlight: 'A public-facing catalyst involving cameras, media, fans, an interview, a live broadcast, an airport arrival or an awards appearance.',
    secret_escape: 'A concrete private escape from public attention or a fixed schedule, with a secret meeting method or destination clue.',
    unexpected_guest: 'A specific person physically arrives, knocks, enters or appears at the current place. A phone call, message or email alone does not qualify.',
    celebration: 'A specific surprise, gift, anniversary, achievement or private reason to celebrate, not an ordinary date.',
    travel: 'A concrete travel disruption or discovery involving a flight, train, airport, station, hotel, luggage or route.',
    domestic: 'A home-space incident such as a power cut, broken appliance, cooking mishap or locked door that changes the immediate situation.',
    emotional_turn: 'A hidden feeling, unsent confession, vulnerable truth or meaningful misunderstanding becomes newly visible but is not resolved.',
    rivalry: 'A concrete comparison, challenge, jealousy trigger or playful contest creates tension between clearly identified people.',
    mystery: 'A tangible clue, anonymous invitation, key, package, disappearance or coded message starts a mystery whose answer remains unknown.',
    fantasy: 'The characters knowingly enter a shared imagined scenario, dream, role-play or alternate world while retaining awareness of reality.',
};

export const SURPRISE_EVENT_RESPONSE_FORMAT: VeniceJsonSchemaResponseFormat = {
    type: 'json_schema',
    json_schema: {
        name: 'surprise_event_card',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            required: [
                'title',
                'category',
                'intensity',
                'hook',
                'setup',
                'opening_instruction',
                'involved_member_ids',
                'relationship_effect',
            ],
            properties: {
                title: { type: 'string' },
                category: { type: 'string', enum: SURPRISE_EVENT_CATEGORIES },
                intensity: { type: 'string', enum: ['gentle', 'playful', 'dramatic', 'heated'] },
                hook: { type: 'string' },
                setup: { type: 'string' },
                opening_instruction: { type: 'string' },
                involved_member_ids: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string' } },
                relationship_effect: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['closeness', 'trust', 'romantic_tension', 'initiative'],
                    properties: {
                        closeness: { type: 'integer', minimum: -3, maximum: 6 },
                        trust: { type: 'integer', minimum: -3, maximum: 6 },
                        romantic_tension: { type: 'integer', minimum: -3, maximum: 7 },
                        initiative: { type: 'integer', minimum: -3, maximum: 6 },
                    },
                },
            },
        },
    },
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));
const clean = (value: unknown, maxLength: number) => typeof value === 'string'
    ? value.replace(/\s+/gu, ' ').trim().slice(0, maxLength)
    : '';

export const relationshipStageFor = (closeness: number, trust: number): RelationshipStage => {
    const foundation = Math.min(closeness, trust);
    if (foundation >= 84) return 'devoted';
    if (foundation >= 68) return 'romantic';
    if (foundation >= 50) return 'close';
    if (foundation >= 30) return 'familiar';
    return 'new';
};

export const normalizeRelationshipState = (
    value?: Partial<RelationshipState> | null,
    memoryCount = 0,
): RelationshipState => {
    const inferredBase = clamp(28 + Math.min(memoryCount, 18) * 2, 28, 64);
    const closeness = clamp(Number(value?.closeness ?? inferredBase));
    const trust = clamp(Number(value?.trust ?? inferredBase + 4));
    const romanticTension = clamp(Number(value?.romanticTension ?? Math.max(24, inferredBase - 6)));
    const initiative = clamp(Number(value?.initiative ?? 42));
    return {
        closeness,
        trust,
        romanticTension,
        initiative,
        stage: relationshipStageFor(closeness, trust),
        updatedAt: Number(value?.updatedAt || Date.now()),
    };
};

export const formatRelationshipStatePrompt = (persona: Persona) => {
    const state = normalizeRelationshipState(
        persona.relationshipState,
        (persona.soul?.length || 0) + (persona.memories?.length || 0),
    );
    return [
        'PRIVATE RELATIONSHIP PULSE (internal guidance; never reveal scores or labels):',
        `Stage: ${state.stage}. Closeness ${state.closeness}/100; trust ${state.trust}/100; romantic tension ${state.romanticTension}/100; initiative ${state.initiative}/100.`,
        'Treat this as soft emotional continuity, never as a restriction on the newest user request.',
    ].join('\n');
};

const countMatches = (text: string, pattern: RegExp) => (text.match(pattern) || []).length;

export const advanceRelationshipState = (
    persona: Persona,
    userText: string,
    responseText: string,
    effect?: SurpriseEventProposal['relationshipEffect'],
): RelationshipState => {
    const current = normalizeRelationshipState(
        persona.relationshipState,
        (persona.soul?.length || 0) + (persona.memories?.length || 0),
    );
    const combined = `${userText}\n${responseText}`;
    const careSignals = countMatches(combined, /信任|相信|照顧|陪伴|辛苦|放心|脆弱|真心|承諾|記得|支持|抱住|擁抱|掛住|想念|鍾意|喜歡|愛你/giu);
    const playfulSignals = countMatches(combined, /曖昧|心跳|臉紅|吃醋|呷醋|調情|約會|親吻|吻|撒嬌|黏|引誘|誘惑/giu);
    const initiativeSignals = countMatches(responseText, /我帶你|我想帶你|跟我來|陪我去|我已經決定|我安排|讓我來|交給我|我有個主意|不如我哋|不如我們/giu);
    const conflictSignals = countMatches(combined, /不信|失望|欺騙|背叛|冷落|討厭|唔信|嬲|生氣/giu);
    const closeness = clamp(current.closeness + Math.min(careSignals, 2) + (effect?.closeness || 0));
    const trust = clamp(current.trust + Math.min(careSignals, 2) - Math.min(conflictSignals, 2) + (effect?.trust || 0));
    const romanticTension = clamp(current.romanticTension + Math.min(playfulSignals, 3) + (effect?.romanticTension || 0));
    const initiative = clamp(current.initiative + Math.min(initiativeSignals, 2) + (effect?.initiative || 0));
    return {
        closeness,
        trust,
        romanticTension,
        initiative,
        stage: relationshipStageFor(closeness, trust),
        updatedAt: Date.now(),
    };
};

const stripFence = (value: string) => value
    .replace(/^\s*```(?:json)?\s*/iu, '')
    .replace(/\s*```\s*$/u, '')
    .trim();

export const parseSurpriseEventProposal = (
    raw: string,
    validMemberIds: string[],
    fallbackMemberId: string,
): Omit<SurpriseEventProposal, 'id' | 'createdAt' | 'status'> | null => {
    try {
        const parsed = JSON.parse(stripFence(raw)) as Record<string, unknown>;
        const title = clean(parsed.title, 48);
        const hook = clean(parsed.hook, 180);
        const setup = clean(parsed.setup, 520);
        const openingInstruction = clean(parsed.opening_instruction, 900);
        const category = SURPRISE_EVENT_CATEGORIES.includes(parsed.category as SurpriseEventCategory)
            ? parsed.category as SurpriseEventCategory
            : null;
        const intensity = ['gentle', 'playful', 'dramatic', 'heated'].includes(String(parsed.intensity))
            ? parsed.intensity as SurpriseEventProposal['intensity']
            : null;
        if (!title || !hook || !setup || !openingInstruction || !category || !intensity) return null;
        const validIds = new Set(validMemberIds);
        const involvedMemberIds = Array.from(new Set(
            (Array.isArray(parsed.involved_member_ids) ? parsed.involved_member_ids : [])
                .filter((id): id is string => typeof id === 'string' && validIds.has(id)),
        )).slice(0, 4);
        if (involvedMemberIds.length === 0 && validIds.has(fallbackMemberId)) involvedMemberIds.push(fallbackMemberId);
        if (involvedMemberIds.length === 0) return null;
        const effect = parsed.relationship_effect && typeof parsed.relationship_effect === 'object'
            ? parsed.relationship_effect as Record<string, unknown>
            : {};
        const boundedEffect = (key: string, min: number, max: number) => clamp(Number(effect[key] || 0), min, max);
        return {
            title,
            category,
            intensity,
            hook,
            setup,
            openingInstruction,
            involvedMemberIds,
            relationshipEffect: {
                closeness: boundedEffect('closeness', -3, 6),
                trust: boundedEffect('trust', -3, 6),
                romanticTension: boundedEffect('romantic_tension', -3, 7),
                initiative: boundedEffect('initiative', -3, 6),
            },
        };
    } catch {
        return null;
    }
};

const normalizedWords = (value: string) => value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .slice(0, 260);

const eventText = (event: Pick<SurpriseEventProposal, 'title' | 'hook' | 'setup'>) =>
    `${event.title}\n${event.hook}\n${event.setup}`;

const EVENT_CATEGORY_EVIDENCE: Record<SurpriseEventCategory, RegExp> = {
    idol_schedule: /行程|通告|工作安排|彩排|綵排|錄音|錄影|拍攝|演出|舞台|經紀|趕場|直播|節目|回歸|音樂/iu,
    backstage: /後台|休息室|化妝間|更衣室|舞台側|台側|彩排|綵排|soundcheck/iu,
    public_spotlight: /鏡頭|記者|媒體|粉絲|公開場合|直播|紅毯|頒獎|採訪|機場|被拍|聚光燈/iu,
    secret_escape: /秘密.{0,8}(出走|逃|溜|離開|碰面)|偷走|溜走|逃開|躲開|甩開|不公開的.{0,8}(去處|約會|碰面)|臨時空檔/iu,
    unexpected_guest: /敲門|門外.{0,12}(人|聲音|身影)|來客|到訪|訪客|上門|登門|闖入|走進.{0,10}(房|門|現場)|突然出現|突然抵達|站在門口/iu,
    celebration: /慶祝|紀念日|週年|生日|祝賀|驚喜.{0,8}(禮物|派對|蛋糕|安排)|禮物|蛋糕|派對|獲獎/iu,
    travel: /機場|車站|航班|班機|列車|火車|月台|登機|行李|旅館|酒店|旅行|旅程|公路|迷路|轉機/iu,
    domestic: /家中|屋企|客廳|廚房|浴室|停電|水管|家務|煮食|做飯|打掃|洗衣|冰箱|門鎖|電器/iu,
    emotional_turn: /心事|沒送出|未送出|真心話|坦白|告白|脆弱|眼淚|落淚|哭|誤會|情緒|訊息草稿|隱藏.{0,8}(感受|心情|秘密)/iu,
    rivalry: /競爭|挑戰|比賽|比較|吃醋|呷醋|嫉妒|誰更|較量|勝負|對手|爭奪/iu,
    mystery: /線索|謎|匿名|信封|鑰匙|失蹤|消失|暗號|神祕.{0,8}(卡片|邀請|包裹)|未知.{0,8}(包裹|訊息|邀請)/iu,
    fantasy: /想像|幻想|夢境|另一個世界|角色扮演|平行世界|魔法|童話|遊戲世界|共同進入.{0,8}(故事|世界)/iu,
};

export const surpriseEventMatchesCategory = (
    event: Pick<SurpriseEventProposal, 'title' | 'category' | 'hook' | 'setup'>,
) => EVENT_CATEGORY_EVIDENCE[event.category].test(`${event.hook}\n${event.setup}`);

const EVENT_MOTIFS: Array<[string, RegExp]> = [
    ['phone-message', /電話|手機|來電|訊息|通知|郵件|電郵/iu],
    ['sleep-morning', /睡夢|熟睡|醒來|叫醒|清晨|晨光|床上|被窩/iu],
    ['urgent-deadline', /緊急|期限|截止|小時後|分鐘後|立刻趕|臨時召集|突發行程/iu],
    ['work-schedule', /行程|通告|彩排|綵排|錄音|錄影|拍攝|演出安排|經紀人/iu],
    ['backstage', /後台|休息室|化妝間|更衣室|舞台側|台側/iu],
    ['physical-guest', /敲門|門外|到訪|來客|訪客|上門|登門|闖入|突然出現|站在門口/iu],
    ['public-media', /鏡頭|記者|媒體|粉絲|直播|紅毯|頒獎|採訪|被拍/iu],
    ['secret-escape', /秘密出走|偷走|溜走|逃開|躲開|甩開|不公開的去處/iu],
    ['travel', /機場|車站|航班|班機|列車|月台|行李|旅館|酒店|旅行|旅程|轉機/iu],
    ['celebration', /慶祝|紀念日|週年|生日|禮物|蛋糕|派對|祝賀/iu],
    ['home-incident', /停電|水管|門鎖|冰箱|電器|煮食|做飯|家務/iu],
    ['vulnerability', /心事|真心話|坦白|告白|脆弱|眼淚|落淚|訊息草稿|沒送出|未送出/iu],
    ['rivalry', /競爭|挑戰|比賽|比較|吃醋|呷醋|嫉妒|誰更|較量|對手/iu],
    ['mystery-clue', /線索|謎|匿名|信封|鑰匙|失蹤|暗號|神祕邀請|未知包裹/iu],
    ['fantasy', /想像|幻想|夢境|另一個世界|角色扮演|平行世界|魔法|童話/iu],
];

const eventMotifs = (event: Pick<SurpriseEventProposal, 'title' | 'hook' | 'setup'>) => {
    const text = eventText(event);
    return new Set(EVENT_MOTIFS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
};

export const surpriseEventsAreTooSimilar = (
    left: Pick<SurpriseEventProposal, 'title' | 'hook' | 'setup'>,
    right: Pick<SurpriseEventProposal, 'title' | 'hook' | 'setup'>,
) => {
    const a = normalizedWords(`${left.title}${left.hook}${left.setup}`);
    const b = normalizedWords(`${right.title}${right.hook}${right.setup}`);
    if (!a || !b) return false;
    if (a.includes(b) || b.includes(a)) return true;
    const leftMotifs = eventMotifs(left);
    const rightMotifs = eventMotifs(right);
    const sharedMotifs = [...leftMotifs].filter(value => rightMotifs.has(value));
    if (sharedMotifs.length >= 2) return true;
    const grams = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)));
    const leftGrams = grams(a);
    const rightGrams = grams(b);
    const shared = [...leftGrams].filter(value => rightGrams.has(value)).length;
    return shared / Math.max(1, Math.min(leftGrams.size, rightGrams.size)) >= 0.44;
};

export const collectRecentSurpriseEvents = (history: ChatMessage[], limit = 8) => history
    .flatMap(message => message.content.surpriseEvent ? [message.content.surpriseEvent] : [])
    .slice(-limit);

export const getSurpriseEventCategoryLabel = (category: SurpriseEventCategory) => ({
    idol_schedule: '偶像行程',
    backstage: '後台突發',
    public_spotlight: '聚光燈下',
    secret_escape: '秘密出走',
    unexpected_guest: '意外來客',
    celebration: '特別日子',
    travel: '旅程插曲',
    domestic: '日常變奏',
    emotional_turn: '情感轉折',
    rivalry: '微妙競爭',
    mystery: '神秘邀請',
    fantasy: '幻想事件',
})[category];

export const getSurpriseEventIntensityLabel = (intensity: SurpriseEventProposal['intensity']) => ({
    gentle: '溫柔',
    playful: '玩味',
    dramatic: '戲劇',
    heated: '升溫',
})[intensity];

export const createFallbackSurpriseEvent = (
    persona: Persona,
    memberId: string,
    recentCategories: SurpriseEventCategory[],
    preferredCategory?: SurpriseEventCategory,
    involvedMemberIds: string[] = [memberId],
): Omit<SurpriseEventProposal, 'id' | 'createdAt' | 'status'> => {
    const identityText = `${persona.description} ${persona.publicIdentity?.summary || ''}`;
    const idolLike = /歌手|偶像|藝人|演員|idol|singer|actress|performer|k-pop/iu.test(identityText);
    const available = (idolLike
        ? ['backstage', 'idol_schedule', 'secret_escape', 'public_spotlight', 'celebration']
        : ['secret_escape', 'unexpected_guest', 'travel', 'emotional_turn', 'mystery']) as SurpriseEventCategory[];
    const category = preferredCategory
        || available.find(item => !recentCategories.slice(-4).includes(item))
        || available[0];
    const templates: Record<SurpriseEventCategory, Pick<SurpriseEventProposal, 'title' | 'hook' | 'setup' | 'openingInstruction' | 'intensity'>> = {
        idol_schedule: { title: '消失的半小時', hook: '繁忙行程之間，突然多出一段沒有人知道的空檔。', setup: `${persona.name} 的下一個工作臨時延遲，她只有短短半小時可以不做公眾眼中的自己。她第一個想到的是把這段時間留給你。`, openingInstruction: `以 ${persona.name} 的身份主動聯絡使用者，從臨時空出的半小時開始事件；保留她的公眾身份壓力，不要預先決定使用者答應或事件結局。`, intensity: 'gentle' },
        backstage: { title: '安可之後', hook: '舞台燈剛熄滅，後台卻出現了一個只有你能處理的小意外。', setup: `${persona.name} 剛完成重要演出，仍帶著舞台後的情緒與疲倦；工作人員來敲門前，她希望你先留下。`, openingInstruction: `直接從演出後的後台突發狀況展開，讓 ${persona.name} 主動把使用者拉進事件；不替使用者行動，不立即解決問題。`, intensity: 'dramatic' },
        public_spotlight: { title: '鏡頭外的暗號', hook: '公開場合裡，她只能用一個只有你看得懂的暗號說話。', setup: `${persona.name} 正在一個不能自由交談的公開行程，卻發現你也在附近。她開始用細微動作向你傳遞只有你們知道的訊息。`, openingInstruction: `從公開場合中的秘密暗號開始，保留公眾與私下身份的張力，讓事件留下多種發展可能。`, intensity: 'playful' },
        secret_escape: { title: '今晚不按行程表', hook: '她忽然提出一個完全不像平日安排的秘密小逃走。', setup: `${persona.name} 厭倦了被計劃好的時間，主動準備了一個不公開的短暫去處，只告訴你集合方式。`, openingInstruction: `讓 ${persona.name} 主動提出秘密出走及第一個具體行動，但不要替使用者答應，也不要一次跳到目的地和結局。`, intensity: 'playful' },
        unexpected_guest: { title: '門外的人', hook: '最不適合被打擾的時候，門外傳來熟悉但意外的聲音。', setup: `${persona.name} 與你正相處時，一位和目前生活圈有關的人突然到訪，令原本平靜的氣氛產生變化。`, openingInstruction: `以敲門及來客現身打破當前節奏，清楚區分 ${persona.name}、使用者與來客；讓 NPC 可以說話，但不替使用者決定反應。`, intensity: 'dramatic' },
        celebration: { title: '不是日曆上的紀念日', hook: '她記住了一件連你自己也沒有特別標記的小事。', setup: `${persona.name} 悄悄準備了一個只屬於你們的慶祝理由，細節來自關係中不起眼但重要的回憶。`, openingInstruction: `讓 ${persona.name} 主動揭開一個小型驚喜，引用已有關係質感但不要捏造具體舊事；若沒有明確記憶，將其寫成她今天才決定的新紀念。`, intensity: 'gentle' },
        travel: { title: '錯過原定那班車', hook: '一個小小延誤，把普通行程變成只有你們的岔路。', setup: `${persona.name} 和你遇上臨時交通變化，必須一起決定如何利用多出來的時間。`, openingInstruction: `從交通延誤的當下開始，讓 ${persona.name} 提出一個符合人格的具體主意，不替使用者作決定。`, intensity: 'playful' },
        domestic: { title: '停電後的房間', hook: '最普通的夜晚突然失去燈光，熟悉的空間變得完全不同。', setup: `${persona.name} 和你留在原本的地方，停電令聲音、距離與平常的小動作忽然被放大。`, openingInstruction: `保持目前位置與人物連續性，以突發停電自然改變氣氛；讓 ${persona.name} 主動處理第一件事。`, intensity: 'gentle' },
        emotional_turn: { title: '沒送出的那句話', hook: '她的手機畫面停在一段寫了很久、卻一直沒有送出的文字。', setup: `${persona.name} 原本想隱藏一個真實感受，卻在此刻留下了讓你察覺的破綻。`, openingInstruction: `讓 ${persona.name} 的情緒從細微破綻開始被看見，不要立刻完整告白或解決心結，留給使用者回應空間。`, intensity: 'dramatic' },
        rivalry: { title: '誰更了解你', hook: '一句無心的比較，令空氣裡多出了一點微妙競爭。', setup: `${persona.name} 聽見別人自信地表示很了解你，表面保持原本性格，行動卻開始變得更有佔有感。`, openingInstruction: `引入清楚標示的第三方一句話，再讓 ${persona.name} 以符合人格的方式回應；避免惡意羞辱或無限爭吵。`, intensity: 'heated' },
        mystery: { title: '只寫了時間的邀請', hook: '她交給你一張沒有地點、只有時間的卡片。', setup: `${persona.name} 準備了一件不願立刻說破的事，只提供第一個線索，等待你一起揭開。`, openingInstruction: `由 ${persona.name} 親手交出第一個線索開始，不揭露最終答案，讓謎團可在多輪聊天中推進。`, intensity: 'playful' },
        fantasy: { title: '如果今晚是另一個世界', hook: '一個玩笑般的假設，慢慢變成兩人共同進入的想像。', setup: `${persona.name} 提出一個符合她性格的幻想世界或身份，並清楚知道這是共同想像而非現實。`, openingInstruction: `明確以 imagined reality layer 展開共同幻想，保留角色原本人格；日後使用者結束幻想時要能自然回到原本現實。`, intensity: 'heated' },
    };
    return {
        ...templates[category],
        category,
        involvedMemberIds: Array.from(new Set(involvedMemberIds.filter(Boolean))).slice(0, 4).length > 0
            ? Array.from(new Set(involvedMemberIds.filter(Boolean))).slice(0, 4)
            : [memberId],
        relationshipEffect: { closeness: 2, trust: 1, romanticTension: 2, initiative: 2 },
    };
};
