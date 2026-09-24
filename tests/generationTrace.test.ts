import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createGenerationTrace,
    finalizeGenerationTrace,
    markGenerationAttempt,
    markGenerationRoute,
    markStrictReview,
} from '../engine/observability/generationTrace.js';

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
