import type {
    ChatMessage,
    Persona,
    RelationshipStage,
    RelationshipState,
    SurpriseEventCategory,
    SurpriseEventContentMode,
    SurpriseEventMemberRole,
    SurpriseEventProposal,
} from './managers.js';
import { ROOM_PRESENT_MEMBER_LIMIT } from './roomManager.js';
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

export const NSFW_SURPRISE_EVENT_DIRECTIONS = [
    {
        prompt: 'a private adult seduction challenge with a concrete dare, clear roles and immediate sexual tension',
        fallbackPremise: '一張寫明成人規則的私密挑戰卡被放到你面前，第一個挑戰要求其中一人主動提出清楚的性邀請。',
        showTitle: '午夜真心與挑戰',
        showHook: '一個只限成年人的互動挑戰節目已經開場，每回合都要在真心題與成人挑戰之間二選一。',
        showSetup: '場地、挑戰卡與三輪賽制已經準備完成；所有已選角色都是正式參與者，第一回合現在就從抽取開場卡開始。',
        showActivities: [
            '每位參與者寫下一條只限成年人的真心問題，混合後逐一抽取並立即回答。',
            '答題者指定下一位完成六十秒誘惑表演，其餘參與者即場評分。',
            '本輪得分最低者抽取加碼條件，由你選擇保留、交換或改抽一次。',
        ],
        showChoice: '第一回合由你指定誰先抽卡，或交給節目即場抽籤。',
        categories: ['backstage', 'domestic', 'rivalry', 'mystery', 'celebration'],
    },
    {
        prompt: 'a consensual adult role-play premise with specific identities, a private setting and a clear first move',
        fallbackPremise: '她們準備了一個只限成年人的角色扮演設定，身份、場地與第一個性挑戰都已寫好，只等待你決定是否開始。',
        showTitle: '身份交換劇場',
        showHook: '每位參與者抽取一個成人角色與秘密任務，必須保持身份直到回合結束。',
        showSetup: '舞台身份、場景規則與隱藏任務已經抽好；第一回合會逐一揭曉角色，並立即進入互動演出。',
        showActivities: [
            '每人抽取一張角色身份及一個禁止詞，朗讀身份後立即進入角色。',
            '參與者兩人一組完成三分鐘即興演出，過程中說出禁止詞便要交換身份。',
            '其餘參與者投票選出最投入的一組，再由你決定是否換角或加入秘密條件。',
        ],
        showChoice: '你要先揭曉哪一位的身份，還是讓主持人按抽籤次序開始？',
        categories: ['fantasy', 'mystery', 'domestic', 'backstage'],
    },
    {
        prompt: 'an after-work or after-performance private release where one selected character initiates a clearly sexual proposition',
        fallbackPremise: '工作或演出結束後的私人空檔裡，其中一人不再掩飾慾望，向你提出一個具體的成人邀請。',
        showTitle: '安可後的成人特別篇',
        showHook: '正式演出結束後，所有已選角色留下錄製一段不公開的成人互動特別篇。',
        showSetup: '鏡頭、舞台與回合卡已重新設定，第一回合由其中一位提出節目的第一個成人邀請，其餘參與者會即場接續。',
        showActivities: [
            '每位參與者依次完成四十五秒個人誘惑舞台，並自行選擇音樂、語氣及站位。',
            '節目抽出兩人配對，把各自的個人舞台合併成一段即興雙人演出。',
            '所有人完成後由你選出安可人選，並指定安可加入一項新的表演條件。',
        ],
        showChoice: '你要指定誰主持第一回合，還是讓她們自行搶先開始？',
        categories: ['backstage', 'celebration'],
    },
    {
        prompt: 'a playful adult power-exchange game with an explicit rule, a concrete reward or consequence, and room for the user to choose',
        fallbackPremise: '一場成人主導權遊戲訂下了清楚規則、獎勵與後果，但由你決定接受、拒絕或改寫第一條規則。',
        showTitle: '主導權擂台',
        showHook: '參與者要透過逐輪挑戰爭取下一回合的主導權，每次勝出都會解鎖新的成人規則。',
        showSetup: '計分牌、獎勵與替代懲罰已經公開；第一輪由所有已選角色同場競逐，不會有人留在場外旁觀。',
        showActivities: [
            '所有參與者抽籤決定主導者與挑戰者，並按卡牌要求交換稱呼及舞台位置。',
            '主導者指定一項限時角色指令，挑戰者完成後由其他參與者投票評分。',
            '本輪勝出者按下加碼鍵，從角色交換、雙人配對或延長計時中挑選下一條規則。',
        ],
        showChoice: '第一輪由你選擇挑戰項目，或讓參與者各自提出一項再抽籤。',
        categories: ['rivalry', 'mystery', 'fantasy', 'domestic'],
    },
    {
        prompt: 'a multi-character adult attention or jealousy game in which every selected character has a distinct active role',
        fallbackPremise: '幾位參與者把原本的爭寵變成明確的成人遊戲，每人提出不同的性挑戰，等你選擇先回應誰。',
        showTitle: '今晚誰最懂你',
        showHook: '所有參與者以不同方式完成成人挑戰，爭取成為最了解你反應的人。',
        showSetup: '每人已經準備一張完全不同的挑戰卡；第一輪會依次亮牌、互相回應，最後才由你作出選擇。',
        showActivities: [
            '每位參與者先寫下她猜測你最喜歡的一種語氣、造型或角色設定，再同時亮牌。',
            '她們依次用六十秒表演自己的答案，其他參與者可以加入、模仿或提出加碼。',
            '你為每段表演排序，最低分者抽取新角色卡並與最高分者配對進入下一輪。',
        ],
        showChoice: '你要指定亮牌順序，還是讓她們自己爭取第一位？',
        categories: ['rivalry', 'celebration', 'backstage'],
    },
    {
        prompt: 'a risky-but-private adult encounter with a concrete interruption risk, time limit or need for secrecy',
        fallbackPremise: '一段有限時或可能被打斷的私人空檔，令她們直接提出一個必須立刻決定是否開始的成人性冒險。',
        showTitle: '倒數成人挑戰',
        showHook: '節目只有一段明確倒數時間，參與者必須在每輪時限結束前完成或改選挑戰。',
        showSetup: '倒數器、回合卡與中止按鈕已經就位；所有已選角色會在同一輪內輪流行動，時間一到便立刻進入加碼規則。',
        showActivities: [
            '每位參與者抽取一張六十秒任務卡，計時開始後立即完成指定語氣、角色或表演要求。',
            '每次鈴聲響起便交換搭檔與任務卡，上一位留下的條件會加入下一段演出。',
            '未能在時限完成者要回答一條成人真心題，再由你決定延長、換題或進入加碼。',
        ],
        showChoice: '你要設定第一輪的開始次序，還是立即按下隨機開始鍵？',
        categories: ['backstage', 'mystery', 'domestic'],
    },
    {
        prompt: 'the discovery or gifting of a clearly adult intimate item that creates a specific sexual challenge',
        fallbackPremise: '一件明確的成人情趣用品意外出現，附帶的使用規則把它變成一個尚未開始的具體性挑戰。',
        showTitle: '成人盲盒特別場',
        showHook: '每個密封盲盒都藏有一件成人道具與對應挑戰，抽中者必須先讀出該輪規則。',
        showSetup: '盲盒、挑戰卡與替代選項已經排在場中央；每位已選角色都有自己的抽取回合，第一盒現在等待開啟。',
        showActivities: [
            '第一位參與者抽出眼罩、角色卡或計時器其中一件道具，並朗讀盒內的配對規則。',
            '抽中眼罩者戴上後只靠同伴口頭提示猜出角色，其餘參與者輪流提供線索。',
            '猜中後由她指定下一位打開角色盲盒，再由你選擇兩人配對或全部加入同一回合。',
        ],
        showChoice: '第一個盲盒由你指定誰打開，或讓所有參與者同時抽籤。',
        categories: ['mystery', 'celebration', 'domestic', 'backstage'],
    },
] as const;

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
                'activities',
                'user_choice',
                'relationship_effect',
            ],
            properties: {
                title: { type: 'string' },
                category: { type: 'string', enum: SURPRISE_EVENT_CATEGORIES },
                intensity: { type: 'string', enum: ['gentle', 'playful', 'dramatic', 'heated'] },
                hook: { type: 'string' },
                setup: { type: 'string' },
                opening_instruction: { type: 'string' },
                activities: {
                    type: 'array',
                    minItems: 3,
                    maxItems: 5,
                    items: { type: 'string' },
                },
                user_choice: { type: 'string' },
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

export {
    advanceRelationshipState,
    formatRelationshipStatePrompt,
    normalizeRelationshipState,
    relationshipStageFor,
} from './relationshipState.js';

const stripFence = (value: string) => value
    .replace(/^\s*```(?:json)?\s*/iu, '')
    .replace(/\s*```\s*$/u, '')
    .trim();

const extractFirstJsonObject = (value: string) => {
    const stripped = stripFence(value);
    const start = stripped.indexOf('{');
    if (start < 0) return stripped;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < stripped.length; index += 1) {
        const character = stripped[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === '"') inString = false;
            continue;
        }
        if (character === '"') inString = true;
        else if (character === '{') depth += 1;
        else if (character === '}' && --depth === 0) return stripped.slice(start, index + 1);
    }
    return stripped;
};

export const parseSurpriseEventProposal = (
    raw: string,
    validMemberIds: string[],
    fallbackMemberId: string,
): Omit<SurpriseEventProposal, 'id' | 'createdAt' | 'status'> | null => {
    try {
        const parsed = JSON.parse(extractFirstJsonObject(raw)) as Record<string, unknown>;
        const title = clean(parsed.title, 48);
        const hook = clean(parsed.hook, 180);
        const setup = clean(parsed.setup, 520);
        const openingInstruction = clean(parsed.opening_instruction, 900);
        const userChoice = clean(parsed.user_choice, 220);
        const activities = Array.from(new Set(
            (Array.isArray(parsed.activities) ? parsed.activities : [])
                .map(value => clean(value, 240))
                .filter(Boolean),
        )).slice(0, 5);
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
        )).slice(0, ROOM_PRESENT_MEMBER_LIMIT);
        if (involvedMemberIds.length === 0 && validIds.has(fallbackMemberId)) involvedMemberIds.push(fallbackMemberId);
        if (involvedMemberIds.length === 0) return null;
        const memberRoles: SurpriseEventMemberRole[] = [];
        const seenRoleIds = new Set<string>();
        (Array.isArray(parsed.member_roles) ? parsed.member_roles : []).forEach(value => {
            if (!value || typeof value !== 'object') return;
            const role = value as Record<string, unknown>;
            const memberId = typeof role.member_id === 'string' ? role.member_id.trim() : '';
            const objective = clean(role.objective, 180);
            const firstMove = clean(role.first_move, 240);
            if (!validIds.has(memberId) || seenRoleIds.has(memberId) || !objective || !firstMove) return;
            seenRoleIds.add(memberId);
            memberRoles.push({ memberId, objective, firstMove });
        });
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
            memberRoles: memberRoles.length > 0 ? memberRoles : undefined,
            activities: activities.length > 0 ? activities : undefined,
            userChoice: userChoice || undefined,
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

export const surpriseEventHasPlayableStructure = (
    event: Pick<SurpriseEventProposal, 'memberRoles' | 'userChoice'>,
    selectedMemberIds: string[],
) => {
    const selected = Array.from(new Set(selectedMemberIds.filter(Boolean)));
    const roles = event.memberRoles || [];
    if (!event.userChoice?.trim() || selected.length === 0 || roles.length !== selected.length) return false;
    const roleIds = new Set(roles.map(role => role.memberId));
    if (roleIds.size !== selected.length || !selected.every(id => roleIds.has(id))) return false;
    const firstMoves = roles.map(role => normalizedWords(role.firstMove));
    if (new Set(firstMoves).size !== firstMoves.length) return false;
    return roles.every(role => (
        role.objective.trim().length >= 6
        && role.firstMove.trim().length >= 8
        && !/^(?:等待|等候|配合|參與|有所行動|作出反應|看情況)/u.test(role.firstMove.trim())
    ));
};

const FALLBACK_ROLE_OBJECTIVES = [
    '揭開事件的核心觸發點',
    '確認時間、地點與現實限制',
    '提出一個不同而可執行的方向',
    '處理可能令事件中斷的風險',
    '整理分歧並把決定交回給你',
] as const;

const FALLBACK_EVENT_FIRST_MOVES: Record<SurpriseEventCategory, readonly string[]> = {
    idol_schedule: [
        '先攤開剛收到的突發行程，指出真正剩下的時間',
        '立即核對下一個工作節點，說清楚最遲何時必須離開',
        '提出一個能在空檔內立刻進行又不打亂當前場景的方案',
        '留意經理人或工作人員動向，主動處理被打斷的風險',
        '把兩個可立即執行的方案清楚放到你面前',
    ],
    backstage: [
        '先關上休息室的門，把剛發生的後台意外說清楚',
        '查看走廊動靜與下一個通告時間，報出可用的空檔',
        '提出一個利用這段後台空檔的不同做法',
        '主動處理門外工作人員或設備造成的中斷風險',
        '把先處理突發狀況或先跟進私人安排兩條路交給你選',
    ],
    public_spotlight: [
        '先用只有你看得懂的暗號指出鏡頭下的新變化',
        '快速確認媒體、粉絲與工作人員目前的位置',
        '提出一個不破壞公開身份又能回應你的辦法',
        '主動擋住最可能暴露秘密互動的視線或追問',
        '在不替你答應的前提下給出兩個清楚的回應方式',
    ],
    secret_escape: [
        '先交出集合方法或目的地線索，正式提出這次秘密出走',
        '確認可以離開多久以及必須避開的人和行程',
        '提出另一條路線或藏身安排，令計劃不只得一個方案',
        '主動留意追蹤、來電或被認出的風險',
        '把立即出發或先完成一項準備的選擇交給你',
    ],
    unexpected_guest: [
        '先對門外的聲音或突然現身的人作出具體反應',
        '確認來客身份、來意以及是否知道房內目前的情況',
        '提出接待、避開或直接問清楚來意的不同做法',
        '主動守住現場的重要物件、秘密或人物位置',
        '把是否開門以及由誰先應對的決定交給你',
    ],
    celebration: [
        '先揭開這次慶祝的具體理由以及已準備好的第一件事',
        '補充安排的時間、地點與不能錯過的細節',
        '拿出一個與原方案不同但同樣能立即進行的驚喜',
        '處理可能提早曝光或打斷慶祝的變數',
        '把先拆開驚喜或先聽她們說明的選擇交給你',
    ],
    travel: [
        '先指出交通、行李或路線究竟出了甚麼具體變化',
        '立即查清下一班交通與真正可用的等待時間',
        '提出一條能利用延誤時間的替代路線或附近去處',
        '主動照看行李、票證與可能再次變動的通知',
        '把繼續等候或採用替代方案的決定交給你',
    ],
    domestic: [
        '先找出家中突發狀況的明確來源並採取第一個處理動作',
        '檢查安全、工具與需要在甚麼時間前處理完成',
        '提出一個不離開當前空間也能推進事情的做法',
        '主動處理鄰居、維修人員或設備惡化的風險',
        '把先解決問題或先利用這段意外空檔的選擇交給你',
    ],
    emotional_turn: [
        '先讓那個一直隱藏的情緒破綻具體出現在你面前',
        '說清楚這份情緒由哪個當下細節觸發而不是憑空告白',
        '以自己的立場提出另一種理解，避免所有人只有同一反應',
        '主動阻止誤會被草率解決或被轉移話題',
        '把先追問真相或先給對方整理情緒的空間交給你決定',
    ],
    rivalry: [
        '先提出一條清楚的比較或挑戰規則，令競爭正式開始',
        '指出勝負如何判定以及甚麼行為不算數',
        '用與第一人不同的策略回應挑戰並表明自己想贏的原因',
        '主動看守公平或抓住可能改變勝負的意外變數',
        '把先接受哪一項挑戰或修改哪條規則的決定交給你',
    ],
    mystery: [
        '先把實物線索放到眾人看得見的位置並指出第一個異常',
        '核對線索上的時間、文字或來源，排除最明顯的誤讀',
        '提出一個與表面答案不同而且可以立即驗證的推測',
        '主動保管線索並留意是否有人正在觀察或干擾',
        '把先追查哪條線索的決定交給你而不提前揭開答案',
    ],
    fantasy: [
        '先明確宣布共同想像的世界、身份與第一條規則',
        '確認所有人仍知道這是想像層並保留返回現實的方法',
        '提出一個能立刻改變幻想場景但不取代原人格的行動',
        '主動帶入幻想世界的第一個阻礙或代價',
        '把選擇哪個身份或先探索哪個方向交給你決定',
    ],
};

export const buildFallbackSurpriseEventMemberRoles = (
    participants: Array<{ id: string; name: string }>,
    category: SurpriseEventCategory,
): SurpriseEventMemberRole[] => {
    const actions = FALLBACK_EVENT_FIRST_MOVES[category];
    return participants.slice(0, ROOM_PRESENT_MEMBER_LIMIT).map((participant, index) => ({
        memberId: participant.id,
        objective: FALLBACK_ROLE_OBJECTIVES[index] || `以 ${participant.name} 的立場推進事件`,
        firstMove: `${participant.name}${actions[index] || actions[actions.length - 1]}。`,
    }));
};

const FALLBACK_SHOW_ROLE_OBJECTIVES = [
    '擔任開場主持並啟動第一回合',
    '率先進行第一項成人挑戰',
    '把同一回合推進到加碼階段',
    '揭開本回合的隱藏規則',
    '收束開場並把關鍵選擇交給你',
] as const;

const FALLBACK_SHOW_FIRST_MOVES = [
    '走到節目中央，直接宣布第一回合並抽出開場題目',
    '接過第一張挑戰卡，當場選擇自己的參賽方式',
    '按下加碼燈，將本回合難度提升一級並點名下一位',
    '打開隱藏規則卡，把意外條件加入正在進行的回合',
    '拿起最終選擇牌，請你決定本回合的開始順序',
] as const;

export const buildFallbackSurpriseShowMemberRoles = (
    participants: Array<{ id: string; name: string }>,
): SurpriseEventMemberRole[] => participants.slice(0, ROOM_PRESENT_MEMBER_LIMIT).map((participant, index) => ({
    memberId: participant.id,
    objective: FALLBACK_SHOW_ROLE_OBJECTIVES[index] || `以 ${participant.name} 的風格參與本回合`,
    firstMove: `${participant.name}${FALLBACK_SHOW_FIRST_MOVES[index] || FALLBACK_SHOW_FIRST_MOVES.at(-1)}。`,
}));

const INTERACTIVE_SHOW_EVIDENCE = /節目|回合|挑戰|遊戲|賽制|主持|參賽|表演|舞台|抽牌|卡牌|show|round|challenge|game/iu;
const META_PLANNING_MOVE = /確認(?:時間|地點|限制)|提出(?:一個)?(?:不同|可執行)?(?:的)?方向|處理.{0,8}風險|整理分歧|重新協調|集合方式|路線|行程|準備工作/iu;

export const surpriseEventReadsLikeInteractiveShow = (
    event: Pick<SurpriseEventProposal, 'title' | 'hook' | 'setup' | 'memberRoles' | 'activities'>,
) => (
    INTERACTIVE_SHOW_EVIDENCE.test(`${event.title}\n${event.hook}\n${event.setup}\n${event.activities?.join('\n') || ''}`)
    && Boolean(event.memberRoles?.length)
    && event.memberRoles!.every(role => !META_PLANNING_MOVE.test(`${role.objective}\n${role.firstMove}`))
);

const SPECIFIC_ACTIVITY_ACTION = /抽|回答|朗讀|指定|選擇|配對|交換|表演|示範|投票|評分|計時|完成|揭曉|即興|挑選|宣佈|寫下|猜測|模仿|演出|加入|按下|輪流|依次|倒數|限時|說出|使用|展示|穿上|脫下|戴上|解開|靠近|移動|觸碰|親吻|撫摸/iu;
const SPECIFIC_ACTIVITY_MECHANIC = /(?:\d+|[一二三四五六七八九十]+)(?:秒|分鐘|回合|次)|卡牌?|題目|道具|計時|配對|順序|評分|投票|得分|淘汰|加碼|懲罰|獎勵/iu;
const VAGUE_ACTIVITY_ONLY = /^(?:進行|完成|展開|參與|接受|提出)?\s*(?:一項|一個|不同的)?\s*(?:成人|18\+|NSFW|性|親密|互動)?\s*(?:活動|挑戰|遊戲|節目|任務)\s*[。.!！]?$/iu;

export const surpriseEventHasSpecificActivities = (
    event: Pick<SurpriseEventProposal, 'activities'>,
) => {
    const activities = event.activities || [];
    const normalized = activities.map(activity => normalizedWords(activity));
    return activities.length >= 3
        && new Set(normalized).size === activities.length
        && activities.every(activity => (
            activity.trim().length >= 12
            && (SPECIFIC_ACTIVITY_ACTION.test(activity) || SPECIFIC_ACTIVITY_MECHANIC.test(activity))
            && !VAGUE_ACTIVITY_ONLY.test(activity.trim())
        ));
};

const eventText = (event: Pick<SurpriseEventProposal, 'title' | 'hook' | 'setup'>) =>
    `${event.title}\n${event.hook}\n${event.setup}`;

const EXPLICIT_ADULT_EVENT_SIGNAL = /18\+|nsfw|成人情趣|性愛|性交|性行為|情慾|慾望|裸體|全裸|脫衣|內衣|口交|乳房|陰莖|陰蒂|陰道|肛交|高潮|體位|情趣用品|束縛|調教/iu;

export const surpriseEventMatchesContentMode = (
    event: Pick<SurpriseEventProposal, 'title' | 'hook' | 'setup' | 'openingInstruction'>,
    mode: SurpriseEventContentMode,
) => {
    const text = `${eventText(event)}\n${event.openingInstruction}`;
    return mode === 'nsfw'
        ? EXPLICIT_ADULT_EVENT_SIGNAL.test(text)
        : !EXPLICIT_ADULT_EVENT_SIGNAL.test(text);
};

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

export {
    getSurpriseEventCategoryLabel,
    getSurpriseEventIntensityLabel,
} from './surpriseEventPresentation.js';

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
        involvedMemberIds: Array.from(new Set(involvedMemberIds.filter(Boolean))).slice(0, ROOM_PRESENT_MEMBER_LIMIT).length > 0
            ? Array.from(new Set(involvedMemberIds.filter(Boolean))).slice(0, ROOM_PRESENT_MEMBER_LIMIT)
            : [memberId],
        relationshipEffect: { closeness: 2, trust: 1, romanticTension: 2, initiative: 2 },
    };
};
