import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryManager } from '../managers.js';
import { RoomManager } from '../roomManager.js';
import { SupabaseCloudSyncManager } from '../supabaseCloudSync.js';

const installBrowser = () => {
    const storage = new Map<string, string>();
    const cleared: number[] = [];
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, String(value)); },
            removeItem: (key: string) => { storage.delete(key); },
        },
    });
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { onLine: true },
    });
    const target = new EventTarget() as EventTarget & {
        setTimeout: typeof setTimeout;
        clearTimeout: typeof clearTimeout;
    };
    target.setTimeout = setTimeout;
    target.clearTimeout = ((id: number) => { cleared.push(id); }) as typeof clearTimeout;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: target,
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: new EventTarget(),
    });
    return { storage, cleared };
};

const createManager = () => {
    const phases: string[] = [];
    const sync = new SupabaseCloudSyncManager(
        new MemoryManager(),
        new RoomManager(),
        {
            onStateChange: state => phases.push(state.phase),
            onRemoteApplied: () => undefined,
        },
    );
    return { sync, internal: sync as any, phases };
};

test('auth sign-out clears scheduled cloud work and realtime state before returning signed out', async () => {
    const { cleared } = installBrowser();
    const { internal, phases } = createManager();
    const channel = {};
    const removed: unknown[] = [];

    internal.client = {
        removeChannel: async (value: unknown) => { removed.push(value); },
        auth: { signOut: async () => ({ error: null }) },
    };
    internal.session = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    internal.initializedUserId = 'owner';
    internal.channel = channel;
    internal.pushTimer = 11;
    internal.pullTimer = 12;
    internal.realtimeRetryTimer = 13;
    internal.cloudRetryAttempt = 4;
    internal.realtimeRetryAttempt = 3;

    await internal.applySession(null);

    assert.deepEqual(cleared.sort((a, b) => a - b), [11, 12, 13]);
    assert.deepEqual(removed, [channel]);
    assert.equal(internal.pushTimer, null);
    assert.equal(internal.pullTimer, null);
    assert.equal(internal.realtimeRetryTimer, null);
    assert.equal(internal.cloudRetryAttempt, 0);
    assert.equal(internal.realtimeRetryAttempt, 0);
    assert.equal(internal.channel, null);
    assert.equal(internal.initializedUserId, '');
    assert.equal(phases.at(-1), 'signed_out');
});

test('new owner session clears stale timers and old realtime before initial sync begins', async () => {
    const { cleared } = installBrowser();
    const { internal } = createManager();
    const oldChannel = {};
    const removed: unknown[] = [];

    internal.client = {
        removeChannel: async (value: unknown) => { removed.push(value); },
        auth: { signOut: async () => ({ error: null }) },
    };
    internal.initializedUserId = 'old-owner';
    internal.channel = oldChannel;
    internal.pushTimer = 21;
    internal.pullTimer = 22;
    internal.cloudRetryAttempt = 5;

    let initialSyncCalls = 0;
    let realtimeCalls = 0;
    internal.initialSync = async () => {
        assert.equal(internal.channel, null);
        assert.deepEqual(removed, [oldChannel]);
        initialSyncCalls += 1;
    };
    internal.startRealtime = async () => { realtimeCalls += 1; };

    await internal.applySession({
        user: { id: 'new-owner', email: 'gentle3f@gmail.com' },
    });

    assert.deepEqual(cleared.sort((a, b) => a - b), [21, 22]);
    assert.equal(internal.pushTimer, null);
    assert.equal(internal.pullTimer, null);
    assert.equal(internal.cloudRetryAttempt, 0);
    assert.deepEqual(removed, [oldChannel]);
    assert.equal(internal.initializedUserId, 'new-owner');
    assert.equal(initialSyncCalls, 1);
    assert.equal(realtimeCalls, 1);
});

test('rejected non-owner session clears timers and old realtime channel', async () => {
    const { cleared } = installBrowser();
    const { internal, phases } = createManager();
    const channel = {};
    const removed: unknown[] = [];
    let signOutCalls = 0;

    internal.client = {
        removeChannel: async (value: unknown) => { removed.push(value); },
        auth: {
            signOut: async () => {
                signOutCalls += 1;
                return { error: null };
            },
        },
    };
    internal.channel = channel;
    internal.pushTimer = 31;
    internal.pullTimer = 32;
    internal.realtimeRetryTimer = 33;

    await internal.applySession({
        user: { id: 'other-user', email: 'other@example.com' },
    });

    assert.deepEqual(cleared.sort((a, b) => a - b), [31, 32, 33]);
    assert.deepEqual(removed, [channel]);
    assert.equal(signOutCalls, 1);
    assert.equal(internal.session, null);
    assert.equal(internal.initializedUserId, '');
    assert.equal(phases.at(-1), 'error');
});


test('manual sign-out preserves local cloud runtime when remote auth sign-out fails', async () => {
    const { cleared } = installBrowser();
    const { sync, internal, phases } = createManager();
    const channel = {};
    const removed: unknown[] = [];
    const failure = new Error('模擬登出失敗');

    internal.client = {
        removeChannel: async (value: unknown) => { removed.push(value); },
        auth: { signOut: async () => ({ error: failure }) },
    };
    internal.session = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    internal.initializedUserId = 'owner';
    internal.channel = channel;
    internal.pushTimer = 41;
    internal.pullTimer = 42;
    internal.realtimeRetryTimer = 43;
    internal.cloudRetryAttempt = 4;
    internal.realtimeRetryAttempt = 3;

    await assert.rejects(() => sync.signOut(), /模擬登出失敗/);

    assert.deepEqual(cleared, []);
    assert.deepEqual(removed, []);
    assert.equal(internal.pushTimer, 41);
    assert.equal(internal.pullTimer, 42);
    assert.equal(internal.realtimeRetryTimer, 43);
    assert.equal(internal.channel, channel);
    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.initializedUserId, 'owner');
    assert.equal(internal.cloudRetryAttempt, 4);
    assert.equal(internal.realtimeRetryAttempt, 3);
    assert.equal(phases.at(-1), 'error');
});

test('manual sign-out tears down timers and realtime only after remote auth sign-out succeeds', async () => {
    const { cleared } = installBrowser();
    const { sync, internal, phases } = createManager();
    const channel = {};
    const removed: unknown[] = [];
    const order: string[] = [];

    internal.client = {
        removeChannel: async (value: unknown) => {
            order.push('realtime');
            removed.push(value);
        },
        auth: {
            signOut: async () => {
                order.push('remote');
                assert.equal(internal.pushTimer, 51);
                assert.equal(internal.pullTimer, 52);
                assert.equal(internal.realtimeRetryTimer, 53);
                assert.equal(internal.channel, channel);
                assert.equal(internal.session?.user.id, 'owner');
                return { error: null };
            },
        },
    };
    internal.session = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    internal.initializedUserId = 'owner';
    internal.channel = channel;
    internal.pushTimer = 51;
    internal.pullTimer = 52;
    internal.realtimeRetryTimer = 53;
    internal.cloudRetryAttempt = 5;
    internal.realtimeRetryAttempt = 4;

    await sync.signOut();

    assert.deepEqual(order, ['remote', 'realtime']);
    assert.deepEqual(cleared.sort((a, b) => a - b), [51, 52, 53]);
    assert.deepEqual(removed, [channel]);
    assert.equal(internal.pushTimer, null);
    assert.equal(internal.pullTimer, null);
    assert.equal(internal.realtimeRetryTimer, null);
    assert.equal(internal.channel, null);
    assert.equal(internal.session, null);
    assert.equal(internal.initializedUserId, '');
    assert.equal(internal.cloudRetryAttempt, 0);
    assert.equal(internal.realtimeRetryAttempt, 0);
    assert.equal(phases.at(-1), 'signed_out');
});


test('rejected non-owner session fails closed locally when remote sign-out also fails', async () => {
    const { cleared } = installBrowser();
    const { internal, phases } = createManager();
    const channel = {};
    const removed: unknown[] = [];
    let signOutCalls = 0;

    internal.client = {
        removeChannel: async (value: unknown) => { removed.push(value); },
        auth: {
            signOut: async () => {
                signOutCalls += 1;
                return { error: new Error('模擬自動登出失敗') };
            },
        },
    };
    internal.channel = channel;
    internal.pushTimer = 61;
    internal.pullTimer = 62;
    internal.realtimeRetryTimer = 63;
    internal.initializedUserId = 'old-owner';

    await internal.applySession({
        user: { id: 'other-user', email: 'other@example.com' },
    });

    assert.deepEqual(cleared.sort((a, b) => a - b), [61, 62, 63]);
    assert.deepEqual(removed, [channel]);
    assert.equal(signOutCalls, 1);
    assert.equal(internal.channel, null);
    assert.equal(internal.session, null);
    assert.equal(internal.initializedUserId, '');
    assert.equal(phases.at(-1), 'error');
    assert.match(internal.state.detail, /自動登出失敗：模擬自動登出失敗/);
});


test('manual sign-out still completes locally when stale realtime channel removal fails', async () => {
    const { cleared } = installBrowser();
    const { sync, internal, phases } = createManager();
    const channel = {};

    internal.client = {
        removeChannel: async () => {
            throw new Error('模擬 realtime cleanup 失敗');
        },
        auth: { signOut: async () => ({ error: null }) },
    };
    internal.session = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    internal.initializedUserId = 'owner';
    internal.channel = channel;
    internal.pushTimer = 71;
    internal.pullTimer = 72;
    internal.realtimeRetryTimer = 73;

    await sync.signOut();

    assert.deepEqual(cleared.sort((a, b) => a - b), [71, 72, 73]);
    assert.equal(internal.channel, null);
    assert.equal(internal.session, null);
    assert.equal(internal.initializedUserId, '');
    assert.equal(phases.at(-1), 'signed_out');
});

test('owner session contains initial realtime setup failure and schedules retry', async () => {
    installBrowser();
    const { internal, phases } = createManager();
    let initialSyncCalls = 0;
    let realtimeRetryCalls = 0;
    let cloudRetryCalls = 0;

    internal.client = {
        removeChannel: async () => undefined,
        auth: { signOut: async () => ({ error: null }) },
    };
    internal.initialSync = async () => { initialSyncCalls += 1; };
    internal.startRealtime = async () => {
        throw new Error('模擬 realtime startup 失敗');
    };
    internal.scheduleRealtimeRestart = () => { realtimeRetryCalls += 1; };
    internal.scheduleCloudRetry = () => { cloudRetryCalls += 1; };

    await internal.applySession({
        user: { id: 'owner', email: 'gentle3f@gmail.com' },
    });

    assert.equal(initialSyncCalls, 1);
    assert.equal(realtimeRetryCalls, 1);
    assert.equal(cloudRetryCalls, 1);
    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.initializedUserId, 'owner');
    assert.equal(phases.at(-1), 'error');
    assert.match(internal.state.detail, /即時更新連線失敗：模擬 realtime startup 失敗/);
});
