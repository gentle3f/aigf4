import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildMemorySearchTags,
    mergeMemorySearchTags,
} from '../memoryIndex.js';

test('memory index keeps semantic aliases while deduplicating generic noise', () => {
    const tags = buildMemorySearchTags(
        '沖繩酒店約定',
        '兩人約定下次回到同一間酒店會一起看日出。',
        'promise',
        ['Okinawa', '日出', 'promise', 'memory', 'Okinawa'],
    );
    assert.ok(tags.includes('okinawa'));
    assert.ok(tags.includes('日出'));
    assert.ok(tags.includes('承諾'));
    assert.equal(tags.includes('memory'), false);
    assert.equal(tags.filter(tag => tag === 'okinawa').length, 1);
});

test('memory index merge preserves old and new aliases without duplicates', () => {
    assert.deepEqual(
        mergeMemorySearchTags(['okinawa', '日出'], ['日出', 'hotel']),
        ['okinawa', '日出', 'hotel'],
    );
});


test('memory index stays compact enough for long-lived local storage', () => {
    const tags = buildMemorySearchTags(
        '很長的旅行事件標題',
        '這是一段包含很多人物地點物件承諾偏好界線與其他細節的長摘要，用來測試索引不會無限制膨脹。',
        'event',
        Array.from({ length: 30 }, (_, index) => `alias-${index + 1}`),
    );
    assert.ok(tags.length <= 12);
    assert.ok(tags.every(tag => tag.length <= 60));
});
