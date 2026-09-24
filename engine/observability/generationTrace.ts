import type { EngineTurnMode, ResolvedModelRoute } from '../contracts.js';

export interface GenerationTrace {
    requestId: string;
    conversationKey?: string;
    mode: EngineTurnMode;
    route?: {
        primaryModel?: string;
        primarySource?: ResolvedModelRoute['source'];
        fallbackModels?: string[];
        strictReviewModels?: string[];
    };
    context?: {
        promptTokens?: number;
        systemChars?: number;
        recentHistoryMessages?: number;
        recentHistoryChars?: number;
        retrievedMemoryCount?: number;
        realityLayer?: string;
        realityEpochId?: string;
    };
    generation?: {
        attempts?: number;
        primaryLatencyMs?: number;
        fallbackUsed?: boolean;
        continuationCount?: number;
    };
    decision?: {
        provider?: string;
        latencyMs?: number;
        wouldRoute?: 'accept' | 'strict-review';
    };
    strictReview?: {
        ran: boolean;
        model?: string;
        decision?: 'keep' | 'revise';
        latencyMs?: number;
    };
    final?: {
        totalLatencyMs?: number;
        committed?: boolean;
    };
}

export const createGenerationTrace = (
    requestId: string,
    mode: EngineTurnMode,
    conversationKey?: string,
): GenerationTrace => ({ requestId, conversationKey, mode });

// Deliberately metadata-only: this module has no fields for prompts, replies,
// message bodies, credentials, or provider payloads.
export const markGenerationRoute = (trace: GenerationTrace, route: ResolvedModelRoute) => {
    trace.route = {
        primaryModel: route.primary,
        primarySource: route.source,
        fallbackModels: [...route.fallbacks],
        strictReviewModels: [...route.strictReview],
    };
};

export const markGenerationAttempt = (
    trace: GenerationTrace,
    options: { primaryLatencyMs?: number; fallbackUsed?: boolean; continuation?: boolean },
) => {
    const generation = trace.generation || (trace.generation = {});
    generation.attempts = (generation.attempts || 0) + 1;
    if (typeof options.primaryLatencyMs === 'number') generation.primaryLatencyMs = options.primaryLatencyMs;
    if (options.fallbackUsed) generation.fallbackUsed = true;
    if (options.continuation) generation.continuationCount = (generation.continuationCount || 0) + 1;
};

export const markStrictReview = (
    trace: GenerationTrace,
    review: GenerationTrace['strictReview'],
) => {
    trace.strictReview = review ? { ...review } : { ran: false };
};

export const finalizeGenerationTrace = (
    trace: GenerationTrace,
    final: NonNullable<GenerationTrace['final']>,
) => {
    trace.final = { ...final };
    return trace;
};
