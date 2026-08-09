import assert from 'node:assert/strict';
import test from 'node:test';
import {
    collectEstablishedNpcNames,
    extractDirectNpcNames,
    inferIntroducedNpcNames,
    inferNpcPromotionNames,
    inferNpcSpeakersForTurn,
    replyHasNpcSpeech,
} from '../npcDialogue.js';

test('detects a friend introduced and greeted in natural mixed-language chat', () => {
    assert.deepEqual(extractDirectNpcNames('我介紹一個朋友叫 Peter 俾你識。Hi Peter！', 'IU'), ['Peter']);
    assert.deepEqual(extractDirectNpcNames('喂你做咩呀？叫我做咩？介紹一下自己。', 'IU'), []);
});

test('keeps labelled NPCs from recent one-to-one history', () => {
    const names = collectEstablishedNpcNames([
        { role: 'user', content: { text: '呢位係我朋友 Irene' } },
        { role: 'model', content: { text: 'Irene：「你好呀，好高興識你。」\nIU：「入嚟坐啦。」' } },
    ], 'IU', '等佢自己答我');
    assert.deepEqual(names, ['Irene']);
    assert.deepEqual(inferNpcSpeakersForTurn('等佢自己答我', 'IU', names), ['Irene']);
});

test('accepts labelled third-party speech without requiring fancy quotes', () => {
    assert.equal(replyHasNpcSpeech('Peter: 好耐冇見，最近點呀？\n時光：「我都想知。」', ['Peter']), true);
});

test('only promotes an NPC when the user explicitly asks to add them to the chat', () => {
    assert.deepEqual(inferNpcPromotionNames('把 Jennie 加入這個聊天室', 'IU', ['Jennie']), ['Jennie']);
    assert.deepEqual(inferNpcPromotionNames('add Irene to this chat', 'IU', ['Jennie', 'Irene']), ['Irene']);
    assert.deepEqual(inferNpcPromotionNames('把她加入群組啦', 'IU', ['Jennie']), ['Jennie']);
    assert.deepEqual(inferNpcPromotionNames('我們見到 Peter，一齊去打招呼', 'IU', ['Peter']), []);
});

test('offers a room upgrade for a named introduction but not a passing greeting', () => {
    assert.deepEqual(inferIntroducedNpcNames('我介紹一個朋友叫 Peter 俾你識', 'IU'), ['Peter']);
    assert.deepEqual(inferIntroducedNpcNames('呢位係我朋友 Irene', 'IU'), ['Irene']);
    assert.deepEqual(inferIntroducedNpcNames('我哋見到 Peter，Hi Peter', 'IU'), []);
});
