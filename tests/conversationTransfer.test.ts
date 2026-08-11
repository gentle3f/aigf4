import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildContextBridge,
    contextBridgeToSystemPrompt,
    ensureLatestSceneTransitionBridge,
    roomMemberToPersona,
    selectLatestSceneHistory,
    selectTransferContext,
} from '../conversationTransfer.js';
import { ChatMessage, MemoryManager, Persona } from '../managers.js';
import { ChatRoom, RoomMember } from '../roomManager.js';

const persona = (name: string): Persona => ({
    name,
    emoji: '*',
    gender: 'female',
    description: `${name} description`,
    prompt: `${name} voice`,
    greeting: `${name} greeting`,
    avatarPrompt: '',
    avatarUrl: null,
    soul: [],
    memories: [],
});

const member = (id: string, name: string): RoomMember => ({
    id,
    persona: persona(name),
    joinedAt: 1,
    soul: [],
    memories: [],
});

const room = (): ChatRoom => ({
    id: 'room-one',
    type: 'group',
    title: 'IU、Jennie',
    description: 'group',
    leadMemberId: 'iu',
    members: [member('iu', 'IU'), member('jennie', 'Jennie')],
    scene: {
        id: 'scene-one',
        location: '客廳',
        realityLayer: 'physical',
        presentMemberIds: ['iu', 'jennie'],
        summary: '兩人正在和使用者準備晚餐。',
        unresolved: ['決定飲品'],
        startedAt: 1,
    },
    sharedSoul: [],
    sharedMemories: [],
    createdAt: 1,
    updatedAt: 1,
    lastSummarizedUserMessageCount: 0,
});

test('transfer context is bounded and keeps the newest conversation', () => {
    const history: ChatMessage[] = Array.from({ length: 40 }, (_, index) => ({
        id: `message-${index}`,
        role: index % 2 === 0 ? 'user' : 'model',
        content: { text: `turn-${index} ${'x'.repeat(500)}` },
    }));

    const selected = selectTransferContext(history, 'Test chat');

    assert.ok(selected.length <= 4200);
    assert.match(selected, /turn-39/u);
    assert.doesNotMatch(selected, /turn-0 /u);
});

test('group handoff preserves separate speaker names and scene context', () => {
    const sourceRoom = room();
    const history: ChatMessage[] = [{
        role: 'model',
        content: {
            segments: [
                { type: 'narration', text: '門鈴響起。' },
                { type: 'dialogue', speakerId: 'iu', text: '我去開門。' },
                { type: 'dialogue', speakerId: 'jennie', text: '我幫你看著鍋。' },
            ],
        },
    }];
    const bridge = buildContextBridge({
        kind: 'group_to_private',
        sourceConversationKey: sourceRoom.id,
        sourceTitle: sourceRoom.title,
        history,
        room: sourceRoom,
        targetMemberName: 'IU',
    });
    const prompt = contextBridgeToSystemPrompt(bridge);

    assert.match(bridge.recentContext, /IU：我去開門/u);
    assert.match(bridge.recentContext, /Jennie：我幫你看著鍋/u);
    assert.match(bridge.summary, /客廳/u);
    assert.match(prompt, /not as the newest user command/i);
    assert.match(prompt, /Character receiving this handoff: IU/u);
});

test('new scene handoff keeps only the latest completed scene as past continuity', () => {
    const history: ChatMessage[] = [
        { role: 'user', content: { text: '很久以前的場景' } },
        { role: 'model', content: { text: '很久以前的回覆' } },
        { role: 'system', content: { text: '[SCENE END]' } },
        { role: 'user', content: { text: '我們一起煮晚餐' } },
        { role: 'model', content: { text: '大家記住這頓晚餐' } },
    ];
    const latestScene = selectLatestSceneHistory(history);
    const bridge = buildContextBridge({
        kind: 'scene_transition',
        sourceConversationKey: 'room-one',
        sourceTitle: 'IU、Jennie',
        history: latestScene,
        room: room(),
    });
    const prompt = contextBridgeToSystemPrompt(bridge);

    assert.equal(latestScene.length, 2);
    assert.doesNotMatch(bridge.recentContext, /很久以前/u);
    assert.match(bridge.recentContext, /一起煮晚餐/u);
    assert.match(prompt, /PREVIOUS COMPLETED SCENE MEMORY/u);
    assert.match(prompt, /Remember completed events, relationship changes, promises/u);
    assert.match(prompt, /Do not resume the old location/u);
});

test('an old plain scene marker is upgraded without losing the current scene', () => {
    const history: ChatMessage[] = [
        { role: 'user', content: { text: '上一幕的重要約定' } },
        { role: 'model', content: { text: '我會記得這個約定' } },
        { role: 'system', content: { text: '[SCENE END]' } },
        { role: 'user', content: { text: '這是新場景的第一句' } },
    ];
    const upgraded = ensureLatestSceneTransitionBridge(history, 'room-one', 'IU、Jennie', room());
    const bridge = upgraded[2].content.contextBridge;

    assert.notEqual(upgraded, history);
    assert.equal(bridge?.kind, 'scene_transition');
    assert.match(bridge?.recentContext || '', /上一幕的重要約定/u);
    assert.equal(upgraded[3].content.text, '這是新場景的第一句');
});

test('room member becomes a private persona without losing either memory file', () => {
    const source = persona('IU');
    source.soul = [{
        id: 'source-soul',
        kind: 'promise',
        title: '原有承諾',
        summary: '記住原本私訊中的承諾。',
        createdAt: 1,
        pinned: true,
    }];
    const roomMember = member('iu', 'IU');
    roomMember.soul.push({
        id: 'room-soul',
        kind: 'relationship',
        title: '群組關係',
        summary: '記住群組中建立的關係。',
        participants: ['iu'],
        createdAt: 2,
        pinned: true,
    });
    roomMember.memories.push({
        id: 'room-memory',
        kind: 'event',
        title: '晚餐',
        summary: '大家一起準備晚餐。',
        participants: ['iu'],
        createdAt: 3,
        pinned: false,
    });

    const privatePersona = roomMemberToPersona(roomMember, source);

    assert.deepEqual(privatePersona.soul?.map(entry => entry.title), ['原有承諾', '群組關係']);
    assert.deepEqual(privatePersona.memories?.map(entry => entry.title), ['晚餐']);
});

test('copied private persona and its memory files survive a manager reload', async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
        },
    });
    const copied = persona('Jennie');
    copied.avatarUrl = '/legacy-avatars/jennie.jpg';
    copied.memories = [{
        id: 'memory-one',
        kind: 'event',
        title: '群組事件',
        summary: '她知道群組剛發生甚麼。',
        createdAt: 1,
        pinned: false,
    }];

    const key = await new MemoryManager().saveCustomPersonaCopy(copied);
    const restored = new MemoryManager().getPersona(key);

    assert.equal(restored?.name, 'Jennie');
    assert.equal(restored?.avatarUrl, '/legacy-avatars/jennie.jpg');
    assert.equal(restored?.memories?.[0].title, '群組事件');
});
