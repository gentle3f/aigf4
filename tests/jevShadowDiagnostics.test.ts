import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { JevShadowRecord } from '../engine/review/jevShadow.js';
import { STRICT_REVIEW_ISSUE_CODES } from '../strictReview.js';
import { createJevShadowDiagnosticsExport, summarizeJevShadowRecords } from '../engine/review/jevShadowDiagnostics.js';

const signals = { requestMismatch: 0.01, identityConflict: 0.1, speakerOwnershipViolation: 0.2, continuityViolation: 0.3, realityLayerViolation: 0.4, wardrobeConflict: 0.5, stateConflict: 0.6, replayedBeat: 0.7, personaVoiceViolation: 0.8, thirdPartySpeechViolation: 0.9, userAgencyViolation: 0.1, incompleteEnding: 0.2, groupNarrationViolation: 0.3, otherDefect: 0.4 };
const gateSemanticSignals = {
    requestMismatch: signals.requestMismatch,
    identityConflict: signals.identityConflict,
    speakerOwnershipViolation: signals.speakerOwnershipViolation,
    continuityViolation: signals.continuityViolation,
    realityLayerViolation: signals.realityLayerViolation,
    wardrobeConflict: signals.wardrobeConflict,
    stateConflict: signals.stateConflict,
    replayedBeat: signals.replayedBeat,
    personaVoiceViolation: signals.personaVoiceViolation,
    thirdPartySpeechViolation: signals.thirdPartySpeechViolation,
    userAgencyViolation: signals.userAgencyViolation,
    incompleteEnding: signals.incompleteEnding,
    otherDefect: signals.otherDefect,
};

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


test('deterministic group narration summary compares structured check, Jev signal, and Gemma label without text', () => {
    const groupRecords: JevShadowRecord[] = [
        { taxonomyVersion: 'v3', calibrationCohort: 'group-deterministic-v1', requestId: 'g1', mode: 'group', ccMode: false, deterministicGroupNarrationViolation: true, status: 'ok', latencyMs: 10, servedModel: 'typesafe/jev-1.13', signals: { ...signals, groupNarrationViolation: 0.8 }, gemmaDecision: 'revise', gemmaIssueCodes: ['group_narration'], gemmaComparableIssueCodes: ['group_narration'], gemmaIssueAnomalies: [] },
        { taxonomyVersion: 'v3', calibrationCohort: 'group-deterministic-v1', requestId: 'g2', mode: 'group', ccMode: false, deterministicGroupNarrationViolation: false, status: 'ok', latencyMs: 10, servedModel: 'typesafe/jev-1.13', signals: { ...signals, groupNarrationViolation: 0.2 }, gemmaDecision: 'keep', gemmaIssueCodes: [], gemmaComparableIssueCodes: [], gemmaIssueAnomalies: [] },
        { taxonomyVersion: 'v3', calibrationCohort: 'group-deterministic-v1', requestId: 'g3', mode: 'group', ccMode: false, deterministicGroupNarrationViolation: false, status: 'ok', latencyMs: 10, servedModel: 'typesafe/jev-1.13', signals: { ...signals, groupNarrationViolation: 0.4 }, gemmaDecision: 'revise', gemmaIssueCodes: ['group_narration'], gemmaComparableIssueCodes: ['group_narration'], gemmaIssueAnomalies: [] },
        { taxonomyVersion: 'v3', calibrationCohort: 'group-deterministic-v1', requestId: 'g4', mode: 'group', ccMode: false, deterministicGroupNarrationViolation: true, status: 'ok', latencyMs: 10, servedModel: 'typesafe/jev-1.13', signals: { ...signals, groupNarrationViolation: 0.6 }, gemmaDecision: 'keep', gemmaIssueCodes: [], gemmaComparableIssueCodes: [], gemmaIssueAnomalies: [] },
    ];
    const summary = summarizeJevShadowRecords(groupRecords);
    assert.deepEqual(summary.deterministicGroupNarration, {
        checkedCount: 4,
        violationCount: 2,
        clearCount: 2,
        withGemmaIssueAndViolation: 1,
        withGemmaIssueButClear: 1,
        withoutGemmaIssueButViolation: 1,
        withoutGemmaIssueAndClear: 1,
        jevAverageWhenViolation: 0.7,
        jevAverageWhenClear: 0.3,
    });
    const exported = createJevShadowDiagnosticsExport(groupRecords);
    assert.equal(exported.records[0]?.calibrationCohort, 'group-deterministic-v1');
    assert.equal(exported.records[0]?.deterministicGroupNarrationViolation, true);
});

test('Group gate V2 summary separates semantic revise from deterministic narration-only review', () => {
    const gateRecord = (
        requestId: string,
        requiresRevision: number | undefined,
        gemmaDecision: 'keep' | 'revise' | 'unavailable',
        gemmaIssueCodes: JevShadowRecord['gemmaIssueCodes'],
        deterministicGroupNarrationViolation: boolean,
        status: 'ok' | 'unavailable' = 'ok',
    ): JevShadowRecord => ({
        taxonomyVersion: 'v3',
        calibrationCohort: 'group-deterministic-v1',
        requestId,
        mode: 'group',
        ccMode: false,
        deterministicGroupNarrationViolation,
        status,
        latencyMs: status === 'ok' ? 100 : 50,
        groupGateTrial: {
            profile: 'group-gate-v2',
            status,
            latencyMs: status === 'ok' ? 100 : 50,
            ...(status === 'ok' ? {
                servedModel: 'typesafe/jev-1.13',
                requiresRevision,
                semanticSignals: { ...gateSemanticSignals },
                usageInputTokens: 10,
                usageOutputTokens: 2,
                usageCost: 0.001,
            } : { reasonCode: 'UPSTREAM_RATE_LIMITED' as const }),
        },
        gemmaDecision,
        gemmaIssueCodes,
        gemmaComparableIssueCodes: gemmaIssueCodes,
        gemmaIssueAnomalies: [],
    });

    const summary = summarizeJevShadowRecords([
        gateRecord('keep-low', 0.55, 'keep', [], false),
        gateRecord('keep-high', 0.65, 'keep', [], false),
        gateRecord('semantic-one', 0.92, 'revise', ['continuity'], false),
        gateRecord('semantic-plus-narration', 0.91, 'revise', ['wardrobe', 'group_narration'], true),
        gateRecord('deterministic-only', 0.52, 'revise', ['group_narration'], true),
        gateRecord('narration-mismatch', 0.70, 'revise', ['group_narration'], false),
        gateRecord('gate-down', undefined, 'unavailable', undefined, false, 'unavailable'),
    ]);

    assert.deepEqual(summary.groupGateTrial.status, { ok: 6, unavailable: 1, aborted: 0 });
    assert.equal(summary.groupGateTrial.observedCount, 6);
    assert.equal(summary.groupGateTrial.averageLatencyMs, 100);
    assert.equal(summary.groupGateTrial.maxLatencyMs, 100);
    assert.equal(summary.groupGateTrial.totalInputTokens, 60);
    assert.equal(summary.groupGateTrial.totalOutputTokens, 12);
    assert.equal(summary.groupGateTrial.totalCost, 0.006);
    assert.equal(summary.groupGateTrial.semanticSignalCount, 6);
    assert.equal(summary.groupGateTrial.semanticSignalAverages.identityConflict, signals.identityConflict);
    assert.equal(summary.groupGateTrial.semanticSignalAverages.wardrobeConflict, signals.wardrobeConflict);
    assert.deepEqual(summary.usage, { totalInputTokens: 60, totalOutputTokens: 12, totalCost: 0.006, averageInputTokens: 10 });
    assert.equal(summary.signalAverages.identityConflict, 0);
    assert.deepEqual(summary.groupGateTrial.gemmaKeep, { count: 2, average: 0.6, minimum: 0.55, maximum: 0.65 });
    assert.deepEqual(summary.groupGateTrial.gemmaSemanticRevise, { count: 2, average: 0.915, minimum: 0.91, maximum: 0.92 });
    assert.deepEqual(summary.groupGateTrial.deterministicOnlyNarration, { count: 1, average: 0.52 });
    assert.deepEqual(summary.groupGateTrial.gemmaNarrationButDeterministicClear, { count: 1, average: 0.7 });
});

test('Group gate semantic wardrobe signal keeps the wardrobe wording A/B pair after duplicate V3 removal', () => {
    const record: JevShadowRecord = {
        taxonomyVersion: 'v3',
        calibrationCohort: 'group-deterministic-v1',
        requestId: 'group-wardrobe-pair',
        mode: 'group',
        ccMode: false,
        deterministicGroupNarrationViolation: false,
        status: 'ok',
        latencyMs: 80,
        groupGateTrial: {
            profile: 'group-gate-v2',
            status: 'ok',
            latencyMs: 80,
            servedModel: 'typesafe/jev-1.13',
            requiresRevision: 0.6,
            semanticSignals: { ...gateSemanticSignals, wardrobeConflict: 0.5 },
            usageInputTokens: 10,
            usageOutputTokens: 2,
            usageCost: 0.001,
        },
        wardrobeTrial: {
            profile: 'wardrobe-v4',
            status: 'ok',
            latencyMs: 70,
            servedModel: 'typesafe/jev-1.13',
            wardrobeConflict: 0.2,
            usageInputTokens: 9,
            usageOutputTokens: 2,
            usageCost: 0.0009,
        },
        gemmaDecision: 'keep',
        gemmaIssueCodes: [],
        gemmaComparableIssueCodes: [],
        gemmaIssueAnomalies: [],
    };
    const summary = summarizeJevShadowRecords([record]);
    assert.equal(summary.wardrobeTrial.pairedCount, 1);
    assert.equal(summary.wardrobeTrial.productionAverage, 0.5);
    assert.equal(summary.wardrobeTrial.trialAverage, 0.2);
    assert.equal(summary.wardrobeTrial.averageDelta, -0.3);
    assert.deepEqual(summary.wardrobeTrial.withoutGemmaWardrobeIssue, {
        count: 1,
        productionAverage: 0.5,
        trialAverage: 0.2,
    });
});

test('summary counts every closed Gemma issue without adding reasons for keep records', () => {
    const summary = summarizeJevShadowRecords([
        ...STRICT_REVIEW_ISSUE_CODES.map((code, index) => ({ taxonomyVersion: 'v3' as const, requestId: `code-${index}`, mode: 'group' as const, ccMode: false, status: 'ok' as const, latencyMs: 1, gemmaDecision: 'revise' as const, gemmaIssueCodes: [code], gemmaComparableIssueCodes: [code], gemmaIssueAnomalies: [] })),
        { taxonomyVersion: 'v3' as const, requestId: 'keep', mode: 'single' as const, ccMode: false, status: 'ok' as const, latencyMs: 1, gemmaDecision: 'keep' as const, gemmaIssueCodes: [] },
    ]);
    for (const code of STRICT_REVIEW_ISSUE_CODES) assert.equal(summary.gemmaIssues[code], 1);
});

test('diagnostic JSON export is a detached metadata-only snapshot', () => {
    const unsafe = { ...records[0], mode: 'group', latestUserText: 'PRIVATE_USER_TEXT_SENTINEL', candidateText: 'PRIVATE_CANDIDATE_TEXT_SENTINEL', personaEvidence: 'PRIVATE_PERSONA_SENTINEL', recentHistoryText: 'PRIVATE_HISTORY_SENTINEL', rawIssue: 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL', revisedResponse: 'PRIVATE_REVISED_RESPONSE_SENTINEL', wardrobeTrial: { ...records[0]!.wardrobeTrial!, rawState: 'PRIVATE_TRIAL_STATE_SENTINEL' }, groupGateTrial: { profile: 'group-gate-v2', status: 'ok', latencyMs: 80, servedModel: 'typesafe/jev-1.13', requiresRevision: 0.71, semanticSignals: { ...gateSemanticSignals }, usageInputTokens: 8, usageOutputTokens: 2, usageCost: 0.0001, rawState: 'PRIVATE_GATE_STATE_SENTINEL' }, gemmaIssueCodes: ['identity', 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL'] } as JevShadowRecord;
    const exported = createJevShadowDiagnosticsExport([unsafe]);
    const json = JSON.stringify(exported);
    for (const value of ['PRIVATE_USER_TEXT_SENTINEL', 'PRIVATE_CANDIDATE_TEXT_SENTINEL', 'PRIVATE_PERSONA_SENTINEL', 'PRIVATE_HISTORY_SENTINEL', 'PRIVATE_GEMMA_RAW_ISSUE_SENTINEL', 'PRIVATE_REVISED_RESPONSE_SENTINEL', 'PRIVATE_TRIAL_STATE_SENTINEL', 'PRIVATE_GATE_STATE_SENTINEL', 'Authorization', 'Bearer', 'OPENROUTER_API']) assert.equal(json.includes(value), false);
    assert.deepEqual(exported.records[0]?.gemmaIssueCodes, ['identity']);
    exported.records[0]!.signals!.identityConflict = 1;
    exported.records[0]!.wardrobeTrial!.wardrobeConflict = 1;
    exported.records[0]!.groupGateTrial!.requiresRevision = 0;
    exported.records[0]!.groupGateTrial!.semanticSignals!.identityConflict = 1;
    assert.equal(unsafe.signals!.identityConflict, 0.1);
    assert.equal(unsafe.wardrobeTrial!.wardrobeConflict, 0.2);
    assert.equal(unsafe.groupGateTrial!.requiresRevision, 0.71);
    assert.equal(unsafe.groupGateTrial!.semanticSignals!.identityConflict, 0.1);
});

test('V3 diagnostics UI is a lazy-loaded cold feature and remains signals-only calibration', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const panel = readFileSync(new URL('../features/jevShadowDiagnostics.ts', import.meta.url), 'utf8');
    assert.match(indexSource, /import\(['"]\.\/features\/jevShadowDiagnostics\.js['"]\)/);
    assert.doesNotMatch(indexSource, /createJevShadowDiagnosticsExport|summarizeJevShadowRecords/);
    assert.match(panel, /V3 signals \+ Group gate V2 \+ wardrobe wording A\/B shadow/);
    assert.match(panel, /getJevShadowRecords\(\)/);
    assert.match(panel, /createJevShadowDiagnosticsExport\(getJevShadowRecords\(\)\)/);
    assert.match(panel, /分享 \/ 下載 JSON/);
    assert.match(panel, /new File\(\[json\], filename, \{ type: 'application\/json' \}\)/);
    assert.match(panel, /navigator\.canShare\(\{ files: \[file\] \}\)/);
    assert.match(panel, /navigator\.share\(\{/);
    assert.match(panel, /anchor\.download = filename/);
    assert.match(panel, /Gemma revise reasons/);
    assert.match(panel, /Group narration deterministic cohort/);
    assert.match(panel, /Group deterministic checks/);
    assert.match(panel, /Group gate V2 observed/);
    assert.match(panel, /Group material-revision gate V2/);
    assert.match(panel, /Group gate V2 semantic signal averages/);
    assert.match(panel, /Gemma semantic REVISE/);
    assert.match(panel, /primaryInputTokens/);
    assert.match(panel, /group gate semantic request\/identity\/speaker/);
    assert.match(panel, /groupGateTrial/);
    assert.match(panel, /deterministicGroupNarrationViolation/);
    assert.match(panel, /calibrationCohort/);
    assert.doesNotMatch(panel, /Jev clean \/ Gemma revise|Agree \/ disagree|routeChoice|routeConfidence/);
    assert.doesNotMatch(panel, /evaluateJevShadow|fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|Supabase|window\.__/);
});

test('diagnostics modules contain no persistence, cloud, analytics, or network transport', () => {
    for (const relativePath of ['../engine/review/jevShadow.ts', '../engine/review/jevShadowDiagnostics.ts']) {
        const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|Supabase|fetch\(|XMLHttpRequest|sendBeacon|window\.__/);
    }
});
