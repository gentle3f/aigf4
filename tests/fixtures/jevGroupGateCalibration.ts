import { JEV_PRODUCTION_SHAPE_PARITY_CASES } from './jevProductionShapeParity.js';
import { JEV_GROUP_GATE_BROAD_CASES } from './jevGroupGateBroad.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import type { ReviewState } from '../../engine/contracts.js';
import type { JevSyntheticExpected } from './jevSyntheticCalibration.js';

export interface JevGroupGateCase {
    id: string;
    suite: 'group-gate-v1';
    sourceCaseId: string;
    sourceCategory: StrictReviewIssueCode;
    expected: JevSyntheticExpected;
    hardCheckOnly: boolean;
    shapeNotes: string;
    state: ReviewState;
}

const parityGroupSources = JEV_PRODUCTION_SHAPE_PARITY_CASES.filter(item => item.state.mode === 'group');

const parityCases: JevGroupGateCase[] = parityGroupSources.map(source => ({
    id: `group-gate-v1-${source.id}`,
    suite: 'group-gate-v1',
    sourceCaseId: source.id,
    sourceCategory: source.category,
    // Group narration ownership is deliberately removed from the semantic gate.
    expected: source.category === 'group_narration' ? 'negative' : source.expected,
    hardCheckOnly: source.category === 'group_narration' && source.expected === 'positive',
    shapeNotes: source.shapeNotes,
    state: source.state,
}));

const broadCases: JevGroupGateCase[] = JEV_GROUP_GATE_BROAD_CASES.map(source => ({
    id: source.id,
    suite: 'group-gate-v1',
    sourceCaseId: source.id,
    sourceCategory: source.sourceCategory,
    expected: source.expected,
    hardCheckOnly: false,
    shapeNotes: source.description,
    state: source.state,
}));

export const JEV_GROUP_GATE_PARITY_SOURCE_COUNT = parityGroupSources.length;
export const JEV_GROUP_GATE_BROAD_SOURCE_COUNT = JEV_GROUP_GATE_BROAD_CASES.length;
export const JEV_GROUP_GATE_SOURCE_COUNT = JEV_GROUP_GATE_PARITY_SOURCE_COUNT + JEV_GROUP_GATE_BROAD_SOURCE_COUNT;

export const JEV_GROUP_GATE_CASES: readonly JevGroupGateCase[] = [
    ...parityCases,
    ...broadCases,
];
