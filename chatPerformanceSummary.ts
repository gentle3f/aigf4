import type {
    ChatPerformanceEvent,
    ChatPerformanceTurn,
} from './chatPerformance.js';

export type ChatPerformanceSummary = {
    id: string;
    totalMs?: number;
    requestStartElapsedMs?: number;
    replyRenderElapsedMs?: number;
    localBeforeRequestMs?: number;
    networkObservedMs: number;
    lastNetworkFinishElapsedMs?: number;
    postNetworkToRenderMs?: number;
    requestToRenderMs?: number;
    promptBuildMs: number;
    groupParseMs: number;
    generationRequestMs: number;
    strictReviewRequestMs: number;
    groupScenePersistMs: number;
    responseCommitWorkMs: number;
    storageObservedWorkMs: number;
    repairRequests: number;
    fallbackRequests: number;
    strictReviewAttempts: number;
    eventCount: number;
};

const sumDurations = (
    turn: ChatPerformanceTurn,
    matches: (event: ChatPerformanceEvent) => boolean,
) => turn.events.reduce((total, event) => (
    matches(event) && typeof event.durationMs === 'number'
        ? total + event.durationMs
        : total
), 0);

const firstElapsed = (
    turn: ChatPerformanceTurn,
    matches: (event: ChatPerformanceEvent) => boolean,
) => turn.events.find(matches)?.elapsedMs;

const lastElapsed = (
    turn: ChatPerformanceTurn,
    matches: (event: ChatPerformanceEvent) => boolean,
) => {
    const matchesInOrder = turn.events.filter(matches);
    return matchesInOrder.at(-1)?.elapsedMs;
};

export const summarizeChatPerformanceTurn = (
    turn: ChatPerformanceTurn,
): ChatPerformanceSummary => {
    const isGenerationRequest = (event: ChatPerformanceEvent) => (
        event.label === 'generation:primary'
        || event.label === 'generation:repair'
        || event.label === 'generation:fallback'
        || event.label === 'generation:continuation'
    );
    const isObservedNetworkCompletion = (event: ChatPerformanceEvent) => (
        isGenerationRequest(event) || event.label === 'strict-review:request'
    );
    const requestStartElapsedMs = firstElapsed(turn, event => (
        event.label === 'generation:primary-request-start'
        || event.label === 'generation:continuation-request-start'
    ));
    const replyRenderElapsedMs = firstElapsed(turn, event => event.label === 'response:final-render');
    const generationRequestMs = sumDurations(turn, isGenerationRequest);
    const strictReviewRequestMs = sumDurations(turn, event => event.label === 'strict-review:request');
    const lastNetworkFinishElapsedMs = lastElapsed(turn, isObservedNetworkCompletion);

    return {
        id: turn.id,
        totalMs: typeof turn.completedAt === 'number'
            ? Math.max(0, Math.round(turn.completedAt - turn.startedAt))
            : undefined,
        requestStartElapsedMs,
        replyRenderElapsedMs,
        localBeforeRequestMs: requestStartElapsedMs,
        networkObservedMs: generationRequestMs + strictReviewRequestMs,
        lastNetworkFinishElapsedMs,
        postNetworkToRenderMs: typeof lastNetworkFinishElapsedMs === 'number'
            && typeof replyRenderElapsedMs === 'number'
            ? Math.max(0, replyRenderElapsedMs - lastNetworkFinishElapsedMs)
            : undefined,
        requestToRenderMs: typeof requestStartElapsedMs === 'number'
            && typeof replyRenderElapsedMs === 'number'
            ? Math.max(0, replyRenderElapsedMs - requestStartElapsedMs)
            : undefined,
        promptBuildMs: sumDurations(turn, event => event.label === 'generation:prompt-build'),
        groupParseMs: sumDurations(turn, event => event.label === 'generation:group-parse'),
        generationRequestMs,
        strictReviewRequestMs,
        groupScenePersistMs: sumDurations(turn, event => event.label === 'response:group-scene-persist'),
        responseCommitWorkMs: sumDurations(turn, event => (
            event.label === 'response:group-scene-persist'
            || event.label === 'response:final-persist'
            || event.label === 'response:final-render'
            || event.label === 'response:relationship-update'
        )),
        storageObservedWorkMs: sumDurations(turn, event => event.label.startsWith('storage:')),
        repairRequests: turn.events.filter(event => event.label === 'generation:repair-request-start').length,
        fallbackRequests: turn.events.filter(event => event.label === 'generation:fallback-request-start').length,
        strictReviewAttempts: turn.events.filter(event => event.label === 'strict-review:request-start').length,
        eventCount: turn.events.length,
    };
};
