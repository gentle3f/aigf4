import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { FileManager } from '../fileManager.js';
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

const createManager = (histories: Record<string, any[]>) => {
    const memoryManager = {
        getAllChatHistories: () => histories,
    };
    return new FileManager(memoryManager as never, {
        downloadAllChatsBtn: {} as HTMLButtonElement,
        downloadImagesBtn: {} as HTMLButtonElement,
        onSingleChatRestored: () => undefined,
        onAllDataRestored: () => undefined,
    }) as unknown as {
        restoreCharacterPhotosFromZip: (
            zip: unknown,
            keyMap?: Map<string, string>,
            assetIdMap?: Map<string, string>,
            skippedSourceKeys?: Set<string>,
        ) => Promise<void>;
        restoreChatAttachmentsFromZip: (
            zip: unknown,
            keyMap?: Map<string, string>,
            assetIdMap?: Map<string, string>,
            skippedSourceKeys?: Set<string>,
        ) => Promise<void>;
    };
};

test('photo collision restore preserves the local blob and writes imported media under the remapped ID', async () => {
    const originalId = 'collision-photo';
    const importedId = 'photo_import_test_collision-photo';
    await saveCharacterPhotoAsset({
        id: originalId,
        personaKey: 'local-chat',
        blob: new Blob(['local-photo'], { type: 'image/webp' }),
        prompt: 'local prompt',
        createdAt: 1,
    });

    const manager = createManager({
        custom_import: [{
            role: 'model',
            content: {
                text: 'imported',
                imageAssetId: importedId,
                imagePrompt: 'imported prompt',
            },
        }],
    });
    const zip = {
        folder: (name: string) => name === 'photos'
            ? {
                forEach: (callback: (path: string, entry: unknown) => void) => {
                    callback(`custom_iu/${originalId}.webp`, {
                        dir: false,
                        async: async () => new Blob(['imported-photo'], { type: 'image/webp' }),
                    });
                },
            }
            : null,
    };

    try {
        await manager.restoreCharacterPhotosFromZip(
            zip,
            new Map([['custom_iu', 'custom_import']]),
            new Map([[originalId, importedId]]),
        );

        const local = await getCharacterPhotoAsset(originalId);
        const imported = await getCharacterPhotoAsset(importedId);
        assert.equal(await local?.blob.text(), 'local-photo');
        assert.equal(local?.personaKey, 'local-chat');
        assert.equal(await imported?.blob.text(), 'imported-photo');
        assert.equal(imported?.personaKey, 'custom_import');
        assert.equal(imported?.prompt, 'imported prompt');
    } finally {
        await deleteCharacterPhotoAsset(originalId);
        await deleteCharacterPhotoAsset(importedId);
    }
});

test('attachment collision restore preserves the local blob and writes imported media under the remapped ID', async () => {
    const originalId = 'collision-attachment';
    const importedId = 'attachment_import_test_collision-attachment';
    await saveChatAttachment({
        id: originalId,
        conversationKey: 'local-chat',
        blob: new Blob(['local-attachment'], { type: 'text/plain' }),
        name: 'local.txt',
        mimeType: 'text/plain',
        createdAt: 1,
    });

    const manager = createManager({
        custom_import: [{
            role: 'user',
            content: {
                text: 'imported',
                attachments: [{
                    assetId: importedId,
                    kind: 'text',
                    name: 'imported.txt',
                    mimeType: 'text/plain',
                    size: 19,
                }],
            },
        }],
    });
    const zip = {
        folder: (name: string) => name === 'attachments'
            ? {
                forEach: (callback: (path: string, entry: unknown) => void) => {
                    callback(`custom_iu/${originalId}.txt`, {
                        dir: false,
                        name: `attachments/custom_iu/${originalId}.txt`,
                        async: async () => new Blob(['imported-attachment'], { type: 'text/plain' }),
                    });
                },
            }
            : null,
    };

    try {
        await manager.restoreChatAttachmentsFromZip(
            zip,
            new Map([['custom_iu', 'custom_import']]),
            new Map([[originalId, importedId]]),
        );

        const local = await getChatAttachment(originalId);
        const imported = await getChatAttachment(importedId);
        assert.equal(await local?.blob.text(), 'local-attachment');
        assert.equal(local?.conversationKey, 'local-chat');
        assert.equal(await imported?.blob.text(), 'imported-attachment');
        assert.equal(imported?.conversationKey, 'custom_import');
        assert.equal(imported?.name, 'imported.txt');
    } finally {
        await deleteChatAttachment(originalId);
        await deleteChatAttachment(importedId);
    }
});
