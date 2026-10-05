import assert from 'node:assert/strict';
import test from 'node:test';
import { JEV_QUESTIONS } from '../api/_openrouter-decisions.js';
import {
    JEV_GROUP_GATE_BROAD_SOURCE_COUNT,
    JEV_GROUP_GATE_CASES,
    JEV_GROUP_GATE_PARITY_SOURCE_COUNT,
    JEV_GROUP_GATE_SOURCE_COUNT,
} from './fixtures/jevGroupGateCalibration.js';
import { JEV_GROUP_GATE_BROAD_CASES, JEV_GROUP_GATE_BROAD_CATEGORIES } from './fixtures/jevGroupGateBroad.js';
import { JEV_GROUP_GATE_QUESTIONS_V1, JEV_GROUP_GATE_QUESTIONS_V2 } from './fixtures/jevGroupGateQuestions.js';
import { aggregateJevGroupGateResults, compareJevGroupGateSemanticSignals, selectJevGroupGateCases, validateJevGroupGateCalibration } from '../scripts/jevGroupGateCalibration.js';

test('Group gate corpus covers every semantic category with production-shaped Group states', () => {
    assert.equal(JEV_GROUP_GATE_PARITY_SOURCE_COUNT, 14);
    assert.equal(JEV_GROUP_GATE_BROAD_SOURCE_COUNT, 18);
    assert.equal(JEV_GROUP_GATE_SOURCE_COUNT, 32);
    assert.equal(JEV_GROUP_GATE_CASES.length, 32);
    assert.equal(JEV_GROUP_GATE_CASES.every(item => item.state.mode === 'group' && item.state.ccMode === false), true);
    assert.deepEqual(validateJevGroupGateCalibration(), []);
    assert.equal(JEV_GROUP_GATE_CASES.filter(item => item.expected === 'positive').length, 13);
    assert.equal(JEV_GROUP_GATE_CASES.filter(item => item.hardCheckOnly).length, 1);
    assert.equal(JEV_GROUP_GATE_CASES.filter(item => item.sourceCategory === 'group_narration').every(item => item.expected === 'negative'), true);
    assert.equal(JEV_GROUP_GATE_BROAD_CASES.length, 18);
    assert.equal(JEV_GROUP_GATE_BROAD_CATEGORIES.length, 9);
    for (const category of JEV_GROUP_GATE_BROAD_CATEGORIES) {
        const rows = JEV_GROUP_GATE_BROAD_CASES.filter(item => item.sourceCategory === category);
        assert.deepEqual(rows.map(item => item.expected).sort(), ['negative', 'positive']);
        assert.equal(rows.every(item => item.state.mode === 'group'), true);
    }
});

test('Group gate calibration can repeat only named boundary sentinels without changing the corpus', () => {
    const ids = [
        'group-gate-broad-incomplete-ending-positive',
        'group-gate-v1-parity-replay-unproven-complex-negative',
        'group-gate-v1-parity-wardrobe-group-negative',
    ];
    assert.deepEqual(selectJevGroupGateCases(ids).map(item => item.id), ids);
    assert.equal(selectJevGroupGateCases().length, 32);
    assert.throws(() => selectJevGroupGateCases(['not-a-real-case']), /Unknown Group gate case id/);
});

test('Group gate V1 changes exactly the old group narration answer slot into a material-revision Boolean', () => {
    assert.deepEqual(Object.keys(JEV_GROUP_GATE_QUESTIONS_V1), Object.keys(JEV_QUESTIONS));
    const changed = Object.keys(JEV_QUESTIONS).filter(key => (
        JEV_QUESTIONS[key as keyof typeof JEV_QUESTIONS].instructions
        !== JEV_GROUP_GATE_QUESTIONS_V1[key as keyof typeof JEV_GROUP_GATE_QUESTIONS_V1].instructions
    ));
    assert.deepEqual(changed, ['group_narration_violation']);
    const wording = JEV_GROUP_GATE_QUESTIONS_V1.group_narration_violation.instructions;
    assert.match(wording, /Excluding the separately checked first-person Group narration rule/i);
    assert.match(wording, /requires revision rather than KEEP/i);
    assert.match(wording, /Stylistic preference, ambiguity.*unsupported possibilities are NO/i);

    const v2Changed = Object.keys(JEV_QUESTIONS).filter(key => (
        JEV_QUESTIONS[key as keyof typeof JEV_QUESTIONS].instructions
        !== JEV_GROUP_GATE_QUESTIONS_V2[key as keyof typeof JEV_GROUP_GATE_QUESTIONS_V2].instructions
    ));
    assert.deepEqual(v2Changed, ['group_narration_violation']);
    const v2 = JEV_GROUP_GATE_QUESTIONS_V2.group_narration_violation.instructions;
    assert.match(v2, /revision REQUIRED/i);
    assert.match(v2, /specific supported violation/i);
    assert.match(v2, /candidate can be KEPT/i);
    assert.match(v2, /missing, ambiguous, merely stylistic, harmlessly additive/i);
});

test('Group gate semantic drift comparison measures same-case cross-question movement without thresholds', () => {
    const baseline = [{
        id: 'same',
        sourceCaseId: 'same',
        sourceCategory: 'continuity' as const,
        expected: 'positive' as const,
        hardCheckOnly: false,
        latencyMs: 1,
        semanticSignals: { requestMismatch: 0.1, wardrobeConflict: 0.2 },
    }];
    const candidate = [{
        ...baseline[0],
        semanticSignals: { requestMismatch: 0.2, wardrobeConflict: 0.5 },
    }];
    const drift = compareJevGroupGateSemanticSignals(baseline, candidate);
    assert.equal(drift.matchedCases, 1);
    assert.equal(drift.comparisons, 2);
    assert.equal(drift.meanAbsoluteDelta, 0.2);
    assert.equal(drift.maximumAbsoluteDelta, 0.3);
    assert.equal(drift.overPoint05, 2);
    assert.equal(drift.overPoint10, 1);
    assert.deepEqual(drift.bySignal.requestMismatch, {
        count: 1,
        meanAbsoluteDelta: 0.1,
        maximumAbsoluteDelta: 0.1,
        overPoint05: 1,
        overPoint10: 0,
    });
    assert.equal('threshold' in drift, false);
});

test('Group gate aggregate compares one gate against category signal and max semantic risk without a threshold', () => {
    const summary = aggregateJevGroupGateResults([
        { id: 'p1', sourceCaseId: 'p1', sourceCategory: 'continuity', expected: 'positive', hardCheckOnly: false, gateSignal: 0.8, sourceCategorySignal: 0.7, maxSemanticSignal: 0.75, latencyMs: 1, cost: 0.001 },
        { id: 'p2', sourceCaseId: 'p2', sourceCategory: 'wardrobe', expected: 'positive', hardCheckOnly: false, gateSignal: 0.6, sourceCategorySignal: 0.5, maxSemanticSignal: 0.55, latencyMs: 1, cost: 0.001 },
        { id: 'n1', sourceCaseId: 'n1', sourceCategory: 'continuity', expected: 'negative', hardCheckOnly: false, gateSignal: 0.2, sourceCategorySignal: 0.3, maxSemanticSignal: 0.4, latencyMs: 1, cost: 0.001 },
        { id: 'hard', sourceCaseId: 'hard', sourceCategory: 'group_narration', expected: 'negative', hardCheckOnly: true, gateSignal: 0.1, maxSemanticSignal: 0.2, latencyMs: 1, cost: 0.001 },
    ]);
    assert.equal(summary.completed, 4);
    assert.equal(summary.gateMeanSeparation, 0.55);
    assert.deepEqual(summary.hardCheckOnly, { count: 1, gateMean: 0.1, gateMaximum: 0.1 });
    assert.equal(summary.totalCost, 0.004);
    assert.equal('threshold' in summary, false);
});
