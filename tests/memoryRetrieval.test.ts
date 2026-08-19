import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
