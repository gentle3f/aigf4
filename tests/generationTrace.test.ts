import assert from 'node:assert/strict';
import test from 'node:test';
import {
    MAX_RECENT_GENERATION_TRACES,
    classifyGenerationAttemptFailure,
    classifySingleGenerationAttempt,
    clearRecentGenerationTracesForTesting,
    createTracedSingleTurnDependencies,
    createGenerationTrace,
    finalizeGenerationTrace,
    getRecentGenerationTraces,
    markGenerationAttempt,
    markGenerationRoute,
    markStrictReview,
    recordGenerationTrace,
} from '../engine/observability/generationTrace.js';
import { runSingleTurnAdapter } from '../engine/singleTurnAdapter.js';

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

test('GenerationTrace records metadata only and has no prompt or response fields', () => {
    const trace = createGenerationTrace('request-1', 'group', 'room-1');
    markGenerationRoute(trace, {
        primary: 'qwen-3-8-27b',
        fallbacks: ['gemma-4-uncensored'],
        strictReview: ['gemma-4-uncensored'],
        source: 'saved-setting',
        ccMode: false,
    });
    markGenerationAttempt(trace, {
        phase: 'primary', model: 'qwen-3-8-27b', routeIndex: 0, attemptIndex: 1,
        latencyMs: 120, promptTokens: 30, completionTokens: 40, finishReason: 'stop', outcome: 'invalid',
    });
    markGenerationAttempt(trace, {
        phase: 'fallback', model: 'gemma-4-uncensored', routeIndex: 1, attemptIndex: 1,
        latencyMs: 45, promptTokens: 31, completionTokens: 41, finishReason: 'stop', outcome: 'accepted',
    });
    markStrictReview(trace, { ran: true, model: 'gemma-4-uncensored', decision: 'keep', latencyMs: 25 });
    finalizeGenerationTrace(trace, { totalLatencyMs: 180, committed: true });

    assert.deepEqual(trace.attempts.map(attempt => ({
        phase: attempt.phase,
        model: attempt.model,
        outcome: attempt.outcome,
        latencyMs: attempt.latencyMs,
    })), [
        { phase: 'primary', model: 'qwen-3-8-27b', outcome: 'invalid', latencyMs: 120 },
        { phase: 'fallback', model: 'gemma-4-uncensored', outcome: 'accepted', latencyMs: 45 },
    ]);
    const serialized = JSON.stringify(trace);
    assert.doesNotMatch(serialized, /secret user prompt|private model response|system instructions/i);
    assert.equal('systemPrompt' in trace, false);
    assert.equal('responseText' in trace, false);
});

test('GenerationTrace finalization is metadata-only and can represent an aborted uncommitted turn', () => {
    const trace = createGenerationTrace('request-aborted', 'single');
    markGenerationAttempt(trace, {
        phase: 'primary', model: 'primary', routeIndex: 0, attemptIndex: 1,
        outcome: 'aborted', errorCode: 'ABORTED',
    });
    finalizeGenerationTrace(trace, { totalLatencyMs: 4, committed: false });
    assert.deepEqual(trace.final, { totalLatencyMs: 4, committed: false });
    assert.deepEqual(trace.attempts, [{
        phase: 'primary', model: 'primary', routeIndex: 0, attemptIndex: 1,
        outcome: 'aborted', errorCode: 'ABORTED',
    }]);
});

test('single generation attempt phases preserve the production route and retry shape', () => {
    assert.equal(classifySingleGenerationAttempt(0, 1), 'primary');
    assert.equal(classifySingleGenerationAttempt(0, 2), 'repair');
    assert.equal(classifySingleGenerationAttempt(1, 1), 'fallback');
    assert.equal(classifySingleGenerationAttempt(2, 1), 'fallback');
});

test('attempt failures use only closed sanitized error codes', () => {
    assert.deepEqual(classifyGenerationAttemptFailure(false, false), {
        outcome: 'error', errorCode: 'UNKNOWN',
    });
    assert.deepEqual(classifyGenerationAttemptFailure(false, true), {
        outcome: 'error', errorCode: 'TIMEOUT',
    });
    assert.deepEqual(classifyGenerationAttemptFailure(true, true), {
        outcome: 'aborted', errorCode: 'ABORTED',
    });
});

test('single generation attempts retain chronological metadata without private content', () => {
    const trace = createGenerationTrace('attempt-order', 'single', 'conversation-a');
    markGenerationAttempt(trace, {
        phase: 'primary', model: 'returned-primary', routeIndex: 0, attemptIndex: 1,
        latencyMs: 11, promptTokens: 101, completionTokens: 37, finishReason: 'length',
        outcome: 'invalid', errorCode: 'INVALID_RESPONSE',
    });
    markGenerationAttempt(trace, {
        phase: 'repair', model: 'returned-primary', routeIndex: 0, attemptIndex: 2,
        latencyMs: 12, promptTokens: 103, completionTokens: 39, finishReason: 'stop', outcome: 'accepted',
    });
    markGenerationAttempt(trace, {
        phase: 'continuation', model: 'returned-primary', routeIndex: 0, attemptIndex: 1,
        latencyMs: 8, promptTokens: 120, completionTokens: 18, finishReason: 'stop', outcome: 'accepted',
    });

    assert.deepEqual(trace.attempts.map(({ phase, routeIndex, attemptIndex, outcome }) => ({
        phase, routeIndex, attemptIndex, outcome,
    })), [
        { phase: 'primary', routeIndex: 0, attemptIndex: 1, outcome: 'invalid' },
        { phase: 'repair', routeIndex: 0, attemptIndex: 2, outcome: 'accepted' },
        { phase: 'continuation', routeIndex: 0, attemptIndex: 1, outcome: 'accepted' },
    ]);
    assert.doesNotMatch(JSON.stringify(trace), /user text|prompt body|candidate text|response body|memory content|wardrobe text|api key|raw error/i);
});

test('attempt recording is best-effort when an observational trace is immutable', () => {
    const trace = createGenerationTrace('immutable', 'single');
    Object.freeze(trace.attempts);
    assert.doesNotThrow(() => markGenerationAttempt(trace, {
        phase: 'primary', model: 'model', outcome: 'error', errorCode: 'TIMEOUT',
    }));
    assert.equal(trace.attempts.length, 0);
});

test('broad single-turn trace preserves generate-review return semantics and records timings', async () => {
    let now = 0;
    const trace = createGenerationTrace('single-success', 'single', 'conversation-a');
    let generated = 0;
    let reviewed = 0;
    const result = await runSingleTurnAdapter(createTracedSingleTurnDependencies(trace, {
        generateCandidate: async () => { generated += 1; now = 12; return 'candidate'; },
        reviewCandidate: async candidate => { reviewed += 1; now = 31; return `${candidate}-reviewed`; },
    }, { now: () => now, record: () => undefined }));

    assert.equal(result, 'candidate-reviewed');
    assert.equal(generated, 1);
    assert.equal(reviewed, 1);
    assert.deepEqual(trace.stages, { generationLatencyMs: 12, reviewLatencyMs: 19 });
    assert.deepEqual(trace.final, { totalLatencyMs: 31, outcome: 'accepted' });
    assert.deepEqual(trace.attempts, []);
});

test('broad single-turn trace preserves generation errors and skips review', async () => {
    const error = new Error('generation failure');
    const trace = createGenerationTrace('generation-error', 'single');
    let reviewed = false;
    await assert.rejects(
        runSingleTurnAdapter(createTracedSingleTurnDependencies(trace, {
            generateCandidate: async () => { throw error; },
            reviewCandidate: async candidate => { reviewed = true; return candidate; },
        }, { now: () => 7, record: () => undefined })),
        received => received === error,
    );
    assert.equal(reviewed, false);
    assert.equal(trace.final?.outcome, 'error');
});

test('broad single-turn trace preserves generation aborts', async () => {
    const error = abortError();
    const trace = createGenerationTrace('generation-abort', 'single');
    await assert.rejects(
        runSingleTurnAdapter(createTracedSingleTurnDependencies(trace, {
            generateCandidate: async () => { throw error; },
            reviewCandidate: async candidate => candidate,
        }, { now: () => 4, isAbortError: received => received === error, record: () => undefined })),
        received => received === error,
    );
    assert.equal(trace.final?.outcome, 'aborted');
});

test('broad single-turn trace preserves review errors after recording generation timing', async () => {
    let now = 0;
    const error = new Error('review failure');
    const trace = createGenerationTrace('review-error', 'single');
    await assert.rejects(
        runSingleTurnAdapter(createTracedSingleTurnDependencies(trace, {
            generateCandidate: async () => { now = 9; return 'candidate'; },
            reviewCandidate: async () => { now = 17; throw error; },
        }, { now: () => now, record: () => undefined })),
        received => received === error,
    );
    assert.equal(trace.stages?.generationLatencyMs, 9);
    assert.equal(trace.final?.outcome, 'error');
});

test('broad single-turn trace preserves review aborts', async () => {
    const error = abortError();
    const trace = createGenerationTrace('review-abort', 'single');
    await assert.rejects(
        runSingleTurnAdapter(createTracedSingleTurnDependencies(trace, {
            generateCandidate: async () => 'candidate',
            reviewCandidate: async () => { throw error; },
        }, { now: () => 4, isAbortError: received => received === error, record: () => undefined })),
        received => received === error,
    );
    assert.equal(trace.final?.outcome, 'aborted');
});

test('recent trace collector stays bounded and returns metadata-only defensive copies', () => {
    clearRecentGenerationTracesForTesting();
    for (let index = 0; index <= MAX_RECENT_GENERATION_TRACES; index += 1) {
        const trace = createGenerationTrace(`request-${index}`, 'single', 'conversation-a');
        trace.stages = { generationLatencyMs: index };
        finalizeGenerationTrace(trace, { totalLatencyMs: index, outcome: 'accepted' });
        recordGenerationTrace(trace);
    }
    const traces = getRecentGenerationTraces();
    assert.equal(traces.length, MAX_RECENT_GENERATION_TRACES);
    assert.equal(traces[0]?.requestId, 'request-1');
    traces[0]!.attempts.push({ phase: 'primary', model: 'mutated', outcome: 'accepted' });
    assert.equal(getRecentGenerationTraces()[0]?.attempts.length, 0);
    assert.doesNotMatch(JSON.stringify(traces), /prompt|reply|secret|memory contents|user text/i);
    clearRecentGenerationTracesForTesting();
});
