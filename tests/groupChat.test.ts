import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildGroupSystemPrompt,
    getGroupDisplaySegments,
    groupNarrationUsesFirstPerson,
    parseGroupGeneration,
    selectLegacyGroupHistory,
    trimTrailingUnansweredUserMessages,
} from '../groupChat.js';
import { ChatMessage, Content, MemoryManager } from '../managers.js';
import {
    ChatRoom,
    cloneRoomSnapshot,
    ROOM_PRESENT_MEMBER_LIMIT,
    RoomManager,
    RoomMember,
} from '../roomManager.js';

const member = (id: string, name: string): RoomMember => ({
    id,
    joinedAt: 1,
    soul: [],
    memories: [],
    persona: {
        name,
        emoji: '*',
        gender: 'female',
        description: `${name} description`,
        prompt: `${name} has a distinct voice and identity.`,
        greeting: `${name} greeting`,
        avatarPrompt: '',
        avatarUrl: null,
    },
});

const createRoom = (): ChatRoom => ({
    id: 'room-test',
    type: 'group',
    title: 'Test room',
    description: 'Test group',
    leadMemberId: 'iu',
    members: [member('iu', 'IU'), member('jennie', 'Jennie'), member('irene', 'Irene')],
    scene: {
        id: 'scene-1',
        location: 'living room',
        realityLayer: 'physical',
        presentMemberIds: ['iu', 'jennie'],
        summary: 'IU and Jennie are talking with the user.',
        unresolved: [],
        startedAt: 1,
    },
    sharedSoul: [],
    sharedMemories: [],
    createdAt: 1,
    updatedAt: 1,
    lastSummarizedUserMessageCount: 0,
});

test('detects first-person ownership for soft review without rejecting dialogue pronouns', () => {
    const room = createRoom();
    const confused = parseGroupGeneration(
        '<chat>（Jennie 避開壓在我手臂上的重量。）\nJennie：「我先接電話。」</chat>'
        + '<scene>{"location":"living room","reality_layer":"physical","present_member_ids":["iu","jennie"],"summary":"phone rings","unresolved":[]}</scene>'
        + '<npc_candidate>null</npc_candidate>',
        room,
        'iu',
    );
    assert.equal(groupNarrationUsesFirstPerson(confused), true);

    const clear = parseGroupGeneration(
        '<chat>（Jennie 避開壓在 IU 手臂上的重量。）\nJennie：「我先接電話。」</chat>'
        + '<scene>{"location":"living room","reality_layer":"physical","present_member_ids":["iu","jennie"],"summary":"phone rings","unresolved":[]}</scene>'
        + '<npc_candidate>null</npc_candidate>',
        room,
        'iu',
    );
    assert.equal(groupNarrationUsesFirstPerson(clear), false);
});

test('group prompt keeps immutable member and presence ledgers', () => {
    const prompt = buildGroupSystemPrompt(createRoom());
    assert.match(prompt, /MEMBER ID: iu/);
    assert.match(prompt, /MEMBER ID: irene/);
    assert.match(prompt, /Presence now: ABSENT/);
    assert.match(prompt, /never one of the listed characters/i);
    assert.match(prompt, /A character may speak more than once/i);
    assert.match(prompt, /Do not return a JSON response object/i);
});

test('group prompt pins returned private context to its owner', () => {
    const room = createRoom();
    room.members[1].privateContinuityHandoff = {
        id: 'return-context',
        kind: 'member_returned',
        sourceConversationKey: 'jennie-private',
        sourceTitle: 'Jennie 的私訊',
        targetMemberName: 'Jennie',
        summary: 'Jennie 與使用者在私訊中約定一起去海邊。',
        recentContext: '使用者：海邊的事不要忘記。\nJennie：我記住了。',
        createdAt: 2,
    };

    const prompt = buildGroupSystemPrompt(room);

    assert.match(prompt, /PRIVATE RETURN CONTINUITY FOR Jennie/u);
    assert.match(prompt, /海邊的事不要忘記/u);
    assert.match(prompt, /Only Jennie and the user initially know/u);
    assert.match(prompt, /never ask the user to repeat/u);
});

test('group parser accepts the reliable transcript envelope and scene metadata', () => {
    const parsed = parseGroupGeneration([
        '<chat>',
        '（門鎖輕響，早餐的香氣跟著飄進客廳。）',
        'IU：「我醒了……你真的買回來了？」',
        'Jennie：「我也醒啦，先讓我看看有甚麼。」',
        '（Jennie 拉著 IU 一起走近，兩人交換了一個笑。）',
        'IU：「我們一起吃，別又搶他的那份。」',
        '</chat>',
        '<scene>{"location":"客廳","reality_layer":"physical","present_member_ids":["iu","jennie"],"summary":"使用者帶早餐回來，IU 與 Jennie 一起迎接。","unresolved":[]}</scene>',
        '<npc_candidate>null</npc_candidate>',
    ].join('\n'), createRoom());

    assert.equal(parsed.segments.length, 5);
    assert.deepEqual(
        parsed.segments.filter(segment => segment.type === 'dialogue').map(segment => segment.speakerId),
        ['iu', 'jennie', 'iu'],
    );
    assert.equal(parsed.scene.location, '客廳');
    assert.equal(parsed.scene.summary, '使用者帶早餐回來，IU 與 Jennie 一起迎接。');
    assert.equal(parsed.npcCandidate, undefined);
});

test('group parser preserves separate speakers and scene state', () => {
    const parsed = parseGroupGeneration(JSON.stringify({
        segments: [
            { type: 'narration', speaker_id: null, text: 'Morning light reaches the sofa.' },
            { type: 'dialogue', speaker_id: 'iu', text: 'I heard you.' },
            { type: 'dialogue', speaker_id: 'jennie', text: 'Me too.' },
        ],
        scene: {
            location: 'living room',
            reality_layer: 'physical',
            present_member_ids: ['iu', 'jennie'],
            summary: 'Both members answered the newest turn.',
            unresolved: [],
        },
        npc_candidate: {
            name: 'New friend',
            gender: 'female',
            description: 'A newly introduced recurring friend.',
            public_figure_query: null,
        },
    }), createRoom());

    assert.deepEqual(parsed.segments.map(segment => segment.speakerId).filter(Boolean), ['iu', 'jennie']);
    assert.equal(parsed.scene.presentMemberIds.join(','), 'iu,jennie');
    assert.equal(parsed.npcCandidate?.gender, 'female');
});

test('group rooms preserve five active members in scene state', () => {
    const room = createRoom();
    room.members.push(member('rose', 'Rose'), member('lisa', 'Lisa'));
    room.scene.presentMemberIds = room.members.map(item => item.id);

    const parsed = parseGroupGeneration(JSON.stringify({
        segments: [{ type: 'dialogue', speaker_id: 'iu', text: 'Everyone is here.' }],
        scene: {
            location: 'living room',
            reality_layer: 'physical',
            present_member_ids: ['iu', 'jennie', 'irene', 'rose', 'lisa'],
            summary: 'All five members remain present.',
            unresolved: [],
        },
        npc_candidate: null,
    }), room);

    assert.equal(ROOM_PRESENT_MEMBER_LIMIT, 5);
    assert.deepEqual(parsed.scene.presentMemberIds, ['iu', 'jennie', 'irene', 'rose', 'lisa']);
});

test('group parser accepts Venice legacy messages and sender_id fields', () => {
    const parsed = parseGroupGeneration(JSON.stringify({
        messages: [
            { sender_id: 'iu', text: '我喺度，頭先只係諗緊點答你。' },
            { sender_id: 'jennie', text: '我都有聽住呀。' },
        ],
    }), createRoom());

    assert.deepEqual(parsed.segments.map(segment => segment.speakerId), ['iu', 'jennie']);
    assert.match(parsed.text, /IU：「/u);
    assert.equal(parsed.scene.location, 'living room');
});

test('group parser ignores malformed optional arrays instead of crashing', () => {
    const parsed = parseGroupGeneration(JSON.stringify({
        segments: [
            null,
            { type: 'dialogue', speaker_id: 'iu', text: '我而家可以正常答你。' },
        ],
        scene: {
            location: 'living room',
            reality_layer: 'physical',
            present_member_ids: 'iu',
            summary: 'IU answered.',
            unresolved: 'none',
        },
        npc_candidate: null,
    }), createRoom());

    assert.equal(parsed.segments[0]?.speakerId, 'iu');
    assert.deepEqual(parsed.scene.presentMemberIds, ['iu', 'jennie']);
    assert.deepEqual(parsed.scene.unresolved, []);
});

test('group parser accepts labelled transcript fallback and resolves display names', () => {
    const parsed = parseGroupGeneration([
        '（Jennie 把杯子放到茶几上。）',
        'Jennie：「我先答你，今晚我想食辣嘢。」',
        'IU：「咁我陪你揀。」',
    ].join('\n'), createRoom());

    assert.deepEqual(
        parsed.segments.filter(segment => segment.type === 'dialogue').map(segment => segment.speakerId),
        ['jennie', 'iu'],
    );
});

test('group parser separates bracketed speaker labels embedded in one model line', () => {
    const room = createRoom();
    room.scene.presentMemberIds = ['iu', 'jennie', 'irene'];
    const parsed = parseGroupGeneration([
        '<chat>[IU]：（IU 靠近窗邊。）我先說。[Irene]（Irene 抬起眼。）輪到我。[Jennie]：最後是我。[旁白] 三個人重新看向使用者。</chat>',
        '<scene>{"location":"living room","reality_layer":"physical","present_member_ids":["iu","jennie","irene"],"summary":"All three replied.","unresolved":[]}</scene>',
        '<npc_candidate>null</npc_candidate>',
    ].join(''), room);

    assert.deepEqual(
        parsed.segments.map(segment => segment.type === 'narration' ? '旁白' : segment.speakerName),
        ['IU', 'Irene', 'Jennie', '旁白'],
    );
    assert.equal(parsed.segments.some(segment => segment.text.includes('[Irene]')), false);
});

test('stored group turns are repaired for display without rewriting chat history', () => {
    const room = createRoom();
    room.scene.presentMemberIds = ['iu', 'jennie', 'irene'];
    const content: Content = {
        text: 'legacy malformed group turn',
        segments: [{
            type: 'dialogue',
            speakerId: 'iu',
            speakerName: 'IU',
            text: '我先回應。[Irene] 我接著回答。[Jennie] 我最後補充。',
        }],
    };

    const repaired = getGroupDisplaySegments(content, room);
    assert.deepEqual(repaired.map(segment => segment.speakerName), ['IU', 'Irene', 'Jennie']);
});

test('group parser rejects dialogue spoken only by an absent member', () => {
    assert.throws(() => parseGroupGeneration(JSON.stringify({
        segments: [{ type: 'dialogue', speaker_id: 'irene', text: 'I should not know this.' }],
        scene: {
            location: 'living room',
            reality_layer: 'physical',
            present_member_ids: ['iu', 'jennie'],
            summary: 'Invalid turn.',
            unresolved: [],
        },
        npc_candidate: null,
    }), createRoom()), /valid member dialogue/i);
});

test('legacy group context keeps a bounded tail of completed turns', () => {
    const history: ChatMessage[] = Array.from({ length: 1000 }, (_, index) => ({
        id: `message-${index}`,
        role: index % 2 === 0 ? 'user' : 'model',
        content: { text: `message ${index} ${'x'.repeat(1200)}` },
    }));
    history.push(
        { id: 'unfinished-1', role: 'user', content: { text: 'unanswered old command' } },
        { id: 'unfinished-2', role: 'user', content: { text: 'another unanswered old command' } },
    );

    const selected = selectLegacyGroupHistory(history);
    const selectedChars = selected.reduce((total, message) => total + (message.content.text || '').length + 24, 0);

    assert.ok(selected.length <= 24);
    assert.ok(selectedChars <= 18_000);
    assert.equal(selected[0]?.role, 'user');
    assert.equal(selected.at(-1)?.role, 'model');
    assert.match(selected.at(-1)?.content.text || '', /^message 999 /u);
    assert.equal(selected.some(message => message.id?.startsWith('unfinished')), false);
});

test('new retries ignore all older unanswered user messages without deleting history', () => {
    const history: ChatMessage[] = [
        { id: 'answered-user', role: 'user', content: { text: '早晨' } },
        { id: 'answered-model', role: 'model', content: { text: '早晨呀' } },
        { id: 'failed-1', role: 'user', content: { text: '第一次失敗' } },
        { id: 'failed-2', role: 'user', content: { text: '第二次失敗' } },
    ];

    const completed = trimTrailingUnansweredUserMessages(history);

    assert.deepEqual(completed.map(message => message.id), ['answered-user', 'answered-model']);
    assert.equal(history.length, 4);
});

test('room snapshots do not depend on structuredClone and remain independent', () => {
    const room = createRoom();
    const snapshot = cloneRoomSnapshot(room);
    snapshot.scene.location = 'a different room';
    snapshot.members[0].persona.name = 'Changed';

    assert.equal(room.scene.location, 'living room');
    assert.equal(room.members[0].persona.name, 'IU');
});

test('room favorite photo prompt survives a manager reload', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
    const firstManager = new RoomManager();
    const room = firstManager.createRoom('Photo room', [
        { persona: member('one', 'One').persona },
        { persona: member('two', 'Two').persona },
    ]);
    firstManager.updateRoom(room.id, editable => {
        editable.favoritePhotoPrompt = 'soft window light, candid phone photo';
        editable.timelineBranch = {
            sourceConversationKey: 'room-source',
            sourceMessageId: 'message-source',
            sourceTitle: 'Original room',
            createdAt: 10,
        };
    });

    const restored = new RoomManager().getRoom(room.id);
    assert.equal(restored?.favoritePhotoPrompt, 'soft window light, candid phone photo');
    assert.equal(restored?.timelineBranch?.sourceMessageId, 'message-source');
});

test('group auto memory entries and checkpoint survive reload together', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
        },
    });
    const manager = new RoomManager();
    const room = manager.saveRoom(createRoom());

    const added = manager.applyEpisodicMemorySummary(room.id, [{
        kind: 'promise',
        title: '早餐約定',
        summary: 'IU 答應明早和使用者一起吃早餐。',
        participants: ['iu'],
    }], 24, 2);

    assert.equal(added, 1);
    const restored = new RoomManager().getRoom(room.id);
    assert.equal(restored?.sharedMemories.at(-1)?.title, '早餐約定');
    assert.equal(restored?.members.find(item => item.id === 'iu')?.memories.at(-1)?.title, '早餐約定');
    assert.equal(restored?.lastSummarizedUserMessageCount, 24);
    assert.equal(restored?.memorySummaryVersion, 2);
});

test('deleting a room removes it after manager reload', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
    const manager = new RoomManager();
    const created = manager.createRoom('Temporary room', [
        { persona: member('iu', 'IU').persona },
        { persona: member('jennie', 'Jennie').persona },
    ]);

    assert.equal(manager.deleteRoom(created.id), true);
    assert.equal(new RoomManager().getRoom(created.id), undefined);
});

test('a deleted curated room is not recreated on reload', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
    const memoryManager = new MemoryManager();
    const manager = new RoomManager();
    const curated = manager.ensureIuGroupRoom(memoryManager);
    assert.ok(curated);
    assert.equal(manager.deleteRoom(curated.id), true);

    const restored = new RoomManager();
    assert.equal(restored.ensureIuGroupRoom(memoryManager), undefined);
    assert.equal(restored.getRoom(curated.id), undefined);
});

test('upgrading a one-to-one chat to a room carries its soul and episodic memory', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
    const lead = member('lead', 'Lead').persona;
    lead.soul = [{
        id: 'soul-one',
        kind: 'promise',
        title: '承諾',
        summary: '她會記住這項承諾。',
        createdAt: 1,
        pinned: true,
    }];
    lead.memories = [{
        id: 'memory-one',
        kind: 'event',
        title: '共同事件',
        summary: '兩人一起經歷的重要事件。',
        createdAt: 2,
        pinned: false,
    }];

    const room = new RoomManager().createRoom('Converted room', [
        { sourcePersonaKey: 'lead', persona: lead },
        { sourcePersonaKey: 'friend', persona: member('friend', 'Friend').persona },
    ]);

    assert.equal(room.members[0].soul[0].title, '承諾');
    assert.equal(room.members[0].memories[0].title, '共同事件');
    assert.deepEqual(room.members[0].soul[0].participants, [room.members[0].id]);
});

test('replacing a room member keeps the group slot but adopts private continuity', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
    const manager = new RoomManager();
    const created = manager.createRoom('BLACKPINK', [
        { sourcePersonaKey: 'jennie', persona: member('jennie', 'Jennie').persona },
        { sourcePersonaKey: 'rose-old', persona: member('rose-old', 'Rose').persona },
    ]);
    const oldRose = created.members[1];
    const privateRose = member('temporary-private-id', 'Rose');
    privateRose.sourcePersonaKey = 'rose-private';
    privateRose.privatePersonaKey = 'rose-private';
    privateRose.privateContinuityImportedUserMessageCount = 8;
    privateRose.privateContinuityHandoff = {
        id: 'private-handoff',
        kind: 'member_returned',
        sourceConversationKey: 'rose-private',
        sourceTitle: 'Rose 的私訊',
        targetMemberName: 'Rose',
        summary: 'Rose 記得兩人在私訊中的秘密旅行。',
        recentContext: '使用者：記得我們在海邊的約定嗎？\nRose：我當然記得。',
        createdAt: 11,
    };
    privateRose.persona.prompt = 'Rose remembers the private trip.';
    privateRose.memories = [{
        id: 'private-memory',
        kind: 'relationship',
        title: '私訊旅程',
        summary: 'Rose 與使用者單獨外出後建立了新的默契。',
        participants: [privateRose.id],
        createdAt: 10,
        pinned: false,
    }];

    manager.replaceMember(created.id, oldRose.id, privateRose);

    const replaced = new RoomManager().getRoom(created.id)!;
    const returnedRose = replaced.members.find(item => item.id === oldRose.id)!;
    assert.equal(returnedRose.sourcePersonaKey, 'rose-private');
    assert.equal(returnedRose.privatePersonaKey, 'rose-private');
    assert.equal(returnedRose.privateContinuityImportedUserMessageCount, 8);
    assert.match(returnedRose.privateContinuityHandoff?.recentContext || '', /海邊的約定/u);
    assert.equal(returnedRose.persona.prompt, 'Rose remembers the private trip.');
    assert.equal(returnedRose.memories[0].title, '私訊旅程');
    assert.deepEqual(returnedRose.memories[0].participants, [oldRose.id]);
    assert.ok(replaced.scene.presentMemberIds.includes(oldRose.id));
});

test('curated IU group exists even before a legacy IU chat is imported', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
    const chatHistories = new Map<string, unknown[]>();
    const memoryManager = {
        getAllPersonas: () => ({}),
        peekChatHistory: (key: string) => chatHistories.get(key) || [],
        hasChatHistory: (key: string) => (chatHistories.get(key)?.length || 0) > 0,
        setChatHistory: (key: string, history: unknown[]) => chatHistories.set(key, history),
    };

    const roomManager = new RoomManager();
    const room = roomManager.ensureIuGroupRoom(memoryManager as never);

    assert.ok(room);
    assert.equal(room.members.map(item => item.persona.name).join(','), 'IU,Jennie,Irene');
    assert.equal(room.legacySourcePersonaKey, undefined);
    assert.equal(chatHistories.get(room.id)?.length, 1);
});

test('curated IU group links the richest legacy room without copying or changing it', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
    const shortHistory = [{ role: 'model', content: { text: 'short' } }];
    const longHistory = Array.from({ length: 1000 }, (_, index) => ({
        role: index % 2 ? 'user' : 'model',
        content: { text: `message ${index}` },
    }));
    const chatHistories = new Map<string, unknown[]>([
        ['custom_iu_short', shortHistory],
        ['custom_iu_archive', longHistory],
    ]);
    const persona = {
        name: 'IU',
        emoji: '*',
        gender: 'female',
        description: 'IU',
        prompt: '',
        greeting: 'hello',
        avatarPrompt: '',
        avatarUrl: null,
    };
    const memoryManager = {
        getAllPersonas: () => ({ custom_iu_short: persona, custom_iu_archive: persona }),
        peekChatHistory: (key: string) => chatHistories.get(key) || [],
        hasChatHistory: (key: string) => (chatHistories.get(key)?.length || 0) > 0,
        setChatHistory: (key: string, history: unknown[]) => chatHistories.set(key, history),
    };

    const roomManager = new RoomManager();
    const room = roomManager.ensureIuGroupRoom(memoryManager as never);

    assert.equal(room.legacySourcePersonaKey, 'custom_iu_archive');
    assert.equal(chatHistories.get('custom_iu_archive'), longHistory);
    assert.equal(chatHistories.get(room.id)?.length, 1);
});
