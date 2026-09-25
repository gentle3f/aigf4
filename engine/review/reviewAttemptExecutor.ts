import type { StrictReviewDecision } from '../../strictReview.js';
import type { VeniceTextGenerationResult } from '../../venice.js';
import type { StrictReviewAttemptTrace } from '../observability/generationTrace.js';

export interface StrictReviewAttemptContext {
    model: string;
    attemptIndex: number;
    isFallback: boolean;
}

type StrictReviewAttemptFailure = Pick<StrictReviewAttemptTrace, 'outcome' | 'errorCode'>;

export interface StrictReviewAttemptExecutorDependencies {
    now?: () => number;
    executeRequest: () => Promise<VeniceTextGenerationResult>;
    parseResult: (text: string) => StrictReviewDecision | null;
    recordAttempt: (attempt: StrictReviewAttemptTrace) => void;
    classifyFailure: (error: unknown) => StrictReviewAttemptFailure;
    shouldRethrow: (error: unknown) => boolean;
    onParseTiming?: (startedAt: number) => void;
    onSuccess?: (result: VeniceTextGenerationResult, decision: StrictReviewDecision) => void;
    onFailure?: (error: unknown) => void;
}

export const runStrictReviewAttempt = async (
    context: StrictReviewAttemptContext,
    dependencies: StrictReviewAttemptExecutorDependencies,
): Promise<StrictReviewDecision | null> => {
    const now = dependencies.now || (() => performance.now());
    let requestStartedAt: number | null = null;
    let attemptRecorded = false;

    try {
        requestStartedAt = now();
        const result = await dependencies.executeRequest();
        const parseStartedAt = now();
        const decision = dependencies.parseResult(result.text);
        dependencies.onParseTiming?.(parseStartedAt);
        if (!decision) {
            dependencies.recordAttempt({
                model: result.model || context.model,
                attemptIndex: context.attemptIndex,
                latencyMs: Math.max(0, Math.round(now() - requestStartedAt)),
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                finishReason: result.finishReason ?? null,
                outcome: 'invalid',
                errorCode: 'INVALID_RESPONSE',
            });
            attemptRecorded = true;
            throw new Error(`Invalid strict review from ${context.model}.`);
        }
        dependencies.recordAttempt({
            model: result.model || context.model,
            attemptIndex: context.attemptIndex,
            latencyMs: Math.max(0, Math.round(now() - requestStartedAt)),
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            finishReason: result.finishReason ?? null,
            outcome: decision.decision,
        });
        attemptRecorded = true;
        dependencies.onSuccess?.(result, decision);
        return decision;
    } catch (error) {
        if (!attemptRecorded && requestStartedAt !== null) {
            dependencies.recordAttempt({
                model: context.model,
                attemptIndex: context.attemptIndex,
                latencyMs: Math.max(0, Math.round(now() - requestStartedAt)),
                ...dependencies.classifyFailure(error),
            });
        }
        if (dependencies.shouldRethrow(error)) throw error;
        dependencies.onFailure?.(error);
        return null;
    }
};
