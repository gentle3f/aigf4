import type { StrictReviewIssueCode } from '../../strictReview.js';
import type { JevSyntheticExpected } from './jevSyntheticCalibration.js';
import { JEV_SEMANTIC_AB_CASES, JEV_SEMANTIC_AB_SOURCE_IDS } from './jevSemanticAb.js';

export type JevSinglePropositionQuestionSet = 'production' | 'category-v4';

export interface JevSinglePropositionAbCase {
    id: string;
    suite: 'single-proposition-ab';
    sourceCaseId: typeof JEV_SEMANTIC_AB_SOURCE_IDS[number];
    category: StrictReviewIssueCode;
    expected: JevSyntheticExpected;
    questionSet: JevSinglePropositionQuestionSet;
    mode: 'single' | 'group';
    ccMode: boolean;
    state: typeof JEV_SEMANTIC_AB_CASES[number]['state'];
}

const sourceById = new Map(JEV_SEMANTIC_AB_CASES.map(item => [item.sourceCaseId, item]));
const questionSetFor = (sourceIndex: number, complementaryPass: boolean): JevSinglePropositionQuestionSet => (
    (sourceIndex % 2 === 0) !== complementaryPass ? 'production' : 'category-v4'
);

// The Phase 4I source ordering is retained; only question-set construction differs.
export const JEV_SINGLE_PROPOSITION_AB_CASES: readonly JevSinglePropositionAbCase[] = [false, true].flatMap(complementaryPass => (
    JEV_SEMANTIC_AB_SOURCE_IDS.map((sourceCaseId, sourceIndex) => {
        const source = sourceById.get(sourceCaseId);
        if (!source) throw new Error(`Missing Phase 4I source fixture: ${sourceCaseId}`);
        const questionSet = questionSetFor(sourceIndex, complementaryPass);
        return {
            id: `single-proposition-ab-${sourceCaseId}-${questionSet}`,
            suite: 'single-proposition-ab' as const,
            sourceCaseId,
            category: source.category,
            expected: source.expected,
            questionSet,
            mode: source.mode,
            ccMode: source.ccMode,
            // The same frozen object used in Phase 4I is deliberately retained.
            state: source.state,
        };
    })
));
