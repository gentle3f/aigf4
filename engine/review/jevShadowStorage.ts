import { sanitizeStrictReviewIssueCodes } from '../../strictReview.js';
import { normalizeJevShadowResult } from './jevDecisionProvider.js';
import type {
    JevGroupGateSemanticSignals,
    JevGroupGateShadowTrialRecord,
    JevShadowRecord,
    JevWardrobeShadowTrialRecord,
} from './jevShadow.js';

export const JEV_SHADOW_STORAGE_KEY = 'wetappJevShadowMetadataV1';
export const MAX_PERSISTED_JEV_SHADOW_RECORDS = 200;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const getStorage = (): StorageLike | null => {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
};

const safeString = (value: unknown, maxLength = 256) => (
    typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined
);

const safeNonNegativeNumber = (value: unknown) => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
);

const safeProbability = (value: unknown) => {
    const number = safeNonNegativeNumber(value);
    return number !== undefined && number <= 1 ? number : undefined;
};

const sanitizeUnavailableMetadata = (source: Record<string, unknown>) => {
    if (source.reasonCode === undefined) return {};
    const normalized = normalizeJevShadowResult({
        status: 'unavailable',
        reasonCode: source.reasonCode,
        networkCode: source.networkCode,
    });
    return normalized?.status === 'unavailable'
        ? { reasonCode: normalized.reasonCode, networkCode: normalized.networkCode }
        : {};
};

const sanitizeUsage = (source: Record<string, unknown>) => {
    const inputTokens = safeNonNegativeNumber(source.usageInputTokens);
    const outputTokens = safeNonNegativeNumber(source.usageOutputTokens);
    const cost = safeNonNegativeNumber(source.usageCost);
    return {
        ...(inputTokens !== undefined ? { usageInputTokens: inputTokens } : {}),
        ...(outputTokens !== undefined ? { usageOutputTokens: outputTokens } : {}),
        ...(cost !== undefined ? { usageCost: cost } : {}),
    };
};

const sanitizeWardrobeTrial = (value: unknown): JevWardrobeShadowTrialRecord | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Record<string, unknown>;
    if (source.profile !== 'wardrobe-v4') return undefined;
    if (source.status !== 'ok' && source.status !== 'unavailable' && source.status !== 'aborted') return undefined;
    const latencyMs = safeNonNegativeNumber(source.latencyMs);
    if (latencyMs === undefined) return undefined;

    const trial: JevWardrobeShadowTrialRecord = {
        profile: 'wardrobe-v4',
        status: source.status,
        latencyMs,
    };
    if (source.status === 'unavailable') Object.assign(trial, sanitizeUnavailableMetadata(source));
    if (source.status === 'ok') {
        const servedModel = safeString(source.servedModel, 160);
        const wardrobeConflict = safeProbability(source.wardrobeConflict);
        if (!servedModel || wardrobeConflict === undefined) return undefined;
        trial.servedModel = servedModel;
        trial.wardrobeConflict = wardrobeConflict;
        Object.assign(trial, sanitizeUsage(source));
    }
    return trial;
};

const GROUP_GATE_SEMANTIC_SIGNAL_KEYS = [
    'requestMismatch',
    'identityConflict',
    'speakerOwnershipViolation',
    'continuityViolation',
    'realityLayerViolation',
    'wardrobeConflict',
    'stateConflict',
    'replayedBeat',
    'personaVoiceViolation',
    'thirdPartySpeechViolation',
    'userAgencyViolation',
    'incompleteEnding',
    'otherDefect',
] as const satisfies readonly (keyof JevGroupGateSemanticSignals)[];

const sanitizeGroupGateSemanticSignals = (value: unknown): JevGroupGateSemanticSignals | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Record<string, unknown>;
    const allowed = new Set<string>(GROUP_GATE_SEMANTIC_SIGNAL_KEYS);
    if (Object.keys(source).length !== GROUP_GATE_SEMANTIC_SIGNAL_KEYS.length) return undefined;
    if (Object.keys(source).some(key => !allowed.has(key))) return undefined;

    const entries = GROUP_GATE_SEMANTIC_SIGNAL_KEYS.map(key => {
        const probability = safeProbability(source[key]);
        return probability === undefined ? undefined : [key, probability] as const;
    });
    if (entries.some(entry => entry === undefined)) return undefined;
    return Object.fromEntries(entries as readonly (readonly [keyof JevGroupGateSemanticSignals, number])[]) as JevGroupGateSemanticSignals;
};

const sanitizeGroupGateTrial = (value: unknown): JevGroupGateShadowTrialRecord | undefined => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const source = value as Record<string, unknown>;
    if (source.profile !== 'group-gate-v2') return undefined;
    if (source.status !== 'ok' && source.status !== 'unavailable' && source.status !== 'aborted') return undefined;
    const latencyMs = safeNonNegativeNumber(source.latencyMs);
    if (latencyMs === undefined) return undefined;

    const trial: JevGroupGateShadowTrialRecord = {
        profile: 'group-gate-v2',
        status: source.status,
        latencyMs,
    };
    if (source.status === 'unavailable') Object.assign(trial, sanitizeUnavailableMetadata(source));
    if (source.status === 'ok') {
        const servedModel = safeString(source.servedModel, 160);
        const requiresRevision = safeProbability(source.requiresRevision);
        if (!servedModel || requiresRevision === undefined) return undefined;
        trial.servedModel = servedModel;
        trial.requiresRevision = requiresRevision;
        if (source.semanticSignals !== undefined) {
            const semanticSignals = sanitizeGroupGateSemanticSignals(source.semanticSignals);
            if (!semanticSignals) return undefined;
            trial.semanticSignals = semanticSignals;
        }
        Object.assign(trial, sanitizeUsage(source));
    }
    return trial;
};

const sanitizeSignals = (source: Record<string, unknown>) => {
    const servedModel = safeString(source.servedModel, 160);
    if (!servedModel || !source.signals || typeof source.signals !== 'object' || Array.isArray(source.signals)) return undefined;
    const usage = sanitizeUsage(source);
    const normalized = normalizeJevShadowResult({
        status: 'ok',
        model: servedModel,
        signals: source.signals,
        usage: {
            ...(usage.usageInputTokens !== undefined ? { inputTokens: usage.usageInputTokens } : {}),
            ...(usage.usageOutputTokens !== undefined ? { outputTokens: usage.usageOutputTokens } : {}),
            ...(usage.usageCost !== undefined ? { cost: usage.usageCost } : {}),
        },
    });
    return normalized?.status === 'ok' ? normalized : undefined;
};

export const sanitizePersistedJevShadowRecord = (value: unknown): JevShadowRecord | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    if (source.taxonomyVersion !== 'v3') return null;
    const requestId = safeString(source.requestId);
    if (!requestId) return null;
    if (source.mode !== 'single' && source.mode !== 'group') return null;
    if (typeof source.ccMode !== 'boolean') return null;
    if (source.status !== 'ok' && source.status !== 'unavailable' && source.status !== 'aborted') return null;
    const latencyMs = safeNonNegativeNumber(source.latencyMs);
    if (latencyMs === undefined) return null;

    const record: JevShadowRecord = {
        taxonomyVersion: 'v3',
        requestId,
        mode: source.mode,
        ccMode: source.ccMode,
        status: source.status,
        latencyMs,
    };
    if (source.calibrationCohort === 'group-deterministic-v1') record.calibrationCohort = 'group-deterministic-v1';
    if (source.mode === 'group' && typeof source.deterministicGroupNarrationViolation === 'boolean') {
        record.deterministicGroupNarrationViolation = source.deterministicGroupNarrationViolation;
    }

    record.wardrobeTrial = sanitizeWardrobeTrial(source.wardrobeTrial);
    if (source.mode === 'group') record.groupGateTrial = sanitizeGroupGateTrial(source.groupGateTrial);

    if (source.status === 'unavailable') Object.assign(record, sanitizeUnavailableMetadata(source));
    if (source.status === 'ok') {
        if (source.signals !== undefined || source.servedModel !== undefined) {
            const normalized = sanitizeSignals(source);
            if (!normalized?.signals || !normalized.model) return null;
            record.servedModel = normalized.model;
            record.signals = { ...normalized.signals };
            record.usageInputTokens = normalized.usage?.inputTokens;
            record.usageOutputTokens = normalized.usage?.outputTokens;
            record.usageCost = normalized.usage?.cost;
        } else if (source.mode !== 'group' || record.groupGateTrial?.status !== 'ok') {
            return null;
        }
    }

    if (source.gemmaDecision === 'keep' || source.gemmaDecision === 'revise' || source.gemmaDecision === 'unavailable') {
        record.gemmaDecision = source.gemmaDecision;
    }
    if (Array.isArray(source.gemmaIssueCodes)) record.gemmaIssueCodes = sanitizeStrictReviewIssueCodes(source.gemmaIssueCodes);
    if (Array.isArray(source.gemmaComparableIssueCodes)) record.gemmaComparableIssueCodes = sanitizeStrictReviewIssueCodes(source.gemmaComparableIssueCodes);
    if (Array.isArray(source.gemmaIssueAnomalies)) record.gemmaIssueAnomalies = sanitizeStrictReviewIssueCodes(source.gemmaIssueAnomalies);

    return record;
};

export const loadPersistedJevShadowRecords = (): JevShadowRecord[] => {
    const storage = getStorage();
    if (!storage) return [];
    try {
        const raw = storage.getItem(JEV_SHADOW_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as { version?: unknown; records?: unknown };
        if (parsed?.version !== 1 || !Array.isArray(parsed.records)) return [];
        return parsed.records
            .map(sanitizePersistedJevShadowRecord)
            .filter((record): record is JevShadowRecord => Boolean(record))
            .slice(-MAX_PERSISTED_JEV_SHADOW_RECORDS);
    } catch {
        return [];
    }
};

export const persistJevShadowRecords = (records: readonly JevShadowRecord[]) => {
    const storage = getStorage();
    if (!storage) return;
    try {
        const safeRecords = records
            .map(sanitizePersistedJevShadowRecord)
            .filter((record): record is JevShadowRecord => Boolean(record))
            .slice(-MAX_PERSISTED_JEV_SHADOW_RECORDS);
        storage.setItem(JEV_SHADOW_STORAGE_KEY, JSON.stringify({ version: 1, records: safeRecords }));
    } catch {
        // Diagnostics persistence is best-effort and must never affect chat/review.
    }
};

export const clearPersistedJevShadowRecords = () => {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.removeItem(JEV_SHADOW_STORAGE_KEY);
    } catch {
        // Diagnostics persistence is best-effort and must never affect chat/review.
    }
};
