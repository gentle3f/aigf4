import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildGroupSystemPrompt,
    parseGroupGeneration,
} from '../groupChat.js';
import { ChatRoom, RoomManager, RoomMember } from '../roomManager.js';

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

test('group prompt keeps immutable member and presence ledgers', () => {
    const prompt = buildGroupSystemPrompt(createRoom());
    assert.match(prompt, /MEMBER ID: iu/);
    assert.match(prompt, /MEMBER ID: irene/);
    assert.match(prompt, /Presence now: ABSENT/);
    assert.match(prompt, /never one of the listed characters/i);
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
