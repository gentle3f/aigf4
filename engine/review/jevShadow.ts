import type { ReviewState } from '../contracts.js';
import { sanitizeStrictReviewIssueCodes } from '../../strictReview.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import { evaluateJevShadow, normalizeJevShadowResult } from './jevDecisionProvider.js';
import type { JevShadowResult } from './jevDecisionProvider.js';

export interface JevShadowRecord {
    taxonomyVersion: 'v3';
    requestId: string;
    mode: 'single' | 'group';
    ccMode: boolean;
    status: 'ok' | 'unavailable' | 'aborted';
    reasonCode?: JevShadowResult['reasonCode'];
    networkCode?: JevShadowResult['networkCode'];
    latencyMs: number;
    servedModel?: string;
    signals?: NonNullable<JevShadowResult['signals']>;
    usageInputTokens?: number;
    usageOutputTokens?: number;
    usageCost?: number;
    gemmaDecision?: 'keep' | 'revise' | 'unavailable';
    gemmaIssueCodes?: StrictReviewIssueCode[];
    gemmaComparableIssueCodes?: StrictReviewIssueCode[];
    gemmaIssueAnomalies?: StrictReviewIssueCode[];
}

export interface JevShadowTracker {
    recordGemmaDecision(decision: 'keep' | 'revise' | 'unavailable', issueCodes?: readonly StrictReviewIssueCode[]): void;
}

const MAX_JEV_SHADOW_RECORDS = 50;
const recentRecords: JevShadowRecord[] = [];

const classifyGemmaIssueCodes = (mode: JevShadowRecord['mode'], issueCodes: readonly StrictReviewIssueCode[] | undefined) => {
    const gemmaIssueCodes = sanitizeStrictReviewIssueCodes(issueCodes);
    const gemmaIssueAnomalies = mode === 'single'
        ? gemmaIssueCodes.filter(code => code === 'group_narration')
        : [];
    const gemmaComparableIssueCodes = gemmaIssueCodes.filter(code => code !== 'group_narration' || mode !== 'single');
    return { gemmaIssueCodes, gemmaComparableIssueCodes, gemmaIssueAnomalies };
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
    signals: record.signals ? { ...record.signals } : undefined,
    usageInputTokens: record.usageInputTokens,
    usageOutputTokens: record.usageOutputTokens,
    usageCost: record.usageCost,
    gemmaDecision: record.gemmaDecision,
    gemmaIssueCodes: record.gemmaIssueCodes ? [...record.gemmaIssueCodes] : undefined,
    gemmaComparableIssueCodes: record.gemmaComparableIssueCodes ? [...record.gemmaComparableIssueCodes] : undefined,
    gemmaIssueAnomalies: record.gemmaIssueAnomalies ? [...record.gemmaIssueAnomalies] : undefined,
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
    let gemmaComparableIssueCodes: StrictReviewIssueCode[] | undefined;
    let gemmaIssueAnomalies: StrictReviewIssueCode[] | undefined;
    let storedRecord: JevShadowRecord | undefined;
    const setGemmaDecision = (
        decision: NonNullable<JevShadowRecord['gemmaDecision']>,
        issueCodes?: readonly StrictReviewIssueCode[],
    ) => {
        gemmaDecision = decision;
        const issueMetadata = decision === 'unavailable'
            ? undefined
            : classifyGemmaIssueCodes(mode, decision === 'keep' ? [] : (() => {
                const sanitized = sanitizeStrictReviewIssueCodes(issueCodes);
                return sanitized.length ? sanitized : ['other'];
            })());
        gemmaIssueCodes = issueMetadata?.gemmaIssueCodes;
        gemmaComparableIssueCodes = issueMetadata?.gemmaComparableIssueCodes;
        gemmaIssueAnomalies = issueMetadata?.gemmaIssueAnomalies;
        if (storedRecord) {
            storedRecord.gemmaDecision = decision;
            storedRecord.gemmaIssueCodes = gemmaIssueCodes ? [...gemmaIssueCodes] : undefined;
            storedRecord.gemmaComparableIssueCodes = gemmaComparableIssueCodes ? [...gemmaComparableIssueCodes] : undefined;
            storedRecord.gemmaIssueAnomalies = gemmaIssueAnomalies ? [...gemmaIssueAnomalies] : undefined;
        }
    };

    void Promise.resolve(evaluate(state, signal)).then((result: JevShadowResult) => {
        const record: JevShadowRecord = {
            taxonomyVersion: 'v3',
            requestId,
            mode,
            ccMode,
            status: result.status,
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
            gemmaDecision,
            gemmaIssueCodes: gemmaIssueCodes ? [...gemmaIssueCodes] : undefined,
            gemmaComparableIssueCodes: gemmaComparableIssueCodes ? [...gemmaComparableIssueCodes] : undefined,
            gemmaIssueAnomalies: gemmaIssueAnomalies ? [...gemmaIssueAnomalies] : undefined,
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
        if (result.status === 'ok' && result.signals) {
            record.servedModel = result.model;
            record.signals = { ...result.signals };
            record.usageInputTokens = result.usage?.inputTokens;
            record.usageOutputTokens = result.usage?.outputTokens;
            record.usageCost = result.usage?.cost;
        }
        storedRecord = record;
        store(record);
    }).catch(() => {
        const record: JevShadowRecord = {
            taxonomyVersion: 'v3',
            requestId,
            mode,
            ccMode,
            status: 'unavailable',
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
            gemmaDecision,
            gemmaIssueCodes: gemmaIssueCodes ? [...gemmaIssueCodes] : undefined,
            gemmaComparableIssueCodes: gemmaComparableIssueCodes ? [...gemmaComparableIssueCodes] : undefined,
            gemmaIssueAnomalies: gemmaIssueAnomalies ? [...gemmaIssueAnomalies] : undefined,
        };
        storedRecord = record;
        store(record);
    });

    return { recordGemmaDecision: setGemmaDecision };
};
