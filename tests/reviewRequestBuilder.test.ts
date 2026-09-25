import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStrictReviewRequest } from '../engine/review/reviewRequestBuilder.js';
import type { VeniceMessage } from '../venice.js';

test('builds the exact candidate and user wrapper with no trimming or normalization', () => {
    const result = buildStrictReviewRequest({
        editorPrompt: ' editor ',
        authoritativePrompt: ' authority ',
        reviewHistory: [],
        latestUserMessage: ' latest\n\n ',
        candidateResponse: '  <raw>candidate</raw>  ',
    });

    assert.equal(result.candidateAndUser, 'NEWEST USER MESSAGE:\n latest\n\n \n\nCANDIDATE RESPONSE TO AUDIT:\n  <raw>candidate</raw>  \n\nReturn the strict review JSON now.');
    assert.deepEqual(result.messages, [
        { role: 'system', content: ' editor ' },
        { role: 'system', content: 'AUTHORITATIVE CHARACTER AND CONTINUITY RULES:\n authority ' },
        { role: 'user', content: result.candidateAndUser },
    ]);
});

test('preserves history order and object identity without mutating the input array', () => {
    const first: VeniceMessage = { role: 'user', content: 'first history' };
    const second: VeniceMessage = { role: 'assistant', content: 'second history' };
    const history = [first, second];
    const before = [...history];
    const result = buildStrictReviewRequest({
        editorPrompt: 'editor',
        authoritativePrompt: 'authoritative',
        reviewHistory: history,
        latestUserMessage: 'latest',
        candidateResponse: 'candidate',
    });

    assert.equal(result.messages.length, 5);
    assert.deepEqual(result.messages.slice(0, 2), [
        { role: 'system', content: 'editor' },
        { role: 'system', content: 'AUTHORITATIVE CHARACTER AND CONTINUITY RULES:\nauthoritative' },
    ]);
    assert.equal(result.messages[2], first);
    assert.equal(result.messages[3], second);
    assert.deepEqual(history, before);
    assert.equal(history[0], first);
    assert.equal(history[1], second);
    assert.deepEqual(result.messages[4], { role: 'user', content: result.candidateAndUser });
});
