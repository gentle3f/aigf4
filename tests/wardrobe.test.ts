import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '../managers.js';
import {
    extractWardrobeEnvelope,
    getLatestWardrobeState,
    mergeWardrobeUpdate,
} from '../wardrobe.js';

const participants = [
    { key: 'iu', label: 'IU' },
    { key: 'jennie', label: 'Jennie' },
];

test('wardrobe checkpoint preserves every unchanged outfit and strips the hidden envelope', () => {
    const current = {
        user: '白色恤衫及深藍牛仔褲',
        characters: {
            iu: '白色上衣及黑色短裙',
            jennie: '紅色連身裙',
        },
    };
    const result = extractWardrobeEnvelope(
        'IU：「我記得。」\n<wardrobe>{"user":"KEEP","characters":{"IU":"KEEP","Jennie":"KEEP"}}</wardrobe>',
        current,
        participants,
    );

    assert.equal(result.visibleText, 'IU：「我記得。」');
    assert.deepEqual(result.wardrobe, current);
});

test('wardrobe update changes only the explicitly updated person', () => {
    const result = mergeWardrobeUpdate({
        user: '白色恤衫及深藍牛仔褲',
        characters: {
            iu: '白色上衣及黑色短裙',
            jennie: '紅色連身裙',
        },
    }, {
        user: 'KEEP',
        members: [
            { member_id: 'IU', outfit: '米色冷衫及黑色長褲' },
            { member_id: 'jennie', outfit: 'KEEP' },
        ],
    }, participants);

    assert.equal(result.user, '白色恤衫及深藍牛仔褲');
    assert.equal(result.characters.iu, '米色冷衫及黑色長褲');
    assert.equal(result.characters.jennie, '紅色連身裙');
});

test('latest wardrobe survives ordinary messages but resets after a new-scene marker', () => {
    const stored = {
        user: '灰色衛衣',
        characters: { iu: '藍色半截裙' },
    };
    const beforeReset: ChatMessage[] = [
        { role: 'model', content: { text: '第一輪', wardrobeState: stored } },
        { role: 'user', content: { text: '繼續說' } },
    ];
    assert.deepEqual(getLatestWardrobeState(beforeReset, ['iu']), stored);

    const afterReset: ChatMessage[] = [
        ...beforeReset,
        { role: 'system', content: { text: '[SCENE END]' } },
        { role: 'user', content: { text: '第二天早上' } },
    ];
    assert.deepEqual(getLatestWardrobeState(afterReset, ['iu']), { user: '', characters: {} });
});
