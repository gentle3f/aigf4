type NpcHistoryMessage = {
    role: 'user' | 'model' | 'system';
    content: { text?: string };
};

const LATIN_NAME = "[\\p{Script=Latin}][\\p{Script=Latin}'’-]{1,24}(?:\\s+[\\p{Script=Latin}][\\p{Script=Latin}'’-]{1,24})?";
const HAN_NAME = '[\\p{Script=Han}]{2,8}';
const SHORT_HAN_NAME = '[\\p{Script=Han}]{2,4}';
const NAME_CAPTURE = `(${LATIN_NAME}|${HAN_NAME})`;
const DIRECT_NAME_CAPTURE = `(${LATIN_NAME}|${SHORT_HAN_NAME})`;

const normalizeName = (value: string) => value
    .trim()
    .replace(/^[「『“"'@#\[]+|[」』”"'\]，。！？!?,:：；;~～]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();

const ignoredNameSet = (personaName: string) => new Set([
    personaName,
    '大家', '同學', '朋友', '同事', '老師', '醫生', '女生', '女仔', '男人', '女人',
    '主人', '用戶', '場景', '環境', '地點', '時間', '內心', '心聲', '鏡頭', '描述',
    '動作', '旁人', '路人',
    '我朋友', '我的朋友', '我同學', '我的同學', '我同事', '我的同事',
    '朋友叫', '同學叫', '同事叫', '閨蜜叫',
    '這是', '呢個', '呢位', '你好', '哈囉', '使用者', '旁白', '系統', '角色',
    'hello', 'there', 'everyone', 'friend', 'classmate', 'teacher', 'doctor', 'user',
    'assistant', 'narration', 'system', 'she', 'he', 'they', 'you', 'your', 'me',
].map(name => name.toLocaleLowerCase()));

const uniqueValidNames = (values: string[], personaName: string) => {
    const ignored = ignoredNameSet(personaName);
    const result: string[] = [];
    values.forEach(value => {
        const name = normalizeName(value);
        if (!name || name.length < 2 || name.length > 40 || ignored.has(name.toLocaleLowerCase())) return;
        if (/^[\p{Script=Han}]+$/u.test(name)) {
            if (/^[你我佢她他它這呢那請想可唔不怎點讓叫等跟同向對和]/u.test(name)) return;
            if (/[的嘅]/u.test(name)) return;
            if (/^(?:最好|最佳|真正|唯一|正確|錯誤|其他|上一|下一)/u.test(name)) return;
            if (/(?:選擇|決定|方法|做法|答案|問題|事情|東西|原因|結果|機會|想法|意思|地方|時候|感覺|情況|安排)$/u.test(name)) return;
        }
        if (!result.some(item => item.toLocaleLowerCase() === name.toLocaleLowerCase())) result.push(name);
    });
    return result;
};

export const extractDirectNpcNames = (text: string, personaName: string) => {
    const candidates: string[] = [];
    const patterns = [
        new RegExp(`\\b(?:hi|hello|hey)\\b\\s*[,，!！~～]?\\s*${NAME_CAPTURE}`, 'giu'),
        new RegExp(`(?:你好|嗨|哈囉|喂)[,，!！~～\\s]+${NAME_CAPTURE}`, 'giu'),
        new RegExp(`(?:叫做|名叫|named|called)\\s*[「『"']?${NAME_CAPTURE}`, 'giu'),
        new RegExp(`(?:這是|呢個係|呢位係)\\s*(?:一位|一個|個)?\\s*(?:我的|我嘅|我)?\\s*(?:朋友|同學|同事|閨蜜|friend|classmate|colleague)\\s*(?:叫做|名叫|叫|named|called)?\\s*[「『"']?${NAME_CAPTURE}`, 'giu'),
        new RegExp(`(?:這是|呢個係|呢位係)\\s*[「『“"]\\s*${NAME_CAPTURE}\\s*[」』”"]`, 'giu'),
        new RegExp(`(?:這是|呢個係|呢位係)\\s*${DIRECT_NAME_CAPTURE}(?![\\p{Script=Han}])(?=\\s*(?:[，,。！？!?]|$))`, 'giu'),
        new RegExp(`(?:介紹|introduce)\\s*(?:一位|一個|個)?\\s*(?:我的|我嘅|我)?\\s*(?:朋友|同學|同事|閨蜜|friend|classmate|colleague)\\s*[「『"']?${NAME_CAPTURE}`, 'giu'),
        new RegExp(`(?:介紹|introduce)\\s*[「『"']?(${LATIN_NAME})`, 'giu'),
        new RegExp(`(?:朋友|同學|同事|閨蜜|friend|classmate|colleague)[^。！？!?\\n]{0,18}(?:叫做|名叫|叫|named|called)\\s*[「『"']?${NAME_CAPTURE}`, 'giu'),
        new RegExp(`(?:同|跟|向|問|找|搵|對住?|和)\\s*[「『"']?${NAME_CAPTURE}[」』"']?\\s*(?:講|說|問|傾|打招呼|say|ask|talk|speak|reply|answer)`, 'giu'),
        new RegExp(`(?:^|[。！？!?\\n])\\s*${NAME_CAPTURE}\\s*[,，:：]\\s*(?:你|妳|可唔可以|可以|點|怎|想|要|請|唔該|can|could|would|what|how|please)`, 'gimu'),
    ];
    patterns.forEach(pattern => {
        for (const match of text.matchAll(pattern)) candidates.push(match[1]);
    });
    return uniqueValidNames(candidates, personaName);
};

const extractAttributedNpcNames = (text: string, personaName: string) => {
    const candidates: string[] = [];
    const labelPattern = new RegExp(
        `(?:^|\\n|[）)。！？!?])\\s*(?:\\*{0,2})?(?:\\[)?${NAME_CAPTURE}(?:\\])?(?:\\*{0,2})?(?:\\s*[:：]\\s*(?:[「『“"])?\\S|\\s*(?=[（(]))`,
        'gimu',
    );
    for (const match of text.matchAll(labelPattern)) candidates.push(match[1]);
    return uniqueValidNames(candidates, personaName);
};

export interface ObservedNpcCandidate {
    name: string;
    modelTurnCount: number;
    firstSeenIndex: number;
    lastSeenIndex: number;
}

export const collectObservedNpcCandidates = (
    history: NpcHistoryMessage[],
    personaName: string,
    minimumModelTurns = 3,
) => {
    const observations = new Map<string, ObservedNpcCandidate>();
    history.slice(-48).forEach((message, index) => {
        if (message.role !== 'model' || !message.content.text?.trim()) return;
        const names = new Set(extractAttributedNpcNames(message.content.text, personaName));
        names.forEach(name => {
            const key = name.toLocaleLowerCase();
            const existing = observations.get(key);
            if (existing) {
                existing.modelTurnCount += 1;
                existing.lastSeenIndex = index;
            } else {
                observations.set(key, {
                    name,
                    modelTurnCount: 1,
                    firstSeenIndex: index,
                    lastSeenIndex: index,
                });
            }
        });
    });
    return [...observations.values()]
        .filter(candidate => candidate.modelTurnCount >= minimumModelTurns)
        .sort((left, right) => left.firstSeenIndex - right.firstSeenIndex);
};

export const collectEstablishedNpcNames = (
    history: NpcHistoryMessage[],
    personaName: string,
    latestUserMessage = '',
    limit = 6,
) => {
    const ordered: string[] = [];
    const remember = (name: string) => {
        const normalized = name.toLocaleLowerCase();
        const previous = ordered.findIndex(item => item.toLocaleLowerCase() === normalized);
        if (previous >= 0) ordered.splice(previous, 1);
        ordered.push(name);
    };

    history.slice(-48).forEach(message => {
        const text = message.content.text?.trim();
        if (!text || message.role === 'system') return;
        const names = message.role === 'user'
            ? extractDirectNpcNames(text, personaName)
            : extractAttributedNpcNames(text, personaName);
        names.forEach(remember);
    });
    extractDirectNpcNames(latestUserMessage, personaName).forEach(remember);
    return ordered.slice(-limit);
};

const hasNpcPromotionIntent = (text: string) => [
    /(?:把|將|讓|叫|邀請|拉|加).{1,36}(?:加入|加進|加到|拉進|拉到|邀請進|邀請到|進入).{0,18}(?:這個|呢個|我們的|我哋個)?(?:聊天室|群組|對話|chat|group)/iu,
    /(?:把|將|讓|叫|邀請|拉|加).{1,36}(?:加入|加進|加到|拉進|拉到|邀請進|邀請到|進入)(?:來|嚟|吧|啦|喇|先)?[。！？!?\s]*$/iu,
    /(?:邀請|加|拉).{1,36}(?:到|入|進)\s*(?:這個|呢個|我們的|我哋個)?(?:聊天室|群組|對話|chat|group)/iu,
    /(?:聊天室|群組|group\s*chat|chatroom).{0,24}(?:加入|加進|拉進|邀請|add|invite)/iu,
    /\b(?:add|invite|bring)\b.{1,48}\b(?:to|into)\b.{0,18}\b(?:this\s+|our\s+)?(?:chat|group|chatroom)\b/iu,
    /^\s*(?:please\s+)?(?:add|invite)\s+\S+/iu,
].some(pattern => pattern.test(text));

export const inferNpcPromotionNames = (
    text: string,
    personaName: string,
    establishedNpcNames: string[],
) => {
    if (!hasNpcPromotionIntent(text)) return [];

    const candidates = establishedNpcNames.filter(name => (
        text.toLocaleLowerCase().includes(name.toLocaleLowerCase())
    ));
    const patterns = [
        new RegExp(`(?:把|將|讓|叫|邀請)\\s*[「『"']?${NAME_CAPTURE}[」』"']?\\s*(?:加入|加進|加到|拉進|拉到|邀請進|邀請到|進入)`, 'giu'),
        new RegExp(`(?:加入|加進|加到|拉進|拉到|邀請|加)\\s*[「『"']?${NAME_CAPTURE}[」』"']?(?:\\s*(?:到|入|進))?\\s*(?:這個|呢個|我們的|我哋個)?(?:聊天室|群組|對話|chat|group)`, 'giu'),
        new RegExp(`\\b(?:add|invite|bring)\\s+(${LATIN_NAME})(?=\\s+(?:to|into)\\s+(?:this\\s+|our\\s+)?(?:chat|group|chatroom)\\b)`, 'giu'),
        new RegExp(`^\\s*(?:please\\s+)?(?:add|invite)\\s+(${LATIN_NAME})\\s*[.!！。]?\\s*$`, 'giu'),
    ];
    patterns.forEach(pattern => {
        for (const match of text.matchAll(pattern)) candidates.push(match[1]);
    });
    extractDirectNpcNames(text, personaName).forEach(name => candidates.push(name));

    if (candidates.length === 0 && /(?:她|他|佢|對方|her|him|them)/iu.test(text)) {
        const latest = establishedNpcNames.at(-1);
        if (latest) candidates.push(latest);
    }
    return uniqueValidNames(candidates, personaName);
};

export const inferIntroducedNpcNames = (text: string, personaName: string) => {
    const explicitlyIntroducesSomeone = /(?:介紹|introduce|這是|呢個係|呢位係|this\s+is)|(?:朋友|同學|同事|閨蜜|friend|classmate|colleague).{0,20}(?:叫做|名叫|叫|named|called)/iu.test(text);
    return explicitlyIntroducesSomeone ? extractDirectNpcNames(text, personaName) : [];
};

export const inferNpcSpeakersForTurn = (
    latestUserMessage: string,
    personaName: string,
    establishedNpcNames: string[],
) => {
    const direct = extractDirectNpcNames(latestUserMessage, personaName);
    if (direct.length > 0) return direct;
    const asksThirdPartyToSpeak = /(?:叫|讓|請|想聽|輪到|由|等).{0,8}(?:她|他|佢|對方).{0,10}(?:講|說|答|回答|回應|reply|answer|speak)|(?:她|他|佢).{0,8}(?:會點講|怎麼說|點答|答|講|說|回答|回應|開口)|what\s+(?:does|would)\s+(?:she|he|they)\s+say/iu.test(latestUserMessage);
    return asksThirdPartyToSpeak && establishedNpcNames.length > 0
        ? [establishedNpcNames.at(-1)!]
        : [];
};

export const replyHasNpcSpeech = (reply: string, npcNames: string[]) => npcNames.every(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const directLabel = new RegExp(`(?:^|\\n|[）)])\\s*${escaped}\\s*[:：]\\s*(?:[「『“"])?\\S`, 'iu');
    const narratedSpeech = new RegExp(
        `${escaped}[^。！？!?\\n]{0,18}(?:說|問|答|回答|回應|笑道|低聲道|講|話)[^。！？!?\\n]{0,10}[：:]?\\s*[「『“"]`,
        'iu',
    );
    return directLabel.test(reply) || narratedSpeech.test(reply);
});

export const buildNpcContinuityRequirement = (npcNames: string[]) => npcNames.length === 0
    ? ''
    : [
        `Established third-party participants still available in recent continuity: ${npcNames.join(', ')}.`,
        'Keep each of them separate from the user and active character. Preserve their latest established voice, relationship, location and knowledge instead of resetting them into faceless extras.',
        'When the newest turn addresses one of them or naturally gives them the floor, write that person\'s own visibly attributed dialogue and action. Do not let the active character merely report what the third party supposedly did or said.',
    ].join('\n');
