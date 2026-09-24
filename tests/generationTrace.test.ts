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
    markGenerationAttempt(trace, { primaryLatencyMs: 120, continuation: true });
    markGenerationAttempt(trace, { fallbackUsed: true });
    markStrictReview(trace, { ran: true, model: 'gemma-4-uncensored', decision: 'keep', latencyMs: 25 });
    finalizeGenerationTrace(trace, { totalLatencyMs: 180, committed: true });

    assert.deepEqual(trace.generation, {
        attempts: 2,
        primaryLatencyMs: 120,
        continuationCount: 1,
        fallbackUsed: true,
    });
    const serialized = JSON.stringify(trace);
    assert.doesNotMatch(serialized, /secret user prompt|private model response|system instructions/i);
    assert.equal('systemPrompt' in trace, false);
    assert.equal('responseText' in trace, false);
});

test('GenerationTrace finalization is metadata-only and can represent an aborted uncommitted turn', () => {
    const trace = createGenerationTrace('request-aborted', 'single');
    finalizeGenerationTrace(trace, { totalLatencyMs: 4, committed: false });
    assert.deepEqual(trace.final, { totalLatencyMs: 4, committed: false });
});
