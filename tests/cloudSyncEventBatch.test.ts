import assert from 'node:assert/strict';
import test from 'node:test';
import {
    beginLocalCloudChangeBatch,
    isLocalCloudChangeBatchActive,
    LOCAL_CLOUD_CHANGE_EVENT,
    notifyLocalCloudChange,
} from '../cloudSyncEvents.js';

const installWindow = () => {
    const target = new EventTarget();
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: target,
    });
    return target;
};

test('local cloud changes stay silent inside a batch and flush unique scopes on commit', () => {
    const target = installWindow();
    const scopes: string[] = [];
    target.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, event => {
        scopes.push((event as CustomEvent<{ scope: string }>).detail.scope);
    });

    const batch = beginLocalCloudChangeBatch();
    assert.equal(isLocalCloudChangeBatchActive(), true);
    notifyLocalCloudChange('state');
    notifyLocalCloudChange('media');
    notifyLocalCloudChange('state');
    assert.deepEqual(scopes, []);

    batch.close(true);
    assert.equal(isLocalCloudChangeBatchActive(), false);
    assert.deepEqual(scopes.sort(), ['media', 'state']);
});

test('nested batches merge committed scopes into the parent and discarded scopes never escape', () => {
    const target = installWindow();
    const scopes: string[] = [];
    target.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, event => {
        scopes.push((event as CustomEvent<{ scope: string }>).detail.scope);
    });

    const outer = beginLocalCloudChangeBatch();
    notifyLocalCloudChange('messages');

    const committedInner = beginLocalCloudChangeBatch();
    notifyLocalCloudChange('media');
    committedInner.close(true);

    const discardedInner = beginLocalCloudChangeBatch();
    notifyLocalCloudChange('rooms');
    discardedInner.close(false);

    assert.deepEqual(scopes, []);
    outer.close(true);
    assert.deepEqual(scopes.sort(), ['media', 'messages']);
});

test('discarding the outer batch prevents transient local state from becoming a cloud-change event', () => {
    const target = installWindow();
    const scopes: string[] = [];
    target.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, event => {
        scopes.push((event as CustomEvent<{ scope: string }>).detail.scope);
    });

    const batch = beginLocalCloudChangeBatch();
    notifyLocalCloudChange('state');
    notifyLocalCloudChange('messages');
    notifyLocalCloudChange('rooms');
    notifyLocalCloudChange('media');
    batch.close(false);

    assert.equal(isLocalCloudChangeBatchActive(), false);
    assert.deepEqual(scopes, []);
});
