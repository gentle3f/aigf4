import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeJevWardrobeShadowExport, parseJevWardrobeShadowExportText } from '../scripts/jevWardrobeShadowReport.js';

const baseSignals = (wardrobeConflict: number) => ({
    requestMismatch: 0,
    identityConflict: 0,
    speakerOwnershipViolation: 0,
    continuityViolation: 0,
    realityLayerViolation: 0,
    wardrobeConflict,
    stateConflict: 0,
    replayedBeat: 0,
    personaVoiceViolation: 0,
    thirdPartySpeechViolation: 0,
    userAgencyViolation: 0,
    incompleteEnding: 0,
    groupNarrationViolation: 0,
    otherDefect: 0,
});

test('wardrobe shadow report computes paired production metrics without private text', () => {
    const report = analyzeJevWardrobeShadowExport({
        records: [
            {
                taxonomyVersion: 'v3',
                requestId: 'one',
                mode: 'single',
                ccMode: false,
                status: 'ok',
                signals: baseSignals(0.8),
                wardrobeTrial: { profile: 'wardrobe-v4', status: 'ok', wardrobeConflict: 0.7, latencyMs: 100, usageInputTokens: 10, usageOutputTokens: 2, usageCost: 0.001 },
                gemmaDecision: 'revise',
                gemmaIssueCodes: ['wardrobe'],
            },
            {
                taxonomyVersion: 'v3',
                requestId: 'two',
                mode: 'single',
                ccMode: false,
                status: 'ok',
                signals: baseSignals(0.4),
                wardrobeTrial: { profile: 'wardrobe-v4', status: 'ok', wardrobeConflict: 0.1, latencyMs: 200, usageInputTokens: 20, usageOutputTokens: 3, usageCost: 0.002 },
                gemmaDecision: 'keep',
                gemmaIssueCodes: [],
            },
            {
                taxonomyVersion: 'v3',
                requestId: 'three',
                mode: 'group',
                ccMode: false,
                status: 'ok',
                signals: baseSignals(0.6),
                wardrobeTrial: { profile: 'wardrobe-v4', status: 'ok', wardrobeConflict: 0.2, latencyMs: 300, usageInputTokens: 30, usageOutputTokens: 4, usageCost: 0.003 },
                gemmaDecision: 'revise',
                gemmaIssueCodes: ['continuity'],
            },
            {
                taxonomyVersion: 'v3',
                requestId: 'down',
                mode: 'single',
                ccMode: false,
                status: 'ok',
                signals: baseSignals(0.2),
                wardrobeTrial: { profile: 'wardrobe-v4', status: 'unavailable', latencyMs: 50 },
                gemmaDecision: 'keep',
                gemmaIssueCodes: [],
            },
        ],
    });

    assert.equal(report.totalRecords, 4);
    assert.equal(report.pairedRecords, 3);
    assert.deepEqual(report.wardrobeTrialStatus, { ok: 3, unavailable: 1, aborted: 0 });
    assert.deepEqual(report.overall, {
        count: 3,
        productionAverage: 0.6,
        trialAverage: 0.333,
        averageDelta: -0.267,
        productionMin: 0.4,
        productionMax: 0.8,
        trialMin: 0.1,
        trialMax: 0.7,
    });
    assert.deepEqual(report.byGemmaWardrobeIssue.withIssue, {
        count: 1,
        productionAverage: 0.8,
        trialAverage: 0.7,
        averageDelta: -0.1,
        productionMin: 0.8,
        productionMax: 0.8,
        trialMin: 0.7,
        trialMax: 0.7,
    });
    assert.deepEqual(report.byGemmaWardrobeIssue.withoutIssue, {
        count: 2,
        productionAverage: 0.5,
        trialAverage: 0.15,
        averageDelta: -0.35,
        productionMin: 0.4,
        productionMax: 0.6,
        trialMin: 0.1,
        trialMax: 0.2,
    });
    assert.equal(report.trialUsage.averageLatencyMs, 200);
    assert.equal(report.trialUsage.maxLatencyMs, 300);
    assert.equal(report.trialUsage.inputTokens, 60);
    assert.equal(report.trialUsage.outputTokens, 9);
    assert.equal(report.trialUsage.cost, 0.006);
    assert.equal(report.largestDeltas[0]?.requestId, 'three');
    assert.equal(report.safeBoundary.pass, true);
    assert.deepEqual(report.safeBoundary.suspiciousUnknownKeys, []);
});

test('wardrobe shadow report flags unexpected private-looking record fields', () => {
    const report = analyzeJevWardrobeShadowExport({
        records: [{
            taxonomyVersion: 'v3',
            requestId: 'unsafe',
            mode: 'single',
            ccMode: false,
            status: 'ok',
            signals: baseSignals(0.1),
            wardrobeTrial: { profile: 'wardrobe-v4', status: 'ok', wardrobeConflict: 0.1, latencyMs: 10 },
            gemmaDecision: 'keep',
            gemmaIssueCodes: [],
            candidateText: 'must never exist in a safe export',
        }],
    });
    assert.equal(report.safeBoundary.pass, false);
    assert.deepEqual(report.safeBoundary.suspiciousUnknownKeys, ['candidateText']);
});


test('wardrobe shadow report parser accepts a UTF-8 BOM from Windows exports', () => {
    assert.deepEqual(parseJevWardrobeShadowExportText('\uFEFF{"records":[]}'), { records: [] });
});
