import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Chat Search is lazy loaded only from the explicit search entry point', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/chatSearchUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/chatSearchUi\.js['"]\)/);
    assert.match(indexSource, /chatSearchBtn\.addEventListener\('click', openChatSearch\)/);
    assert.match(indexSource, /const closeChatSearch = \(\) => chatSearchUi\?\.close\(\)/);
    assert.doesNotMatch(indexSource, /chatSearchMatches|chatSearchMatchIndex|runChatSearch|focusChatSearchMatch/);

    assert.match(featureSource, /chat-search-bar/);
    assert.match(featureSource, /chat-search-input/);
    assert.match(featureSource, /expandOlderHistory/);
});

test('Chat Search cold feature owns highlighting only, not chat generation or persistence', () => {
    const featureSource = readFileSync(new URL('../features/chatSearchUi.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /chat-search-match/);
    assert.match(featureSource, /scrollIntoView/);
    assert.doesNotMatch(featureSource, /memoryManager|roomManager|sendMessage|runGroupTurnAdapter|runSingleTurnAdapter|runReviewPipeline|generateVeniceText|startJevShadowEvaluation/);
});
