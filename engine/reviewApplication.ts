import type { StrictReviewDecision } from '../strictReview.js';

export const hasCompleteGroupRevisionEnvelope = (value: string) => (
    /<chat>[\s\S]*<\/chat>/iu.test(value)
    && /<scene>[\s\S]*<\/scene>/iu.test(value)
    && /<npc_candidate>[\s\S]*<\/npc_candidate>/iu.test(value)
);

// Validation stays with the legacy generator. This helper only owns the
// decision boundary: an unavailable/KEEP/invalid revision never replaces the
// already accepted candidate.
export const applySingleStrictReview = <T>(
    candidate: T,
    decision: StrictReviewDecision | null,
    validateRevision: (response: string) => T | null,
) => {
    if (!decision || decision.decision === 'keep') return candidate;
    return validateRevision(decision.revisedResponse) ?? candidate;
};

export const applyGroupStrictReview = <T>(
    candidate: T,
    decision: StrictReviewDecision | null,
    validateRevision: (response: string) => T | null,
) => {
    if (!decision || decision.decision === 'keep') return candidate;
    if (!hasCompleteGroupRevisionEnvelope(decision.revisedResponse)) return candidate;
    return validateRevision(decision.revisedResponse) ?? candidate;
};
