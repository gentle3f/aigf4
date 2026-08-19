import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeChatHistoryMaps } from '../cloudMessageMerge.js';

test('cloud recovery keeps local-only and cloud-only messages', () => {
    const localOnly = { id: 'local', createdAt: 30, role: 'user' as const, content: { text: '本機新訊息' } };
    const cloudOnly = { id: 'cloud', createdAt: 20, role: 'model' as const, content: { text: '雲端舊訊息' } };
    const sharedLocal = { id: 'shared', createdAt: 10, role: 'user' as const, content: { text: '本機版本' } };
    const sharedCloud = { ...sharedLocal, content: { text: '雲端版本' } };

    const merged = mergeChatHistoryMaps(
        { room: [sharedLocal, localOnly] },
        { room: [sharedCloud, cloudOnly] },
    );

    assert.deepEqual(merged.room.map(message => message.id), ['shared', 'cloud', 'local']);
    assert.equal(merged.room[0].content.text, '本機版本');
});

test('cloud recovery preserves conversations that exist on only one side', () => {
    const merged = mergeChatHistoryMaps(
        { localRoom: [{ id: 'a', role: 'user', content: { text: 'A' } }] },
        { cloudRoom: [{ id: 'b', role: 'model', content: { text: 'B' } }] },
    );
    assert.deepEqual(Object.keys(merged).sort(), ['cloudRoom', 'localRoom']);
});
