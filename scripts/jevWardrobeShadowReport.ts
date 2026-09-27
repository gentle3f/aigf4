import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Status = 'ok' | 'unavailable' | 'aborted';
type GemmaDecision = 'keep' | 'revise' | 'unavailable';

type SafeRecord = {
    taxonomyVersion?: string;
    requestId?: string;
    mode?: 'single' | 'group';
    ccMode?: boolean;
    status?: Status;
    signals?: { wardrobeConflict?: number };
    wardrobeTrial?: {
        profile?: string;
        status?: Status;
        wardrobeConflict?: number;
        latencyMs?: number;
        usageInputTokens?: number;
        usageOutputTokens?: number;
        usageCost?: number;
    };
    gemmaDecision?: GemmaDecision;
    gemmaIssueCodes?: string[];
};

const ALLOWED_RECORD_KEYS = new Set([
    'taxonomyVersion', 'requestId', 'mode', 'ccMode', 'status', 'reasonCode', 'networkCode',
    'latencyMs', 'servedModel', 'signals', 'usageInputTokens', 'usageOutputTokens', 'usageCost',
    'wardrobeTrial', 'gemmaDecision', 'gemmaIssueCodes', 'gemmaComparableIssueCodes', 'gemmaIssueAnomalies',
]);

const PRIVATE_FIELD_PATTERN = /state|candidate|history|persona|prompt|message|response|authorization|api.?key|bearer/i;

const mean = (values: readonly number[]) => values.length
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3))
    : 0;

const validProbability = (value: unknown): value is number => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
);

const groupMetrics = (records: readonly SafeRecord[]) => {
    const paired = records.filter(record => (
        validProbability(record.signals?.wardrobeConflict)
        && validProbability(record.wardrobeTrial?.wardrobeConflict)
    ));
    const production = paired.map(record => record.signals!.wardrobeConflict!);
    const trial = paired.map(record => record.wardrobeTrial!.wardrobeConflict!);
    const deltas = paired.map((record, index) => trial[index]! - production[index]!);
    return {
        count: paired.length,
        productionAverage: mean(production),
        trialAverage: mean(trial),
        averageDelta: mean(deltas),
        productionMin: production.length ? Math.min(...production) : 0,
        productionMax: production.length ? Math.max(...production) : 0,
        trialMin: trial.length ? Math.min(...trial) : 0,
        trialMax: trial.length ? Math.max(...trial) : 0,
    };
};

export const parseJevWardrobeShadowExportText = (text: string): unknown => JSON.parse(text.replace(/^\uFEFF/u, ''));

export const analyzeJevWardrobeShadowExport = (input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a Jev Shadow export object.');
    const candidate = input as { records?: unknown };
    if (!Array.isArray(candidate.records)) throw new Error('Export is missing records[].');

    const records = candidate.records as SafeRecord[];
    const unknownRecordKeys = Array.from(new Set(records.flatMap(record => (
        record && typeof record === 'object' && !Array.isArray(record)
            ? Object.keys(record).filter(key => !ALLOWED_RECORD_KEYS.has(key))
            : ['<non-object-record>']
    )))).sort();
    const suspiciousUnknownKeys = unknownRecordKeys.filter(key => PRIVATE_FIELD_PATTERN.test(key));

    const paired = records.filter(record => (
        validProbability(record.signals?.wardrobeConflict)
        && validProbability(record.wardrobeTrial?.wardrobeConflict)
    ));
    const withWardrobeIssue = paired.filter(record => record.gemmaIssueCodes?.includes('wardrobe'));
    const withoutWardrobeIssue = paired.filter(record => (
        (record.gemmaDecision === 'keep' || record.gemmaDecision === 'revise')
        && !record.gemmaIssueCodes?.includes('wardrobe')
    ));
    const gemmaKeep = paired.filter(record => record.gemmaDecision === 'keep');
    const gemmaRevise = paired.filter(record => record.gemmaDecision === 'revise');
    const single = paired.filter(record => record.mode === 'single');
    const group = paired.filter(record => record.mode === 'group');

    const statusCounts = { ok: 0, unavailable: 0, aborted: 0 };
    for (const record of records) {
        const status = record.wardrobeTrial?.status;
        if (status && status in statusCounts) statusCounts[status] += 1;
    }

    const trialLatencies = records
        .filter(record => record.wardrobeTrial?.status === 'ok' && typeof record.wardrobeTrial.latencyMs === 'number')
        .map(record => record.wardrobeTrial!.latencyMs!);
    const trialCost = records.reduce((sum, record) => sum + (record.wardrobeTrial?.usageCost || 0), 0);
    const trialInputTokens = records.reduce((sum, record) => sum + (record.wardrobeTrial?.usageInputTokens || 0), 0);
    const trialOutputTokens = records.reduce((sum, record) => sum + (record.wardrobeTrial?.usageOutputTokens || 0), 0);

    const largestDeltas = paired
        .map(record => ({
            requestId: String(record.requestId || ''),
            mode: record.mode,
            gemmaDecision: record.gemmaDecision,
            gemmaWardrobeIssue: Boolean(record.gemmaIssueCodes?.includes('wardrobe')),
            production: record.signals!.wardrobeConflict!,
            trial: record.wardrobeTrial!.wardrobeConflict!,
            delta: Number((record.wardrobeTrial!.wardrobeConflict! - record.signals!.wardrobeConflict!).toFixed(3)),
        }))
        .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
        .slice(0, 10);

    return {
        totalRecords: records.length,
        pairedRecords: paired.length,
        sampleNote: paired.length >= 50
            ? '50 paired observations available.'
            : paired.length >= 20
                ? 'Useful early production sample; continue toward 50 paired observations if practical.'
                : 'Small production sample; treat patterns as preliminary.',
        safeBoundary: {
            unknownRecordKeys,
            suspiciousUnknownKeys,
            pass: suspiciousUnknownKeys.length === 0,
        },
        wardrobeTrialStatus: statusCounts,
        overall: groupMetrics(paired),
        byGemmaWardrobeIssue: {
            withIssue: groupMetrics(withWardrobeIssue),
            withoutIssue: groupMetrics(withoutWardrobeIssue),
        },
        byGemmaDecision: {
            keep: groupMetrics(gemmaKeep),
            revise: groupMetrics(gemmaRevise),
        },
        byMode: {
            single: groupMetrics(single),
            group: groupMetrics(group),
        },
        trialUsage: {
            averageLatencyMs: trialLatencies.length ? Math.round(trialLatencies.reduce((sum, value) => sum + value, 0) / trialLatencies.length) : 0,
            maxLatencyMs: trialLatencies.length ? Math.max(...trialLatencies) : 0,
            inputTokens: trialInputTokens,
            outputTokens: trialOutputTokens,
            cost: Number(trialCost.toFixed(9)),
        },
        largestDeltas,
    };
};

const main = () => {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error('Usage: npm.cmd run jev:shadow-report -- <jev-shadow-export.json>');
        process.exitCode = 2;
        return;
    }
    const parsed = parseJevWardrobeShadowExportText(readFileSync(resolve(inputPath), 'utf8'));
    console.log(JSON.stringify(analyzeJevWardrobeShadowExport(parsed), null, 2));
};

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) main();
