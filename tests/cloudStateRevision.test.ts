import assert from 'node:assert/strict';
import test from 'node:test';
import {
    isCloudStateRevisionConflict,
    normalizeCloudStateRevision,
} from '../cloudStateRevision.js';

test('normalizes cloud state revisions into non-negative integer CAS baselines', () => {
    assert.equal(normalizeCloudStateRevision(undefined), 0);
    assert.equal(normalizeCloudStateRevision(null), 0);
    assert.equal(normalizeCloudStateRevision(0), 0);
    assert.equal(normalizeCloudStateRevision(-4), 0);
    assert.equal(normalizeCloudStateRevision('7'), 7);
    assert.equal(normalizeCloudStateRevision(8.9), 8);
    assert.equal(normalizeCloudStateRevision('not-a-number'), 0);
});

test('detects stable revision conflicts by SQLSTATE or RPC message', () => {
    assert.equal(isCloudStateRevisionConflict({
        code: '40001',
        message: 'could not serialize access',
    }), true);
    assert.equal(isCloudStateRevisionConflict({
        code: 'P0001',
        message: 'WETAPP_STATE_REVISION_CONFLICT',
    }), true);
    assert.equal(isCloudStateRevisionConflict({
        code: 'P0001',
        details: 'WETAPP_STATE_CONFLICT',
    }), true);
    assert.equal(isCloudStateRevisionConflict({
        code: 'P0001',
        message: 'other error',
    }), false);
    assert.equal(isCloudStateRevisionConflict(null), false);
});
