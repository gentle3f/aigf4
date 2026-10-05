import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    analyzeImagePixelData,
    isRetryableCharacterPhotoImageError,
    runWithTransientImageRetry,
} from '../features/characterPhotoImageReliability.js';

const pixels = (values: Array<[number, number, number, number]>) => new Uint8ClampedArray(
    values.flatMap(value => value),
);

test('rejects an opaque all-black image sample', () => {
    const sample = pixels(Array.from({ length: 64 }, () => [0, 0, 0, 255] as [number, number, number, number]));
    const result = analyzeImagePixelData(sample);

    assert.equal(result.suspiciouslyBlank, true);
    assert.equal(result.nearBlackRatio, 1);
    assert.equal(result.transparentRatio, 0);
});

test('rejects an almost fully transparent image sample', () => {
    const sample = pixels(Array.from({ length: 100 }, (_, index) => (
        index === 0 ? [120, 120, 120, 255] : [0, 0, 0, 0]
    ) as [number, number, number, number]));
    const result = analyzeImagePixelData(sample);

    assert.equal(result.suspiciouslyBlank, true);
    assert.ok(result.transparentRatio >= 0.98);
});

test('keeps a legitimately dark image when meaningful highlights exist', () => {
    const sample = pixels([
        ...Array.from({ length: 60 }, () => [2, 2, 2, 255] as [number, number, number, number]),
        ...Array.from({ length: 4 }, () => [180, 140, 100, 255] as [number, number, number, number]),
    ]);
    const result = analyzeImagePixelData(sample);

    assert.equal(result.suspiciouslyBlank, false);
    assert.ok(result.maxVisibleChannel >= 180);
});

test('treats capacity and retryable HTTP failures as transient', () => {
    assert.equal(isRetryableCharacterPhotoImageError(Object.assign(new Error('busy'), { status: 503 })), true);
    assert.equal(isRetryableCharacterPhotoImageError(new Error('Demand too high, try again later')), true);
    assert.equal(isRetryableCharacterPhotoImageError(Object.assign(new Error('bad prompt'), { status: 422 })), false);
});

test('retries one transient failure exactly once and returns the second result', async () => {
    let calls = 0;
    let retries = 0;
    const result = await runWithTransientImageRetry(async () => {
        calls += 1;
        if (calls === 1) {
            throw Object.assign(new Error('Service unavailable'), { status: 503 });
        }
        return 'ok';
    }, {
        sleep: async () => {},
        onRetry: () => { retries += 1; },
    });

    assert.deepEqual(result, { result: 'ok', retried: true });
    assert.equal(calls, 2);
    assert.equal(retries, 1);
});

test('does not retry non-transient image failures', async () => {
    let calls = 0;
    await assert.rejects(() => runWithTransientImageRetry(async () => {
        calls += 1;
        throw Object.assign(new Error('invalid source image'), { status: 422 });
    }, { sleep: async () => {} }), /invalid source image/);

    assert.equal(calls, 1);
});

test('character photo approval validates the image before durable save', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('const approveCharacterPhoto = async');
    const end = source.indexOf('function findSurpriseEventMessage', start);
    const approval = source.slice(start, end);

    assert.match(approval, /characterPhotoImageReliability\.js/);
    assert.match(approval, /runWithTransientImageRetry/);
    assert.match(approval, /await validateGeneratedImageBlob\(candidateBlob\)/);
    assert.ok(
        approval.indexOf('await validateGeneratedImageBlob(candidateBlob)')
            < approval.indexOf('saveCharacterPhotoAsset'),
    );
});


test('character photo approval uses a bounded multi-model fallback ladder and records the actual successful model', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('const approveCharacterPhoto = async');
    const end = source.indexOf('function findSurpriseEventMessage', start);
    const approval = source.slice(start, end);

    assert.match(approval, /buildCharacterPhotoModelLadder/);
    assert.match(approval, /limit: 3/);
    assert.match(approval, /for \(let modelIndex = 0; modelIndex < modelLadder\.length; modelIndex \+= 1\)/);
    assert.match(approval, /await validateGeneratedImageBlob\(candidateBlob\)/);
    assert.match(approval, /model = candidateModel/);
    assert.match(approval, /modelId: model\.id/);
    assert.match(approval, /modelName: model\.name/);
    assert.match(approval, /圖片結果異常，正在自動轉用/);
    assert.ok(
        approval.indexOf('await validateGeneratedImageBlob(candidateBlob)')
            < approval.indexOf('saveCharacterPhotoAsset'),
    );
});
