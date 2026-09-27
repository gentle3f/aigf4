import { buildSingleQuestionExperimentalSet } from './jevSingleQuestionHybrid.js';
import { JEV_CANDIDATE_GUARDRAIL_SOURCES, type JevCandidateGuardrailCategory, type JevCandidateGuardrailFamily } from './jevCandidateGuardrails.js';
import type { JevSyntheticExpected } from './jevSyntheticCalibration.js';
import type { ReviewState } from '../../engine/contracts.js';

export type JevCandidateGuardrailQuestionSet = 'production' | 'category-v4';
export interface JevCandidateGuardrailAbCase {
    id: string;
    suite: 'candidate-guardrail';
    sourceCaseId: string;
    category: JevCandidateGuardrailCategory;
    expected: JevSyntheticExpected;
    guardrailFamily: JevCandidateGuardrailFamily;
    shapeNotes: string;
    questionSet: JevCandidateGuardrailQuestionSet;
    mode: 'single' | 'group';
    ccMode: boolean;
    state: ReviewState;
}

const questionSetFor = (index: number, complementaryPass: boolean): JevCandidateGuardrailQuestionSet => ((index % 2 === 0) !== complementaryPass ? 'production' : 'category-v4');

export const JEV_CANDIDATE_GUARDRAIL_CASES: readonly JevCandidateGuardrailAbCase[] = [false, true].flatMap(complementaryPass => (
    JEV_CANDIDATE_GUARDRAIL_SOURCES.map((source, index) => {
        const questionSet = questionSetFor(index, complementaryPass);
        return { id: `candidate-guardrail-${source.id}-${questionSet}`, suite: 'candidate-guardrail' as const, sourceCaseId: source.id, category: source.category, expected: source.expected, guardrailFamily: source.guardrailFamily, shapeNotes: source.shapeNotes, questionSet, mode: source.state.mode, ccMode: source.state.ccMode, state: source.state };
    })
));

export const candidateGuardrailHybrid = (category: JevCandidateGuardrailCategory) => buildSingleQuestionExperimentalSet(category);
