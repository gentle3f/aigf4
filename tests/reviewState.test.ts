import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReviewState } from '../engine/review/reviewState.js';

const wardrobe = { user: 'coat', characters: { rose: 'dress' } };
const persona = { name: 'Rose' } as any;

test('single and Cc review state use the newest turn, actual candidate, and no new memory retrieval', () => {
    const state = buildReviewState({
        latestUserText: 'current user turn', candidateText: 'candidate under review', personaKey: 'cc', persona, wardrobe,
    });
    assert.equal(state.latestUserText, 'current user turn');
    assert.equal(state.candidateText, 'candidate under review');
    assert.deepEqual(state.participants, [{ id: 'cc', name: 'Rose', present: true, role: 'active character' }]);
    assert.deepEqual(state.relevantMemories, []);
    assert.notEqual(state.wardrobe, wardrobe);
    assert.notEqual(state.wardrobe?.characters, wardrobe.characters);
});

test('group review state keeps current scene snapshot and candidate proposed scene separate', () => {
    const room = {
        scene: {
            id: 'epoch-current', location: 'studio', realityLayer: 'texting', realityEpochId: 'text-2',
            presentMemberIds: ['jennie'], summary: 'Current remote conversation', unresolved: [], startedAt: 10, wardrobe,
        },
        members: [
            { id: 'jennie', persona: { name: 'Jennie' } },
            { id: 'rose', persona: { name: 'Rose' } },
        ],
    } as any;
    const proposedScene = {
        id: 'candidate-scene', location: 'hotel', realityLayer: 'physical', realityEpochId: 'physical-3',
        presentMemberIds: ['rose'], summary: 'Candidate scene', unresolved: ['door'], startedAt: 20, wardrobe,
    } as any;
    const state = buildReviewState({
        latestUserText: 'now', candidateText: '<chat>candidate</chat>', personaKey: 'jennie', persona, room, wardrobe, proposedScene,
    });
    assert.equal(state.realityLayer, 'texting');
    assert.equal(state.realityEpochId, 'text-2');
    assert.equal(state.sceneSummary, 'Current remote conversation');
    assert.deepEqual(state.participants.map(member => [member.id, member.present]), [['jennie', true], ['rose', false]]);
    assert.equal(state.proposedScene?.id, 'candidate-scene');
    assert.notEqual(state.proposedScene, proposedScene);
    assert.deepEqual(state.relevantMemories, []);
});
