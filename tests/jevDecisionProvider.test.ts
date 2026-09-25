import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateJevShadow } from '../engine/review/jevDecisionProvider.js';

const state = {
    latestUserText: 'latest', participants: [], relevantMemories: [], candidateText: 'candidate',
};
const valid = {
    status: 'ok', model: 'typesafe/jev-1.13',
    route: { choice: 'full_review', probabilities: { clean: 0.2, full_review: 0.8 }, confidence: 0.8 },
    signals: {
        identityConflict: 0.1, speakerOwnershipViolation: 0.2, realityLayerViolation: 0.3,
        memoryConflict: 0.4, stateConflict: 0.5, userAgencyViolation: 0.6, continuityViolation: 0.7,
    },
};

test('provider sends one same-origin state-only request and forwards caller abort signal', async () => {
    const controller = new AbortController();
    let received: RequestInit | undefined;
    const result = await evaluateJevShadow(state, controller.signal, async (url, options) => {
        assert.equal(url, '/api/openrouter-decisions');
        received = options;
        return { ok: true, json: async () => valid } as Response;
    });
    assert.equal(received?.credentials, 'same-origin');
    assert.equal(received?.signal, controller.signal);
    assert.deepEqual(JSON.parse(String(received?.body)), { state });
    assert.equal(result.status, 'ok');
    assert.equal(result.route?.choice, 'full_review');
});

test('provider normalizes HTTP, network, malformed JSON, and abort failures without raw errors', async () => {
    assert.deepEqual(await evaluateJevShadow(state, undefined, async () => ({ ok: false, status: 500 } as Response)), {
        status: 'unavailable', reasonCode: 'UPSTREAM_FAILURE',
    });
    assert.deepEqual(await evaluateJevShadow(state, undefined, async () => { throw new Error('private upstream detail'); }), {
        status: 'unavailable', reasonCode: 'NETWORK_FAILURE',
    });
    assert.deepEqual(await evaluateJevShadow(state, undefined, async () => ({ ok: true, json: async () => { throw new Error('bad json'); } } as Response)), {
        status: 'unavailable', reasonCode: 'MALFORMED_RESPONSE',
    });
    const controller = new AbortController();
    controller.abort();
    assert.deepEqual(await evaluateJevShadow(state, controller.signal, async () => { throw Object.assign(new Error('abort'), { name: 'AbortError' }); }), {
        status: 'aborted',
    });
});
