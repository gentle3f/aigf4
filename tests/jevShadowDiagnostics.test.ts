import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { JevShadowRecord } from '../engine/review/jevShadow.js';
import { STRICT_REVIEW_ISSUE_CODES } from '../strictReview.js';
import { createJevShadowDiagnosticsExport, summarizeJevShadowRecords } from '../engine/review/jevShadowDiagnostics.js';

const signals = { requestMismatch: 0.01, identityConflict: 0.1, speakerOwnershipViolation: 0.2, continuityViolation: 0.3, realityLayerViolation: 0.4, wardrobeConflict: 0.5, stateConflict: 0.6, replayedBeat: 0.7, personaVoiceViolation: 0.8, thirdPartySpeechViolation: 0.9, userAgencyViolation: 0.1, incompleteEnding: 0.2, groupNarrationViolation: 0.3, otherDefect: 0.4 };
const records: JevShadowRecord[] = [
    { taxonomyVersion: 'v3', requestId: 'one', mode: 'single', ccMode: false, status: 'ok', latencyMs: 120, servedModel: 'typesafe/jev-1.13', signals, usageInputTokens: 10, usageOutputTokens: 20, usageCost: 0.001, wardrobeTrial: { profile: 'wardrobe-v4', status: 'ok', latencyMs: 90, servedModel: 'typesafe/jev-1.13', wardrobeConflict: 0.2, usageInputTokens: 9, usageOutputTokens: 3, usageCost: 0.0004 }, gemmaDecision: 'revise', gemmaIssueCodes: ['identity', 'group_narration'], gemmaComparableIssueCodes: ['identity'], gemmaIssueAnomalies: ['group_narration'] },
    { taxonomyVersion: 'v3', requestId: 'two', mode: 'group', ccMode: true, status: 'ok', latencyMs: 80, gemmaDecision: 'keep', gemmaIssueCodes: [], gemmaComparableIssueCodes: [], gemmaIssueAnomalies: [], usageInputTokens: 5, usageOutputTokens: 7, usageCost: 0.002 },
    { taxonomyVersion: 'v3', requestId: 'down', mode: 'single', ccMode: false, status: 'unavailable', reasonCode: 'UPSTREAM_RATE_LIMITED', latencyMs: 5, gemmaDecision: 'unavailable' },
    { taxonomyVersion: 'v3', requestId: 'cancelled', mode: 'single', ccMode: false, status: 'aborted', latencyMs: 2 },
];

test('V3 diagnostics summary records signals, Gemma labels, anomalies, performance, usage, and no routing accuracy', () => {
    const summary = summarizeJevShadowRecords(records);
    assert.equal(summary.totalRecords, 4);
    assert.deepEqual(summary.status, { ok: 2, unavailable: 1, aborted: 1 });
    assert.deepEqual(summary.gemma, { keep: 1, revise: 1, unavailable: 1 });
    assert.equal(summary.gemmaIssues.identity, 1);
    assert.equal(summary.gemmaIssueAnomalies.group_narration, 1);
    assert.deepEqual(summary.performance, { averageLatencyMs: 100, maxLatencyMs: 120 });
    assert.deepEqual(summary.usage, { totalInputTokens: 15, totalOutputTokens: 27, totalCost: 0.003, averageInputTokens: 8 });
    assert.equal(summary.signalAverages.identityConflict, 0.1);
    assert.deepEqual(summary.wardrobeTrial.status, { ok: 1, unavailable: 0, aborted: 0 });
    assert.equal(summary.wardrobeTrial.pairedCount, 1);
    assert.equal(summary.wardrobeTrial.productionAverage, 0.5);
    assert.equal(summary.wardrobeTrial.trialAverage, 0.2);
    assert.equal(summary.wardrobeTrial.averageDelta, -0.3);
    assert.equal(summary.wardrobeTrial.averageLatencyMs, 90);
    assert.equal(summary.wardrobeTrial.totalInputTokens, 9);
    assert.equal(summary.wardrobeTrial.totalOutputTokens, 3);
    assert.equal(summary.wardrobeTrial.totalCost, 0.0004);
    assert.deepEqual(summary.wardrobeTrial.withoutGemmaWardrobeIssue, { count: 1, productionAverage: 0.5, trialAverage: 0.2 });
    assert.deepEqual(summary.wardrobeTrial.withGemmaWardrobeIssue, { count: 0, productionAverage: 0, trialAverage: 0 });
    assert.equal('route' in summary, false);
    assert.equal('comparison' in summary, false);
});

test('summary counts every closed Gemma issue without adding reasons for keep records', () => {
    const summary = summarizeJevShadowRecords([
        ...STRICT_REVIEW_ISSUE_CODES.map((code, index) => ({ taxonomyVersion: 'v3' as const, requestId: `code-${index}`, mode: 'group' as const, ccMode: false, status: 'ok' as const, latencyMs: 1, gemmaDecision: 'revise' as const, gemmaIssueCodes: [code], gemmaComparableIssueCodes: [code], gemmaIssueAnomalies: [] })),
        { taxonomyVersion: 'v3' as const, requestId: 'keep', mode: 'single' as const, ccMode: false, status: 'ok' as const, latencyMs: 1, gemmaDecision: 'keep' as const, gemmaIssueCodes: [] },
    ]);
    for (const code of STRICT_REVIEW_ISSUE_CODES) assert.equal(summary.gemmaIssues[code], 1);
});

test('diagnostic JSON export is a detached metadata-only snapshot', () => {
    const unsafe = { ...records[0], latestUserText: 'PRIVATE_USER_TEXT_SENTINEL', candidateText: 'PRIVATE_CANDIDATE_TEXT_SENTINEL', personaEvidence: 'PRIVATE_PERSONA_SENTINEL', recentHistoryText: 'PRIVATE_HISTORY_SENTINEL', rawIssue: 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL', revisedResponse: 'PRIVATE_REVISED_RESPONSE_SENTINEL', wardrobeTrial: { ...records[0]!.wardrobeTrial!, rawState: 'PRIVATE_TRIAL_STATE_SENTINEL' }, gemmaIssueCodes: ['identity', 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL'] } as JevShadowRecord;
    const exported = createJevShadowDiagnosticsExport([unsafe]);
    const json = JSON.stringify(exported);
    for (const value of ['PRIVATE_USER_TEXT_SENTINEL', 'PRIVATE_CANDIDATE_TEXT_SENTINEL', 'PRIVATE_PERSONA_SENTINEL', 'PRIVATE_HISTORY_SENTINEL', 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL', 'PRIVATE_REVISED_RESPONSE_SENTINEL', 'PRIVATE_TRIAL_STATE_SENTINEL', 'Authorization', 'Bearer', 'OPENROUTER_API']) assert.equal(json.includes(value), false);
    assert.deepEqual(exported.records[0]?.gemmaIssueCodes, ['identity']);
    exported.records[0]!.signals!.identityConflict = 1;
    exported.records[0]!.wardrobeTrial!.wardrobeConflict = 1;
    assert.equal(unsafe.signals!.identityConflict, 0.1);
    assert.equal(unsafe.wardrobeTrial!.wardrobeConflict, 0.2);
});

test('V3 diagnostics UI only reads in-memory records and presents signals-only calibration', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const panel = source.slice(source.indexOf('const openJevShadowDiagnostics'), source.indexOf("['Jev Shadow', openJevShadowDiagnostics]"));
    assert.match(panel, /V3 signals \+ wardrobe wording A\/B shadow/);
    assert.match(panel, /getJevShadowRecords\(\)/);
    assert.match(panel, /createJevShadowDiagnosticsExport\(getJevShadowRecords\(\)\)/);
    assert.match(panel, /Gemma revise reasons/);
    assert.doesNotMatch(panel, /Jev clean \/ Gemma revise|Agree \/ disagree|routeChoice|routeConfidence/);
    assert.doesNotMatch(panel, /evaluateJevShadow|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|Supabase|window\.__/);
});

test('diagnostics modules contain no persistence, cloud, analytics, or network transport', () => {
    for (const relativePath of ['../engine/review/jevShadow.ts', '../engine/review/jevShadowDiagnostics.ts']) {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|Supabase|fetch\(|XMLHttpRequest|sendBeacon|window\.__/);
    }
});
