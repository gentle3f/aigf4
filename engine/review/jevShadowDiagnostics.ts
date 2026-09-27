import type { JevShadowRecord } from './jevShadow.js';
import { STRICT_REVIEW_ISSUE_CODES, sanitizeStrictReviewIssueCodes } from '../../strictReview.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';

export interface JevShadowDiagnosticsSummary {
    totalRecords: number;
    status: Record<'ok' | 'unavailable' | 'aborted', number>;
    gemma: Record<'keep' | 'revise' | 'unavailable', number>;
    gemmaIssues: Record<StrictReviewIssueCode, number>;
    gemmaIssueAnomalies: Record<StrictReviewIssueCode, number>;
    performance: { averageLatencyMs: number; maxLatencyMs: number };
    usage: { totalInputTokens: number; totalOutputTokens: number; totalCost: number; averageInputTokens: number };
    signalAverages: Record<keyof NonNullable<JevShadowRecord['signals']>, number>;
    wardrobeTrial: {
        status: Record<'ok' | 'unavailable' | 'aborted', number>;
        pairedCount: number;
        productionAverage: number;
        trialAverage: number;
        averageDelta: number;
        averageLatencyMs: number;
        maxLatencyMs: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalCost: number;
        withGemmaWardrobeIssue: { count: number; productionAverage: number; trialAverage: number };
        withoutGemmaWardrobeIssue: { count: number; productionAverage: number; trialAverage: number };
    };
}

const JEV_SIGNAL_KEYS = [
    'requestMismatch', 'identityConflict', 'speakerOwnershipViolation', 'continuityViolation',
    'realityLayerViolation', 'wardrobeConflict', 'stateConflict', 'replayedBeat',
    'personaVoiceViolation', 'thirdPartySpeechViolation', 'userAgencyViolation', 'incompleteEnding',
    'groupNarrationViolation', 'otherDefect',
] as const satisfies readonly (keyof NonNullable<JevShadowRecord['signals']>)[];

const cloneWardrobeTrial = (trial: JevShadowRecord['wardrobeTrial']): JevShadowRecord['wardrobeTrial'] => trial ? ({
    profile: trial.profile,
    status: trial.status,
    reasonCode: trial.reasonCode,
    networkCode: trial.networkCode,
    latencyMs: trial.latencyMs,
    servedModel: trial.servedModel,
    wardrobeConflict: trial.wardrobeConflict,
    usageInputTokens: trial.usageInputTokens,
    usageOutputTokens: trial.usageOutputTokens,
    usageCost: trial.usageCost,
}) : undefined;

const cloneRecord = (record: JevShadowRecord): JevShadowRecord => ({
    taxonomyVersion: record.taxonomyVersion,
    requestId: record.requestId,
    mode: record.mode,
    ccMode: record.ccMode,
    status: record.status,
    reasonCode: record.reasonCode,
    networkCode: record.networkCode,
    latencyMs: record.latencyMs,
    servedModel: record.servedModel,
    signals: record.signals ? { ...record.signals } : undefined,
    usageInputTokens: record.usageInputTokens,
    usageOutputTokens: record.usageOutputTokens,
    usageCost: record.usageCost,
    wardrobeTrial: cloneWardrobeTrial(record.wardrobeTrial),
    gemmaDecision: record.gemmaDecision,
    gemmaIssueCodes: record.gemmaIssueCodes ? sanitizeStrictReviewIssueCodes(record.gemmaIssueCodes) : undefined,
    gemmaComparableIssueCodes: record.gemmaComparableIssueCodes ? sanitizeStrictReviewIssueCodes(record.gemmaComparableIssueCodes) : undefined,
    gemmaIssueAnomalies: record.gemmaIssueAnomalies ? sanitizeStrictReviewIssueCodes(record.gemmaIssueAnomalies) : undefined,
});

export const summarizeJevShadowRecords = (records: readonly JevShadowRecord[]): JevShadowDiagnosticsSummary => {
    const summary: JevShadowDiagnosticsSummary = {
        totalRecords: records.length,
        status: { ok: 0, unavailable: 0, aborted: 0 },
        gemma: { keep: 0, revise: 0, unavailable: 0 },
        gemmaIssues: Object.fromEntries(STRICT_REVIEW_ISSUE_CODES.map(code => [code, 0])) as Record<StrictReviewIssueCode, number>,
        gemmaIssueAnomalies: Object.fromEntries(STRICT_REVIEW_ISSUE_CODES.map(code => [code, 0])) as Record<StrictReviewIssueCode, number>,
        performance: { averageLatencyMs: 0, maxLatencyMs: 0 },
        usage: { totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0, averageInputTokens: 0 },
        signalAverages: Object.fromEntries(JEV_SIGNAL_KEYS.map(key => [key, 0])) as JevShadowDiagnosticsSummary['signalAverages'],
        wardrobeTrial: {
            status: { ok: 0, unavailable: 0, aborted: 0 },
            pairedCount: 0,
            productionAverage: 0,
            trialAverage: 0,
            averageDelta: 0,
            averageLatencyMs: 0,
            maxLatencyMs: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCost: 0,
            withGemmaWardrobeIssue: { count: 0, productionAverage: 0, trialAverage: 0 },
            withoutGemmaWardrobeIssue: { count: 0, productionAverage: 0, trialAverage: 0 },
        },
    };
    let completedLatencyTotal = 0;
    let completedLatencyCount = 0;
    let inputTokenCount = 0;
    let signalCount = 0;
    let trialLatencyTotal = 0;
    let trialLatencyCount = 0;
    let pairedProductionTotal = 0;
    let pairedTrialTotal = 0;
    let withWardrobeIssueProductionTotal = 0;
    let withWardrobeIssueTrialTotal = 0;
    let withoutWardrobeIssueProductionTotal = 0;
    let withoutWardrobeIssueTrialTotal = 0;

    for (const record of records) {
        summary.status[record.status] += 1;
        if (record.status === 'ok') {
            completedLatencyTotal += record.latencyMs;
            completedLatencyCount += 1;
            summary.performance.maxLatencyMs = Math.max(summary.performance.maxLatencyMs, record.latencyMs);
        }
        if (record.gemmaDecision) summary.gemma[record.gemmaDecision] += 1;
        for (const issue of sanitizeStrictReviewIssueCodes(record.gemmaIssueCodes)) summary.gemmaIssues[issue] += 1;
        for (const issue of sanitizeStrictReviewIssueCodes(record.gemmaIssueAnomalies)) summary.gemmaIssueAnomalies[issue] += 1;
        summary.usage.totalInputTokens += record.usageInputTokens || 0;
        summary.usage.totalOutputTokens += record.usageOutputTokens || 0;
        summary.usage.totalCost += record.usageCost || 0;
        if (record.usageInputTokens !== undefined) inputTokenCount += 1;
        if (record.signals) {
            signalCount += 1;
            for (const key of JEV_SIGNAL_KEYS) summary.signalAverages[key] += record.signals[key];
        }

        const trial = record.wardrobeTrial;
        if (trial) {
            summary.wardrobeTrial.status[trial.status] += 1;
            if (trial.status === 'ok') {
                trialLatencyTotal += trial.latencyMs;
                trialLatencyCount += 1;
                summary.wardrobeTrial.maxLatencyMs = Math.max(summary.wardrobeTrial.maxLatencyMs, trial.latencyMs);
            }
            summary.wardrobeTrial.totalInputTokens += trial.usageInputTokens || 0;
            summary.wardrobeTrial.totalOutputTokens += trial.usageOutputTokens || 0;
            summary.wardrobeTrial.totalCost += trial.usageCost || 0;

            if (record.signals && trial.wardrobeConflict !== undefined) {
                summary.wardrobeTrial.pairedCount += 1;
                pairedProductionTotal += record.signals.wardrobeConflict;
                pairedTrialTotal += trial.wardrobeConflict;

                if (record.gemmaDecision === 'keep' || record.gemmaDecision === 'revise') {
                    const hasWardrobeIssue = sanitizeStrictReviewIssueCodes(record.gemmaIssueCodes).includes('wardrobe');
                    if (hasWardrobeIssue) {
                        summary.wardrobeTrial.withGemmaWardrobeIssue.count += 1;
                        withWardrobeIssueProductionTotal += record.signals.wardrobeConflict;
                        withWardrobeIssueTrialTotal += trial.wardrobeConflict;
                    } else {
                        summary.wardrobeTrial.withoutGemmaWardrobeIssue.count += 1;
                        withoutWardrobeIssueProductionTotal += record.signals.wardrobeConflict;
                        withoutWardrobeIssueTrialTotal += trial.wardrobeConflict;
                    }
                }
            }
        }
    }
    summary.performance.averageLatencyMs = completedLatencyCount ? Math.round(completedLatencyTotal / completedLatencyCount) : 0;
    summary.usage.averageInputTokens = inputTokenCount ? Math.round(summary.usage.totalInputTokens / inputTokenCount) : 0;
    if (signalCount) {
        for (const key of JEV_SIGNAL_KEYS) summary.signalAverages[key] = Number((summary.signalAverages[key] / signalCount).toFixed(3));
    }

    summary.wardrobeTrial.averageLatencyMs = trialLatencyCount ? Math.round(trialLatencyTotal / trialLatencyCount) : 0;
    if (summary.wardrobeTrial.pairedCount) {
        summary.wardrobeTrial.productionAverage = Number((pairedProductionTotal / summary.wardrobeTrial.pairedCount).toFixed(3));
        summary.wardrobeTrial.trialAverage = Number((pairedTrialTotal / summary.wardrobeTrial.pairedCount).toFixed(3));
        summary.wardrobeTrial.averageDelta = Number((summary.wardrobeTrial.trialAverage - summary.wardrobeTrial.productionAverage).toFixed(3));
    }
    if (summary.wardrobeTrial.withGemmaWardrobeIssue.count) {
        const group = summary.wardrobeTrial.withGemmaWardrobeIssue;
        group.productionAverage = Number((withWardrobeIssueProductionTotal / group.count).toFixed(3));
        group.trialAverage = Number((withWardrobeIssueTrialTotal / group.count).toFixed(3));
    }
    if (summary.wardrobeTrial.withoutGemmaWardrobeIssue.count) {
        const group = summary.wardrobeTrial.withoutGemmaWardrobeIssue;
        group.productionAverage = Number((withoutWardrobeIssueProductionTotal / group.count).toFixed(3));
        group.trialAverage = Number((withoutWardrobeIssueTrialTotal / group.count).toFixed(3));
    }
    return summary;
};

export const createJevShadowDiagnosticsExport = (records: readonly JevShadowRecord[]) => {
    const safeRecords = records.map(cloneRecord);
    return { summary: summarizeJevShadowRecords(safeRecords), records: safeRecords };
};
