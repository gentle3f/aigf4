import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    MAX_RECENT_GENERATION_TRACES,
    classifyGenerationAttemptFailure,
    classifySingleGenerationAttempt,
    classifyStrictReviewAttemptFailure,
    clearRecentGenerationTracesForTesting,
    createTracedGroupTurnDependencies,
    createTracedSingleTurnDependencies,
    createGenerationTrace,
    finalizeGenerationTrace,
    getRecentGenerationTraces,
    markGenerationAttempt,
    markGenerationRoute,
    markStrictReview,
    markStrictReviewAttempt,
    recordGenerationTrace,
} from '../engine/observability/generationTrace.js';
import { runSingleTurnAdapter } from '../engine/singleTurnAdapter.js';
import { runGroupTurnAdapter } from '../engine/groupTurnAdapter.js';
import { buildStrictReviewModelRoute, getGenerationAttemptCount } from '../chatModelSettings.js';

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

test('strict-review failures use the same closed error-code policy', () => {
    assert.deepEqual(classifyStrictReviewAttemptFailure(false, false), {
        outcome: 'error', errorCode: 'UNKNOWN',
    });
    assert.deepEqual(classifyStrictReviewAttemptFailure(false, true), {
        outcome: 'error', errorCode: 'TIMEOUT',
    });
    assert.deepEqual(classifyStrictReviewAttemptFailure(true, true), {
        outcome: 'aborted', errorCode: 'ABORTED',
    });
});

test('strict-review attempts preserve reviewer order and metadata without review content', () => {
    const trace = createGenerationTrace('review-attempts', 'single', 'conversation-a');
    markStrictReviewAttempt(trace, {
        model: 'reviewer-a', attemptIndex: 1, latencyMs: 12,
        promptTokens: 100, completionTokens: 20, finishReason: 'stop',
        outcome: 'invalid', errorCode: 'INVALID_RESPONSE',
    });
    markStrictReviewAttempt(trace, {
        model: 'reviewer-b', attemptIndex: 2, latencyMs: 9,
        promptTokens: 102, completionTokens: 18, finishReason: 'stop', outcome: 'keep',
    });
    markStrictReview(trace, {
        ran: true, model: 'reviewer-b', decision: 'keep', attempts: trace.strictReview?.attempts,
    });

    assert.deepEqual(trace.strictReview?.attempts?.map(({ attemptIndex, outcome, errorCode }) => ({
        attemptIndex, outcome, errorCode,
    })), [
        { attemptIndex: 1, outcome: 'invalid', errorCode: 'INVALID_RESPONSE' },
        { attemptIndex: 2, outcome: 'keep', errorCode: undefined },
    ]);
    assert.doesNotMatch(JSON.stringify(trace), /latest user text|candidate text|revised response|review issues|system prompt|history|memory|wardrobe|provider body|raw error/i);
});

test('group review attempts remain separate from generation attempts across terminal outcomes', () => {
    const trace = createGenerationTrace('group-review-attempts', 'group', 'room-a');
    markGenerationAttempt(trace, {
        phase: 'primary', model: 'generation-primary', routeIndex: 0, attemptIndex: 1,
        outcome: 'accepted',
    });
    markStrictReviewAttempt(trace, {
        model: 'reviewer-a', attemptIndex: 1, latencyMs: 11,
        promptTokens: 100, completionTokens: 20, finishReason: 'stop',
        outcome: 'invalid', errorCode: 'INVALID_RESPONSE',
    });
    markStrictReviewAttempt(trace, {
        model: 'reviewer-b', attemptIndex: 2, latencyMs: 8,
        outcome: 'error', errorCode: 'TIMEOUT',
    });
    markStrictReviewAttempt(trace, {
        model: 'reviewer-c', attemptIndex: 3, latencyMs: 9,
        promptTokens: 102, completionTokens: 22, finishReason: 'stop', outcome: 'revise',
    });
    markStrictReview(trace, {
        ran: true, model: 'reviewer-c', decision: 'revise', attempts: trace.strictReview?.attempts,
    });

    assert.deepEqual(trace.attempts.map(({ phase, model, outcome }) => ({ phase, model, outcome })), [
        { phase: 'primary', model: 'generation-primary', outcome: 'accepted' },
    ]);
    assert.deepEqual(trace.strictReview?.attempts?.map(({ attemptIndex, outcome, errorCode }) => ({
        attemptIndex, outcome, errorCode,
    })), [
        { attemptIndex: 1, outcome: 'invalid', errorCode: 'INVALID_RESPONSE' },
        { attemptIndex: 2, outcome: 'error', errorCode: 'TIMEOUT' },
        { attemptIndex: 3, outcome: 'revise', errorCode: undefined },
    ]);
    assert.doesNotMatch(JSON.stringify(trace), /group candidate|revised response|review issues|raw timeout/i);
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

test('production attempt cardinality remains primary plus repair, then one per fallback', () => {
    assert.equal(getGenerationAttemptCount(0), 2);
    assert.equal(getGenerationAttemptCount(1), 1);
    assert.equal(getGenerationAttemptCount(2), 1);

    const trace = createGenerationTrace('route-cardinality', 'single');
    [0, 0, 1].forEach((routeIndex, offset) => markGenerationAttempt(trace, {
        phase: classifySingleGenerationAttempt(routeIndex, routeIndex === 0 ? offset + 1 : 1),
        model: `model-${routeIndex}`,
        routeIndex,
        attemptIndex: routeIndex === 0 ? offset + 1 : 1,
        outcome: offset === 0 ? 'invalid' : 'accepted',
    }));
    assert.deepEqual(trace.attempts.map(attempt => attempt.phase), ['primary', 'repair', 'fallback']);
});

test('group attempt metadata follows the existing primary-repair-fallback route shape', () => {
    const trace = createGenerationTrace('group-route-cardinality', 'group');
    ([
        [0, 1, 'invalid'],
        [0, 2, 'invalid'],
        [1, 1, 'accepted'],
    ] as const).forEach(([routeIndex, attemptIndex, outcome]) => markGenerationAttempt(trace, {
        phase: classifySingleGenerationAttempt(routeIndex, attemptIndex),
        model: `model-${routeIndex}`,
        routeIndex,
        attemptIndex,
        latencyMs: 10,
        promptTokens: 100,
        completionTokens: 20,
        finishReason: 'stop',
        outcome,
        ...(outcome === 'invalid' ? { errorCode: 'INVALID_RESPONSE' as const } : {}),
    }));

    assert.deepEqual(trace.attempts.map(({ phase, routeIndex, attemptIndex, outcome }) => ({
        phase, routeIndex, attemptIndex, outcome,
    })), [
        { phase: 'primary', routeIndex: 0, attemptIndex: 1, outcome: 'invalid' },
        { phase: 'repair', routeIndex: 0, attemptIndex: 2, outcome: 'invalid' },
        { phase: 'fallback', routeIndex: 1, attemptIndex: 1, outcome: 'accepted' },
    ]);
    assert.equal(trace.strictReview?.attempts, undefined);
});

test('strict-review route cardinality remains normal three reviewers and Cc four reviewers', () => {
    const settings = {
        primary: 'primary', qualityFallback: 'quality', emergencyFallback: 'emergency', ccPrimary: 'cc',
    };
    assert.deepEqual(buildStrictReviewModelRoute(settings, false), ['quality', 'primary', 'emergency']);
    assert.deepEqual(buildStrictReviewModelRoute(settings, true), ['cc', 'quality', 'primary', 'emergency']);
});

test('production single-generation source records an invalid response once before its retry catch', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const singleGeneration = source.slice(
        source.indexOf('const runConversationGeneration'),
        source.indexOf('type CharacterPhotoProposalDraft'),
    );

    assert.match(singleGeneration, /let attemptRecorded = false;/);
    assert.match(singleGeneration, /outcome: 'invalid',\s*errorCode: 'INVALID_RESPONSE',[\s\S]*attemptRecorded = true;\s*throw new Error\(`Invalid reply from \$\{model\}\.`\);/);
    assert.match(singleGeneration, /if \(!attemptRecorded && requestStartedAt !== null\) \{[\s\S]*\.\.\.failure,/);
    assert.equal((singleGeneration.match(/const result = await generateChatTextWithTimeout\(/g) || []).length, 1);
});

test('production continuation source increments the trace index before each request and records each terminal path once', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const continuation = source.slice(
        source.indexOf('const continueTruncatedChatReply'),
        source.indexOf('const getRecentAssistantRepliesForPersona'),
    );
    const singleGeneration = source.slice(
        source.indexOf('const runConversationGeneration'),
        source.indexOf('type CharacterPhotoProposalDraft'),
    );

    assert.equal((continuation.match(/await generateChatTextWithTimeout\(/g) || []).length, 1);
    assert.match(continuation, /outcome: 'invalid',\s*errorCode: 'INVALID_RESPONSE',[\s\S]*return null;/);
    assert.match(continuation, /outcome: 'accepted',/);
    assert.match(continuation, /const failure = getSingleGenerationAttemptFailure\(error\);[\s\S]*\.\.\.failure,/);
    assert.match(singleGeneration, /continuationCount \+= 1;\s*const continuation = await continueTruncatedChatReply\([\s\S]*continuationCount,/);
    assert.match(singleGeneration, /continuationCount < CHAT_MAX_AUTO_CONTINUES[\s\S]*finishReason === 'length'/);
});

test('production strict-review source records one terminal attempt per reviewer request for single and group paths', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const reviewRequest = source.slice(
        source.indexOf('const requestStrictReviewDecision'),
        source.indexOf('const strictReviewSingleReply'),
    );
    const singleReview = source.slice(
        source.indexOf('const strictReviewSingleReply'),
        source.indexOf('const strictReviewGroupReply'),
    );
    const groupReview = source.slice(
        source.indexOf('const strictReviewGroupReply'),
        source.indexOf('const runCharacterChatGeneration'),
    );

    assert.equal((reviewRequest.match(/const result = await generateChatTextWithTimeout\(/g) || []).length, 1);
    assert.match(reviewRequest, /const runAttempt = async \(\{ model, attemptIndex, isFallback \}: ReviewPipelineAttemptContext\) => \{/);
    assert.match(reviewRequest, /return runReviewPipeline\(\{\s*reviewerModels,\s*runAttempt,\s*\}\);/s);
    assert.match(reviewRequest, /let attemptRecorded = false;/);
    assert.match(reviewRequest, /outcome: 'invalid',\s*errorCode: 'INVALID_RESPONSE',[\s\S]*attemptRecorded = true;\s*throw new Error\(`Invalid strict review from \$\{model\}\.`\);/);
    assert.match(reviewRequest, /if \(!attemptRecorded && requestStartedAt !== null\) \{[\s\S]*\.\.\.failure,/);
    assert.match(reviewRequest, /return null;/);
    assert.match(singleReview, /requestStrictReviewDecision\([\s\S]*trace,/);
    assert.match(groupReview, /candidate: GroupGenerationResult,\s*trace\?: GenerationTrace,/);
    assert.match(groupReview, /requestStrictReviewDecision\([\s\S]*serializedCandidate,\s*trace,/);
    assert.match(source, /import \{ runReviewPipeline \} from "\.\/engine\/review\/reviewPipeline\.js";/);
    assert.match(source, /import type \{ ReviewPipelineAttemptContext \} from "\.\/engine\/review\/reviewPipeline\.js";/);
});

test('production group generation records one terminal attempt per actual request and keeps review attempts separate', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const groupGeneration = source.slice(
        source.indexOf('const runRoomConversationGeneration'),
        source.indexOf('const getDirectlyNamedRoomMember'),
    );
    const groupReview = source.slice(
        source.indexOf('const strictReviewGroupReply'),
        source.indexOf('const runCharacterChatGeneration'),
    );

    assert.equal(getGenerationAttemptCount(0), 2);
    assert.equal(getGenerationAttemptCount(1), 1);
    assert.equal((groupGeneration.match(/result = await generateChatTextWithTimeout\(/g) || []).length, 1);
    assert.match(groupGeneration, /const attempts = getGenerationAttemptCount\(modelIndex\);/);
    assert.match(groupGeneration, /const attemptPhase = classifySingleGenerationAttempt\(modelIndex, attempt \+ 1\);/);
    assert.match(groupGeneration, /outcome: 'accepted',[\s\S]*attemptRecorded = true;[\s\S]*return parsed;/);
    assert.match(groupGeneration, /if \(!attemptRecorded && requestStartedAt !== null\) \{[\s\S]*if \(result\) \{[\s\S]*outcome: 'invalid',[\s\S]*errorCode: 'INVALID_RESPONSE',[\s\S]*attemptRecorded = true;/);
    assert.match(groupGeneration, /const failure = getGroupGenerationAttemptFailure\(error\);[\s\S]*\.\.\.failure,/);
    assert.match(groupGeneration, /if \(isAbortError\(error\)\) throw error;/);
    assert.match(groupReview, /requestStrictReviewDecision\([\s\S]*serializedCandidate,\s*trace,/);
    assert.doesNotMatch(groupGeneration, /markStrictReviewAttempt/);
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

test('broad group trace records only seam timings and returns the exact reviewed result', async () => {
    let now = 0;
    const trace = createGenerationTrace('group-success', 'group', 'room-a');
    const candidate = { text: 'private candidate', scene: { location: 'private scene' } };
    const reviewed = { text: 'private reviewed', scene: candidate.scene };
    let generated = 0;
    let reviewInput: typeof candidate | undefined;
    const result = await runGroupTurnAdapter(createTracedGroupTurnDependencies(trace, {
        generateCandidate: async () => { generated += 1; now = 13; return candidate; },
        reviewCandidate: async value => { reviewInput = value; now = 29; return reviewed; },
    }, { now: () => now, record: () => undefined }));

    assert.equal(generated, 1);
    assert.equal(reviewInput, candidate);
    assert.equal(result, reviewed);
    assert.deepEqual(trace.stages, { generationLatencyMs: 13, reviewLatencyMs: 16 });
    assert.deepEqual(trace.final, { totalLatencyMs: 29, outcome: 'accepted' });
    assert.deepEqual(trace.attempts, []);
    assert.equal(trace.strictReview, undefined);
    assert.doesNotMatch(JSON.stringify(trace), /private candidate|private reviewed|private scene|prompt|memory|wardrobe|api key|raw error/i);
});

test('broad group trace preserves generation errors and aborts without review', async () => {
    for (const [error, expectedOutcome] of [
        [new Error('generation failed'), 'error'],
        [abortError(), 'aborted'],
    ] as const) {
        let now = 0;
        const trace = createGenerationTrace(`group-generation-${expectedOutcome}`, 'group');
        let reviewed = false;
        await assert.rejects(
            runGroupTurnAdapter(createTracedGroupTurnDependencies(trace, {
                generateCandidate: async () => { now = 7; throw error; },
                reviewCandidate: async candidate => { reviewed = true; return candidate; },
            }, {
                now: () => now,
                isAbortError: received => received === error && error.name === 'AbortError',
                record: () => undefined,
            })),
            received => received === error,
        );
        assert.equal(reviewed, false);
        assert.equal(trace.stages?.generationLatencyMs, 7);
        assert.equal(trace.final?.outcome, expectedOutcome);
        assert.deepEqual(trace.attempts, []);
        assert.equal(trace.strictReview, undefined);
    }
});

test('broad group trace preserves review errors and aborts after generation timing', async () => {
    for (const [error, expectedOutcome] of [
        [new Error('review failed'), 'error'],
        [abortError(), 'aborted'],
    ] as const) {
        let now = 0;
        const trace = createGenerationTrace(`group-review-${expectedOutcome}`, 'group');
        await assert.rejects(
            runGroupTurnAdapter(createTracedGroupTurnDependencies(trace, {
                generateCandidate: async () => { now = 11; return { text: 'candidate' }; },
                reviewCandidate: async () => { now = 23; throw error; },
            }, {
                now: () => now,
                isAbortError: received => received === error && error.name === 'AbortError',
                record: () => undefined,
            })),
            received => received === error,
        );
        assert.deepEqual(trace.stages, { generationLatencyMs: 11, reviewLatencyMs: 12 });
        assert.deepEqual(trace.final, { totalLatencyMs: 23, outcome: expectedOutcome });
        assert.deepEqual(trace.attempts, []);
        assert.equal(trace.strictReview, undefined);
    }
});

test('single and group traces coexist in the shared bounded collector', () => {
    clearRecentGenerationTracesForTesting();
    const single = createGenerationTrace('single-shared', 'single', 'conversation-a');
    const group = createGenerationTrace('group-shared', 'group', 'room-a');
    finalizeGenerationTrace(single, { totalLatencyMs: 1, outcome: 'accepted' });
    finalizeGenerationTrace(group, { totalLatencyMs: 2, outcome: 'accepted' });
    recordGenerationTrace(single);
    recordGenerationTrace(group);

    assert.deepEqual(getRecentGenerationTraces().map(trace => [trace.requestId, trace.mode]), [
        ['single-shared', 'single'],
        ['group-shared', 'group'],
    ]);
    clearRecentGenerationTracesForTesting();
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
