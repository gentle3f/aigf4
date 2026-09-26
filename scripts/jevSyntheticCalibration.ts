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
    category: keyof typeof signalKeyByCategory;
    expected: JevSyntheticExpected;
    signal?: number;
    model?: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    reasonCode?: string;
}

export const validateSyntheticCalibrationCorpus = (cases: readonly JevSyntheticCalibrationCase[]): string[] => {
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
    if (cases.length < 34) errors.push('corpus contains fewer than 34 cases');
    for (const category of STRICT_REVIEW_ISSUE_CODES) {
        const entries = byCategory.get(category) || [];
        if (!entries.some(item => item.expected === 'negative')) errors.push(`missing negative case: ${category}`);
        if (category !== 'other' && !entries.some(item => item.expected === 'positive')) errors.push(`missing positive case: ${category}`);
    }
    for (const [pairId, entries] of pairs) {
        if (entries.length !== 2 || !entries.some(item => item.expected === 'positive') || !entries.some(item => item.expected === 'negative')) {
            errors.push(`invalid positive/negative pair: ${pairId}`);
        }
    }
    return errors;
};

const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
const min = (values: readonly number[]) => values.length ? Math.min(...values) : undefined;
const max = (values: readonly number[]) => values.length ? Math.max(...values) : undefined;

export const aggregateSyntheticCalibration = (results: readonly SyntheticCalibrationResult[]) => {
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
        const fixture = JEV_SYNTHETIC_CALIBRATION_CASES.find(item => item.id === result.id);
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
    return { categories, directionalPairs: { compared: pairRows.length, positiveGreaterThanNegative: pairSuccesses, nonDirectionalPairIds: pairRows.filter(entries => {
        const positive = entries.find(entry => entry.expected === 'positive');
        const negative = entries.find(entry => entry.expected === 'negative');
        return !positive || !negative || positive.signal === undefined || negative.signal === undefined || positive.signal <= negative.signal;
    }).map(entries => JEV_SYNTHETIC_CALIBRATION_CASES.find(item => item.id === entries[0]?.id)?.pairId) } };
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

export const runSyntheticCalibration = async (live: boolean): Promise<SyntheticCalibrationResult[]> => {
    const apiKey = live ? await readLocalOpenRouterApi() : undefined;
    if (live && !apiKey) throw new Error('OPENROUTER_API is unavailable for the explicit live run.');
    const results: SyntheticCalibrationResult[] = [];
    for (const fixture of JEV_SYNTHETIC_CALIBRATION_CASES) {
        const startedAt = performance.now();
        const response = live
            ? await runOpenRouterDecision(fixture.state, { env: { OPENROUTER_API: apiKey } })
            : undefined;
        const latencyMs = Math.round(performance.now() - startedAt);
        if (response?.status === 'ok') {
            const signal = response.signals[signalKeyByCategory[fixture.category] as SignalKey];
            results.push({ id: fixture.id, category: fixture.category, expected: fixture.expected, signal, model: response.model, latencyMs, inputTokens: response.usage?.inputTokens, outputTokens: response.usage?.outputTokens, cost: response.usage?.cost });
        } else if (response) {
            results.push({ id: fixture.id, category: fixture.category, expected: fixture.expected, latencyMs, reasonCode: response.reasonCode });
        }
    }
    return results;
};

const printSummary = (results: readonly SyntheticCalibrationResult[]) => {
    const summary = aggregateSyntheticCalibration(results);
    for (const [category, metrics] of Object.entries(summary.categories)) {
        console.log(`${category}: +${metrics.positiveCount} -${metrics.negativeCount} mean ${metrics.positiveMean ?? 'n/a'} / ${metrics.negativeMean ?? 'n/a'} separation ${metrics.meanSeparation ?? 'n/a'}`);
    }
    console.log(`directional pairs: ${summary.directionalPairs.positiveGreaterThanNegative}/${summary.directionalPairs.compared}`);
    return summary;
};

const main = async () => {
    const args = process.argv.slice(2);
    const live = args.includes('--live');
    const jsonOutputPath = parseJsonOutputPath(args);
    if (args.includes('--json-out') && !jsonOutputPath) throw new Error('--json-out requires a destination path.');
    const errors = validateSyntheticCalibrationCorpus(JEV_SYNTHETIC_CALIBRATION_CASES);
    if (errors.length) throw new Error(`Synthetic fixture validation failed: ${errors.join('; ')}`);
    console.log(`Jev synthetic calibration: ${JEV_SYNTHETIC_CALIBRATION_CASES.length} fictional cases across ${STRICT_REVIEW_ISSUE_CODES.length} categories.`);
    if (!live) {
        if (jsonOutputPath) throw new Error('--json-out requires --live; no file was written.');
        console.log('Offline validation complete. No OpenRouter request was made. Use --live to run the explicit synthetic calibration.');
        return;
    }
    const results = await runSyntheticCalibration(true);
    const summary = printSummary(results);
    if (jsonOutputPath) {
        const safeResults = results.map(({ id, category, expected, signal, model, latencyMs, inputTokens, outputTokens, cost, reasonCode }) => ({ id, category, expected, signal, model, latencyMs, inputTokens, outputTokens, cost, reasonCode }));
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
