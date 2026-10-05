import assert from 'node:assert/strict';
import test from 'node:test';
import {
    autoMemoryMatchesManualDecision,
    detectExplicitMemoryIntent,
    filterManualMemoryControlledTurns,
    inferExplicitMemoryKind,
    isExplicitMemoryStoreRequest,
    isPermanentMemoryRequest,
    stripExplicitMemoryDirective,
} from '../memoryPolicy.js';

test('explicit memory requests are detected without confusing recall questions', () => {
    assert.equal(isExplicitMemoryStoreRequest('記住我唔食辣。'), true);
    assert.equal(isExplicitMemoryStoreRequest('你要記住我鍾意凍檸茶。'), true);
    assert.equal(isExplicitMemoryStoreRequest('Please remember that I prefer aisle seats.'), true);
    assert.equal(isExplicitMemoryStoreRequest('你仲記唔記得上次去海邊？'), false);
    assert.equal(isExplicitMemoryStoreRequest('Do you remember when we went to the beach?'), false);
    assert.equal(isExplicitMemoryStoreRequest('Remember when we went to the beach?'), false);
});

test('permanent scope is explicit rather than inferred from ordinary remember wording', () => {
    assert.equal(isPermanentMemoryRequest('記住我唔食辣。'), false);
    assert.equal(isPermanentMemoryRequest('以後都要記住我唔食辣。'), true);
    assert.equal(isPermanentMemoryRequest('Never forget this forever.'), true);
});

test('explicit memories receive a deterministic semantic kind', () => {
    assert.equal(inferExplicitMemoryKind('記住我唔食辣。'), 'preference');
    assert.equal(inferExplicitMemoryKind('永遠記住你答應我唔會突然消失。'), 'promise');
    assert.equal(inferExplicitMemoryKind('記住呢個係我底線，唔好再做。'), 'boundary');
    assert.equal(inferExplicitMemoryKind('記住我驚一個人等。'), 'vulnerability');
    assert.equal(inferExplicitMemoryKind('記住我哋係夫妻。'), 'relationship');
    assert.equal(inferExplicitMemoryKind('記住呢件重要事情。'), 'core');
});

test('manual memory decisions remove their whole source turn from auto-memory evidence', () => {
    const history = [
        { id: 'u1', role: 'user', content: { text: 'ordinary' } },
        { id: 'm1', role: 'model', content: { text: 'ordinary reply' } },
        { id: 'u2', role: 'user', content: { text: 'remember this' } },
        { id: 'p2', role: 'system', content: { memoryProposal: { sourceMessageId: 'u2' } } },
        { id: 'm2', role: 'model', content: { text: 'acknowledged' } },
        { id: 'u3', role: 'user', content: { text: 'next turn' } },
        { id: 'm3', role: 'model', content: { text: 'next reply' } },
    ];

    const filtered = filterManualMemoryControlledTurns(history);
    assert.deepEqual(filtered.map(message => message.id), ['u1', 'm1', 'p2', 'u3', 'm3']);
});


test('explicit memory intent distinguishes permanent, session-only and unspecified scope', () => {
    assert.equal(detectExplicitMemoryIntent('永遠記住我唔食辣。')?.scope, 'permanent');
    assert.equal(detectExplicitMemoryIntent('今次先記住我想坐窗邊。')?.scope, 'session');
    assert.equal(detectExplicitMemoryIntent('記住我鍾意凍檸茶。')?.scope, 'unspecified');
    assert.equal(detectExplicitMemoryIntent('你仲記唔記得上次去海邊？'), null);
});

test('memory directive stripping leaves the durable fact rather than the command', () => {
    assert.equal(stripExplicitMemoryDirective('請你永遠記住我唔食辣。'), '我唔食辣');
    assert.equal(stripExplicitMemoryDirective('Please remember that I prefer aisle seats.'), 'that I prefer aisle seats');
});

test('manual memory summaries block the same fact from being auto-promoted later', () => {
    assert.equal(
        autoMemoryMatchesManualDecision(
            '使用者不吃辣，而且希望往後點餐避開辣味。',
            ['我唔食辣'],
        ),
        true,
    );
    assert.equal(
        autoMemoryMatchesManualDecision(
            '使用者明天想去海邊看日出。',
            ['我唔食辣'],
        ),
        false,
    );
});
