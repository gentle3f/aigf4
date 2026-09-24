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
    attempts: GenerationAttemptTrace[];
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

export interface GenerationAttemptTrace {
    phase: 'primary' | 'repair' | 'fallback' | 'continuation';
    model: string;
    routeIndex?: number;
    attemptIndex?: number;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    finishReason?: string | null;
    outcome: 'accepted' | 'invalid' | 'error' | 'aborted';
    errorCode?: string;
}

export const createGenerationTrace = (
    requestId: string,
    mode: EngineTurnMode,
    conversationKey?: string,
): GenerationTrace => ({ requestId, conversationKey, mode, attempts: [] });

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
    attempt: GenerationAttemptTrace,
) => {
    trace.attempts.push({ ...attempt });
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
