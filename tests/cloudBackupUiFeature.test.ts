import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Cloud Backup UI and full manager stay lazy behind lightweight persisted state', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/cloudBackupUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/cloudBackup\.js['"]\)/);
    assert.doesNotMatch(indexSource, /import \{ CloudBackupManager \} from/);
    assert.match(indexSource, /const cloudBackupStartupState = initializeCloudBackupState\(\)/);
    assert.match(indexSource, /if \(cloudBackupStartupState\.enabled\) \{\s*void loadCloudBackupManager\(\)/);
    assert.match(indexSource, /new CloudBackupManager\(\{/);
    assert.match(indexSource, /manager\.startAutoBackup\(\)/);
    assert.match(indexSource, /createAllDataArchive:\s*async \(\) => \(await loadFileManager\(\)\)\.createAllDataArchive\(\)/);
    assert.match(indexSource, /restoreAllDataArchive:\s*async/);
    assert.doesNotMatch(indexSource, /import \{ FileManager \} from/);
    assert.match(indexSource, /Promise\.all\(\[\s*import\(['"]\.\/features\/cloudBackupUi\.js['"]\),\s*loadCloudBackupManager\(\)/);
    assert.match(indexSource, /onProgress:\s*progress\s*=>\s*cloudBackupUi\?\.renderProgress\(progress\)/);
    assert.match(indexSource, /onStateChange:\s*\(\)\s*=>\s*\{\s*void cloudBackupUi\?\.refreshIfOpen\(false\);\s*\}/);
    assert.doesNotMatch(indexSource, /const cloudBackupModal|renderCloudBackupState|refreshCloudBackupView|scanLocalPhotoVault/);
    assert.match(featureSource, /export const createCloudBackupUi/);
    assert.match(featureSource, /cloudBackupManager\.getState\(\)/);
    assert.match(featureSource, /cloudBackupManager\.backupNow\(\)/);
    assert.match(featureSource, /cloudBackupManager\.restoreBackup\(/);
});

test('Cloud Backup cold feature does not own backup startup or chat/review behaviour', () => {
    const featureSource = readFileSync(new URL('../features/cloudBackupUi.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(featureSource, /new CloudBackupManager|cloudBackupManager\.startAutoBackup\(|startChat|RoomManager|strictReview|Jev|wardrobe/i);
    assert.match(featureSource, /listCharacterPhotoAssets\(\)/);
    assert.match(featureSource, /memoryManager\.getAllChatHistories\(\)/);
});
