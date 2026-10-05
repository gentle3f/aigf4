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

const createManager = () => {
    const sync = new SupabaseCloudSyncManager(
        new MemoryManager(),
        new RoomManager(),
        {
            onStateChange: () => undefined,
            onRemoteApplied: () => undefined,
        },
    );
    const internal = sync as any;
    internal.session = { user: { id: 'manual-user', email: 'test@example.com' } };
    return { sync, internal };
};

test('manual sync rejects when the safe push does not complete and keeps pending work durable', async () => {
    const storage = installLocalStorage();
    const { sync, internal } = createManager();
    internal.pushPendingChangesSafely = async () => false;
    internal.state = {
        ...internal.state,
        phase: 'connecting',
        detail: 'still reconciling',
    };

    await assert.rejects(
        () => sync.syncNow(),
        /同步尚未完成；本機變更已保留，系統會自動重試。/,
    );
    assert.equal(storage.get('wetappCloudPendingV1'), 'true');
});

test('manual sync surfaces the manager error detail instead of resolving false-success', async () => {
    installLocalStorage();
    const { sync, internal } = createManager();
    internal.pushPendingChangesSafely = async () => false;
    internal.state = {
        ...internal.state,
        phase: 'error',
        detail: '模擬雲端寫入失敗',
    };

    await assert.rejects(
        () => sync.syncNow(),
        /模擬雲端寫入失敗/,
    );
});

test('manual cloud reload rejects an incomplete safe recovery with a conservative retry message', async () => {
    installLocalStorage();
    const { sync, internal } = createManager();
    internal.recoverCloudSafely = async () => false;
    internal.state = {
        ...internal.state,
        phase: 'connecting',
        detail: 'merging',
    };

    await assert.rejects(
        () => sync.reloadFromCloud(),
        /重新載入尚未完成；本機資料仍保留，系統會自動重試。/,
    );
});

test('successful manual sync and reload still resolve normally', async () => {
    const storage = installLocalStorage();
    const { sync, internal } = createManager();
    let pushes = 0;
    let recoveries = 0;
    internal.pushPendingChangesSafely = async () => {
        pushes += 1;
        return true;
    };
    internal.recoverCloudSafely = async () => {
        recoveries += 1;
        return true;
    };

    await sync.syncNow();
    await sync.reloadFromCloud();

    assert.equal(pushes, 1);
    assert.equal(recoveries, 1);
    assert.equal(storage.get('wetappCloudPendingV1'), 'true');
});
