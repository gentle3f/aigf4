import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Cloud Backup startup only loads the full manager for persisted enabled state', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const stateSource = readFileSync(new URL('../cloudBackupState.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /initializeCloudBackupState\(\)/);
    assert.match(indexSource, /if \(cloudBackupStartupState\.enabled\) \{\s*void loadCloudBackupManager\(\)/);
    assert.match(indexSource, /import\(['"]\.\/cloudBackup\.js['"]\)/);
    assert.doesNotMatch(stateSource, /CloudBackupManager|encryptCloudBackup|fetchJson|FileManager/);
});

test('Cloud Backup manager reuses the extracted persisted-state helpers', () => {
    const source = readFileSync(new URL('../cloudBackup.ts', import.meta.url), 'utf8');

    assert.match(source, /readCloudBackupState/);
    assert.match(source, /persistCloudBackupState/);
    assert.match(source, /cloudBackupStateStorageKey/);
    assert.doesNotMatch(source, /const readState =/);
    assert.doesNotMatch(source, /const persistState =/);
    assert.doesNotMatch(source, /const createDeviceId =/);
});
