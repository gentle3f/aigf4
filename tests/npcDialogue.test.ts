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
    replyHasNonPersonNpcLabel,
    replyHasUnconfirmedAddressLabel,
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

test('does not turn compliments or pet names into NPCs', () => {
    const compliments = [
        '好美，你能讓我看清楚你嗎？',
        '好靚，你可唔可以行近少少？',
        '太可愛，你再笑一次俾我睇。',
        '漂亮啊，你望一望鏡頭。',
        '寶貝，你今日想去邊？',
        '多謝招待，你家裏沒其他人吧？',
        '放心，你可以完全信任我。',
        '今晚氣氛真好，你想坐近一點嗎？',
    ];
    compliments.forEach(message => {
        assert.deepEqual(extractDirectNpcNames(message, 'IU'), []);
        assert.deepEqual(inferNpcSpeakersForTurn(message, 'IU', []), []);
    });
    assert.deepEqual(collectEstablishedNpcNames([
        { role: 'user', content: { text: '好美，你能讓我看清楚你嗎？' } },
        { role: 'model', content: { text: '好美：「我就在這裡。」\nIU：「看著我就好。」' } },
    ], 'IU'), []);
    assert.deepEqual(collectObservedNpcCandidates([
        { role: 'model', content: { text: '好美：「第一句。」' } },
        { role: 'model', content: { text: '好美：「第二句。」' } },
        { role: 'model', content: { text: '好美：「第三句。」' } },
    ], 'IU'), []);
    assert.equal(replyHasNonPersonNpcLabel('IU：「你在稱讚我嗎？」\n好美：「我也在這裡。」', 'IU'), true);
    assert.equal(replyHasNonPersonNpcLabel('好美：「這是角色本人的正常標籤。」', '好美'), false);
    assert.equal(replyHasUnconfirmedAddressLabel(
        'IU：「謝謝你。」\n多謝招待：「不用客氣。」',
        '多謝招待，你家裏沒其他人吧？',
        'IU',
    ), true);
    assert.equal(replyHasUnconfirmedAddressLabel(
        '放心（走進房間）：「我也來了。」',
        '放心，你可以完全信任我。',
        'IU',
    ), true);
    assert.equal(replyHasUnconfirmedAddressLabel(
        '小美：「可以，我來回答。」',
        '小美，你可以回答我嗎？',
        'IU',
        ['小美'],
    ), false);
    assert.deepEqual(inferNpcSpeakersForTurn('小美，你可以回答我嗎？', 'IU', ['小美']), ['小美']);
});

test('does not persist arbitrary sentence prefixes as NPC memory', () => {
    const history = [
        { role: 'user' as const, content: { text: '多謝招待，你家裏沒其他人吧？' } },
        { role: 'model' as const, content: { text: '多謝招待：「我一直都在。」\nIU：「家裡沒有其他人。」' } },
        { role: 'user' as const, content: { text: '你再說清楚一點。' } },
        { role: 'model' as const, content: { text: '多謝招待：「第二次說話。」\nIU：「我在回答你。」' } },
        { role: 'user' as const, content: { text: '繼續。' } },
        { role: 'model' as const, content: { text: '多謝招待：「第三次說話。」\nIU：「不要理會那個錯誤標籤。」' } },
    ];
    assert.deepEqual(collectEstablishedNpcNames(history, 'IU'), []);
    assert.deepEqual(collectObservedNpcCandidates(history, 'IU'), []);
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
