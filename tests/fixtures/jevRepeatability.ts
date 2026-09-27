import { JEV_FACTOR_ISOLATION_CASES, type JevFactorFamily } from './jevFactorIsolation.js';
import type { JevSyntheticExpected } from './jevSyntheticCalibration.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import type { ReviewState } from '../../engine/contracts.js';

export const JEV_REPEATABILITY_SOURCE_IDS = [
    'isolation-group-baseline',
    'isolation-group-npc-tag',
    'isolation-group-full-envelope',
    'isolation-group-positive',
    'isolation-persona-cc-baseline',
    'isolation-persona-traditional-chinese-candidate',
    'isolation-persona-positive-cc',
    'isolation-replay-baseline',
    'isolation-replay-explicit-not-completed',
    'isolation-replay-full-envelope',
    'isolation-replay-positive',
    'isolation-continuity-baseline',
    'isolation-continuity-scene-duplication',
    'isolation-continuity-positive',
    'isolation-wardrobe-unspecified',
    'isolation-wardrobe-conflict',
] as const;

export const JEV_REPEATABILITY_REPEATS = 5;

export interface JevRepeatabilityCase {
    id: string;
    suite: 'repeatability';
    sourceCaseId: typeof JEV_REPEATABILITY_SOURCE_IDS[number];
    repeatIndex: number;
    factorFamily: JevFactorFamily;
    category: StrictReviewIssueCode;
    expected: JevSyntheticExpected;
    mode: 'single' | 'group';
    ccMode: boolean;
    state: ReviewState;
}

const sources = new Map(JEV_FACTOR_ISOLATION_CASES.map(item => [item.id, item]));

// Repeat-major ordering interleaves sources to avoid immediate duplicate requests.
export const JEV_REPEATABILITY_CASES: readonly JevRepeatabilityCase[] = Array.from(
    { length: JEV_REPEATABILITY_REPEATS },
    (_, repeatOffset) => JEV_REPEATABILITY_SOURCE_IDS.map(sourceCaseId => {
        const source = sources.get(sourceCaseId);
        if (!source) throw new Error(`Missing repeatability source fixture: ${sourceCaseId}`);
        return {
            id: `repeatability-${sourceCaseId}-r${repeatOffset + 1}`,
            suite: 'repeatability' as const,
            sourceCaseId,
            repeatIndex: repeatOffset + 1,
            factorFamily: source.factorFamily,
            category: source.category,
            expected: source.expected,
            mode: source.mode,
            ccMode: source.ccMode,
            // Deliberately retain the exact frozen ReviewState object and field order.
            state: source.state,
        };
    }),
).flat();
