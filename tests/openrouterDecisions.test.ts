import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import handler, { parseDecisionRequest } from '../api/openrouter-decisions.js';
import {
    JEV_GROUP_GATE_SHADOW_QUESTIONS,
    JEV_MODEL,
    JEV_QUESTIONS,
    JEV_WARDROBE_SHADOW_QUESTIONS,
    MAX_DECISIONS_RESPONSE_BYTES,
    OPENROUTER_DECISIONS_URL,
    classifyUpstreamHttpFailure,
    extractNetworkCauseCode,
    requestOpenRouterViaHttps,
    runOpenRouterDecision,
} from '../api/_openrouter-decisions.js';
import { JEV_EXPERIMENTAL_QUESTIONS_V4 } from './fixtures/jevExperimentalQuestions.js';
import { STRICT_REVIEW_ISSUE_CODES } from '../strictReview.js';

const state = {
    mode: 'single',
    ccMode: false,
    latestUserText: 'latest user text',
    participants: [{ id: 'rose', name: 'Rose', present: true }],
    relevantMemories: [],
    candidateText: 'candidate text',
};

const upstreamBody = () => ({
    model: JEV_MODEL,
    answers: {
        request_mismatch: { type: 'noul', noul: 0.01 },
        identity_conflict: { type: 'noul', noul: 0.01 },
        speaker_ownership_violation: { type: 'noul', noul: 0.02 },
        continuity_violation: { type: 'noul', noul: 0.03 },
        reality_layer_violation: { type: 'noul', noul: 0.04 },
        wardrobe_conflict: { type: 'noul', noul: 0.05 },
        state_conflict: { type: 'noul', noul: 0.06 },
        replayed_beat: { type: 'noul', noul: 0.07 },
        persona_voice_violation: { type: 'noul', noul: 0.08 },
        third_party_speech_violation: { type: 'noul', noul: 0.09 },
        user_agency_violation: { type: 'noul', noul: 0.1 },
        incomplete_ending: { type: 'noul', noul: 0.11 },
        group_narration_violation: { type: 'noul', noul: 0.12 },
        other_defect: { type: 'noul', noul: 0.13 },
    },
    usage: { input_tokens: 12, output_tokens: 3, cost: 0.00001 },
});

const success = (body: unknown) => ({ statusCode: 200, body: JSON.stringify(body) });

test('Node HTTPS transport sends one exact POST request and normalizes the successful response', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200 });
    const request = Object.assign(new EventEmitter(), {
        end: (body: string) => queueMicrotask(() => {
            responseCallback?.(response);
            queueMicrotask(() => {
                response.emit('data', JSON.stringify(upstreamBody()));
                response.emit('end');
            });
        }),
        destroy: () => undefined,
    });
    let responseCallback: ((response: typeof response) => void) | undefined;
    let receivedUrl: string | undefined;
    let receivedOptions: { method?: string; headers?: Record<string, string | number> } | undefined;
    const requestBody = JSON.stringify({ model: JEV_MODEL, state, questions: JEV_QUESTIONS });
    const upstream = await requestOpenRouterViaHttps({
        apiKey: 'server-secret',
        requestBody,
        requestImpl: (url: string, options: typeof receivedOptions, callback: typeof responseCallback) => {
            receivedUrl = url;
            receivedOptions = options;
            responseCallback = callback;
            return request;
        },
    });

    const target = new URL(String(receivedUrl));
    assert.equal(target.hostname, 'openrouter.ai');
    assert.equal(target.pathname, '/api/alpha/decisions');
    assert.equal(receivedOptions?.method, 'POST');
    assert.equal(receivedOptions?.headers?.Authorization, 'Bearer server-secret');
    assert.equal(receivedOptions?.headers?.['Content-Type'], 'application/json');
    assert.equal(receivedOptions?.headers?.['Content-Length'], Buffer.byteLength(requestBody));
    assert.deepEqual(JSON.parse(requestBody), { model: JEV_MODEL, state, questions: JEV_QUESTIONS });
    assert.equal(upstream.statusCode, 200);
    assert.equal(JSON.parse(String(upstream.body)).model, JEV_MODEL);
    assert.equal(JSON.stringify(upstream).includes('server-secret'), false);
});

test('Node HTTPS transport drains non-2xx responses without reading the body', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 429, resumed: false, resume() { this.resumed = true; } });
    const request = Object.assign(new EventEmitter(), { end: () => queueMicrotask(() => responseCallback?.(response)), destroy: () => undefined });
    let responseCallback: ((response: typeof response) => void) | undefined;
    const upstream = await requestOpenRouterViaHttps({
        apiKey: 'server-secret', requestBody: '{}',
        requestImpl: (_url: string, _options: unknown, callback: typeof responseCallback) => { responseCallback = callback; return request; },
    });
    assert.deepEqual(upstream, { statusCode: 429 });
    assert.equal(response.resumed, true);
    assert.equal(response.listenerCount('data'), 0);
});

test('Node HTTPS transport enforces the response-body cap without retaining oversized text', async () => {
    const response = Object.assign(new EventEmitter(), { statusCode: 200, destroyed: false, destroy() { this.destroyed = true; } });
    const request = Object.assign(new EventEmitter(), {
        end: () => queueMicrotask(() => {
            responseCallback?.(response);
            queueMicrotask(() => response.emit('data', Buffer.alloc(MAX_DECISIONS_RESPONSE_BYTES + 1, 'x')));
        }),
        destroy: () => undefined,
    });
    let responseCallback: ((response: typeof response) => void) | undefined;
    const upstream = await requestOpenRouterViaHttps({
        apiKey: 'server-secret', requestBody: '{}',
        requestImpl: (_url: string, _options: unknown, callback: typeof responseCallback) => { responseCallback = callback; return request; },
    });
    assert.deepEqual(upstream, { statusCode: 200, bodyTooLarge: true });
    assert.equal(response.destroyed, true);
    assert.equal(JSON.stringify(upstream).includes('x'), false);
});

test('Node HTTPS transport uses the hard 2500ms timeout once and destroys its request', async () => {
    const request = Object.assign(new EventEmitter(), { end: () => undefined, destroyed: false, destroy() { this.destroyed = true; } });
    let timeoutCallback: (() => void) | undefined;
    let timeoutMs: number | undefined;
    const pending = requestOpenRouterViaHttps({
        apiKey: 'server-secret', requestBody: '{}',
        requestImpl: () => request,
        setTimeoutImpl: (callback: () => void, duration: number) => { timeoutCallback = callback; timeoutMs = duration; return 1 as unknown as ReturnType<typeof setTimeout>; },
        clearTimeoutImpl: () => undefined,
    });
    timeoutCallback?.();
    await assert.rejects(pending, error => error instanceof Error && error.name === 'AbortError');
    assert.equal(timeoutMs, 2_500);
    assert.equal(request.destroyed, true);
});

test('server sends one fixed Decisions request with server-only auth and all fixed questions', async () => {
    const calls: Array<{ apiKey: string; requestBody: string; timeoutMs: number }> = [];
    const response = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        transportImpl: async request => {
            calls.push(request);
            return success(upstreamBody());
        },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.apiKey, 'server-secret');
    const body = JSON.parse(String(calls[0]?.requestBody));
    assert.deepEqual(Object.keys(body).sort(), ['model', 'questions', 'state']);
    assert.equal(body.model, JEV_MODEL);
    assert.deepEqual(body.state, state);
    assert.deepEqual(Object.keys(body.questions).sort(), Object.keys(JEV_QUESTIONS).sort());
    assert.equal(Object.values(body.questions).filter((question: any) => question.type === 'noul').length, 14);
    assert.equal('route' in body.questions, false);
    assert.equal(response.status, 'ok');
    assert.equal(response.model, JEV_MODEL);
    assert.equal(JSON.stringify(response).includes('server-secret'), false);
    assert.equal(JSON.stringify(response).includes(state.candidateText), false);
});

test('alternate questions require the explicit calibration-only option while the default stays frozen', async () => {
    const bodies: unknown[] = [];
    const transportImpl = async ({ requestBody }: { requestBody: string }) => {
        bodies.push(JSON.parse(requestBody));
        return success(upstreamBody());
    };
    await runOpenRouterDecision(state, { env: { OPENROUTER_API: 'server-secret' }, transportImpl, calibrationQuestions: JEV_EXPERIMENTAL_QUESTIONS_V4 });
    await runOpenRouterDecision(state, { env: { OPENROUTER_API: 'server-secret' }, transportImpl, calibrationQuestions: JEV_EXPERIMENTAL_QUESTIONS_V4, allowCalibrationQuestions: true });
    assert.deepEqual((bodies[0] as { questions: unknown }).questions, JEV_QUESTIONS);
    assert.deepEqual((bodies[1] as { questions: unknown }).questions, JEV_EXPERIMENTAL_QUESTIONS_V4);
});

test('wardrobe production shadow set changes exactly one frozen proposition and matches the calibrated V4 wording', async () => {
    const changed = Object.keys(JEV_QUESTIONS).filter(key => (
        JEV_QUESTIONS[key as keyof typeof JEV_QUESTIONS].instructions
        !== JEV_WARDROBE_SHADOW_QUESTIONS[key as keyof typeof JEV_WARDROBE_SHADOW_QUESTIONS].instructions
    ));
    assert.deepEqual(changed, ['wardrobe_conflict']);
    assert.equal(
        JEV_WARDROBE_SHADOW_QUESTIONS.wardrobe_conflict.instructions,
        JEV_EXPERIMENTAL_QUESTIONS_V4.wardrobe_conflict.instructions,
    );

    let body: any;
    const response = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        useWardrobeShadowQuestions: true,
        transportImpl: async ({ requestBody }) => {
            body = JSON.parse(requestBody);
            return success(upstreamBody());
        },
    });
    assert.equal(response.status, 'ok');
    assert.deepEqual(body.questions, JEV_WARDROBE_SHADOW_QUESTIONS);
});

test('Group gate production shadow set changes only the repurposed narration slot and keeps V2 calibration wording', async () => {
    const changed = Object.keys(JEV_QUESTIONS).filter(key => (
        JEV_QUESTIONS[key as keyof typeof JEV_QUESTIONS].instructions
        !== JEV_GROUP_GATE_SHADOW_QUESTIONS[key as keyof typeof JEV_GROUP_GATE_SHADOW_QUESTIONS].instructions
    ));
    assert.deepEqual(changed, ['group_narration_violation']);
    assert.match(JEV_GROUP_GATE_SHADOW_QUESTIONS.group_narration_violation.instructions, /revision REQUIRED/i);
    assert.match(JEV_GROUP_GATE_SHADOW_QUESTIONS.group_narration_violation.instructions, /candidate can be KEPT/i);

    let body: any;
    const response = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        useGroupGateShadowQuestions: true,
        transportImpl: async ({ requestBody }) => {
            body = JSON.parse(requestBody);
            return success(upstreamBody());
        },
    });
    assert.equal(response.status, 'ok');
    assert.deepEqual(body.questions, JEV_GROUP_GATE_SHADOW_QUESTIONS);
});

test('Jev V3 questions are fourteen short proposition-only NOULs with no route decision', () => {
    const semanticQuestionKeys = Object.keys(JEV_QUESTIONS);
    const semanticCategories = semanticQuestionKeys.map(key => ({
        request_mismatch: 'request_mismatch', identity_conflict: 'identity', speaker_ownership_violation: 'speaker_ownership',
        continuity_violation: 'continuity', reality_layer_violation: 'reality_layer', wardrobe_conflict: 'wardrobe',
        state_conflict: 'state', replayed_beat: 'replayed_beat', persona_voice_violation: 'persona_voice',
        third_party_speech_violation: 'third_party_speech', user_agency_violation: 'user_agency',
        incomplete_ending: 'incomplete_ending', group_narration_violation: 'group_narration', other_defect: 'other',
    }[key])).sort();
    assert.deepEqual(semanticCategories, [...STRICT_REVIEW_ISSUE_CODES].sort());
    assert.equal('memory_conflict' in JEV_QUESTIONS, false);
    assert.equal(Object.keys(JEV_QUESTIONS).length, 14);
    assert.equal(Object.values(JEV_QUESTIONS).every(question => question.type === 'noul'), true);
    for (const key of ['group_narration_violation', 'persona_voice_violation', 'replayed_beat', 'request_mismatch', 'incomplete_ending']) assert.ok(key in JEV_QUESTIONS);
    assert.equal('route' in JEV_QUESTIONS, false);
    assert.match(JEV_QUESTIONS.group_narration_violation.instructions, /BOTH conditions/i);
    assert.match(JEV_QUESTIONS.group_narration_violation.instructions, /state\.mode === 'group'/i);
    assert.match(JEV_QUESTIONS.group_narration_violation.instructions, /first-person narration.*outside labelled character dialogue/i);
    assert.doesNotMatch(JEV_QUESTIONS.group_narration_violation.instructions, /score near zero/i);
    for (const question of Object.values(JEV_QUESTIONS)) {
        assert.ok(question.instructions.length <= 240);
        assert.doesNotMatch(question.instructions, /High only if|score low|prefer|missing evidence should|evaluate whether/i);
    }
});

test('server rejects malformed state, oversize state, missing env, and non-allowlisted models without upstream calls', async () => {
    let calls = 0;
    const transportImpl = async () => { calls += 1; return success(upstreamBody()); };
    assert.deepEqual(await runOpenRouterDecision({ ...state, model: 'attacker-model' }, { env: { OPENROUTER_API: 'secret' }, transportImpl }), {
        status: 'unavailable', reasonCode: 'INVALID_STATE',
    });
    assert.deepEqual(await runOpenRouterDecision({ ...state, candidateText: 'x'.repeat(50_000) }, { env: { OPENROUTER_API: 'secret' }, transportImpl }), {
        status: 'unavailable', reasonCode: 'OVERSIZE',
    });
    assert.deepEqual(await runOpenRouterDecision(state, { env: {}, transportImpl }), {
        status: 'unavailable', reasonCode: 'MISSING_CREDENTIALS',
    });
    assert.deepEqual(await runOpenRouterDecision(state, { env: { OPENROUTER_API: 'secret', OPENROUTER_MODEL: 'other/model' }, transportImpl }), {
        status: 'unavailable', reasonCode: 'MODEL_NOT_ALLOWED',
    });
    assert.equal(calls, 0);
});

test('server accepts only the V3 ReviewState envelope fields and valid explicit mode metadata', async () => {
    let calls = 0;
    const transportImpl = async () => { calls += 1; return success(upstreamBody()); };
    const validV3 = {
        ...state,
        mode: 'group',
        ccMode: false,
        personaEvidence: 'bounded persona evidence',
        recentHistoryText: 'ASSISTANT:\ncompleted turn',
    };
    assert.equal((await runOpenRouterDecision(validV3, { env: { OPENROUTER_API: 'secret' }, transportImpl })).status, 'ok');
    for (const invalid of [
        { ...validV3, mode: 'assistant' },
        { ...validV3, ccMode: 'false' },
        { ...validV3, personaEvidence: ['not text'] },
        { ...validV3, authoritativeContext: 'legacy context' },
        { ...validV3, recentHistoryText: { not: 'text' } },
        { ...validV3, extraBrowserField: true },
    ]) {
        assert.deepEqual(await runOpenRouterDecision(invalid, { env: { OPENROUTER_API: 'secret' }, transportImpl }), {
            status: 'unavailable', reasonCode: 'INVALID_STATE',
        });
    }
    assert.equal(calls, 1);
});

test('server normalizes malformed upstream responses without echoing state', async () => {
    const response = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API_KEY: 'compat-secret' },
        transportImpl: async () => success({ model: JEV_MODEL, answers: {} }),
    });
    assert.deepEqual(response, { status: 'unavailable', reasonCode: 'MALFORMED_RESPONSE' });
    assert.equal(JSON.stringify(response).includes('compat-secret'), false);
    assert.equal(JSON.stringify(response).includes(state.latestUserText), false);
});

test('server rejects malformed or oversized successful HTTPS responses without exposing raw text', async () => {
    const malformed = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        transportImpl: async () => ({ statusCode: 200, body: 'private malformed upstream text' }),
    });
    const oversized = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        transportImpl: async () => ({ statusCode: 200, bodyTooLarge: true, body: 'private oversized upstream text' }),
    });
    assert.deepEqual(malformed, { status: 'unavailable', reasonCode: 'MALFORMED_RESPONSE' });
    assert.deepEqual(oversized, { status: 'unavailable', reasonCode: 'MALFORMED_RESPONSE' });
    assert.equal(JSON.stringify([malformed, oversized]).includes('private'), false);
    assert.equal(MAX_DECISIONS_RESPONSE_BYTES, 256 * 1024);
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
            transportImpl: async () => ({ statusCode: status, get body() { bodyRead = true; return 'private upstream body'; } }),
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
        transportImpl: async () => { calls += 1; throw networkError; },
    });
    const timeoutFailure = await runOpenRouterDecision(state, {
        env: { OPENROUTER_API: 'server-secret' },
        transportImpl: async () => { calls += 1; throw Object.assign(new Error('private timeout detail'), { name: 'AbortError' }); },
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

test('server returns only safe network codes for HTTPS transport failures', async () => {
    for (const code of ['ECONNRESET', 'ENOTFOUND', 'PRIVATE_NETWORK_CODE']) {
        const error = Object.assign(new Error('private HTTPS transport error'), { code });
        error.stack = 'private HTTPS transport stack';
        const response = await runOpenRouterDecision(state, {
            env: { OPENROUTER_API: 'server-secret' },
            transportImpl: async () => { throw error; },
        });
        assert.deepEqual(response, {
            status: 'unavailable',
            reasonCode: 'UPSTREAM_NETWORK_ERROR',
            networkCode: code === 'PRIVATE_NETWORK_CODE' ? 'NETWORK_UNKNOWN' : code,
        });
        const serialized = JSON.stringify(response);
        assert.equal(serialized.includes(error.message), false);
        assert.equal(serialized.includes(error.stack), false);
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

test('authenticated endpoint rejects arbitrary browser model and question controls', async () => {
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
        await handler({ method: 'POST', headers: { cookie: `aigf4_gate=${payload}.${signature}` }, body: { state, model: 'attacker-model', calibrationQuestions: JEV_EXPERIMENTAL_QUESTIONS_V4 } }, res);
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.body, { status: 'unavailable', reasonCode: 'INVALID_REQUEST' });
    } finally {
        if (originalSecret === undefined) delete process.env.APP_SESSION_SECRET;
        else process.env.APP_SESSION_SECRET = originalSecret;
    }
});

test('request parser allows only production and the two fixed shadow profiles', () => {
    assert.deepEqual(parseDecisionRequest({ state }), { state, profile: 'production' });
    assert.deepEqual(parseDecisionRequest({ state, profile: 'wardrobe-v4' }), { state, profile: 'wardrobe-v4' });
    assert.deepEqual(parseDecisionRequest({ state, profile: 'group-gate-v2' }), { state, profile: 'group-gate-v2' });
    for (const invalid of [
        { state, profile: 'group-v4' },
        { state, profile: 'group-gate-v1' },
        { state, profile: 'wardrobe-v4', model: 'attacker-model' },
        { state, profile: 'group-gate-v2', questions: JEV_GROUP_GATE_SHADOW_QUESTIONS },
        { state, questions: JEV_EXPERIMENTAL_QUESTIONS_V4 },
        { profile: 'wardrobe-v4' },
        { profile: 'group-gate-v2' },
    ]) assert.equal(parseDecisionRequest(invalid), null);
});
