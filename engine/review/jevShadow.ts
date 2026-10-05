import type { ReviewState } from '../contracts.js';
import { sanitizeStrictReviewIssueCodes } from '../../strictReview.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import { evaluateJevGroupGateShadowTrial, evaluateJevShadow, evaluateJevWardrobeShadowTrial, normalizeJevShadowResult } from './jevDecisionProvider.js';
import type { JevShadowResult } from './jevDecisionProvider.js';
import {
    clearPersistedJevShadowRecords,
    loadPersistedJevShadowRecords,
    MAX_PERSISTED_JEV_SHADOW_RECORDS,
    persistJevShadowRecords,
} from './jevShadowStorage.js';

export interface JevWardrobeShadowTrialRecord {
    profile: 'wardrobe-v4';
    status: 'ok' | 'unavailable' | 'aborted';
    reasonCode?: JevShadowResult['reasonCode'];
    networkCode?: JevShadowResult['networkCode'];
    latencyMs: number;
    servedModel?: string;
    wardrobeConflict?: number;
    usageInputTokens?: number;
    usageOutputTokens?: number;
    usageCost?: number;
}

export type JevGroupGateSemanticSignals = Omit<NonNullable<JevShadowResult['signals']>, 'groupNarrationViolation'>;

export interface JevGroupGateShadowTrialRecord {
    profile: 'group-gate-v2';
    status: 'ok' | 'unavailable' | 'aborted';
    reasonCode?: JevShadowResult['reasonCode'];
    networkCode?: JevShadowResult['networkCode'];
    latencyMs: number;
    servedModel?: string;
    requiresRevision?: number;
    semanticSignals?: JevGroupGateSemanticSignals;
    usageInputTokens?: number;
    usageOutputTokens?: number;
    usageCost?: number;
}

export interface JevShadowRecord {
    taxonomyVersion: 'v3';
    calibrationCohort?: 'group-deterministic-v1';
    requestId: string;
    mode: 'single' | 'group';
    ccMode: boolean;
    deterministicGroupNarrationViolation?: boolean;
    status: 'ok' | 'unavailable' | 'aborted';
    reasonCode?: JevShadowResult['reasonCode'];
    networkCode?: JevShadowResult['networkCode'];
    latencyMs: number;
    servedModel?: string;
    signals?: NonNullable<JevShadowResult['signals']>;
    usageInputTokens?: number;
    usageOutputTokens?: number;
    usageCost?: number;
    wardrobeTrial?: JevWardrobeShadowTrialRecord;
    groupGateTrial?: JevGroupGateShadowTrialRecord;
    gemmaDecision?: 'keep' | 'revise' | 'unavailable';
    gemmaIssueCodes?: StrictReviewIssueCode[];
    gemmaComparableIssueCodes?: StrictReviewIssueCode[];
    gemmaIssueAnomalies?: StrictReviewIssueCode[];
}

export interface JevShadowTracker {
    recordGemmaDecision(decision: 'keep' | 'revise' | 'unavailable', issueCodes?: readonly StrictReviewIssueCode[]): void;
}

const recentRecords: JevShadowRecord[] = [];
let persistenceHydrated = false;

const hydratePersistedRecords = () => {
    if (persistenceHydrated) return;
    persistenceHydrated = true;
    recentRecords.push(...loadPersistedJevShadowRecords());
    if (recentRecords.length > MAX_PERSISTED_JEV_SHADOW_RECORDS) {
        recentRecords.splice(0, recentRecords.length - MAX_PERSISTED_JEV_SHADOW_RECORDS);
    }
};

const persistRecentRecords = () => {
    persistJevShadowRecords(recentRecords);
};

const classifyGemmaIssueCodes = (mode: JevShadowRecord['mode'], issueCodes: readonly StrictReviewIssueCode[] | undefined) => {
    const gemmaIssueCodes = sanitizeStrictReviewIssueCodes(issueCodes);
    const gemmaIssueAnomalies = mode === 'single'
        ? gemmaIssueCodes.filter(code => code === 'group_narration')
        : [];
    const gemmaComparableIssueCodes = gemmaIssueCodes.filter(code => code !== 'group_narration' || mode !== 'single');
    return { gemmaIssueCodes, gemmaComparableIssueCodes, gemmaIssueAnomalies };
};

const store = (record: JevShadowRecord) => {
    hydratePersistedRecords();
    recentRecords.push(record);
    if (recentRecords.length > MAX_PERSISTED_JEV_SHADOW_RECORDS) {
        recentRecords.splice(0, recentRecords.length - MAX_PERSISTED_JEV_SHADOW_RECORDS);
    }
    persistRecentRecords();
};

const cloneGroupGateTrial = (trial: JevGroupGateShadowTrialRecord | undefined): JevGroupGateShadowTrialRecord | undefined => trial ? ({
    profile: trial.profile,
    status: trial.status,
    reasonCode: trial.reasonCode,
    networkCode: trial.networkCode,
    latencyMs: trial.latencyMs,
    servedModel: trial.servedModel,
    requiresRevision: trial.requiresRevision,
    semanticSignals: trial.semanticSignals ? { ...trial.semanticSignals } : undefined,
    usageInputTokens: trial.usageInputTokens,
    usageOutputTokens: trial.usageOutputTokens,
    usageCost: trial.usageCost,
}) : undefined;

const cloneWardrobeTrial = (trial: JevWardrobeShadowTrialRecord | undefined): JevWardrobeShadowTrialRecord | undefined => trial ? ({
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

// This explicit whitelist is the public diagnostics boundary. Never add review text or state here.
const cloneRecord = (record: JevShadowRecord): JevShadowRecord => ({
    taxonomyVersion: record.taxonomyVersion,
    calibrationCohort: record.calibrationCohort,
    requestId: record.requestId,
    mode: record.mode,
    ccMode: record.ccMode,
    deterministicGroupNarrationViolation: record.deterministicGroupNarrationViolation,
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
    groupGateTrial: cloneGroupGateTrial(record.groupGateTrial),
    gemmaDecision: record.gemmaDecision,
    gemmaIssueCodes: record.gemmaIssueCodes ? [...record.gemmaIssueCodes] : undefined,
    gemmaComparableIssueCodes: record.gemmaComparableIssueCodes ? [...record.gemmaComparableIssueCodes] : undefined,
    gemmaIssueAnomalies: record.gemmaIssueAnomalies ? [...record.gemmaIssueAnomalies] : undefined,
});

export const getJevShadowRecords = (): JevShadowRecord[] => {
    hydratePersistedRecords();
    return recentRecords.map(cloneRecord);
};

export const clearJevShadowRecords = () => {
    persistenceHydrated = true;
    recentRecords.splice(0, recentRecords.length);
    clearPersistedJevShadowRecords();
};

export const getJevShadowRecordsForTest = getJevShadowRecords;
export const clearJevShadowRecordsForTest = clearJevShadowRecords;
export const resetJevShadowPersistenceForTest = () => {
    recentRecords.splice(0, recentRecords.length);
    persistenceHydrated = false;
};

export const startJevShadowEvaluation = ({
    requestId,
    mode,
    ccMode,
    deterministicGroupNarrationViolation,
    state,
    signal,
    evaluate = evaluateJevShadow,
    evaluateWardrobeTrial = evaluateJevWardrobeShadowTrial,
    evaluateGroupGateTrial = evaluateJevGroupGateShadowTrial,
    onRecordUpdate,
    now = () => performance.now(),
}: {
    requestId: string;
    mode: 'single' | 'group';
    ccMode: boolean;
    deterministicGroupNarrationViolation?: boolean;
    state: Readonly<ReviewState>;
    signal: AbortSignal;
    evaluate?: typeof evaluateJevShadow;
    evaluateWardrobeTrial?: typeof evaluateJevWardrobeShadowTrial;
    evaluateGroupGateTrial?: typeof evaluateJevGroupGateShadowTrial;
    onRecordUpdate?: (record: JevShadowRecord) => void;
    now?: () => number;
}): JevShadowTracker => {
    const startedAt = now();
    let gemmaDecision: JevShadowRecord['gemmaDecision'];
    let gemmaIssueCodes: StrictReviewIssueCode[] | undefined;
    let gemmaComparableIssueCodes: StrictReviewIssueCode[] | undefined;
    let gemmaIssueAnomalies: StrictReviewIssueCode[] | undefined;
    let storedRecord: JevShadowRecord | undefined;
    let wardrobeTrial: JevWardrobeShadowTrialRecord | undefined;
    let groupGateTrial: JevGroupGateShadowTrialRecord | undefined;

    const publishStoredRecord = () => {
        if (!storedRecord || !onRecordUpdate) return;
        try {
            onRecordUpdate(cloneRecord(storedRecord));
        } catch {
            // Research/diagnostic observers must never affect chat or review.
        }
    };

    const setWardrobeTrial = (result: JevShadowResult) => {
        const trial: JevWardrobeShadowTrialRecord = {
            profile: 'wardrobe-v4',
            status: result.status,
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
        };
        if (result.status === 'unavailable') {
            const sanitized = normalizeJevShadowResult({
                status: 'unavailable',
                reasonCode: result.reasonCode,
                networkCode: result.networkCode,
            });
            if (sanitized?.status === 'unavailable') {
                trial.reasonCode = sanitized.reasonCode;
                trial.networkCode = sanitized.networkCode;
            }
        }
        if (result.status === 'ok' && result.signals) {
            trial.servedModel = result.model;
            trial.wardrobeConflict = result.signals.wardrobeConflict;
            trial.usageInputTokens = result.usage?.inputTokens;
            trial.usageOutputTokens = result.usage?.outputTokens;
            trial.usageCost = result.usage?.cost;
        }
        wardrobeTrial = trial;
        if (storedRecord) {
            storedRecord.wardrobeTrial = cloneWardrobeTrial(trial);
            persistRecentRecords();
            publishStoredRecord();
        }
    };

    const setGroupGateTrial = (result: JevShadowResult) => {
        const trial: JevGroupGateShadowTrialRecord = {
            profile: 'group-gate-v2',
            status: result.status,
            latencyMs: Math.max(0, Math.round(now() - startedAt)),
        };
        if (result.status === 'unavailable') {
            const sanitized = normalizeJevShadowResult({
                status: 'unavailable',
                reasonCode: result.reasonCode,
                networkCode: result.networkCode,
            });
            if (sanitized?.status === 'unavailable') {
                trial.reasonCode = sanitized.reasonCode;
                trial.networkCode = sanitized.networkCode;
            }
        }
        if (result.status === 'ok' && result.signals) {
            trial.servedModel = result.model;
            trial.requiresRevision = result.signals.groupNarrationViolation;
            const { groupNarrationViolation: _groupGateSignal, ...semanticSignals } = result.signals;
            trial.semanticSignals = semanticSignals;
            trial.usageInputTokens = result.usage?.inputTokens;
            trial.usageOutputTokens = result.usage?.outputTokens;
            trial.usageCost = result.usage?.cost;
        }
        groupGateTrial = trial;
        if (storedRecord) {
            storedRecord.groupGateTrial = cloneGroupGateTrial(trial);
            persistRecentRecords();
            publishStoredRecord();
        }
    };

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
            persistRecentRecords();
            publishStoredRecord();
        }
    };

    // Run the wardrobe-only wording trial beside the mode's primary Jev shadow.
    // It is observational metadata only and never participates in Gemma or response routing.
    void Promise.resolve(evaluateWardrobeTrial(state, signal))
        .then((result: JevShadowResult) => setWardrobeTrial(result))
        .catch(() => setWardrobeTrial({ status: 'unavailable' }));

    const createBaseRecord = (
        status: JevShadowRecord['status'],
        latencyMs: number,
    ): JevShadowRecord => ({
        taxonomyVersion: 'v3',
        calibrationCohort: mode === 'group' && deterministicGroupNarrationViolation !== undefined ? 'group-deterministic-v1' : undefined,
        requestId,
        mode,
        ccMode,
        deterministicGroupNarrationViolation: mode === 'group' ? deterministicGroupNarrationViolation : undefined,
        status,
        latencyMs,
        wardrobeTrial: cloneWardrobeTrial(wardrobeTrial),
        groupGateTrial: cloneGroupGateTrial(groupGateTrial),
        gemmaDecision,
        gemmaIssueCodes: gemmaIssueCodes ? [...gemmaIssueCodes] : undefined,
        gemmaComparableIssueCodes: gemmaComparableIssueCodes ? [...gemmaComparableIssueCodes] : undefined,
        gemmaIssueAnomalies: gemmaIssueAnomalies ? [...gemmaIssueAnomalies] : undefined,
    });

    const applyUnavailableMetadata = (record: JevShadowRecord, result: JevShadowResult) => {
        if (result.status !== 'unavailable') return;
        const sanitized = normalizeJevShadowResult({
            status: 'unavailable',
            reasonCode: result.reasonCode,
            networkCode: result.networkCode,
        });
        if (sanitized?.status === 'unavailable') {
            record.reasonCode = sanitized.reasonCode;
            record.networkCode = sanitized.networkCode;
        }
    };

    if (mode === 'group') {
        // The V2 Group gate replaces the duplicate V3 Group shadow request.
        // It keeps the other thirteen semantic signals inside groupGateTrial while
        // Gemma remains the only authority and wardrobe wording stays a separate trial.
        const storeGroupGateResult = (result: JevShadowResult) => {
            setGroupGateTrial(result);
            const record = createBaseRecord(
                result.status,
                Math.max(0, Math.round(now() - startedAt)),
            );
            applyUnavailableMetadata(record, result);
            storedRecord = record;
            store(record);
            publishStoredRecord();
        };
        void Promise.resolve(evaluateGroupGateTrial(state, signal))
            .then(storeGroupGateResult)
            .catch(() => storeGroupGateResult({ status: 'unavailable' }));
    } else {
        // Single/Cc retain the frozen production V3 shadow unchanged.
        void Promise.resolve(evaluate(state, signal)).then((result: JevShadowResult) => {
            const record = createBaseRecord(
                result.status,
                Math.max(0, Math.round(now() - startedAt)),
            );
            applyUnavailableMetadata(record, result);
            if (result.status === 'ok' && result.signals) {
                record.servedModel = result.model;
                record.signals = { ...result.signals };
                record.usageInputTokens = result.usage?.inputTokens;
                record.usageOutputTokens = result.usage?.outputTokens;
                record.usageCost = result.usage?.cost;
            }
            storedRecord = record;
            store(record);
            publishStoredRecord();
        }).catch(() => {
            const record = createBaseRecord(
                'unavailable',
                Math.max(0, Math.round(now() - startedAt)),
            );
            storedRecord = record;
            store(record);
            publishStoredRecord();
        });
    }

    return { recordGemmaDecision: setGemmaDecision };
};
