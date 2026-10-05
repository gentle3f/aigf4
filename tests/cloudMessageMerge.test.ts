import assert from 'node:assert/strict';
import test from 'node:test';
import { findLocallyDeletedIndexedKeys, mergeChatHistoryMaps } from '../cloudMessageMerge.js';

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


test('safe cloud merge keeps genuinely new cloud messages but does not resurrect locally deleted known messages', () => {
    const local = {
        room: [
            { id: 'keep', createdAt: 20, role: 'user' as const, content: { text: 'keep local' } },
        ],
    };
    const cloud = {
        room: [
            { id: 'deleted', createdAt: 10, role: 'model' as const, content: { text: 'stale deleted' } },
            { id: 'keep', createdAt: 20, role: 'user' as const, content: { text: 'old cloud keep' } },
            { id: 'new-cloud', createdAt: 30, role: 'model' as const, content: { text: 'new from another device' } },
        ],
    };

    const merged = mergeChatHistoryMaps(local, cloud, {
        previousMessageIndex: {
            ['room\u0000deleted']: 'old-hash',
            ['room\u0000keep']: 'keep-hash',
        },
        previousConversationIndex: { room: '1' },
    });

    assert.deepEqual(merged.room.map(message => message.id), ['keep', 'new-cloud']);
    assert.equal(merged.room[0].content.text, 'keep local');
});

test('safe cloud merge does not resurrect a locally deleted known conversation', () => {
    const merged = mergeChatHistoryMaps(
        {
            localRoom: [{ id: 'local', createdAt: 2, role: 'user', content: { text: 'local' } }],
        },
        {
            deletedRoom: [{ id: 'stale', createdAt: 1, role: 'model', content: { text: 'stale' } }],
            brandNewRoom: [{ id: 'fresh', createdAt: 3, role: 'model', content: { text: 'fresh' } }],
        },
        {
            previousConversationIndex: {
                deletedRoom: '1',
                localRoom: '1',
            },
        },
    );

    assert.equal(merged.deletedRoom, undefined);
    assert.deepEqual(merged.brandNewRoom.map(message => message.id), ['fresh']);
    assert.deepEqual(merged.localRoom.map(message => message.id), ['local']);
});


test('indexed deletion helper distinguishes known deletions from new unseen state', () => {
    const deleted = findLocallyDeletedIndexedKeys(
        {
            'persona:deleted': '1',
            'persona:keep': '1',
        },
        ['persona:keep', 'persona:new'],
    );

    assert.deepEqual([...deleted], ['persona:deleted']);
});

test('missing state baseline never treats unseen local absence as a deletion', () => {
    const deleted = findLocallyDeletedIndexedKeys(
        {},
        ['persona:local', 'room:local'],
    );

    assert.deepEqual([...deleted], []);
});
