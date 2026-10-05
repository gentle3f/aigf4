import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRemoteStateEntities } from '../cloudMessageMerge.js';

test('safe state merge filters known local deletions but keeps genuinely unseen remote entities', () => {
    const filtered = filterRemoteStateEntities(
        {
            'deleted-known': { name: 'Deleted Known' },
            'remote-new': { name: 'Remote New' },
            'local-keep': { name: 'Remote Older Local Keep' },
        },
        [
            { id: 'deleted-known-room' },
            { id: 'remote-new-room' },
            { id: 'local-room' },
        ],
        {
            locallyDeletedStateEntities: new Set([
                'persona:deleted-known',
                'room:deleted-known-room',
            ]),
            localPersonas: {
                'local-keep': { name: 'Local Keep' },
            },
        },
    );

    assert.deepEqual(Object.keys(filtered.customPersonas).sort(), [
        'local-keep',
        'remote-new',
    ]);
    assert.deepEqual(
        filtered.rooms.map(room => room.id).sort(),
        ['local-room', 'remote-new-room'],
    );
});

test('custom conversation deletion fallback and room tombstones still suppress remote resurrection', () => {
    const filtered = filterRemoteStateEntities(
        {
            custom_deleted: { name: 'Old Custom' },
            custom_keep: { name: 'Keep' },
        },
        [
            { id: 'room-deleted' },
            { id: 'room-keep' },
        ],
        {
            locallyDeletedConversations: new Set(['custom_deleted']),
            localPersonas: {
                custom_keep: { name: 'Keep' },
            },
            deletedRoomIds: new Set(['room-deleted']),
        },
    );

    assert.deepEqual(Object.keys(filtered.customPersonas), ['custom_keep']);
    assert.deepEqual(filtered.rooms.map(room => room.id), ['room-keep']);
});

test('missing state baseline does not delete remote-only state merely because it is absent locally', () => {
    const filtered = filterRemoteStateEntities(
        {
            'remote-first-seen': { name: 'Remote First Seen' },
        },
        [{ id: 'remote-first-room' }],
        {
            locallyDeletedStateEntities: new Set(),
            localPersonas: {},
        },
    );

    assert.deepEqual(Object.keys(filtered.customPersonas), ['remote-first-seen']);
    assert.deepEqual(filtered.rooms.map(room => room.id), ['remote-first-room']);
});
