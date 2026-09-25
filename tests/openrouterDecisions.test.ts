import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import handler from '../api/openrouter-decisions.js';
import {
    JEV_MODEL,
    JEV_QUESTIONS,
    OPENROUTER_DECISIONS_URL,
    runOpenRouterDecision,
} from '../api/_openrouter-decisions.js';

const state = {
    latestUserText: 'latest user text',
    participants: [{ id: 'rose', name: 'Rose', present: true }],
    relevantMemories: [],
    candidateText: 'candidate text',
};

const upstreamBody = () => ({
    model: JEV_MODEL,
    answers: {
        route: { type: 'choice', choice: 'clean', probabilities: { clean: 0.9, full_review: 0.1 }, confidence: 0.9 },
        identity_conflict: { type: 'noul', noul: 0.01 },
        speaker_ownership_violation: { type: 'noul', noul: 0.02 },
        reality_layer_violation: { type: 'noul', noul: 0.03 },
        memory_conflict: { type: 'noul', noul: 0.04 },
        state_conflict: { type: 'noul', noul: 0.05 },
        user_agency_violation: { type: 'noul', noul: 0.06 },
        continuity_violation: { type: 'noul', noul: 0.07 },
    },
    usage: { input_tokens: 12, output_tokens: 3, cost: 0.00001 },
});

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as Response;

test('server sends one fixed Decisions request with server-only auth and all fixed questions', async () => {
    const calls: Array<{ url: unknown; options: RequestInit }> = [];
    const response = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        fetchImpl: async (url, options = {}) => {
            calls.push({ url, options });
            return ok(upstreamBody());
        },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, OPENROUTER_DECISIONS_URL);
    assert.equal(calls[0]?.options.headers && (calls[0].options.headers as Record<string, string>).Authorization, 'Bearer server-secret');
    const body = JSON.parse(String(calls[0]?.options.body));
    assert.deepEqual(Object.keys(body).sort(), ['model', 'questions', 'state']);
    assert.equal(body.model, JEV_MODEL);
    assert.deepEqual(body.state, state);
    assert.deepEqual(Object.keys(body.questions).sort(), Object.keys(JEV_QUESTIONS).sort());
    assert.equal(body.questions.route.type, 'choice');
    assert.equal(Object.values(body.questions).filter((question: any) => question.type === 'noul').length, 7);
    assert.equal(response.status, 'ok');
    assert.equal(response.model, JEV_MODEL);
    assert.equal(JSON.stringify(response).includes('server-secret'), false);
    assert.equal(JSON.stringify(response).includes(state.candidateText), false);
});

test('server rejects malformed state, oversize state, missing env, and non-allowlisted models without upstream calls', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; return ok(upstreamBody()); };
    assert.deepEqual(await runOpenRouterDecision({ ...state, model: 'attacker-model' }, { env: { OPENROUTER_API: 'secret' }, fetchImpl }), {
        status: 'unavailable', reasonCode: 'INVALID_STATE',
    });
    assert.deepEqual(await runOpenRouterDecision({ ...state, candidateText: 'x'.repeat(50_000) }, { env: { OPENROUTER_API: 'secret' }, fetchImpl }), {
        status: 'unavailable', reasonCode: 'OVERSIZE',
    });
    assert.deepEqual(await runOpenRouterDecision(state, { env: {}, fetchImpl }), {
        status: 'unavailable', reasonCode: 'MISSING_CREDENTIALS',
    });
    assert.deepEqual(await runOpenRouterDecision(state, { env: { OPENROUTER_API: 'secret', OPENROUTER_MODEL: 'other/model' }, fetchImpl }), {
        status: 'unavailable', reasonCode: 'MODEL_NOT_ALLOWED',
    });
    assert.equal(calls, 0);
});

test('server normalizes malformed upstream responses without echoing state', async () => {
    const response = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API_KEY: 'compat-secret' },
        fetchImpl: async () => ok({ model: JEV_MODEL, answers: {} }),
    });
    assert.deepEqual(response, { status: 'unavailable', reasonCode: 'MALFORMED_RESPONSE' });
    assert.equal(JSON.stringify(response).includes('compat-secret'), false);
    assert.equal(JSON.stringify(response).includes(state.latestUserText), false);
});

test('unauthenticated endpoint caller receives 401 without an upstream request', async () => {
    const response: { statusCode?: number; body?: unknown } = {};
    const res = {
        setHeader: () => undefined,
        status(code: number) { response.statusCode = code; return this; },
        json(body: unknown) { response.body = body; return this; },
    };
    await handler({ method: 'POST', headers: {}, body: { state } }, res);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, { error: 'Unauthorized' });
});

test('authenticated endpoint accepts only the state envelope', async () => {
    const secret = 'test-session-secret';
    const payload = Buffer.from(JSON.stringify({ exp: Date.now() + 60_000 }), 'utf8').toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const originalSecret = process.env.APP_SESSION_SECRET;
    process.env.APP_SESSION_SECRET = secret;
    const response: { statusCode?: number; body?: unknown } = {};
    const res = {
        setHeader: () => undefined,
        status(code: number) { response.statusCode = code; return this; },
        json(body: unknown) { response.body = body; return this; },
    };
    try {
        await handler({ method: 'POST', headers: { cookie: `aigf4_gate=${payload}.${signature}` }, body: { state, model: 'attacker-model' } }, res);
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, { status: 'unavailable', reasonCode: 'INVALID_REQUEST' });
    } finally {
        if (originalSecret === undefined) delete process.env.APP_SESSION_SECRET;
        else process.env.APP_SESSION_SECRET = originalSecret;
    }
});
