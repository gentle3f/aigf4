import type { ReviewState } from '../contracts.js';
import { sanitizeStrictReviewIssueCodes } from '../../strictReview.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import { evaluateJevShadow, normalizeJevShadowResult } from './jevDecisionProvider.js';
import type { JevShadowResult } from './jevDecisionProvider.js';

export interface JevShadowRecord {
    taxonomyVersion: 'v2';
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
    gemmaIssueCodes?: StrictReviewIssueCode[];
    comparison?: 'agree' | 'disagree' | 'unknown';
    falseNegativeCandidate?: boolean;
}

export interface JevShadowTracker {
    recordGemmaDecision(decision: 'keep' | 'revise' | 'unavailable', issueCodes?: readonly StrictReviewIssueCode[]): void;
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
    gemmaIssueCodes: record.gemmaIssueCodes ? [...record.gemmaIssueCodes] : undefined,
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
    let gemmaIssueCodes: StrictReviewIssueCode[] | undefined;
    let storedRecord: JevShadowRecord | undefined;
    const setGemmaDecision = (
        decision: NonNullable<JevShadowRecord['gemmaDecision']>,
        issueCodes?: readonly StrictReviewIssueCode[],
    ) => {
        gemmaDecision = decision;
        gemmaIssueCodes = decision === 'unavailable'
            ? undefined
            : decision === 'keep'
                ? []
                : (() => {
                    const sanitized = sanitizeStrictReviewIssueCodes(issueCodes);
                    return sanitized.length ? sanitized : ['other'];
                })();
        if (storedRecord) {
            storedRecord.gemmaDecision = decision;
            storedRecord.gemmaIssueCodes = gemmaIssueCodes ? [...gemmaIssueCodes] : undefined;
            refreshComparison(storedRecord);
        }
    };

    void Promise.resolve(evaluate(state, signal)).then((result: JevShadowResult) => {
        const record: JevShadowRecord = {
            taxonomyVersion: 'v2',
            requestId,
            mode,
            ccMode,
            status: result.status,
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
            gemmaDecision,
            gemmaIssueCodes: gemmaIssueCodes ? [...gemmaIssueCodes] : undefined,
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
            taxonomyVersion: 'v2',
            requestId,
            mode,
            ccMode,
            status: 'unavailable',
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
            gemmaDecision,
            gemmaIssueCodes: gemmaIssueCodes ? [...gemmaIssueCodes] : undefined,
        };
        refreshComparison(record);
        storedRecord = record;
        store(record);
    });

    return { recordGemmaDecision: setGemmaDecision };
};
