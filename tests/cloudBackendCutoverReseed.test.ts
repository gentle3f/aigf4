import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../supabaseCloudSync.ts', import.meta.url), 'utf8');

test('safe-merge protocol v2 forces a complete local snapshot before merge', () => {
    assert.match(source, /localStorage\.getItem\(SAFE_MERGE_VERSION_KEY\) !== '2'/);
    assert.match(source, /pushLocalToCloud\(false, true, undefined, true\)/);
    assert.match(source, /localStorage\.setItem\(SAFE_MERGE_VERSION_KEY, '2'\)/);
});

test('forced cutover reseed ignores stale message and media indexes without deleting remote rows', () => {
    const pushStart = source.indexOf('private async pushLocalToCloud');
    const pullStart = source.indexOf('private async pullCloudToLocal', pushStart);
    const pushSource = source.slice(pushStart, pullStart);
    assert.match(pushSource, /forceFullSnapshot = false/);
    assert.match(pushSource, /pushMedia\(media, preserveRemote, sessionUserId, sessionGeneration, forceFullSnapshot\)/);
    assert.match(pushSource, /pushMessages\(preserveRemote, sessionUserId, sessionGeneration, forceFullSnapshot\)/);

    const messageStart = source.indexOf('private async pushMessages');
    const deleteStart = source.indexOf('private async applyRemoteDeletionPlan', messageStart);
    const messageSource = source.slice(messageStart, deleteStart);
    assert.match(messageSource, /forceAll = false/);
    assert.match(messageSource, /const changed = forceAll\s*\? messages\s*:/);

    const mediaStart = source.indexOf('private async pushMedia');
    const snapshotStart = source.indexOf('private async createCloudPullTransactionSnapshot', mediaStart);
    const mediaSource = source.slice(mediaStart, snapshotStart);
    assert.match(mediaSource, /forceAll = false/);
    assert.match(mediaSource, /const changed = forceAll\s*\? media\s*:/);

    const recoveryStart = source.indexOf('private async recoverCloudSafely');
    const normalPushStart = source.indexOf('private async pushLocalToCloud', recoveryStart);
    const recoverySource = source.slice(recoveryStart, normalPushStart);
    assert.match(recoverySource, /pushLocalToCloud\(false, true, undefined, true\)/);
});
