import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildMemoryTurnBatches,
    buildPersonaAutoMemoryMessages,
    buildRoomAutoMemoryMessages,
    parsePersonaAutoMemoryResponse,
    parseRoomAutoMemoryResponse,
    PERSONA_MEMORY_RESPONSE_FORMAT,
    ROOM_MEMORY_RESPONSE_FORMAT,
} from '../autoMemory.js';

test('cold auto-memory builders preserve schemas and evidence-bearing prompts', () => {
    assert.equal(ROOM_MEMORY_RESPONSE_FORMAT.json_schema.name, 'room_memory_update_v3');
    assert.equal(PERSONA_MEMORY_RESPONSE_FORMAT.json_schema.name, 'persona_memory_update_v3');

    const roomMessages = buildRoomAutoMemoryMessages(
        'member-a=Aster, member-b=Beryl',
        '- [promise] 早餐: 明早一起吃早餐',
        '[MESSAGE_ID=m1][SCENE_ID=s1][USER]\n我明早想一齊食早餐。',
    );
    assert.equal(roomMessages.length, 2);
    assert.match(String(roomMessages[0]?.content), /member-a=Aster, member-b=Beryl/);
    assert.match(String(roomMessages[0]?.content), /Existing memory\.md entries/);
    assert.match(String(roomMessages[1]?.content), /MESSAGE_ID=m1/);

    const personaMessages = buildPersonaAutoMemoryMessages(
        'Aster',
        '- [preference] 咖啡: 使用者鍾意黑咖啡',
        '[MESSAGE_ID=p1][SCENE_ID=main][USER]\n我飲黑咖啡。',
    );
    assert.equal(personaMessages.length, 2);
    assert.match(String(personaMessages[0]?.content), /Aster's meticulous long-term human-memory archivist/);
    assert.match(String(personaMessages[0]?.content), /Existing memory\.md entries/);
    assert.match(String(personaMessages[1]?.content), /MESSAGE_ID=p1/);
});

test('rejects the singular memory envelope returned by an incompatible model', () => {
    assert.equal(
        parsePersonaAutoMemoryResponse('{"memory":"The user likes oranges."}'),
        null,
    );
});

test('accepts a valid persona memory envelope', () => {
    assert.deepEqual(
        parsePersonaAutoMemoryResponse(JSON.stringify({
            memories: [{ kind: 'preference', title: '喜歡橙', summary: '使用者最喜歡的水果是橙。' }],
        })),
        [{ kind: 'preference', title: '喜歡橙', summary: '使用者最喜歡的水果是橙。' }],
    );
});

test('resolves room participant names and IDs to canonical member IDs', () => {
    const aliases = new Map([
        ['iu', 'member-iu'],
        ['member-iu', 'member-iu'],
        ['jennie', 'member-jennie'],
        ['member-jennie', 'member-jennie'],
    ]);
    assert.deepEqual(
        parseRoomAutoMemoryResponse(JSON.stringify({
            memories: [{
                kind: 'promise',
                title: '一起吃早餐',
                summary: 'IU 答應明早一起吃早餐。',
                participants: ['IU', 'member-jennie'],
            }],
        }), aliases),
        [{
            kind: 'promise',
            title: '一起吃早餐',
            summary: 'IU 答應明早一起吃早餐。',
            participants: ['member-iu', 'member-jennie'],
            subjectIds: ['member-iu', 'member-jennie'],
            knowerIds: ['member-iu', 'member-jennie'],
        }],
    );
});

test('keeps a durable group memory inside the correct character mind', () => {
    const aliases = new Map([
        ['rose', 'member-rose'],
        ['member-rose', 'member-rose'],
        ['jennie', 'member-jennie'],
        ['member-jennie', 'member-jennie'],
    ]);
    const parsed = parseRoomAutoMemoryResponse(JSON.stringify({
        memories: [{
            kind: 'vulnerability',
            title: 'Rose 聽見使用者的脆弱分享',
            shared_summary: '使用者只向 Rose 說明自己害怕被離下。',
            subject_ids: ['Rose'],
            importance: 5,
            visibility: 'restricted',
            unresolved: true,
            scene_id: 'scene-private',
            source_message_ids: ['message-7'],
            perspectives: [{
                member_id: 'Rose',
                salience: 5,
                knowledge: 'experienced',
                memory: 'Rose 記得使用者把這份害怕只交給自己，往後不能輕率離開。',
            }],
        }],
    }), aliases, new Set(['message-7']));

    assert.deepEqual(parsed?.[0].subjectIds, ['member-rose']);
    assert.deepEqual(parsed?.[0].knowerIds, ['member-rose']);
    assert.equal(parsed?.[0].perspectives?.[0].memberId, 'member-rose');
    assert.equal(parsed?.[0].sourceMessageIds?.[0], 'message-7');
    assert.equal(parsed?.[0].importance, 5);
});

test('rejects invented source IDs instead of creating untraceable memory', () => {
    const parsed = parsePersonaAutoMemoryResponse(JSON.stringify({
        memories: [{
            kind: 'promise',
            title: '不存在的約定',
            summary: '這項內容沒有逐字來源。',
            source_message_ids: ['invented-id'],
        }],
    }), new Set(['real-id']));
    assert.equal(parsed, null);
});

test('memory batching overlaps automatic checkpoints and can rescan the full history', () => {
    const history = Array.from({ length: 40 }, (_, index) => ([
        { role: 'user', text: `user-${index + 1}` },
        { role: 'model', text: `model-${index + 1}` },
    ])).flat();

    const automatic = buildMemoryTurnBatches(history, 12, 'auto');
    assert.equal(automatic[0].fromUserMessageCount, 11);
    assert.equal(automatic.at(-1)?.throughUserMessageCount, 40);

    const recent = buildMemoryTurnBatches(history, 40, 'recent');
    assert.equal(recent[0].fromUserMessageCount, 9);
    assert.equal(recent.at(-1)?.throughUserMessageCount, 40);

    const full = buildMemoryTurnBatches(history, 40, 'full');
    assert.equal(full[0].fromUserMessageCount, 1);
    assert.equal(full.at(-1)?.throughUserMessageCount, 40);
});


test('memory V5 preserves search tags from auto-memory extraction', () => {
    assert.deepEqual(
        parsePersonaAutoMemoryResponse(JSON.stringify({
            memories: [{
                kind: 'promise',
                title: '沖繩日出',
                summary: '答應下次一起看日出。',
                search_tags: ['沖繩', 'Okinawa', '日出'],
            }],
        })),
        [{
            kind: 'promise',
            title: '沖繩日出',
            summary: '答應下次一起看日出。',
            searchTags: ['沖繩', 'Okinawa', '日出'],
        }],
    );

    const personaSystem = String(buildPersonaAutoMemoryMessages(
        'Aster',
        '',
        '[MESSAGE_ID=p1][SCENE_ID=main][USER]\n下次去沖繩睇日出。',
    )[0]?.content);
    assert.match(personaSystem, /search_tags/);
    assert.match(JSON.stringify(PERSONA_MEMORY_RESPONSE_FORMAT), /search_tags/);
    assert.match(JSON.stringify(ROOM_MEMORY_RESPONSE_FORMAT), /search_tags/);
});
