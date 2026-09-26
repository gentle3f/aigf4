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
}

const JEV_SIGNAL_KEYS = [
    'requestMismatch', 'identityConflict', 'speakerOwnershipViolation', 'continuityViolation',
    'realityLayerViolation', 'wardrobeConflict', 'stateConflict', 'replayedBeat',
    'personaVoiceViolation', 'thirdPartySpeechViolation', 'userAgencyViolation', 'incompleteEnding',
    'groupNarrationViolation', 'otherDefect',
] as const satisfies readonly (keyof NonNullable<JevShadowRecord['signals']>)[];

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
    };
    let completedLatencyTotal = 0;
    let completedLatencyCount = 0;
    let inputTokenCount = 0;
    let signalCount = 0;

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
    }
    summary.performance.averageLatencyMs = completedLatencyCount ? Math.round(completedLatencyTotal / completedLatencyCount) : 0;
    summary.usage.averageInputTokens = inputTokenCount ? Math.round(summary.usage.totalInputTokens / inputTokenCount) : 0;
    if (signalCount) {
        for (const key of JEV_SIGNAL_KEYS) summary.signalAverages[key] = Number((summary.signalAverages[key] / signalCount).toFixed(3));
    }
    return summary;
};

export const createJevShadowDiagnosticsExport = (records: readonly JevShadowRecord[]) => {
    const safeRecords = records.map(cloneRecord);
    return { summary: summarizeJevShadowRecords(safeRecords), records: safeRecords };
};
