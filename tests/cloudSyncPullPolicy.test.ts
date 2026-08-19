import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSkipRedundantCloudPull } from '../cloudSyncPullPolicy.js';

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
