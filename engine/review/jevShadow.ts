import type { ReviewState } from '../contracts.js';
import { evaluateJevShadow, normalizeJevShadowResult } from './jevDecisionProvider.js';
import type { JevShadowResult } from './jevDecisionProvider.js';

export interface JevShadowRecord {
    requestId: string;
    mode: 'single' | 'group';
    ccMode: boolean;
    status: 'ok' | 'unavailable' | 'aborted';
    reasonCode?: JevShadowResult['reasonCode'];
    networkCode?: JevShadowResult['networkCode'];
    latencyMs: number;
    servedModel?: string;
    routeChoice?: 'clean' | 'full_review';
    routeConfidence?: number;
    routeCleanProbability?: number;
    routeFullReviewProbability?: number;
    signals?: NonNullable<JevShadowResult['signals']>;
    usageInputTokens?: number;
    usageOutputTokens?: number;
    usageCost?: number;
    gemmaDecision?: 'keep' | 'revise' | 'unavailable';
    comparison?: 'agree' | 'disagree' | 'unknown';
    falseNegativeCandidate?: boolean;
}

export interface JevShadowTracker {
    recordGemmaDecision(decision: 'keep' | 'revise' | 'unavailable'): void;
}

const MAX_JEV_SHADOW_RECORDS = 50;
const recentRecords: JevShadowRecord[] = [];

const compare = (route: JevShadowRecord['routeChoice'], gemma: JevShadowRecord['gemmaDecision']) => {
    if (!route || !gemma || gemma === 'unavailable') return 'unknown' as const;
    return (route === 'clean') === (gemma === 'keep') ? 'agree' as const : 'disagree' as const;
};

const refreshComparison = (record: JevShadowRecord) => {
    record.comparison = compare(record.routeChoice, record.gemmaDecision);
    record.falseNegativeCandidate = record.routeChoice === 'clean' && record.gemmaDecision === 'revise';
};

const store = (record: JevShadowRecord) => {
    recentRecords.push(record);
    if (recentRecords.length > MAX_JEV_SHADOW_RECORDS) recentRecords.splice(0, recentRecords.length - MAX_JEV_SHADOW_RECORDS);
};

// This explicit whitelist is the public diagnostics boundary. Never add review text or state here.
const cloneRecord = (record: JevShadowRecord): JevShadowRecord => ({
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
    comparison: record.comparison,
    falseNegativeCandidate: record.falseNegativeCandidate,
});

export const getJevShadowRecords = (): JevShadowRecord[] => recentRecords.map(cloneRecord);

export const clearJevShadowRecords = () => { recentRecords.splice(0, recentRecords.length); };

export const getJevShadowRecordsForTest = getJevShadowRecords;
export const clearJevShadowRecordsForTest = clearJevShadowRecords;

export const startJevShadowEvaluation = ({
    requestId,
    mode,
    ccMode,
    state,
    signal,
    evaluate = evaluateJevShadow,
    now = () => performance.now(),
}: {
    requestId: string;
    mode: 'single' | 'group';
    ccMode: boolean;
    state: Readonly<ReviewState>;
    signal: AbortSignal;
    evaluate?: typeof evaluateJevShadow;
    now?: () => number;
}): JevShadowTracker => {
    const startedAt = now();
    let gemmaDecision: JevShadowRecord['gemmaDecision'];
    let storedRecord: JevShadowRecord | undefined;
    const setGemmaDecision = (decision: NonNullable<JevShadowRecord['gemmaDecision']>) => {
        gemmaDecision = decision;
        if (storedRecord) {
            storedRecord.gemmaDecision = decision;
            refreshComparison(storedRecord);
        }
    };

    void Promise.resolve(evaluate(state, signal)).then((result: JevShadowResult) => {
        const record: JevShadowRecord = {
            requestId,
            mode,
            ccMode,
            status: result.status,
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
            gemmaDecision,
        };
        if (result.status === 'unavailable') {
            const sanitized = normalizeJevShadowResult({
                status: 'unavailable',
                reasonCode: result.reasonCode,
                networkCode: result.networkCode,
            });
            if (sanitized?.status === 'unavailable') {
                record.reasonCode = sanitized.reasonCode;
                record.networkCode = sanitized.networkCode;
            }
        }
        if (result.status === 'ok' && result.route && result.signals) {
            record.servedModel = result.model;
            record.routeChoice = result.route.choice;
            record.routeConfidence = result.route.confidence;
            record.routeCleanProbability = result.route.probabilities.clean;
            record.routeFullReviewProbability = result.route.probabilities.full_review;
            record.signals = { ...result.signals };
            record.usageInputTokens = result.usage?.inputTokens;
            record.usageOutputTokens = result.usage?.outputTokens;
            record.usageCost = result.usage?.cost;
        }
        refreshComparison(record);
        storedRecord = record;
        store(record);
    }).catch(() => {
        const record: JevShadowRecord = {
            requestId,
            mode,
            ccMode,
            status: 'unavailable',
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
            gemmaDecision,
        };
        refreshComparison(record);
        storedRecord = record;
        store(record);
    });

    return { recordGemmaDecision: setGemmaDecision };
};
