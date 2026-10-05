import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clearJevShadowRecords, clearJevShadowRecordsForTest, getJevShadowRecords, getJevShadowRecordsForTest, startJevShadowEvaluation } from '../engine/review/jevShadow.js';

const state = { mode: 'single' as const, ccMode: false, latestUserText: 'private user text', participants: [], relevantMemories: [], candidateText: 'private candidate text' };
const ok = () => ({ status: 'ok' as const, model: 'typesafe/jev-1.13', signals: {
    requestMismatch: 0, identityConflict: 0, speakerOwnershipViolation: 0, continuityViolation: 0,
    realityLayerViolation: 0, wardrobeConflict: 0, stateConflict: 0, replayedBeat: 0,
    personaVoiceViolation: 0, thirdPartySpeechViolation: 0, userAgencyViolation: 0,
    incompleteEnding: 0, groupNarrationViolation: 0, otherDefect: 0,
} });
const wardrobeTrialOk = () => ({
    ...ok(),
    signals: { ...ok().signals, wardrobeConflict: 0.25 },
    usage: { inputTokens: 11, outputTokens: 3, cost: 0.0001 },
});
const groupGateTrialOk = () => ({
    ...ok(),
    signals: {
        requestMismatch: 0.11,
        identityConflict: 0.12,
        speakerOwnershipViolation: 0.13,
        continuityViolation: 0.14,
        realityLayerViolation: 0.15,
        wardrobeConflict: 0.16,
        stateConflict: 0.17,
        replayedBeat: 0.18,
        personaVoiceViolation: 0.19,
        thirdPartySpeechViolation: 0.2,
        userAgencyViolation: 0.21,
        incompleteEnding: 0.22,
        groupNarrationViolation: 0.91,
        otherDefect: 0.23,
    },
    usage: { inputTokens: 13, outputTokens: 3, cost: 0.00011 },
});
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

test('V3 records signals-only metadata and never stores private review state or a route', async () => {
    clearJevShadowRecordsForTest();
    let singleGroupGateCalls = 0;
    const single = startJevShadowEvaluation({ requestId: 'one', mode: 'single', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ok(), evaluateWardrobeTrial: async () => wardrobeTrialOk(), evaluateGroupGateTrial: async () => { singleGroupGateCalls += 1; return groupGateTrialOk(); } });
    single.recordGemmaDecision('revise', ['identity', 'group_narration']);
    let groupProductionCalls = 0;
    let groupGateCalls = 0;
    let groupWardrobeCalls = 0;
    const group = startJevShadowEvaluation({
        requestId: 'two',
        mode: 'group',
        ccMode: false,
        deterministicGroupNarrationViolation: true,
        state,
        signal: new AbortController().signal,
        evaluate: async () => { groupProductionCalls += 1; return ok(); },
        evaluateWardrobeTrial: async () => { groupWardrobeCalls += 1; return wardrobeTrialOk(); },
        evaluateGroupGateTrial: async () => { groupGateCalls += 1; return groupGateTrialOk(); },
    });
    group.recordGemmaDecision('revise', ['identity', 'group_narration']);
    await flush();
    const records = getJevShadowRecordsForTest();
    assert.equal(records[0]?.taxonomyVersion, 'v3');
    assert.equal('routeChoice' in records[0]!, false);
    assert.equal('comparison' in records[0]!, false);
    assert.deepEqual(records[0]?.gemmaIssueCodes, ['identity', 'group_narration']);
    assert.deepEqual(records[0]?.gemmaComparableIssueCodes, ['identity']);
    assert.deepEqual(records[0]?.gemmaIssueAnomalies, ['group_narration']);
    assert.deepEqual(records[1]?.gemmaComparableIssueCodes, ['identity', 'group_narration']);
    assert.deepEqual(records[1]?.gemmaIssueAnomalies, []);
    assert.equal(records[0]?.deterministicGroupNarrationViolation, undefined);
    assert.equal(records[1]?.calibrationCohort, 'group-deterministic-v1');
    assert.equal(records[1]?.deterministicGroupNarrationViolation, true);
    assert.equal(singleGroupGateCalls, 0);
    assert.equal(groupProductionCalls, 0);
    assert.equal(groupGateCalls, 1);
    assert.equal(groupWardrobeCalls, 1);
    assert.equal(records[0]?.groupGateTrial, undefined);
    assert.equal(records[1]?.signals, undefined);
    assert.equal(records[1]?.usageInputTokens, undefined);
    assert.equal(records[1]?.groupGateTrial?.profile, 'group-gate-v2');
    assert.equal(records[1]?.groupGateTrial?.requiresRevision, 0.91);
    assert.equal(records[1]?.groupGateTrial?.semanticSignals?.identityConflict, 0.12);
    assert.equal(records[1]?.groupGateTrial?.semanticSignals?.otherDefect, 0.23);
    assert.equal(records[1]?.groupGateTrial?.usageInputTokens, 13);
    assert.equal(JSON.stringify(records).includes('private user text'), false);
    assert.equal(JSON.stringify(records).includes('private candidate text'), false);
    assert.equal(records[0]?.wardrobeTrial?.wardrobeConflict, 0.25);
    assert.equal(records[0]?.wardrobeTrial?.usageInputTokens, 11);
    records[0]!.signals!.identityConflict = 1;
    records[0]!.wardrobeTrial!.wardrobeConflict = 1;
    records[1]!.groupGateTrial!.requiresRevision = 0;
    records[1]!.groupGateTrial!.semanticSignals!.identityConflict = 1;
    assert.equal(getJevShadowRecords()[0]?.signals?.identityConflict, 0);
    assert.equal(getJevShadowRecords()[0]?.wardrobeTrial?.wardrobeConflict, 0.25);
    assert.equal(getJevShadowRecords()[1]?.groupGateTrial?.requiresRevision, 0.91);
    assert.equal(getJevShadowRecords()[1]?.groupGateTrial?.semanticSignals?.identityConflict, 0.12);
});

test('Gemma issue metadata is closed, anomalous labels have zero authority, and raw content is never retained', async () => {
    clearJevShadowRecords();
    const tracker = startJevShadowEvaluation({ requestId: 'issues', mode: 'single', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ok(), evaluateWardrobeTrial: async () => wardrobeTrialOk() });
    tracker.recordGemmaDecision('revise', ['identity', 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL' as never, 'identity']);
    await flush();
    const serialized = JSON.stringify(getJevShadowRecords());
    assert.match(serialized, /identity/);
    assert.equal(serialized.includes('PRIVATE_GEMMA_RAW_ISSUE_SENTINEL'), false);
    assert.equal(serialized.includes('PRIVATE_USER_TEXT_SENTINEL'), false);
});

test('pending or failed shadow never blocks Gemma and collector remains bounded', async () => {
    clearJevShadowRecordsForTest();
    let resolveJev: ((value: ReturnType<typeof ok>) => void) | undefined;
    const tracker = startJevShadowEvaluation({ requestId: 'pending', mode: 'single', ccMode: false, state, signal: new AbortController().signal, evaluate: () => new Promise(resolve => { resolveJev = resolve; }), evaluateWardrobeTrial: async () => wardrobeTrialOk() });
    tracker.recordGemmaDecision('keep');
    assert.deepEqual(getJevShadowRecordsForTest(), []);
    resolveJev?.(ok()); await flush();
    assert.equal(getJevShadowRecordsForTest()[0]?.gemmaDecision, 'keep');
    for (let index = 0; index < 201; index += 1) startJevShadowEvaluation({ requestId: `bounded-${index}`, mode: 'single', ccMode: false, state, signal: new AbortController().signal, evaluate: async () => ok(), evaluateWardrobeTrial: async () => wardrobeTrialOk() });
    await flush();
    assert.equal(getJevShadowRecordsForTest().length, 200);
});

test('wardrobe wording trial failure is observational and never blocks the production shadow or Gemma metadata', async () => {
    clearJevShadowRecordsForTest();
    const tracker = startJevShadowEvaluation({
        requestId: 'trial-failure',
        mode: 'single',
        ccMode: false,
        state,
        signal: new AbortController().signal,
        evaluate: async () => ok(),
        evaluateWardrobeTrial: async () => { throw new Error('private trial failure'); },
    });
    tracker.recordGemmaDecision('keep');
    await flush();
    const record = getJevShadowRecordsForTest()[0];
    assert.equal(record?.status, 'ok');
    assert.equal(record?.gemmaDecision, 'keep');
    assert.equal(record?.wardrobeTrial?.profile, 'wardrobe-v4');
    assert.equal(record?.wardrobeTrial?.status, 'unavailable');
    assert.equal(JSON.stringify(record).includes('private trial failure'), false);
});

test('Group gate V2 failure is observational and never blocks Gemma metadata', async () => {
    clearJevShadowRecordsForTest();
    const tracker = startJevShadowEvaluation({
        requestId: 'group-gate-failure',
        mode: 'group',
        ccMode: false,
        deterministicGroupNarrationViolation: false,
        state,
        signal: new AbortController().signal,
        evaluate: async () => ok(),
        evaluateWardrobeTrial: async () => wardrobeTrialOk(),
        evaluateGroupGateTrial: async () => { throw new Error('private group gate failure'); },
    });
    tracker.recordGemmaDecision('keep');
    await flush();
    const record = getJevShadowRecordsForTest()[0];
    assert.equal(record?.status, 'unavailable');
    assert.equal(record?.gemmaDecision, 'keep');
    assert.equal(record?.groupGateTrial?.profile, 'group-gate-v2');
    assert.equal(record?.groupGateTrial?.status, 'unavailable');
    assert.equal(JSON.stringify(record).includes('private group gate failure'), false);
});

test('strict-review source starts one shadow before unchanged Gemma review for single and group paths', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const review = source.slice(source.indexOf('const strictReviewSingleReply'), source.indexOf('const runCharacterChatGeneration'));
    assert.match(review, /startStrictReviewShadow\(request, latestUserMessage, candidate, 'single'\);\s*let decision;\s*try \{\s*decision = await requestStrictReviewDecision\(/s);
    assert.match(review, /startStrictReviewShadow\([\s\S]*serializedCandidate,[\s\S]*'group',[\s\S]*candidate\.scene,[\s\S]*groupNarrationUsesFirstPerson\(candidate\),[\s\S]*\);\s*let decision;\s*try \{\s*decision = await requestStrictReviewDecision\(/s);
    assert.equal((review.match(/startStrictReviewShadow\(/g) || []).length, 2);
    assert.doesNotMatch(review, /routeChoice.*applySingleStrictReview|signals.*applyGroupStrictReview/s);
});
