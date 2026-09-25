import type { VeniceMessage } from '../../venice.js';

export interface StrictReviewRequestBuildInput {
    editorPrompt: string;
    authoritativePrompt: string;
    reviewHistory: readonly VeniceMessage[];
    latestUserMessage: string;
    candidateResponse: string;
}

export interface StrictReviewRequestBuildResult {
    messages: VeniceMessage[];
    candidateAndUser: string;
}

export const buildStrictReviewRequest = (
    input: StrictReviewRequestBuildInput,
): StrictReviewRequestBuildResult => {
    const candidateAndUser = [
        `NEWEST USER MESSAGE:\n${input.latestUserMessage}`,
        `CANDIDATE RESPONSE TO AUDIT:\n${input.candidateResponse}`,
        'Return the strict review JSON now.',
    ].join('\n\n');
    return {
        candidateAndUser,
        messages: [
            { role: 'system', content: input.editorPrompt },
            { role: 'system', content: `AUTHORITATIVE CHARACTER AND CONTINUITY RULES:\n${input.authoritativePrompt}` },
            ...input.reviewHistory,
            { role: 'user', content: candidateAndUser },
        ],
    };
};
