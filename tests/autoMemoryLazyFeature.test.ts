import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Auto-memory extractor is lazy loaded only after the synchronous summary threshold gate', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const roomStart = source.indexOf('const maybeSummarizeRoomMemory = async');
    const personaStart = source.indexOf('const maybeSummarizePersonaMemory = async');
    const roomSource = source.slice(roomStart, personaStart);
    const personaSource = source.slice(personaStart, source.indexOf('const continuePendingConversationTurn'));

    assert.match(source, /import\(['"]\.\/autoMemory\.js['"]\)/);
    assert.doesNotMatch(source, /buildMemoryTurnBatches,\s*MemoryBatchMode/);
    assert.match(source, /from ["']\.\/autoMemoryPolicy\.js["']/);

    for (const block of [roomSource, personaSource]) {
        const thresholdIndex = block.indexOf("return { status: 'skipped', reason: 'threshold' }");
        const loadIndex = block.indexOf('await loadAutoMemoryModule()');
        assert.ok(thresholdIndex >= 0);
        assert.ok(loadIndex > thresholdIndex);
    }
});

test('Auto-memory keeps public policy constants compatible while runtime parsing stays in the cold module', () => {
    const policySource = readFileSync(new URL('../autoMemoryPolicy.ts', import.meta.url), 'utf8');
    const autoMemorySource = readFileSync(new URL('../autoMemory.ts', import.meta.url), 'utf8');

    assert.match(policySource, /AUTO_MEMORY_SUMMARY_VERSION = 3/);
    assert.match(policySource, /AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES = 8/);
    assert.match(autoMemorySource, /from ['"]\.\/autoMemoryPolicy\.js['"]/);
    assert.match(autoMemorySource, /export const buildMemoryTurnBatches/);
    assert.match(autoMemorySource, /export const parsePersonaAutoMemoryResponse/);
    assert.match(autoMemorySource, /export const parseRoomAutoMemoryResponse/);
    assert.match(autoMemorySource, /export const ROOM_MEMORY_RESPONSE_FORMAT/);
    assert.match(autoMemorySource, /export const PERSONA_MEMORY_RESPONSE_FORMAT/);
    assert.match(autoMemorySource, /export const buildRoomAutoMemoryMessages/);
    assert.match(autoMemorySource, /export const buildPersonaAutoMemoryMessages/);

    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(indexSource, /room_memory_update_v3|persona_memory_update_v3/);
    assert.doesNotMatch(indexSource, /meticulous human-memory archivist|meticulous long-term human-memory archivist/);
});
