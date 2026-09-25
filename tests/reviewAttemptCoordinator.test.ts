import assert from 'node:assert/strict';
import test from 'node:test';
import { runPreparedStrictReviewAttempt } from '../engine/review/reviewAttemptCoordinator.js';
import type {
    PreparedStrictReviewAttemptInput,
    StrictReviewAttemptCoordinatorDependencies,
} from '../engine/review/reviewAttemptCoordinator.js';
import type { StrictReviewAttemptTrace } from '../engine/observability/generationTrace.js';
import type { VeniceJsonSchemaResponseFormat, VeniceMessage, VeniceTextGenerationOptions, VeniceTextGenerationResult } from '../venice.js';

const responseFormat: VeniceJsonSchemaResponseFormat = {
    type: 'json_schema',
    json_schema: { name: 'review', strict: true, schema: {} },
};
const signal = new AbortController().signal;
const input: PreparedStrictReviewAttemptInput = {
    model: 'requested-model',
    attemptIndex: 2,
    isFallback: true,
    editorPrompt: 'editor',
    authoritativePrompt: 'authority',
    latestUserMessage: 'latest',
    candidateResponse: 'candidate',
    promptCacheKey: 'cache-key',
    signal,
    responseFormat,
};

const result = (text: string, overrides: Partial<VeniceTextGenerationResult> = {}): VeniceTextGenerationResult => ({
    model: 'returned-model',
    text,
    promptTokens: 101,
    completionTokens: 17,
    finishReason: 'stop',
    ...overrides,
});

const createFixture = (
    overrides: Partial<StrictReviewAttemptCoordinatorDependencies> = {},
) => {
    const { requestText: requestTextOverride, ...dependencyOverrides } = overrides;
    const history: VeniceMessage[] = [{ role: 'user', content: 'history' }];
    const records: StrictReviewAttemptTrace[] = [];
    const requestOptions: VeniceTextGenerationOptions[] = [];
    const events: string[] = [];
    let historyCalls = 0;
    let now = 0;
    const dependencies: StrictReviewAttemptCoordinatorDependencies = {
        now: () => now,
        getReviewHistory: () => {
            historyCalls += 1;
            events.push('history');
            return history;
        },
        requestText: async options => {
            requestOptions.push(options);
            events.push('request');
            now = 13;
            if (requestTextOverride) return requestTextOverride(options);
            return result('<keep/>');
        },
        recordAttempt: attempt => records.push(attempt),
        classifyFailure: () => ({ outcome: 'error', errorCode: 'UNKNOWN' }),
        shouldRethrow: () => false,
        onPrepare: () => events.push('prepare'),
        onRequestStarted: () => events.push('start'),
        onRequestPrepared: () => events.push('prepared'),
        onResponse: () => events.push('response'),
        onParseTiming: () => events.push('parse'),
        onSuccess: () => events.push('success'),
        onFailure: () => events.push('failure'),
        ...dependencyOverrides,
    };
    return { dependencies, events, history, records, requestOptions, getHistoryCalls: () => historyCalls };
};

test('prepares one keep request with exact builder identity, transport settings, and hook order', async () => {
    const fixture = createFixture();

    const decision = await runPreparedStrictReviewAttempt(input, fixture.dependencies);

    assert.deepEqual(decision, { decision: 'keep', issues: [], revisedResponse: '' });
    assert.equal(fixture.getHistoryCalls(), 1);
    assert.equal(fixture.requestOptions.length, 1);
    assert.equal(fixture.requestOptions[0]?.messages[2], fixture.history[0]);
    assert.deepEqual(fixture.requestOptions[0], {
        model: 'requested-model',
        messages: fixture.requestOptions[0]?.messages,
        temperature: 0.18,
        topP: 0.82,
        repetitionPenalty: 1.02,
        stop: [],
        responseFormat,
        promptCacheKey: 'cache-key',
        signal,
    });
    assert.deepEqual(fixture.events, ['prepare', 'start', 'history', 'prepared', 'request', 'response', 'parse', 'success']);
    assert.deepEqual(fixture.records, [{
        model: 'returned-model', attemptIndex: 2, latencyMs: 13,
        promptTokens: 101, completionTokens: 17, finishReason: 'stop', outcome: 'keep',
    }]);
});

test('returns revise with one request and one terminal revise trace', async () => {
    const fixture = createFixture({ requestText: async () => {
        return result('{"decision":"revise","issues":["voice"],"revised_response":"replacement"}');
    } });

    const decision = await runPreparedStrictReviewAttempt(input, fixture.dependencies);

    assert.deepEqual(decision, { decision: 'revise', issues: ['voice'], revisedResponse: 'replacement' });
    assert.equal(fixture.requestOptions.length, 1);
    assert.equal(fixture.records.length, 1);
    assert.equal(fixture.records[0]?.outcome, 'revise');
});

test('records invalid once and returns null without a second error trace', async () => {
    const fixture = createFixture({ requestText: async () => {
        return result('invalid');
    } });

    assert.equal(await runPreparedStrictReviewAttempt(input, fixture.dependencies), null);
    assert.equal(fixture.requestOptions.length, 1);
    assert.deepEqual(fixture.records.map(record => [record.outcome, record.errorCode]), [
        ['invalid', 'INVALID_RESPONSE'],
    ]);
});

test('records one non-fatal transport error and does not make a second request', async () => {
    const transportError = new Error('transport');
    const fixture = createFixture({ requestText: async () => {
        throw transportError;
    } });

    assert.equal(await runPreparedStrictReviewAttempt(input, fixture.dependencies), null);
    assert.equal(fixture.requestOptions.length, 1);
    assert.deepEqual(fixture.records, [{
        model: 'requested-model', attemptIndex: 2, latencyMs: 13, outcome: 'error', errorCode: 'UNKNOWN',
    }]);
    assert.equal(fixture.events.at(-1), 'failure');
});

test('records a fatal abort once and preserves the exact error identity', async () => {
    const abort = new Error('aborted');
    const fixture = createFixture({
        requestText: async () => {
            throw abort;
        },
        classifyFailure: () => ({ outcome: 'aborted', errorCode: 'ABORTED' }),
        shouldRethrow: error => error === abort,
    });

    await assert.rejects(runPreparedStrictReviewAttempt(input, fixture.dependencies), received => received === abort);
    assert.equal(fixture.requestOptions.length, 1);
    assert.deepEqual(fixture.records, [{
        model: 'requested-model', attemptIndex: 2, latencyMs: 13, outcome: 'aborted', errorCode: 'ABORTED',
    }]);
    assert.equal(fixture.events.includes('failure'), false);
});

test('keeps preparation failures outside provider-attempt tracing', async () => {
    const preparationError = new Error('history failed');
    const fixture = createFixture({ getReviewHistory: () => { throw preparationError; } });

    assert.equal(await runPreparedStrictReviewAttempt(input, fixture.dependencies), null);
    assert.equal(fixture.requestOptions.length, 0);
    assert.deepEqual(fixture.records, []);
    assert.deepEqual(fixture.events, ['prepare', 'start', 'failure']);
});
