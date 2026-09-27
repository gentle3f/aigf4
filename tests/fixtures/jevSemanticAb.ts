import type { ReviewState } from '../../engine/contracts.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import { JEV_FACTOR_ISOLATION_CASES } from './jevFactorIsolation.js';
import { JEV_PRODUCTION_SHAPE_PARITY_CASES } from './jevProductionShapeParity.js';
import { JEV_SYNTHETIC_CALIBRATION_CASES, type JevSyntheticExpected } from './jevSyntheticCalibration.js';

type FrozenSource = {
    id: string;
    category: StrictReviewIssueCode;
    expected: JevSyntheticExpected;
    state: ReviewState;
};

export const JEV_SEMANTIC_AB_SOURCE_IDS = [
    'wardrobe-positive', 'wardrobe-negative', 'control-unestablished-wardrobe', 'isolation-wardrobe-unspecified',
    'replayed-beat-positive', 'replayed-beat-negative', 'control-unproven-replay', 'isolation-replay-explicit-not-completed',
    'isolation-replay-different-object', 'isolation-replay-different-participant', 'isolation-replay-repeated-action-verb',
    'continuity-positive', 'continuity-negative', 'parity-continuity-complex-history-negative', 'isolation-continuity-scene-duplication',
    'persona-voice-positive', 'parity-persona-normal-negative', 'parity-persona-cc-negative', 'parity-persona-group-negative',
    'parity-persona-cc-no-explicit-rule', 'isolation-persona-positive-cc',
    'group-narration-positive', 'group-narration-negative', 'control-group-labelled-dialogue',
    'isolation-group-first-person-labelled', 'parity-group-narration-envelope-negative',
    'other-positive', 'other-negative',
] as const;

export type JevSemanticQuestionSet = 'production' | 'experimental';

export interface JevSemanticAbCase {
    id: string;
    suite: 'semantic-ab';
    sourceCaseId: typeof JEV_SEMANTIC_AB_SOURCE_IDS[number];
    category: StrictReviewIssueCode;
    expected: JevSyntheticExpected;
    questionSet: JevSemanticQuestionSet;
    mode: 'single' | 'group';
    ccMode: boolean;
    state: ReviewState;
}

const sourceById = new Map<string, FrozenSource>([
    ...JEV_SYNTHETIC_CALIBRATION_CASES,
    ...JEV_PRODUCTION_SHAPE_PARITY_CASES,
    ...JEV_FACTOR_ISOLATION_CASES,
].map(item => [item.id, item]));

const sources = JEV_SEMANTIC_AB_SOURCE_IDS.map(sourceCaseId => {
    const source = sourceById.get(sourceCaseId);
    if (!source) throw new Error(`Missing semantic A/B source fixture: ${sourceCaseId}`);
    return { sourceCaseId, source };
});

const questionSetFor = (sourceIndex: number, complementaryPass: boolean): JevSemanticQuestionSet => (
    (sourceIndex % 2 === 0) !== complementaryPass ? 'production' : 'experimental'
);

// Two balanced passes keep A/B requests deterministic without adjacent pairs.
export const JEV_SEMANTIC_AB_CASES: readonly JevSemanticAbCase[] = [false, true].flatMap(complementaryPass => (
    sources.map(({ sourceCaseId, source }, sourceIndex) => {
        const questionSet = questionSetFor(sourceIndex, complementaryPass);
        return {
            id: `semantic-ab-${sourceCaseId}-${questionSet}`,
            suite: 'semantic-ab' as const,
            sourceCaseId,
            category: source.category,
            expected: source.expected,
            questionSet,
            mode: source.state.mode,
            ccMode: source.state.ccMode,
            // Preserve the exact frozen source object and its serialization.
            state: source.state,
        };
    })
));
