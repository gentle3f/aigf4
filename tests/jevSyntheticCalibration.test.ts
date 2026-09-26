import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { STRICT_REVIEW_ISSUE_CODES } from '../strictReview.js';
import {
    FICTIONAL_PERSONA_NAMES,
    JEV_SYNTHETIC_CALIBRATION_CASES,
} from './fixtures/jevSyntheticCalibration.js';
import {
    aggregateSyntheticCalibration,
    runSyntheticCalibration,
    validateSyntheticCalibrationCorpus,
} from '../scripts/jevSyntheticCalibration.js';

test('synthetic corpus is valid, fictional, and covers every Jev category with paired positive and negative cases', () => {
    assert.ok(JEV_SYNTHETIC_CALIBRATION_CASES.length >= 34);
    assert.deepEqual(validateSyntheticCalibrationCorpus(JEV_SYNTHETIC_CALIBRATION_CASES), []);
    assert.equal(new Set(JEV_SYNTHETIC_CALIBRATION_CASES.map(item => item.id)).size, JEV_SYNTHETIC_CALIBRATION_CASES.length);
    for (const category of STRICT_REVIEW_ISSUE_CODES) {
        const entries = JEV_SYNTHETIC_CALIBRATION_CASES.filter(item => item.category === category);
        assert.ok(entries.some(item => item.expected === 'negative'), `negative ${category}`);
        assert.ok(entries.some(item => item.expected === 'positive'), `positive ${category}`);
    }
    for (const item of JEV_SYNTHETIC_CALIBRATION_CASES) {
        for (const participant of item.state.participants) assert.ok(FICTIONAL_PERSONA_NAMES.includes(participant.name as typeof FICTIONAL_PERSONA_NAMES[number]));
    }
    const source = readFileSync(new URL('./fixtures/jevSyntheticCalibration.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /OPENROUTER_API|Bearer |sk-or-/);
});

test('synthetic controls include single-mode and labelled-dialogue group narration negatives plus five other hard negatives', () => {
    const byId = new Map(JEV_SYNTHETIC_CALIBRATION_CASES.map(item => [item.id, item]));
    assert.equal(byId.get('control-single-first-person')?.state.mode, 'single');
    assert.equal(byId.get('control-single-first-person')?.category, 'group_narration');
    assert.match(byId.get('control-group-labelled-dialogue')?.state.candidateText || '', /Aster: "I do not agree/);
    for (const id of ['control-roleplay-no-agency', 'control-style-without-rule', 'control-unproven-replay', 'control-unestablished-wardrobe']) {
        assert.equal(byId.get(id)?.expected, 'negative');
    }
});

test('aggregate reports means, extrema, separation, and paired direction without thresholds', () => {
    const report = aggregateSyntheticCalibration([
        { id: 'request-mismatch-positive', category: 'request_mismatch', expected: 'positive', signal: 0.8, latencyMs: 1 },
        { id: 'request-mismatch-negative', category: 'request_mismatch', expected: 'negative', signal: 0.2, latencyMs: 1 },
        { id: 'identity-positive', category: 'identity', expected: 'positive', signal: 0.3, latencyMs: 1 },
        { id: 'identity-negative', category: 'identity', expected: 'negative', signal: 0.4, latencyMs: 1 },
    ]);
    assert.deepEqual(report.categories.request_mismatch, { positiveCount: 1, negativeCount: 1, positiveMean: 0.8, negativeMean: 0.2, positiveMinimum: 0.8, negativeMaximum: 0.2, meanSeparation: 0.6000000000000001 });
    assert.equal(report.directionalPairs.compared, 2);
    assert.equal(report.directionalPairs.positiveGreaterThanNegative, 1);
    assert.deepEqual(report.directionalPairs.nonDirectionalPairIds, ['identity']);
});

test('ordinary harness invocation remains offline and returns no generated results', async () => {
    assert.deepEqual(await runSyntheticCalibration(false), []);
});
