import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildFallbackObservedNpcPersonaDraft,
    parseObservedNpcPersonaDraft,
} from '../observedNpcPersona.js';

const proposal = {
    name: 'Lisa',
    description: 'Lisa 已在最近對話中持續出現。',
    observedTurns: 7,
    evidence: '[CHAT] Lisa：「你哋又唔等我？」\n\n[USER] Lisa 一齊嚟啦。\n\n[CHAT] Lisa：「咁我坐你隔籬啦。」',
};

test('builds complete soul and memory files locally from observed turns', () => {
    const draft = buildFallbackObservedNpcPersonaDraft({
        proposal,
        mainPersonaName: 'Jennie',
        now: 100,
    });

    assert.ok(draft.soul.length >= 4);
    assert.ok(draft.memories.length >= 1);
    assert.match(draft.prompt, /香港粵語/);
    assert.match(draft.soul.map(entry => entry.summary).join(' '), /7 個回覆輪次/);
    assert.match(draft.memories.map(entry => entry.summary).join(' '), /Lisa/);
});

test('keeps confirmed public identity in the fallback persona', () => {
    const draft = buildFallbackObservedNpcPersonaDraft({
        proposal,
        mainPersonaName: 'Jennie',
        identity: {
            canonicalName: 'Lisa',
            kind: 'real_person',
            summary: 'Thai rapper, singer and BLACKPINK member.',
            visualPrompt: 'Lisa',
            sourceTitle: 'Lisa (rapper)',
            sourceUrl: 'https://example.test/lisa',
            sourceLanguage: 'en',
            verifiedAt: 1,
        },
        now: 100,
    });

    assert.match(draft.prompt, /BLACKPINK/);
    assert.match(draft.description, /公眾身份/);
});

test('fills incomplete model analysis with reliable local soul and memories', () => {
    const fallback = buildFallbackObservedNpcPersonaDraft({ proposal, mainPersonaName: 'Jennie', now: 100 });
    const parsed = parseObservedNpcPersonaDraft(JSON.stringify({
        description: '活潑而直接。',
        persona_prompt: '保持活潑語氣。',
        greeting: '我嚟啦。',
        soul: [],
        memories: [],
    }), fallback, 200);

    assert.equal(parsed?.description, '活潑而直接。');
    assert.equal(parsed?.soul, fallback.soul);
    assert.equal(parsed?.memories, fallback.memories);
});
