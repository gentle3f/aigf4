import assert from 'node:assert/strict';
import test from 'node:test';
import { JEV_QUESTIONS } from '../api/_openrouter-decisions.js';
import { serializeGroupGenerationForReview } from '../engine/review/groupCandidateSerialization.js';
import { buildJevPersonaEvidence, buildJevRecentHistoryText } from '../engine/review/reviewState.js';
import {
    JEV_SYNTHETIC_CALIBRATION_CASES,
} from './fixtures/jevSyntheticCalibration.js';
import {
    JEV_PRODUCTION_SHAPE_PARITY_CASES,
} from './fixtures/jevProductionShapeParity.js';
import { validateProductionShapeParityCorpus, validateSyntheticCalibrationCorpus } from '../scripts/jevSyntheticCalibration.js';

const CLEAN_IDS = [
    'request-mismatch-positive', 'request-mismatch-negative', 'identity-positive', 'identity-negative',
    'speaker-ownership-positive', 'speaker-ownership-negative', 'continuity-positive', 'continuity-negative',
    'reality-layer-positive', 'reality-layer-negative', 'wardrobe-positive', 'wardrobe-negative',
    'state-positive', 'state-negative', 'replayed-beat-positive', 'replayed-beat-negative',
    'persona-voice-positive', 'persona-voice-negative', 'third-party-speech-positive', 'third-party-speech-negative',
    'user-agency-positive', 'user-agency-negative', 'incomplete-ending-positive', 'incomplete-ending-negative',
    'group-narration-positive', 'group-narration-negative', 'other-positive', 'other-negative',
    'control-single-first-person', 'control-group-labelled-dialogue', 'control-roleplay-no-agency',
    'control-style-without-rule', 'control-unproven-replay', 'control-unestablished-wardrobe',
];

const EXPECTED_QUESTIONS = {
    request_mismatch: 'Does candidateText materially fail to answer, follow, or respect latestUserText?',
    identity_conflict: 'Does candidateText assign a participant the wrong identity, merge participants, name the wrong person, or give a role that contradicts supplied participant or persona evidence?',
    speaker_ownership_violation: 'Does candidateText attribute speech, action, thought, or first-person ownership to the wrong participant?',
    continuity_violation: 'Does candidateText contradict a concrete fact established by recentHistoryText or the supplied current scene?',
    reality_layer_violation: 'Does candidateText behave as though the conversation is in a different reality layer from supplied realityLayer?',
    wardrobe_conflict: 'Does candidateText state or imply clothing that contradicts the supplied wardrobe state?',
    state_conflict: 'Does candidateText contradict the supplied current location, participant presence, body or physical position, or explicit scene state?',
    replayed_beat: 'Does candidateText incorrectly repeat an action, instruction, or narrative beat that recentHistoryText shows was already completed?',
    persona_voice_violation: 'Does candidateText materially contradict a clear personality, speaking-style, or regional-language rule stated in personaEvidence?',
    third_party_speech_violation: 'Does candidateText incorrectly omit, invent, or misattribute required third-party participation or speech established by supplied participants, latestUserText, or recentHistoryText?',
    user_agency_violation: 'Does candidateText invent a consequential user speech, action, choice, or commitment that latestUserText did not make?',
    incomplete_ending: 'Is candidateText materially truncated, cut off, or unfinished rather than intentionally open-ended?',
    group_narration_violation: "Are BOTH conditions true: (1) state.mode === 'group'; and (2) candidateText contains first-person narration for a participant outside labelled character dialogue?",
    other_defect: 'Does candidateText contain a concrete material conversation defect supported by supplied state that is not described by any other thirteen questions?',
};

test('clean semantic controls remain frozen at 34 original IDs', () => {
    assert.equal(JEV_SYNTHETIC_CALIBRATION_CASES.length, 34);
    assert.deepEqual(JEV_SYNTHETIC_CALIBRATION_CASES.map(item => item.id), CLEAN_IDS);
    assert.deepEqual(validateSyntheticCalibrationCorpus(JEV_SYNTHETIC_CALIBRATION_CASES), []);
});

test('Jev V3 proposition keys, NOUL type, and strings remain unchanged', () => {
    assert.deepEqual(Object.keys(JEV_QUESTIONS), Object.keys(EXPECTED_QUESTIONS));
    for (const [key, instructions] of Object.entries(EXPECTED_QUESTIONS)) {
        const question = JEV_QUESTIONS[key as keyof typeof JEV_QUESTIONS];
        assert.equal(question.type, 'noul');
        assert.equal(question.instructions, instructions);
    }
});

test('production-shape fixtures use the production group envelope and review builders', () => {
    assert.equal(JEV_PRODUCTION_SHAPE_PARITY_CASES.length, 20);
    assert.deepEqual(validateProductionShapeParityCorpus(JEV_PRODUCTION_SHAPE_PARITY_CASES), []);
    const groupCases = JEV_PRODUCTION_SHAPE_PARITY_CASES.filter(item => item.state.mode === 'group');
    assert.ok(groupCases.length > 0);
    for (const fixture of groupCases) {
        assert.match(fixture.state.candidateText, /^<chat>[\s\S]*<\/chat><scene>\{[\s\S]*\}<\/scene><npc_candidate>/);
        assert.ok(fixture.state.proposedScene);
        assert.ok(fixture.state.personaEvidence?.includes('NAME:\nAster Vale'));
        assert.ok(fixture.state.recentHistoryText?.includes('ASSISTANT:\n'));
    }
    assert.ok(JEV_PRODUCTION_SHAPE_PARITY_CASES.some(item => item.state.ccMode));
});

test('group serialization output is byte-for-byte stable for a representative candidate', () => {
    const candidate = {
        text: 'ignored',
        segments: [
            { type: 'narration' as const, text: 'Aster checks the lantern.' },
            { type: 'dialogue' as const, speakerId: 'beryl', speakerName: 'Beryl Quill', text: 'I will hold the map.' },
        ],
        scene: {
            id: 'scene', location: 'workshop', realityLayer: 'physical' as const, presentMemberIds: ['aster', 'beryl'],
            summary: 'A workshop scene.', unresolved: [], startedAt: 1, wardrobe: { user: 'coat', characters: { aster: 'green coat' } },
        },
    };
    const expected = '<chat>（Aster checks the lantern.）\nBeryl Quill：「I will hold the map.」</chat><scene>{"location":"workshop","reality_layer":"physical","present_member_ids":["aster","beryl"],"summary":"A workshop scene.","unresolved":[],"wardrobe_updates":{"user":"coat","members":[{"member_id":"aster","outfit":"green coat"}]}}</scene><npc_candidate>null</npc_candidate>';
    assert.equal(serializeGroupGenerationForReview(candidate), expected);
});

test('parity state evidence is produced by the same bounded helpers', () => {
    const ccFixture = JEV_PRODUCTION_SHAPE_PARITY_CASES.find(item => item.id === 'parity-persona-cc-negative')!;
    assert.match(ccFixture.state.personaEvidence || '', /PERSONA RULES:/);
    assert.ok((ccFixture.state.recentHistoryText || '').length > 0);
    assert.equal(typeof buildJevPersonaEvidence, 'function');
    assert.equal(typeof buildJevRecentHistoryText, 'function');
});

test('complex-history and unproven-replay controls retain their explicitly supplied final history', () => {
    const continuity = JEV_PRODUCTION_SHAPE_PARITY_CASES.find(item => item.id === 'parity-continuity-complex-history-negative')!;
    assert.match(continuity.state.recentHistoryText || '', /Aster repaired the blue lantern; Beryl checked it; Cato placed it on the workbench\./);

    const replay = JEV_PRODUCTION_SHAPE_PARITY_CASES.find(item => item.id === 'parity-replay-unproven-complex-negative')!;
    assert.match(replay.state.recentHistoryText || '', /Aster examined the damaged blue lantern but did not repair it\./);
    assert.doesNotMatch(replay.state.recentHistoryText || '', /Aster repaired the blue lantern and placed it on the workbench\./);
    assert.match(replay.state.candidateText, /Aster repairs the blue lantern\./);
});

test('unspecified-wardrobe control propagates one coherent wardrobe through state and group envelope', () => {
    const fixture = JEV_PRODUCTION_SHAPE_PARITY_CASES.find(item => item.id === 'parity-wardrobe-unspecified-negative')!;
    assert.equal(fixture.state.wardrobe?.characters.aster, undefined);
    assert.equal(fixture.state.proposedScene?.wardrobe?.characters.aster, undefined);
    assert.match(fixture.state.candidateText, /Aster adjusts a red scarf\./);
    assert.match(fixture.state.candidateText, /"wardrobe_updates":\{"user":"charcoal jumper","members":\[\]\}/);
    assert.doesNotMatch(fixture.state.candidateText, /green coat/);
    assert.doesNotMatch(JSON.stringify(fixture.state), /green coat/);
});
