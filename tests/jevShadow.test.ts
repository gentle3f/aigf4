import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    clearJevShadowRecordsForTest,
    getJevShadowRecordsForTest,
    startJevShadowEvaluation,
} from '../engine/review/jevShadow.js';

const state = { latestUserText: 'private user text', participants: [], relevantMemories: [], candidateText: 'private candidate text' };
const ok = (choice: 'clean' | 'full_review') => ({
    status: 'ok' as const,
    model: 'typesafe/jev-1.13',
    route: { choice, probabilities: { clean: choice === 'clean' ? 0.9 : 0.1, full_review: choice === 'full_review' ? 0.9 : 0.1 }, confidence: 0.9 },
    signals: {
        identityConflict: 0, speakerOwnershipViolation: 0, realityLayerViolation: 0, memoryConflict: 0,
        stateConflict: 0, userAgencyViolation: 0, continuityViolation: 0,
    },
});
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('shadow comparison records are metadata-only and use calibration semantics', async () => {
    clearJevShadowRecordsForTest();
    const clean = startJevShadowEvaluation({ requestId: 'one', mode: 'single', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ok('clean') });
    clean.recordGemmaDecision('keep');
    const falseNegative = startJevShadowEvaluation({ requestId: 'two', mode: 'group', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ok('clean') });
    falseNegative.recordGemmaDecision('revise');
    const fullReview = startJevShadowEvaluation({ requestId: 'three', mode: 'single', ccMode: true, state, signal: new AbortController().signal, evaluate: async () => ok('full_review') });
    fullReview.recordGemmaDecision('keep');
    const unavailable = startJevShadowEvaluation({ requestId: 'four', mode: 'single', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ({ status: 'unavailable' as const, reasonCode: 'UPSTREAM_NETWORK_ERROR', networkCode: 'ENOTFOUND' as const }) });
    unavailable.recordGemmaDecision('unavailable');
    await flush();
    const records = getJevShadowRecordsForTest();
    assert.deepEqual(records.map(record => [record.comparison, record.falseNegativeCandidate]), [
        ['agree', false], ['disagree', true], ['disagree', false], ['unknown', false],
    ]);
    assert.equal(JSON.stringify(records).includes('private user text'), false);
    assert.equal(JSON.stringify(records).includes('private candidate text'), false);
    assert.equal(records.at(-1)?.networkCode, 'ENOTFOUND');
});

test('pending or failed shadow never blocks the existing Gemma critical path', async () => {
    clearJevShadowRecordsForTest();
    let resolveJev: ((value: ReturnType<typeof ok>) => void) | undefined;
    const tracker = startJevShadowEvaluation({
        requestId: 'pending', mode: 'single', ccMode: false, state, signal: new AbortController().signal,
        evaluate: () => new Promise(resolve => { resolveJev = resolve; }),
    });
    const gemmaDecision = await Promise.resolve('keep' as const);
    tracker.recordGemmaDecision(gemmaDecision);
    assert.equal(gemmaDecision, 'keep');
    assert.deepEqual(getJevShadowRecordsForTest(), []);
    resolveJev?.(ok('clean'));
    await flush();
    assert.equal(getJevShadowRecordsForTest()[0]?.gemmaDecision, 'keep');

    startJevShadowEvaluation({
        requestId: 'failure', mode: 'single', ccMode: false, state, signal: new AbortController().signal,
        evaluate: async () => { throw new Error('private network error'); },
    });
    await flush();
    assert.equal(getJevShadowRecordsForTest().at(-1)?.status, 'unavailable');
});

test('clean, full-review, and unavailable shadow outcomes all leave Gemma runnable and the collector bounded', async () => {
    clearJevShadowRecordsForTest();
    let gemmaRuns = 0;
    for (const result of [ok('clean'), ok('full_review'), { status: 'unavailable' as const, reasonCode: 'NETWORK_FAILURE' }]) {
        const tracker = startJevShadowEvaluation({
            requestId: `route-${gemmaRuns}`, mode: 'single', ccMode: false, state, signal: new AbortController().signal,
            evaluate: async () => result,
        });
        gemmaRuns += 1;
        tracker.recordGemmaDecision('keep');
    }
    await flush();
    assert.equal(gemmaRuns, 3);

    for (let index = 0; index < 51; index += 1) {
        startJevShadowEvaluation({
            requestId: `bounded-${index}`, mode: 'single', ccMode: false, state, signal: new AbortController().signal,
            evaluate: async () => ok('clean'),
        });
    }
    await flush();
    const records = getJevShadowRecordsForTest();
    assert.equal(records.length, 50);
    assert.equal(records[0]?.requestId, 'bounded-1');
});

test('strict-review source starts shadow before unchanged Gemma request for single, Cc, and group paths', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const review = source.slice(source.indexOf('const strictReviewSingleReply'), source.indexOf('const runCharacterChatGeneration'));
    assert.match(review, /const shadow = startStrictReviewShadow\(request, latestUserMessage, candidate, 'single'\);\s*let decision;\s*try \{\s*decision = await requestStrictReviewDecision\(/s);
    assert.match(review, /const shadow = startStrictReviewShadow\(request, latestUserMessage, serializedCandidate, 'group', candidate\.scene\);\s*let decision;\s*try \{\s*decision = await requestStrictReviewDecision\(/s);
    assert.equal((review.match(/startStrictReviewShadow\(/g) || []).length, 2);
    assert.match(source, /ccMode: request\.personaKey === 'cc'/);
});
