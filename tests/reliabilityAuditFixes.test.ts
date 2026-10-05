import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const albumSource = readFileSync(new URL('../features/albumUi.ts', import.meta.url), 'utf8');
const mimicSource = readFileSync(new URL('../features/mimicPersonaCreator.ts', import.meta.url), 'utf8');
const fileManagerSource = readFileSync(new URL('../fileManager.ts', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

test('album export recovers from failures and keeps mobile blob downloads alive long enough', () => {
    assert.equal(albumSource.includes("await zip.generateAsync({ type: 'blob' })"), true);
    assert.equal(albumSource.includes('if (!response.ok) throw new Error'), true);
    assert.equal(albumSource.includes('updateAlbumActionButtons();'), true);
    assert.equal(albumSource.includes('window.setTimeout(() => URL.revokeObjectURL(url), 1000)'), true);
    assert.equal(albumSource.includes('Promise.allSettled(assetIds.map'), true);
});

test('mimic avatar preview never interpolates an external URL through innerHTML', () => {
    assert.equal(mimicSource.includes("const image = document.createElement('img')"), true);
    assert.equal(mimicSource.includes('image.src = avatarUrl'), true);
    assert.equal(mimicSource.includes('mimicAvatarPreview.innerHTML'), false);
});

test('chat and image ZIP exports await compression and revoke generated object URLs later', () => {
    const awaitedZipCount = fileManagerSource.split('await zip.generateAsync(').length - 1;
    assert.ok(awaitedZipCount >= 2, 'expected at least two awaited zip generations');
    assert.equal(fileManagerSource.includes(').then((content: Blob) => {'), false);
    assert.equal(fileManagerSource.includes('window.setTimeout(() => URL.revokeObjectURL(url), 1000)'), true);
    assert.equal(fileManagerSource.includes('Image download failed with HTTP'), true);
});

test('save-and-exit waits for the archive and keeps the user in place on failure', () => {
    assert.equal(indexSource.includes("saveAndExitBtn.addEventListener('click', async () =>"), true);
    assert.equal(indexSource.includes('await manager.saveCurrentChat(conversationKey, title)'), true);
    assert.equal(indexSource.includes('Failed to save chat before exit'), true);
    assert.equal(indexSource.includes('匯出聊天失敗'), true);
    assert.equal(indexSource.includes('匯出群組失敗'), true);
});
