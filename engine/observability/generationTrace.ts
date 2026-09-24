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
    stages?: {
        generationLatencyMs?: number;
        reviewLatencyMs?: number;
    };
    final?: {
        totalLatencyMs?: number;
        outcome?: 'accepted' | 'error' | 'aborted';
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

export interface TracedSingleTurnDependencies<TCandidate> {
    generateCandidate: () => Promise<TCandidate>;
    reviewCandidate: (candidate: TCandidate) => Promise<TCandidate>;
}

export interface SingleTurnTraceOptions {
    now?: () => number;
    isAbortError?: (error: unknown) => boolean;
    record?: (trace: GenerationTrace) => void;
}

export const MAX_RECENT_GENERATION_TRACES = 50;
const recentGenerationTraces: GenerationTrace[] = [];

const cloneGenerationTrace = (trace: GenerationTrace): GenerationTrace => ({
    ...trace,
    route: trace.route ? {
        ...trace.route,
        fallbackModels: trace.route.fallbackModels ? [...trace.route.fallbackModels] : undefined,
        strictReviewModels: trace.route.strictReviewModels ? [...trace.route.strictReviewModels] : undefined,
    } : undefined,
    context: trace.context ? { ...trace.context } : undefined,
    attempts: trace.attempts.map(attempt => ({ ...attempt })),
    decision: trace.decision ? { ...trace.decision } : undefined,
    strictReview: trace.strictReview ? { ...trace.strictReview } : undefined,
    stages: trace.stages ? { ...trace.stages } : undefined,
    final: trace.final ? { ...trace.final } : undefined,
});

// This collector is intentionally process-local and bounded. It never persists
// traces or lets trace-recording failures affect a chat response.
export const recordGenerationTrace = (trace: GenerationTrace) => {
    try {
        recentGenerationTraces.push(cloneGenerationTrace(trace));
        if (recentGenerationTraces.length > MAX_RECENT_GENERATION_TRACES) {
            recentGenerationTraces.splice(0, recentGenerationTraces.length - MAX_RECENT_GENERATION_TRACES);
        }
    } catch { /* Trace recording is strictly observational. */ }
};

export const getRecentGenerationTraces = (): GenerationTrace[] => {
    try {
        return recentGenerationTraces.map(cloneGenerationTrace);
    } catch {
        return [];
    }
};

export const clearRecentGenerationTracesForTesting = () => {
    recentGenerationTraces.length = 0;
};

const safeNow = (now: () => number) => {
    try {
        return now();
    } catch {
        return 0;
    }
};

const elapsedSince = (startedAt: number, now: () => number) => Math.max(0, safeNow(now) - startedAt);

// Wrap the existing adapter dependencies without taking over generation or review
// correctness. The adapter still owns the exact generate-then-review sequence.
export const createTracedSingleTurnDependencies = <TCandidate>(
    trace: GenerationTrace,
    dependencies: TracedSingleTurnDependencies<TCandidate>,
    options: SingleTurnTraceOptions = {},
): TracedSingleTurnDependencies<TCandidate> => {
    const now = options.now || (() => performance.now());
    const startedAt = safeNow(now);
    let finalized = false;

    const finish = (outcome: NonNullable<GenerationTrace['final']>['outcome']) => {
        if (finalized) return;
        finalized = true;
        try {
            finalizeGenerationTrace(trace, {
                totalLatencyMs: elapsedSince(startedAt, now),
                outcome,
            });
            (options.record || recordGenerationTrace)(trace);
        } catch { /* Trace finalization must not affect the adapter result. */ }
    };

    const outcomeFor = (error: unknown): 'error' | 'aborted' => {
        try {
            return options.isAbortError?.(error) ? 'aborted' : 'error';
        } catch {
            return 'error';
        }
    };

    const setStageLatency = (stage: keyof NonNullable<GenerationTrace['stages']>, startedAt: number) => {
        try {
            trace.stages = { ...trace.stages, [stage]: elapsedSince(startedAt, now) };
        } catch { /* Trace timing is best-effort only. */ }
    };

    return {
        generateCandidate: async () => {
            const generationStartedAt = safeNow(now);
            try {
                const candidate = await dependencies.generateCandidate();
                setStageLatency('generationLatencyMs', generationStartedAt);
                return candidate;
            } catch (error) {
                setStageLatency('generationLatencyMs', generationStartedAt);
                finish(outcomeFor(error));
                throw error;
            }
        },
        reviewCandidate: async candidate => {
            const reviewStartedAt = safeNow(now);
            try {
                const reviewed = await dependencies.reviewCandidate(candidate);
                setStageLatency('reviewLatencyMs', reviewStartedAt);
                finish('accepted');
                return reviewed;
            } catch (error) {
                setStageLatency('reviewLatencyMs', reviewStartedAt);
                finish(outcomeFor(error));
                throw error;
            }
        },
    };
};
