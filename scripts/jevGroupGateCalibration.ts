import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidReviewState, JEV_QUESTIONS, runOpenRouterDecision } from '../api/_openrouter-decisions.js';
import {
    JEV_GROUP_GATE_BROAD_SOURCE_COUNT,
    JEV_GROUP_GATE_CASES,
    JEV_GROUP_GATE_PARITY_SOURCE_COUNT,
    JEV_GROUP_GATE_SOURCE_COUNT,
} from '../tests/fixtures/jevGroupGateCalibration.js';
import { JEV_GROUP_GATE_QUESTIONS_V1, JEV_GROUP_GATE_QUESTIONS_V2 } from '../tests/fixtures/jevGroupGateQuestions.js';
import { STRICT_REVIEW_ISSUE_CODES } from '../strictReview.js';
import type { StrictReviewIssueCode } from '../strictReview.js';

const signalKeyByCategory = {
    request_mismatch: 'requestMismatch',
    identity: 'identityConflict',
    speaker_ownership: 'speakerOwnershipViolation',
    continuity: 'continuityViolation',
    reality_layer: 'realityLayerViolation',
    wardrobe: 'wardrobeConflict',
    state: 'stateConflict',
    replayed_beat: 'replayedBeat',
    persona_voice: 'personaVoiceViolation',
    third_party_speech: 'thirdPartySpeechViolation',
    user_agency: 'userAgencyViolation',
    incomplete_ending: 'incompleteEnding',
    group_narration: 'groupNarrationViolation',
    other: 'otherDefect',
} as const satisfies Record<StrictReviewIssueCode, string>;

type JevSignals = NonNullable<Awaited<ReturnType<typeof runOpenRouterDecision>> extends { status: 'ok'; signals: infer T } ? T : never>;
export type SemanticSignalKey = Exclude<keyof JevSignals, 'groupNarrationViolation'>;

export type JevGroupGateVariant = 'production' | 'v1' | 'v2';

export interface JevGroupGateResult {
    id: string;
    sourceCaseId: string;
    sourceCategory: StrictReviewIssueCode;
    expected: 'positive' | 'negative';
    hardCheckOnly: boolean;
    gateSignal?: number;
    sourceCategorySignal?: number;
    maxSemanticSignal?: number;
    semanticSignals?: Partial<Record<SemanticSignalKey, number>>;
    model?: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    reasonCode?: string;
}

const semanticSignalKeys: readonly SemanticSignalKey[] = [
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
];

const mean = (values: readonly number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
const minimum = (values: readonly number[]) => values.length ? Math.min(...values) : undefined;
const maximum = (values: readonly number[]) => values.length ? Math.max(...values) : undefined;
const round = (value: number | undefined) => value === undefined ? undefined : Number(value.toFixed(3));

export const validateJevGroupGateCalibration = (): string[] => {
    const errors: string[] = [];
    if (
        JEV_GROUP_GATE_CASES.length !== JEV_GROUP_GATE_SOURCE_COUNT
        || JEV_GROUP_GATE_PARITY_SOURCE_COUNT !== 14
        || JEV_GROUP_GATE_BROAD_SOURCE_COUNT !== 18
        || JEV_GROUP_GATE_SOURCE_COUNT !== 32
    ) {
        errors.push('group gate corpus must contain 14 parity Group cases plus 18 broad semantic pair cases');
    }
    const ids = new Set<string>();
    for (const item of JEV_GROUP_GATE_CASES) {
        if (ids.has(item.id)) errors.push(`duplicate id: ${item.id}`);
        ids.add(item.id);
        if (item.state.mode !== 'group' || item.state.ccMode) errors.push(`non-Group state: ${item.id}`);
        if (!isValidReviewState(item.state)) errors.push(`invalid ReviewState: ${item.id}`);
        if (item.sourceCategory === 'group_narration') {
            if (item.expected !== 'negative') errors.push(`deterministic narration must be excluded from semantic gate: ${item.id}`);
            if (item.hardCheckOnly && !item.sourceCaseId.includes('positive')) errors.push(`hard-check-only metadata mismatch: ${item.id}`);
        } else if (item.hardCheckOnly) {
            errors.push(`non-narration case marked hard-check-only: ${item.id}`);
        }
    }
    for (const category of STRICT_REVIEW_ISSUE_CODES.filter(code => code !== 'group_narration')) {
        if (!JEV_GROUP_GATE_CASES.some(item => item.sourceCategory === category && item.expected === 'positive')) {
            errors.push(`semantic category lacks positive Group coverage: ${category}`);
        }
        if (!JEV_GROUP_GATE_CASES.some(item => item.sourceCategory === category && item.expected === 'negative')) {
            errors.push(`semantic category lacks negative Group coverage: ${category}`);
        }
    }

    const questionKeys = Object.keys(JEV_QUESTIONS);
    for (const [variant, questions] of Object.entries({ v1: JEV_GROUP_GATE_QUESTIONS_V1, v2: JEV_GROUP_GATE_QUESTIONS_V2 })) {
        if (JSON.stringify(questionKeys) !== JSON.stringify(Object.keys(questions))) {
            errors.push(`group gate ${variant} question keys must remain identical to production`);
            continue;
        }
        const changed = questionKeys.filter(key => (
            JEV_QUESTIONS[key as keyof typeof JEV_QUESTIONS].instructions
            !== questions[key as keyof typeof questions].instructions
        ));
        if (JSON.stringify(changed) !== JSON.stringify(['group_narration_violation'])) {
            errors.push(`group gate ${variant} must replace exactly the group narration proposition`);
        }
    }
    return errors;
};

const readLocalOpenRouterApi = async (): Promise<string | undefined> => {
    if (process.env.OPENROUTER_API) return process.env.OPENROUTER_API;
    try {
        const source = await readFile(resolve(process.cwd(), '.env.local'), 'utf8');
        const match = source.match(/^OPENROUTER_API\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\r\n]*))\s*$/m);
        return match?.[1] || match?.[2] || match?.[3]?.trim() || undefined;
    } catch {
        return undefined;
    }
};

export const aggregateJevGroupGateResults = (results: readonly JevGroupGateResult[]) => {
    const completed = results.filter(result => result.gateSignal !== undefined);
    const metrics = (expected: 'positive' | 'negative') => {
        const rows = completed.filter(result => result.expected === expected);
        const gate = rows.map(result => result.gateSignal!);
        const source = rows.map(result => result.sourceCategorySignal).filter((value): value is number => value !== undefined);
        const maxSemantic = rows.map(result => result.maxSemanticSignal).filter((value): value is number => value !== undefined);
        return {
            count: rows.length,
            gateMean: round(mean(gate)),
            gateMinimum: round(minimum(gate)),
            gateMaximum: round(maximum(gate)),
            sourceCategoryMean: round(mean(source)),
            maxSemanticMean: round(mean(maxSemantic)),
        };
    };
    const positive = metrics('positive');
    const negative = metrics('negative');
    const byCategory = Object.fromEntries([...new Set(completed.map(result => result.sourceCategory))].map(category => {
        const rows = completed.filter(result => result.sourceCategory === category);
        return [category, {
            count: rows.length,
            expectedPositive: rows.filter(result => result.expected === 'positive').length,
            gateMean: round(mean(rows.map(result => result.gateSignal!))),
            sourceCategoryMean: round(mean(rows.map(result => result.sourceCategorySignal).filter((value): value is number => value !== undefined))),
            maxSemanticMean: round(mean(rows.map(result => result.maxSemanticSignal).filter((value): value is number => value !== undefined))),
        }];
    }));
    const hardCheckOnly = completed.filter(result => result.hardCheckOnly);
    return {
        total: results.length,
        completed: completed.length,
        unavailable: results.length - completed.length,
        positive,
        negative,
        gateMeanSeparation: positive.gateMean === undefined || negative.gateMean === undefined
            ? undefined
            : round(positive.gateMean - negative.gateMean),
        hardCheckOnly: {
            count: hardCheckOnly.length,
            gateMean: round(mean(hardCheckOnly.map(result => result.gateSignal!))),
            gateMaximum: round(maximum(hardCheckOnly.map(result => result.gateSignal!))),
        },
        byCategory,
        totalCost: results.reduce((sum, result) => sum + (result.cost || 0), 0),
    };
};

export const selectJevGroupGateCases = (caseIds?: readonly string[]) => {
    if (!caseIds?.length) return [...JEV_GROUP_GATE_CASES];
    const byId = new Map(JEV_GROUP_GATE_CASES.map(item => [item.id, item] as const));
    const missing = caseIds.filter(id => !byId.has(id));
    if (missing.length) throw new Error(`Unknown Group gate case id(s): ${[...new Set(missing)].join(', ')}`);
    return caseIds.map(id => byId.get(id)!);
};

export const compareJevGroupGateSemanticSignals = (
    baseline: readonly JevGroupGateResult[],
    candidate: readonly JevGroupGateResult[],
) => {
    const candidateById = new Map(candidate.map(result => [result.id, result] as const));
    const bySignal = Object.fromEntries(semanticSignalKeys.map(key => {
        const deltas: number[] = [];
        for (const base of baseline) {
            const alternate = candidateById.get(base.id);
            const left = base.semanticSignals?.[key];
            const right = alternate?.semanticSignals?.[key];
            if (left === undefined || right === undefined) continue;
            deltas.push(Math.abs(left - right));
        }
        return [key, {
            count: deltas.length,
            meanAbsoluteDelta: round(mean(deltas)),
            maximumAbsoluteDelta: round(maximum(deltas)),
            overPoint05: deltas.filter(value => value > 0.05).length,
            overPoint10: deltas.filter(value => value > 0.10).length,
        }];
    })) as Record<SemanticSignalKey, {
        count: number;
        meanAbsoluteDelta: number | undefined;
        maximumAbsoluteDelta: number | undefined;
        overPoint05: number;
        overPoint10: number;
    }>;

    const allDeltas = semanticSignalKeys.flatMap(key => {
        const signal = bySignal[key];
        if (!signal.count) return [];
        const values: number[] = [];
        for (const base of baseline) {
            const alternate = candidateById.get(base.id);
            const left = base.semanticSignals?.[key];
            const right = alternate?.semanticSignals?.[key];
            if (left !== undefined && right !== undefined) values.push(Math.abs(left - right));
        }
        return values;
    });

    return {
        matchedCases: baseline.filter(base => candidateById.has(base.id)).length,
        comparisons: allDeltas.length,
        meanAbsoluteDelta: round(mean(allDeltas)),
        maximumAbsoluteDelta: round(maximum(allDeltas)),
        overPoint05: allDeltas.filter(value => value > 0.05).length,
        overPoint10: allDeltas.filter(value => value > 0.10).length,
        bySignal,
    };
};

export const runJevGroupGateCalibration = async (
    live: boolean,
    variant: JevGroupGateVariant = 'v1',
    caseIds?: readonly string[],
): Promise<JevGroupGateResult[]> => {
    const errors = validateJevGroupGateCalibration();
    if (errors.length) throw new Error(`Group gate calibration validation failed: ${errors.join('; ')}`);
    if (!live) return [];

    const apiKey = await readLocalOpenRouterApi();
    if (!apiKey) throw new Error('OPENROUTER_API is unavailable for the explicit live run.');
    const questions = variant === 'v2'
        ? JEV_GROUP_GATE_QUESTIONS_V2
        : variant === 'v1'
          ? JEV_GROUP_GATE_QUESTIONS_V1
          : undefined;

    const results: JevGroupGateResult[] = [];
    for (const fixture of selectJevGroupGateCases(caseIds)) {
        const startedAt = performance.now();
        const response = await runOpenRouterDecision(fixture.state, questions ? {
            env: { OPENROUTER_API: apiKey },
            calibrationQuestions: questions,
            allowCalibrationQuestions: true,
        } : {
            env: { OPENROUTER_API: apiKey },
        });
        const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
        if (response.status !== 'ok') {
            results.push({
                id: fixture.id,
                sourceCaseId: fixture.sourceCaseId,
                sourceCategory: fixture.sourceCategory,
                expected: fixture.expected,
                hardCheckOnly: fixture.hardCheckOnly,
                latencyMs,
                reasonCode: response.reasonCode,
            });
            continue;
        }
        const sourceKey = signalKeyByCategory[fixture.sourceCategory] as keyof typeof response.signals;
        const sourceCategorySignal = fixture.sourceCategory === 'group_narration'
            ? undefined
            : response.signals[sourceKey];
        results.push({
            id: fixture.id,
            sourceCaseId: fixture.sourceCaseId,
            sourceCategory: fixture.sourceCategory,
            expected: fixture.expected,
            hardCheckOnly: fixture.hardCheckOnly,
            gateSignal: response.signals.groupNarrationViolation,
            sourceCategorySignal,
            maxSemanticSignal: Math.max(...semanticSignalKeys.map(key => response.signals[key])),
            semanticSignals: Object.fromEntries(semanticSignalKeys.map(key => [key, response.signals[key]])),
            model: response.model,
            latencyMs,
            inputTokens: response.usage?.inputTokens,
            outputTokens: response.usage?.outputTokens,
            cost: response.usage?.cost,
        });
    }
    return results;
};

const main = async () => {
    const args = process.argv.slice(2);
    const live = args.includes('--live');
    const variantIndex = args.indexOf('--variant');
    const variantValue = variantIndex === -1 ? 'v1' : args[variantIndex + 1];
    if (variantValue !== 'production' && variantValue !== 'v1' && variantValue !== 'v2') throw new Error('--variant must be production, v1, or v2.');
    const variant = variantValue as JevGroupGateVariant;
    const casesIndex = args.indexOf('--cases');
    const caseIds = casesIndex === -1
        ? undefined
        : args[casesIndex + 1]?.split(',').map(value => value.trim()).filter(Boolean);
    if (casesIndex !== -1 && !caseIds?.length) throw new Error('--cases requires a comma-separated case id list.');
    const selectedCases = selectJevGroupGateCases(caseIds);
    const jsonIndex = args.indexOf('--json-out');
    const jsonOutputPath = jsonIndex === -1 ? undefined : args[jsonIndex + 1];
    if (jsonIndex !== -1 && !jsonOutputPath) throw new Error('--json-out requires a destination path.');

    const errors = validateJevGroupGateCalibration();
    if (errors.length) throw new Error(`Group gate calibration validation failed: ${errors.join('; ')}`);
    const positive = selectedCases.filter(item => item.expected === 'positive').length;
    const negative = selectedCases.length - positive;
    const hardCheckOnly = selectedCases.filter(item => item.hardCheckOnly).length;
    console.log(`Jev Group gate ${variant.toUpperCase()}: ${selectedCases.length} selected production-shaped Group cases · semantic positive ${positive} · negative ${negative} · deterministic-only control ${hardCheckOnly}.`);
    console.log('Question set changes exactly one calibration-only answer slot; production JEV_QUESTIONS are unchanged.');

    if (!live) {
        if (jsonOutputPath) throw new Error('--json-out requires --live; no file was written.');
        console.log('Offline validation complete. Network calls = 0. Use --live for the explicit OpenRouter calibration.');
        return;
    }

    const results = await runJevGroupGateCalibration(true, variant, caseIds);
    const summary = aggregateJevGroupGateResults(results);
    console.log(JSON.stringify(summary, null, 2));
    if (jsonOutputPath) {
        const destination = resolve(jsonOutputPath);
        await writeFile(destination, JSON.stringify({ variant, results, summary }, null, 2));
        console.log(`Wrote safe Group gate calibration results to ${destination}.`);
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    void main().catch(error => {
        console.error(error instanceof Error ? error.message : 'Group gate calibration failed.');
        process.exitCode = 1;
    });
}
