import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    clearJevShadowRecords,
    clearJevShadowRecordsForTest,
    getJevShadowRecords,
    getJevShadowRecordsForTest,
    startJevShadowEvaluation,
} from '../engine/review/jevShadow.js';

const state = { mode: 'single' as const, ccMode: false, latestUserText: 'private user text', participants: [], relevantMemories: [], candidateText: 'private candidate text' };
const ok = (choice: 'clean' | 'full_review') => ({
    status: 'ok' as const,
    model: 'typesafe/jev-1.13',
    route: { choice, probabilities: { clean: choice === 'clean' ? 0.9 : 0.1, full_review: choice === 'full_review' ? 0.9 : 0.1 }, confidence: 0.9 },
    signals: {
        requestMismatch: 0, identityConflict: 0, speakerOwnershipViolation: 0, continuityViolation: 0,
        realityLayerViolation: 0, wardrobeConflict: 0, stateConflict: 0, replayedBeat: 0,
        personaVoiceViolation: 0, thirdPartySpeechViolation: 0, userAgencyViolation: 0,
        incompleteEnding: 0, groupNarrationViolation: 0, otherDefect: 0,
    },
});
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('shadow comparison records are metadata-only and use calibration semantics', async () => {
    clearJevShadowRecordsForTest();
    const clean = startJevShadowEvaluation({ requestId: 'one', mode: 'single', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ok('clean') });
    clean.recordGemmaDecision('keep');
    const falseNegative = startJevShadowEvaluation({ requestId: 'two', mode: 'group', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ok('clean') });
    falseNegative.recordGemmaDecision('revise', ['identity', 'continuity']);
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
    assert.equal(records.at(-1)?.taxonomyVersion, 'v2');
    assert.equal(records.at(-1)?.reasonCode, 'UPSTREAM_NETWORK_ERROR');
    assert.deepEqual(records[1]?.gemmaIssueCodes, ['identity', 'continuity']);
    records[0]!.signals!.identityConflict = 1;
    assert.equal(getJevShadowRecords()[0]?.signals?.identityConflict, 0);
    records[1]!.gemmaIssueCodes![0] = 'other';
    assert.deepEqual(getJevShadowRecords()[1]?.gemmaIssueCodes, ['identity', 'continuity']);
});

test('Gemma reason metadata keeps only closed codes and does not retain raw review content', async () => {
    clearJevShadowRecords();
    const tracker = startJevShadowEvaluation({ requestId: 'issues', mode: 'single', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ok('clean') });
    tracker.recordGemmaDecision('revise', ['identity', 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL' as never, 'identity']);
    await flush();
    const serialized = JSON.stringify(getJevShadowRecords());
    assert.match(serialized, /identity/);
    assert.equal(serialized.includes('PRIVATE_GEMMA_RAW_ISSUE_SENTINEL'), false);
    assert.equal(serialized.includes('PRIVATE_REVISED_RESPONSE_SENTINEL'), false);
    assert.equal(serialized.includes('PRIVATE_USER_TEXT_SENTINEL'), false);
    assert.equal(serialized.includes('PRIVATE_CANDIDATE_TEXT_SENTINEL'), false);
});

test('public collector snapshot is capped, clearable, and keeps only recognized unavailable codes', async () => {
    clearJevShadowRecords();
    startJevShadowEvaluation({
        requestId: 'sanitized', mode: 'single', ccMode: false, state, signal: new AbortController().signal,
        evaluate: async () => ({ status: 'unavailable', reasonCode: 'private upstream text' } as never),
    });
    await flush();
    assert.equal(getJevShadowRecords()[0]?.reasonCode, undefined);
    assert.equal(JSON.stringify(getJevShadowRecords()).includes('private upstream text'), false);
    clearJevShadowRecords();
    assert.deepEqual(getJevShadowRecords(), []);
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
    assert.match(review, /const shadow = startStrictReviewShadow\(request, latestUserMessage, candidate, 'single', authoritativePrompt\);\s*let decision;\s*try \{\s*decision = await requestStrictReviewDecision\(/s);
    assert.match(review, /const shadow = startStrictReviewShadow\([\s\S]*serializedCandidate,[\s\S]*'group',[\s\S]*authoritativePrompt,[\s\S]*candidate\.scene,[\s\S]*\);\s*let decision;\s*try \{\s*decision = await requestStrictReviewDecision\(/s);
    assert.equal((review.match(/startStrictReviewShadow\(/g) || []).length, 2);
    assert.match(source, /ccMode: request\.personaKey === 'cc'/);
    assert.equal((review.match(/recordGemmaDecision\(decision\?\.decision \|\| 'unavailable', decision\?\.issues\)/g) || []).length, 2);
    assert.doesNotMatch(review, /gemmaIssueCodes.*applySingleStrictReview|gemmaIssueCodes.*applyGroupStrictReview/s);
    assert.doesNotMatch(review, /routeChoice.*applySingleStrictReview|signals.*applyGroupStrictReview/s);
});
