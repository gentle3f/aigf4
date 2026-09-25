import type {
    VeniceJsonSchemaResponseFormat,
    VeniceMessage,
    VeniceTextGenerationOptions,
    VeniceTextGenerationResult,
} from '../../venice.js';

export interface StrictReviewCompletionRequest {
    requestText: (options: VeniceTextGenerationOptions) => Promise<VeniceTextGenerationResult>;
    model: string;
    messages: VeniceMessage[];
    promptCacheKey: string;
    signal: AbortSignal;
    responseFormat: VeniceJsonSchemaResponseFormat;
}

// The injected transport owns timeout and abort behaviour. This adapter owns
// only the fixed single-request settings used by strict review.
export const requestStrictReviewCompletion = async (
    request: StrictReviewCompletionRequest,
): Promise<VeniceTextGenerationResult> => request.requestText({
    model: request.model,
    messages: request.messages,
    temperature: 0.18,
    topP: 0.82,
    repetitionPenalty: 1.02,
    stop: [],
    responseFormat: request.responseFormat,
    promptCacheKey: request.promptCacheKey,
    signal: request.signal,
});
