import assert from 'node:assert/strict';
import test from 'node:test';
import { Persona } from '../managers.js';
import { ChatRoom, cloneRoomSnapshot, RoomManager } from '../roomManager.js';
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
