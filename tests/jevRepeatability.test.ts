import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JEV_FACTOR_ISOLATION_CASES } from './fixtures/jevFactorIsolation.js';
import { JEV_REPEATABILITY_CASES, JEV_REPEATABILITY_REPEATS, JEV_REPEATABILITY_SOURCE_IDS } from './fixtures/jevRepeatability.js';
import { aggregateSyntheticCalibration, validateRepeatabilityCorpus } from '../scripts/jevSyntheticCalibration.js';

test('repeatability fixtures reuse the exact frozen isolation ReviewState in deterministic interleaving order', () => {
    assert.equal(JEV_REPEATABILITY_CASES.length, JEV_REPEATABILITY_SOURCE_IDS.length * JEV_REPEATABILITY_REPEATS);
    assert.deepEqual(validateRepeatabilityCorpus(JEV_REPEATABILITY_CASES), []);
    const sources = new Map(JEV_FACTOR_ISOLATION_CASES.map(item => [item.id, item]));
    for (const item of JEV_REPEATABILITY_CASES) {
        const source = sources.get(item.sourceCaseId);
        assert.ok(source, item.id);
        assert.equal(item.state, source.state, `${item.id} object reuse`);
        assert.equal(JSON.stringify(item.state), JSON.stringify(source.state), `${item.id} byte-equivalent state`);
    }
    for (let repeatIndex = 1; repeatIndex <= JEV_REPEATABILITY_REPEATS; repeatIndex += 1) {
        const block = JEV_REPEATABILITY_CASES.slice((repeatIndex - 1) * JEV_REPEATABILITY_SOURCE_IDS.length, repeatIndex * JEV_REPEATABILITY_SOURCE_IDS.length);
        assert.deepEqual(block.map(item => item.sourceCaseId), JEV_REPEATABILITY_SOURCE_IDS);
        assert.ok(block.every(item => item.repeatIndex === repeatIndex));
    }
    assert.equal(new Set(JEV_REPEATABILITY_CASES.map(item => item.id)).size, JEV_REPEATABILITY_CASES.length);
});

test('repeatability aggregation exposes descriptive noise only and safe results contain no ReviewState fields', () => {
    const source = JEV_REPEATABILITY_CASES[0];
    const results = [0.1, 0.3, 0.2, 0.2, 0.4].map((signal, index) => ({
        id: `repeat-${index + 1}`, suite: 'repeatability' as const, sourceCaseId: source.sourceCaseId, repeatIndex: index + 1,
        category: source.category, expected: source.expected, mode: source.mode, ccMode: source.ccMode, signal, latencyMs: 1,
    }));
    const report = aggregateSyntheticCalibration(results, JEV_REPEATABILITY_CASES);
    const stats = report.repeatability.bySource[source.sourceCaseId];
    assert.equal(stats.n, 5);
    assert.equal(stats.median, 0.2);
    assert.equal(stats.minimum, 0.1);
    assert.equal(stats.maximum, 0.4);
    assert.deepEqual(stats.absoluteDeviationFromFirstRun, [0, 0.19999999999999998, 0.1, 0.1, 0.30000000000000004]);
    for (const [actual, expected] of [[stats.mean, 0.24], [stats.range, 0.3], [stats.populationStandardDeviation, 0.10198039027185571], [stats.sampleStandardDeviation, 0.1140175425099138], [stats.maximumAbsoluteDeviationFromMean, 0.16]] as const) assert.ok(Math.abs((actual || 0) - expected) < 1e-12);
    const sourceText = readFileSync(new URL('../scripts/jevSyntheticCalibration.ts', import.meta.url), 'utf8');
    assert.match(sourceText, /sourceCaseId, repeatIndex/);
    assert.doesNotMatch(sourceText, /safeResults.*state/s);
    assert.doesNotMatch(readFileSync(new URL('./fixtures/jevRepeatability.ts', import.meta.url), 'utf8'), /OPENROUTER_API|Bearer |sk-or-/);
});
