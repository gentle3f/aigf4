import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Image Studio UI is lazy loaded from its explicit entry point', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/imageStudio.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/imageStudio\.js['"]\)/);
    assert.match(indexSource, /imageStudioEntry\.addEventListener\('click',[\s\S]*showImageStudio\('push'\)/);
    assert.doesNotMatch(indexSource, /image-mode-generate|image-model-select|image-source-dropzone|clear-image-results/);
    assert.match(featureSource, /image-mode-generate/);
    assert.match(featureSource, /image-model-select/);
    assert.match(featureSource, /image-source-dropzone/);
    assert.match(featureSource, /clear-image-results/);
});

test('Image Studio cold feature owns studio generation UI only', () => {
    const featureSource = readFileSync(new URL('../features/imageStudio.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /requestImage/);
    assert.match(featureSource, /loadImageModels/);
    assert.doesNotMatch(
        featureSource,
        /runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|memoryManager|roomManager|sendMessage|buildGroupSystemPrompt/,
    );
});
