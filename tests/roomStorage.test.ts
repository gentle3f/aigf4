import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Persona } from '../managers.js';
import { ChatRoom, cloneRoomSnapshot, RoomManager } from '../roomManager.js';
import { readRoomRecovery, saveRoomRecovery } from '../roomRecoveryStore.js';
import {
    decodeRoomStorage,
    encodeRoomStorage,
    isCompressedRoomStorage,
} from '../roomStorage.js';

const persona = (name: string, avatarUrl: string | null = null): Persona => ({
    name,
    emoji: '*',
    gender: 'female',
    description: `${name} description`,
    prompt: `${name} prompt`,
    greeting: `${name} greeting`,
    avatarPrompt: '',
    avatarUrl,
});

const room = (id = 'room-source'): ChatRoom => ({
    id,
    type: 'group',
    title: 'Storage test room',
    description: 'Storage test',
    leadMemberId: 'one',
    members: [
        {
            id: 'one',
            avatarAssetKey: 'room-avatar:room-source:one',
            persona: persona('One', `data:image/jpeg;base64,${'A'.repeat(12_000)}`),
            joinedAt: 1,
            soul: [],
            memories: [],
        },
        {
            id: 'two',
            persona: persona('Two'),
            joinedAt: 1,
            soul: [],
            memories: [],
        },
    ],
    scene: {
        id: 'scene-1',
        location: 'home',
        realityLayer: 'physical',
        realityEpochId: 'epoch-physical',
        presentMemberIds: ['one', 'two'],
        summary: 'A long-running conversation continues here. '.repeat(120),
        unresolved: [],
        startedAt: 1,
    },
    sharedSoul: [],
    sharedMemories: [],
    createdAt: 1,
    updatedAt: 1,
    lastSummarizedUserMessageCount: 0,
});

const installStorage = (shouldThrow?: (key: string) => boolean) => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => values.get(key) || null,
            setItem: (key: string, value: string) => {
                if (shouldThrow?.(key)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
                values.set(key, value);
            },
            removeItem: (key: string) => values.delete(key),
        },
    });
    return values;
};

test('room storage is compressed and remains backward compatible with plain JSON', () => {
    const value = { version: 2, rooms: [room()] };
    const encoded = encodeRoomStorage(value);

    assert.equal(isCompressedRoomStorage(encoded), true);
    assert.deepEqual(decodeRoomStorage(encoded), value);
    assert.deepEqual(decodeRoomStorage(JSON.stringify(value)), value);
    assert.ok(encoded.length < JSON.stringify(value).length / 2);
});

test('room persistence stores only a private avatar reference', () => {
    const values = installStorage();
    const manager = new RoomManager();
    manager.saveRoom(room());

    const raw = values.get('aigf4RoomsV2')!;
    const stored = decodeRoomStorage<{ rooms: ChatRoom[] }>(raw).rooms[0];
    assert.equal(isCompressedRoomStorage(raw), true);
    assert.equal(stored.members[0].persona.avatarUrl, 'private-avatar:room-avatar:room-source:one');
    assert.equal(raw.includes('data:image/'), false);
    assert.match(manager.getRoom('room-source')!.members[0].persona.avatarUrl!, /^data:image\//u);
});

test('failed branch persistence rolls back the in-memory room', () => {
    let rejectRoomWrites = false;
    installStorage(key => rejectRoomWrites && key === 'aigf4RoomsV2');
    const manager = new RoomManager();
    const source = manager.saveRoom(room());
    const branch = cloneRoomSnapshot(source);
    branch.id = 'room-branch';
    branch.title = 'Branch';
    rejectRoomWrites = true;

    assert.throws(() => manager.saveRoom(branch), /Quota exceeded/u);
    assert.equal(manager.getRoom('room-branch'), undefined);
    assert.equal(manager.getRoom('room-source')?.title, 'Storage test room');
});

test('a physical turn snapshot remains physical after the live room enters texting', () => {
    const liveRoom = room();
    const beforeTurn = cloneRoomSnapshot(liveRoom.scene);

    liveRoom.scene.realityLayer = 'texting';
    liveRoom.scene.location = 'private chat';

    assert.equal(beforeTurn.realityLayer, 'physical');
    assert.equal(beforeTurn.location, 'home');
});

test('scene snapshot preserves location and summary after later live scene changes', () => {
    const liveRoom = room();
    const beforeTurn = cloneRoomSnapshot(liveRoom.scene);

    liveRoom.scene.location = 'new location';
    liveRoom.scene.summary = 'A different scene summary.';

    assert.equal(beforeTurn.location, 'home');
    assert.equal(beforeTurn.summary, room().scene.summary);
});

test('scene snapshot preserves nested member and unresolved arrays', () => {
    const liveRoom = room();
    liveRoom.scene.unresolved = ['first unresolved detail'];
    const beforeTurn = cloneRoomSnapshot(liveRoom.scene);

    liveRoom.scene.presentMemberIds.push('later-member');
    liveRoom.scene.unresolved.push('later unresolved detail');

    assert.deepEqual(beforeTurn.presentMemberIds, ['one', 'two']);
    assert.deepEqual(beforeTurn.unresolved, ['first unresolved detail']);
});

test('scene snapshot preserves nested wardrobe state', () => {
    const liveRoom = room();
    liveRoom.scene.wardrobe = {
        user: 'navy shirt',
        characters: { one: 'white dress', two: 'denim jacket' },
    };
    const beforeTurn = cloneRoomSnapshot(liveRoom.scene);

    liveRoom.scene.wardrobe.user = 'black coat';
    liveRoom.scene.wardrobe.characters.one = 'red dress';
    liveRoom.scene.wardrobe.characters.three = 'new outfit';

    assert.deepEqual(beforeTurn.wardrobe, {
        user: 'navy shirt',
        characters: { one: 'white dress', two: 'denim jacket' },
    });
});

test('sequential scene snapshots preserve their original reality layer, id, and start time', () => {
    const liveRoom = room();
    const physicalA = cloneRoomSnapshot(liveRoom.scene);

    liveRoom.scene = {
        ...liveRoom.scene,
        id: 'scene-2',
        realityLayer: 'texting',
        startedAt: 2,
    };
    const textingB = cloneRoomSnapshot(liveRoom.scene);

    liveRoom.scene = {
        ...liveRoom.scene,
        id: 'scene-3',
        realityLayer: 'physical',
        startedAt: 3,
    };
    const physicalC = cloneRoomSnapshot(liveRoom.scene);

    assert.deepEqual(
        [physicalA, textingB, physicalC].map(snapshot => ({
            id: snapshot.id,
            realityLayer: snapshot.realityLayer,
            startedAt: snapshot.startedAt,
        })),
        [
            { id: 'scene-1', realityLayer: 'physical', startedAt: 1 },
            { id: 'scene-2', realityLayer: 'texting', startedAt: 2 },
            { id: 'scene-3', realityLayer: 'physical', startedAt: 3 },
        ],
    );
});

test('a legacy room receives one persisted current reality epoch without rewriting legacy turn snapshots', () => {
    const values = installStorage();
    const legacyRoom = room('legacy-room');
    delete legacyRoom.scene.realityEpochId;
    const legacyHistory = [{ role: 'user' as const, content: { text: 'old turn', roomSceneBeforeTurn: { ...legacyRoom.scene } } }];
    values.set('aigf4RoomsV2', encodeRoomStorage({ version: 2, rooms: [legacyRoom] }));

    const manager = new RoomManager();
    const epoch = manager.getRoom('legacy-room')!.scene.realityEpochId;
    const persisted = decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0];

    assert.ok(epoch?.trim());
    assert.equal(persisted.scene.realityEpochId, epoch);
    assert.equal(legacyHistory[0].content.roomSceneBeforeTurn?.realityEpochId, undefined);
});

test('reality epoch rotates only when the room reality layer changes', () => {
    installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('epoch-rotation'));
    const physicalEpoch = saved.scene.realityEpochId;

    const texting = manager.updateRoom(saved.id, editable => {
        editable.scene.realityLayer = 'texting';
    })!;
    const textingEpoch = texting.scene.realityEpochId;
    const physical = manager.updateRoom(saved.id, editable => {
        editable.scene.realityLayer = 'physical';
    })!;

    assert.notEqual(textingEpoch, physicalEpoch);
    assert.notEqual(physical.scene.realityEpochId, textingEpoch);
    assert.notEqual(physical.scene.realityEpochId, physicalEpoch);
});

test('same-layer room updates preserve the current reality epoch', () => {
    installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('epoch-stable'));
    const epoch = saved.scene.realityEpochId;

    const updated = manager.updateRoom(saved.id, editable => {
        editable.scene.location = 'different location';
        editable.scene.summary = 'different summary';
        editable.scene.presentMemberIds = ['one'];
        editable.scene.wardrobe = { user: 'blue shirt', characters: { one: 'black dress' } };
    })!;

    assert.equal(updated.scene.realityEpochId, epoch);
});

test('user-turn epoch snapshots remain immutable after a later reality transition', () => {
    installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('epoch-snapshot'));
    const beforeTurn = cloneRoomSnapshot(saved.scene);
    const updated = manager.updateRoom(saved.id, editable => {
        editable.scene.realityLayer = 'texting';
    })!;

    assert.notEqual(updated.scene.realityEpochId, beforeTurn.realityEpochId);
    assert.equal(beforeTurn.realityEpochId, saved.scene.realityEpochId);
});

test('reality epoch survives local persistence and export/import roundtrips', () => {
    const values = installStorage();
    const source = new RoomManager();
    const saved = source.saveRoom(room('epoch-roundtrip'));
    const epoch = saved.scene.realityEpochId;
    const reloaded = new RoomManager();
    assert.equal(reloaded.getRoom(saved.id)?.scene.realityEpochId, epoch);

    const imported = new RoomManager();
    imported.importData(reloaded.exportData(), true);
    assert.equal(imported.getRoom(saved.id)?.scene.realityEpochId, epoch);
    assert.ok(values.get('aigf4RoomsV2'));
});

test('deferred scene persistence updates live state immediately and becomes durable on flush', () => {
    const values = installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('deferred-scene'));
    const before = decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0];

    const nextScene = {
        ...cloneRoomSnapshot(saved.scene),
        location: 'rooftop',
        summary: 'The conversation has moved to the rooftop.',
    };
    const updated = manager.updateRoomSceneDeferred(saved.id, nextScene)!;

    assert.equal(updated.scene.location, 'rooftop');
    assert.equal(manager.getRoom(saved.id)?.scene.summary, 'The conversation has moved to the rooftop.');
    assert.equal(before.scene.location, 'home');
    assert.equal(
        decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0].scene.location,
        'home',
    );

    assert.equal(manager.flushDeferredPersistence(), true);
    assert.equal(
        decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0].scene.location,
        'rooftop',
    );
    assert.equal(new RoomManager().getRoom(saved.id)?.scene.location, 'rooftop');
});

test('deferred scene persistence coalesces to the newest live scene', () => {
    const values = installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('deferred-coalesce'));

    manager.updateRoomSceneDeferred(saved.id, {
        ...cloneRoomSnapshot(saved.scene),
        location: 'first',
        summary: 'first',
    });
    manager.updateRoomSceneDeferred(saved.id, {
        ...cloneRoomSnapshot(saved.scene),
        location: 'second',
        summary: 'second',
    });

    assert.equal(manager.getRoom(saved.id)?.scene.location, 'second');
    assert.equal(manager.flushDeferredPersistence(), true);

    const persisted = decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0];
    assert.equal(persisted.scene.location, 'second');
    assert.equal(persisted.scene.summary, 'second');
});

test('deferred scene persistence failure keeps the accepted live scene in memory', () => {
    let rejectRoomWrites = false;
    const values = installStorage(key => rejectRoomWrites && key === 'aigf4RoomsV2');
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('deferred-failure'));
    rejectRoomWrites = true;

    const updated = manager.updateRoomSceneDeferred(saved.id, {
        ...cloneRoomSnapshot(saved.scene),
        location: 'live-only',
        summary: 'visible accepted scene',
    })!;

    assert.equal(updated.scene.location, 'live-only');
    assert.equal(manager.flushDeferredPersistence(), false);
    assert.equal(manager.getRoom(saved.id)?.scene.location, 'live-only');
    assert.equal(
        decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0].scene.location,
        'home',
    );
});

test('a later synchronous room update durably includes and clears a pending scene checkpoint', () => {
    const values = installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('deferred-then-sync'));

    manager.updateRoomSceneDeferred(saved.id, {
        ...cloneRoomSnapshot(saved.scene),
        location: 'pending-location',
        summary: 'pending scene',
    });
    manager.updateRoom(saved.id, editable => {
        editable.description = 'synchronous room edit';
    });

    const persisted = decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0];
    assert.equal(persisted.scene.location, 'pending-location');
    assert.equal(persisted.description, 'synchronous room edit');
    assert.equal(manager.flushDeferredPersistence(), true);
});


const waitForRoomRecovery = async (
    matches: (value: Awaited<ReturnType<typeof readRoomRecovery>>) => boolean,
    timeoutMs = 1000,
) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const value = await readRoomRecovery();
        if (matches(value)) return value;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Timed out waiting for room recovery state.');
};

test('failed deferred scene persistence recovers the newest accepted scene after reload', async () => {
    await saveRoomRecovery(null);
    let rejectRoomWrites = false;
    const values = installStorage(key => rejectRoomWrites && key === 'aigf4RoomsV2');
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('deferred-recovery'));

    rejectRoomWrites = true;
    manager.updateRoomSceneDeferred(saved.id, {
        ...cloneRoomSnapshot(saved.scene),
        location: 'recovery-rooftop',
        summary: 'accepted but primary storage failed',
    });
    assert.equal(manager.flushDeferredPersistence(), false);

    const recovery = await waitForRoomRecovery(value => Boolean(value));
    assert.ok(recovery);
    assert.equal(
        decodeRoomStorage<{ rooms: ChatRoom[] }>(recovery!.data).rooms[0].scene.location,
        'recovery-rooftop',
    );
    assert.equal(
        decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0].scene.location,
        'home',
    );

    rejectRoomWrites = false;
    const reloaded = new RoomManager();
    assert.equal(reloaded.getRoom(saved.id)?.scene.location, 'home');
    assert.equal(await reloaded.restoreRoomRecovery(), true);
    assert.equal(reloaded.getRoom(saved.id)?.scene.location, 'recovery-rooftop');
    assert.equal(
        decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0].scene.location,
        'recovery-rooftop',
    );

    await waitForRoomRecovery(value => value === undefined);
});

test('room recovery never overwrites a newer durable room baseline', async () => {
    await saveRoomRecovery(null);
    let rejectRoomWrites = false;
    const values = installStorage(key => rejectRoomWrites && key === 'aigf4RoomsV2');
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('recovery-baseline'));

    rejectRoomWrites = true;
    manager.updateRoomSceneDeferred(saved.id, {
        ...cloneRoomSnapshot(saved.scene),
        location: 'stale-recovery',
        summary: 'stale recovery candidate',
    });
    assert.equal(manager.flushDeferredPersistence(), false);
    await waitForRoomRecovery(value => Boolean(value));

    const newer = room(saved.id);
    newer.scene.location = 'newer-durable';
    newer.scene.summary = 'a later durable source won';
    values.set('aigf4RoomsV2', encodeRoomStorage({ version: 2, rooms: [newer] }));

    rejectRoomWrites = false;
    const reloaded = new RoomManager();
    assert.equal(reloaded.getRoom(saved.id)?.scene.location, 'newer-durable');
    assert.equal(await reloaded.restoreRoomRecovery(), false);
    assert.equal(reloaded.getRoom(saved.id)?.scene.location, 'newer-durable');
    assert.equal(await readRoomRecovery(), undefined);
});


test('saveRoom rolls back durable room storage when tombstone persistence fails', () => {
    let rejectDeletedIds = false;
    const values = installStorage(key => rejectDeletedIds && key === 'aigf4DeletedRoomIdsV1');
    const manager = new RoomManager();
    const source = manager.saveRoom(room('atomic-save-source'));
    const durableBefore = values.get('aigf4RoomsV2');

    const branch = cloneRoomSnapshot(source);
    branch.id = 'atomic-save-branch';
    branch.title = 'Should not persist';

    rejectDeletedIds = true;
    assert.throws(() => manager.saveRoom(branch), /Quota exceeded/u);
    assert.equal(manager.getRoom(branch.id), undefined);
    assert.equal(values.get('aigf4RoomsV2'), durableBefore);

    rejectDeletedIds = false;
    const reloaded = new RoomManager();
    assert.ok(reloaded.getRoom(source.id));
    assert.equal(reloaded.getRoom(branch.id), undefined);
});

test('deleteRoom rolls back durable room storage when tombstone persistence fails', () => {
    let rejectDeletedIds = false;
    const values = installStorage(key => rejectDeletedIds && key === 'aigf4DeletedRoomIdsV1');
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('atomic-delete'));
    const durableBefore = values.get('aigf4RoomsV2');

    rejectDeletedIds = true;
    assert.throws(() => manager.deleteRoom(saved.id), /Quota exceeded/u);
    assert.ok(manager.getRoom(saved.id));
    assert.equal(values.get('aigf4RoomsV2'), durableBefore);

    rejectDeletedIds = false;
    const reloaded = new RoomManager();
    assert.ok(reloaded.getRoom(saved.id));
});

test('importData rolls back durable room storage when tombstone persistence fails', () => {
    let rejectDeletedIds = false;
    const values = installStorage(key => rejectDeletedIds && key === 'aigf4DeletedRoomIdsV1');
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('atomic-import-source'));
    const durableBefore = values.get('aigf4RoomsV2');

    const incoming = room('atomic-import-new');
    incoming.title = 'Incoming room';

    rejectDeletedIds = true;
    assert.throws(() => manager.importData({ version: 2, rooms: [incoming] }, true), /Quota exceeded/u);
    assert.ok(manager.getRoom(saved.id));
    assert.equal(manager.getRoom(incoming.id), undefined);
    assert.equal(values.get('aigf4RoomsV2'), durableBefore);

    rejectDeletedIds = false;
    const reloaded = new RoomManager();
    assert.ok(reloaded.getRoom(saved.id));
    assert.equal(reloaded.getRoom(incoming.id), undefined);
});


test('room recovery survives a constructor schema migration that rewrites primary storage', async () => {
    await saveRoomRecovery(null);
    const values = installStorage();

    const legacy = room('recovery-migration');
    delete (legacy.scene as Partial<ChatRoom['scene']>).realityEpochId;
    const baseline = encodeRoomStorage({ version: 2, rooms: [legacy] });
    values.set('aigf4RoomsV2', baseline);

    const recovered = cloneRoomSnapshot(legacy);
    recovered.scene.location = 'recovered-after-migration';
    recovered.scene.summary = 'recovery must survive constructor migration';
    await saveRoomRecovery({
        baseline,
        data: encodeRoomStorage({ version: 2, rooms: [recovered] }),
    });

    const manager = new RoomManager();
    const migratedPrimary = values.get('aigf4RoomsV2');
    assert.ok(migratedPrimary);
    assert.notEqual(migratedPrimary, baseline);
    assert.ok(manager.getRoom(legacy.id)?.scene.realityEpochId);

    assert.equal(await manager.restoreRoomRecovery(), true);
    assert.equal(manager.getRoom(legacy.id)?.scene.location, 'recovered-after-migration');
    assert.ok(manager.getRoom(legacy.id)?.scene.realityEpochId);
    assert.equal(
        decodeRoomStorage<{ rooms: ChatRoom[] }>(values.get('aigf4RoomsV2')!).rooms[0].scene.location,
        'recovered-after-migration',
    );
});


test('safe cloud-style room import can preserve existing local deletion tombstones', () => {
    installStorage();
    const manager = new RoomManager();
    const deleted = manager.saveRoom(room('preserved-tombstone'));
    assert.equal(manager.deleteRoom(deleted.id), true);
    assert.equal(manager.getDeletedRoomIds().has(deleted.id), true);

    const incoming = room('remote-other-room');
    manager.importData({ version: 2, rooms: [incoming] }, true, true);

    assert.equal(manager.getDeletedRoomIds().has(deleted.id), true);
    assert.ok(manager.getRoom(incoming.id));
});


test('recall rollback removes sourced room soul/memory and restores the exact pre-turn scene', () => {
    const values = installStorage();
    const manager = new RoomManager();
    const value = room('recall-effects');
    const beforeScene = {
        ...cloneRoomSnapshot(value.scene),
        location: 'before-turn',
        summary: 'The exact scene before the recalled turn.',
        realityEpochId: 'epoch-before-turn',
    };
    value.scene = {
        ...cloneRoomSnapshot(value.scene),
        location: 'after-turn',
        summary: 'The scene after the recalled turn.',
        realityEpochId: 'epoch-after-turn',
    };
    value.lastSummarizedUserMessageCount = 9;
    value.members[0].soul = [{
        id: 'soul-recall',
        kind: 'preference',
        title: 'recalled soul',
        summary: 'derived from recalled turn',
        participants: ['one'],
        subjectIds: ['one'],
        knowerIds: ['one'],
        visibility: 'restricted',
        sourceMessageIds: ['user-recall'],
        createdAt: 2,
        pinned: true,
        importance: 5,
    }];
    value.members[0].memories = [{
        id: 'memory-recall',
        kind: 'event',
        title: 'recalled memory',
        summary: 'derived from recalled turn',
        participants: ['one'],
        subjectIds: ['one'],
        knowerIds: ['one'],
        visibility: 'restricted',
        sourceMessageIds: ['user-recall', 'reply-recall'],
        createdAt: 3,
        pinned: false,
        importance: 4,
    }];
    value.sharedMemories = [cloneRoomSnapshot(value.members[0].memories[0])];

    manager.saveRoom(value);
    const removed = manager.removeMemoriesBySourceMessageIds(
        value.id,
        ['user-recall', 'reply-recall'],
        8,
        beforeScene,
    );

    const live = manager.getRoom(value.id)!;
    assert.equal(removed, 3);
    assert.equal(live.members[0].soul.length, 0);
    assert.equal(live.members[0].memories.length, 0);
    assert.equal(live.sharedMemories.length, 0);
    assert.equal(live.scene.location, 'before-turn');
    assert.equal(live.scene.summary, 'The exact scene before the recalled turn.');
    assert.equal(live.scene.realityEpochId, 'epoch-before-turn');
    assert.equal(live.lastSummarizedUserMessageCount, 8);

    const durableBeforeFlush = decodeRoomStorage<{ rooms: ChatRoom[] }>(
        values.get('aigf4RoomsV2')!,
    ).rooms[0];
    assert.equal(durableBeforeFlush.scene.location, 'after-turn');
    assert.equal(durableBeforeFlush.members[0].soul.length, 1);

    assert.equal(manager.flushDeferredPersistence(), true);
    const durableAfterFlush = decodeRoomStorage<{ rooms: ChatRoom[] }>(
        values.get('aigf4RoomsV2')!,
    ).rooms[0];
    assert.equal(durableAfterFlush.scene.location, 'before-turn');
    assert.equal(durableAfterFlush.members[0].soul.length, 0);
    assert.equal(durableAfterFlush.members[0].memories.length, 0);
    assert.equal(durableAfterFlush.sharedMemories.length, 0);
});

test('recall rollback survives room quota failure through deferred recovery', async () => {
    await saveRoomRecovery(null);
    let rejectRoomWrites = false;
    const values = installStorage(key => rejectRoomWrites && key === 'aigf4RoomsV2');
    const manager = new RoomManager();
    const value = room('recall-recovery');
    const beforeScene = {
        ...cloneRoomSnapshot(value.scene),
        location: 'pre-recall',
        summary: 'scene before recalled turn',
        realityEpochId: 'epoch-pre-recall',
    };
    value.scene = {
        ...cloneRoomSnapshot(value.scene),
        location: 'post-recall',
        summary: 'scene after recalled turn',
        realityEpochId: 'epoch-post-recall',
    };
    value.members[0].memories = [{
        id: 'memory-recovery',
        kind: 'event',
        title: 'recalled event',
        summary: 'must disappear even if primary persistence is full',
        participants: ['one'],
        subjectIds: ['one'],
        knowerIds: ['one'],
        visibility: 'restricted',
        sourceMessageIds: ['quota-user'],
        createdAt: 3,
        pinned: false,
        importance: 4,
    }];
    value.sharedMemories = [cloneRoomSnapshot(value.members[0].memories[0])];
    manager.saveRoom(value);

    rejectRoomWrites = true;
    manager.removeMemoriesBySourceMessageIds(value.id, ['quota-user'], 4, beforeScene);
    assert.equal(manager.getRoom(value.id)?.scene.location, 'pre-recall');
    assert.equal(manager.getRoom(value.id)?.members[0].memories.length, 0);
    assert.equal(manager.flushDeferredPersistence(), false);

    const recovery = await waitForRoomRecovery(value => Boolean(value));
    const recoveredRoom = decodeRoomStorage<{ rooms: ChatRoom[] }>(recovery!.data).rooms[0];
    assert.equal(recoveredRoom.scene.location, 'pre-recall');
    assert.equal(recoveredRoom.members[0].memories.length, 0);
    assert.equal(recoveredRoom.sharedMemories.length, 0);

    const durable = decodeRoomStorage<{ rooms: ChatRoom[] }>(
        values.get('aigf4RoomsV2')!,
    ).rooms[0];
    assert.equal(durable.scene.location, 'post-recall');
    assert.equal(durable.members[0].memories.length, 1);

    rejectRoomWrites = false;
    const reloaded = new RoomManager();
    assert.equal(await reloaded.restoreRoomRecovery(), true);
    assert.equal(reloaded.getRoom(value.id)?.scene.location, 'pre-recall');
    assert.equal(reloaded.getRoom(value.id)?.members[0].memories.length, 0);
    await waitForRoomRecovery(value => value === undefined);
});
