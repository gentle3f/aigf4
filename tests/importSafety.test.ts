import assert from 'node:assert/strict';
import test from 'node:test';
import { FileManager } from '../fileManager.js';
import { ChatMessage, MemoryManager, Persona } from '../managers.js';

const persona: Persona = {
    name: 'IU',
    emoji: '*',
    gender: 'female',
    description: 'IU',
    prompt: 'persona',
    greeting: 'hello',
    avatarPrompt: 'IU',
    avatarUrl: 'data:image/jpeg;base64,current-avatar',
};

const existingHistory: ChatMessage[] = [
    { id: 'one', role: 'model', content: { text: 'old message' } },
    { id: 'two', role: 'user', content: { text: 'newer local message' } },
];

const createFileManager = (currentHistory = existingHistory) => {
    const memoryManager = {
        getModifiedAndCustomPersonas: () => ({ custom_iu: persona }),
        getAllChatHistories: () => ({ custom_iu: currentHistory }),
        getAllDiaryEntries: () => ({}),
        getAllInterests: () => ({}),
        getAllPersonas: () => ({ custom_iu: persona }),
        getPersona: (key: string) => key === 'custom_iu' ? persona : undefined,
    };
    const roomManager = {
        getRooms: () => [],
        getRoom: () => undefined,
    };
    const manager = new FileManager(memoryManager as never, {
        downloadAllChatsBtn: {} as HTMLButtonElement,
        downloadImagesBtn: {} as HTMLButtonElement,
        onSingleChatRestored: () => undefined,
        onAllDataRestored: () => undefined,
    }, roomManager as never);
    return manager as unknown as {
        prepareMergeSafeImport: (data: unknown) => {
            data: { customPersonas: Record<string, Persona>; chatHistories: Record<string, ChatMessage[]> };
            keyMap: Map<string, string>;
            skippedSourceKeys: Set<string>;
            photoAssetIdMap: Map<string, string>;
            attachmentAssetIdMap: Map<string, string>;
            summary: { importedMessages: number; renamedConflicts: number; skippedDuplicates: number };
        };
    };
};

test('safe import skips an archive that is already a prefix of newer local history', () => {
    const prepared = createFileManager().prepareMergeSafeImport({
        customPersonas: { custom_iu: { ...persona, avatarUrl: null } },
        chatHistories: { custom_iu: [existingHistory[0]] },
        diaries: {},
        interests: {},
    });

    assert.equal(prepared.skippedSourceKeys.has('custom_iu'), true);
    assert.equal(prepared.summary.skippedDuplicates, 1);
    assert.equal(prepared.summary.importedMessages, 0);
    assert.deepEqual(existingHistory.map(message => message.id), ['one', 'two']);
});

test('safe import renames conflicting history instead of overwriting the local room', () => {
    const importedHistory: ChatMessage[] = [
        { id: 'different', role: 'model', content: { text: 'different archive' } },
    ];
    const prepared = createFileManager().prepareMergeSafeImport({
        customPersonas: { custom_iu: { ...persona, avatarUrl: null } },
        chatHistories: { custom_iu: importedHistory },
        diaries: {},
        interests: {},
    });
    const targetKey = prepared.keyMap.get('custom_iu');

    assert.match(targetKey || '', /^custom_import_custom_iu_/u);
    assert.equal(prepared.summary.renamedConflicts, 1);
    assert.equal(prepared.data.chatHistories[targetKey!], importedHistory);
    assert.deepEqual(existingHistory.map(message => message.id), ['one', 'two']);
});

test('portable photo upgrades replace stale URL references without duplicating the conversation', () => {
    const currentHistory: ChatMessage[] = [
        { id: 'photo-message', role: 'model', content: { text: 'photo', imageUrl: 'https://expired.example/photo.webp' } },
    ];
    const importedHistory: ChatMessage[] = [
        { id: 'photo-message', role: 'model', content: { text: 'photo', imageAssetId: 'portable-photo-1' } },
    ];
    const prepared = createFileManager(currentHistory).prepareMergeSafeImport({
        customPersonas: { custom_iu: { ...persona, avatarUrl: null } },
        chatHistories: { custom_iu: importedHistory },
        diaries: {},
        interests: {},
    });

    assert.equal(prepared.keyMap.get('custom_iu'), 'custom_iu');
    assert.equal(prepared.summary.renamedConflicts, 0);
    assert.equal(prepared.summary.skippedDuplicates, 0);
    assert.equal(prepared.data.chatHistories.custom_iu[0].content.imageAssetId, 'portable-photo-1');
});

test('storage failure rolls back the whole import instead of leaving partial data', () => {
    const storage = new Map<string, string>();
    let rejectImportedHistory = false;
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => {
                if (rejectImportedHistory && key === 'chatHistories') {
                    throw new DOMException('Quota exceeded', 'QuotaExceededError');
                }
                storage.set(key, value);
            },
        },
    });
    const manager = new MemoryManager();
    manager.setChatHistory('keep-room', [
        { id: 'keep-message', role: 'model', content: { text: 'keep me' } },
    ]);
    rejectImportedHistory = true;
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
        assert.throws(() => manager.loadAllData({
            customPersonas: { custom_imported: { ...persona, avatarUrl: null } },
            chatHistories: {
                custom_imported: [
                    { id: 'imported-message', role: 'model', content: { text: 'new import' } },
                ],
            },
        }), /匯入已取消/u);
    } finally {
        console.error = originalConsoleError;
    }
    assert.equal(manager.getPersona('custom_imported'), undefined);
    assert.deepEqual(manager.peekChatHistory('keep-room').map(message => message.id), ['keep-message']);
    assert.equal(manager.peekChatHistory('custom_imported').length, 0);
});


test('safe import remaps colliding photo and attachment IDs without touching existing history', () => {
    const currentHistory: ChatMessage[] = [
        {
            id: 'local-media',
            role: 'model',
            content: {
                text: 'local media',
                imageAssetId: 'shared-photo-id',
                attachments: [{
                    assetId: 'shared-attachment-id',
                    kind: 'image',
                    name: 'local.png',
                    mimeType: 'image/png',
                    size: 10,
                }],
            },
        },
    ];
    const importedHistory: ChatMessage[] = [
        {
            id: 'imported-media',
            role: 'model',
            content: {
                text: 'different imported media',
                imageAssetId: 'shared-photo-id',
                attachments: [{
                    assetId: 'shared-attachment-id',
                    kind: 'image',
                    name: 'imported.png',
                    mimeType: 'image/png',
                    size: 20,
                }],
            },
        },
    ];
    const prepared = createFileManager(currentHistory).prepareMergeSafeImport({
        customPersonas: { custom_iu: { ...persona, avatarUrl: null } },
        chatHistories: { custom_iu: importedHistory },
        diaries: {},
        interests: {},
    });
    const targetKey = prepared.keyMap.get('custom_iu')!;

    assert.notEqual(targetKey, 'custom_iu');
    const importedContent = prepared.data.chatHistories[targetKey][0].content;
    const mappedPhotoId = prepared.photoAssetIdMap.get('shared-photo-id');
    const mappedAttachmentId = prepared.attachmentAssetIdMap.get('shared-attachment-id');

    assert.ok(mappedPhotoId);
    assert.ok(mappedAttachmentId);
    assert.notEqual(mappedPhotoId, 'shared-photo-id');
    assert.notEqual(mappedAttachmentId, 'shared-attachment-id');
    assert.equal(importedContent.imageAssetId, mappedPhotoId);
    assert.equal(importedContent.attachments?.[0].assetId, mappedAttachmentId);

    assert.equal(currentHistory[0].content.imageAssetId, 'shared-photo-id');
    assert.equal(currentHistory[0].content.attachments?.[0].assetId, 'shared-attachment-id');
});

test('portable photo upgrade keeps its archive asset ID when no local asset ID exists', () => {
    const currentHistory: ChatMessage[] = [
        {
            id: 'portable-photo',
            role: 'model',
            content: { text: 'photo', imageUrl: 'https://expired.example/photo.webp' },
        },
    ];
    const importedHistory: ChatMessage[] = [
        {
            id: 'portable-photo',
            role: 'model',
            content: { text: 'photo', imageAssetId: 'portable-photo-asset' },
        },
    ];
    const prepared = createFileManager(currentHistory).prepareMergeSafeImport({
        customPersonas: { custom_iu: { ...persona, avatarUrl: null } },
        chatHistories: { custom_iu: importedHistory },
        diaries: {},
        interests: {},
    });

    assert.equal(prepared.keyMap.get('custom_iu'), 'custom_iu');
    assert.equal(prepared.photoAssetIdMap.size, 0);
    assert.equal(
        prepared.data.chatHistories.custom_iu[0].content.imageAssetId,
        'portable-photo-asset',
    );
});
