import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readRoomRecovery, saveRoomRecovery } from '../roomRecoveryStore.js';

test('room recovery serializes writes and keeps the newest snapshot', async () => {
    await saveRoomRecovery(null);
    const first = saveRoomRecovery({ baseline: 'old', data: 'first' });
    const second = saveRoomRecovery({ baseline: 'old', data: 'second' });
    await Promise.all([first, second]);

    assert.deepEqual(await readRoomRecovery(), {
        baseline: 'old',
        data: 'second',
    });

    await saveRoomRecovery(null);
    assert.equal(await readRoomRecovery(), undefined);
});
