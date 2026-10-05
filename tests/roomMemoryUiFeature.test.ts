import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Room Memory editor is a lazy-loaded cold UI feature', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/roomMemoryUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/roomMemoryUi\.js['"]\)/);
    assert.doesNotMatch(indexSource, /const renderRoomMemory =|room-memory-list|memorySoulTab|memoryEventTab/);
    assert.match(indexSource, /refreshRoomMemoryIfOpen\(\)/);
    assert.match(featureSource, /memoryManager\.addPersonaMemory/);
    assert.match(featureSource, /roomManager\.addSoulMemory/);
    assert.match(featureSource, /roomManager\.addEpisodicMemories/);
    assert.match(featureSource, /roomManager\.setMemoryKnowerIds/);
    assert.match(featureSource, /summarizeRoomMemory\(room\.id, mode\)/);
    assert.match(featureSource, /summarizePersonaMemory\(personaKey, mode\)/);
});

test('Room Memory cold feature does not own memory extraction, model transport, chat generation, or review', () => {
    const featureSource = readFileSync(new URL('../features/roomMemoryUi.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(featureSource, /buildMemoryTurnBatches|parseRoomAutoMemoryResponse|parsePersonaAutoMemoryResponse/);
    assert.doesNotMatch(featureSource, /generateVeniceText|runGroupTurnAdapter|runReviewPipeline|strictReview|Jev|wardrobe/i);
});


test('Memory V5 diagnostics stay local inside the lazy memory UI and reuse production retrieval policy', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/roomMemoryUi.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /Memory V5 診斷（本地，不會呼叫 AI）/);
    assert.match(featureSource, /selectRelevantMemories/);
    assert.match(featureSource, /scoreMemoryForQuery/);
    assert.match(featureSource, /getMemoryRecallLimit/);
    assert.match(featureSource, /isDeepMemoryRecallQuery/);
    assert.match(featureSource, /getSessionMemories\(conversationKey\)/);
    assert.match(featureSource, /room-wide memory\.md/);
    assert.match(featureSource, /private memory\.md/);

    assert.match(indexSource, /getSessionMemories,/);
    assert.doesNotMatch(indexSource, /Memory V5 診斷|memory-v5-recall-tester/);
    assert.doesNotMatch(featureSource, /generateVeniceText|fetch\(|requestVenice|openrouter|api\//i);
});
