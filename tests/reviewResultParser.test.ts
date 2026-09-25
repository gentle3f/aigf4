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

test('parses a non-empty tagged revision with its existing defaults and normalization', () => {
    assert.deepEqual(parseStrictReviewDecision('before <revision>  He said, \\"hello\\".  </revision> after'), {
        decision: 'revise',
        issues: ['strict-review'],
        revisedResponse: 'He said, "hello".',
    });
});

test('parses JSON revisions with the existing whitespace and issues normalization', () => {
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'revise',
        issues: ['voice', 1, '', null, 'continuity', 'a', 'b', 'c', 'd', 'e', 'f'],
        revised_response: '  revised response  ',
    })), {
        decision: 'revise',
        issues: ['voice', '', 'continuity', 'a', 'b', 'c', 'd', 'e'],
        revisedResponse: 'revised response',
    });
});

test('uses the existing camel-case revision fallback and preserves keep JSON revisions', () => {
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'revise',
        revisedResponse: '  camel revision  ',
    })), {
        decision: 'revise',
        issues: [],
        revisedResponse: 'camel revision',
    });
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'keep',
        issues: ['retained'],
        revised_response: '  retained by parser  ',
    })), {
        decision: 'keep',
        issues: ['retained'],
        revisedResponse: 'retained by parser',
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

test('keeps the existing missing-field and non-string issues behaviour', () => {
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
});
