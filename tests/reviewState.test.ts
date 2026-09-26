import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildJevPersonaEvidence,
    buildJevRecentHistoryText,
    buildReviewState,
    MAX_JEV_PERSONA_EVIDENCE_CHARS,
    MAX_JEV_RECENT_HISTORY_CHARS,
    MAX_JEV_REVIEW_STATE_CHARS,
} from '../engine/review/reviewState.js';

const wardrobe = { user: 'coat', characters: { rose: 'dress' } };
const persona = { name: 'Rose', description: 'Warm and observant.', prompt: 'Speak directly and keep continuity.' } as any;

test('single review state keeps newest turn, candidate, and persona-only evidence without memory retrieval', () => {
    const state = buildReviewState({ mode: 'single', ccMode: true, latestUserText: 'current user turn', candidateText: 'candidate under review', personaKey: 'cc', persona, wardrobe });
    assert.equal(state.latestUserText, 'current user turn');
    assert.equal(state.candidateText, 'candidate under review');
    assert.match(state.personaEvidence || '', /NAME:\nRose/);
    assert.equal('authoritativeContext' in state, false);
    assert.deepEqual(state.relevantMemories, []);
    assert.notEqual(state.wardrobe, wardrobe);
});

test('group persona evidence is deterministic, bounded, and preserves several names despite one oversized persona', () => {
    const room = { members: [
        { id: 'a', persona: { name: 'Alba', description: 'a'.repeat(20_000), prompt: 'a'.repeat(20_000) } },
        { id: 'b', persona: { name: 'Bea', description: 'quick thinker', prompt: 'be direct' } },
        { id: 'c', persona: { name: 'Cora', description: 'careful observer', prompt: 'be calm' } },
    ] } as any;
    const first = buildJevPersonaEvidence(persona, room);
    assert.equal(first, buildJevPersonaEvidence(persona, room));
    assert.ok(first.length <= MAX_JEV_PERSONA_EVIDENCE_CHARS);
    assert.match(first, /NAME:\nAlba/);
    assert.match(first, /NAME:\nBea/);
    assert.match(first, /NAME:\nCora/);
});

test('group review state keeps current scene and proposed scene separate', () => {
    const room = { scene: { id: 'epoch-current', location: 'studio', realityLayer: 'texting', realityEpochId: 'text-2', presentMemberIds: ['jennie'], summary: 'Current remote conversation', unresolved: [], startedAt: 10, wardrobe }, members: [{ id: 'jennie', persona: { name: 'Jennie' } }, { id: 'rose', persona }] } as any;
    const proposedScene = { id: 'candidate-scene', location: 'hotel', realityLayer: 'physical', realityEpochId: 'physical-3', presentMemberIds: ['rose'], summary: 'Candidate scene', unresolved: ['door'], startedAt: 20, wardrobe } as any;
    const state = buildReviewState({ mode: 'group', ccMode: false, latestUserText: 'now', candidateText: '<chat>candidate</chat>', personaKey: 'jennie', persona, room, wardrobe, proposedScene });
    assert.equal(state.realityLayer, 'texting');
    assert.equal(state.proposedScene?.id, 'candidate-scene');
    assert.deepEqual(state.participants.map(member => [member.id, member.present]), [['jennie', true], ['rose', false]]);
});

test('Jev recent history omits latest user turn and retains at most four messages / four thousand chars', () => {
    const messages = [{ role: 'system', content: 'hidden system prompt' }, ...Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `turn-${index}` })), { role: 'user', content: 'latest dedicated user turn' }];
    const history = buildJevRecentHistoryText(messages, 'latest dedicated user turn')!;
    assert.equal(history.includes('hidden system prompt'), false);
    assert.equal(history.includes('latest dedicated user turn'), false);
    assert.equal(history.includes('turn-5'), false);
    assert.equal(history.includes('turn-9'), true);
    assert.ok(history.length <= MAX_JEV_RECENT_HISTORY_CHARS);
    assert.ok((history.match(/(?:USER|ASSISTANT):\n/g) || []).length <= 4);
    assert.ok(buildJevRecentHistoryText([{ role: 'assistant', content: 'x'.repeat(20_000) }], 'latest')!.length <= MAX_JEV_RECENT_HISTORY_CHARS);
});

test('persona evidence and recent history never push a valid state over the server cap', () => {
    const state = buildReviewState({ mode: 'single', ccMode: false, latestUserText: 'u'.repeat(2_000), candidateText: 'c'.repeat(26_000), personaKey: 'rose', persona: { ...persona, description: 'a'.repeat(20_000), prompt: 'a'.repeat(20_000) }, wardrobe, recentHistoryText: 'h'.repeat(12_000) });
    assert.ok(JSON.stringify(state).length <= MAX_JEV_REVIEW_STATE_CHARS);
    assert.ok((state.personaEvidence?.length || 0) <= MAX_JEV_PERSONA_EVIDENCE_CHARS);
    assert.ok((state.recentHistoryText?.length || 0) <= MAX_JEV_RECENT_HISTORY_CHARS);
});
