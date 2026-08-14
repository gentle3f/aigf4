import assert from 'node:assert/strict';
import test from 'node:test';
import { FileManager } from '../fileManager.js';
import type { ChatMessage } from '../managers.js';

const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('legacy character photo URLs are embedded once and rewritten as portable assets', async () => {
    const files = new Map<string, Blob>();
    const zip = {
        folder(name: string) {
            assert.equal(name, 'photos');
            return {
                file(path: string, blob: Blob) {
                    files.set(path, blob);
                },
            };
        },
    };
    const history: ChatMessage[] = [
        { role: 'model', content: { imageUrl: onePixelPng, text: 'first' } },
        { role: 'model', content: { imageUrl: onePixelPng, text: 'duplicate reference' } },
    ];
    const manager = new FileManager(
        {} as never,
        {
            downloadAllChatsBtn: {} as HTMLButtonElement,
            downloadImagesBtn: {} as HTMLButtonElement,
            onSingleChatRestored: () => undefined,
            onAllDataRestored: () => undefined,
        },
    );

    const summary = await (manager as any).addCharacterPhotosToZip(zip, { cc: history });

    assert.deepEqual(summary, {
        referencedPhotos: 2,
        embeddedPhotos: 1,
        migratedLegacyPhotos: 1,
        unavailablePhotos: 0,
    });
    assert.equal(files.size, 1);
    assert.match([...files.keys()][0], /^cc\/legacy-photo-.+\.png$/u);
    assert.equal(history[0].content.imageAssetId, history[1].content.imageAssetId);
    assert.equal(history[0].content.imageUrl, undefined);
    assert.equal(history[1].content.imageUrl, undefined);
});
