import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isValidReviewState, runOpenRouterDecision } from '../api/_openrouter-decisions.js';
import { STRICT_REVIEW_ISSUE_CODES } from '../strictReview.js';
import {
    JEV_SYNTHETIC_CALIBRATION_CASES,
    type JevSyntheticCalibrationCase,
    type JevSyntheticExpected,
} from '../tests/fixtures/jevSyntheticCalibration.js';
import {
    JEV_PRODUCTION_SHAPE_PARITY_CASES,
} from '../tests/fixtures/jevProductionShapeParity.js';
import {
    FACTOR_ISOLATION_HELPERS,
    diffIsolationReviewState,
    JEV_FACTOR_ISOLATION_CASES,
    type JevFactorIsolationCase,
} from '../tests/fixtures/jevFactorIsolation.js';
import {
    JEV_REPEATABILITY_CASES,
    JEV_REPEATABILITY_REPEATS,
    JEV_REPEATABILITY_SOURCE_IDS,
    type JevRepeatabilityCase,
} from '../tests/fixtures/jevRepeatability.js';

const signalKeyByCategory = {
    request_mismatch: 'requestMismatch', identity: 'identityConflict', speaker_ownership: 'speakerOwnershipViolation',
    continuity: 'continuityViolation', reality_layer: 'realityLayerViolation', wardrobe: 'wardrobeConflict',
    state: 'stateConflict', replayed_beat: 'replayedBeat', persona_voice: 'personaVoiceViolation',
    third_party_speech: 'thirdPartySpeechViolation', user_agency: 'userAgencyViolation',
    incomplete_ending: 'incompleteEnding', group_narration: 'groupNarrationViolation', other: 'otherDefect',
} as const;

type SignalKey = typeof signalKeyByCategory[keyof typeof signalKeyByCategory];

export interface SyntheticCalibrationResult {
    id: string;
    suite: 'clean' | 'production-shape' | 'factor-isolation' | 'repeatability';
    mode: 'single' | 'group';
    ccMode: boolean;
    category: keyof typeof signalKeyByCategory;
    expected: JevSyntheticExpected;
    signal?: number;
    model?: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    reasonCode?: string;
    factorFamily?: JevFactorIsolationCase['factorFamily'];
    factor?: string;
    variant?: JevFactorIsolationCase['variant'];
    baselineId?: string;
    sourceCaseId?: string;
    repeatIndex?: number;
}

type SyntheticSuiteName = 'clean' | 'parity' | 'isolation' | 'repeatability' | 'all';
type AnySyntheticCase = JevSyntheticCalibrationCase | typeof JEV_PRODUCTION_SHAPE_PARITY_CASES[number] | JevFactorIsolationCase | JevRepeatabilityCase;

const getSuiteCases = (suite: SyntheticSuiteName): readonly AnySyntheticCase[] => {
    if (suite === 'clean') return JEV_SYNTHETIC_CALIBRATION_CASES;
    if (suite === 'parity') return JEV_PRODUCTION_SHAPE_PARITY_CASES;
    if (suite === 'isolation') return JEV_FACTOR_ISOLATION_CASES;
    if (suite === 'repeatability') return JEV_REPEATABILITY_CASES;
    return [...JEV_SYNTHETIC_CALIBRATION_CASES, ...JEV_PRODUCTION_SHAPE_PARITY_CASES, ...JEV_FACTOR_ISOLATION_CASES, ...JEV_REPEATABILITY_CASES];
};

const validateCorpus = (cases: readonly AnySyntheticCase[], requireEveryCategory: boolean): string[] => {
    const errors: string[] = [];
    const knownCategories = new Set<string>(STRICT_REVIEW_ISSUE_CODES);
    const ids = new Set<string>();
    const byCategory = new Map<string, JevSyntheticCalibrationCase[]>();
    const pairs = new Map<string, JevSyntheticCalibrationCase[]>();
    for (const item of cases) {
        if (ids.has(item.id)) errors.push(`duplicate id: ${item.id}`);
        ids.add(item.id);
        if (!knownCategories.has(item.category)) errors.push(`unknown category: ${item.id}`);
        if (item.expected !== 'positive' && item.expected !== 'negative') errors.push(`invalid expected value: ${item.id}`);
        if (!isValidReviewState(item.state)) errors.push(`invalid ReviewState: ${item.id}`);
        const categoryCases = byCategory.get(item.category) || [];
        categoryCases.push(item);
        byCategory.set(item.category, categoryCases);
        if (item.pairId) {
            const pair = pairs.get(item.pairId) || [];
            pair.push(item);
            pairs.set(item.pairId, pair);
        }
    }
    if (requireEveryCategory) {
        if (cases.length !== 34) errors.push('clean corpus must contain exactly 34 cases');
        for (const category of STRICT_REVIEW_ISSUE_CODES) {
            const entries = byCategory.get(category) || [];
            if (!entries.some(item => item.expected === 'negative')) errors.push(`missing negative case: ${category}`);
            if (category !== 'other' && !entries.some(item => item.expected === 'positive')) errors.push(`missing positive case: ${category}`);
        }
    }
    for (const [pairId, entries] of pairs) {
        if (entries.length !== 2 || !entries.some(item => item.expected === 'positive') || !entries.some(item => item.expected === 'negative')) {
            errors.push(`invalid positive/negative pair: ${pairId}`);
        }
    }
    return errors;
};

export const validateSyntheticCalibrationCorpus = (cases: readonly JevSyntheticCalibrationCase[]): string[] => validateCorpus(cases, true);
export const validateProductionShapeParityCorpus = (cases: readonly typeof JEV_PRODUCTION_SHAPE_PARITY_CASES[number][]): string[] => {
    const errors = validateCorpus(cases, false);
    if (cases.length < 20) errors.push('production-shape corpus contains fewer than 20 cases');
    return errors;
};
export const validateFactorIsolationCorpus = (cases: readonly JevFactorIsolationCase[]): string[] => {
    const errors = validateCorpus(cases, false);
    if (cases.length < 35 || cases.length > 60) errors.push('factor-isolation corpus must contain 35 to 60 cases');
    const familyMinimums: Record<JevFactorIsolationCase['factorFamily'], number> = {
        group_narration: 8, persona_voice: 10, replayed_beat: 10, continuity: 8, wardrobe: 0,
    };
    for (const [family, minimum] of Object.entries(familyMinimums)) {
        const variants = cases.filter(item => item.factorFamily === family && item.variant === 'variant');
        if (variants.length < minimum) errors.push(`${family} requires at least ${minimum} controlled variants`);
    }
    const byId = new Map(cases.map(item => [item.id, item]));
    for (const item of cases) {
        if (item.suite !== 'factor-isolation') errors.push(`invalid suite: ${item.id}`);
        if (!item.factorFamily || !item.factor || !item.variant || !item.shapeNotes) errors.push(`missing factor metadata: ${item.id}`);
        if (item.mode !== item.state.mode || item.ccMode !== item.state.ccMode) errors.push(`mode metadata mismatch: ${item.id}`);
        if (item.variant === 'variant') {
            const baseline = item.baselineId ? byId.get(item.baselineId) : undefined;
            if (!baseline) errors.push(`missing baseline: ${item.id}`);
            else {
                const actual = diffIsolationReviewState(baseline.state, item.state);
                if (baseline.factorFamily !== item.factorFamily || baseline.category !== item.category || baseline.expected !== item.expected || baseline.semanticCandidate !== item.semanticCandidate) errors.push(`baseline integrity mismatch: ${item.id}`);
                if (actual.length !== 1 || JSON.stringify(actual) !== JSON.stringify(item.changedDimensions)) errors.push(`structural diff mismatch: ${item.id}`);
                if (!item.changedDimensions.includes('candidateText') && baseline.state.candidateText !== item.state.candidateText) errors.push(`candidate changed outside declared dimension: ${item.id}`);
            }
        }
    }
    return errors;
};
export const validateRepeatabilityCorpus = (cases: readonly JevRepeatabilityCase[]): string[] => {
    const errors: string[] = [];
    const sourceById = new Map(JEV_FACTOR_ISOLATION_CASES.map(item => [item.id, item]));
    const ids = new Set<string>();
    for (const item of cases) {
        const source = sourceById.get(item.sourceCaseId);
        if (ids.has(item.id)) errors.push(`duplicate repeatability id: ${item.id}`);
        ids.add(item.id);
        if (!source) errors.push(`missing repeatability source: ${item.id}`);
        else if (JSON.stringify(item.state) !== JSON.stringify(source.state) || item.state !== source.state || item.category !== source.category || item.expected !== source.expected || item.mode !== source.mode || item.ccMode !== source.ccMode) errors.push(`repeatability state mismatch: ${item.id}`);
        if (item.repeatIndex < 1 || item.repeatIndex > JEV_REPEATABILITY_REPEATS) errors.push(`invalid repeat index: ${item.id}`);
    }
    if (cases.length !== JEV_REPEATABILITY_SOURCE_IDS.length * JEV_REPEATABILITY_REPEATS) errors.push('repeatability corpus has incorrect case count');
    for (const sourceCaseId of JEV_REPEATABILITY_SOURCE_IDS) {
        const entries = cases.filter(item => item.sourceCaseId === sourceCaseId);
        if (entries.length !== JEV_REPEATABILITY_REPEATS || entries.some((item, index) => item.repeatIndex !== index + 1)) errors.push(`invalid repeats: ${sourceCaseId}`);
    }
    for (let repeatIndex = 1; repeatIndex <= JEV_REPEATABILITY_REPEATS; repeatIndex += 1) {
        const block = cases.slice((repeatIndex - 1) * JEV_REPEATABILITY_SOURCE_IDS.length, repeatIndex * JEV_REPEATABILITY_SOURCE_IDS.length);
        if (block.some((item, index) => item.repeatIndex !== repeatIndex || item.sourceCaseId !== JEV_REPEATABILITY_SOURCE_IDS[index])) errors.push(`interleaving order mismatch: repeat ${repeatIndex}`);
    }
    return errors;
};

const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
const min = (values: readonly number[]) => values.length ? Math.min(...values) : undefined;
const max = (values: readonly number[]) => values.length ? Math.max(...values) : undefined;
const median = (values: readonly number[]) => {
    if (!values.length) return undefined;
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
};
const populationStandardDeviation = (values: readonly number[]) => {
    const average = mean(values);
    return average === undefined || !values.length ? undefined : Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
};
const sampleStandardDeviation = (values: readonly number[]) => {
    const average = mean(values);
    return average === undefined || values.length < 2 ? undefined : Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
};

export const aggregateSyntheticCalibration = (results: readonly SyntheticCalibrationResult[], fixtures: readonly AnySyntheticCase[] = JEV_SYNTHETIC_CALIBRATION_CASES) => {
    const categories = Object.fromEntries(STRICT_REVIEW_ISSUE_CODES.map(category => {
        const rows = results.filter(result => result.category === category);
        const positive = rows.filter(result => result.expected === 'positive' && result.signal !== undefined).map(result => result.signal!);
        const negative = rows.filter(result => result.expected === 'negative' && result.signal !== undefined).map(result => result.signal!);
        const positiveMean = mean(positive);
        const negativeMean = mean(negative);
        return [category, {
            positiveCount: positive.length,
            negativeCount: negative.length,
            positiveMean,
            negativeMean,
            positiveMinimum: min(positive),
            negativeMaximum: max(negative),
            meanSeparation: positiveMean === undefined || negativeMean === undefined ? undefined : positiveMean - negativeMean,
        }];
    }));
    const paired = new Map<string, SyntheticCalibrationResult[]>();
    for (const result of results) {
        const fixture = fixtures.find(item => item.id === result.id);
        if (!fixture?.pairId || result.signal === undefined) continue;
        const entries = paired.get(fixture.pairId) || [];
        entries.push(result);
        paired.set(fixture.pairId, entries);
    }
    const pairRows = [...paired.values()].filter(entries => entries.length === 2);
    const pairSuccesses = pairRows.filter(entries => {
        const positive = entries.find(entry => entry.expected === 'positive');
        const negative = entries.find(entry => entry.expected === 'negative');
        return positive?.signal !== undefined && negative?.signal !== undefined && positive.signal > negative.signal;
    }).length;
    const groupBy = <T extends string>(key: (result: SyntheticCalibrationResult) => T) => Object.fromEntries(
        [...new Set(results.map(key))].map(value => [value, results.filter(result => key(result) === value).length]),
    );
    const fixtureById = new Map(fixtures.map(item => [item.id, item]));
    const controlledFactorDeltas = results.flatMap(result => {
        if (result.variant !== 'variant' || !result.baselineId || result.signal === undefined) return [];
        const baseline = results.find(item => item.id === result.baselineId);
        if (!baseline || baseline.signal === undefined) return [];
        return [{ id: result.id, factorFamily: result.factorFamily, factor: result.factor, variant: result.variant, baselineId: result.baselineId, expected: result.expected, mode: result.mode, ccMode: result.ccMode, baselineSignal: baseline.signal, variantSignal: result.signal, delta: result.signal - baseline.signal }];
    });
    const compositeControls = results.filter(result => result.variant === 'composite-control').map(result => ({ id: result.id, factorFamily: result.factorFamily, factor: result.factor, expected: result.expected, mode: result.mode, ccMode: result.ccMode, signal: result.signal, model: result.model, latencyMs: result.latencyMs, reasonCode: result.reasonCode }));
    const repeatabilityRows = results.filter(result => result.suite === 'repeatability' && result.sourceCaseId && result.signal !== undefined);
    const repeatabilityBySource = Object.fromEntries([...new Set(repeatabilityRows.map(result => result.sourceCaseId!))].map(sourceCaseId => {
        const rows = repeatabilityRows.filter(result => result.sourceCaseId === sourceCaseId).sort((left, right) => (left.repeatIndex || 0) - (right.repeatIndex || 0));
        const values = rows.map(result => result.signal!);
        const average = mean(values);
        const firstRun = values[0];
        return [sourceCaseId, { n: values.length, mean: average, median: median(values), minimum: min(values), maximum: max(values), range: values.length ? max(values)! - min(values)! : undefined, populationStandardDeviation: populationStandardDeviation(values), sampleStandardDeviation: sampleStandardDeviation(values), firstRun, absoluteDeviationFromFirstRun: values.map(value => Math.abs(value - firstRun)), maximumAbsoluteDeviationFromMean: average === undefined ? undefined : max(values.map(value => Math.abs(value - average))) }];
    }));
    const repeatabilityByCategory = Object.fromEntries([...new Set(repeatabilityRows.map(result => result.category))].map(category => {
        const sourceStats = Object.entries(repeatabilityBySource).filter(([sourceCaseId]) => repeatabilityRows.find(result => result.sourceCaseId === sourceCaseId)?.category === category).map(([, value]) => value);
        const ranges = sourceStats.map(value => value.range).filter((value): value is number => value !== undefined);
        const deviations = sourceStats.map(value => value.populationStandardDeviation).filter((value): value is number => value !== undefined);
        return [category, { sourceCaseCount: sourceStats.length, averageWithinCaseRange: mean(ranges), maximumWithinCaseRange: max(ranges), averagePopulationStandardDeviation: mean(deviations), maximumPopulationStandardDeviation: max(deviations) }];
    }));
    const repeatabilityByIndex = Object.fromEntries([...new Set(repeatabilityRows.map(result => result.repeatIndex))].map(repeatIndex => [repeatIndex!, mean(repeatabilityRows.filter(result => result.repeatIndex === repeatIndex).map(result => result.signal!))]));
    return { categories, directionalPairs: { compared: pairRows.length, positiveGreaterThanNegative: pairSuccesses, nonDirectionalPairIds: pairRows.filter(entries => {
        const positive = entries.find(entry => entry.expected === 'positive');
        const negative = entries.find(entry => entry.expected === 'negative');
        return !positive || !negative || positive.signal === undefined || negative.signal === undefined || positive.signal <= negative.signal;
    }).map(entries => fixtureById.get(entries[0]?.id || '')?.pairId) }, groups: {
        suite: groupBy(result => result.suite), mode: groupBy(result => result.mode), ccMode: groupBy(result => String(result.ccMode)),
    }, controlledFactorDeltas, compositeControls, repeatability: { bySource: repeatabilityBySource, byCategory: repeatabilityByCategory, byRepeatIndex: repeatabilityByIndex } };
};

const readLocalOpenRouterApi = async (): Promise<string | undefined> => {
    if (process.env.OPENROUTER_API) return process.env.OPENROUTER_API;
    try {
        const source = await readFile(resolve(process.cwd(), '.env.local'), 'utf8');
        const match = source.match(/^OPENROUTER_API\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\r\n]*))\s*$/m);
        return match?.[1] || match?.[2] || match?.[3]?.trim() || undefined;
    } catch {
        return undefined;
    }
};

const parseJsonOutputPath = (args: readonly string[]) => {
    const index = args.indexOf('--json-out');
    return index === -1 ? undefined : args[index + 1];
};

export const runSyntheticCalibration = async (live: boolean, suite: SyntheticSuiteName = 'clean'): Promise<SyntheticCalibrationResult[]> => {
    const apiKey = live ? await readLocalOpenRouterApi() : undefined;
    if (live && !apiKey) throw new Error('OPENROUTER_API is unavailable for the explicit live run.');
    const results: SyntheticCalibrationResult[] = [];
    for (const fixture of getSuiteCases(suite)) {
        const startedAt = performance.now();
        const response = live
            ? await runOpenRouterDecision(fixture.state, { env: { OPENROUTER_API: apiKey } })
            : undefined;
        const latencyMs = Math.round(performance.now() - startedAt);
        if (response?.status === 'ok') {
            const signal = response.signals[signalKeyByCategory[fixture.category] as SignalKey];
            results.push({ id: fixture.id, suite: fixture.suite || 'clean', mode: fixture.state.mode, ccMode: fixture.state.ccMode, category: fixture.category, expected: fixture.expected, signal, model: response.model, latencyMs, inputTokens: response.usage?.inputTokens, outputTokens: response.usage?.outputTokens, cost: response.usage?.cost, ...('factorFamily' in fixture ? { factorFamily: fixture.factorFamily, factor: fixture.factor, variant: fixture.variant, baselineId: fixture.baselineId } : {}), ...('sourceCaseId' in fixture ? { sourceCaseId: fixture.sourceCaseId, repeatIndex: fixture.repeatIndex } : {}) });
        } else if (response) {
            results.push({ id: fixture.id, suite: fixture.suite || 'clean', mode: fixture.state.mode, ccMode: fixture.state.ccMode, category: fixture.category, expected: fixture.expected, latencyMs, reasonCode: response.reasonCode, ...('factorFamily' in fixture ? { factorFamily: fixture.factorFamily, factor: fixture.factor, variant: fixture.variant, baselineId: fixture.baselineId } : {}), ...('sourceCaseId' in fixture ? { sourceCaseId: fixture.sourceCaseId, repeatIndex: fixture.repeatIndex } : {}) });
        }
    }
    return results;
};

const printSummary = (results: readonly SyntheticCalibrationResult[], fixtures: readonly AnySyntheticCase[]) => {
    const summary = aggregateSyntheticCalibration(results, fixtures);
    for (const [category, metrics] of Object.entries(summary.categories)) {
        console.log(`${category}: +${metrics.positiveCount} -${metrics.negativeCount} mean ${metrics.positiveMean ?? 'n/a'} / ${metrics.negativeMean ?? 'n/a'} separation ${metrics.meanSeparation ?? 'n/a'}`);
    }
    console.log(`directional pairs: ${summary.directionalPairs.positiveGreaterThanNegative}/${summary.directionalPairs.compared}`);
    console.log(`suite counts: ${JSON.stringify(summary.groups.suite)} mode counts: ${JSON.stringify(summary.groups.mode)} ccMode counts: ${JSON.stringify(summary.groups.ccMode)}`);
    return summary;
};

const main = async () => {
    const args = process.argv.slice(2);
    const live = args.includes('--live');
    const suiteValue = args.includes('--suite') ? args[args.indexOf('--suite') + 1] : 'clean';
    if (suiteValue !== 'clean' && suiteValue !== 'parity' && suiteValue !== 'isolation' && suiteValue !== 'repeatability' && suiteValue !== 'all') throw new Error('--suite must be clean, parity, isolation, repeatability, or all.');
    const suite = suiteValue as SyntheticSuiteName;
    const jsonOutputPath = parseJsonOutputPath(args);
    if (args.includes('--json-out') && !jsonOutputPath) throw new Error('--json-out requires a destination path.');
    const cleanErrors = validateSyntheticCalibrationCorpus(JEV_SYNTHETIC_CALIBRATION_CASES);
    const parityErrors = validateProductionShapeParityCorpus(JEV_PRODUCTION_SHAPE_PARITY_CASES);
    const isolationErrors = validateFactorIsolationCorpus(JEV_FACTOR_ISOLATION_CASES);
    const repeatabilityErrors = validateRepeatabilityCorpus(JEV_REPEATABILITY_CASES);
    const errors = [...cleanErrors, ...parityErrors, ...isolationErrors, ...repeatabilityErrors];
    if (errors.length) throw new Error(`Synthetic fixture validation failed: ${errors.join('; ')}`);
    const selectedCases = getSuiteCases(suite);
    const normalParityCases = JEV_PRODUCTION_SHAPE_PARITY_CASES.filter(item => item.state.mode === 'single' && !item.state.ccMode).length;
    const ccParityCases = JEV_PRODUCTION_SHAPE_PARITY_CASES.filter(item => item.state.ccMode).length;
    const groupParityCases = JEV_PRODUCTION_SHAPE_PARITY_CASES.filter(item => item.state.mode === 'group').length;
    const isolationFamilyCounts = Object.fromEntries([...new Set(JEV_FACTOR_ISOLATION_CASES.map(item => item.factorFamily))].map(family => [family, JEV_FACTOR_ISOLATION_CASES.filter(item => item.factorFamily === family).length]));
    const isolationModeCounts = Object.fromEntries(['single', 'group'].map(mode => [mode, JEV_FACTOR_ISOLATION_CASES.filter(item => item.mode === mode).length]));
    const isolationCcCounts = Object.fromEntries(['false', 'true'].map(ccMode => [ccMode, JEV_FACTOR_ISOLATION_CASES.filter(item => String(item.ccMode) === ccMode).length]));
    console.log(`Jev synthetic calibration (${suite}): ${selectedCases.length} fictional cases. clean cases: ${JEV_SYNTHETIC_CALIBRATION_CASES.length}; parity cases: ${JEV_PRODUCTION_SHAPE_PARITY_CASES.length}; isolation cases: ${JEV_FACTOR_ISOLATION_CASES.length}; repeatability cases: ${JEV_REPEATABILITY_CASES.length}; parity normal non-Cc: ${normalParityCases}; parity Cc: ${ccParityCases}; parity group: ${groupParityCases}.`);
    console.log(`Production helpers reused: ${FACTOR_ISOLATION_HELPERS.join(', ')}. Network calls: 0 unless --live is explicitly supplied.`);
    if (suite === 'isolation' || suite === 'all') {
        const controlled = JEV_FACTOR_ISOLATION_CASES.filter(item => item.variant === 'variant').length;
        const composite = JEV_FACTOR_ISOLATION_CASES.filter(item => item.variant === 'composite-control').length;
        const positive = JEV_FACTOR_ISOLATION_CASES.filter(item => item.variant === 'positive-control').length;
        const anchors = JEV_FACTOR_ISOLATION_CASES.filter(item => item.variant === 'anchor').length;
        const duplicateCount = JEV_FACTOR_ISOLATION_CASES.reduce((count, item, index) => count + JEV_FACTOR_ISOLATION_CASES.slice(index + 1).filter(other => JSON.stringify(other.state) === JSON.stringify(item.state)).length, 0);
        console.log(`Isolation metadata: controlled variants ${controlled}; composite controls ${composite}; positive controls ${positive}; anchors ${anchors}; controlled delta count ${controlled}; duplicate ReviewState count = ${duplicateCount}; families ${JSON.stringify(isolationFamilyCounts)}; modes ${JSON.stringify(isolationModeCounts)}; ccMode ${JSON.stringify(isolationCcCounts)}; factors ${JEV_FACTOR_ISOLATION_CASES.map(item => item.factor).join(', ')}.`);
    }
    if (suite === 'repeatability' || suite === 'all') console.log(`Repeatability metadata: source cases ${JEV_REPEATABILITY_SOURCE_IDS.length}; repeats per case = ${JEV_REPEATABILITY_REPEATS}; total repeatability requests ${JEV_REPEATABILITY_CASES.length}; deterministic interleaving confirmed; family counts ${JSON.stringify(Object.fromEntries([...new Set(JEV_REPEATABILITY_CASES.map(item => item.factorFamily))].map(family => [family, JEV_REPEATABILITY_CASES.filter(item => item.factorFamily === family).length])))}; network calls = 0 unless --live is explicitly supplied.`);
    if (!live) {
        if (jsonOutputPath) throw new Error('--json-out requires --live; no file was written.');
        console.log('Offline validation complete. No OpenRouter request was made. Use --live to run the explicit synthetic calibration.');
        return;
    }
    const results = await runSyntheticCalibration(true, suite);
    const summary = printSummary(results, selectedCases);
    if (jsonOutputPath) {
        const safeResults = results.map(({ id, suite, mode, ccMode, category, expected, signal, model, latencyMs, inputTokens, outputTokens, cost, reasonCode, factorFamily, factor, variant, baselineId, sourceCaseId, repeatIndex }) => ({ id, suite, sourceCaseId, repeatIndex, mode, ccMode, category, expected, factorFamily, factor, variant, baselineId, signal, model, latencyMs, inputTokens, outputTokens, cost, reasonCode }));
        await (await import('node:fs/promises')).writeFile(resolve(jsonOutputPath), JSON.stringify({ results: safeResults, summary }, null, 2));
        console.log(`Wrote safe synthetic results to ${resolve(jsonOutputPath)}.`);
    }
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    void main().catch(error => {
        console.error(error instanceof Error ? error.message : 'Synthetic calibration failed.');
        process.exitCode = 1;
    });
}
