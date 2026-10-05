import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Photo Prompt is lazy loaded from camera entry points', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/photoPromptUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/photoPromptUi\.js['"]\)/);
    assert.match(indexSource, /const openPhotoPromptModal =/);
    assert.doesNotMatch(indexSource, /photo-prompt-modal|photo-subjects-container|generatePhotoFromPrompt/);

    assert.match(featureSource, /photo-prompt-modal/);
    assert.match(featureSource, /photo-subjects-container/);
    assert.match(featureSource, /sendPhotoRequest/);
});

test('Photo Prompt cold feature delegates the actual photo turn to main', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/photoPromptUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /sendPhotoRequest: input => sendMessage\(\{/);
    assert.match(indexSource, /characterPhotoRequest: true/);
    assert.doesNotMatch(featureSource, /sendMessage|runGroupTurnAdapter|runSingleTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText|buildCharacterPhotoProposal/);
});
