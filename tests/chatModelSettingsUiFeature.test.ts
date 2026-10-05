import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Chat Model Settings modal is lazy loaded while runtime routing state stays hot', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/chatModelSettingsUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/chatModelSettingsUi\.js['"]\)/);
    assert.match(indexSource, /let chatModelSettings = parseChatModelSettings/);
    assert.match(indexSource, /chatModelSettingsUi\?\.refresh\(\)/);
    assert.doesNotMatch(indexSource, /chat-primary-model-select|chat-quality-model-select|chat-emergency-model-select/);
    assert.match(featureSource, /buildCharacterModelRoute\(draft, false\)/);
    assert.match(featureSource, /buildStrictReviewModelRoute\(draft, false\)/);
    assert.match(featureSource, /dependencies\.applySettings\(next\)/);
});

test('Chat Model Settings cold feature owns settings UI only, not generation or review execution', () => {
    const featureSource = readFileSync(new URL('../features/chatModelSettingsUi.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(featureSource, /runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText|appendMessage|memoryManager|roomManager/);
});
