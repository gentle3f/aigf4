import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { getPersonaAvatarAsset, savePersonaAvatar } from '../avatarStore.js';
import type { Persona } from '../managers.js';
import { type ChatRoom, RoomManager, roomAvatarStorageKey } from '../roomManager.js';

const OLD_AVATAR = 'data:image/png;base64,b2xk';
const NEW_AVATAR = 'data:image/png;base64,bmV3';
const SHARED_AVATAR = 'data:image/png;base64,c2hhcmVk';

const persona = (name: string, avatarUrl: string | null = null): Persona => ({
    name,
    emoji: '*',
    gender: 'female',
    description: name,
    prompt: name,
    greeting: 'hello',
    avatarPrompt: '',
    avatarUrl,
});

const room = (id: string): ChatRoom => ({
    id,
    type: 'group',
    title: id,
    description: 'avatar persistence test',
    leadMemberId: 'one',
    members: [
        {
            id: 'one',
            persona: persona('One'),
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
        realityEpochId: 'epoch-1',
        presentMemberIds: ['one', 'two'],
        summary: 'test',
        unresolved: [],
        startedAt: 1,
    },
    sharedSoul: [],
    sharedMemories: [],
    createdAt: 1,
    updatedAt: 1,
    lastSummarizedUserMessageCount: 0,
});

const installStorage = () => {
    const values = new Map<string, string>();
    let rejectRoomWrites = false;
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => values.get(key) || null,
            setItem: (key: string, value: string) => {
                if (rejectRoomWrites && key === 'aigf4RoomsV2') {
                    throw new DOMException('Quota exceeded', 'QuotaExceededError');
                }
                values.set(key, value);
            },
            removeItem: (key: string) => values.delete(key),
        },
    });
    return {
        values,
        rejectRoomWrites: (value: boolean) => { rejectRoomWrites = value; },
    };
};

const waitForAvatar = async (
    key: string,
    predicate: (value: Awaited<ReturnType<typeof getPersonaAvatarAsset>>) => boolean,
    timeoutMs = 1000,
) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const value = await getPersonaAvatarAsset(key);
        if (predicate(value)) return value;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error(`Timed out waiting for avatar asset ${key}.`);
};

test('room avatar blob rolls back when room metadata persistence fails', async () => {
    const storage = installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('avatar-rollback'));
    const assetKey = roomAvatarStorageKey(saved.id, 'one');

    await manager.setMemberAvatar(saved.id, 'one', OLD_AVATAR);
    assert.equal(await (await getPersonaAvatarAsset(assetKey))!.blob.text(), 'old');

    storage.rejectRoomWrites(true);
    await assert.rejects(
        manager.setMemberAvatar(saved.id, 'one', NEW_AVATAR),
        /Quota exceeded/u,
    );
    storage.rejectRoomWrites(false);

    const restoredAsset = await getPersonaAvatarAsset(assetKey);
    assert.ok(restoredAsset);
    assert.equal(await restoredAsset!.blob.text(), 'old');
    assert.equal(manager.getMember(saved.id, 'one')?.persona.avatarUrl, OLD_AVATAR);
});

test('clearing a room-owned avatar deletes its blob only after metadata commits', async () => {
    installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('avatar-clear'));
    const assetKey = roomAvatarStorageKey(saved.id, 'one');

    await manager.setMemberAvatar(saved.id, 'one', OLD_AVATAR);
    assert.ok(await getPersonaAvatarAsset(assetKey));

    await manager.setMemberAvatar(saved.id, 'one', null);
    assert.equal(manager.getMember(saved.id, 'one')?.persona.avatarUrl, null);
    await waitForAvatar(assetKey, value => value === undefined);
});

test('removing a room member cleans its room-owned avatar blob', async () => {
    installStorage();
    const manager = new RoomManager();
    const saved = manager.saveRoom(room('avatar-remove-member'));
    const assetKey = roomAvatarStorageKey(saved.id, 'two');

    await manager.setMemberAvatar(saved.id, 'two', OLD_AVATAR);
    assert.ok(await getPersonaAvatarAsset(assetKey));

    manager.removeMember(saved.id, 'two');
    assert.equal(manager.getMember(saved.id, 'two'), undefined);
    await waitForAvatar(assetKey, value => value === undefined);
});

test('deleting a room cleans room-owned blobs but never deletes shared persona avatar assets', async () => {
    installStorage();
    const manager = new RoomManager();
    const candidate = room('avatar-delete-room');
    candidate.members[1].avatarAssetKey = 'shared-persona';
    candidate.members[1].persona.avatarUrl = 'private-avatar:shared-persona';
    const saved = manager.saveRoom(candidate);
    const ownedKey = roomAvatarStorageKey(saved.id, 'one');

    await manager.setMemberAvatar(saved.id, 'one', OLD_AVATAR);
    await savePersonaAvatar('shared-persona', SHARED_AVATAR);
    assert.ok(await getPersonaAvatarAsset(ownedKey));
    assert.ok(await getPersonaAvatarAsset('shared-persona'));

    assert.equal(manager.deleteRoom(saved.id), true);
    await waitForAvatar(ownedKey, value => value === undefined);
    assert.ok(await getPersonaAvatarAsset('shared-persona'));
});
