import assert from 'node:assert/strict';
import test from 'node:test';
import {
    decryptCloudBackup,
    deriveCloudBackupKey,
    deriveCloudBackupVaultId,
    encryptCloudBackup,
    parseCloudBackupHeader,
} from '../cloudBackup.js';

const salt = new Uint8Array(Array.from({ length: 16 }, (_, index) => index + 1));

test('recovery passwords map to stable isolated cloud vaults', async () => {
    const first = await deriveCloudBackupVaultId('a sufficiently long recovery password');
    const repeated = await deriveCloudBackupVaultId('a sufficiently long recovery password');
    const different = await deriveCloudBackupVaultId('a different sufficiently long password');

    assert.equal(first, repeated);
    assert.notEqual(first, different);
    assert.match(first, /^[a-zA-Z0-9_-]{43}$/u);
});

test('cloud backup encrypts and restores a multi-chunk archive exactly', async () => {
    const original = new Blob(['Wetapp private archive\n', 'x'.repeat(240)], { type: 'application/zip' });
    const key = await deriveCloudBackupKey('a sufficiently long recovery password', salt, 100_000);
    const encrypted = await encryptCloudBackup(original, key, salt, undefined, 37, 100_000);
    const parsed = await parseCloudBackupHeader(encrypted);
    const restored = await decryptCloudBackup(encrypted, key);

    assert.equal(parsed.header.chunkCount, Math.ceil(original.size / 37));
    assert.equal(parsed.header.originalSize, original.size);
    assert.equal(parsed.header.iterations, 100_000);
    assert.equal(await restored.text(), await original.text());
});

test('cloud backup rejects the wrong recovery password', async () => {
    const original = new Blob(['private conversation data'], { type: 'application/zip' });
    const correctKey = await deriveCloudBackupKey('the correct recovery password', salt, 100_000);
    const wrongKey = await deriveCloudBackupKey('the completely wrong password', salt, 100_000);
    const encrypted = await encryptCloudBackup(original, correctKey, salt, undefined, 16, 100_000);

    await assert.rejects(
        decryptCloudBackup(encrypted, wrongKey),
        /復原密碼不正確/u,
    );
});

test('cloud backup detects a truncated upload before attempting restore', async () => {
    const original = new Blob(['important data'.repeat(20)], { type: 'application/zip' });
    const key = await deriveCloudBackupKey('another long recovery password', salt, 100_000);
    const encrypted = await encryptCloudBackup(original, key, salt, undefined, 40, 100_000);
    const truncated = encrypted.slice(0, encrypted.size - 5);

    await assert.rejects(
        parseCloudBackupHeader(truncated),
        /可能未完整上傳/u,
    );
});
