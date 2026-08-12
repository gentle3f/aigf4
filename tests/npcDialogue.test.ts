import assert from 'node:assert/strict';
import test from 'node:test';
import {
    collectObservedNpcCandidates,
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
    assert.deepEqual(inferNpcPromotionNames('把rose加到這個群組', 'Jennie', []), ['rose']);
    assert.deepEqual(inferNpcPromotionNames('邀請 Rosé 到這個聊天室', 'Jennie', []), ['Rosé']);
    assert.deepEqual(inferNpcPromotionNames('add Irene to this chat', 'IU', ['Jennie', 'Irene']), ['Irene']);
    assert.deepEqual(inferNpcPromotionNames('把她加入群組啦', 'IU', ['Jennie']), ['Jennie']);
    assert.deepEqual(inferNpcPromotionNames('我們見到 Peter，一齊去打招呼', 'IU', ['Peter']), []);
});

test('offers a room upgrade for a named introduction but not a passing greeting', () => {
    assert.deepEqual(inferIntroducedNpcNames('我介紹一個朋友叫 Peter 俾你識', 'IU'), ['Peter']);
    assert.deepEqual(inferIntroducedNpcNames('呢位係我朋友 Irene', 'IU'), ['Irene']);
    assert.deepEqual(inferIntroducedNpcNames('我哋見到 Peter，Hi Peter', 'IU'), []);
});

test('does not mistake an opinion after 這是 for a person name', () => {
    assert.deepEqual(extractDirectNpcNames('這是最好的選擇。', 'IU'), []);
    assert.deepEqual(inferIntroducedNpcNames('這是最好的選擇。', 'IU'), []);
    assert.deepEqual(inferIntroducedNpcNames('這是最佳決定！', 'IU'), []);
    assert.deepEqual(inferIntroducedNpcNames('呢個係正確方法。', 'IU'), []);
});

test('still recognises clear direct person introductions', () => {
    assert.deepEqual(inferIntroducedNpcNames('這是 Jennie。', 'IU'), ['Jennie']);
    assert.deepEqual(inferIntroducedNpcNames('這是我的朋友小美。', 'IU'), ['小美']);
    assert.deepEqual(inferIntroducedNpcNames('這是「王小美」。', 'IU'), ['王小美']);
});

test('observes a recurring labelled speaker across three separate model turns', () => {
    const twoTurns = [
        { role: 'model' as const, content: { text: 'Jennie：「第一次說話。」\nIU：「我知道。」' } },
        { role: 'user' as const, content: { text: '你們繼續說。' } },
        { role: 'model' as const, content: { text: '（她坐近一點。）Jennie：「第二次說話。」' } },
    ];
    assert.deepEqual(collectObservedNpcCandidates(twoTurns, 'IU'), []);

    const observed = collectObservedNpcCandidates([
        ...twoTurns,
        { role: 'user' as const, content: { text: '然後呢？' } },
        { role: 'model' as const, content: { text: '事情告一段落。**Jennie**（笑著坐近）「第三次說話。」\nIU：「她已經熟悉大家了。」' } },
    ], 'IU');
    assert.deepEqual(observed.map(candidate => [candidate.name, candidate.modelTurnCount]), [['Jennie', 3]]);
});

test('does not count repeated labels in one reply or non-person labels as observation rounds', () => {
    const history = [
        { role: 'model' as const, content: { text: 'Jennie：「一句。」\nJennie：「同一回覆再說一句。」\n場景：客廳。' } },
        { role: 'model' as const, content: { text: '最好的選擇：「這不是人物。」\n場景：仍在客廳。' } },
        { role: 'model' as const, content: { text: 'Jennie：「第二個獨立回覆。」\n場景：天色變暗。' } },
    ];
    assert.deepEqual(collectObservedNpcCandidates(history, 'IU'), []);
    assert.deepEqual(
        collectObservedNpcCandidates(history, 'IU', 2).map(candidate => [candidate.name, candidate.modelTurnCount]),
        [['Jennie', 2]],
    );
});
