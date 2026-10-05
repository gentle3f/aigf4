import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readPersonaRecovery, savePersonaRecovery } from '../personaRecoveryStore.js';

test('persona recovery serializes writes and keeps the newest snapshot', async () => {
    await savePersonaRecovery(null);
    const first = savePersonaRecovery({ baseline: 'old', data: '{"first":true}' });
    const second = savePersonaRecovery({ baseline: 'old', data: '{"second":true}' });
    await Promise.all([first, second]);

    assert.deepEqual(await readPersonaRecovery(), {
        baseline: 'old',
        data: '{"second":true}',
    });

    await savePersonaRecovery(null);
    assert.equal(await readPersonaRecovery(), undefined);
});
