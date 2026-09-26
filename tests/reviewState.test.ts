import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildJevRecentHistoryText,
    buildReviewState,
    MAX_JEV_AUTHORITATIVE_CONTEXT_CHARS,
    MAX_JEV_RECENT_HISTORY_CHARS,
    MAX_JEV_REVIEW_STATE_CHARS,
} from '../engine/review/reviewState.js';

const wardrobe = { user: 'coat', characters: { rose: 'dress' } };
const persona = { name: 'Rose' } as any;

test('single and Cc review state use the newest turn, actual candidate, and no new memory retrieval', () => {
    const state = buildReviewState({
        mode: 'single', ccMode: true, latestUserText: 'current user turn', candidateText: 'candidate under review', personaKey: 'cc', persona, wardrobe,
    });
    assert.equal(state.latestUserText, 'current user turn');
    assert.equal(state.candidateText, 'candidate under review');
    assert.deepEqual(state.participants, [{ id: 'cc', name: 'Rose', present: true, role: 'active character' }]);
    assert.deepEqual(state.relevantMemories, []);
    assert.equal(state.mode, 'single');
    assert.equal(state.ccMode, true);
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
        mode: 'group', ccMode: false, latestUserText: 'now', candidateText: '<chat>candidate</chat>', personaKey: 'jennie', persona, room, wardrobe, proposedScene,
    });
    assert.equal(state.realityLayer, 'texting');
    assert.equal(state.realityEpochId, 'text-2');
    assert.equal(state.sceneSummary, 'Current remote conversation');
    assert.deepEqual(state.participants.map(member => [member.id, member.present]), [['jennie', true], ['rose', false]]);
    assert.equal(state.proposedScene?.id, 'candidate-scene');
    assert.notEqual(state.proposedScene, proposedScene);
    assert.deepEqual(state.relevantMemories, []);
    assert.equal(state.mode, 'group');
    assert.equal(state.ccMode, false);
});

test('review state keeps short authoritative context exactly and deterministically bounds long context', () => {
    const short = buildReviewState({ mode: 'single', ccMode: false, latestUserText: 'latest', candidateText: 'candidate', personaKey: 'rose', persona, wardrobe, authoritativeContext: 'exact context' });
    assert.equal(short.mode, 'single');
    assert.equal(short.ccMode, false);
    assert.equal(short.authoritativeContext, 'exact context');
    const context = `${'H'.repeat(7_000)}${'M'.repeat(2_000)}${'T'.repeat(7_000)}`;
    const bounded = buildReviewState({ mode: 'single', ccMode: false, latestUserText: 'latest', candidateText: 'candidate', personaKey: 'rose', persona, wardrobe, authoritativeContext: context }).authoritativeContext!;
    assert.equal(bounded.length, MAX_JEV_AUTHORITATIVE_CONTEXT_CHARS);
    assert.match(bounded, /\[bounded authoritative context\]/);
    assert.equal(bounded.startsWith('H'.repeat(5_000)), true);
    assert.equal(bounded.endsWith('T'.repeat(5_000)), true);
});

test('Jev recent history is bounded, role-labelled, newest-first by retention, and omits dedicated latest user text', () => {
    const messages = [
        { role: 'system', content: 'hidden system prompt' },
        ...Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: `turn-${index}` })),
        { role: 'user', content: 'latest dedicated user turn' },
    ];
    const history = buildJevRecentHistoryText(messages, 'latest dedicated user turn')!;
    assert.equal(history.includes('hidden system prompt'), false);
    assert.equal(history.includes('latest dedicated user turn'), false);
    assert.equal(history.includes('turn-0'), false);
    assert.equal(history.includes('turn-9'), true);
    assert.match(history, /USER:|ASSISTANT:/);
    assert.ok(history.length <= MAX_JEV_RECENT_HISTORY_CHARS);
    assert.ok((history.match(/(?:USER|ASSISTANT):\n/g) || []).length <= 8);
    const oversized = buildJevRecentHistoryText([{ role: 'assistant', content: 'x'.repeat(20_000) }], 'latest')!;
    assert.ok(oversized.length <= MAX_JEV_RECENT_HISTORY_CHARS);
    assert.match(oversized, /^ASSISTANT:\n/);
});

test('new Jev-only evidence never pushes an otherwise valid review state beyond the server cap', () => {
    const state = buildReviewState({
        mode: 'single', ccMode: false, latestUserText: 'u'.repeat(2_000), candidateText: 'c'.repeat(26_000),
        personaKey: 'rose', persona, wardrobe,
        authoritativeContext: 'a'.repeat(20_000),
        recentHistoryText: 'h'.repeat(12_000),
    });
    assert.ok(JSON.stringify(state).length <= MAX_JEV_REVIEW_STATE_CHARS);
    assert.ok((state.authoritativeContext?.length || 0) <= MAX_JEV_AUTHORITATIVE_CONTEXT_CHARS);
    assert.ok((state.recentHistoryText?.length || 0) <= MAX_JEV_RECENT_HISTORY_CHARS);
});
