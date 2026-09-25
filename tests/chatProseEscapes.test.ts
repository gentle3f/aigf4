import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeArtificialProseEscapes } from '../chatProseEscapes.js';
import { cleanVeniceChatReply } from '../venice.js';
import { parseStrictReviewDecision } from '../engine/review/reviewResultParser.js';

test('removes artificial JSON quote escapes from normal prose only', () => {
    assert.equal(normalizeArtificialProseEscapes('她說：\\"我喺度。\\"'), '她說："我喺度。"');
    assert.equal(normalizeArtificialProseEscapes('佢細聲講：\\「唔好走。\\」'), '佢細聲講：「唔好走。」');
    assert.equal(normalizeArtificialProseEscapes('He said, \\"hello\\".'), 'He said, "hello".');
    assert.equal(normalizeArtificialProseEscapes('她笑著說：\\“好呀。\\”'), '她笑著說：“好呀。”');
});

test('preserves legitimate backslashes in paths and code', () => {
    assert.equal(normalizeArtificialProseEscapes('檔案在 C:\\Users\\Alice\\notes.txt'), '檔案在 C:\\Users\\Alice\\notes.txt');
    assert.equal(normalizeArtificialProseEscapes('const quote = \\"hello\\";'), 'const quote = \\"hello\\";');
    assert.equal(normalizeArtificialProseEscapes('```js\nconst quote = \\"hello\\";\n```'), '```js\nconst quote = \\"hello\\";\n```');
});

test('normalizes raw tagged revisions while JSON revisions keep JSON decoding', () => {
    assert.deepEqual(parseStrictReviewDecision('<revision>她說：\\"好。\\"</revision>'), {
        decision: 'revise',
        issues: ['strict-review'],
        revisedResponse: '她說："好。"',
    });
    assert.deepEqual(parseStrictReviewDecision(JSON.stringify({
        decision: 'revise',
        issues: [],
        revised_response: '她說：「好。」',
    })), {
        decision: 'revise',
        issues: [],
        revisedResponse: '她說：「好。」',
    });
    assert.equal(cleanVeniceChatReply('她說：\\"我會等你。\\"'), '她說："我會等你。"');
});
