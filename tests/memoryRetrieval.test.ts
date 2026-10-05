import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getMemoryRecallLimit,
    isDeepMemoryRecallQuery,
    scoreMemoryForQuery,
    selectRelevantArchivedTurns,
    selectRelevantMemories,
} from '../memoryRetrieval.js';

test('older verbatim turns are recalled only for an explicit past reference', () => {
    const turns = [
        { id: 'breakfast', userText: '今日早餐食多士。', replyText: '好，我幫你沖咖啡。' },
        { id: 'beach', userText: '上次在海邊，你答應會陪我看日出。', replyText: '我記得這個約定。' },
        { id: 'work', userText: '今天工作很忙。', replyText: '先休息一下。' },
    ];

    assert.deepEqual(selectRelevantArchivedTurns(turns, '今晚吃甚麼？'), []);
    assert.deepEqual(
        selectRelevantArchivedTurns(turns, '你還記得我們在海邊的日出約定嗎？').map(turn => turn.id),
        ['beach'],
    );
});

test('memory retrieval favours query relevance without losing core memories', () => {
    const entries = [
        { id: 'core', kind: 'relationship' as const, title: '安全感', summary: '不要突然離開。', createdAt: 1, pinned: true, importance: 5 },
        { id: 'tea', kind: 'preference' as const, title: '飲茶', summary: '使用者喜歡凍檸茶。', createdAt: 2, pinned: false, importance: 3 },
        { id: 'beach', kind: 'promise' as const, title: '海邊日出', summary: '答應一起到海邊看日出。', createdAt: 3, pinned: false, importance: 4 },
    ];

    const selected = selectRelevantMemories(entries, '還記得海邊日出嗎', 2);
    assert.deepEqual(selected.map(entry => entry.id), ['core', 'beach']);
});


test('vague explicit past recall falls back to the nearest older evidence', () => {
    const turns = [
        { id: 'old-1', userText: '第一件舊事。', replyText: '記錄一。' },
        { id: 'old-2', userText: '第二件舊事。', replyText: '記錄二。' },
        { id: 'old-3', userText: '第三件舊事。', replyText: '記錄三。' },
        { id: 'old-4', userText: '第四件舊事。', replyText: '記錄四。' },
    ];
    assert.deepEqual(
        selectRelevantArchivedTurns(turns, '你仲記唔記得上次？', 3).map(turn => turn.id),
        ['old-2', 'old-3', 'old-4'],
    );
    assert.deepEqual(selectRelevantArchivedTurns(turns, '今日食咩？', 3), []);
});

test('memory V5 search tags can recall an alias missing from visible title and summary', () => {
    const now = Date.now();
    const tagged = {
        id: 'tagged',
        kind: 'promise' as const,
        title: '旅行約定',
        summary: '答應會再回到那間酒店完成未完成的計劃。',
        searchTags: ['okinawa', '沖繩', 'sunrise'],
        createdAt: now - 20 * 86_400_000,
        pinned: false,
        importance: 4,
    };
    const unrelated = {
        id: 'recent',
        kind: 'event' as const,
        title: '今日午餐',
        summary: '一起吃了意粉。',
        createdAt: now,
        pinned: false,
        importance: 4,
    };
    assert.ok(
        scoreMemoryForQuery(tagged, '仲記得 Okinawa 嗰次嗎？', now)
            > scoreMemoryForQuery(unrelated, '仲記得 Okinawa 嗰次嗎？', now),
    );
    assert.deepEqual(
        selectRelevantMemories([unrelated, tagged], '仲記得 Okinawa 嗰次嗎？', 1)
            .map(entry => entry.id),
        ['tagged'],
    );
});

test('deep recall expands limits only when the user explicitly refers to the past', () => {
    assert.equal(isDeepMemoryRecallQuery('今日想去邊？'), false);
    assert.equal(isDeepMemoryRecallQuery('你記唔記得以前我哋去過邊？'), true);
    assert.equal(getMemoryRecallLimit('今日想去邊？', 12, 24), 12);
    assert.equal(getMemoryRecallLimit('你記唔記得以前我哋去過邊？', 12, 24), 24);
});


test('specific deep recall does not substitute unrelated older turns when the topic is absent', () => {
    const turns = [
        { id: 'beach', userText: '我哋去海邊睇日出。', replyText: '嗰日好大風。' },
        { id: 'breakfast', userText: '我哋食咗早餐。', replyText: '你飲咗咖啡。' },
    ];
    assert.deepEqual(
        selectRelevantArchivedTurns(turns, '你記唔記得我哋巴黎嗰次？', 6),
        [],
    );
});
