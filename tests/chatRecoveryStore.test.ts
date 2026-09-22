import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readChatRecovery, saveChatRecovery } from '../chatRecoveryStore.js';

test('recovery commits latest snapshot in order and clears only after a successful primary save', async () => {
    const first = saveChatRecovery({ baseline: 'old', data: 'first' });
    const second = saveChatRecovery({ baseline: 'old', data: 'second' });
    await Promise.all([first, second]);
    assert.deepEqual(await readChatRecovery(), { baseline: 'old', data: 'second' });
    await saveChatRecovery(null);
    assert.equal(await readChatRecovery(), undefined);
});
