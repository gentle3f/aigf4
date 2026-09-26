import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateJevShadow, normalizeJevShadowResult } from '../engine/review/jevDecisionProvider.js';

const state = {
    mode: 'single' as const, ccMode: false,
    latestUserText: 'latest', participants: [], relevantMemories: [], candidateText: 'candidate',
};
const valid = {
    status: 'ok', model: 'typesafe/jev-1.13',
    route: { choice: 'full_review', probabilities: { clean: 0.2, full_review: 0.8 }, confidence: 0.8 },
    signals: {
        requestMismatch: 0.01, identityConflict: 0.1, speakerOwnershipViolation: 0.2, continuityViolation: 0.3,
        realityLayerViolation: 0.4, wardrobeConflict: 0.5, stateConflict: 0.6, replayedBeat: 0.7,
        personaVoiceViolation: 0.8, thirdPartySpeechViolation: 0.9, userAgencyViolation: 0.1,
        incompleteEnding: 0.2, groupNarrationViolation: 0.3, otherDefect: 0.4,
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

test('provider requires every V2 signal, rejects unknown legacy signal shape, and preserves route and usage validation', () => {
    assert.equal(normalizeJevShadowResult(valid)?.signals?.groupNarrationViolation, 0.3);
    for (const signal of Object.keys(valid.signals)) {
        const incomplete = structuredClone(valid) as any;
        delete incomplete.signals[signal];
        assert.equal(normalizeJevShadowResult(incomplete), null, `missing ${signal}`);
    }
    const legacy = structuredClone(valid) as any;
    delete legacy.signals.requestMismatch;
    legacy.signals.memoryConflict = 0.1;
    assert.equal(normalizeJevShadowResult(legacy), null);
    assert.equal(normalizeJevShadowResult({ ...valid, route: { ...valid.route, choice: 'maybe' } }), null);
    assert.equal(normalizeJevShadowResult({ ...valid, usage: { inputTokens: -1 } }), null);
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

test('provider accepts only the expanded closed upstream failure reason-code set', () => {
    assert.deepEqual(normalizeJevShadowResult({ status: 'unavailable', reasonCode: 'UPSTREAM_PAYMENT_REQUIRED' }), {
        status: 'unavailable', reasonCode: 'UPSTREAM_PAYMENT_REQUIRED',
    });
    assert.equal(normalizeJevShadowResult({ status: 'unavailable', reasonCode: 'UPSTREAM_599' }), null);
    assert.deepEqual(normalizeJevShadowResult({ status: 'unavailable', reasonCode: 'UPSTREAM_NETWORK_ERROR', networkCode: 'ECONNRESET' }), {
        status: 'unavailable', reasonCode: 'UPSTREAM_NETWORK_ERROR', networkCode: 'ECONNRESET',
    });
    assert.equal(normalizeJevShadowResult({ status: 'unavailable', reasonCode: 'UPSTREAM_NETWORK_ERROR', networkCode: 'PRIVATE_NETWORK_DETAIL' }), null);
    assert.equal(normalizeJevShadowResult({ status: 'unavailable', reasonCode: 'TIMEOUT', networkCode: 'ECONNRESET' }), null);
});
