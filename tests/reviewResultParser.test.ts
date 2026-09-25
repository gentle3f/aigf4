import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStrictReviewDecision } from '../engine/review/reviewResultParser.js';

test('parses the supported keep tag after fence stripping and trimming', () => {
    assert.deepEqual(parseStrictReviewDecision('  ```text\n  <KEEP />  \n```  '), {
        decision: 'keep',
        issues: [],
        revisedResponse: '',
    });
});

test('parses a non-empty tagged revision with a closed fallback reason and normalization', () => {
    assert.deepEqual(parseStrictReviewDecision('before <revision>  He said, \\"hello\\".  </revision> after'), {
        decision: 'revise',
        issues: ['other'],
        revisedResponse: 'He said, "hello".',
    });
});

test('parses JSON revisions with only recognized, deduplicated closed issue codes', () => {
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'revise',
        issues: ['persona_voice', 1, '', null, 'continuity', 'continuity', 'user_agency', 'unknown'],
        revised_response: '  revised response  ',
    })), {
        decision: 'revise',
        issues: ['persona_voice', 'continuity', 'user_agency'],
        revisedResponse: 'revised response',
    });
});

test('uses the existing camel-case revision fallback and normalizes keep responses', () => {
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'revise',
        revisedResponse: '  camel revision  ',
    })), {
        decision: 'revise',
        issues: ['other'],
        revisedResponse: 'camel revision',
    });
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'keep',
        issues: ['retained'],
        revised_response: '  retained by parser  ',
    })), {
        decision: 'keep',
        issues: [],
        revisedResponse: '',
    });
});

test('rejects empty, malformed, incomplete, and unsupported decisions exactly as before', () => {
    assert.equal(parseStrictReviewDecision(''), null);
    assert.equal(parseStrictReviewDecision('  ```json\n  \n```  '), null);
    assert.equal(parseStrictReviewDecision('not-json'), null);
    assert.equal(parseStrictReviewDecision('<revision>   </revision>'), null);
    assert.equal(parseStrictReviewDecision('{"decision":"revise","issues":[],"revised_response":""}'), null);
    assert.equal(parseStrictReviewDecision('{"decision":"revise"}'), null);
    assert.equal(parseStrictReviewDecision('{"decision":"KEEP"}'), null);
    assert.deepEqual(parseStrictReviewDecision('{"decision":"keep","issues":"not-an-array"}'), {
        decision: 'keep',
        issues: [],
        revisedResponse: '',
    });
});

test('keeps only closed issue codes and falls back safely when revise has none', () => {
    assert.deepEqual(parseStrictReviewDecision('{"decision":"keep"}'), {
        decision: 'keep',
        issues: [],
        revisedResponse: '',
    });
    assert.deepEqual(parseStrictReviewDecision('{"decision":"keep","issues":[1,true,null],"revised_response":3}'), {
        decision: 'keep',
        issues: [],
        revisedResponse: '',
    });
    assert.deepEqual(parseStrictReviewDecision('{"decision":"revise","issues":["free form", "PRIVATE_GEMMA_RAW_ISSUE_SENTINEL"],"revised_response":"valid replacement"}'), {
        decision: 'revise',
        issues: ['other'],
        revisedResponse: 'valid replacement',
    });
});
