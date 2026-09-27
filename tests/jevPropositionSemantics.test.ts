import assert from 'node:assert/strict';
import test from 'node:test';
import { JEV_QUESTIONS } from '../api/_openrouter-decisions.js';
import { STRICT_REVIEW_ISSUE_CODES } from '../strictReview.js';
import { JEV_EXPERIMENTAL_QUESTIONS_V4 } from './fixtures/jevExperimentalQuestions.js';
import { JEV_SEMANTIC_AB_CASES, JEV_SEMANTIC_AB_SOURCE_IDS } from './fixtures/jevSemanticAb.js';
import { aggregateSyntheticCalibration, validateSemanticAbCorpus } from '../scripts/jevSyntheticCalibration.js';

test('experimental V4 retains the fourteen production semantic keys as NOUL propositions', () => {
    assert.deepEqual(Object.keys(JEV_EXPERIMENTAL_QUESTIONS_V4), Object.keys(JEV_QUESTIONS));
    assert.equal(Object.values(JEV_EXPERIMENTAL_QUESTIONS_V4).every(question => question.type === 'noul'), true);
    assert.equal(Object.keys(JEV_EXPERIMENTAL_QUESTIONS_V4).length, 14);
    assert.deepEqual(Object.keys(JEV_EXPERIMENTAL_QUESTIONS_V4).map(key => ({
        request_mismatch: 'request_mismatch', identity_conflict: 'identity', speaker_ownership_violation: 'speaker_ownership',
        continuity_violation: 'continuity', reality_layer_violation: 'reality_layer', wardrobe_conflict: 'wardrobe',
        state_conflict: 'state', replayed_beat: 'replayed_beat', persona_voice_violation: 'persona_voice',
        third_party_speech_violation: 'third_party_speech', user_agency_violation: 'user_agency', incomplete_ending: 'incomplete_ending',
        group_narration_violation: 'group_narration', other_defect: 'other',
    }[key])).sort(), [...STRICT_REVIEW_ISSUE_CODES].sort());
});

test('experimental wording narrows only established concrete contradictions', () => {
    assert.match(JEV_EXPERIMENTAL_QUESTIONS_V4.wardrobe_conflict.instructions, /unestablished.*NO/i);
    assert.match(JEV_EXPERIMENTAL_QUESTIONS_V4.replayed_beat.instructions, /completed/i);
    assert.match(JEV_EXPERIMENTAL_QUESTIONS_V4.replayed_beat.instructions, /Planning.*NO/i);
    assert.match(JEV_EXPERIMENTAL_QUESTIONS_V4.continuity_violation.instructions, /concretely contradict/i);
    assert.match(JEV_EXPERIMENTAL_QUESTIONS_V4.persona_voice_violation.instructions, /clear explicit/i);
    assert.match(JEV_EXPERIMENTAL_QUESTIONS_V4.group_narration_violation.instructions, /outside labelled character dialogue/i);
    assert.match(JEV_EXPERIMENTAL_QUESTIONS_V4.other_defect.instructions, /concrete material defect/i);
    for (const question of Object.values(JEV_EXPERIMENTAL_QUESTIONS_V4)) assert.doesNotMatch(question.instructions, /score near zero|threshold/i);
});

test('semantic A/B reuses frozen states exactly once per question set with complementary interleaving', () => {
    assert.equal(JEV_SEMANTIC_AB_SOURCE_IDS.length, 28);
    assert.equal(JEV_SEMANTIC_AB_CASES.length, 56);
    assert.deepEqual(validateSemanticAbCorpus(JEV_SEMANTIC_AB_CASES), []);
    for (const sourceCaseId of JEV_SEMANTIC_AB_SOURCE_IDS) {
        const entries = JEV_SEMANTIC_AB_CASES.filter(item => item.sourceCaseId === sourceCaseId);
        assert.equal(entries.length, 2);
        assert.notEqual(entries[0]?.questionSet, entries[1]?.questionSet);
        assert.equal(entries[0]?.state, entries[1]?.state);
        assert.equal(JSON.stringify(entries[0]?.state), JSON.stringify(entries[1]?.state));
    }
});

test('semantic A/B aggregation keeps production and experimental signals paired by frozen source', () => {
    const source = JEV_SEMANTIC_AB_CASES[0]!;
    const companion = JEV_SEMANTIC_AB_CASES.find(item => item.sourceCaseId === source.sourceCaseId && item.questionSet !== source.questionSet)!;
    const report = aggregateSyntheticCalibration([
        { id: source.id, suite: 'semantic-ab', sourceCaseId: source.sourceCaseId, questionSet: source.questionSet, mode: source.mode, ccMode: source.ccMode, category: source.category, expected: source.expected, signal: 0.6, latencyMs: 1 },
        { id: companion.id, suite: 'semantic-ab', sourceCaseId: companion.sourceCaseId, questionSet: companion.questionSet, mode: companion.mode, ccMode: companion.ccMode, category: companion.category, expected: companion.expected, signal: 0.2, latencyMs: 1 },
    ], JEV_SEMANTIC_AB_CASES);
    const row = report.semanticAb.bySource[source.sourceCaseId];
    assert.equal(row.productionSignal, source.questionSet === 'production' ? 0.6 : 0.2);
    assert.equal(row.experimentalSignal, source.questionSet === 'experimental' ? 0.6 : 0.2);
    assert.equal(row.delta, -0.39999999999999997);
});
