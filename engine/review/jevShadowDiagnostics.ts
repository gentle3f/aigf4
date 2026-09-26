import type { JevShadowRecord } from './jevShadow.js';
import { STRICT_REVIEW_ISSUE_CODES, sanitizeStrictReviewIssueCodes } from '../../strictReview.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';

export interface JevShadowDiagnosticsSummary {
    totalRecords: number;
    status: Record<'ok' | 'unavailable' | 'aborted', number>;
    route: Record<'clean' | 'fullReview', number>;
    gemma: Record<'keep' | 'revise' | 'unavailable', number>;
    gemmaIssues: Record<StrictReviewIssueCode, number>;
    comparison: Record<'agree' | 'disagree' | 'unknown', number>;
    falseNegativeCandidates: number;
    performance: { averageLatencyMs: number; maxLatencyMs: number };
    usage: { totalInputTokens: number; totalOutputTokens: number; totalCost: number };
}

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
    routeChoice: record.routeChoice,
    routeConfidence: record.routeConfidence,
    routeCleanProbability: record.routeCleanProbability,
    routeFullReviewProbability: record.routeFullReviewProbability,
    signals: record.signals ? { ...record.signals } : undefined,
    usageInputTokens: record.usageInputTokens,
    usageOutputTokens: record.usageOutputTokens,
    usageCost: record.usageCost,
    gemmaDecision: record.gemmaDecision,
    gemmaIssueCodes: record.gemmaIssueCodes ? sanitizeStrictReviewIssueCodes(record.gemmaIssueCodes) : undefined,
    comparison: record.comparison,
    falseNegativeCandidate: record.falseNegativeCandidate,
});

export const summarizeJevShadowRecords = (records: readonly JevShadowRecord[]): JevShadowDiagnosticsSummary => {
    const summary: JevShadowDiagnosticsSummary = {
        totalRecords: records.length,
        status: { ok: 0, unavailable: 0, aborted: 0 },
        route: { clean: 0, fullReview: 0 },
        gemma: { keep: 0, revise: 0, unavailable: 0 },
        gemmaIssues: Object.fromEntries(STRICT_REVIEW_ISSUE_CODES.map(code => [code, 0])) as Record<StrictReviewIssueCode, number>,
        comparison: { agree: 0, disagree: 0, unknown: 0 },
        falseNegativeCandidates: 0,
        performance: { averageLatencyMs: 0, maxLatencyMs: 0 },
        usage: { totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0 },
    };
    let completedLatencyTotal = 0;
    let completedLatencyCount = 0;

    for (const record of records) {
        summary.status[record.status] += 1;
        if (record.status === 'ok') {
            completedLatencyTotal += record.latencyMs;
            completedLatencyCount += 1;
            summary.performance.maxLatencyMs = Math.max(summary.performance.maxLatencyMs, record.latencyMs);
        }
        if (record.routeChoice === 'clean') summary.route.clean += 1;
        if (record.routeChoice === 'full_review') summary.route.fullReview += 1;
        if (record.gemmaDecision) summary.gemma[record.gemmaDecision] += 1;
        for (const issue of sanitizeStrictReviewIssueCodes(record.gemmaIssueCodes)) summary.gemmaIssues[issue] += 1;
        summary.comparison[record.comparison || 'unknown'] += 1;
        if (record.routeChoice === 'clean' && record.gemmaDecision === 'revise') summary.falseNegativeCandidates += 1;
        summary.usage.totalInputTokens += record.usageInputTokens || 0;
        summary.usage.totalOutputTokens += record.usageOutputTokens || 0;
        summary.usage.totalCost += record.usageCost || 0;
    }
    summary.performance.averageLatencyMs = completedLatencyCount ? Math.round(completedLatencyTotal / completedLatencyCount) : 0;
    return summary;
};

export const createJevShadowDiagnosticsExport = (records: readonly JevShadowRecord[]) => {
    const safeRecords = records.map(cloneRecord);
    return { summary: summarizeJevShadowRecords(safeRecords), records: safeRecords };
};
