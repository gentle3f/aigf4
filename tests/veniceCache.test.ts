import assert from 'node:assert/strict';
import test from 'node:test';
import { generateVeniceText, type VeniceMessage } from '../venice.js';
import {
    createConversationPromptCacheKey,
    parseVenicePromptCacheUsage,
} from '../veniceCache.js';

test('uses one opaque stable cache key per conversation and scope', () => {
    const first = createConversationPromptCacheKey('room_opaque_4fd3', 'chat');
    assert.equal(first, createConversationPromptCacheKey('room_opaque_4fd3', 'chat'));
    assert.notEqual(first, createConversationPromptCacheKey('room_opaque_4fd4', 'chat'));
    assert.notEqual(first, createConversationPromptCacheKey('room_opaque_4fd3', 'review'));
    assert.doesNotMatch(first, /room_opaque|4fd3|IU|Jennie|private/iu);
});

test('parses Venice cache usage only when the upstream supplied cache fields', () => {
    assert.deepEqual(parseVenicePromptCacheUsage({
        prompt_tokens: 22000,
        prompt_tokens_details: { cached_tokens: 15000, cache_creation_input_tokens: 7000 },
    }), {
        promptTokens: 22000,
        cachedTokens: 15000,
        cacheCreationInputTokens: 7000,
        uncachedPromptTokens: 7000,
        cacheHitPercent: 68,
    });
    assert.equal(parseVenicePromptCacheUsage({ prompt_tokens: 22000 }), null);
});

test('adds cache affinity as metadata without changing the supplied messages', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> | null = null;
    globalThis.fetch = async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({
            model: 'qwen-3-6-plus',
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1200, completion_tokens: 2 },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const messages: VeniceMessage[] = [
        { role: 'system', content: 'Fixed system prompt.' },
        { role: 'user', content: 'Private newest request.' },
    ];

    try {
        await generateVeniceText({
            model: 'qwen-3-6-plus',
            messages,
            promptCacheKey: createConversationPromptCacheKey('opaque-room-id', 'chat'),
        });
    } finally {
        globalThis.fetch = originalFetch;
    }

    assert.deepEqual(requestBody?.messages, messages);
    assert.match(String(requestBody?.prompt_cache_key), /^wetapp-chat-v1-[a-z0-9]+$/u);
    assert.doesNotMatch(String(requestBody?.prompt_cache_key), /opaque-room-id|Private/iu);
});
