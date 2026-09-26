import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { JevShadowRecord } from '../engine/review/jevShadow.js';
import { STRICT_REVIEW_ISSUE_CODES } from '../strictReview.js';
import {
    createJevShadowDiagnosticsExport,
    summarizeJevShadowRecords,
} from '../engine/review/jevShadowDiagnostics.js';

const records: JevShadowRecord[] = [
    {
        taxonomyVersion: 'v2', requestId: 'clean-revise', mode: 'single', ccMode: false, status: 'ok', latencyMs: 120,
        servedModel: 'typesafe/jev-1.13', routeChoice: 'clean', routeConfidence: 0.91,
        routeCleanProbability: 0.91, routeFullReviewProbability: 0.09,
        signals: { requestMismatch: 0.01, identityConflict: 0.1, speakerOwnershipViolation: 0.2, continuityViolation: 0.3, realityLayerViolation: 0.4, wardrobeConflict: 0.5, stateConflict: 0.6, replayedBeat: 0.7, personaVoiceViolation: 0.8, thirdPartySpeechViolation: 0.9, userAgencyViolation: 0.1, incompleteEnding: 0.2, groupNarrationViolation: 0.3, otherDefect: 0.4 },
        usageInputTokens: 10, usageOutputTokens: 20, usageCost: 0.001, gemmaDecision: 'revise', comparison: 'disagree', falseNegativeCandidate: true,
        gemmaIssueCodes: ['identity', 'continuity'],
    },
    {
        taxonomyVersion: 'v2', requestId: 'full-keep', mode: 'group', ccMode: true, status: 'ok', latencyMs: 80,
        routeChoice: 'full_review', gemmaDecision: 'keep', gemmaIssueCodes: [], comparison: 'disagree', usageInputTokens: 5, usageOutputTokens: 7, usageCost: 0.002,
    },
    { taxonomyVersion: 'v2', requestId: 'down', mode: 'single', ccMode: false, status: 'unavailable', reasonCode: 'UPSTREAM_RATE_LIMITED', latencyMs: 5, gemmaDecision: 'unavailable', comparison: 'unknown' },
    { taxonomyVersion: 'v2', requestId: 'cancelled', mode: 'single', ccMode: false, status: 'aborted', latencyMs: 2 },
];

test('diagnostics summary counts observable Jev metadata without inferring accuracy', () => {
    const summary = summarizeJevShadowRecords(records);
    assert.equal(summary.totalRecords, 4);
    assert.deepEqual(summary.status, { ok: 2, unavailable: 1, aborted: 1 });
    assert.deepEqual(summary.route, { clean: 1, fullReview: 1 });
    assert.deepEqual(summary.gemma, { keep: 1, revise: 1, unavailable: 1 });
    assert.equal(summary.gemmaIssues.identity, 1);
    assert.equal(summary.gemmaIssues.continuity, 1);
    assert.equal(summary.gemmaIssues.other, 0);
    assert.deepEqual(summary.comparison, { agree: 0, disagree: 2, unknown: 2 });
    assert.equal(summary.falseNegativeCandidates, 1);
    assert.deepEqual(summary.performance, { averageLatencyMs: 100, maxLatencyMs: 120 });
    assert.deepEqual(summary.usage, { totalInputTokens: 15, totalOutputTokens: 27, totalCost: 0.003 });
});

test('summary counts every closed Gemma revise reason without inventing reasons for keep records', () => {
    const summary = summarizeJevShadowRecords([
        ...STRICT_REVIEW_ISSUE_CODES.map((code, index) => ({ taxonomyVersion: 'v2' as const, requestId: `code-${index}`, mode: 'single' as const, ccMode: false, status: 'ok' as const, latencyMs: 1, gemmaDecision: 'revise' as const, gemmaIssueCodes: [code] })),
        { taxonomyVersion: 'v2' as const, requestId: 'keep', mode: 'single' as const, ccMode: false, status: 'ok' as const, latencyMs: 1, gemmaDecision: 'keep' as const, gemmaIssueCodes: [] },
    ]);
    for (const code of STRICT_REVIEW_ISSUE_CODES) assert.equal(summary.gemmaIssues[code], 1);
});

test('diagnostic JSON export is a detached metadata-only snapshot', () => {
    const unsafe = { ...records[0], latestUserText: 'PRIVATE_USER_TEXT_SENTINEL', candidateText: 'PRIVATE_CANDIDATE_TEXT_SENTINEL', authoritativeContext: 'PRIVATE_AUTHORITATIVE_CONTEXT_SENTINEL', recentHistoryText: 'PRIVATE_HISTORY_SENTINEL', sceneSummary: 'PRIVATE_SCENE_SENTINEL', participants: [{ name: 'PRIVATE_PARTICIPANT_SENTINEL' }], wardrobe: { user: 'PRIVATE_WARDROBE_SENTINEL' }, relevantMemories: [{ summary: 'PRIVATE_MEMORY_SENTINEL' }], rawIssue: 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL', revisedResponse: 'PRIVATE_REVISED_RESPONSE_SENTINEL', gemmaIssueCodes: ['identity', 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL'] } as JevShadowRecord;
    const exported = createJevShadowDiagnosticsExport([unsafe]);
    const json = JSON.stringify(exported);
    for (const privateValue of ['PRIVATE_USER_TEXT_SENTINEL', 'PRIVATE_CANDIDATE_TEXT_SENTINEL', 'PRIVATE_AUTHORITATIVE_CONTEXT_SENTINEL', 'PRIVATE_HISTORY_SENTINEL', 'PRIVATE_SCENE_SENTINEL', 'PRIVATE_PARTICIPANT_SENTINEL', 'PRIVATE_WARDROBE_SENTINEL', 'PRIVATE_MEMORY_SENTINEL', 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL', 'PRIVATE_REVISED_RESPONSE_SENTINEL', 'Authorization', 'Bearer', 'OPENROUTER_API']) assert.equal(json.includes(privateValue), false);
    assert.deepEqual(exported.records[0]?.gemmaIssueCodes, ['identity']);
    exported.records[0]!.signals!.identityConflict = 1;
    assert.equal(unsafe.signals!.identityConflict, 0.1);
});

test('Jev Shadow UI only reads the in-memory collector and does not invoke a provider', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const panel = source.slice(source.indexOf('const openJevShadowDiagnostics'), source.indexOf("['最近文字用量'"));
    assert.match(panel, /\['Jev Shadow', openJevShadowDiagnostics\]/);
    assert.match(panel, /getJevShadowRecords\(\)/);
    assert.match(panel, /createJevShadowDiagnosticsExport\(getJevShadowRecords\(\)\)/);
    assert.match(panel, /clearJevShadowRecords\(\)/);
    assert.match(panel, /Gemma revise reasons/);
    assert.match(panel, /Jev clean \/ Gemma revise/);
    assert.doesNotMatch(panel, /evaluateJevShadow|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|Supabase|window\.__/);
});

test('diagnostics modules contain no persistence, cloud, analytics, or network transport', () => {
    for (const relativePath of ['../engine/review/jevShadow.ts', '../engine/review/jevShadowDiagnostics.ts']) {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|Supabase|fetch\(|XMLHttpRequest|sendBeacon|window\.__/);
    }
});
