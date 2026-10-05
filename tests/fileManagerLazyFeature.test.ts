import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('FileManager is cold-loaded and shared by manual export/import plus Cloud Backup archives', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/fileManager\.js['"]\)/);
    assert.doesNotMatch(indexSource, /import \{ FileManager \} from ['"]\.\/fileManager\.js['"]/);
    assert.match(indexSource, /let fileManagerLoad: Promise<import\(['"]\.\/fileManager\.js['"]\)\.FileManager>/);
    assert.match(indexSource, /createAllDataArchive:\s*async \(\) => \(await loadFileManager\(\)\)\.createAllDataArchive\(\)/);
    assert.match(indexSource, /manager\.saveAllChats\(\)/);
    assert.match(indexSource, /manager\.saveCurrentChat\(/);
    assert.match(indexSource, /manager\.downloadImages\(/);
    assert.match(indexSource, /manager\.handleZipUpload\(e\)/);
});

test('Cloud Backup only depends on the narrow archive provider surface', () => {
    const source = readFileSync(new URL('../cloudBackup.ts', import.meta.url), 'utf8');

    assert.match(source, /export interface CloudBackupArchiveProvider/);
    assert.match(source, /createAllDataArchive:/);
    assert.match(source, /getLastBackupMediaSummary:/);
    assert.match(source, /restoreAllDataArchive:/);
    assert.doesNotMatch(source, /private fileManager:/);
    assert.doesNotMatch(source, /import type \{ FileManager \}/);
});
