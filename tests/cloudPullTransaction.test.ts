import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { getPersonaAvatarAsset, savePersonaAvatarBlob } from '../avatarStore.js';
import { getChatAttachment, saveChatAttachment } from '../chatMediaStore.js';
import { readCloudSyncIndex, writeCloudSyncIndex } from '../cloudSyncIndexStore.js';
import { MemoryManager } from '../managers.js';
import { getCharacterPhotoAsset, saveCharacterPhotoAsset } from '../photoStore.js';
import { RoomManager } from '../roomManager.js';
import { SupabaseCloudSyncManager } from '../supabaseCloudSync.js';

const installLocalStorage = () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, String(value)); },
            removeItem: (key: string) => { storage.delete(key); },
        },
    });
    return storage;
};

const textOf = async (blob: Blob | undefined) => blob ? blob.text() : undefined;

test('cloud pull transaction rollback restores local state, media and sync indexes', async () => {
    installLocalStorage();

    const memory = new MemoryManager();
    const rooms = new RoomManager();
    const cc = memory.getPersona('cc');
    const yueji = memory.getPersona('yueji');
    assert.ok(cc);
    assert.ok(yueji);

    memory.updatePersona('cc', { memory: 'local-persona-memory' });
    memory.setChatHistory('cc', [{
        id: 'local-message',
        createdAt: 1,
        role: 'user',
        content: { text: 'local chat' },
    }], true);

    const room = rooms.createRoom('Local room', [
        { sourcePersonaKey: 'cc', persona: cc! },
        { sourcePersonaKey: 'yueji', persona: yueji! },
    ]);
    rooms.updateRoom(room.id, draft => {
        draft.scene.location = 'local-room';
        draft.scene.summary = 'local scene';
    });

    localStorage.setItem('veniceAssistantModel', 'local-model');

    const oldAvatar = new Blob(['local-avatar'], { type: 'image/png' });
    const oldAttachment = new Blob(['local-attachment'], { type: 'text/plain' });
    await savePersonaAvatarBlob('cloud-avatar-test', oldAvatar, 10);
    await saveChatAttachment({
        id: 'cloud-attachment-test',
        conversationKey: 'cc',
        name: 'local.txt',
        mimeType: 'text/plain',
        createdAt: 11,
        blob: oldAttachment,
    });

    await writeCloudSyncIndex('wetappCloudMessageIndexV1', { local: 'message' });
    await writeCloudSyncIndex('wetappCloudConversationIndexV1', { local: 'conversation' });
    await writeCloudSyncIndex('wetappCloudMediaIndexV1', { local: 'media' });
    await writeCloudSyncIndex('wetappCloudStateEntityIndexV1', { local: 'state' });

    const sync = new SupabaseCloudSyncManager(memory, rooms, {
        onStateChange: () => undefined,
        onRemoteApplied: () => undefined,
    });
    const internal = sync as unknown as {
        createCloudPullTransactionSnapshot: () => Promise<any>;
        rememberCloudPullAvatar: (snapshot: any, key: string) => Promise<void>;
        rememberCloudPullPhoto: (snapshot: any, id: string) => Promise<void>;
        rememberCloudPullAttachment: (snapshot: any, id: string) => Promise<void>;
        rollbackCloudPullTransaction: (snapshot: any) => Promise<void>;
    };

    const snapshot = await internal.createCloudPullTransactionSnapshot();
    await internal.rememberCloudPullAvatar(snapshot, 'cloud-avatar-test');
    await internal.rememberCloudPullPhoto(snapshot, 'cloud-photo-new-test');
    await internal.rememberCloudPullAttachment(snapshot, 'cloud-attachment-test');

    memory.updatePersona('cc', { memory: 'remote-persona-memory' });
    memory.setChatHistory('cc', [{
        id: 'remote-message',
        createdAt: 2,
        role: 'model',
        content: { text: 'remote chat' },
    }], true);
    rooms.updateRoom(room.id, draft => {
        draft.scene.location = 'remote-room';
        draft.scene.summary = 'remote scene';
    });
    localStorage.setItem('veniceAssistantModel', 'remote-model');

    await savePersonaAvatarBlob(
        'cloud-avatar-test',
        new Blob(['remote-avatar'], { type: 'image/png' }),
        20,
    );
    await saveCharacterPhotoAsset({
        id: 'cloud-photo-new-test',
        personaKey: 'cc',
        prompt: 'remote photo',
        createdAt: 20,
        blob: new Blob(['remote-photo'], { type: 'image/png' }),
    });
    await saveChatAttachment({
        id: 'cloud-attachment-test',
        conversationKey: 'cc',
        name: 'remote.txt',
        mimeType: 'text/plain',
        createdAt: 21,
        blob: new Blob(['remote-attachment'], { type: 'text/plain' }),
    });

    await writeCloudSyncIndex('wetappCloudMessageIndexV1', { remote: 'message' });
    await writeCloudSyncIndex('wetappCloudConversationIndexV1', { remote: 'conversation' });
    await writeCloudSyncIndex('wetappCloudMediaIndexV1', { remote: 'media' });
    await writeCloudSyncIndex('wetappCloudStateEntityIndexV1', { remote: 'state' });

    await internal.rollbackCloudPullTransaction(snapshot);

    assert.equal(memory.getPersona('cc')?.memory, 'local-persona-memory');
    assert.equal(memory.getChatHistory('cc')[0]?.id, 'local-message');
    assert.equal(rooms.getRoom(room.id)?.scene.location, 'local-room');
    assert.equal(localStorage.getItem('veniceAssistantModel'), 'local-model');

    assert.equal(
        await textOf((await getPersonaAvatarAsset('cloud-avatar-test'))?.blob),
        'local-avatar',
    );
    assert.equal(await getCharacterPhotoAsset('cloud-photo-new-test'), undefined);
    assert.equal(
        await textOf((await getChatAttachment('cloud-attachment-test'))?.blob),
        'local-attachment',
    );

    assert.deepEqual(await readCloudSyncIndex('wetappCloudMessageIndexV1'), { local: 'message' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudConversationIndexV1'), { local: 'conversation' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudMediaIndexV1'), { local: 'media' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudStateEntityIndexV1'), { local: 'state' });
});


test('state revision conflict leaves all local sync indexes at their previous committed baseline', async () => {
    const storage = installLocalStorage();
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: true },
    });
    const eventTarget = new EventTarget() as EventTarget & {
        setTimeout: typeof setTimeout;
        clearTimeout: typeof clearTimeout;
    };
    eventTarget.setTimeout = setTimeout;
    eventTarget.clearTimeout = clearTimeout;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: eventTarget,
    });
    const documentTarget = new EventTarget();
    Object.defineProperty(documentTarget, 'visibilityState', {
        configurable: true,
        value: 'visible',
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: documentTarget,
    });

    await writeCloudSyncIndex('wetappCloudMessageIndexV1', { old: 'message' });
    await writeCloudSyncIndex('wetappCloudConversationIndexV1', { old: 'conversation' });
    await writeCloudSyncIndex('wetappCloudMediaIndexV1', { old: 'media' });
    await writeCloudSyncIndex('wetappCloudStateEntityIndexV1', { old: 'state' });

    const memory = new MemoryManager();
    const rooms = new RoomManager();
    const sync = new SupabaseCloudSyncManager(memory, rooms, {
        onStateChange: () => undefined,
        onRemoteApplied: () => undefined,
    });
    const internal = sync as any;
    internal.client = {
        rpc: async () => ({
            data: null,
            error: { code: '40001', message: 'WETAPP_STATE_REVISION_CONFLICT' },
        }),
    };
    internal.session = { user: { id: 'test-user', email: 'test@example.com' } };
    internal.schedulePull = () => undefined;
    internal.buildStatePayload = async () => ({
        schemaVersion: 1,
        customPersonas: {},
        diaries: {},
        interests: {},
        rooms: { version: 2, rooms: [] },
        appSettings: {},
    });
    internal.collectLocalMedia = async () => [];
    internal.pushMedia = async () => ({
        nextIndex: { next: 'media' },
        removedIds: ['gone-media'],
    });
    internal.pushMessages = async () => ({
        hashes: { next: 'message' },
        conversationIndex: { next: 'conversation' },
        removedByConversation: [['cc', ['gone-message']]],
        removedConversations: ['gone-conversation'],
    });
    let deletionPlanCalls = 0;
    internal.applyRemoteDeletionPlan = async () => {
        deletionPlanCalls += 1;
    };

    assert.equal(await internal.pushLocalToCloud(false, false, 7), false);
    assert.equal(deletionPlanCalls, 0);

    assert.deepEqual(await readCloudSyncIndex('wetappCloudMessageIndexV1'), { old: 'message' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudConversationIndexV1'), { old: 'conversation' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudMediaIndexV1'), { old: 'media' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudStateEntityIndexV1'), { old: 'state' });
    assert.equal(storage.get('wetappCloudPendingV1'), 'true');
    assert.equal(storage.get('wetappCloudPullRecoveryV1'), 'true');
});


test('post-CAS remote deletion failure keeps local sync indexes pending for retry', async () => {
    const storage = installLocalStorage();
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: true },
    });
    const eventTarget = new EventTarget() as EventTarget & {
        setTimeout: typeof setTimeout;
        clearTimeout: typeof clearTimeout;
    };
    eventTarget.setTimeout = setTimeout;
    eventTarget.clearTimeout = clearTimeout;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: eventTarget,
    });
    const documentTarget = new EventTarget();
    Object.defineProperty(documentTarget, 'visibilityState', {
        configurable: true,
        value: 'visible',
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: documentTarget,
    });

    await writeCloudSyncIndex('wetappCloudMessageIndexV1', { old: 'message' });
    await writeCloudSyncIndex('wetappCloudConversationIndexV1', { old: 'conversation' });
    await writeCloudSyncIndex('wetappCloudMediaIndexV1', { old: 'media' });
    await writeCloudSyncIndex('wetappCloudStateEntityIndexV1', { old: 'state' });

    const memory = new MemoryManager();
    const rooms = new RoomManager();
    const sync = new SupabaseCloudSyncManager(memory, rooms, {
        onStateChange: () => undefined,
        onRemoteApplied: () => undefined,
    });
    const internal = sync as any;
    internal.client = {
        rpc: async () => ({ data: 8, error: null }),
    };
    internal.session = { user: { id: 'test-user', email: 'test@example.com' } };
    const retryDelays: number[] = [];
    internal.schedulePull = (delay: number) => { retryDelays.push(delay); };
    internal.buildStatePayload = async () => ({
        schemaVersion: 1,
        customPersonas: {},
        diaries: {},
        interests: {},
        rooms: { version: 2, rooms: [] },
        appSettings: {},
    });
    internal.collectLocalMedia = async () => [];
    internal.pushMedia = async () => ({
        nextIndex: { next: 'media' },
        removedIds: ['gone-media'],
    });
    internal.pushMessages = async () => ({
        hashes: { next: 'message' },
        conversationIndex: { next: 'conversation' },
        removedByConversation: [['cc', ['gone-message']]],
        removedConversations: ['gone-conversation'],
    });
    internal.applyRemoteDeletionPlan = async () => {
        throw new Error('simulated remote delete failure');
    };

    assert.equal(await internal.pushLocalToCloud(false, false, 7), false);

    assert.deepEqual(await readCloudSyncIndex('wetappCloudMessageIndexV1'), { old: 'message' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudConversationIndexV1'), { old: 'conversation' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudMediaIndexV1'), { old: 'media' });
    assert.deepEqual(await readCloudSyncIndex('wetappCloudStateEntityIndexV1'), { old: 'state' });
    assert.equal(storage.get('wetappCloudPendingV1'), 'true');
    assert.deepEqual(retryDelays, [1500]);
});
