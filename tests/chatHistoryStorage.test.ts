import assert from 'node:assert/strict';
import test from 'node:test';
import {
    decodeChatHistoryStorage,
    encodeChatHistoryStorage,
    isCompressedChatHistoryStorage,
} from '../chatHistoryStorage.js';

test('compresses chat history while preserving every message exactly', () => {
    const history = {
        room: Array.from({ length: 120 }, (_, index) => ({
            id: `message-${index}`,
            role: index % 2 ? 'model' : 'user',
            content: { text: `這是一段需要永久保留的對話內容 ${index}。`.repeat(3) },
        })),
    };
    const plain = JSON.stringify(history);
    const encoded = encodeChatHistoryStorage(history);

    assert.equal(isCompressedChatHistoryStorage(encoded), true);
    assert.ok(encoded.length < plain.length * 0.55);
    assert.deepEqual(decodeChatHistoryStorage(encoded), history);
});

test('still reads legacy uncompressed chat history', () => {
    const legacy = { room: [{ role: 'user', content: { text: '舊資料' } }] };
    assert.deepEqual(decodeChatHistoryStorage(JSON.stringify(legacy)), legacy);
});
