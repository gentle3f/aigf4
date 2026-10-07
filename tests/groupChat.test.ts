import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    contentToGroupHistoryText,
    getGroupDisplaySegments,
    groupNarrationUsesFirstPerson,
    parseGroupGeneration,
    selectGroupHistorySinceCurrentRealityLayer,
    selectLegacyGroupHistory,
    stripGroupTransportResidue,
    trimTrailingUnansweredUserMessages,
} from '../groupChat.js';
import {
    buildGroupSystemPrompt,
    buildGroupSystemPromptWithAccounting,
} from '../groupChatPrompt.js';
import { summarizePromptComponents } from '../promptAccounting.js';
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
        realityEpochId: 'epoch-physical',
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
    assert.match(prompt, /AUTHORITATIVE CURRENT WARDROBE LEDGER/i);
    assert.match(prompt, /wardrobe_updates/i);
});

test('group prompt accounting reconciles the unchanged prompt without member content', () => {
    const room = createRoom();
    const accounting = buildGroupSystemPromptWithAccounting(room, '最新訊息');
    assert.equal(accounting.prompt, buildGroupSystemPrompt(room, '最新訊息'));
    assert.equal(summarizePromptComponents(accounting.components).chars, accounting.prompt.length);
    assert.ok(accounting.components.some(component => component.name === 'room-members-persona'));
    assert.ok(accounting.components.some(component => component.name === 'room-current-scene'));
    assert.ok(accounting.components.some(component => component.name === 'room-wardrobe'));
    assert.ok(accounting.components.every(component => !('text' in component)));
});

test('group texting prompt makes remote communication override a physical location label', () => {
    const room = createRoom();
    room.scene.realityLayer = 'texting';
    room.scene.location = 'a luxury vehicle';
    room.scene.presentMemberIds = ['iu', 'jennie'];

    const prompt = buildGroupSystemPrompt(room);

    assert.match(prompt, /Reality layer: texting/);
    assert.match(prompt, /Communication mode: REMOTE TEXTING/);
    assert.match(prompt, /Physical co-presence with user: NO/);
    assert.match(prompt, /Context\/location metadata: a luxury vehicle/);
    assert.match(prompt, /does NOT mean the characters and user currently share that physical space/i);
    assert.match(prompt, /remote text communication, not a shared physical scene/i);
    assert.match(prompt, /physical location label.*never means a character is physically with the user/i);
    assert.match(prompt, /Do not make a character touch.*physically act directly on the user/i);
    assert.match(prompt, /Do not turn older physical narration into current co-presence/i);
    assert.match(prompt, /remote-message reactions/i);
    assert.doesNotMatch(prompt, /fresh action, expression, physical distance, sensory environment/i);
    assert.match(prompt, /CURRENT REALITY OVERRIDES OLDER NARRATION/);
    assert.ok(prompt.indexOf('CURRENT REALITY OVERRIDES OLDER NARRATION') > prompt.indexOf('FIXED MEMBER FILES'));
});

test('group physical prompt preserves physical scene guidance without the remote contract', () => {
    const room = createRoom();
    room.scene.realityLayer = 'physical';
    room.scene.location = 'a luxury vehicle';

    const prompt = buildGroupSystemPrompt(room);

    assert.doesNotMatch(prompt, /REMOTE TEXTING CONTRACT/i);
    assert.doesNotMatch(prompt, /CURRENT REALITY OVERRIDES OLDER NARRATION/i);
    assert.doesNotMatch(prompt, /Communication mode: REMOTE TEXTING/i);
    assert.doesNotMatch(prompt, /remote text communication, not a shared physical scene/i);
    assert.match(prompt, /fresh action, expression, physical distance, sensory environment/i);
});

test('group prompt reality contracts differ between otherwise identical texting and physical rooms', () => {
    const texting = createRoom();
    texting.scene.realityLayer = 'texting';
    texting.scene.location = 'a luxury vehicle';
    const physical = JSON.parse(JSON.stringify(texting));
    physical.scene.realityLayer = 'physical';

    const textingPrompt = buildGroupSystemPrompt(texting);
    const physicalPrompt = buildGroupSystemPrompt(physical);

    assert.notEqual(textingPrompt, physicalPrompt);
    assert.match(textingPrompt, /Physical interaction with the user is valid only after the scene explicitly changes reality_layer to physical/i);
    assert.doesNotMatch(physicalPrompt, /Physical interaction with the user is valid only after the scene explicitly changes reality_layer to physical/i);
});

test('first texting turn after physical history never falls back to old physical dialogue', () => {
    const room = createRoom();
    const physicalSnapshot = { ...room.scene, realityLayer: 'physical' as const, realityEpochId: 'epoch-physical' };
    const textingSnapshot = { ...room.scene, realityLayer: 'texting' as const, realityEpochId: 'epoch-texting' };
    const history: ChatMessage[] = [
        { id: 'physical-user', role: 'user', content: { text: 'old physical turn', roomSceneBeforeTurn: physicalSnapshot } },
        { id: 'physical-model', role: 'model', content: { text: 'old physical co-presence narration' } },
        { id: 'texting-user', role: 'user', content: { text: 'now we are remote', roomSceneBeforeTurn: textingSnapshot } },
        { id: 'texting-model', role: 'model', content: { text: 'remote reply remains useful' } },
    ];
    const selected = selectGroupHistorySinceCurrentRealityLayer(history, 'texting');

    assert.deepEqual(selected.map(message => message.id), ['texting-user', 'texting-model']);
    assert.equal(history.length, 4);
    assert.equal(history[1].content.text, 'old physical co-presence narration');
});

test('a newest unanswered texting snapshot still establishes the history boundary', () => {
    const room = createRoom();
    const history: ChatMessage[] = [
        { id: 'physical-user', role: 'user', content: { text: 'old physical turn', roomSceneBeforeTurn: { ...room.scene, realityLayer: 'physical', realityEpochId: 'epoch-physical' } } },
        { id: 'physical-model', role: 'model', content: { text: 'old physical co-presence narration' } },
        { id: 'latest-texting-user', role: 'user', content: { text: 'now remote', roomSceneBeforeTurn: { ...room.scene, realityLayer: 'texting', realityEpochId: 'epoch-texting' } } },
    ];
    const sinceTransition = selectGroupHistorySinceCurrentRealityLayer(history, 'texting');

    assert.deepEqual(sinceTransition.map(message => message.id), ['latest-texting-user']);
    assert.deepEqual(trimTrailingUnansweredUserMessages(sinceTransition), []);
});

test('texting history retains a contiguous same-layer suffix with every assistant response in its user turn', () => {
    const room = createRoom();
    const physicalSnapshot = { ...room.scene, realityLayer: 'physical' as const, realityEpochId: 'epoch-physical' };
    const textingSnapshot = { ...room.scene, realityLayer: 'texting' as const, realityEpochId: 'epoch-texting' };
    const history: ChatMessage[] = [
        { id: 'physical-user', role: 'user', content: { text: 'old physical turn', roomSceneBeforeTurn: physicalSnapshot } },
        { id: 'physical-model', role: 'model', content: { text: 'old physical answer' } },
        { id: 'texting-a-user', role: 'user', content: { text: 'remote A', roomSceneBeforeTurn: textingSnapshot } },
        { id: 'texting-a-model-1', role: 'model', content: { text: 'remote A answer one' } },
        { id: 'texting-a-model-2', role: 'model', content: { text: 'remote A answer two' } },
        { id: 'texting-b-user', role: 'user', content: { text: 'remote B', roomSceneBeforeTurn: textingSnapshot } },
        { id: 'texting-b-model', role: 'model', content: { text: 'remote B answer' } },
        { id: 'latest-texting-user', role: 'user', content: { text: 'remote C', roomSceneBeforeTurn: textingSnapshot } },
    ];

    assert.deepEqual(selectGroupHistorySinceCurrentRealityLayer(history, 'texting').map(message => message.id), [
        'texting-a-user', 'texting-a-model-1', 'texting-a-model-2',
        'texting-b-user', 'texting-b-model', 'latest-texting-user',
    ]);
});

test('an unknown user-turn layer is a hard barrier for texting continuity', () => {
    const room = createRoom();
    const physicalSnapshot = { ...room.scene, realityLayer: 'physical' as const, realityEpochId: 'epoch-physical' };
    const textingSnapshot = { ...room.scene, realityLayer: 'texting' as const, realityEpochId: 'epoch-texting' };
    const history: ChatMessage[] = [
        { id: 'physical-user', role: 'user', content: { text: 'old physical turn', roomSceneBeforeTurn: physicalSnapshot } },
        { id: 'physical-model', role: 'model', content: { text: 'old physical answer' } },
        { id: 'early-texting-user', role: 'user', content: { text: 'early remote turn', roomSceneBeforeTurn: textingSnapshot } },
        { id: 'early-texting-model', role: 'model', content: { text: 'early remote answer' } },
        { id: 'unknown-user', role: 'user', content: { text: 'unknown layer turn' } },
        { id: 'unknown-model', role: 'model', content: { text: 'unknown layer answer' } },
        { id: 'late-texting-user', role: 'user', content: { text: 'late remote turn', roomSceneBeforeTurn: textingSnapshot } },
        { id: 'late-texting-model', role: 'model', content: { text: 'late remote answer' } },
        { id: 'latest-texting-user', role: 'user', content: { text: 'latest remote turn', roomSceneBeforeTurn: textingSnapshot } },
    ];

    assert.deepEqual(selectGroupHistorySinceCurrentRealityLayer(history, 'texting').map(message => message.id), [
        'late-texting-user', 'late-texting-model', 'latest-texting-user',
    ]);
});

test('first post-upgrade texting turn excludes every legacy user turn without an epoch', () => {
    const room = createRoom();
    room.scene.realityLayer = 'texting';
    room.scene.realityEpochId = 'epoch-current';
    const legacySnapshot = { ...room.scene, realityEpochId: undefined };
    const currentSnapshot = { ...room.scene };
    const history: ChatMessage[] = [
        { id: 'legacy-user', role: 'user', content: { text: 'old legacy turn', roomSceneBeforeTurn: legacySnapshot } },
        { id: 'legacy-model', role: 'model', content: { text: 'old legacy reply' } },
        { id: 'latest-user', role: 'user', content: { text: 'new current turn', roomSceneBeforeTurn: currentSnapshot } },
    ];

    const selected = selectGroupHistorySinceCurrentRealityLayer(history, 'texting', room.scene.realityEpochId);
    assert.deepEqual(selected.map(message => message.id), ['latest-user']);
    assert.deepEqual(trimTrailingUnansweredUserMessages(selected), []);
});

test('second post-upgrade texting turn retains only the current epoch completed turn', () => {
    const room = createRoom();
    const legacySnapshot = { ...room.scene, realityLayer: 'texting' as const, realityEpochId: undefined };
    const currentSnapshot = { ...room.scene, realityLayer: 'texting' as const, realityEpochId: 'epoch-current' };
    const history: ChatMessage[] = [
        { id: 'legacy-user', role: 'user', content: { text: 'old legacy turn', roomSceneBeforeTurn: legacySnapshot } },
        { id: 'legacy-model', role: 'model', content: { text: 'old legacy reply' } },
        { id: 'current-user-a', role: 'user', content: { text: 'current turn A', roomSceneBeforeTurn: currentSnapshot } },
        { id: 'current-model-a', role: 'model', content: { text: 'current reply A' } },
        { id: 'latest-user-b', role: 'user', content: { text: 'current turn B', roomSceneBeforeTurn: currentSnapshot } },
    ];

    const selected = selectGroupHistorySinceCurrentRealityLayer(history, 'texting', 'epoch-current');
    assert.deepEqual(trimTrailingUnansweredUserMessages(selected).map(message => message.id), [
        'current-user-a', 'current-model-a',
    ]);
});

test('texting epoch selection stops at a missing legacy snapshot before an older epoch', () => {
    const room = createRoom();
    const epochOne = { ...room.scene, realityLayer: 'texting' as const, realityEpochId: 'epoch-one' };
    const epochTwo = { ...room.scene, realityLayer: 'texting' as const, realityEpochId: 'epoch-two' };
    const legacy = { ...room.scene, realityLayer: 'texting' as const, realityEpochId: undefined };
    const history: ChatMessage[] = [
        { id: 'epoch-one-user', role: 'user', content: { text: 'old epoch', roomSceneBeforeTurn: epochOne } },
        { id: 'epoch-one-model', role: 'model', content: { text: 'old epoch reply' } },
        { id: 'legacy-user', role: 'user', content: { text: 'legacy boundary', roomSceneBeforeTurn: legacy } },
        { id: 'legacy-model', role: 'model', content: { text: 'legacy reply' } },
        { id: 'epoch-two-user', role: 'user', content: { text: 'current epoch', roomSceneBeforeTurn: epochTwo } },
        { id: 'epoch-two-model', role: 'model', content: { text: 'current epoch reply' } },
    ];

    assert.deepEqual(selectGroupHistorySinceCurrentRealityLayer(history, 'texting', 'epoch-two').map(message => message.id), [
        'epoch-two-user', 'epoch-two-model',
    ]);
});

test('clean texting history retains useful remote continuity and leaves long-term memory in the prompt', () => {
    const room = createRoom();
    room.scene.realityLayer = 'texting';
    room.scene.realityEpochId = 'epoch-texting';
    room.sharedMemories = [{
        id: 'past-event', kind: 'event', title: 'Earlier vehicle trip', summary: 'This is a past shared event, not the current setting.',
        participants: ['iu', 'jennie'], createdAt: 1, pinned: false, visibility: 'shared',
    }];
    const snapshot = { ...room.scene };
    const history: ChatMessage[] = [
        { id: 'remote-user', role: 'user', content: { text: 'remote check-in', roomSceneBeforeTurn: snapshot } },
        { id: 'remote-model', role: 'model', content: { text: 'remote answer' } },
    ];

    assert.deepEqual(selectGroupHistorySinceCurrentRealityLayer(history, 'texting').map(message => message.id), ['remote-user', 'remote-model']);
    assert.match(buildGroupSystemPrompt(room, 'remote check-in'), /Earlier vehicle trip/);
});

test('physical history keeps the same old turns and physical prompt behaviour', () => {
    const room = createRoom();
    const history: ChatMessage[] = [
        { id: 'old-user', role: 'user', content: { text: 'old turn', roomSceneBeforeTurn: { ...room.scene, realityLayer: 'texting' } } },
        { id: 'old-model', role: 'model', content: { text: 'old reply' } },
    ];

    assert.equal(selectGroupHistorySinceCurrentRealityLayer(history, 'physical'), history);
    assert.match(buildGroupSystemPrompt(room), /fresh action, expression, physical distance, sensory environment/i);
});

test('group parser preserves outfits unless a member has an explicit wardrobe update', () => {
    const room = createRoom();
    room.scene.wardrobe = {
        user: '白色恤衫及深藍牛仔褲',
        characters: {
            iu: '白色上衣及黑色短裙',
            jennie: '紅色連身裙',
        },
    };
    const parsed = parseGroupGeneration([
        '<chat>IU：「我哋繼續傾。」</chat>',
        '<scene>{"location":"living room","reality_layer":"physical","present_member_ids":["iu","jennie"],"summary":"conversation continues","unresolved":[],"wardrobe_updates":{"user":"KEEP","members":[{"member_id":"iu","outfit":"KEEP"},{"member_id":"Jennie","outfit":"KEEP"}]}}</scene>',
        '<npc_candidate>null</npc_candidate>',
    ].join(''), room);

    assert.deepEqual(parsed.scene.wardrobe, room.scene.wardrobe);
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

test('group parser keeps visible prose before an empty chat tag without leaking transport metadata', () => {
    const raw = [
        '（IU 輕輕笑了一下。）好啦，我知道了，返去再慢慢傾。',
        '<chat> </chat>',
        '<scene>{"location":"酒店路上","reality_layer":"physical","present_member_ids":["iu","jennie"],"summary":"眾人正在返回酒店。","unresolved":[],"wardrobe_updates":{"user":"KEEP","members":[{"member_id":"iu","outfit":"KEEP"},{"member_id":"jennie","outfit":"KEEP"}]}}</scene>',
        '<npc_candidate>null</npc_candidate>',
    ].join(' ');

    const parsed = parseGroupGeneration(raw, createRoom(), 'iu');

    assert.match(parsed.text, /返去再慢慢傾/u);
    assert.equal(parsed.text.includes('<chat>'), false);
    assert.equal(parsed.text.includes('<scene>'), false);
    assert.equal(parsed.text.includes('present_member_ids'), false);
    assert.equal(parsed.text.includes('<npc_candidate>'), false);
    assert.equal(parsed.scene.location, '酒店路上');
    assert.equal(parsed.scene.summary, '眾人正在返回酒店。');
    assert.equal(parsed.npcCandidate, undefined);
});

test('legacy display repair strips a trailing empty group envelope from visible prose', () => {
    const room = createRoom();
    const content: Content = {
        text: '（IU 抬起眼。）我哋走啦。'
            + '<chat></chat>'
            + '<scene>{"location":"門外","reality_layer":"physical","present_member_ids":["iu","jennie"],"summary":"準備離開。","unresolved":[]}</scene>'
            + '<npc_candidate>null</npc_candidate>',
    };

    const display = getGroupDisplaySegments(content, room, 'iu');
    const visible = display.map(segment => segment.text).join(' ');

    assert.match(visible, /我哋走啦/u);
    assert.equal(visible.includes('<scene>'), false);
    assert.equal(visible.includes('present_member_ids'), false);
});


test('group parser strips transport residue embedded inside an otherwise valid dialogue segment', () => {
    const parsed = parseGroupGeneration(JSON.stringify({
        segments: [
            {
                type: 'dialogue',
                speaker_id: 'iu',
                text: '我哋返去啦。</chat><scene>{"location":"酒店大堂","summary":"transport only"}</scene><npc_candidate>null</npc_candidate>',
            },
        ],
        scene: {
            location: '酒店大堂',
            reality_layer: 'physical',
            present_member_ids: ['iu', 'jennie'],
            summary: '準備返房。',
            unresolved: [],
        },
        npc_candidate: null,
    }), createRoom(), 'iu');

    assert.equal(parsed.segments[0]?.text, '我哋返去啦。');
    assert.equal(parsed.text.includes('<scene>'), false);
    assert.equal(parsed.text.includes('transport only'), false);
    assert.equal(parsed.text.includes('<npc_candidate>'), false);
});

test('group parser truncates malformed trailing transport residue without requiring closing tags', () => {
    const parsed = parseGroupGeneration(JSON.stringify({
        segments: [
            {
                type: 'dialogue',
                speaker_id: 'jennie',
                text: '我等你。</chat><scene>{"location":"門外"',
            },
        ],
        scene: {
            location: '門外',
            reality_layer: 'physical',
            present_member_ids: ['iu', 'jennie'],
            summary: 'Jennie 在門外等候。',
            unresolved: [],
        },
        npc_candidate: null,
    }), createRoom(), 'jennie');

    assert.equal(parsed.segments[0]?.text, '我等你。');
    assert.equal(parsed.text.includes('<scene'), false);
    assert.equal(parsed.text.includes('"location"'), false);
});

test('legacy group display and history strip transport residue stored inside segment text', () => {
    const room = createRoom();
    const content: Content = {
        text: 'legacy visible text',
        segments: [
            {
                type: 'dialogue',
                speakerId: 'iu',
                speakerName: 'IU',
                text: '我記住喇。</chat><scene>{"location":"客廳"}</scene><npc_candidate>null</npc_candidate>',
            },
        ],
    };

    const display = getGroupDisplaySegments(content, room, 'iu');
    const history = contentToGroupHistoryText(content, room);

    assert.equal(display[0]?.text, '我記住喇。');
    assert.equal(history.includes('<scene>'), false);
    assert.equal(history.includes('npc_candidate'), false);
    assert.equal(history.includes('"location"'), false);
});

test('Group sidebar preview uses the shared transport sanitizer for room conversations only', () => {
    assert.equal(
        stripGroupTransportResidue('Jennie：「返酒店啦。」 </chat><scene>{"location":"車上"}</scene><npc_candidate>null</npc_candidate>'),
        'Jennie：「返酒店啦。」',
    );

    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    assert.match(source, /const visiblePreview = roomManager\.getRoom\(key\)\s*\? stripGroupTransportResidue\(rawPreview\)\s*: rawPreview;/s);
    assert.match(source, /return visiblePreview\.replace\(\/\\s\+\/gu, ' '\)\.trim\(\)/);
});

test('Group bot rendering never falls through to raw content text when safe segments are empty', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(source, /else if \(sender === 'bot' && currentRoom\) \{/);
    assert.doesNotMatch(source, /sender === 'bot' && currentRoom && groupDisplaySegments\.length/);
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

test('stored transport envelopes never display or re-enter group history as scene JSON', () => {
    const room = createRoom();
    const content: Content = {
        text: '<chat>IU：「我會等你。」\nJennie：「我都在。」</chat>'
            + '<scene>{"location":"店外","reality_layer":"physical","present_member_ids":["iu","jennie"],"summary":"兩人等待。","unresolved":[]}</scene>'
            + '<npc_candidate>null</npc_candidate>',
    };
    const display = getGroupDisplaySegments(content, room);
    assert.deepEqual(display.map(segment => segment.speakerName), ['IU', 'Jennie']);
    const history = contentToGroupHistoryText(content, room);
    assert.equal(history.includes('<scene>'), false);
    assert.equal(history.includes('present_member_ids'), false);
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

test('group memory perspectives stay with the humans who actually remember them', () => {
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

    manager.applyEpisodicMemorySummary(room.id, [{
        kind: 'vulnerability',
        title: '只告訴 IU 的心事',
        summary: '使用者在單獨相處時向 IU 說出一件脆弱的心事。',
        participants: ['iu'],
        subjectIds: ['iu'],
        knowerIds: ['iu'],
        visibility: 'restricted',
        importance: 5,
        sceneId: 'scene-private',
        sourceMessageIds: ['message-private'],
        unresolved: true,
        perspectives: [{
            memberId: 'iu',
            salience: 5,
            knowledge: 'experienced',
            summary: 'IU 記得使用者只把這份脆弱交給自己。',
        }],
    }], 12, 3);

    const restored = new RoomManager().getRoom(room.id)!;
    assert.equal(restored.members.find(item => item.id === 'iu')?.memories.length, 1);
    assert.equal(restored.members.find(item => item.id === 'jennie')?.memories.length, 0);
    assert.deepEqual(restored.sharedMemories[0].knowerIds, ['iu']);
    assert.equal(restored.sharedMemories[0].visibility, 'restricted');

    const prompt = buildGroupSystemPrompt(restored, '你記得我說過的害怕嗎？');
    assert.equal(prompt.match(/只把這份脆弱交給自己/gu)?.length, 1);
    assert.doesNotMatch(prompt, /ROOM-WIDE memory\.md[^]*只把這份脆弱交給自己/u);
});

test('manual ownership correction adds and removes per-character memory copies', () => {
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
    manager.addEpisodicMemories(room.id, [{
        kind: 'event',
        title: '共同早餐',
        summary: 'IU 記得這頓早餐。',
        participants: ['iu'],
        knowerIds: ['iu'],
        perspectives: [{
            memberId: 'iu',
            salience: 4,
            knowledge: 'experienced',
            summary: 'IU 親歷了早餐。',
        }],
    }]);
    const memoryId = manager.getRoom(room.id)!.sharedMemories[0].id;

    manager.setMemoryKnowerIds(room.id, memoryId, ['iu', 'jennie']);
    let updated = manager.getRoom(room.id)!;
    assert.equal(updated.members.find(item => item.id === 'jennie')?.memories[0].summary, 'IU 記得這頓早餐。');

    manager.setMemoryKnowerIds(room.id, memoryId, ['jennie']);
    updated = manager.getRoom(room.id)!;
    assert.equal(updated.members.find(item => item.id === 'iu')?.memories.length, 0);
    assert.equal(updated.members.find(item => item.id === 'jennie')?.memories.length, 1);
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


test('Memory V5 deep recall expands present-member memory without leaking absent-member private memory', () => {
    const room = createRoom();
    const iu = room.members.find(item => item.id === 'iu')!;
    const irene = room.members.find(item => item.id === 'irene')!;

    const makePrivateMemory = (id: string, ownerId: string, label: string) => ({
        id,
        kind: 'event' as const,
        title: label,
        summary: '一段只屬於該角色的旅行細節。',
        participants: [ownerId],
        subjectIds: [ownerId],
        knowerIds: [ownerId],
        visibility: 'restricted' as const,
        importance: 3,
        sourceMessageIds: [`source-${id}`],
        searchTags: ['旅行', label],
        createdAt: Number(id.match(/\d+/)?.[0] || 1),
        pinned: false,
    });

    iu.memories = Array.from({ length: 10 }, (_, index) => (
        makePrivateMemory(`iu-${index + 1}`, 'iu', `IU記憶-${index + 1}`)
    ));
    irene.memories = Array.from({ length: 10 }, (_, index) => (
        makePrivateMemory(`irene-${index + 1}`, 'irene', `IRENE私密-${index + 1}`)
    ));

    const ordinary = buildGroupSystemPrompt(room, '旅行計劃點？');
    const deep = buildGroupSystemPrompt(room, '你仲記唔記得以前旅行嘅細節？');

    assert.equal(ordinary.match(/IU記憶-/gu)?.length, 7);
    assert.equal(deep.match(/IU記憶-/gu)?.length, 10);
    assert.equal(ordinary.match(/IRENE私密-/gu)?.length || 0, 0);
    assert.equal(deep.match(/IRENE私密-/gu)?.length || 0, 0);
});


test('group parser preserves an opening dialogue quote when the matching close quote is inside the line', () => {
    const room = createRoom();
    const parsed = parseGroupGeneration(
        '<chat>IU：「你返嚟啦。」她笑住望住你。</chat>',
        room,
        'iu',
    );

    const dialogue = parsed.segments.find(segment => segment.type === 'dialogue');
    assert.ok(dialogue && dialogue.type === 'dialogue');
    assert.equal(dialogue.text, '「你返嚟啦。」她笑住望住你。');
});
