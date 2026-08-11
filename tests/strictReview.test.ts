import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStrictReviewDecision } from '../strictReview.js';

test('parses keep and revised strict-review responses', () => {
    assert.deepEqual(parseStrictReviewDecision('<keep/>'), {
        decision: 'keep',
        issues: [],
        revisedResponse: '',
    });
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'revise',
        issues: ['人物混淆'],
        revised_response: '完整修正版',
    })), {
        decision: 'revise',
        issues: ['人物混淆'],
        revisedResponse: '完整修正版',
    });
});

test('rejects a revise decision without a complete replacement', () => {
    assert.equal(parseStrictReviewDecision('{"decision":"revise","issues":[],"revised_response":""}'), null);
    assert.equal(parseStrictReviewDecision('not-json'), null);
});
