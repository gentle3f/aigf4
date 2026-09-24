import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecisionProvider, ResolvedModelRoute, ReviewState, TurnSnapshot } from '../engine/contracts.js';

test('Engine V2 contracts keep snapshot state read-only at the type boundary', () => {
    const route: ResolvedModelRoute = {
        primary: 'primary',
        fallbacks: ['fallback'],
        strictReview: ['review'],
        source: 'saved-setting',
        ccMode: false,
    };
    const snapshot: Pick<TurnSnapshot, 'requestId' | 'conversationKey' | 'mode' | 'latestUserText' | 'modelRoute'> = {
        requestId: 'request-1',
        conversationKey: 'chat-1',
        mode: 'single',
        latestUserText: 'hello',
        modelRoute: route,
    };
    assert.equal(snapshot.modelRoute.primary, 'primary');
    assert.deepEqual(snapshot.modelRoute.fallbacks, ['fallback']);
});

test('future decision providers receive semantic state and do not require a provider implementation', async () => {
    const state: ReviewState = {
        latestUserText: 'continue',
        realityLayer: 'texting',
        realityEpochId: 'epoch-1',
        participants: [{ id: 'member-1', name: 'Member', present: true, role: 'lead' }],
        relevantMemories: [{ id: 'memory-1', summary: 'A relevant shared memory.', kind: 'shared' }],
        candidateText: 'candidate text',
    };
    const provider: DecisionProvider = {
        async evaluate(input) {
            assert.equal(input, state);
            return { outcome: 'accept', reasons: [], wouldRoute: 'accept' };
        },
    };
    assert.deepEqual(await provider.evaluate(state), {
        outcome: 'accept',
        reasons: [],
        wouldRoute: 'accept',
    });
});
