import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { JevShadowRecord } from '../engine/review/jevShadow.js';
import {
    createJevShadowDiagnosticsExport,
    summarizeJevShadowRecords,
} from '../engine/review/jevShadowDiagnostics.js';

const records: JevShadowRecord[] = [
    {
        requestId: 'clean-revise', mode: 'single', ccMode: false, status: 'ok', latencyMs: 120,
        servedModel: 'typesafe/jev-1.13', routeChoice: 'clean', routeConfidence: 0.91,
        routeCleanProbability: 0.91, routeFullReviewProbability: 0.09,
        signals: { identityConflict: 0.1, speakerOwnershipViolation: 0.2, realityLayerViolation: 0.3, memoryConflict: 0.4, stateConflict: 0.5, userAgencyViolation: 0.6, continuityViolation: 0.7 },
        usageInputTokens: 10, usageOutputTokens: 20, usageCost: 0.001, gemmaDecision: 'revise', comparison: 'disagree', falseNegativeCandidate: true,
    },
    {
        requestId: 'full-keep', mode: 'group', ccMode: true, status: 'ok', latencyMs: 80,
        routeChoice: 'full_review', gemmaDecision: 'keep', comparison: 'disagree', usageInputTokens: 5, usageOutputTokens: 7, usageCost: 0.002,
    },
    { requestId: 'down', mode: 'single', ccMode: false, status: 'unavailable', reasonCode: 'UPSTREAM_RATE_LIMITED', latencyMs: 5, gemmaDecision: 'unavailable', comparison: 'unknown' },
    { requestId: 'cancelled', mode: 'single', ccMode: false, status: 'aborted', latencyMs: 2 },
];

test('diagnostics summary counts observable Jev metadata without inferring accuracy', () => {
    const summary = summarizeJevShadowRecords(records);
    assert.equal(summary.totalRecords, 4);
    assert.deepEqual(summary.status, { ok: 2, unavailable: 1, aborted: 1 });
    assert.deepEqual(summary.route, { clean: 1, fullReview: 1 });
    assert.deepEqual(summary.gemma, { keep: 1, revise: 1, unavailable: 1 });
    assert.deepEqual(summary.comparison, { agree: 0, disagree: 2, unknown: 2 });
    assert.equal(summary.falseNegativeCandidates, 1);
    assert.deepEqual(summary.performance, { averageLatencyMs: 100, maxLatencyMs: 120 });
    assert.deepEqual(summary.usage, { totalInputTokens: 15, totalOutputTokens: 27, totalCost: 0.003 });
});

test('diagnostic JSON export is a detached metadata-only snapshot', () => {
    const unsafe = { ...records[0], latestUserText: 'private user sentinel', candidateText: 'private candidate sentinel' } as JevShadowRecord;
    const exported = createJevShadowDiagnosticsExport([unsafe]);
    const json = JSON.stringify(exported);
    assert.equal(json.includes('private user sentinel'), false);
    assert.equal(json.includes('private candidate sentinel'), false);
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
    assert.doesNotMatch(panel, /evaluateJevShadow|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|Supabase|window\.__/);
});

test('diagnostics modules contain no persistence, cloud, analytics, or network transport', () => {
    for (const relativePath of ['../engine/review/jevShadow.ts', '../engine/review/jevShadowDiagnostics.ts']) {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|Supabase|fetch\(|XMLHttpRequest|sendBeacon|window\.__/);
    }
});
