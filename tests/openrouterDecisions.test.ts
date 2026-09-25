import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import handler from '../api/openrouter-decisions.js';
import {
    JEV_MODEL,
    JEV_QUESTIONS,
    OPENROUTER_DECISIONS_URL,
    classifyUpstreamHttpFailure,
    extractNetworkCauseCode,
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

test('server classifies each upstream HTTP failure without reading the upstream body', async () => {
    const expected = new Map([
        [400, 'UPSTREAM_BAD_REQUEST'], [401, 'UPSTREAM_UNAUTHORIZED'], [402, 'UPSTREAM_PAYMENT_REQUIRED'],
        [403, 'UPSTREAM_FORBIDDEN'], [404, 'UPSTREAM_NOT_FOUND'], [408, 'UPSTREAM_REQUEST_TIMEOUT'],
        [413, 'UPSTREAM_TOO_LARGE'], [422, 'UPSTREAM_UNPROCESSABLE'], [429, 'UPSTREAM_RATE_LIMITED'],
        [500, 'UPSTREAM_SERVER_ERROR'], [502, 'UPSTREAM_SERVER_ERROR'], [503, 'UPSTREAM_SERVER_ERROR'],
        [529, 'UPSTREAM_SERVER_ERROR'], [418, 'UPSTREAM_HTTP_ERROR'],
    ]);
    for (const [status, reasonCode] of expected) {
        let bodyRead = false;
        const response = await runOpenRouterDecision(state, {
            env: { OPENROUTER_API: 'server-secret' },
            fetchImpl: async () => ({ ok: false, status, json: async () => { bodyRead = true; return { error: 'private upstream body' }; } }) as Response,
        });
        assert.deepEqual(response, { status: 'unavailable', reasonCode });
        assert.equal(bodyRead, false);
        assert.equal(JSON.stringify(response).includes('private upstream body'), false);
    }
    assert.equal(classifyUpstreamHttpFailure(418), 'UPSTREAM_HTTP_ERROR');
});

test('server keeps timeout distinct from ordinary upstream network failures without surfacing error details', async () => {
    let calls = 0;
    const networkError = Object.assign(new TypeError('private network detail'), {
        cause: Object.assign(new Error('private socket detail'), { code: 'UND_ERR_CONNECT_TIMEOUT' }),
    });
    networkError.stack = 'private stack detail';
    const networkFailure = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        fetchImpl: async () => { calls += 1; throw networkError; },
    });
    const timeoutFailure = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        fetchImpl: async () => { calls += 1; throw Object.assign(new Error('private timeout detail'), { name: 'AbortError' }); },
    });
    assert.deepEqual(networkFailure, { status: 'unavailable', reasonCode: 'UPSTREAM_NETWORK_ERROR', networkCode: 'UND_ERR_CONNECT_TIMEOUT' });
    assert.deepEqual(timeoutFailure, { status: 'unavailable', reasonCode: 'TIMEOUT' });
    assert.equal(calls, 2);
    for (const response of [networkFailure, timeoutFailure]) {
        const serialized = JSON.stringify(response);
        assert.equal(serialized.includes('server-secret'), false);
        assert.equal(serialized.includes(state.latestUserText), false);
        assert.equal(serialized.includes(state.candidateText), false);
        assert.equal(serialized.includes(networkError.message), false);
        assert.equal(serialized.includes(networkError.stack), false);
        assert.equal(serialized.includes('private'), false);
    }
});

test('server extracts only allowlisted network codes from direct, cause, and aggregate errors', () => {
    const withCause = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('private cause'), { code }) });
    assert.equal(extractNetworkCauseCode(Object.assign(new Error('private direct code'), { code: 'UND_ERR_SOCKET' })), 'UND_ERR_SOCKET');
    for (const code of ['UND_ERR_CONNECT_TIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
        assert.equal(extractNetworkCauseCode(withCause(code)), code);
    }
    const aggregate = Object.assign(new Error('private aggregate'), {
        errors: [Object.assign(new Error('unknown nested'), { code: 'PRIVATE_CODE' }), Object.assign(new Error('private nested'), { code: 'ECONNREFUSED' })],
    });
    assert.equal(extractNetworkCauseCode(aggregate), 'ECONNREFUSED');
    assert.equal(extractNetworkCauseCode(Object.assign(new Error('private unknown'), { code: 'PRIVATE_CODE' })), 'NETWORK_UNKNOWN');
    assert.equal(extractNetworkCauseCode(new TypeError('fetch failed')), 'NETWORK_UNKNOWN');
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
