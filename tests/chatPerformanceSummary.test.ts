import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { ChatPerformanceTurn } from '../chatPerformance.js';
import { summarizeChatPerformanceTurn } from '../chatPerformanceSummary.js';

test('summarizes one completed chat turn into stable timing phases without content', () => {
    const turn: ChatPerformanceTurn = {
        id: 'turn-1',
        startedAt: 1000,
        completedAt: 1650,
        events: [
            { label: 'send:user-render', elapsedMs: 5, durationMs: 2 },
            { label: 'send:user-persist', elapsedMs: 10, durationMs: 3 },
            { label: 'generation:prompt-build', elapsedMs: 30, durationMs: 12 },
            { label: 'generation:primary-request-start', elapsedMs: 50 },
            { label: 'generation:primary', elapsedMs: 250, durationMs: 200 },
            { label: 'generation:repair-request-start', elapsedMs: 260 },
            { label: 'generation:repair', elapsedMs: 340, durationMs: 80 },
            { label: 'generation:fallback-request-start', elapsedMs: 350 },
            { label: 'generation:fallback', elapsedMs: 440, durationMs: 90 },
            { label: 'strict-review:request-start', elapsedMs: 450 },
            { label: 'strict-review:request', elapsedMs: 520, durationMs: 70 },
            { label: 'strict-review:request-start', elapsedMs: 525 },
            { label: 'strict-review:request', elapsedMs: 585, durationMs: 60 },
            { label: 'storage:worker-post', elapsedMs: 30, durationMs: 3 },
            { label: 'storage:cloud-notify', elapsedMs: 35, durationMs: 2 },
            { label: 'response:final-persist', elapsedMs: 600, durationMs: 5 },
            { label: 'response:final-render', elapsedMs: 620, durationMs: 8 },
            { label: 'response:relationship-update', elapsedMs: 630, durationMs: 4 },
            { label: 'response:final-visible', elapsedMs: 640 },
        ],
    };

    assert.deepEqual(summarizeChatPerformanceTurn(turn), {
        id: 'turn-1',
        totalMs: 650,
        requestStartElapsedMs: 50,
        replyRenderElapsedMs: 620,
        localBeforeRequestMs: 50,
        networkObservedMs: 500,
        lastNetworkFinishElapsedMs: 585,
        postNetworkToRenderMs: 35,
        requestToRenderMs: 570,
        promptBuildMs: 12,
        groupParseMs: 0,
        generationRequestMs: 370,
        strictReviewRequestMs: 130,
        groupScenePersistMs: 0,
        responseCommitWorkMs: 17,
        storageObservedWorkMs: 5,
        repairRequests: 1,
        fallbackRequests: 1,
        strictReviewAttempts: 2,
        eventCount: 19,
    });
});

test('keeps incomplete or non-generation turns descriptive instead of inventing timings', () => {
    const turn: ChatPerformanceTurn = {
        id: 'turn-2',
        startedAt: 2000,
        events: [
            { label: 'send:user-render', elapsedMs: 4, durationMs: 1 },
        ],
    };

    assert.deepEqual(summarizeChatPerformanceTurn(turn), {
        id: 'turn-2',
        totalMs: undefined,
        requestStartElapsedMs: undefined,
        replyRenderElapsedMs: undefined,
        localBeforeRequestMs: undefined,
        networkObservedMs: 0,
        lastNetworkFinishElapsedMs: undefined,
        postNetworkToRenderMs: undefined,
        requestToRenderMs: undefined,
        promptBuildMs: 0,
        groupParseMs: 0,
        generationRequestMs: 0,
        strictReviewRequestMs: 0,
        groupScenePersistMs: 0,
        responseCommitWorkMs: 0,
        storageObservedWorkMs: 0,
        repairRequests: 0,
        fallbackRequests: 0,
        strictReviewAttempts: 0,
        eventCount: 1,
    });
});

test('performance summaries stay in an optional cold chunk for normal users', () => {
    const source = readFileSync(new URL('../chatPerformance.ts', import.meta.url), 'utf8');

    assert.match(source, /import\(['"]\.\/chatPerformanceSummary\.js['"]\)/);
    assert.doesNotMatch(source, /from ['"]\.\/chatPerformanceSummary\.js['"]/);
    assert.match(source, /summaries: completedTurns\.map\(summarizeChatPerformanceTurn\)/);
    assert.match(source, /Raw timing events remain available/);
});

test('summarizes Group parser and scene persistence separately from network time', () => {
    const turn: ChatPerformanceTurn = {
        id: 'group-turn',
        startedAt: 0,
        completedAt: 420,
        events: [
            { label: 'generation:prompt-build', elapsedMs: 18, durationMs: 6 },
            { label: 'generation:primary-request-start', elapsedMs: 18 },
            { label: 'generation:primary', elapsedMs: 220, durationMs: 202 },
            { label: 'generation:group-parse', elapsedMs: 224, durationMs: 4 },
            { label: 'strict-review:request-start', elapsedMs: 230 },
            { label: 'strict-review:request', elapsedMs: 360, durationMs: 130 },
            { label: 'response:group-scene-persist', elapsedMs: 368, durationMs: 5 },
            { label: 'response:final-persist', elapsedMs: 369, durationMs: 1 },
            { label: 'response:final-render', elapsedMs: 378, durationMs: 9 },
            { label: 'response:relationship-update', elapsedMs: 380, durationMs: 2 },
        ],
    };

    const summary = summarizeChatPerformanceTurn(turn);
    assert.equal(summary.promptBuildMs, 6);
    assert.equal(summary.groupParseMs, 4);
    assert.equal(summary.groupScenePersistMs, 5);
    assert.equal(summary.generationRequestMs, 202);
    assert.equal(summary.strictReviewRequestMs, 130);
    assert.equal(summary.networkObservedMs, 332);
    assert.equal(summary.responseCommitWorkMs, 17);
});
