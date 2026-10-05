import assert from 'node:assert/strict';
import test from 'node:test';
import {
    generateExperienceDraft,
    parseExperienceSuggestions,
} from '../features/chatExperienceUi.js';

test('reads exactly three JSON next-message suggestions', () => {
    assert.deepEqual(
        parseExperienceSuggestions('```json\n{"suggestions":["第一句","第二句","第三句"]}\n```'),
        ['第一句', '第二句', '第三句'],
    );
});

test('does not leak a group chat envelope as a JSON parser error', () => {
    assert.throws(
        () => parseExperienceSuggestions('<chat>Jennie：「我聽見了。」</chat><scene>{}</scene>'),
        /未能整理接戲建議/u,
    );
});


test('generates next-message suggestions with the cold JSON contract', async () => {
    const calls: Array<{ model: string; messages: Array<{ role: string; content: unknown }>; temperature: number }> = [];
    const result = await generateExperienceDraft({
        direct: false,
        isGroup: true,
        model: 'chat-primary',
        context: [
            { role: 'user', content: '你哋下一步想去邊？' },
            { role: 'assistant', content: 'Jennie 提議去海邊。' },
        ],
        instruction: '請提供三個可直接放進輸入框的接戲建議。',
        signal: new AbortController().signal,
        runModel: async request => {
            calls.push(request as typeof calls[number]);
            return JSON.stringify({ suggestions: ['去海邊啦。', '不如先食嘢？', '我想聽 Jennie 決定。'] });
        },
    });

    assert.equal(result.kind, 'suggestions');
    if (result.kind === 'suggestions') {
        assert.deepEqual(result.suggestions, ['去海邊啦。', '不如先食嘢？', '我想聽 Jennie 決定。']);
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.model, 'chat-primary');
    assert.equal(calls[0]?.temperature, 0.7);
    assert.deepEqual(calls[0]?.messages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
    assert.match(String(calls[0]?.messages[0]?.content), /group conversation/);
    assert.match(String(calls[0]?.messages[0]?.content), /exactly three distinct short messages/);
});

test('generates director rewrite text without parsing or mutating it in the cold UI module', async () => {
    const result = await generateExperienceDraft({
        direct: true,
        isGroup: false,
        model: 'chat-primary',
        context: [{ role: 'assistant', content: '原本版本。' }],
        instruction: '更細膩',
        rewriteSystemPrompt: 'BASE CHARACTER SYSTEM PROMPT',
        signal: new AbortController().signal,
        runModel: async request => {
            assert.match(String(request.messages[0]?.content), /BASE CHARACTER SYSTEM PROMPT/);
            assert.match(String(request.messages[0]?.content), /rewrite only the last assistant reply/);
            return '（她停了一秒，再慢慢望過來。）「原本版本，但更細膩。」';
        },
    });

    assert.deepEqual(result, {
        kind: 'rewrite',
        text: '（她停了一秒，再慢慢望過來。）「原本版本，但更細膩。」',
    });
});
