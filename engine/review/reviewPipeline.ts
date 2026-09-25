export interface ReviewPipelineAttemptContext {
    model: string;
    routeIndex: number;
    attemptIndex: number;
    isFallback: boolean;
}

export interface ReviewPipelineDependencies<TDecision> {
    reviewerModels: readonly string[];
    runAttempt: (context: ReviewPipelineAttemptContext) => Promise<TDecision | null>;
}

// Provider, parsing, retry, and error semantics stay in the injected attempt.
// This seam only preserves the ordered reviewer route and first-decision rule.
export const runReviewPipeline = async <TDecision>(
    dependencies: ReviewPipelineDependencies<TDecision>,
): Promise<TDecision | null> => {
    for (let routeIndex = 0; routeIndex < dependencies.reviewerModels.length; routeIndex += 1) {
        const decision = await dependencies.runAttempt({
            model: dependencies.reviewerModels[routeIndex],
            routeIndex,
            attemptIndex: routeIndex + 1,
            isFallback: routeIndex > 0,
        });
        if (decision !== null) return decision;
    }
    return null;
};
