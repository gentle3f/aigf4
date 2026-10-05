import assert from 'node:assert/strict';
import test from 'node:test';
import {
    analyzeObservedNpcPersonaDraft,
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


test('observed NPC analyzer retries the fixed model route and preserves schema and sampling settings', async () => {
    const observedProposal = {
        ...proposal,
        id: 'npc-lisa',
        gender: 'female' as const,
        detectionSource: 'observed' as const,
        status: 'pending' as const,
        createdAt: 1,
    };
    const calls: Array<{
        model: string;
        messages: Array<{ role: string; content: unknown }>;
        responseFormat: unknown;
        temperature: number;
        topP: number;
        repetitionPenalty: number;
        timeoutMs: number;
    }> = [];

    const draft = await analyzeObservedNpcPersonaDraft({
        proposal: observedProposal,
        mainPersonaName: 'Jennie',
        evidence: proposal.evidence,
    }, {
        models: ['review-primary', 'review-fallback'],
        runModel: async (request, timeoutMs) => {
            calls.push({ ...request, timeoutMs } as typeof calls[number]);
            if (request.model === 'review-primary') return 'not-json';
            return JSON.stringify({
                description: '活潑、主動，而且保留香港粵語節奏。',
                persona_prompt: '以自然香港粵語回應，主動接續對話，但保留自己的意見。',
                greeting: '我嚟啦，頭先講到邊？',
                soul: [
                    { kind: 'core', title: '固定身份', summary: 'Lisa 是獨立角色。' },
                    { kind: 'relationship', title: '關係位置', summary: '已經同 Jennie 同使用者有連續互動。' },
                ],
                memories: [
                    { kind: 'event', title: '坐到身邊', summary: 'Lisa 曾主動坐到使用者隔籬。' },
                ],
            });
        },
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => call.model), ['review-primary', 'review-fallback']);
    for (const call of calls) {
        assert.equal(call.timeoutMs, 20_000);
        assert.equal(call.temperature, 0.25);
        assert.equal(call.topP, 0.85);
        assert.equal(call.repetitionPenalty, 1.04);
        assert.match(JSON.stringify(call.responseFormat), /observed_npc_persona/);
        assert.deepEqual(call.messages.map(message => message.role), ['system', 'user']);
        assert.match(String(call.messages[0]?.content), /Analyze the recurring adult character "Lisa"/);
        assert.match(String(call.messages[1]?.content), /Observed conversation evidence for Lisa/);
    }
    assert.equal(draft.description, '活潑、主動，而且保留香港粵語節奏。');
    assert.equal(draft.soul.length, 2);
    assert.equal(draft.memories.length, 1);
});
