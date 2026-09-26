import assert from 'node:assert/strict';
import test from 'node:test';
import { JEV_PRODUCTION_SHAPE_PARITY_CASES } from './fixtures/jevProductionShapeParity.js';
import { JEV_SYNTHETIC_CALIBRATION_CASES } from './fixtures/jevSyntheticCalibration.js';
import { JEV_FACTOR_ISOLATION_CASES, factorIsolationPersonaEvidence } from './fixtures/jevFactorIsolation.js';
import { validateFactorIsolationCorpus } from '../scripts/jevSyntheticCalibration.js';

const CLEAN_IDS = [
    'request-mismatch-positive', 'request-mismatch-negative', 'identity-positive', 'identity-negative', 'speaker-ownership-positive', 'speaker-ownership-negative',
    'continuity-positive', 'continuity-negative', 'reality-layer-positive', 'reality-layer-negative', 'wardrobe-positive', 'wardrobe-negative', 'state-positive', 'state-negative',
    'replayed-beat-positive', 'replayed-beat-negative', 'persona-voice-positive', 'persona-voice-negative', 'third-party-speech-positive', 'third-party-speech-negative',
    'user-agency-positive', 'user-agency-negative', 'incomplete-ending-positive', 'incomplete-ending-negative', 'group-narration-positive', 'group-narration-negative',
    'other-positive', 'other-negative', 'control-single-first-person', 'control-group-labelled-dialogue', 'control-roleplay-no-agency', 'control-style-without-rule',
    'control-unproven-replay', 'control-unestablished-wardrobe',
];
const PARITY_IDS = [
    'parity-group-narration-envelope-positive', 'parity-group-narration-envelope-negative', 'parity-group-narration-labelled-dialogue', 'parity-group-narration-single-control',
    'parity-persona-normal-positive', 'parity-persona-normal-negative', 'parity-persona-cc-positive', 'parity-persona-cc-negative', 'parity-persona-cc-no-explicit-rule',
    'parity-persona-group-positive', 'parity-persona-group-negative', 'parity-continuity-group-positive', 'parity-continuity-group-negative', 'parity-continuity-complex-history-negative',
    'parity-replay-group-positive', 'parity-replay-group-negative', 'parity-replay-unproven-complex-negative', 'parity-wardrobe-group-positive', 'parity-wardrobe-group-negative', 'parity-wardrobe-unspecified-negative',
];

test('clean and production-shape fixture IDs remain frozen', () => {
    assert.deepEqual(JEV_SYNTHETIC_CALIBRATION_CASES.map(item => item.id), CLEAN_IDS);
    assert.deepEqual(JEV_PRODUCTION_SHAPE_PARITY_CASES.map(item => item.id), PARITY_IDS);
});

test('factor-isolation corpus is valid and carries complete safe comparison metadata', () => {
    assert.equal(JEV_FACTOR_ISOLATION_CASES.length, 50);
    assert.deepEqual(validateFactorIsolationCorpus(JEV_FACTOR_ISOLATION_CASES), []);
    const variants = JEV_FACTOR_ISOLATION_CASES.filter(item => item.variant === 'variant');
    const counts = Object.fromEntries(['group_narration', 'persona_voice', 'replayed_beat', 'continuity'].map(family => [family, variants.filter(item => item.factorFamily === family).length]));
    assert.deepEqual(counts, { group_narration: 9, persona_voice: 10, replayed_beat: 10, continuity: 9 });
    const byId = new Map(JEV_FACTOR_ISOLATION_CASES.map(item => [item.id, item]));
    for (const variant of variants) {
        const baseline = byId.get(variant.baselineId || '');
        assert.ok(baseline, `${variant.id} baseline`);
        assert.equal(variant.category, baseline.category, `${variant.id} category`);
        assert.equal(variant.expected, baseline.expected, `${variant.id} expected`);
        assert.equal(variant.semanticCandidate, baseline.semanticCandidate, `${variant.id} semantic candidate`);
    }
});

test('tricky isolation negatives remain semantically valid without an AI call', () => {
    for (const fixture of JEV_FACTOR_ISOLATION_CASES.filter(item => item.factorFamily === 'replayed_beat' && item.expected === 'negative')) {
        const evidence = fixture.state.recentHistoryText || '';
        assert.match(evidence, /does not repair|did not complete|does not repair|plans to repair/i, fixture.id);
        assert.doesNotMatch(evidence, /repaired the blue lantern completely/i, fixture.id);
    }
    for (const fixture of JEV_FACTOR_ISOLATION_CASES.filter(item => item.factorFamily === 'continuity' && item.expected === 'negative')) {
        assert.match(fixture.state.candidateText, /Lantern workshop/i, fixture.id);
        assert.doesNotMatch(fixture.state.candidateText, /mountain summit/i, fixture.id);
    }
    for (const fixture of JEV_FACTOR_ISOLATION_CASES.filter(item => item.factorFamily === 'persona_voice' && item.expected === 'negative')) {
        assert.doesNotMatch(fixture.state.candidateText, /\bYo\b/i, fixture.id);
        assert.ok(factorIsolationPersonaEvidence(fixture).includes('PERSONA RULES:'), fixture.id);
    }
    for (const fixture of JEV_FACTOR_ISOLATION_CASES.filter(item => item.factorFamily === 'group_narration' && item.expected === 'negative')) {
        if (/\bI\b/.test(fixture.state.candidateText)) assert.match(fixture.state.candidateText, /Aster Vale: "I /, fixture.id);
    }
    for (const fixture of JEV_FACTOR_ISOLATION_CASES.filter(item => item.factorFamily === 'wardrobe' && item.expected === 'negative')) {
        assert.doesNotMatch(fixture.state.candidateText, /red coat/i, fixture.id);
    }
});
