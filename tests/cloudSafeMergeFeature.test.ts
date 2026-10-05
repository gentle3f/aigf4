import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../supabaseCloudSync.ts', import.meta.url), 'utf8');
const roomManagerSource = readFileSync(new URL('../roomManager.ts', import.meta.url), 'utf8');
const mergeSource = readFileSync(new URL('../cloudMessageMerge.ts', import.meta.url), 'utf8');
const normalizedSource = source.replace(/\r\n/gu, '\n');

test('push helpers calculate candidate indexes without committing them before state CAS', () => {
    const mediaStart = source.indexOf('private async pushMedia');
    const pullTransactionStart = source.indexOf('private async createCloudPullTransactionSnapshot', mediaStart);
    const mediaSource = source.slice(mediaStart, pullTransactionStart);
    const messageStart = source.indexOf('private async pushMessages');
    const deletionPlanStart = source.indexOf('private async applyRemoteDeletionPlan', messageStart);
    const messageSource = source.slice(messageStart, deletionPlanStart);

    assert.match(mediaSource, /return \{ nextIndex, removedIds \}/);
    assert.doesNotMatch(mediaSource, /writeCloudSyncIndex\(MEDIA_INDEX_KEY/);
    assert.doesNotMatch(mediaSource, /\.delete\(\)/);
    assert.match(messageSource, /removedByConversation:/);
    assert.match(messageSource, /removedConversations/);
    assert.doesNotMatch(messageSource, /writeCloudSyncIndex\((?:MESSAGE|CONVERSATION)_INDEX_KEY/);
    assert.doesNotMatch(messageSource, /\.delete\(\)/);
});

test('safe merge pull filters known local media deletions before downloading cloud rows', () => {
    assert.ok(source.includes('await this.pullMedia(mediaRows, mergeLocal, localTransaction);'));
    assert.ok(source.includes('const locallyDeletedIds = findLocallyDeletedIndexedKeys(previousIndex, currentIds);'));
    assert.ok(source.includes('rows = rows.filter(row => !locallyDeletedIds.has(row.asset_id));'));
});

test('safe state merge tracks entity presence even when there is no conversation history', () => {
    assert.ok(source.includes("const STATE_ENTITY_INDEX_KEY = 'wetappCloudStateEntityIndexV1';"));
    assert.ok(source.includes('if (deviceHasSynced && !hasPendingChanges) {'));
    assert.ok(source.includes('await this.ensureStateEntityIndexBaseline();'));
    assert.ok(source.includes('const existing = await readCloudSyncIndex(STATE_ENTITY_INDEX_KEY);'));
    assert.ok(source.includes('if (Object.keys(existing).length > 0) return;'));
    assert.ok(source.includes('const local = this.localStateEntityIndex();'));
    assert.ok(source.includes('await writeCloudSyncIndex(STATE_ENTITY_INDEX_KEY, local);'));
    assert.ok(source.includes('writeCloudSyncIndex(STATE_ENTITY_INDEX_KEY, this.stateEntityIndex(payload))'));
    assert.ok(source.includes('readCloudSyncIndex(STATE_ENTITY_INDEX_KEY)'));
    assert.ok(source.includes('const locallyDeletedStateEntities ='));
    assert.ok(source.includes('filterRemoteStateEntities('));
    assert.ok(mergeSource.includes('locallyDeletedStateEntities.has(`persona:${key}`)'));
    assert.ok(mergeSource.includes('locallyDeletedStateEntities.has(`room:${room.id}`)'));
    assert.ok(source.includes('writeCloudSyncIndex(STATE_ENTITY_INDEX_KEY, this.stateEntityIndex({'));
    assert.ok(source.includes('this.roomManager.importData(rooms, true, mergeLocal);'));
});

test('safe state merge still respects durable deleted-room tombstones', () => {
    assert.ok(roomManagerSource.includes('getDeletedRoomIds() {'));
    assert.ok(roomManagerSource.includes('return new Set(this.deletedRoomIds);'));
    assert.ok(source.includes('deletedRoomIds: this.roomManager.getDeletedRoomIds()'));
    assert.ok(mergeSource.includes('!deletedRoomIds.has(room.id)'));
});


test('pending local state conflicts with another device route through safe recovery before push', () => {
    assert.ok(source.includes('const pendingCloudConflict = shouldRecoverPendingCloudConflict({'));
    assert.ok(source.includes('cloudStateExists: Boolean(remoteState)'));
    assert.ok(source.includes('cloudSourceDeviceId: remoteState?.source_device_id'));
    assert.ok(source.includes('localDeviceId: this.deviceId'));
    assert.ok(source.includes('this.pullRecoveryRequired || safeMergeRequired || pendingCloudConflict'));
    assert.ok(source.includes('await this.recoverCloudSafely();'));
});


test('runtime pending pushes probe cloud ownership before uploading', () => {
    assert.ok(source.includes('private async pushPendingChangesSafely(): Promise<boolean> {'));
    assert.ok(source.includes(".from('wetapp_state')"));
    assert.ok(source.includes(".select('revision,source_device_id')"));
    assert.ok(source.includes('const pendingCloudConflict = shouldRecoverPendingCloudConflict({'));
    assert.ok(source.includes('if (pendingCloudConflict) {'));
    assert.ok(source.includes('return this.recoverCloudSafely();'));
    assert.ok(source.includes('return this.pushLocalToCloud(false, false, remoteState.revision);'));

    const schedulePushStart = source.indexOf('private schedulePush(delay: number) {');
    const schedulePullStart = source.indexOf('private schedulePull(delay: number) {', schedulePushStart);
    const schedulePushSource = source.slice(schedulePushStart, schedulePullStart);
    assert.match(schedulePushSource, /void this\.pushPendingChangesSafely\(\);/);
    assert.doesNotMatch(schedulePushSource, /void this\.pushLocalToCloud\(\);/);

    const syncNowStart = source.indexOf('async syncNow() {');
    const reloadStart = source.indexOf('async reloadFromCloud()', syncNowStart);
    const syncNowSource = source.slice(syncNowStart, reloadStart);
    assert.match(syncNowSource, /localStorage\.setItem\(PENDING_KEY, 'true'\);/);
    assert.match(syncNowSource, /await this\.pushPendingChangesSafely\(\);/);
    assert.doesNotMatch(syncNowSource, /await this\.pushLocalToCloud\(\);/);
});

test('realtime remote changes force safe recovery when local edits are pending', () => {
    const realtimeStart = source.indexOf('private async startRealtime() {');
    const stopRealtimeStart = source.indexOf('private async stopRealtime()', realtimeStart);
    const realtimeSource = source.slice(realtimeStart, stopRealtimeStart);

    assert.match(realtimeSource, /sourceDeviceId === this\.deviceId/);
    assert.match(realtimeSource, /localStorage\.getItem\(PENDING_KEY\) === 'true'/);
    assert.match(realtimeSource, /this\.setPullRecoveryRequired\(true\);/);
    assert.match(realtimeSource, /this\.schedulePull\(900\);/);
});


test('reconnect with pending local changes enters safe recovery before any upload', () => {
    const onlineStart = source.indexOf('private readonly handleOnline = () => {');
    const offlineStart = source.indexOf('private readonly handleOffline = () => {', onlineStart);
    const onlineSource = source.slice(onlineStart, offlineStart);

    assert.match(onlineSource, /localStorage\.getItem\(PENDING_KEY\) === 'true'/);
    assert.match(onlineSource, /this\.setPullRecoveryRequired\(true\);/);
    assert.match(onlineSource, /this\.schedulePull\(250\);/);
    assert.doesNotMatch(onlineSource, /schedulePush\(/);
});


test('realtime changes are never dropped while a cloud operation is busy', () => {
    const realtimeStart = source.indexOf('private async startRealtime() {');
    const stopRealtimeStart = source.indexOf('private async stopRealtime()', realtimeStart);
    const realtimeSource = source.slice(realtimeStart, stopRealtimeStart);

    assert.match(realtimeSource, /if \(sourceDeviceId === this\.deviceId\) return;/);
    assert.match(realtimeSource, /this\.remoteStateChangeEpoch \+= 1;/);
    assert.doesNotMatch(realtimeSource, /this\.applyingRemote \|\| this\.pushing/);
    assert.match(realtimeSource, /this\.schedulePull\(900\);/);
});

test('pull scheduling waits for active cloud work instead of dropping the request', () => {
    const scheduleStart = source.indexOf('private schedulePull(delay: number) {');
    const readHeadStart = source.indexOf('private async readCloudStateHead(', scheduleStart);
    const scheduleSource = source.slice(scheduleStart, readHeadStart);

    assert.match(scheduleSource, /if \(!sessionUserId \|\| this\.pullTimer !== null\) return;/);
    assert.match(scheduleSource, /if \(!this\.isCurrentSession\(sessionUserId, sessionGeneration\)\) return;/);
    assert.match(scheduleSource, /if \(this\.pushing \|\| this\.pulling\) \{/);
    assert.match(scheduleSource, /this\.schedulePull\(100\);/);
});

test('pull reconciliation tracks remote epochs and repeats if a newer event arrives mid-pull', () => {
    const pullStart = source.indexOf('private async pullCloudToLocal');
    const buildStateStart = source.indexOf('private async buildStatePayload()', pullStart);
    const pullSource = source.slice(pullStart, buildStateStart);

    assert.match(pullSource, /const reconcileEpoch = this\.remoteStateChangeEpoch;/);
    assert.match(
        pullSource,
        /const hasOutstandingRemoteChange = \(\s*this\.remoteStateChangeEpoch > this\.reconciledRemoteStateChangeEpoch\s*\);/,
    );
    assert.match(pullSource, /if \(!hasOutstandingRemoteChange && shouldSkipRedundantCloudPull/);
    assert.match(
        pullSource,
        /this\.reconciledRemoteStateChangeEpoch = Math\.max\([\s\S]*this\.reconciledRemoteStateChangeEpoch,[\s\S]*reconcileEpoch,[\s\S]*\);/,
    );
    assert.match(
        pullSource,
        /pullCompleted[\s\S]*this\.remoteStateChangeEpoch > this\.reconciledRemoteStateChangeEpoch[\s\S]*this\.schedulePull\(0\);/,
    );
});


test('cloud push and pull execution both defer while a local archive transaction batch is active', () => {
    assert.match(
        source,
        /private async pushPendingChangesSafely\(\): Promise<boolean> \{[\s\S]*isLocalCloudChangeBatchActive\(\)[\s\S]*this\.schedulePush\(250\);[\s\S]*return false;/,
    );

    const pushStart = source.indexOf('private async pushLocalToCloud');
    const pullStart = source.indexOf('private async pullCloudToLocal', pushStart);
    const pushSource = source.slice(pushStart, pullStart);
    assert.match(pushSource, /isLocalCloudChangeBatchActive\(\)/);
    assert.match(pushSource, /localStorage\.setItem\(PENDING_KEY, 'true'\)/);
    assert.match(pushSource, /this\.schedulePush\(250\)/);

    const pullEnd = source.indexOf('private async buildStatePayload()', pullStart);
    const pullSource = source.slice(pullStart, pullEnd);
    assert.match(pullSource, /isLocalCloudChangeBatchActive\(\)/);
    assert.match(pullSource, /this\.setPullRecoveryRequired\(true\)/);
    assert.match(pullSource, /this\.schedulePull\(250\)/);
});


test('cloud pull applies media, state and sync indexes inside one local rollback boundary', () => {
    const pullStart = source.indexOf('private async pullCloudToLocal');
    const buildStateStart = source.indexOf('private async buildStatePayload()', pullStart);
    const pullSource = source.slice(pullStart, buildStateStart);

    assert.match(pullSource, /const localTransaction = await this\.createCloudPullTransactionSnapshot\(\);/);
    assert.match(pullSource, /await this\.pullMedia\(mediaRows, mergeLocal, localTransaction\);/);
    assert.match(pullSource, /await this\.applyRemoteData\(/);
    assert.match(pullSource, /await this\.refreshLocalIndexes\(/);
    assert.match(pullSource, /await this\.rollbackCloudPullTransaction\(localTransaction\);/);
    assert.match(pullSource, /throw new AggregateError\([\s\S]*本機狀態無法完整回復/);
});
