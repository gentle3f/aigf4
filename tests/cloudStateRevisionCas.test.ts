import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../supabaseCloudSync.ts', import.meta.url), 'utf8');
const migration = readFileSync(
    new URL('../supabase/migrations/20260928000000_wetapp_state_revision_cas.sql', import.meta.url),
    'utf8',
);

test('cloud state migration uses revision compare-and-swap for insert and update', () => {
    assert.match(migration, /create or replace function public\.wetapp_save_state_if_revision/);
    assert.match(migration, /expected_revision bigint/);
    assert.match(migration, /if coalesce\(expected_revision, 0\) = 0 then/);
    assert.match(migration, /on conflict \(user_id\) do nothing/);
    assert.match(migration, /and revision = expected_revision/);
    assert.match(migration, /errcode = '40001'/);
    assert.match(migration, /message = 'WETAPP_STATE_REVISION_CONFLICT'/);
    assert.match(migration, /grant execute on function public\.wetapp_save_state_if_revision\(jsonb, text, bigint\) to authenticated/);
});

test('client state commits always carry the observed revision and never call the legacy state writer', () => {
    assert.match(source, /private lastObservedCloudStateRevision: number \| null = null/);
    assert.match(source, /private async readCloudStateHead\([\s\S]*sessionUserId = this\.session\?\.user\.id \|\| ''[\s\S]*\)/);
    assert.match(source, /\.select\('revision,source_device_id'\)/);
    assert.match(source, /assertCurrentSessionUser\(sessionUserId, sessionGeneration\)[\s\S]*this\.lastObservedCloudStateRevision = revision/);
    assert.match(source, /Missing expected cloud state revision/);
    assert.match(source, /rpc\('wetapp_save_state_if_revision'/);
    assert.match(source, /expected_revision: stateRevision \?\? 0/);
    assert.doesNotMatch(source, /rpc\('wetapp_save_state',/);
    assert.match(source, /this\.lastObservedCloudStateRevision = normalizeCloudStateRevision\(savedRevision\)/);
});

test('revision conflict keeps local changes pending and immediately schedules safe recovery', () => {
    assert.match(source, /if \(isCloudStateRevisionConflict\(error\)\) \{/);
    assert.match(source, /revisionConflict = true/);
    assert.match(source, /this\.setPullRecoveryRequired\(true\)/);
    assert.match(source, /偵測到另一部裝置剛更新雲端，正在安全合併/);
    assert.match(source, /if \(revisionConflict \|\| supersededByActiveSession\) this\.schedulePull\(0\)/);
});

test('initial and post-merge state pushes use the revision that was actually observed', () => {
    assert.match(
        source,
        /this\.lastObservedCloudStateRevision = normalizeCloudStateRevision\(remoteState\?\.revision\)/,
    );
    assert.match(
        source,
        /pushLocalToCloud\(true, false, this\.lastObservedCloudStateRevision \?\? 0\)/,
    );
    assert.match(
        source,
        /return this\.pushLocalToCloud\([\s\S]*this\.lastObservedCloudStateRevision \?\? 0,[\s\S]*\);/,
    );
    assert.match(
        source,
        /this\.lastObservedCloudStateRevision = normalizeCloudStateRevision\(stateResponse\.data\?\.revision\)/,
    );
});


test('local sync indexes advance only after state compare-and-swap succeeds', () => {
    const pushStart = source.indexOf('private async pushLocalToCloud');
    const pullStart = source.indexOf('private async pullCloudToLocal', pushStart);
    const pushSource = source.slice(pushStart, pullStart);

    const rpcIndex = pushSource.indexOf("rpc('wetapp_save_state_if_revision'");
    const indexCommitIndex = pushSource.indexOf('writeCloudSyncIndex(MEDIA_INDEX_KEY');
    assert.ok(rpcIndex >= 0);
    assert.ok(indexCommitIndex > rpcIndex);
    assert.match(pushSource, /applyRemoteDeletionPlan\(mediaPlan, messagePlan, sessionUserId, sessionGeneration\)/);
    assert.match(pushSource, /writeCloudSyncIndex\(MESSAGE_INDEX_KEY, messagePlan\.hashes\)/);
    assert.match(pushSource, /writeCloudSyncIndex\(CONVERSATION_INDEX_KEY, messagePlan\.conversationIndex\)/);
    assert.match(pushSource, /writeCloudSyncIndex\(STATE_ENTITY_INDEX_KEY, this\.stateEntityIndex\(payload\)\)/);
});


test('destructive cloud deletes happen only after state compare-and-swap succeeds', () => {
    const pushStart = source.indexOf('private async pushLocalToCloud');
    const pullStart = source.indexOf('private async pullCloudToLocal', pushStart);
    const pushSource = source.slice(pushStart, pullStart);
    const rpcIndex = pushSource.indexOf("rpc('wetapp_save_state_if_revision'");
    const deletePlanIndex = pushSource.indexOf('applyRemoteDeletionPlan(mediaPlan, messagePlan, sessionUserId, sessionGeneration)');

    assert.ok(rpcIndex >= 0);
    assert.ok(deletePlanIndex > rpcIndex);

    const messageStart = source.indexOf('private async pushMessages');
    const deleteHelperStart = source.indexOf('private async applyRemoteDeletionPlan', messageStart);
    const messageSource = source.slice(messageStart, deleteHelperStart);
    assert.doesNotMatch(messageSource, /\.delete\(\)/);

    const mediaStart = source.indexOf('private async pushMedia');
    const pullSnapshotStart = source.indexOf('private async createCloudPullTransactionSnapshot', mediaStart);
    const mediaSource = source.slice(mediaStart, pullSnapshotStart);
    assert.doesNotMatch(mediaSource, /\.delete\(\)/);
});
