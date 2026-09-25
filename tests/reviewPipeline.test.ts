import assert from 'node:assert/strict';
import test from 'node:test';
import { runReviewPipeline } from '../engine/review/reviewPipeline.js';

test('returns the first reviewer decision without calling later reviewers', async () => {
    const decision = { decision: 'keep' };
    const calls: string[] = [];
    const result = await runReviewPipeline({
        reviewerModels: ['reviewer-a', 'reviewer-b'],
        runAttempt: async context => {
            calls.push(context.model);
            return decision;
        },
    });

    assert.equal(result, decision);
    assert.deepEqual(calls, ['reviewer-a']);
});

test('continues after null with stable route contexts then short-circuits', async () => {
    const contexts: Array<{ model: string; routeIndex: number; attemptIndex: number; isFallback: boolean }> = [];
    const decision = { decision: 'revise' };
    const result = await runReviewPipeline({
        reviewerModels: ['reviewer-a', 'reviewer-b', 'reviewer-c'],
        runAttempt: async context => {
            contexts.push(context);
            return context.model === 'reviewer-b' ? decision : null;
        },
    });

    assert.equal(result, decision);
    assert.deepEqual(contexts, [
        { model: 'reviewer-a', routeIndex: 0, attemptIndex: 1, isFallback: false },
        { model: 'reviewer-b', routeIndex: 1, attemptIndex: 2, isFallback: true },
    ]);
});

test('returns null after every reviewer returns null, including an empty route', async () => {
    const calls: string[] = [];
    const result = await runReviewPipeline({
        reviewerModels: ['reviewer-a', 'reviewer-b', 'reviewer-c'],
        runAttempt: async context => {
            calls.push(context.model);
            return null;
        },
    });
    const emptyResult = await runReviewPipeline({
        reviewerModels: [],
        runAttempt: async () => ({ decision: 'unreachable' }),
    });

    assert.equal(result, null);
    assert.deepEqual(calls, ['reviewer-a', 'reviewer-b', 'reviewer-c']);
    assert.equal(emptyResult, null);
});

test('propagates the same error or abort object without calling later reviewers', async () => {
    const error = new Error('review failure');
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const thrown of [error, abort]) {
        let calls = 0;
        await assert.rejects(
            runReviewPipeline({
                reviewerModels: ['reviewer-a', 'reviewer-b'],
                runAttempt: async () => {
                    calls += 1;
                    throw thrown;
                },
            }),
            received => received === thrown,
        );
        assert.equal(calls, 1);
    }
});

test('preserves duplicate reviewer models as distinct route positions', async () => {
    const contexts: Array<{ model: string; routeIndex: number; attemptIndex: number; isFallback: boolean }> = [];
    await runReviewPipeline({
        reviewerModels: ['reviewer-a', 'reviewer-a', 'reviewer-b'],
        runAttempt: async context => {
            contexts.push(context);
            return null;
        },
    });

    assert.deepEqual(contexts, [
        { model: 'reviewer-a', routeIndex: 0, attemptIndex: 1, isFallback: false },
        { model: 'reviewer-a', routeIndex: 1, attemptIndex: 2, isFallback: true },
        { model: 'reviewer-b', routeIndex: 2, attemptIndex: 3, isFallback: true },
    ]);
});
