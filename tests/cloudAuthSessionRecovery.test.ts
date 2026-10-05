import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryManager } from '../managers.js';
import { RoomManager } from '../roomManager.js';
import { SupabaseCloudSyncManager } from '../supabaseCloudSync.js';

const installBrowser = () => {
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

    const timers: Array<{ id: number; delay: number; fn: () => void }> = [];
    let nextTimerId = 1;
    const windowTarget = new EventTarget() as EventTarget & {
        setTimeout: typeof setTimeout;
        clearTimeout: typeof clearTimeout;
    };
    windowTarget.setTimeout = ((fn: TimerHandler, delay?: number) => {
        const id = nextTimerId++;
        timers.push({ id, delay: Number(delay || 0), fn: fn as () => void });
        return id;
    }) as typeof setTimeout;
    windowTarget.clearTimeout = ((id: number) => {
        const index = timers.findIndex(timer => timer.id === id);
        if (index >= 0) timers.splice(index, 1);
    }) as typeof clearTimeout;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: windowTarget,
    });

    const documentTarget = new EventTarget() as EventTarget & { visibilityState: string };
    documentTarget.visibilityState = 'visible';
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: documentTarget,
    });

    return { storage, timers, windowTarget, documentTarget };
};

const createManager = () => {
    const states: string[] = [];
    const sync = new SupabaseCloudSyncManager(
        new MemoryManager(),
        new RoomManager(),
        {
            onStateChange: state => states.push(state.phase),
            onRemoteApplied: () => undefined,
        },
    );
    return { sync, internal: sync as any, states };
};

const flushAsync = async () => {
    await Promise.resolve();
    await new Promise<void>(resolve => setImmediate(resolve));
    await Promise.resolve();
};

test('transient startup getSession failure retries and recovers without duplicating auth listener', async () => {
    const { timers } = installBrowser();
    const { sync, internal, states } = createManager();

    let authListenerRegistrations = 0;
    let getSessionCalls = 0;
    let initialSyncCalls = 0;
    let realtimeCalls = 0;
    const ownerSession = {
        user: { id: 'owner', email: 'gentle3f@gmail.com' },
    };

    internal.client = {
        auth: {
            onAuthStateChange: () => {
                authListenerRegistrations += 1;
                return { data: { subscription: { unsubscribe: () => undefined } } };
            },
            getSession: async () => {
                getSessionCalls += 1;
                if (getSessionCalls === 1) {
                    return {
                        data: { session: null },
                        error: new Error('模擬 session lookup 暫時失敗'),
                    };
                }
                return { data: { session: ownerSession }, error: null };
            },
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => { initialSyncCalls += 1; };
    internal.startRealtime = async () => { realtimeCalls += 1; };

    await sync.start();

    assert.equal(authListenerRegistrations, 1);
    assert.equal(getSessionCalls, 1);
    assert.equal(internal.session, null);
    assert.equal(states.at(-1), 'error');
    assert.equal(internal.authRetryAttempt, 1);
    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 1500);

    const retry = timers.shift()!;
    retry.fn();
    await flushAsync();

    assert.equal(authListenerRegistrations, 1);
    assert.equal(getSessionCalls, 2);
    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.initializedUserId, 'owner');
    assert.equal(initialSyncCalls, 1);
    assert.equal(realtimeCalls, 1);
    assert.equal(internal.authRetryAttempt, 0);
    assert.equal(internal.authRetryTimer, null);
});

test('online event immediately refreshes auth when manager has no session', async () => {
    const { timers } = installBrowser();
    const { sync, internal } = createManager();

    let currentSession: any = null;
    let getSessionCalls = 0;
    let initialSyncCalls = 0;
    let realtimeCalls = 0;
    internal.client = {
        auth: {
            onAuthStateChange: () => ({
                data: { subscription: { unsubscribe: () => undefined } },
            }),
            getSession: async () => {
                getSessionCalls += 1;
                return { data: { session: currentSession }, error: null };
            },
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => { initialSyncCalls += 1; };
    internal.startRealtime = async () => { realtimeCalls += 1; };

    await sync.start();
    assert.equal(internal.session, null);
    assert.equal(timers.length, 0);

    currentSession = {
        user: { id: 'owner', email: 'gentle3f@gmail.com' },
    };
    internal.handleOnline();

    assert.equal(timers.length, 1);
    assert.equal(timers[0].delay, 0);
    timers.shift()!.fn();
    await flushAsync();

    assert.equal(getSessionCalls, 2);
    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.initializedUserId, 'owner');
    assert.equal(initialSyncCalls, 1);
    assert.equal(realtimeCalls, 1);
});


test('stale getSession result cannot overwrite a newer auth-state session', async () => {
    const { timers } = installBrowser();
    const { sync, internal, states } = createManager();

    let authHandler: ((event: string, session: any) => void) | null = null;
    let resolveSession!: (value: unknown) => void;
    const getSessionResult = new Promise(resolve => { resolveSession = resolve; });
    let initialSyncCalls = 0;
    let realtimeCalls = 0;
    const ownerSession = {
        user: { id: 'owner', email: 'gentle3f@gmail.com' },
    };

    internal.client = {
        auth: {
            onAuthStateChange: (handler: (event: string, session: any) => void) => {
                authHandler = handler;
                return { data: { subscription: { unsubscribe: () => undefined } } };
            },
            getSession: async () => getSessionResult,
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => { initialSyncCalls += 1; };
    internal.startRealtime = async () => { realtimeCalls += 1; };

    const starting = sync.start();
    await Promise.resolve();
    assert.ok(authHandler);

    authHandler!('SIGNED_IN', ownerSession);
    assert.equal(timers.length, 1);
    timers.shift()!.fn();
    await flushAsync();

    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.initializedUserId, 'owner');
    assert.equal(initialSyncCalls, 1);
    assert.equal(realtimeCalls, 1);

    resolveSession({ data: { session: null }, error: null });
    await starting;

    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.initializedUserId, 'owner');
    assert.equal(states.at(-1), 'connecting');
});


test('older overlapping getSession lookup cannot overwrite a newer refresh result', async () => {
    const { timers } = installBrowser();
    const { sync, internal } = createManager();

    let resolveFirst!: (value: unknown) => void;
    const firstResult = new Promise(resolve => { resolveFirst = resolve; });
    let getSessionCalls = 0;
    let initialSyncCalls = 0;
    let realtimeCalls = 0;
    const ownerSession = {
        user: { id: 'owner', email: 'gentle3f@gmail.com' },
    };

    internal.client = {
        auth: {
            onAuthStateChange: () => ({
                data: { subscription: { unsubscribe: () => undefined } },
            }),
            getSession: async () => {
                getSessionCalls += 1;
                if (getSessionCalls === 1) return firstResult;
                return { data: { session: ownerSession }, error: null };
            },
        },
        removeChannel: async () => undefined,
    };
    internal.initialSync = async () => { initialSyncCalls += 1; };
    internal.startRealtime = async () => { realtimeCalls += 1; };

    const starting = sync.start();
    await Promise.resolve();

    internal.handleOnline();
    assert.equal(timers.length, 1);
    timers.shift()!.fn();
    await flushAsync();

    assert.equal(getSessionCalls, 2);
    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(initialSyncCalls, 1);
    assert.equal(realtimeCalls, 1);

    resolveFirst({ data: { session: null }, error: null });
    await starting;

    assert.equal(internal.session?.user.id, 'owner');
    assert.equal(internal.initializedUserId, 'owner');
    assert.equal(initialSyncCalls, 1);
    assert.equal(realtimeCalls, 1);
});
