import type { JevGroupGateSemanticSignals, JevShadowRecord } from './jevShadow.js';
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
    deterministicGroupNarration: {
        checkedCount: number;
        violationCount: number;
        clearCount: number;
        withGemmaIssueAndViolation: number;
        withGemmaIssueButClear: number;
        withoutGemmaIssueButViolation: number;
        withoutGemmaIssueAndClear: number;
        jevAverageWhenViolation: number;
        jevAverageWhenClear: number;
    };
    groupGateTrial: {
        status: Record<'ok' | 'unavailable' | 'aborted', number>;
        observedCount: number;
        averageLatencyMs: number;
        maxLatencyMs: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        totalCost: number;
        semanticSignalCount: number;
        semanticSignalAverages: Record<keyof JevGroupGateSemanticSignals, number>;
        gemmaKeep: { count: number; average: number; minimum: number; maximum: number };
        gemmaSemanticRevise: { count: number; average: number; minimum: number; maximum: number };
        deterministicOnlyNarration: { count: number; average: number };
        gemmaNarrationButDeterministicClear: { count: number; average: number };
    };
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

const GROUP_GATE_SEMANTIC_SIGNAL_KEYS = [
    'requestMismatch', 'identityConflict', 'speakerOwnershipViolation', 'continuityViolation',
    'realityLayerViolation', 'wardrobeConflict', 'stateConflict', 'replayedBeat',
    'personaVoiceViolation', 'thirdPartySpeechViolation', 'userAgencyViolation', 'incompleteEnding',
    'otherDefect',
] as const satisfies readonly (keyof JevGroupGateSemanticSignals)[];

const roundedAverage = (values: readonly number[]) => (
    values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : 0
);
const summarizeProbabilityValues = (values: readonly number[]) => ({
    count: values.length,
    average: roundedAverage(values),
    minimum: values.length ? Math.min(...values) : 0,
    maximum: values.length ? Math.max(...values) : 0,
});

const cloneGroupGateTrial = (trial: JevShadowRecord['groupGateTrial']): JevShadowRecord['groupGateTrial'] => trial ? ({
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
        deterministicGroupNarration: {
            checkedCount: 0,
            violationCount: 0,
            clearCount: 0,
            withGemmaIssueAndViolation: 0,
            withGemmaIssueButClear: 0,
            withoutGemmaIssueButViolation: 0,
            withoutGemmaIssueAndClear: 0,
            jevAverageWhenViolation: 0,
            jevAverageWhenClear: 0,
        },
        groupGateTrial: {
            status: { ok: 0, unavailable: 0, aborted: 0 },
            observedCount: 0,
            averageLatencyMs: 0,
            maxLatencyMs: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCost: 0,
            semanticSignalCount: 0,
            semanticSignalAverages: Object.fromEntries(GROUP_GATE_SEMANTIC_SIGNAL_KEYS.map(key => [key, 0])) as Record<keyof JevGroupGateSemanticSignals, number>,
            gemmaKeep: { count: 0, average: 0, minimum: 0, maximum: 0 },
            gemmaSemanticRevise: { count: 0, average: 0, minimum: 0, maximum: 0 },
            deterministicOnlyNarration: { count: 0, average: 0 },
            gemmaNarrationButDeterministicClear: { count: 0, average: 0 },
        },
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
    let deterministicViolationJevTotal = 0;
    let deterministicViolationJevCount = 0;
    let deterministicClearJevTotal = 0;
    let deterministicClearJevCount = 0;
    let groupGateLatencyTotal = 0;
    let groupGateLatencyCount = 0;
    const groupGateGemmaKeep: number[] = [];
    const groupGateGemmaSemanticRevise: number[] = [];
    const groupGateDeterministicOnlyNarration: number[] = [];
    const groupGateGemmaNarrationButDeterministicClear: number[] = [];

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
        const primaryInputTokens = record.usageInputTokens
            ?? (record.mode === 'group' ? record.groupGateTrial?.usageInputTokens : undefined);
        const primaryOutputTokens = record.usageOutputTokens
            ?? (record.mode === 'group' ? record.groupGateTrial?.usageOutputTokens : undefined);
        const primaryCost = record.usageCost
            ?? (record.mode === 'group' ? record.groupGateTrial?.usageCost : undefined);
        summary.usage.totalInputTokens += primaryInputTokens || 0;
        summary.usage.totalOutputTokens += primaryOutputTokens || 0;
        summary.usage.totalCost += primaryCost || 0;
        if (primaryInputTokens !== undefined) inputTokenCount += 1;
        if (record.signals) {
            signalCount += 1;
            for (const key of JEV_SIGNAL_KEYS) summary.signalAverages[key] += record.signals[key];
        }

        if (record.mode === 'group' && typeof record.deterministicGroupNarrationViolation === 'boolean') {
            const deterministic = summary.deterministicGroupNarration;
            deterministic.checkedCount += 1;
            if (record.deterministicGroupNarrationViolation) deterministic.violationCount += 1;
            else deterministic.clearCount += 1;

            if (record.signals) {
                if (record.deterministicGroupNarrationViolation) {
                    deterministicViolationJevTotal += record.signals.groupNarrationViolation;
                    deterministicViolationJevCount += 1;
                } else {
                    deterministicClearJevTotal += record.signals.groupNarrationViolation;
                    deterministicClearJevCount += 1;
                }
            }

            if (record.gemmaDecision === 'keep' || record.gemmaDecision === 'revise') {
                const hasGemmaIssue = sanitizeStrictReviewIssueCodes(record.gemmaIssueCodes).includes('group_narration');
                if (hasGemmaIssue && record.deterministicGroupNarrationViolation) deterministic.withGemmaIssueAndViolation += 1;
                else if (hasGemmaIssue) deterministic.withGemmaIssueButClear += 1;
                else if (record.deterministicGroupNarrationViolation) deterministic.withoutGemmaIssueButViolation += 1;
                else deterministic.withoutGemmaIssueAndClear += 1;
            }
        }

        const groupGateTrial = record.groupGateTrial;
        if (groupGateTrial) {
            summary.groupGateTrial.status[groupGateTrial.status] += 1;
            summary.groupGateTrial.totalInputTokens += groupGateTrial.usageInputTokens || 0;
            summary.groupGateTrial.totalOutputTokens += groupGateTrial.usageOutputTokens || 0;
            summary.groupGateTrial.totalCost += groupGateTrial.usageCost || 0;
            if (groupGateTrial.status === 'ok') {
                groupGateLatencyTotal += groupGateTrial.latencyMs;
                groupGateLatencyCount += 1;
                summary.groupGateTrial.maxLatencyMs = Math.max(summary.groupGateTrial.maxLatencyMs, groupGateTrial.latencyMs);
                if (groupGateTrial.semanticSignals) {
                    summary.groupGateTrial.semanticSignalCount += 1;
                    for (const key of GROUP_GATE_SEMANTIC_SIGNAL_KEYS) {
                        summary.groupGateTrial.semanticSignalAverages[key] += groupGateTrial.semanticSignals[key];
                    }
                }
            }

            if (
                groupGateTrial.status === 'ok'
                && groupGateTrial.requiresRevision !== undefined
                && (record.gemmaDecision === 'keep' || record.gemmaDecision === 'revise')
            ) {
                summary.groupGateTrial.observedCount += 1;
                const value = groupGateTrial.requiresRevision;
                const issueCodes = sanitizeStrictReviewIssueCodes(record.gemmaIssueCodes);
                const semanticIssues = issueCodes.filter(code => code !== 'group_narration');
                const hasGroupNarrationIssue = issueCodes.includes('group_narration');

                if (record.gemmaDecision === 'keep') {
                    groupGateGemmaKeep.push(value);
                } else if (semanticIssues.length > 0) {
                    groupGateGemmaSemanticRevise.push(value);
                }

                if (
                    record.gemmaDecision === 'revise'
                    && semanticIssues.length === 0
                    && hasGroupNarrationIssue
                    && record.deterministicGroupNarrationViolation === true
                ) {
                    groupGateDeterministicOnlyNarration.push(value);
                }
                if (
                    record.gemmaDecision === 'revise'
                    && hasGroupNarrationIssue
                    && record.deterministicGroupNarrationViolation === false
                ) {
                    groupGateGemmaNarrationButDeterministicClear.push(value);
                }
            }
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

            const productionWardrobeSignal = record.signals?.wardrobeConflict
                ?? record.groupGateTrial?.semanticSignals?.wardrobeConflict;
            if (productionWardrobeSignal !== undefined && trial.wardrobeConflict !== undefined) {
                summary.wardrobeTrial.pairedCount += 1;
                pairedProductionTotal += productionWardrobeSignal;
                pairedTrialTotal += trial.wardrobeConflict;

                if (record.gemmaDecision === 'keep' || record.gemmaDecision === 'revise') {
                    const hasWardrobeIssue = sanitizeStrictReviewIssueCodes(record.gemmaIssueCodes).includes('wardrobe');
                    if (hasWardrobeIssue) {
                        summary.wardrobeTrial.withGemmaWardrobeIssue.count += 1;
                        withWardrobeIssueProductionTotal += productionWardrobeSignal;
                        withWardrobeIssueTrialTotal += trial.wardrobeConflict;
                    } else {
                        summary.wardrobeTrial.withoutGemmaWardrobeIssue.count += 1;
                        withoutWardrobeIssueProductionTotal += productionWardrobeSignal;
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
    summary.deterministicGroupNarration.jevAverageWhenViolation = deterministicViolationJevCount
        ? Number((deterministicViolationJevTotal / deterministicViolationJevCount).toFixed(3))
        : 0;
    summary.deterministicGroupNarration.jevAverageWhenClear = deterministicClearJevCount
        ? Number((deterministicClearJevTotal / deterministicClearJevCount).toFixed(3))
        : 0;

    summary.groupGateTrial.averageLatencyMs = groupGateLatencyCount
        ? Math.round(groupGateLatencyTotal / groupGateLatencyCount)
        : 0;
    if (summary.groupGateTrial.semanticSignalCount) {
        for (const key of GROUP_GATE_SEMANTIC_SIGNAL_KEYS) {
            summary.groupGateTrial.semanticSignalAverages[key] = Number((
                summary.groupGateTrial.semanticSignalAverages[key] / summary.groupGateTrial.semanticSignalCount
            ).toFixed(3));
        }
    }
    summary.groupGateTrial.gemmaKeep = summarizeProbabilityValues(groupGateGemmaKeep);
    summary.groupGateTrial.gemmaSemanticRevise = summarizeProbabilityValues(groupGateGemmaSemanticRevise);
    summary.groupGateTrial.deterministicOnlyNarration = {
        count: groupGateDeterministicOnlyNarration.length,
        average: roundedAverage(groupGateDeterministicOnlyNarration),
    };
    summary.groupGateTrial.gemmaNarrationButDeterministicClear = {
        count: groupGateGemmaNarrationButDeterministicClear.length,
        average: roundedAverage(groupGateGemmaNarrationButDeterministicClear),
    };

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
