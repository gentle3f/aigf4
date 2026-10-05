import assert from 'node:assert/strict';
import test from 'node:test';
import {
    initializeCloudBackupState,
    persistCloudBackupState,
} from '../cloudBackupState.js';

const withLocalStorage = async (storage: Pick<Storage, 'getItem' | 'setItem'>, run: () => void | Promise<void>) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: storage,
    });
    try {
        await run();
    } finally {
        if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
        else delete (globalThis as { localStorage?: Storage }).localStorage;
    }
};

test('Cloud Backup startup survives localStorage write failure', async () => {
    await withLocalStorage({
        getItem: () => null,
        setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    } as Storage, () => {
        assert.doesNotThrow(() => initializeCloudBackupState());
        assert.equal(persistCloudBackupState({
            enabled: false,
            deviceId: 'device-test',
        }), false);
    });
});

test('Cloud Backup state persistence reports success when storage accepts the write', async () => {
    let written = '';
    await withLocalStorage({
        getItem: () => null,
        setItem: (_key: string, value: string) => { written = value; },
    } as Storage, () => {
        assert.equal(persistCloudBackupState({
            enabled: true,
            deviceId: 'device-test',
        }), true);
        assert.match(written, /"enabled":true/);
    });
});
