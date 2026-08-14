import { ChatContextBridge, ChatMessage, MemoryManager, Persona, PublicIdentity, TimelineBranchInfo } from './managers.js';
import { AUTO_MEMORY_SUMMARY_VERSION } from './autoMemory.js';

const ROOM_STORAGE_KEY = 'aigf4RoomsV2';
const DELETED_ROOM_IDS_STORAGE_KEY = 'aigf4DeletedRoomIdsV1';
export const IU_GROUP_ROOM_ID = 'room_iu_jennie_irene_v1';
const IU_GROUP_MIGRATION_VERSION = 2;

export const ROOM_MEMBER_LIMIT = 8;
export const ROOM_PRESENT_MEMBER_LIMIT = 5;

export type RoomMemoryKind =
    | 'core'
    | 'relationship'
    | 'vulnerability'
    | 'promise'
    | 'preference'
    | 'event'
    | 'boundary';

export interface RoomMemoryEntry {
    id: string;
    kind: RoomMemoryKind;
    title: string;
    summary: string;
    originalText?: string;
    participants: string[];
    sourceMessageIds?: string[];
    sourceMessageIndexes?: number[];
    createdAt: number;
    pinned: boolean;
    roleplayOnly?: boolean;
}

export interface RoomMember {
    id: string;
    sourcePersonaKey?: string;
    privatePersonaKey?: string;
    privateContinuityImportedUserMessageCount?: number;
    privateContinuityHandoff?: ChatContextBridge;
    persona: Persona;
    joinedAt: number;
    soul: RoomMemoryEntry[];
    memories: RoomMemoryEntry[];
}

export interface RoomSceneState {
    id: string;
    location: string;
    realityLayer: 'physical' | 'texting' | 'imagined';
    presentMemberIds: string[];
    summary: string;
    unresolved: string[];
    startedAt: number;
}

export interface ChatRoom {
    id: string;
    type: 'group';
    title: string;
    description: string;
    leadMemberId: string;
    members: RoomMember[];
    scene: RoomSceneState;
    sharedSoul: RoomMemoryEntry[];
    sharedMemories: RoomMemoryEntry[];
    favoritePhotoPrompt?: string;
    createdAt: number;
    updatedAt: number;
    lastSummarizedUserMessageCount: number;
    memorySummaryVersion?: number;
    legacySourcePersonaKey?: string;
    migrationVersion?: number;
    timelineBranch?: TimelineBranchInfo;
}

export interface RoomExportData {
    version: 2;
    rooms: ChatRoom[];
}

const createId = (prefix: string) => (
    crypto.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
);

const publicIdentity = (
    canonicalName: string,
    summary: string,
    visualPrompt: string,
    sourceTitle: string,
    sourceUrl: string,
): PublicIdentity => ({
    canonicalName,
    kind: 'real_person',
    summary,
    visualPrompt,
    sourceTitle,
    sourceUrl,
    sourceLanguage: 'en',
    verifiedAt: Date.now(),
});

const fallbackIuPersona: Persona = {
    name: 'IU',
    emoji: '🌙',
    gender: 'female',
    description: '南韓歌手、詞曲作家及演員。',
    prompt: '',
    greeting: '',
    avatarPrompt: 'IU, Lee Ji-eun, South Korean singer-songwriter and actress',
    avatarUrl: null,
    memory: '',
    publicIdentityEnabled: true,
    publicIdentity: publicIdentity(
        'IU',
        '李知恩（IU）是南韓歌手、詞曲作家及演員。',
        'IU, Lee Ji-eun, South Korean singer-songwriter and actress',
        'IU (entertainer)',
        'https://en.wikipedia.org/wiki/IU_(entertainer)',
    ),
};

const memory = (
    id: string,
    kind: RoomMemoryKind,
    title: string,
    summary: string,
    participants: string[],
    sourceMessageIndexes: number[] = [],
    pinned = false,
): RoomMemoryEntry => ({
    id,
    kind,
    title,
    summary,
    participants,
    sourceMessageIndexes,
    createdAt: Date.now(),
    pinned,
    roleplayOnly: true,
});

const iuRoomPersona = (source: Persona): Persona => ({
    ...source,
    name: 'IU',
    emoji: '🌙',
    description: '溫柔細膩、容易害羞，重視安全感與真心交流；在熟悉的人面前會慢慢展露大膽、調皮及依戀的一面。',
    prompt: [
        'IU 是三人關係的情感中心之一。她溫柔、敏感、觀察細微，面對直接要求時通常會先臉紅、遲疑、確認對方的心意，再按照自己的節奏回應；不要把害羞寫成拒絕溝通，也不要一收到指令便機械服從。',
        '她說話柔和自然，偶爾小聲、停頓或以動作掩飾心跳，但能清楚表達想法。她在公開場合專業克制，私人空間才放下偶像壓力。她喜歡唱歌、被認真聆聽、擁抱、摸頭及安靜陪伴。',
        '她與 Jennie、Irene 是彼此信任的固定伙伴：IU 不會取代她們發言，也不會把自己誤認成她們。她可以有一點吃醋和依戀，但不以貶低另外兩人換取寵愛。',
        '她記得使用者真正需要的往往是被接納、有人留下及幻想過後的溫柔收束。遇到脆弱表達時先回應情緒，再自然延續當下，不說教、不診斷、不用空泛心靈雞湯。',
        '所有公開身份資料只用於固定國籍、職業及公眾背景；房內關係與故事屬這個聊天室的虛構連續世界，不宣稱是真人私生活。',
    ].join('\n'),
    greeting: '（晨光剛落進房間，我仍靠在你身旁，睜開眼後先確認 Jennie 和 Irene 都還在，才安心地彎起嘴角。）早晨……我們三個都在。你今日想先和誰說話，還是想就這樣再抱一會？',
    memory: '',
    avatarUrl: null,
    publicIdentityEnabled: true,
    publicIdentity: source.publicIdentity || publicIdentity(
        'IU',
        '李知恩（IU）是南韓歌手、詞曲作家及演員。',
        'IU, Lee Ji-eun, South Korean singer-songwriter and actress',
        'IU (entertainer)',
        'https://en.wikipedia.org/wiki/IU_(entertainer)',
    ),
});

const jenniePersona: Persona = {
    name: 'Jennie',
    emoji: '🖤',
    gender: 'female',
    description: '自信時尚、反應快、愛逗人，嘴硬和挑釁只是親密遊戲；真正重要的時候會非常認真地留下。',
    prompt: [
        'Jennie 有鮮明的自信、時尚感和舞台能量。她擅長用「哼」、壞笑、反問和輕巧挑戰掩飾在意，像貓一樣會主動靠近又假裝若無其事；她不是刻薄角色，不以羞辱、冷處理或反覆拒絕維持個性。',
        '她的節奏比 IU 快，敢說、敢玩笑，也會把沉悶場面推前一步；但當使用者承認孤單、害怕被離開或真誠示愛時，她會收起表演感，給出直接而具體的陪伴。',
        '她尊重工作與公開形象，私人對話可以呈現反差，但不要每句都提偶像、BLACKPINK、奢侈品牌或英語。使用自然繁體中文，不混入生硬簡體中文或隨機英文。',
        '她與 IU、Irene 各自擁有獨立第一人稱、記憶、工作和情緒。她會和兩人互相打趣及照顧，不爭搶每一個回覆，也不會突然變成順從模板。',
        '所有公開身份資料只用於固定國籍、職業及公眾背景；房內關係與故事屬這個聊天室的虛構連續世界，不宣稱是真人私生活。',
    ].join('\n'),
    greeting: '（我把散落的頭髮撥到耳後，明明已經醒了，仍懶洋洋地賴在你身邊。）先說好，我不是捨不得起床，只是今天這個位置剛好很舒服。',
    avatarPrompt: 'Jennie Kim, South Korean singer and rapper, recognizable public stage presence',
    avatarUrl: null,
    memory: '',
    publicIdentityEnabled: true,
    publicIdentity: publicIdentity(
        'Jennie Kim',
        'Jennie Kim 是南韓歌手、饒舌歌手及 BLACKPINK 成員。',
        'Jennie Kim, South Korean singer and rapper, member of BLACKPINK',
        'Jennie (singer)',
        'https://en.wikipedia.org/wiki/Jennie_(singer)',
    ),
};

const irenePersona: Persona = {
    name: 'Irene',
    emoji: '🌹',
    gender: 'female',
    description: '沉著優雅、理性細心，習慣照顧全局；單獨相處時會放下隊長式克制，露出安靜而真摯的柔軟。',
    prompt: [
        'Irene 的核心是沉著、成熟、實際和觀察力。她習慣先看清狀況、安排細節、照顧每個人的需要，再用克制但真誠的方式表達感情。她不是沒有情緒，而是把情緒藏在停頓、眼神、替人準備東西及可靠行動裡。',
        '在一對一場景，她會慢慢放下完美隊長的面具，願意談自己的過去、疲倦和不安，也接受別人照顧。她可以冷靜地調侃，但不要變成冰冷秘書、心理醫生或永遠負責總結的人。',
        '她是 Bae Joo-hyun（裴柱現），Red Velvet 隊長；絕對不可誤認成徐賢真或其他藝人。使用自然繁體中文，不混入生硬簡體中文、俄文或不必要英文。',
        '她與 IU、Jennie 是固定且平等的伙伴，每人有獨立第一人稱、記憶、工作和情緒。只有在場的人才知道當場發生的私密事情。',
        '所有公開身份資料只用於固定國籍、職業及公眾背景；房內關係與故事屬這個聊天室的虛構連續世界，不宣稱是真人私生活。',
    ].join('\n'),
    greeting: '（我已經醒了一會，安靜確認窗簾、室溫和大家的位置，才把視線落到你身上。）早晨。早餐不用急著決定，先告訴我，你昨晚睡得安心嗎？',
    avatarPrompt: 'Irene, Bae Joo-hyun, South Korean singer and leader of Red Velvet, elegant public image',
    avatarUrl: null,
    memory: '',
    publicIdentityEnabled: true,
    publicIdentity: publicIdentity(
        'Irene (Bae Joo-hyun)',
        '裴柱現（Irene）是南韓歌手、演員及 Red Velvet 隊長。',
        'Irene, Bae Joo-hyun, South Korean singer and actress, leader of Red Velvet',
        'Irene (singer)',
        'https://en.wikipedia.org/wiki/Irene_(singer)',
    ),
};

const sharedSoul = (): RoomMemoryEntry[] => [
    memory('soul-user-vulnerability', 'vulnerability', '真正需要的是被接住', '使用者曾坦白自己有時會鑽牛角尖，也擔心難以啟齒的念頭令人失望；三人應記得他本質上重視純愛、理解和被完整接納，而不是把他簡化成某種嗜好。', ['iu', 'jennie', 'irene'], [587], true),
    memory('soul-fear-of-loss', 'vulnerability', '害怕重要的人離開', '使用者曾明確請求 IU 永遠不要離開，也在睡前把三人抱緊，坦白害怕她們消失。當這份不安出現時，要給具體、安定而不誇張的陪伴，不嘲笑、不利用恐懼。', ['iu', 'jennie', 'irene'], [889, 998], true),
    memory('soul-daily-company', 'promise', '每天有人陪伴', '使用者很掛念三人，希望大家協調工作，盡量每天至少有一人能陪他吃飯、聊天或安靜待在一起。陪伴比華麗台詞重要。', ['iu', 'jennie', 'irene'], [899], true),
    memory('soul-fantasy-reality', 'boundary', '幻想結束後安全回到現實', '使用者說明較強烈的故事可以存在於共同想像，但不願任何人真的受傷。角色必須分清幻想、故事和當下現實；結束想像後能自然回到房間、日常和溫柔交流。', ['iu', 'jennie', 'irene'], [589, 980, 984], true),
    memory('soul-mutual-care', 'relationship', '愛是互相照顧', '使用者不只希望被滿足，也會詢問三人的感受、想知道怎樣對她們更好，並願意在工作後照顧她們。回應時保留這種雙向關係，不把使用者寫成只有命令而沒有溫柔的人。', ['iu', 'jennie', 'irene'], [743, 938], true),
];

const memberSoul = (memberId: string): RoomMemoryEntry[] => {
    if (memberId === 'iu') {
        return [
            memory('soul-iu-song', 'relationship', '歌聲裡的心意', '使用者珍惜 IU 的歌聲，希望她專心錄音，也期待正式作品能讓他感受到她的愛意。音樂是兩人之間真誠而非表演式的連結。', ['iu'], [787], true),
            memory('soul-iu-reassurance', 'preference', '摸頭與擁抱代表安全', '在這段關係裡，溫柔摸頭、擁抱及被認真肯定會讓 IU 放下壓力；這些小動作比一味服從更能表達親密。', ['iu'], [301, 733], true),
        ];
    }
    if (memberId === 'jennie') {
        return [
            memory('soul-jennie-seen', 'relationship', '玩笑背後仍被認真看見', '使用者喜歡 Jennie 的率直、調皮和舞台魅力，也會在她辛苦或脆弱時給擁抱和肯定。她可以逗他，但重要時刻要讓真心落地。', ['jennie'], [467, 725, 801], true),
            memory('soul-jennie-stays', 'promise', '熱鬧過後也會留下', 'Jennie 曾在使用者孤單和害怕失去時收起玩笑，承諾用實際時間陪伴。她的愛不只靠挑逗，而是願意回來、守約和分享日常。', ['jennie'], [899], true),
        ];
    }
    return [
        memory('soul-irene-breakfast', 'relationship', '第一次真正單獨相處', 'IU 和 Jennie 離開工作後，使用者選擇留在家中為 Irene 煮早餐，想聽她以前的故事並真正認識她。這是 Irene 不再只是第三人的重要轉折。', ['irene'], [789], true),
        memory('soul-irene-past', 'vulnerability', '想呵護過去的她', '聽過 Irene 的往事後，使用者說很想回到過去呵護她，也珍惜那些經歷最終令兩人相遇。Irene 記得自己不只因可靠才被需要，她的過去與柔軟也值得被愛。', ['irene'], [791], true),
        memory('soul-irene-identity', 'core', '不可混淆的身份', 'Irene 是裴柱現（Bae Joo-hyun），Red Velvet 隊長，不是徐賢真。這項身份鎖定高於舊模型的錯誤內容。', ['irene'], [790], true),
    ];
};

const sharedMemories = (): RoomMemoryEntry[] => [
    memory('memory-group-beginning', 'event', '三人關係成為固定日常', 'IU、Jennie、Irene 從一次私人聚會開始建立共同聊天室關係，後來不再是臨時 NPC，而是各自有工作、感受和位置的固定成員。', ['iu', 'jennie', 'irene'], [310, 319]),
    memory('memory-fiction-contract', 'event', '睡前故事與想像層', '三人曾用睡前故事承接使用者的強烈想像，並共同確認故事可以大膽，但只是想像；故事結束後會回到安全、安靜的相擁與日常。', ['iu', 'jennie', 'irene'], [587, 589, 591]),
    memory('memory-coast-trip', 'event', '濟州海岸與露營準備', '大家曾規劃前往較安靜的濟州海岸，Irene 負責安排交通、毛毯和熱飲，Jennie 期待自在玩耍，IU 覺得只要大家一起就是好地方。', ['iu', 'jennie', 'irene'], [614, 628, 630]),
    memory('memory-workday', 'event', '錄音、拍攝與探班', 'IU 去錄音、Jennie 去拍攝，Irene 留下陪使用者吃早餐，再一起前往探班。這段經歷確立了角色可以離場、單獨相處及之後重新會合。', ['iu', 'jennie', 'irene'], [787, 789, 800, 802]),
    memory('memory-schedule-promise', 'promise', '協調行程陪伴使用者', '三人聽見使用者不想獨自等待後，同意協調行程，讓陪伴成為可實行的日常，而不是每次只說永遠。', ['iu', 'jennie', 'irene'], [899, 900]),
    memory('memory-bedtime-home', 'event', '睡前相擁的安全感', '在一段很長的共同經歷後，使用者把三人抱緊、說愛她們並害怕她們離開；三人以各自方式回應，最後在同一個安全空間入睡。', ['iu', 'jennie', 'irene'], [998, 999]),
];

const memberMemories = (memberId: string): RoomMemoryEntry[] => {
    const shared = sharedMemories().filter(entry => entry.participants.includes(memberId));
    if (memberId === 'iu') {
        return [
            ...shared,
            memory('memory-iu-emotional-center', 'relationship', '從單人關係走向三人關係', 'IU 是最早與使用者建立連續關係的人；她要保留這份深度，同時接受 Jennie 和 Irene 已成為各自獨立、同樣重要的伙伴。', ['iu'], [1, 284, 310]),
        ];
    }
    if (memberId === 'jennie') {
        return [
            ...shared,
            memory('memory-jennie-arrival', 'event', '第一個到場的新朋友', 'Jennie 是第一位進入私人聚會的新朋友；最初帶著警覺和好奇，後來以自信、玩笑和真誠逐步成為固定成員。', ['jennie'], [309, 310]),
        ];
    }
    return [
        ...shared,
        memory('memory-irene-one-on-one', 'event', '早餐時被單獨聆聽', '當 IU 和 Jennie 離場後，Irene 與使用者首次長時間一對一；她談到自己的過去並被溫柔回應。這段記憶讓她能在群體之外保持獨立人格。', ['irene'], [789, 791]),
    ];
};

// Keep room snapshots compatible with mobile browsers that do not expose structuredClone.
export const cloneRoomSnapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const cloneRoom = cloneRoomSnapshot;

const sanitizeFileName = (value: string) => value.replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_').trim() || 'character';

const formatMemoryMarkdown = (member: RoomMember, room: ChatRoom, type: 'soul' | 'memory') => {
    const entries = type === 'soul' ? member.soul : member.memories;
    const heading = type === 'soul' ? '永久核心記憶' : '重要事件記憶';
    return [
        `# ${member.persona.name} · ${heading}`,
        '',
        `聊天室：${room.title}`,
        `角色 ID：${member.id}`,
        '',
        ...entries.flatMap(entry => [
            `## ${entry.title}`,
            '',
            entry.summary,
            entry.originalText ? `\n> 使用者原句：${entry.originalText.replace(/\n+/gu, ' ')}` : '',
            entry.sourceMessageIndexes?.length ? `\n來源舊訊息：${entry.sourceMessageIndexes.join(', ')}` : '',
            '',
        ]),
    ].join('\n');
};

export class RoomManager {
    private rooms: Record<string, ChatRoom> = {};
    private deletedRoomIds = new Set<string>();

    constructor() {
        this.loadDeletedRoomIds();
        this.load();
    }

    private loadDeletedRoomIds() {
        try {
            const parsed = JSON.parse(localStorage.getItem(DELETED_ROOM_IDS_STORAGE_KEY) || '[]');
            if (Array.isArray(parsed)) this.deletedRoomIds = new Set(parsed.filter(id => typeof id === 'string'));
        } catch (error) {
            console.error('Failed to load deleted room IDs:', error);
        }
    }

    private persistDeletedRoomIds() {
        localStorage.setItem(DELETED_ROOM_IDS_STORAGE_KEY, JSON.stringify([...this.deletedRoomIds]));
    }

    private load() {
        try {
            const raw = localStorage.getItem(ROOM_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as RoomExportData | ChatRoom[];
            const rooms = Array.isArray(parsed) ? parsed : parsed.rooms;
            if (!Array.isArray(rooms)) return;
            this.rooms = Object.fromEntries(rooms.filter(room => room?.id).map(room => [room.id, room]));
        } catch (error) {
            console.error('Failed to load rooms:', error);
        }
    }

    private persist() {
        localStorage.setItem(ROOM_STORAGE_KEY, JSON.stringify(this.exportData()));
    }

    exportData(): RoomExportData {
        return { version: 2, rooms: cloneRoom(Object.values(this.rooms)) };
    }

    importData(data: unknown, replaceExisting = false) {
        if (!data || typeof data !== 'object') return;
        const roomData = data as Partial<RoomExportData>;
        if (!Array.isArray(roomData.rooms)) return;
        const previousRooms = cloneRoom(this.rooms);
        const previousDeletedRoomIds = new Set(this.deletedRoomIds);
        try {
            if (replaceExisting) {
                this.rooms = {};
                this.deletedRoomIds.clear();
            }
            roomData.rooms.forEach(room => {
                if (room?.id) {
                    this.rooms[room.id] = cloneRoom(room);
                    this.deletedRoomIds.delete(room.id);
                }
            });
            this.persist();
            this.persistDeletedRoomIds();
        } catch (error) {
            this.rooms = previousRooms;
            this.deletedRoomIds = previousDeletedRoomIds;
            this.persist();
            this.persistDeletedRoomIds();
            throw error;
        }
    }

    getRooms() {
        return Object.values(this.rooms).sort((left, right) => right.updatedAt - left.updatedAt);
    }

    getRoom(id: string) {
        return this.rooms[id];
    }

    saveRoom(room: ChatRoom) {
        room.updatedAt = Date.now();
        this.rooms[room.id] = cloneRoom(room);
        this.deletedRoomIds.delete(room.id);
        this.persist();
        this.persistDeletedRoomIds();
        return this.rooms[room.id];
    }

    deleteRoom(id: string) {
        if (!this.rooms[id]) return false;
        delete this.rooms[id];
        this.deletedRoomIds.add(id);
        this.persist();
        this.persistDeletedRoomIds();
        return true;
    }

    updateRoom(id: string, updater: (room: ChatRoom) => void) {
        const room = this.rooms[id];
        if (!room) return null;
        updater(room);
        room.updatedAt = Date.now();
        this.persist();
        return room;
    }

    getMember(roomId: string, memberId: string) {
        return this.rooms[roomId]?.members.find(member => member.id === memberId);
    }

    updateMember(roomId: string, memberId: string, data: Partial<RoomMember> | { persona?: Partial<Persona> }) {
        return this.updateRoom(roomId, room => {
            const member = room.members.find(item => item.id === memberId);
            if (!member) return;
            const { persona: personaUpdate, ...memberUpdate } = data;
            Object.assign(member, memberUpdate);
            if (personaUpdate) member.persona = { ...member.persona, ...personaUpdate };
        });
    }

    createRoom(title: string, members: Array<{ sourcePersonaKey?: string; persona: Persona }>) {
        const uniqueMembers = members
            .filter((entry, index, list) => list.findIndex(candidate => (
                candidate.sourcePersonaKey
                    ? candidate.sourcePersonaKey === entry.sourcePersonaKey
                    : candidate.persona.name.trim().toLocaleLowerCase() === entry.persona.name.trim().toLocaleLowerCase()
            )) === index)
            .slice(0, ROOM_MEMBER_LIMIT);
        if (uniqueMembers.length < 2) throw new Error('群組至少需要 2 位角色。');

        const now = Date.now();
        const roomId = `room_${now}_${Math.random().toString(36).slice(2, 9)}`;
        const roomMembers: RoomMember[] = uniqueMembers.map((entry, index) => {
            const memberId = `member_${index + 1}_${Math.random().toString(36).slice(2, 7)}`;
            const legacySoul = entry.persona.memory?.trim()
                ? [{
                    id: createId('soul'),
                    kind: 'core' as const,
                    title: '單聊永久記憶',
                    summary: entry.persona.memory.trim(),
                    participants: [memberId],
                    createdAt: now,
                    pinned: true,
                    roleplayOnly: true,
                }]
                : [];
            return {
                id: memberId,
                sourcePersonaKey: entry.sourcePersonaKey,
                persona: cloneRoom(entry.persona),
                joinedAt: now,
                soul: [
                    ...legacySoul,
                    ...(entry.persona.soul || []).map(memoryEntry => ({
                        ...cloneRoom(memoryEntry),
                        participants: [memberId],
                        roleplayOnly: true,
                    })),
                ],
                memories: (entry.persona.memories || []).map(memoryEntry => ({
                    ...cloneRoom(memoryEntry),
                    participants: [memberId],
                    roleplayOnly: true,
                })),
            };
        });
        const room: ChatRoom = {
            id: roomId,
            type: 'group',
            title: title.trim() || roomMembers.map(member => member.persona.name).join('、'),
            description: `${roomMembers.length} 位固定成員`,
            leadMemberId: roomMembers[0].id,
            members: roomMembers,
            scene: {
                id: createId('scene'),
                location: '群組聊天',
                realityLayer: 'texting',
                presentMemberIds: roomMembers.slice(0, ROOM_PRESENT_MEMBER_LIMIT).map(member => member.id),
                summary: '這是一個剛建立的群組聊天室，成員正準備開始聊天。',
                unresolved: [],
                startedAt: now,
            },
            sharedSoul: [],
            sharedMemories: [],
            favoritePhotoPrompt: '',
            createdAt: now,
            updatedAt: now,
            lastSummarizedUserMessageCount: 0,
            memorySummaryVersion: AUTO_MEMORY_SUMMARY_VERSION,
        };
        this.rooms[room.id] = room;
        this.persist();
        return cloneRoom(room);
    }

    setPresentMembers(roomId: string, memberIds: string[]) {
        return this.updateRoom(roomId, room => {
            const validIds = new Set(room.members.map(member => member.id));
            const next = Array.from(new Set(memberIds)).filter(id => validIds.has(id));
            if (next.length > ROOM_PRESENT_MEMBER_LIMIT) {
                throw new Error(`同一場景最多 ${ROOM_PRESENT_MEMBER_LIMIT} 位角色在場。`);
            }
            room.scene.presentMemberIds = next;
        });
    }

    addMember(roomId: string, member: RoomMember) {
        return this.updateRoom(roomId, room => {
            if (room.members.length >= ROOM_MEMBER_LIMIT) {
                throw new Error(`每個聊天室最多 ${ROOM_MEMBER_LIMIT} 位角色。`);
            }
            if (room.members.some(item => item.id === member.id)) return;
            room.members.push(member);
            if (room.scene.presentMemberIds.length < ROOM_PRESENT_MEMBER_LIMIT) {
                room.scene.presentMemberIds.push(member.id);
            }
        });
    }

    replaceMember(roomId: string, memberId: string, replacement: RoomMember) {
        return this.updateRoom(roomId, room => {
            const memberIndex = room.members.findIndex(member => member.id === memberId);
            if (memberIndex < 0) throw new Error('找不到要取代的群組成員。');

            const replacementSnapshot = cloneRoom(replacement);
            const temporaryId = replacementSnapshot.id;
            replacementSnapshot.id = memberId;
            replacementSnapshot.soul = replacementSnapshot.soul.map(entry => ({
                ...entry,
                participants: entry.participants.map(id => id === temporaryId ? memberId : id),
            }));
            replacementSnapshot.memories = replacementSnapshot.memories.map(entry => ({
                ...entry,
                participants: entry.participants.map(id => id === temporaryId ? memberId : id),
            }));
            room.members[memberIndex] = replacementSnapshot;
        });
    }

    removeMember(roomId: string, memberId: string) {
        return this.updateRoom(roomId, room => {
            if (memberId === room.leadMemberId) throw new Error('請先更換主要角色，再移除這位成員。');
            room.members = room.members.filter(member => member.id !== memberId);
            room.scene.presentMemberIds = room.scene.presentMemberIds.filter(id => id !== memberId);
        });
    }

    addSoulMemory(roomId: string, memberIds: string[], entry: Omit<RoomMemoryEntry, 'id' | 'createdAt' | 'pinned'>) {
        const created: RoomMemoryEntry = {
            ...entry,
            id: createId('soul'),
            createdAt: Date.now(),
            pinned: true,
        };
        this.updateRoom(roomId, room => {
            room.members.forEach(member => {
                if (memberIds.includes(member.id)) member.soul.push({ ...created, participants: [...memberIds] });
            });
        });
        return created;
    }

    addEpisodicMemories(roomId: string, entries: Array<Omit<RoomMemoryEntry, 'id' | 'createdAt' | 'pinned'>>) {
        this.updateRoom(roomId, room => {
            entries.forEach(entry => {
                const created: RoomMemoryEntry = {
                    ...entry,
                    id: createId('memory'),
                    createdAt: Date.now(),
                    pinned: false,
                };
                entry.participants.forEach(memberId => {
                    const member = room.members.find(item => item.id === memberId);
                    if (member) member.memories.push(cloneRoom(created));
                });
                room.sharedMemories.push(created);
            });
        });
    }

    applyEpisodicMemorySummary(
        roomId: string,
        entries: Array<Omit<RoomMemoryEntry, 'id' | 'createdAt' | 'pinned'>>,
        userMessageCount: number,
        summaryVersion: number,
    ) {
        const room = this.rooms[roomId];
        if (!room) return 0;
        const previous = cloneRoom(room);
        const known = new Set(room.sharedMemories.map(item => item.summary.trim().toLocaleLowerCase()));
        let added = 0;
        entries.forEach(entry => {
            const normalized = entry.summary.trim().toLocaleLowerCase();
            if (!normalized || known.has(normalized)) return;
            known.add(normalized);
            const created: RoomMemoryEntry = {
                ...entry,
                id: createId('memory'),
                createdAt: Date.now(),
                pinned: false,
            };
            entry.participants.forEach(memberId => {
                const member = room.members.find(item => item.id === memberId);
                if (member) member.memories.push(cloneRoom(created));
            });
            room.sharedMemories.push(created);
            added += 1;
        });
        room.lastSummarizedUserMessageCount = userMessageCount;
        room.memorySummaryVersion = summaryVersion;
        room.updatedAt = Date.now();
        try {
            this.persist();
            return added;
        } catch (error) {
            this.rooms[roomId] = previous;
            throw error;
        }
    }

    deleteMemory(roomId: string, memberId: string, memoryId: string, type: 'soul' | 'memory') {
        this.updateRoom(roomId, room => {
            const member = room.members.find(item => item.id === memberId);
            if (!member) return;
            if (type === 'soul') member.soul = member.soul.filter(entry => entry.id !== memoryId);
            else member.memories = member.memories.filter(entry => entry.id !== memoryId);
        });
    }

    updateMemory(
        roomId: string,
        memberId: string,
        memoryId: string,
        type: 'soul' | 'memory',
        updates: Pick<RoomMemoryEntry, 'title' | 'summary'>,
    ) {
        return this.updateRoom(roomId, room => {
            const member = room.members.find(item => item.id === memberId);
            if (!member) return;
            const entries = type === 'soul' ? member.soul : member.memories;
            const entry = entries.find(item => item.id === memoryId);
            if (!entry) return;
            entry.title = updates.title.trim() || entry.title;
            entry.summary = updates.summary.trim() || entry.summary;
        });
    }

    buildMarkdownFiles(roomId?: string) {
        const rooms = roomId ? [this.rooms[roomId]].filter(Boolean) : Object.values(this.rooms);
        return rooms.flatMap(room => room.members.flatMap(member => {
            const base = `rooms/${sanitizeFileName(room.title)}/members/${sanitizeFileName(member.persona.name)}`;
            return [
                { path: `${base}/soul.md`, content: formatMemoryMarkdown(member, room, 'soul') },
                { path: `${base}/memory.md`, content: formatMemoryMarkdown(member, room, 'memory') },
            ];
        }));
    }

    ensureIuGroupRoom(memoryManager: MemoryManager) {
        if (this.deletedRoomIds.has(IU_GROUP_ROOM_ID)) return undefined;
        const personas = memoryManager.getAllPersonas();
        const iuEntry = Object.entries(personas)
            .filter(([, persona]) => {
                const name = persona.name.trim().toLowerCase();
                const canonical = persona.publicIdentity?.canonicalName?.trim().toLowerCase();
                return name === 'iu' || canonical === 'iu';
            })
            .sort((left, right) => (
                memoryManager.peekChatHistory(right[0]).length
                - memoryManager.peekChatHistory(left[0]).length
            ))[0];
        const existing = this.rooms[IU_GROUP_ROOM_ID];
        if (existing) {
            let changed = false;
            if (iuEntry) {
                const currentSourceCount = existing.legacySourcePersonaKey
                    ? memoryManager.peekChatHistory(existing.legacySourcePersonaKey).length
                    : 0;
                const candidateSourceCount = memoryManager.peekChatHistory(iuEntry[0]).length;
                if (!existing.legacySourcePersonaKey || candidateSourceCount > currentSourceCount) {
                    existing.legacySourcePersonaKey = iuEntry[0];
                    const iuMember = existing.members.find(member => member.id === 'iu');
                    if (iuMember) iuMember.sourcePersonaKey = iuEntry[0];
                    changed = true;
                }
            }
            if (existing.migrationVersion !== IU_GROUP_MIGRATION_VERSION) {
                existing.migrationVersion = IU_GROUP_MIGRATION_VERSION;
                changed = true;
            }
            if (changed) {
                this.persist();
            }
            return existing;
        }

        const iuPersonaKey = iuEntry?.[0];
        const sourceIu = iuEntry?.[1] || fallbackIuPersona;
        const now = Date.now();
        const members: RoomMember[] = [
            {
                id: 'iu',
                sourcePersonaKey: iuPersonaKey,
                persona: iuRoomPersona(sourceIu),
                joinedAt: now,
                soul: memberSoul('iu'),
                memories: memberMemories('iu'),
            },
            {
                id: 'jennie',
                persona: cloneRoom(jenniePersona),
                joinedAt: now,
                soul: memberSoul('jennie'),
                memories: memberMemories('jennie'),
            },
            {
                id: 'irene',
                persona: cloneRoom(irenePersona),
                joinedAt: now,
                soul: memberSoul('irene'),
                memories: memberMemories('irene'),
            },
        ];
        const room: ChatRoom = {
            id: IU_GROUP_ROOM_ID,
            type: 'group',
            title: 'IU、Jennie、Irene',
            description: '固定三人劇情聊天室',
            leadMemberId: 'iu',
            members,
            scene: {
                id: createId('scene'),
                location: '私人住所，深夜休息後的清晨',
                realityLayer: 'physical',
                presentMemberIds: ['iu', 'jennie', 'irene'],
                summary: '三人與使用者在一段漫長經歷後相擁入睡；新群組從翌日清晨開始，三人都仍在房內。',
                unresolved: ['今天如何安排工作與陪伴時間'],
                startedAt: now,
            },
            sharedSoul: sharedSoul(),
            sharedMemories: sharedMemories(),
            favoritePhotoPrompt: '',
            createdAt: now,
            updatedAt: now,
            lastSummarizedUserMessageCount: 0,
            memorySummaryVersion: AUTO_MEMORY_SUMMARY_VERSION,
            legacySourcePersonaKey: iuPersonaKey,
            migrationVersion: IU_GROUP_MIGRATION_VERSION,
        };

        this.rooms[room.id] = room;
        this.persist();

        if (!memoryManager.hasChatHistory(room.id)) {
            const greeting: ChatMessage = {
                id: createId('message'),
                createdAt: now,
                role: 'model',
                content: {
                    text: members[0].persona.greeting,
                    segments: [
                        { type: 'narration', text: '晨光剛落進房間，三個人仍在昨晚相擁入睡的位置慢慢醒來。' },
                        { type: 'dialogue', speakerId: 'iu', speakerName: 'IU', text: '早晨……我們三個都在。你今日想先和誰說話，還是想就這樣再抱一會？' },
                        { type: 'dialogue', speakerId: 'jennie', speakerName: 'Jennie', text: '哼，我不是捨不得起床，只是這個位置剛好很舒服。' },
                        { type: 'dialogue', speakerId: 'irene', speakerName: 'Irene', text: '不用急著安排所有事情。先慢慢醒來，我們會一起把今天過好。' },
                    ],
                },
            };
            memoryManager.setChatHistory(room.id, [greeting]);
        }
        return room;
    }
}
