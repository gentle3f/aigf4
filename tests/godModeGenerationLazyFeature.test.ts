import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Persona } from '../managers.js';
import { runGodModeGeneration } from '../features/godModeGeneration.js';

const persona: Persona = {
    name: 'Aster Vale',
    emoji: 'A',
    gender: 'female',
    description: 'A careful fictional cartographer.',
    prompt: 'Keep a measured, observant tone.',
    greeting: '',
    avatarPrompt: '',
    avatarUrl: null,
};

test('God Mode generation is behind an explicit cold boundary', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/godModeGeneration.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/godModeGeneration\.js['"]\)/);
    assert.doesNotMatch(indexSource, /from ["']\.\/features\/godModeGeneration\.js["']/);
    assert.doesNotMatch(indexSource, /You are editing the CURRENT active character persona/);
    assert.doesNotMatch(indexSource, /No PERSONA_UPDATE returned from/);
    assert.match(featureSource, /You are editing the CURRENT active character persona/);
    assert.match(featureSource, /extractPersonaUpdatePayload/);
    assert.match(featureSource, /maxCompletionTokens: 180/);
});

test('cold God Mode feature owns no persistence, room mutation, render, or request lifecycle', () => {
    const source = readFileSync(new URL('../features/godModeGeneration.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(source, /memoryManager|roomManager|appendMessage|finishChatRequest|cancelChatPerformanceTurn|localStorage|sessionStorage|indexedDB|Supabase/);
    assert.match(source, /dependencies\.runModel/);
    assert.match(source, /dependencies\.setRuntimeState/);
});

test('God Mode retries the fixed route after an invalid persona update and preserves request settings', async () => {
    const calls: Array<{
        model: string;
        messages: Array<{ role: string; content: unknown }>;
        maxCompletionTokens: number;
        temperature: number;
        topP: number;
        repetitionPenalty: number;
    }> = [];
    const states: string[] = [];

    const result = await runGodModeGeneration({
        id: 12,
        mode: 'god',
        startedAt: performance.now(),
        persona,
        signal: new AbortController().signal,
    }, '加強她的主動性，但保持原身份。', {
        models: ['god-primary', 'god-fallback'],
        recentMessages: [
            { role: 'user', content: '上一個人格調整要求' },
            { role: 'assistant', content: '已記錄上一個調整。' },
        ],
        soulMemory: '- [core] 身份：Aster 是製圖師。',
        episodicMemory: '- [event] 昨晚：完成地圖。',
        setRuntimeState: (state, detail) => states.push(`${state}:${detail}`),
        runModel: async request => {
            calls.push(request as typeof calls[number]);
            if (request.model === 'god-primary') {
                return {
                    text: '只有確認句，沒有更新標籤。',
                    model: request.model,
                };
            }
            return {
                text: '好，我會保留原本身份，只增加更主動的互動方式。\n[PERSONA_UPDATE: 面對熟悉的人時會更主動提出下一步，同時保持原有沉穩觀察力。]',
                model: request.model,
            };
        },
        isAbortError: () => false,
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => call.model), ['god-primary', 'god-fallback']);
    assert.deepEqual(states, [
        'generating:調整人格中...',
        'retrying:重新整理人格設定中...',
    ]);
    for (const call of calls) {
        assert.equal(call.maxCompletionTokens, 180);
        assert.equal(call.temperature, 0.25);
        assert.equal(call.topP, 0.9);
        assert.equal(call.repetitionPenalty, 1.04);
        assert.deepEqual(call.messages.map(message => message.role), ['system', 'user', 'assistant', 'user']);
        assert.match(String(call.messages[0]?.content), /Current character name: Aster Vale/);
        assert.match(String(call.messages[0]?.content), /Current soul\.md/);
        assert.match(String(call.messages[0]?.content), /Current memory\.md/);
    }
    assert.match(result.visibleText, /好，我會保留原本身份/);
    assert.match(result.personaUpdate || '', /更主動提出下一步/);
});

test('God Mode propagates an abort without trying the fallback model', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    const calls: string[] = [];

    await assert.rejects(
        () => runGodModeGeneration({
            id: 13,
            mode: 'god',
            startedAt: performance.now(),
            persona,
            signal: new AbortController().signal,
        }, '停止', {
            models: ['god-primary', 'god-fallback'],
            recentMessages: [],
            soulMemory: '',
            episodicMemory: '',
            setRuntimeState: () => {},
            runModel: async request => {
                calls.push(request.model);
                throw abort;
            },
            isAbortError: error => error === abort,
        }),
        error => error === abort,
    );
    assert.deepEqual(calls, ['god-primary']);
});
