import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('slow model requests use the extended per-attempt timeout', () => {
    const src = read('../index.tsx');
    assert.match(src, /CHAT_SLOW_MODEL_ATTEMPT_TIMEOUT_MS = 265_000/);
    assert.match(src, /deepseek\|uncensored\|reasoner\|thinking/);
    assert.match(src, /Math\.max\(timeoutMs, CHAT_SLOW_MODEL_ATTEMPT_TIMEOUT_MS\)/);
    assert.match(src, /timeoutMs: effectiveTimeoutMs/);
    assert.match(src, /setTimeout\(abortForTimeout, effectiveTimeoutMs\)/);
    assert.match(src, /CHAT_MODEL_ATTEMPT_TIMEOUT_MS = 45_000/);
});

test('proxy timeout and Vercel execution budget exceed slow-model client window', () => {
    const proxy = read('../api/venice-chat.js');
    const config = JSON.parse(read('../vercel.json'));
    const upstreamMatch = proxy.match(/UPSTREAM_TIMEOUT_MS = ([\d_]+)/);
    assert.ok(upstreamMatch, 'proxy must have an explicit upstream timeout');
    const backendMs = Number(upstreamMatch[1].replaceAll('_', ''));
    assert.ok(backendMs >= 240_000);
    assert.ok(backendMs < 265_000, 'frontend must wait longer than proxy');
    assert.ok(config.functions['api/venice-chat.js'].maxDuration * 1000 > 265_000);
});
