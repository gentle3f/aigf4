import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Video Studio is lazy loaded and normal startup only checks safe pending-job metadata', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/videoStudio.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/videoStudio\.js['"]\)/);
    assert.match(indexSource, /readPersistedVideoJobFromStorage\(\)/);
    assert.doesNotMatch(indexSource, /from ["']\.\/veniceVideo\.js["']/);
    assert.doesNotMatch(indexSource, /video-studio-view|video-model-select|video-prompt-optimize/);
    assert.doesNotMatch(indexSource, /completeVeniceVideo|queueVeniceVideo|retrieveVeniceVideo|quoteVeniceVideo|listVeniceVideoModels/);
    assert.match(featureSource, /from ['"]\.\.\/veniceVideo\.js['"]/);
    assert.match(featureSource, /readPersistedVideoJob/);
    assert.match(featureSource, /resumePendingVideoJob/);
});

test('Video Studio cold feature owns video generation UI only, not chat/group/review/memory execution', () => {
    const featureSource = readFileSync(new URL('../features/videoStudio.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /queueVeniceVideo/);
    assert.match(featureSource, /retrieveVeniceVideo/);
    assert.match(featureSource, /generateVeniceText/);
    assert.doesNotMatch(featureSource, /runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|memoryManager|roomManager|appendMessage|buildGroupSystemPrompt/);
});
