import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRecoverPendingCloudConflict, shouldSkipRedundantCloudPull } from '../cloudSyncPullPolicy.js';

const base = {
    force: false,
    cloudSourceDeviceId: 'phone-a',
    localDeviceId: 'phone-a',
    syncedUserId: 'owner-1',
    sessionUserId: 'owner-1',
    hasPendingChanges: false,
};

test('skips a redundant full download on the already-synced source device', () => {
    assert.equal(shouldSkipRedundantCloudPull(base), true);
});

test('downloads changes made by another device', () => {
    assert.equal(shouldSkipRedundantCloudPull({
        ...base,
        cloudSourceDeviceId: 'laptop-b',
    }), false);
});

test('never skips a manual reload or pending local changes', () => {
    assert.equal(shouldSkipRedundantCloudPull({ ...base, force: true }), false);
    assert.equal(shouldSkipRedundantCloudPull({ ...base, hasPendingChanges: true }), false);
});

test('requires proof that this account was previously synced locally', () => {
    assert.equal(shouldSkipRedundantCloudPull({ ...base, syncedUserId: null }), false);
    assert.equal(shouldSkipRedundantCloudPull({ ...base, syncedUserId: 'owner-2' }), false);
});


test('recovers safely when pending local state may conflict with another device cloud state', () => {
    assert.equal(shouldRecoverPendingCloudConflict({
        deviceHasSynced: true,
        hasPendingChanges: true,
        cloudStateExists: true,
        cloudSourceDeviceId: 'laptop-b',
        localDeviceId: 'phone-a',
    }), true);
});

test('treats an existing cloud state with unknown source as a conflict when local changes are pending', () => {
    assert.equal(shouldRecoverPendingCloudConflict({
        deviceHasSynced: true,
        hasPendingChanges: true,
        cloudStateExists: true,
        cloudSourceDeviceId: null,
        localDeviceId: 'phone-a',
    }), true);
});

test('does not force safe recovery for same-device pending state or cases without a real state conflict', () => {
    assert.equal(shouldRecoverPendingCloudConflict({
        deviceHasSynced: true,
        hasPendingChanges: true,
        cloudStateExists: true,
        cloudSourceDeviceId: 'phone-a',
        localDeviceId: 'phone-a',
    }), false);
    assert.equal(shouldRecoverPendingCloudConflict({
        deviceHasSynced: true,
        hasPendingChanges: false,
        cloudStateExists: true,
        cloudSourceDeviceId: 'laptop-b',
        localDeviceId: 'phone-a',
    }), false);
    assert.equal(shouldRecoverPendingCloudConflict({
        deviceHasSynced: true,
        hasPendingChanges: true,
        cloudStateExists: false,
        cloudSourceDeviceId: null,
        localDeviceId: 'phone-a',
    }), false);
    assert.equal(shouldRecoverPendingCloudConflict({
        deviceHasSynced: false,
        hasPendingChanges: true,
        cloudStateExists: true,
        cloudSourceDeviceId: 'laptop-b',
        localDeviceId: 'phone-a',
    }), false);
});
