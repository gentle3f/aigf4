import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStrictReviewDecision } from '../engine/review/reviewResultParser.js';
import { STRICT_REVIEW_ISSUE_CODES, STRICT_REVIEW_RESPONSE_FORMAT } from '../strictReview.js';

test('uses the exact shared closed issue-code list in the strict JSON schema', () => {
    assert.deepEqual(STRICT_REVIEW_ISSUE_CODES, [
        'request_mismatch', 'identity', 'speaker_ownership', 'continuity', 'reality_layer', 'wardrobe', 'state',
        'replayed_beat', 'persona_voice', 'third_party_speech', 'user_agency', 'incomplete_ending', 'group_narration', 'other',
    ]);
    const schema = STRICT_REVIEW_RESPONSE_FORMAT.json_schema.schema.properties.issues as { items: { enum: string[] } };
    assert.deepEqual(schema.items.enum, STRICT_REVIEW_ISSUE_CODES);
});

test('parses keep and revised strict-review responses', () => {
    assert.deepEqual(parseStrictReviewDecision('<keep/>'), {
        decision: 'keep',
        issues: [],
        revisedResponse: '',
    });
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'revise',
        issues: ['identity'],
        revised_response: '完整修正版',
    })), {
        decision: 'revise',
        issues: ['identity'],
        revisedResponse: '完整修正版',
    });
});

test('rejects a revise decision without a complete replacement', () => {
    assert.equal(parseStrictReviewDecision('{"decision":"revise","issues":[],"revised_response":""}'), null);
    assert.equal(parseStrictReviewDecision('not-json'), null);
});
