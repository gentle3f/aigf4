import type { StrictReviewDecision } from '../../strictReview.js';
import type { VeniceJsonSchemaResponseFormat, VeniceMessage, VeniceTextGenerationResult } from '../../venice.js';
import { runStrictReviewAttempt } from './reviewAttemptExecutor.js';
import type { StrictReviewAttemptContext, StrictReviewAttemptExecutorDependencies } from './reviewAttemptExecutor.js';
import { requestStrictReviewCompletion } from './strictReviewAdapter.js';
import type { StrictReviewCompletionRequest } from './strictReviewAdapter.js';
import { buildStrictReviewRequest } from './reviewRequestBuilder.js';
import { parseStrictReviewDecision } from './reviewResultParser.js';

export interface PreparedStrictReviewAttemptInput extends StrictReviewAttemptContext {
    editorPrompt: string;
    authoritativePrompt: string;
    latestUserMessage: string;
    candidateResponse: string;
    promptCacheKey: string;
    signal: AbortSignal;
    responseFormat: VeniceJsonSchemaResponseFormat;
}

export interface PreparedStrictReviewRequest {
    model: string;
    attemptIndex: number;
    isFallback: boolean;
    reviewHistory: VeniceMessage[];
    messages: VeniceMessage[];
    candidateAndUser: string;
}

export interface PreparedStrictReviewResponse extends PreparedStrictReviewRequest {
    result: VeniceTextGenerationResult;
    reviewStartedAt: number;
}

export interface StrictReviewAttemptCoordinatorDependencies extends Omit<
    StrictReviewAttemptExecutorDependencies,
    'executeRequest' | 'parseResult'
> {
    getReviewHistory: () => VeniceMessage[];
    requestText: StrictReviewCompletionRequest['requestText'];
    onPrepare?: () => void;
    onRequestStarted?: () => void;
    onRequestPrepared?: (request: PreparedStrictReviewRequest) => void;
    onResponse?: (response: PreparedStrictReviewResponse) => void;
}

export const runPreparedStrictReviewAttempt = async (
    input: PreparedStrictReviewAttemptInput,
    dependencies: StrictReviewAttemptCoordinatorDependencies,
): Promise<StrictReviewDecision | null> => {
    const now = dependencies.now || (() => performance.now());

    try {
        dependencies.onPrepare?.();
        const reviewStartedAt = now();
        dependencies.onRequestStarted?.();
        const reviewHistory = dependencies.getReviewHistory();
        const { messages, candidateAndUser } = buildStrictReviewRequest({
            editorPrompt: input.editorPrompt,
            authoritativePrompt: input.authoritativePrompt,
            reviewHistory,
            latestUserMessage: input.latestUserMessage,
            candidateResponse: input.candidateResponse,
        });
        const preparedRequest = {
            model: input.model,
            attemptIndex: input.attemptIndex,
            isFallback: input.isFallback,
            reviewHistory,
            messages,
            candidateAndUser,
        };
        dependencies.onRequestPrepared?.(preparedRequest);
        return runStrictReviewAttempt(input, {
            ...dependencies,
            now,
            executeRequest: async () => {
                const result = await requestStrictReviewCompletion({
                    requestText: dependencies.requestText,
                    model: input.model,
                    messages,
                    responseFormat: input.responseFormat,
                    promptCacheKey: input.promptCacheKey,
                    signal: input.signal,
                });
                dependencies.onResponse?.({ ...preparedRequest, result, reviewStartedAt });
                return result;
            },
            parseResult: parseStrictReviewDecision,
        });
    } catch (error) {
        if (dependencies.shouldRethrow(error)) throw error;
        dependencies.onFailure?.(error);
        return null;
    }
};
