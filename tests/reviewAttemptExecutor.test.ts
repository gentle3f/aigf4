import assert from 'node:assert/strict';
import test from 'node:test';
import { runStrictReviewAttempt } from '../engine/review/reviewAttemptExecutor.js';
import type { StrictReviewDecision } from '../strictReview.js';
import type { VeniceTextGenerationResult } from '../venice.js';
import type { StrictReviewAttemptTrace } from '../engine/observability/generationTrace.js';

const context = { model: 'requested-model', attemptIndex: 2, isFallback: true };
const keep: StrictReviewDecision = { decision: 'keep', issues: [], revisedResponse: '' };
const revise: StrictReviewDecision = { decision: 'revise', issues: ['voice'], revisedResponse: 'replacement' };

const result = (overrides: Partial<VeniceTextGenerationResult> = {}): VeniceTextGenerationResult => ({
    model: 'returned-model',
    text: 'provider text',
    promptTokens: 101,
    completionTokens: 17,
    finishReason: 'stop',
    ...overrides,
});

const createDependencies = (overrides: Partial<Parameters<typeof runStrictReviewAttempt>[1]> = {}) => {
    const records: StrictReviewAttemptTrace[] = [];
    let executeCalls = 0;
    let parseCalls = 0;
    let now = 0;
    const dependencies = {
        now: () => now,
        executeRequest: async () => {
            executeCalls += 1;
            now = 13;
            return result();
        },
        parseResult: () => {
            parseCalls += 1;
            return keep;
        },
        recordAttempt: (attempt: StrictReviewAttemptTrace) => records.push(attempt),
        classifyFailure: () => ({ outcome: 'error' as const, errorCode: 'UNKNOWN' as const }),
        shouldRethrow: () => false,
        ...overrides,
    };
    return {
        dependencies,
        records,
        getExecuteCalls: () => executeCalls,
        getParseCalls: () => parseCalls,
    };
};

test('records one keep result and returns the exact parsed decision', async () => {
    const fixture = createDependencies();
    let parseTiming = 0;
    let successDecision: StrictReviewDecision | undefined;
    fixture.dependencies.onParseTiming = startedAt => { parseTiming = startedAt; };
    fixture.dependencies.onSuccess = (_result, decision) => { successDecision = decision; };

    const decision = await runStrictReviewAttempt(context, fixture.dependencies);

    assert.equal(decision, keep);
    assert.equal(successDecision, keep);
    assert.equal(fixture.getExecuteCalls(), 1);
    assert.equal(fixture.getParseCalls(), 1);
    assert.equal(parseTiming, 13);
    assert.deepEqual(fixture.records, [{
        model: 'returned-model', attemptIndex: 2, latencyMs: 13,
        promptTokens: 101, completionTokens: 17, finishReason: 'stop', outcome: 'keep',
    }]);
});

test('records revise metadata and preserves the exact parsed object', async () => {
    const fixture = createDependencies({ parseResult: () => revise });

    const decision = await runStrictReviewAttempt(context, fixture.dependencies);

    assert.equal(decision, revise);
    assert.deepEqual(fixture.records, [{
        model: 'returned-model', attemptIndex: 2, latencyMs: 13,
        promptTokens: 101, completionTokens: 17, finishReason: 'stop', outcome: 'revise',
    }]);
});

test('records an invalid result once and returns null without an error record', async () => {
    let parseCalls = 0;
    const fixture = createDependencies({ parseResult: () => {
        parseCalls += 1;
        return null;
    } });
    let failureCalls = 0;
    fixture.dependencies.onFailure = () => { failureCalls += 1; };

    const decision = await runStrictReviewAttempt(context, fixture.dependencies);

    assert.equal(decision, null);
    assert.equal(fixture.getExecuteCalls(), 1);
    assert.equal(parseCalls, 1);
    assert.equal(failureCalls, 1);
    assert.deepEqual(fixture.records, [{
        model: 'returned-model', attemptIndex: 2, latencyMs: 13,
        promptTokens: 101, completionTokens: 17, finishReason: 'stop',
        outcome: 'invalid', errorCode: 'INVALID_RESPONSE',
    }]);
});

test('records one unknown transport failure, skips parsing, and returns null', async () => {
    const transportError = new Error('transport failed');
    let executeCalls = 0;
    const fixture = createDependencies({ executeRequest: async () => {
        executeCalls += 1;
        throw transportError;
    } });
    let failureError: unknown;
    fixture.dependencies.onFailure = error => { failureError = error; };

    const decision = await runStrictReviewAttempt(context, fixture.dependencies);

    assert.equal(decision, null);
    assert.equal(executeCalls, 1);
    assert.equal(fixture.getParseCalls(), 0);
    assert.equal(failureError, transportError);
    assert.deepEqual(fixture.records, [{
        model: 'requested-model', attemptIndex: 2, latencyMs: 0, outcome: 'error', errorCode: 'UNKNOWN',
    }]);
});

test('preserves timeout classification as one terminal non-fatal attempt', async () => {
    let executeCalls = 0;
    const fixture = createDependencies({
        executeRequest: async () => {
            executeCalls += 1;
            throw new Error('timeout');
        },
        classifyFailure: () => ({ outcome: 'error', errorCode: 'TIMEOUT' }),
    });

    assert.equal(await runStrictReviewAttempt(context, fixture.dependencies), null);
    assert.equal(executeCalls, 1);
    assert.deepEqual(fixture.records, [{
        model: 'requested-model', attemptIndex: 2, latencyMs: 0, outcome: 'error', errorCode: 'TIMEOUT',
    }]);
});

test('records a fatal abort once and rethrows the exact same error object', async () => {
    const abort = new Error('aborted');
    let executeCalls = 0;
    const fixture = createDependencies({
        executeRequest: async () => {
            executeCalls += 1;
            throw abort;
        },
        classifyFailure: () => ({ outcome: 'aborted', errorCode: 'ABORTED' }),
        shouldRethrow: error => error === abort,
    });
    let failureCalls = 0;
    fixture.dependencies.onFailure = () => { failureCalls += 1; };

    await assert.rejects(
        runStrictReviewAttempt(context, fixture.dependencies),
        received => received === abort,
    );
    assert.equal(executeCalls, 1);
    assert.equal(failureCalls, 0);
    assert.deepEqual(fixture.records, [{
        model: 'requested-model', attemptIndex: 2, latencyMs: 0, outcome: 'aborted', errorCode: 'ABORTED',
    }]);
});

test('uses the requested model when provider metadata is empty', async () => {
    const fixture = createDependencies({ executeRequest: async () => result({ model: '' }) });

    await runStrictReviewAttempt(context, fixture.dependencies);

    assert.equal(fixture.records[0]?.model, 'requested-model');
});
