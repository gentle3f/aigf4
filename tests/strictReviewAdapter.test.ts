import assert from 'node:assert/strict';
import test from 'node:test';
import { requestStrictReviewCompletion } from '../engine/review/strictReviewAdapter.js';
import type { VeniceMessage, VeniceTextGenerationOptions, VeniceTextGenerationResult } from '../venice.js';

const messages: VeniceMessage[] = [
    { role: 'system', content: 'review instructions' },
    { role: 'user', content: 'candidate' },
];
const responseFormat = {
    type: 'json_schema' as const,
    json_schema: { name: 'strict_review', schema: { type: 'object' } },
};

test('sends the exact fixed strict-review request shape once without changing message identity', async () => {
    const signal = new AbortController().signal;
    const result: VeniceTextGenerationResult = { model: 'returned-model', text: 'raw result' };
    const received: VeniceTextGenerationOptions[] = [];
    const actual = await requestStrictReviewCompletion({
        requestText: async options => {
            received.push(options);
            return result;
        },
        model: 'reviewer-model',
        messages,
        promptCacheKey: 'review-cache-key',
        signal,
        responseFormat,
    });

    assert.equal(received.length, 1);
    assert.equal(actual, result);
    assert.equal(received[0].model, 'reviewer-model');
    assert.equal(received[0].messages, messages);
    assert.deepEqual(received[0].messages, messages);
    assert.equal(received[0].temperature, 0.18);
    assert.equal(received[0].topP, 0.82);
    assert.equal(received[0].repetitionPenalty, 1.02);
    assert.deepEqual(received[0].stop, []);
    assert.equal(received[0].responseFormat, responseFormat);
    assert.equal(received[0].promptCacheKey, 'review-cache-key');
    assert.equal(received[0].signal, signal);
    assert.equal(received[0].messages[0].content, 'review instructions');
});

test('returns invalid raw text unchanged and preserves error identities', async () => {
    const signal = new AbortController().signal;
    const invalidResult: VeniceTextGenerationResult = { model: 'reviewer-model', text: '<not-a-decision>' };
    const makeRequest = (requestText: (options: VeniceTextGenerationOptions) => Promise<VeniceTextGenerationResult>) => (
        requestStrictReviewCompletion({
            requestText,
            model: 'reviewer-model',
            messages,
            promptCacheKey: 'review-cache-key',
            signal,
            responseFormat,
        })
    );

    assert.equal(await makeRequest(async () => invalidResult), invalidResult);
    const error = new Error('transport error');
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const thrown of [error, abort]) {
        await assert.rejects(makeRequest(async () => { throw thrown; }), received => received === thrown);
    }
});
