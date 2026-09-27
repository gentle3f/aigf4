import assert from 'node:assert/strict';
import test from 'node:test';
import { JEV_QUESTIONS } from '../api/_openrouter-decisions.js';
import { JEV_QUESTION_KEY_BY_CATEGORY } from './fixtures/jevSingleQuestionHybrid.js';
import { JEV_CANDIDATE_GUARDRAIL_CASES } from './fixtures/jevCandidateGuardrailAb.js';
import {
    JEV_CANDIDATE_GUARDRAIL_SENTINELS,
    JEV_CANDIDATE_GUARDRAIL_SOURCES,
} from './fixtures/jevCandidateGuardrails.js';
import { buildSingleQuestionExperimentalSet } from './fixtures/jevSingleQuestionHybrid.js';
import { aggregateSyntheticCalibration, validateCandidateGuardrailCorpus } from '../scripts/jevSyntheticCalibration.js';

test('candidate guardrail corpus is fictional, balanced, and structurally valid', () => {
    assert.equal(JEV_CANDIDATE_GUARDRAIL_SOURCES.length, 40);
    assert.equal(JEV_CANDIDATE_GUARDRAIL_CASES.length, 80);
    assert.deepEqual(validateCandidateGuardrailCorpus(JEV_CANDIDATE_GUARDRAIL_CASES), []);
    assert.equal(JEV_CANDIDATE_GUARDRAIL_SOURCES.filter(item => item.category === 'wardrobe').length, 22);
    assert.equal(JEV_CANDIDATE_GUARDRAIL_SOURCES.filter(item => item.category === 'group_narration').length, 18);
    assert.equal(JEV_CANDIDATE_GUARDRAIL_SOURCES.filter(item => item.expected === 'positive').length, 14);
    assert.equal(JEV_CANDIDATE_GUARDRAIL_SOURCES.filter(item => item.expected === 'negative').length, 26);
    for (const source of JEV_CANDIDATE_GUARDRAIL_SOURCES) {
        assert.match(source.id, /^guardrail-(wardrobe|group)-/);
        assert.doesNotMatch(JSON.stringify(source.state), /OPENROUTER_API|Bearer |sk-or-/);
    }
});

test('every candidate source has exactly one production and one category-only V4 request over the identical state object', () => {
    for (const source of JEV_CANDIDATE_GUARDRAIL_SOURCES) {
        const pair = JEV_CANDIDATE_GUARDRAIL_CASES.filter(item => item.sourceCaseId === source.id);
        assert.equal(pair.length, 2, source.id);
        assert.deepEqual(pair.map(item => item.questionSet).sort(), ['category-v4', 'production'], source.id);
        assert.equal(pair[0]?.state, pair[1]?.state, source.id);
        assert.equal(pair[0]?.state, source.state, source.id);
        assert.equal(JSON.stringify(pair[0]?.state), JSON.stringify(pair[1]?.state), source.id);
    }
    const size = JEV_CANDIDATE_GUARDRAIL_SOURCES.length;
    for (let index = 0; index < size; index += 1) {
        assert.equal(JEV_CANDIDATE_GUARDRAIL_CASES[index]?.sourceCaseId, JEV_CANDIDATE_GUARDRAIL_SOURCES[index]?.id);
        assert.equal(JEV_CANDIDATE_GUARDRAIL_CASES[index]?.questionSet === JEV_CANDIDATE_GUARDRAIL_CASES[size + index]?.questionSet, false);
    }
});

test('candidate hybrids replace exactly the wardrobe or group narration proposition', () => {
    for (const category of ['wardrobe', 'group_narration'] as const) {
        const hybrid = buildSingleQuestionExperimentalSet(category);
        const changed = Object.keys(JEV_QUESTIONS).filter(key => hybrid[key]?.instructions !== JEV_QUESTIONS[key]?.instructions);
        assert.deepEqual(changed, [JEV_QUESTION_KEY_BY_CATEGORY[category]]);
    }
});

test('wardrobe and group families carry deterministic semantic characterization metadata', () => {
    const wardrobe = JEV_CANDIDATE_GUARDRAIL_SOURCES.filter(item => item.category === 'wardrobe');
    const group = JEV_CANDIDATE_GUARDRAIL_SOURCES.filter(item => item.category === 'group_narration');
    assert.ok(wardrobe.filter(item => item.expected === 'positive').every(item => item.semantics.establishedContradiction));
    assert.ok(wardrobe.filter(item => item.guardrailFamily === 'exact-match').every(item => item.semantics.establishedMatch));
    assert.ok(wardrobe.filter(item => item.guardrailFamily === 'unestablished').every(item => item.semantics.lacksTargetClothingEvidence));
    assert.ok(wardrobe.filter(item => item.guardrailFamily === 'additive-accessory').every(item => item.semantics.additiveOnly));
    assert.ok(wardrobe.filter(item => item.guardrailFamily === 'clothing-change').every(item => item.semantics.explicitPriorChange));
    assert.ok(wardrobe.filter(item => item.guardrailFamily === 'wrong-person').every(item => item.semantics.wrongPersonMismatch));
    assert.ok(group.filter(item => item.expected === 'positive').every(item => item.semantics.unlabelledFirstPerson));
    assert.ok(group.filter(item => item.guardrailFamily.includes('envelope')).every(item => item.semantics.serializerEnvelope));
    assert.ok(group.filter(item => item.guardrailFamily === 'mixed').every(item => item.semantics.labelledFirstPerson && item.semantics.unlabelledFirstPerson));
});

test('wardrobe wrong-person and clothing-change fixtures prove their content-level semantics', () => {
    const byId = new Map(JEV_CANDIDATE_GUARDRAIL_SOURCES.map(source => [source.id, source]));
    const wrongPersonSingle = byId.get('guardrail-wardrobe-wrong-person-single')!;
    const wrongPersonGroup = byId.get('guardrail-wardrobe-wrong-person-group')!;
    const changeGroup = byId.get('guardrail-wardrobe-change-group')!;
    const dressConflict = byId.get('guardrail-wardrobe-conflict-dress')!;

    for (const source of [wrongPersonSingle, wrongPersonGroup]) {
        assert.equal(source.state.wardrobe?.characters.aster, 'green coat');
        assert.equal(source.state.wardrobe?.characters.beryl, 'red coat');
        assert.match(source.state.candidateText, /Aster smooths her red coat/i);
        assert.doesNotMatch(source.state.candidateText, /assigned to Beryl|Beryl's red coat/i);
    }
    assert.match(wrongPersonGroup.state.candidateText, /<chat>/);
    assert.equal(changeGroup.expected, 'negative');
    assert.equal(changeGroup.state.wardrobe?.characters.aster, 'black dress');
    assert.match(changeGroup.state.candidateText, /black dress/i);
    assert.match(changeGroup.state.recentHistoryText || '', /changed from her blue dress into a black dress/i);
    assert.equal(dressConflict.expected, 'positive');
    assert.equal(dressConflict.state.wardrobe?.characters.aster, 'blue dress');
    assert.match(dressConflict.state.candidateText, /wearing a black dress/i);
    assert.doesNotMatch(dressConflict.state.recentHistoryText || '', /blue dress.*black dress|black dress.*blue dress/i);
});

test('candidate aggregate retains source pairing, family metadata, and category separation inputs', () => {
    const positive = JEV_CANDIDATE_GUARDRAIL_CASES.find(item => item.category === 'wardrobe' && item.expected === 'positive')!;
    const negative = JEV_CANDIDATE_GUARDRAIL_CASES.find(item => item.category === 'wardrobe' && item.expected === 'negative')!;
    const rows = [positive, ...JEV_CANDIDATE_GUARDRAIL_CASES.filter(item => item.sourceCaseId === positive.sourceCaseId && item !== positive), negative, ...JEV_CANDIDATE_GUARDRAIL_CASES.filter(item => item.sourceCaseId === negative.sourceCaseId && item !== negative)].map(item => ({ ...item, signal: item.questionSet === 'production' ? 0.8 : 0.6, latencyMs: 1 }));
    const report = aggregateSyntheticCalibration(rows, JEV_CANDIDATE_GUARDRAIL_CASES);
    assert.equal(report.candidateGuardrail.bySource[positive.sourceCaseId]?.delta, -0.20000000000000007);
    assert.equal(report.candidateGuardrail.byCategory.wardrobe.productionSeparation, 0);
    assert.equal(report.candidateGuardrail.byCategory.wardrobe.alternativeSeparation, 0);
});

test('four sentinels identify the documented future optional repeat sources', () => {
    for (const id of Object.values(JEV_CANDIDATE_GUARDRAIL_SENTINELS)) assert.ok(JEV_CANDIDATE_GUARDRAIL_SOURCES.some(source => source.id === id), id);
});
