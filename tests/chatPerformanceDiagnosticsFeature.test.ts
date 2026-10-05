import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
const perfSource = readFileSync(new URL('../chatPerformance.ts', import.meta.url), 'utf8');
const featureSource = readFileSync(new URL('../features/chatPerformanceDiagnostics.ts', import.meta.url), 'utf8');

test('Performance diagnostics stays cold and is reachable from the more-options menu', () => {
    assert.match(indexSource, /import\(['"]\.\/features\/chatPerformanceDiagnostics\.js['"]\)/);
    assert.doesNotMatch(indexSource, /from ['"]\.\/features\/chatPerformanceDiagnostics\.js['"]/);
    assert.match(indexSource, /\['Performance 診斷', openChatPerformanceDiagnostics\]/);
});

test('Performance diagnostics exports mobile-friendly timing metadata without chat content access', () => {
    assert.match(featureSource, /分享 \/ 下載 JSON/);
    assert.match(featureSource, /navigator\.share/);
    assert.match(featureSource, /navigator\.clipboard\.writeText/);
    assert.match(featureSource, /Timing\/event labels only\. No prompt, user message, or assistant reply text\./);
    assert.doesNotMatch(featureSource, /memoryManager|roomManager|peekChatHistory|getChatHistory|currentPersona|currentRoom/);
});

test('hot performance recorder exposes narrow diagnostics controls while keeping summaries cold', () => {
    assert.match(perfSource, /export const getChatPerformanceSnapshot/);
    assert.match(perfSource, /export const setChatPerformanceEnabled/);
    assert.match(perfSource, /export const clearChatPerformanceTurns/);
    assert.match(perfSource, /import\(['"]\.\/chatPerformanceSummary\.js['"]\)/);
    assert.doesNotMatch(perfSource, /from ['"]\.\/chatPerformanceSummary\.js['"]/);
});
