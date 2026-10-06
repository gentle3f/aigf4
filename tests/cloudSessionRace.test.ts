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
};

const createManager = () => {
    installBrowser();
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

test('sign-out during an in-flight cloud pull cannot be overwritten by the stale pull result', async () => {
    const { internal, states } = createManager();
    let resolveState!: (value: unknown) => void;
    const stateResponse = new Promise(resolve => {
        resolveState = resolve;
    });

    internal.client = {
        from: (table: string) => {
            assert.equal(table, 'wetapp_state');
            return {
                select: () => ({
                    maybeSingle: () => stateResponse,
                }),
            };
        },
        removeChannel: async () => undefined,
    };
    internal.session = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    internal.initializedUserId = 'owner';

    const pull = internal.pullCloudToLocal();
    await Promise.resolve();
    assert.equal(states.at(-1), 'pulling');

    await internal.applySession(null);
    assert.equal(states.at(-1), 'signed_out');
    assert.equal(internal.session, null);

    resolveState({
        data: {
            payload: {},
            revision: 1,
            updated_at: new Date().toISOString(),
            source_device_id: 'other-device',
        },
        error: null,
    });

    assert.equal(await pull, false);
    assert.equal(internal.session, null);
    assert.equal(states.at(-1), 'signed_out');
});


test('sign-out during initial cloud sync cannot be overwritten by the stale initial-sync continuation', async () => {
    const { internal, states } = createManager();
    let resolveState!: (value: unknown) => void;
    const stateResponse = new Promise(resolve => {
        resolveState = resolve;
    });

    internal.client = {
        from: (table: string) => {
            if (table === 'wetapp_state') {
                return {
                    select: () => ({
                        maybeSingle: () => stateResponse,
                    }),
                };
            }
            if (table === 'wetapp_messages') {
                return {
                    select: async () => ({ count: 0, error: null }),
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        },
        removeChannel: async () => undefined,
    };
    internal.startRealtime = async () => undefined;

    const ownerApply = internal.applySession({
        user: { id: 'owner', email: 'gentle3f@gmail.com' },
    });
    await Promise.resolve();
    assert.equal(states.at(-1), 'connecting');

    await internal.applySession(null);
    assert.equal(states.at(-1), 'signed_out');

    resolveState({
        data: {
            revision: 1,
            updated_at: new Date().toISOString(),
            source_device_id: 'other-device',
        },
        error: null,
    });

    await ownerApply;
    assert.equal(internal.session, null);
    assert.equal(internal.initializedUserId, '');
    assert.equal(states.at(-1), 'signed_out');
});


test('session change after pull transaction starts rolls back local work and preserves signed_out state', async () => {
    const { internal, states } = createManager();
    let rollbackCalls = 0;
    let applyRemoteCalls = 0;

    internal.client = {
        from: (table: string) => {
            assert.equal(table, 'wetapp_state');
            return {
                select: () => ({
                    maybeSingle: async () => ({
                        data: {
                            payload: {},
                            revision: 2,
                            updated_at: new Date().toISOString(),
                            source_device_id: 'other-device',
                        },
                        error: null,
                    }),
                }),
            };
        },
        removeChannel: async () => undefined,
    };
    internal.session = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    internal.initializedUserId = 'owner';
    internal.fetchAllRows = async () => [];
    internal.createCloudPullTransactionSnapshot = async () => ({ marker: 'snapshot' });
    internal.rollbackCloudPullTransaction = async () => { rollbackCalls += 1; };
    internal.pullMedia = async () => {
        await internal.applySession(null);
    };
    internal.applyRemoteData = async () => { applyRemoteCalls += 1; };
    internal.refreshLocalIndexes = async () => undefined;

    assert.equal(await internal.pullCloudToLocal(true, false), false);

    assert.equal(rollbackCalls, 1);
    assert.equal(applyRemoteCalls, 0);
    assert.equal(internal.session, null);
    assert.equal(states.at(-1), 'signed_out');
});


test('sign-out during an in-flight cloud push stops the stale push before later remote stages', async () => {
    const { internal, states } = createManager();
    let collectMediaCalls = 0;
    let pushMediaCalls = 0;
    let pushMessageCalls = 0;

    internal.client = {
        removeChannel: async () => undefined,
    };
    internal.session = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    internal.initializedUserId = 'owner';

    internal.buildStatePayload = async () => {
        await internal.applySession(null);
        return {
            schemaVersion: 1,
            customPersonas: {},
            diaries: [],
            interests: [],
            rooms: { version: 2, rooms: [] },
            appSettings: {},
        };
    };
    internal.collectLocalMedia = async () => {
        collectMediaCalls += 1;
        return [];
    };
    internal.pushMedia = async () => {
        pushMediaCalls += 1;
        return { nextIndex: {}, removedIds: [] };
    };
    internal.pushMessages = async () => {
        pushMessageCalls += 1;
        return {
            hashes: {},
            conversationIndex: {},
            removedByConversation: [],
            removedConversations: [],
        };
    };

    assert.equal(await internal.pushLocalToCloud(false, true), false);

    assert.equal(collectMediaCalls, 0);
    assert.equal(pushMediaCalls, 0);
    assert.equal(pushMessageCalls, 0);
    assert.equal(internal.session, null);
    assert.equal(states.at(-1), 'signed_out');
});


test('sign-out during pending-change state-head preflight cannot poison revision or overwrite signed_out', async () => {
    const { internal, states } = createManager();
    let resolveHead!: (value: unknown) => void;
    const headResponse = new Promise(resolve => { resolveHead = resolve; });
    let pushCalls = 0;

    localStorage.setItem('wetappCloudSafeMergeV1', '2');
    localStorage.setItem('wetappCloudPendingV1', 'true');
    localStorage.setItem('wetappCloudSyncedUserIdV1', 'owner');

    internal.client = {
        from: (table: string) => {
            assert.equal(table, 'wetapp_state');
            return {
                select: () => ({
                    maybeSingle: () => headResponse,
                }),
            };
        },
        removeChannel: async () => undefined,
    };
    internal.session = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    internal.initializedUserId = 'owner';
    internal.lastObservedCloudStateRevision = 7;
    internal.pushLocalToCloud = async () => {
        pushCalls += 1;
        return true;
    };

    const pending = internal.pushPendingChangesSafely();
    await Promise.resolve();

    await internal.applySession(null);
    assert.equal(states.at(-1), 'signed_out');

    resolveHead({
        data: {
            revision: 99,
            source_device_id: 'other-device',
        },
        error: null,
    });

    assert.equal(await pending, false);
    assert.equal(pushCalls, 0);
    assert.equal(internal.lastObservedCloudStateRevision, 7);
    assert.equal(internal.session, null);
    assert.equal(states.at(-1), 'signed_out');
});


test('same-user re-login still invalidates a state-head preflight started by the previous session runtime', async () => {
    const { internal, states } = createManager();
    let resolveHead!: (value: unknown) => void;
    const headResponse = new Promise(resolve => { resolveHead = resolve; });
    let pushCalls = 0;
    const ownerSession = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };

    localStorage.setItem('wetappCloudSafeMergeV1', '2');
    localStorage.setItem('wetappCloudPendingV1', 'true');
    localStorage.setItem('wetappCloudSyncedUserIdV1', 'owner');

    internal.client = {
        from: (table: string) => {
            assert.equal(table, 'wetapp_state');
            return {
                select: () => ({
                    maybeSingle: () => headResponse,
                }),
            };
        },
        removeChannel: async () => undefined,
    };
    internal.session = ownerSession;
    internal.initializedUserId = 'owner';
    internal.lastObservedCloudStateRevision = 7;
    internal.initialSync = async () => undefined;
    internal.startRealtime = async () => undefined;
    internal.pushLocalToCloud = async () => {
        pushCalls += 1;
        return true;
    };

    const pending = internal.pushPendingChangesSafely();
    await Promise.resolve();

    await internal.applySession(null);
    assert.equal(states.at(-1), 'signed_out');
    await internal.applySession(ownerSession);
    assert.equal(internal.session?.user.id, 'owner');

    resolveHead({
        data: {
            revision: 99,
            source_device_id: internal.deviceId,
        },
        error: null,
    });

    assert.equal(await pending, false);
    assert.equal(pushCalls, 0);
    assert.equal(internal.lastObservedCloudStateRevision, 7);
    assert.equal(internal.session?.user.id, 'owner');
});


test('same-user re-login invalidates an in-flight push before later remote stages', async () => {
    const { internal } = createManager();
    const ownerSession = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    let collectMediaCalls = 0;
    let pushMediaCalls = 0;
    let pushMessageCalls = 0;
    const reconciliationDelays: number[] = [];

    internal.client = {
        removeChannel: async () => undefined,
    };
    internal.session = ownerSession;
    internal.initializedUserId = 'owner';
    internal.initialSync = async () => undefined;
    internal.startRealtime = async () => undefined;

    internal.buildStatePayload = async () => {
        await internal.applySession(null);
        await internal.applySession(ownerSession);
        return {
            schemaVersion: 1,
            customPersonas: {},
            diaries: [],
            interests: [],
            rooms: { version: 2, rooms: [] },
            appSettings: {},
        };
    };
    internal.collectLocalMedia = async () => {
        collectMediaCalls += 1;
        return [];
    };
    internal.pushMedia = async () => {
        pushMediaCalls += 1;
        return { nextIndex: {}, removedIds: [] };
    };
    internal.pushMessages = async () => {
        pushMessageCalls += 1;
        return {
            hashes: {},
            conversationIndex: {},
            removedByConversation: [],
            removedConversations: [],
        };
    };
    internal.schedulePull = (delay: number) => { reconciliationDelays.push(delay); };

    assert.equal(await internal.pushLocalToCloud(false, true), false);
    assert.equal(collectMediaCalls, 0);
    assert.equal(pushMediaCalls, 0);
    assert.equal(pushMessageCalls, 0);
    assert.equal(internal.session?.user.id, 'owner');
    assert.deepEqual(reconciliationDelays, [0]);
});

test('same-user re-login during a pull transaction rolls back stale local work', async () => {
    const { internal } = createManager();
    const ownerSession = { user: { id: 'owner', email: 'gentle3f@gmail.com' } };
    let rollbackCalls = 0;
    let applyRemoteCalls = 0;
    const reconciliationDelays: number[] = [];

    internal.client = {
        from: (table: string) => {
            assert.equal(table, 'wetapp_state');
            return {
                select: () => ({
                    maybeSingle: async () => ({
                        data: {
                            payload: {},
                            revision: 2,
                            updated_at: new Date().toISOString(),
                            source_device_id: 'other-device',
                        },
                        error: null,
                    }),
                }),
            };
        },
        removeChannel: async () => undefined,
    };
    internal.session = ownerSession;
    internal.initializedUserId = 'owner';
    internal.initialSync = async () => undefined;
    internal.startRealtime = async () => undefined;
    internal.fetchAllRows = async () => [];
    internal.createCloudPullTransactionSnapshot = async () => ({ marker: 'snapshot' });
    internal.rollbackCloudPullTransaction = async () => { rollbackCalls += 1; };
    internal.pullMedia = async () => {
        await internal.applySession(null);
        await internal.applySession(ownerSession);
    };
    internal.applyRemoteData = async () => { applyRemoteCalls += 1; };
    internal.refreshLocalIndexes = async () => undefined;
    internal.schedulePull = (delay: number) => { reconciliationDelays.push(delay); };

    assert.equal(await internal.pullCloudToLocal(true, false), false);
    assert.equal(rollbackCalls, 1);
    assert.equal(applyRemoteCalls, 0);
    assert.equal(internal.session?.user.id, 'owner');
    assert.deepEqual(reconciliationDelays, [0]);
});
