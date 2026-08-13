import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parsePersonaAutoMemoryResponse,
    parseRoomAutoMemoryResponse,
} from '../autoMemory.js';

test('rejects the singular memory envelope returned by an incompatible model', () => {
    assert.equal(
        parsePersonaAutoMemoryResponse('{"memory":"The user likes oranges."}'),
        null,
    );
});

test('accepts a valid persona memory envelope', () => {
    assert.deepEqual(
        parsePersonaAutoMemoryResponse(JSON.stringify({
            memories: [{ kind: 'preference', title: '喜歡橙', summary: '使用者最喜歡的水果是橙。' }],
        })),
        [{ kind: 'preference', title: '喜歡橙', summary: '使用者最喜歡的水果是橙。' }],
    );
});

test('resolves room participant names and IDs to canonical member IDs', () => {
    const aliases = new Map([
        ['iu', 'member-iu'],
        ['member-iu', 'member-iu'],
        ['jennie', 'member-jennie'],
        ['member-jennie', 'member-jennie'],
    ]);
    assert.deepEqual(
        parseRoomAutoMemoryResponse(JSON.stringify({
            memories: [{
                kind: 'promise',
                title: '一起吃早餐',
                summary: 'IU 答應明早一起吃早餐。',
                participants: ['IU', 'member-jennie'],
            }],
        }), aliases),
        [{
            kind: 'promise',
            title: '一起吃早餐',
            summary: 'IU 答應明早一起吃早餐。',
            participants: ['member-iu', 'member-jennie'],
        }],
    );
});
