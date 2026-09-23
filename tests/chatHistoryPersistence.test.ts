import assert from 'node:assert/strict';
import test from 'node:test';
import {
    LatestHistoryPersistence,
    hasUndurableHistorySnapshot,
    type HistoryCompressionResult,
    type HistoryCompressionRunner,
} from '../chatHistoryPersistence.js';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));

class ControlledRunner implements HistoryCompressionRunner<string> {
    readonly requests: Array<{ version: number; value: string; resolve: (result: HistoryCompressionResult) => void; reject: (error: Error) => void }> = [];

    compress(version: number, value: string) {
        return new Promise<HistoryCompressionResult>((resolve, reject) => {
            this.requests.push({ version, value, resolve, reject });
        });
    }
}

const resultFor = (version: number, encoded: string): HistoryCompressionResult => ({
    version,
    encoded,
    jsonChars: encoded.length,
    compressedChars: encoded.length,
    jsonSerializeMs: 1,
    compressionMs: 1,
});

test('coalesces rapid writes and never persists a stale compression result', async () => {
    const runner = new ControlledRunner();
    const persisted: string[] = [];
    const queue = new LatestHistoryPersistence(runner, result => persisted.push(result.encoded), () => undefined);
    queue.schedule(1, 'first');
    await tick();
    queue.schedule(2, 'latest');
    runner.requests[0].resolve(resultFor(1, 'first'));
    await tick();
    assert.deepEqual(persisted, []);
    assert.equal(runner.requests[1].value, 'latest');
    runner.requests[1].resolve(resultFor(2, 'latest'));
    await tick();
    assert.deepEqual(persisted, ['latest']);
});

test('reports worker failure without persisting a partial snapshot', async () => {
    const runner = new ControlledRunner();
    const failures: unknown[] = [];
    const persisted: string[] = [];
    const queue = new LatestHistoryPersistence(runner, result => persisted.push(result.encoded), error => failures.push(error));
    queue.schedule(1, 'latest');
    await tick();
    runner.requests[0].reject(new Error('worker failed'));
    await tick();
    assert.equal(persisted.length, 0);
    assert.equal(failures.length, 1);
});

test('only requests the pagehide fallback when a newer snapshot is not durable', () => {
    assert.equal(hasUndurableHistorySnapshot(4, 4), false);
    assert.equal(hasUndurableHistorySnapshot(4, 5), true);
});
