import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryManager } from '../managers.js';
import { RoomManager } from '../roomManager.js';
import { SupabaseCloudSyncManager } from '../supabaseCloudSync.js';

const installBrowserState = () => {
    const storage = new Map<string, string>();
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
    target.clearTimeout = clearTimeout;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: target,
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: new EventTarget(),
    });
    return { storage, target };
};

const createManager = () => {
    const memory = new MemoryManager();
    const rooms = new RoomManager();
    const states: string[] = [];
    const sync = new SupabaseCloudSyncManager(memory, rooms, {
        onStateChange: state => states.push(state.phase),
        onRemoteApplied: () => undefined,
    });
    return { sync, internal: sync as any, states };
};

const fakeChannel = () => {
    let statusHandler: ((status: string) => void) | null = null;
    const changeHandlers: Array<(payload: any) => void> = [];
    const channel = {
        on: (_event: string, _filter: unknown, handler: (payload: any) => void) => {
            changeHandlers.push(handler);
            return channel;
        },
        subscribe: (handler: (status: string) => void) => {
            statusHandler = handler;
            return channel;
        },
    };
    return {
        channel,
        emitStatus: (status: string) => statusHandler?.(status),
        changeHandlers,
    };
};

test('realtime startup removes a stale channel but does not create a new Postgres Changes subscription', async () => {
    installBrowserState();
    const { internal } = createManager();
    const stale = fakeChannel();
    const removed: unknown[] = [];
    let created = 0;
    internal.client = {
        channel: () => {
            created += 1;
            return fakeChannel().channel;
        },
        removeChannel: async (channel: unknown) => { removed.push(channel); },
    };
    internal.session = { user: { id: 'realtime-user', email: 'test@example.com' } };
    internal.channel = stale.channel;

    const pulls: number[] = [];
    internal.schedulePull = (delay: number) => { pulls.push(delay); };

    await internal.startRealtime();

    assert.deepEqual(removed, [stale.channel]);
    assert.equal(created, 0);
    assert.equal(internal.channel, null);
    assert.deepEqual(pulls, []);
});

test('realtime-disabled startup clears retry state without scheduling a catch-up pull', async () => {
    installBrowserState();
    const { internal } = createManager();
    internal.client = {
        removeChannel: async () => undefined,
    };
    internal.session = { user: { id: 'realtime-user', email: 'test@example.com' } };
    internal.realtimeRetryAttempt = 3;

    const pulls: number[] = [];
    internal.schedulePull = (delay: number) => { pulls.push(delay); };

    await internal.startRealtime();

    assert.equal(internal.realtimeRetryAttempt, 0);
    assert.equal(internal.realtimeRetryTimer, null);
    assert.deepEqual(pulls, []);
});

test('realtime reconnect uses bounded exponential backoff and avoids duplicate timers', async () => {
    installBrowserState();
    const { internal } = createManager();
    internal.session = { user: { id: 'realtime-user', email: 'test@example.com' } };

    const timers: Array<{ delay: number; fn: () => void }> = [];
    let timerId = 0;
    window.setTimeout = ((fn: TimerHandler, delay?: number) => {
        timers.push({ delay: Number(delay || 0), fn: fn as () => void });
        timerId += 1;
        return timerId;
    }) as typeof setTimeout;
    window.clearTimeout = (() => undefined) as typeof clearTimeout;

    let restartCalls = 0;
    internal.startRealtime = async () => { restartCalls += 1; };

    const expected = [1500, 3000, 6000, 12000, 24000, 30000, 30000];
    for (const delay of expected) {
        internal.scheduleRealtimeRestart();
        internal.scheduleRealtimeRestart();
        const timer = timers.shift();
        assert.ok(timer);
        assert.equal(timer!.delay, delay);
        timer!.fn();
        await Promise.resolve();
    }

    assert.equal(restartCalls, expected.length);
});


test('realtime stop detaches the local channel even when remote channel removal fails', async () => {
    installBrowserState();
    const { internal } = createManager();
    const channel = fakeChannel();
    internal.client = {
        channel: () => channel.channel,
        removeChannel: async () => {
            throw new Error('模擬 removeChannel 失敗');
        },
    };
    internal.session = { user: { id: 'realtime-user', email: 'test@example.com' } };

    const pulls: number[] = [];
    let restarts = 0;
    internal.schedulePull = (delay: number) => { pulls.push(delay); };
    internal.scheduleRealtimeRestart = () => { restarts += 1; };

    await internal.startRealtime();
    await internal.stopRealtime();

    assert.equal(internal.channel, null);

    channel.emitStatus('CHANNEL_ERROR');
    assert.deepEqual(pulls, []);
    assert.equal(restarts, 0);
});


test('realtime reconnect timer is scoped to the session that scheduled it', async () => {
    installBrowserState();
    const { internal } = createManager();
    internal.session = { user: { id: 'old-user', email: 'test@example.com' } };

    const timers: Array<() => void> = [];
    window.setTimeout = ((fn: TimerHandler) => {
        timers.push(fn as () => void);
        return timers.length;
    }) as typeof setTimeout;
    window.clearTimeout = (() => undefined) as typeof clearTimeout;

    const startedFor: string[] = [];
    internal.startRealtime = async (userId?: string) => {
        startedFor.push(String(userId || ''));
    };

    internal.scheduleRealtimeRestart();
    assert.equal(timers.length, 1);

    internal.session = { user: { id: 'new-user', email: 'test@example.com' } };
    timers[0]();
    await Promise.resolve();

    assert.deepEqual(startedFor, []);
});

test('realtime startup aborts if the session changes while stale channel teardown is in flight', async () => {
    installBrowserState();
    const { internal } = createManager();
    let resolveRemoval!: () => void;
    const removal = new Promise<void>(resolve => { resolveRemoval = resolve; });
    const staleChannel = fakeChannel().channel;
    const createdChannels: string[] = [];

    internal.client = {
        channel: (name: string) => {
            createdChannels.push(name);
            return fakeChannel().channel;
        },
        removeChannel: async () => removal,
    };
    internal.session = { user: { id: 'old-user', email: 'test@example.com' } };
    internal.channel = staleChannel;

    const starting = internal.startRealtime();
    await Promise.resolve();
    assert.equal(internal.channel, null);

    internal.session = { user: { id: 'new-user', email: 'test@example.com' } };
    resolveRemoval();
    await starting;

    assert.deepEqual(createdChannels, []);
    assert.equal(internal.channel, null);
});


test('realtime reconnect timer is invalidated by a newer generation of the same user', async () => {
    installBrowserState();
    const { internal } = createManager();
    internal.session = { user: { id: 'same-user', email: 'test@example.com' } };
    internal.sessionGeneration = 10;

    const timers: Array<() => void> = [];
    window.setTimeout = ((fn: TimerHandler) => {
        timers.push(fn as () => void);
        return timers.length;
    }) as typeof setTimeout;
    window.clearTimeout = (() => undefined) as typeof clearTimeout;

    let restartCalls = 0;
    internal.startRealtime = async () => { restartCalls += 1; };

    internal.scheduleRealtimeRestart();
    assert.equal(timers.length, 1);

    internal.sessionGeneration = 11;
    timers[0]();
    await Promise.resolve();

    assert.equal(restartCalls, 0);
});

test('realtime startup aborts if the same user is replaced by a newer session generation during teardown', async () => {
    installBrowserState();
    const { internal } = createManager();
    let resolveRemoval!: () => void;
    const removal = new Promise<void>(resolve => { resolveRemoval = resolve; });
    const staleChannel = fakeChannel().channel;
    const createdChannels: string[] = [];

    internal.client = {
        channel: (name: string) => {
            createdChannels.push(name);
            return fakeChannel().channel;
        },
        removeChannel: async () => removal,
    };
    internal.session = { user: { id: 'same-user', email: 'test@example.com' } };
    internal.sessionGeneration = 20;
    internal.channel = staleChannel;

    const starting = internal.startRealtime();
    await Promise.resolve();
    assert.equal(internal.channel, null);

    internal.sessionGeneration = 21;
    resolveRemoval();
    await starting;

    assert.deepEqual(createdChannels, []);
    assert.equal(internal.channel, null);
});
