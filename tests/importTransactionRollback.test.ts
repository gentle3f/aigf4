import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { FileManager } from '../fileManager.js';
import { LOCAL_CLOUD_CHANGE_EVENT } from '../cloudSyncEvents.js';
import { MemoryManager, type Persona } from '../managers.js';
import { RoomManager, type ChatRoom } from '../roomManager.js';
import {
    deleteCharacterPhotoAsset,
    getCharacterPhotoAsset,
    saveCharacterPhotoAsset,
} from '../photoStore.js';
import {
    deleteChatAttachment,
    getChatAttachment,
    saveChatAttachment,
} from '../chatMediaStore.js';
import {
    deletePersonaAvatar,
    getPersonaAvatarAsset,
} from '../avatarStore.js';

const persona = (name: string): Persona => ({
    name,
    emoji: '*',
    gender: 'female',
    description: name,
    prompt: `${name} prompt`,
    greeting: `${name} greeting`,
    avatarPrompt: '',
    avatarUrl: null,
});

const room = (id: string): ChatRoom => ({
    id,
    type: 'group',
    title: id,
    description: id,
    leadMemberId: 'one',
    members: [{
        id: 'one',
        persona: persona('One'),
        joinedAt: 1,
        soul: [],
        memories: [],
    }],
    scene: {
        id: 'scene-1',
        location: 'home',
        realityLayer: 'physical',
        realityEpochId: 'epoch-1',
        presentMemberIds: ['one'],
        summary: 'home',
        unresolved: [],
        startedAt: 1,
    },
    sharedSoul: [],
    sharedMemories: [],
    createdAt: 1,
    updatedAt: 1,
    lastSummarizedUserMessageCount: 0,
});

const installStorage = (onSet?: (key: string) => void) => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => {
                onSet?.(key);
                values.set(key, value);
            },
            removeItem: (key: string) => values.delete(key),
        },
    });
    return values;
};

const fileEntry = (handlers: Partial<Record<string, () => unknown>>) => ({
    dir: false,
    name: 'entry.bin',
    async: async (kind: string) => {
        const handler = handlers[kind];
        if (!handler) throw new Error(`unexpected async kind ${kind}`);
        return handler();
    },
});

const createAllDataZip = (
    data: unknown,
    folders: Record<string, Array<{ path: string; entry: any }>> = {},
) => {
    const allDataEntry = fileEntry({
        string: () => JSON.stringify(data),
    });
    return {
        file: (name: string) => {
            if (name === 'all_data.json') return allDataEntry;
            if (name === 'avatar.png') return null;
            return null;
        },
        folder: (name: string) => {
            const entries = folders[name];
            if (!entries) return null;
            return {
                forEach: (callback: (path: string, entry: any) => void) => {
                    entries.forEach(item => callback(item.path, item.entry));
                },
            };
        },
    };
};

const createFileManager = (
    memoryManager: MemoryManager,
    roomManager?: RoomManager,
    onAllDataRestored: () => void = () => undefined,
) => new FileManager(memoryManager, {
    downloadAllChatsBtn: {} as HTMLButtonElement,
    downloadImagesBtn: {} as HTMLButtonElement,
    onSingleChatRestored: () => undefined,
    onAllDataRestored,
}, roomManager);

test('archive restore rolls MemoryManager back when RoomManager fails after memory import succeeded', async () => {
    let rejectDeletedIdsOnce = false;
    installStorage(key => {
        if (rejectDeletedIdsOnce && key === 'aigf4DeletedRoomIdsV1') {
            rejectDeletedIdsOnce = false;
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
    });

    const memoryManager = new MemoryManager();
    const roomManager = new RoomManager();
    roomManager.saveRoom(room('existing-room'));
    let completed = false;
    const manager = createFileManager(memoryManager, roomManager, () => { completed = true; });

    const importedPersona = persona('Imported');
    const zip = createAllDataZip({
        customPersonas: { custom_tx: importedPersona },
        chatHistories: {
            custom_tx: [{ id: 'imported-message', role: 'model', content: { text: 'imported' } }],
        },
        diaries: {},
        interests: {},
        rooms: { version: 2, rooms: [room('imported-room')] },
    });

    rejectDeletedIdsOnce = true;
    await assert.rejects(
        () => (manager as any).restoreLoadedZip(zip, false),
        /Quota exceeded/u,
    );

    assert.equal(memoryManager.getPersona('custom_tx'), undefined);
    assert.equal(memoryManager.peekChatHistory('custom_tx').length, 0);
    assert.equal(roomManager.getRoom('imported-room'), undefined);
    assert.ok(roomManager.getRoom('existing-room'));
    assert.equal(completed, false);
});

test('archive restore restores overwritten photos and removes new photos when a later media step fails', async () => {
    installStorage();
    const memoryManager = new MemoryManager();
    const manager = createFileManager(memoryManager);

    await saveCharacterPhotoAsset({
        id: 'shared-photo',
        personaKey: 'local-chat',
        blob: new Blob(['old-photo'], { type: 'image/webp' }),
        prompt: 'old prompt',
        createdAt: 1,
    });
    await deleteCharacterPhotoAsset('new-photo').catch(() => undefined);

    const importedPersona = persona('Media Import');
    const importedHistory = [
        {
            id: 'photo-1',
            role: 'model',
            content: { text: 'one', imageAssetId: 'shared-photo', imagePrompt: 'new prompt' },
        },
        {
            id: 'photo-2',
            role: 'model',
            content: { text: 'two', imageAssetId: 'new-photo', imagePrompt: 'new photo' },
        },
        {
            id: 'attachment',
            role: 'user',
            content: {
                text: 'attachment',
                attachments: [{
                    assetId: 'fail-attachment',
                    kind: 'text',
                    name: 'fail.txt',
                    mimeType: 'text/plain',
                    size: 4,
                }],
            },
        },
    ];

    const photoEntry = (text: string) => fileEntry({
        uint8array: () => new Uint8Array([1]),
        blob: () => new Blob([text], { type: 'image/webp' }),
    });
    const failingAttachment = fileEntry({
        uint8array: () => new Uint8Array([2]),
        blob: () => { throw new Error('attachment decode failed'); },
    });
    failingAttachment.name = 'attachments/custom_media/fail-attachment.txt';

    const zip = createAllDataZip({
        customPersonas: { custom_media: importedPersona },
        chatHistories: { custom_media: importedHistory },
        diaries: {},
        interests: {},
    }, {
        photos: [
            { path: 'custom_media/shared-photo.webp', entry: photoEntry('overwritten-photo') },
            { path: 'custom_media/new-photo.webp', entry: photoEntry('brand-new-photo') },
        ],
        attachments: [
            { path: 'custom_media/fail-attachment.txt', entry: failingAttachment },
        ],
    });

    try {
        await assert.rejects(
            () => (manager as any).restoreLoadedZip(zip, true),
            /attachment decode failed/u,
        );

        const restoredOld = await getCharacterPhotoAsset('shared-photo');
        const removedNew = await getCharacterPhotoAsset('new-photo');
        assert.equal(await restoredOld?.blob.text(), 'old-photo');
        assert.equal(restoredOld?.personaKey, 'local-chat');
        assert.equal(restoredOld?.prompt, 'old prompt');
        assert.equal(removedNew, undefined);
        assert.equal(memoryManager.getPersona('custom_media'), undefined);
        assert.equal(memoryManager.peekChatHistory('custom_media').length, 0);
    } finally {
        await deleteCharacterPhotoAsset('shared-photo').catch(() => undefined);
        await deleteCharacterPhotoAsset('new-photo').catch(() => undefined);
    }
});


test('archive restore rolls avatar and app settings back when settings fail after avatar import', async () => {
    let rejectSettingOnce = false;
    const storage = installStorage(key => {
        if (rejectSettingOnce && key === 'veniceImageSeedLocked') {
            rejectSettingOnce = false;
            throw new DOMException('Setting quota exceeded', 'QuotaExceededError');
        }
    });
    storage.set('veniceImageSeed', 'old-seed');

    const memoryManager = new MemoryManager();
    await memoryManager.setPersonaAvatar('cc', 'data:image/png;base64,b2xkLWF2YXRhcg==');
    const beforePersona = structuredClone(memoryManager.getPersona('cc'));

    let completed = false;
    const manager = createFileManager(memoryManager, undefined, () => { completed = true; });
    const ccImport = {
        ...structuredClone(memoryManager.getPersona('cc')),
        avatarUrl: null,
        description: 'archive description',
    };
    const avatarEntry = fileEntry({
        uint8array: () => new Uint8Array([1, 2, 3]),
        base64: () => 'bmV3LWF2YXRhcg==',
    });
    avatarEntry.name = 'avatars/cc.png';

    const zip = createAllDataZip({
        customPersonas: { cc: ccImport },
        chatHistories: {},
        diaries: {},
        interests: {},
        appSettings: {
            veniceImageSeed: 'new-seed',
            veniceImageSeedLocked: 'true',
        },
    }, {
        avatars: [{ path: 'cc.png', entry: avatarEntry }],
    });

    rejectSettingOnce = true;
    try {
        await assert.rejects(
            () => (manager as any).restoreLoadedZip(zip, true),
            /Setting quota exceeded/u,
        );

        const restoredAvatar = await getPersonaAvatarAsset('cc');
        assert.equal(await restoredAvatar?.blob.text(), 'old-avatar');
        assert.deepEqual(memoryManager.getPersona('cc'), beforePersona);
        assert.equal(storage.get('veniceImageSeed'), 'old-seed');
        assert.equal(storage.has('veniceImageSeedLocked'), false);
        assert.equal(completed, false);
    } finally {
        await deletePersonaAvatar('cc').catch(() => undefined);
    }
});


test('transaction waits for slow media writes to settle before rollback begins', async () => {
    installStorage();
    const memoryManager = new MemoryManager();
    const manager = createFileManager(memoryManager);

    await deleteCharacterPhotoAsset('slow-photo').catch(() => undefined);
    await deleteCharacterPhotoAsset('fast-fail-photo').catch(() => undefined);

    const importedHistory = [
        {
            id: 'slow-photo-message',
            role: 'model',
            content: { text: 'slow', imageAssetId: 'slow-photo', imagePrompt: 'slow' },
        },
        {
            id: 'fail-photo-message',
            role: 'model',
            content: { text: 'fail', imageAssetId: 'fast-fail-photo', imagePrompt: 'fail' },
        },
    ];
    const slowEntry = fileEntry({
        uint8array: () => new Uint8Array([1]),
        blob: async () => {
            await new Promise(resolve => setTimeout(resolve, 35));
            return new Blob(['late-write'], { type: 'image/webp' });
        },
    });
    const fastFailEntry = fileEntry({
        uint8array: () => new Uint8Array([2]),
        blob: async () => {
            await new Promise(resolve => setTimeout(resolve, 1));
            throw new Error('fast media failure');
        },
    });

    const zip = createAllDataZip({
        customPersonas: { custom_race: persona('Race') },
        chatHistories: { custom_race: importedHistory },
        diaries: {},
        interests: {},
    }, {
        photos: [
            { path: 'custom_race/slow-photo.webp', entry: slowEntry },
            { path: 'custom_race/fast-fail-photo.webp', entry: fastFailEntry },
        ],
    });

    try {
        await assert.rejects(
            () => (manager as any).restoreLoadedZip(zip, true),
            /fast media failure/u,
        );

        await new Promise(resolve => setTimeout(resolve, 60));
        assert.equal(await getCharacterPhotoAsset('slow-photo'), undefined);
        assert.equal(await getCharacterPhotoAsset('fast-fail-photo'), undefined);
        assert.equal(memoryManager.getPersona('custom_race'), undefined);
    } finally {
        await deleteCharacterPhotoAsset('slow-photo').catch(() => undefined);
        await deleteCharacterPhotoAsset('fast-fail-photo').catch(() => undefined);
    }
});

test('completion UI failure does not roll a successful durable import back', async () => {
    installStorage();
    const memoryManager = new MemoryManager();
    const manager = createFileManager(memoryManager, undefined, () => {
        throw new Error('render failed');
    });
    const zip = createAllDataZip({
        customPersonas: { custom_committed: persona('Committed') },
        chatHistories: {
            custom_committed: [{
                id: 'committed-message',
                role: 'model',
                content: { text: 'committed' },
            }],
        },
        diaries: {},
        interests: {},
    });

    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
        await (manager as any).restoreLoadedZip(zip, false);
    } finally {
        console.error = originalConsoleError;
    }

    assert.ok(memoryManager.getPersona('custom_committed'));
    assert.equal(
        memoryManager.peekChatHistory('custom_committed')[0]?.id,
        'committed-message',
    );
});


test('legacy history avatar import uses private avatar storage instead of localStorage base64', async () => {
    const storage = installStorage();
    const memoryManager = new MemoryManager();
    let restoredKey = '';
    const manager = new FileManager(memoryManager, {
        downloadAllChatsBtn: {} as HTMLButtonElement,
        downloadImagesBtn: {} as HTMLButtonElement,
        onSingleChatRestored: key => { restoredKey = key; },
        onAllDataRestored: () => undefined,
    });

    const personaKey = 'custom_history_avatar';
    const historyEntry = fileEntry({
        string: () => JSON.stringify({
            personaKey,
            history: [{
                id: 'legacy-avatar-message',
                role: 'model',
                content: { text: 'hello' },
            }],
            personaData: persona('Legacy Avatar'),
        }),
    });
    const avatarEntry = fileEntry({
        uint8array: () => new Uint8Array([9]),
        base64: () => 'bGVnYWN5LWF2YXRhcg==',
    });
    avatarEntry.name = 'avatar.png';

    const zip = {
        file: (name: string) => {
            if (name === 'all_data.json') return null;
            if (name === 'history.json') return historyEntry;
            if (name === 'avatar.png') return avatarEntry;
            return null;
        },
        folder: () => null,
    };

    try {
        await (manager as any).restoreLoadedZip(zip, false);

        assert.equal(restoredKey, personaKey);
        const storedPersonaJson = storage.get('customPersonas') || '';
        assert.equal(storedPersonaJson.includes('data:image/'), false);
        assert.match(storedPersonaJson, new RegExp(`private-avatar:${personaKey}`, 'u'));

        const asset = await getPersonaAvatarAsset(personaKey);
        assert.equal(await asset?.blob.text(), 'legacy-avatar');
        assert.match(memoryManager.getPersona(personaKey)?.avatarUrl || '', /^data:image\//u);
    } finally {
        await deletePersonaAvatar(personaKey).catch(() => undefined);
    }
});


test('failed archive transaction does not delete old room avatar blobs before rollback completes', async () => {
    installStorage();
    const memoryManager = new MemoryManager();
    const roomManager = new RoomManager();
    roomManager.saveRoom(room('avatar-source-room'));
    await roomManager.setMemberAvatar(
        'avatar-source-room',
        'one',
        'data:image/png;base64,b2xkLXJvb20tYXZhdGFy',
    );
    const oldAvatarKey = 'room-avatar:avatar-source-room:one';
    assert.ok(await getPersonaAvatarAsset(oldAvatarKey));

    const manager = createFileManager(memoryManager, roomManager);
    const failingPhoto = fileEntry({
        uint8array: () => new Uint8Array([7]),
        blob: () => { throw new Error('late archive failure'); },
    });
    const zip = createAllDataZip({
        customPersonas: { custom_room_fail: persona('Room Fail') },
        chatHistories: {
            custom_room_fail: [{
                id: 'room-fail-photo',
                role: 'model',
                content: {
                    text: 'fail later',
                    imageAssetId: 'room-fail-photo',
                },
            }],
        },
        diaries: {},
        interests: {},
        rooms: { version: 2, rooms: [room('archive-replacement-room')] },
    }, {
        photos: [{
            path: 'custom_room_fail/room-fail-photo.webp',
            entry: failingPhoto,
        }],
    });

    try {
        await assert.rejects(
            () => (manager as any).restoreLoadedZip(zip, true),
            /late archive failure/u,
        );
        await new Promise(resolve => setTimeout(resolve, 30));

        assert.ok(roomManager.getRoom('avatar-source-room'));
        assert.equal(roomManager.getRoom('archive-replacement-room'), undefined);
        const restoredAvatar = await getPersonaAvatarAsset(oldAvatarKey);
        assert.equal(await restoredAvatar?.blob.text(), 'old-room-avatar');
    } finally {
        await deletePersonaAvatar(oldAvatarKey).catch(() => undefined);
    }
});

test('successful replacement import cleans old unused room avatar blobs after commit', async () => {
    installStorage();
    const memoryManager = new MemoryManager();
    const roomManager = new RoomManager();
    roomManager.saveRoom(room('avatar-cleanup-room'));
    await roomManager.setMemberAvatar(
        'avatar-cleanup-room',
        'one',
        'data:image/png;base64,c3RhbGUtcm9vbS1hdmF0YXI=',
    );
    const oldAvatarKey = 'room-avatar:avatar-cleanup-room:one';
    assert.ok(await getPersonaAvatarAsset(oldAvatarKey));

    const manager = createFileManager(memoryManager, roomManager);
    const zip = createAllDataZip({
        customPersonas: {},
        chatHistories: {},
        diaries: {},
        interests: {},
        rooms: { version: 2, rooms: [room('replacement-room')] },
    });

    try {
        await (manager as any).restoreLoadedZip(zip, true);
        for (let i = 0; i < 50 && await getPersonaAvatarAsset(oldAvatarKey); i += 1) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        assert.equal(roomManager.getRoom('avatar-cleanup-room'), undefined);
        assert.ok(roomManager.getRoom('replacement-room'));
        assert.equal(await getPersonaAvatarAsset(oldAvatarKey), undefined);
    } finally {
        await deletePersonaAvatar(oldAvatarKey).catch(() => undefined);
    }
});


test('successful replacement import cleans removed persona private avatars after commit', async () => {
    installStorage();
    const memoryManager = new MemoryManager();
    const removedKey = memoryManager.saveCustomPersona({
        name: 'Removed Persona',
        emoji: '*',
        description: 'removed',
        prompt: 'removed',
        greeting: 'hello',
        avatarPrompt: '',
    });
    await memoryManager.setPersonaAvatar(
        removedKey,
        'data:image/png;base64,c3RhbGUtcGVyc29uYS1hdmF0YXI=',
    );
    assert.ok(await getPersonaAvatarAsset(removedKey));

    const manager = createFileManager(memoryManager);
    const zip = createAllDataZip({
        customPersonas: {},
        chatHistories: {},
        diaries: {},
        interests: {},
    });

    try {
        await (manager as any).restoreLoadedZip(zip, true);
        for (let i = 0; i < 50 && await getPersonaAvatarAsset(removedKey); i += 1) {
            await new Promise(resolve => setTimeout(resolve, 5));
        }

        assert.equal(memoryManager.getPersona(removedKey), undefined);
        assert.equal(await getPersonaAvatarAsset(removedKey), undefined);
    } finally {
        await deletePersonaAvatar(removedKey).catch(() => undefined);
    }
});

test('failed replacement import preserves old persona private avatars for rollback', async () => {
    installStorage();
    const memoryManager = new MemoryManager();
    const preservedKey = memoryManager.saveCustomPersona({
        name: 'Preserved Persona',
        emoji: '*',
        description: 'preserved',
        prompt: 'preserved',
        greeting: 'hello',
        avatarPrompt: '',
    });
    await memoryManager.setPersonaAvatar(
        preservedKey,
        'data:image/png;base64,cHJlc2VydmVkLXBlcnNvbmEtYXZhdGFy',
    );
    assert.ok(await getPersonaAvatarAsset(preservedKey));

    const manager = createFileManager(memoryManager);
    const failingPhoto = fileEntry({
        uint8array: () => new Uint8Array([8]),
        blob: () => { throw new Error('persona cleanup rollback failure point'); },
    });
    const zip = createAllDataZip({
        customPersonas: { custom_failure: persona('Failure') },
        chatHistories: {
            custom_failure: [{
                id: 'failure-photo',
                role: 'model',
                content: { text: 'fail', imageAssetId: 'failure-photo' },
            }],
        },
        diaries: {},
        interests: {},
    }, {
        photos: [{
            path: 'custom_failure/failure-photo.webp',
            entry: failingPhoto,
        }],
    });

    try {
        await assert.rejects(
            () => (manager as any).restoreLoadedZip(zip, true),
            /persona cleanup rollback failure point/u,
        );
        await new Promise(resolve => setTimeout(resolve, 30));

        assert.ok(memoryManager.getPersona(preservedKey));
        const asset = await getPersonaAvatarAsset(preservedKey);
        assert.equal(await asset?.blob.text(), 'preserved-persona-avatar');
    } finally {
        await deletePersonaAvatar(preservedKey).catch(() => undefined);
        await deleteCharacterPhotoAsset('failure-photo').catch(() => undefined);
    }
});


test('archive restore withholds cloud-change events until the durable transaction commits', async () => {
    installStorage();
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

    const scopes: string[] = [];
    eventTarget.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, event => {
        scopes.push((event as CustomEvent<{ scope: string }>).detail.scope);
    });

    const memoryManager = new MemoryManager();
    const manager = createFileManager(memoryManager);
    let releasePhoto!: () => void;
    const photoGate = new Promise<void>(resolve => { releasePhoto = resolve; });

    const slowPhoto = fileEntry({
        uint8array: () => new Uint8Array([1]),
        blob: async () => {
            await photoGate;
            return new Blob(['committed-photo'], { type: 'image/webp' });
        },
    });
    const zip = createAllDataZip({
        customPersonas: { custom_cloud_batch: persona('Cloud Batch') },
        chatHistories: {
            custom_cloud_batch: [{
                id: 'cloud-batch-photo',
                role: 'model',
                content: {
                    text: 'batch',
                    imageAssetId: 'cloud-batch-photo',
                    imagePrompt: 'batch',
                },
            }],
        },
        diaries: {},
        interests: {},
    }, {
        photos: [{
            path: 'custom_cloud_batch/cloud-batch-photo.webp',
            entry: slowPhoto,
        }],
    });

    const restorePromise = (manager as any).restoreLoadedZip(zip, false);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(scopes, []);

    releasePhoto();
    await restorePromise;

    assert.deepEqual(
        Array.from(new Set(scopes)).sort(),
        ['media', 'messages', 'state'],
    );
    assert.equal(scopes.length, new Set(scopes).size);

    await deleteCharacterPhotoAsset('cloud-batch-photo').catch(() => undefined);
});


test('successful replacement import cleans only media referenced by histories that were actually removed', async () => {
    installStorage();
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
    const scopes: string[] = [];
    eventTarget.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, event => {
        scopes.push((event as CustomEvent<{ scope: string }>).detail.scope);
    });

    const memoryManager = new MemoryManager();
    const manager = createFileManager(memoryManager);
    const oldPhotoId = 'replace-old-photo';
    const oldAttachmentId = 'replace-old-attachment';
    const orphanPhotoId = 'replace-preexisting-orphan';

    await saveCharacterPhotoAsset({
        id: oldPhotoId,
        personaKey: 'old-media-chat',
        blob: new Blob(['old referenced photo'], { type: 'image/webp' }),
        prompt: 'old referenced',
        createdAt: 1,
    });
    await saveCharacterPhotoAsset({
        id: orphanPhotoId,
        personaKey: 'old-media-chat',
        blob: new Blob(['recovery orphan'], { type: 'image/webp' }),
        prompt: 'recovery evidence',
        createdAt: 2,
    });
    await saveChatAttachment({
        id: oldAttachmentId,
        conversationKey: 'old-media-chat',
        blob: new Blob(['old attachment'], { type: 'text/plain' }),
        name: 'old.txt',
        mimeType: 'text/plain',
        createdAt: 1,
    });
    memoryManager.setChatHistory('old-media-chat', [{
        id: 'old-media-message',
        role: 'model',
        content: {
            text: 'old media',
            imageAssetId: oldPhotoId,
            attachments: [{
                assetId: oldAttachmentId,
                kind: 'text',
                name: 'old.txt',
                mimeType: 'text/plain',
                size: 14,
            }],
        },
    }], true);
    scopes.length = 0;

    const zip = createAllDataZip({
        customPersonas: {},
        chatHistories: {
            replacement_chat: [{
                id: 'replacement-message',
                role: 'model',
                content: { text: 'replacement' },
            }],
        },
        diaries: {},
        interests: {},
    });

    try {
        await (manager as any).restoreLoadedZip(zip, true);

        assert.equal(await getCharacterPhotoAsset(oldPhotoId), undefined);
        assert.equal(await getChatAttachment(oldAttachmentId), undefined);
        assert.ok(await getCharacterPhotoAsset(orphanPhotoId));
        assert.equal(memoryManager.peekChatHistory('old-media-chat').length, 0);
        assert.equal(memoryManager.peekChatHistory('replacement_chat').length, 1);
        assert.ok(scopes.includes('media'));
        assert.equal(scopes.filter(scope => scope === 'media').length, 1);
    } finally {
        await deleteCharacterPhotoAsset(oldPhotoId).catch(() => undefined);
        await deleteCharacterPhotoAsset(orphanPhotoId).catch(() => undefined);
        await deleteChatAttachment(oldAttachmentId).catch(() => undefined);
    }
});

test('failed replacement import never cleans media referenced by the rolled-back histories', async () => {
    let rejectSettingOnce = false;
    const storage = installStorage(key => {
        if (rejectSettingOnce && key === 'veniceAssistantModel') {
            rejectSettingOnce = false;
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
    });
    storage.set('veniceAssistantModel', 'old-model');

    const memoryManager = new MemoryManager();
    const manager = createFileManager(memoryManager);
    const oldPhotoId = 'replace-failed-old-photo';
    const oldAttachmentId = 'replace-failed-old-attachment';

    await saveCharacterPhotoAsset({
        id: oldPhotoId,
        personaKey: 'old-failed-chat',
        blob: new Blob(['old photo survives'], { type: 'image/webp' }),
        prompt: 'old',
        createdAt: 1,
    });
    await saveChatAttachment({
        id: oldAttachmentId,
        conversationKey: 'old-failed-chat',
        blob: new Blob(['old attachment survives'], { type: 'text/plain' }),
        name: 'survive.txt',
        mimeType: 'text/plain',
        createdAt: 1,
    });
    memoryManager.setChatHistory('old-failed-chat', [{
        id: 'old-failed-message',
        role: 'model',
        content: {
            text: 'must survive rollback',
            imageAssetId: oldPhotoId,
            attachments: [{
                assetId: oldAttachmentId,
                kind: 'text',
                name: 'survive.txt',
                mimeType: 'text/plain',
                size: 23,
            }],
        },
    }], true);

    const zip = createAllDataZip({
        customPersonas: {},
        chatHistories: {
            replacement_failure: [{
                id: 'replacement-failure-message',
                role: 'model',
                content: { text: 'should roll back' },
            }],
        },
        diaries: {},
        interests: {},
        appSettings: { veniceAssistantModel: 'new-model' },
    });

    rejectSettingOnce = true;
    try {
        await assert.rejects(
            () => (manager as any).restoreLoadedZip(zip, true),
            /Quota exceeded/u,
        );

        assert.ok(await getCharacterPhotoAsset(oldPhotoId));
        assert.ok(await getChatAttachment(oldAttachmentId));
        assert.equal(memoryManager.peekChatHistory('old-failed-chat').length, 1);
        assert.equal(memoryManager.peekChatHistory('replacement_failure').length, 0);
        assert.equal(storage.get('veniceAssistantModel'), 'old-model');
    } finally {
        await deleteCharacterPhotoAsset(oldPhotoId).catch(() => undefined);
        await deleteChatAttachment(oldAttachmentId).catch(() => undefined);
    }
});


test('failed archive transaction discards transient cloud-change scopes after successful rollback', async () => {
    let rejectDeletedIdsOnce = false;
    installStorage(key => {
        if (rejectDeletedIdsOnce && key === 'aigf4DeletedRoomIdsV1') {
            rejectDeletedIdsOnce = false;
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
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
    const scopes: string[] = [];
    eventTarget.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, event => {
        scopes.push((event as CustomEvent<{ scope: string }>).detail.scope);
    });

    const memoryManager = new MemoryManager();
    const roomManager = new RoomManager();
    roomManager.saveRoom(room('rollback-cloud-existing'));
    scopes.length = 0;

    const manager = createFileManager(memoryManager, roomManager);
    const zip = createAllDataZip({
        customPersonas: { custom_rollback_cloud: persona('Rollback Cloud') },
        chatHistories: {
            custom_rollback_cloud: [{
                id: 'rollback-cloud-message',
                role: 'model',
                content: { text: 'must roll back without cloud notification' },
            }],
        },
        diaries: {},
        interests: {},
        rooms: { version: 2, rooms: [room('rollback-cloud-imported')] },
    });

    rejectDeletedIdsOnce = true;
    await assert.rejects(
        () => (manager as any).restoreLoadedZip(zip, false),
        /Quota exceeded/u,
    );

    assert.equal(memoryManager.getPersona('custom_rollback_cloud'), undefined);
    assert.equal(roomManager.getRoom('rollback-cloud-imported'), undefined);
    assert.ok(roomManager.getRoom('rollback-cloud-existing'));
    assert.deepEqual(scopes, []);
});
