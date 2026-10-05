import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryManager } from '../managers.js';
import { RoomManager } from '../roomManager.js';
import { SupabaseCloudSyncManager } from '../supabaseCloudSync.js';

const installLocalStorage = () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => { storage.set(key, String(value)); },
            removeItem: (key: string) => { storage.delete(key); },
        },
    });
    return storage;
};

test('transient cloud errors use bounded exponential retry and reset after sync', () => {
    installLocalStorage();
    const navigatorState = { onLine: true };
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: navigatorState,
    });

    const memory = new MemoryManager();
    const rooms = new RoomManager();
    const states: string[] = [];
    const sync = new SupabaseCloudSyncManager(memory, rooms, {
        onStateChange: state => states.push(state.phase),
        onRemoteApplied: () => undefined,
    });
    const internal = sync as any;
    internal.session = { user: { id: 'retry-user', email: 'test@example.com' } };

    const delays: number[] = [];
    internal.schedulePull = (delay: number) => { delays.push(delay); };

    for (let index = 0; index < 7; index++) {
        internal.handleSyncError(new Error('temporary failure'), '測試同步失敗');
    }

    assert.deepEqual(delays, [1500, 3000, 6000, 12000, 24000, 30000, 30000]);
    assert.equal(states.at(-1), 'error');

    internal.markSynced('同步完成');
    internal.handleSyncError(new Error('another temporary failure'), '再次失敗');
    assert.equal(delays.at(-1), 1500);

    navigatorState.onLine = false;
    const beforeOffline = delays.length;
    internal.handleSyncError(new Error('offline failure'), '離線失敗');
    assert.equal(delays.length, beforeOffline);
    assert.equal(states.at(-1), 'offline');

    navigatorState.onLine = true;
    internal.pullTimer = 123;
    internal.handleSyncError(new Error('timer already pending'), '已有重試');
    assert.equal(delays.length, beforeOffline);

    internal.pullTimer = null;
});
