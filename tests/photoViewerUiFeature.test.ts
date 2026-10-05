import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Photo Viewer is lazy loaded from image and avatar entry points', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/photoViewerUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/photoViewerUi\.js['"]\)/);
    assert.match(indexSource, /const openPhotoViewer =/);
    assert.match(indexSource, /const openAvatarFullscreen =/);
    assert.match(indexSource, /const openImageFullscreen =/);
    assert.doesNotMatch(indexSource, /photo-viewer-modal|photo-fullscreen-modal|runPhotoViewerRegeneration|activePhotoViewerContext/);

    assert.match(featureSource, /photo-viewer-modal/);
    assert.match(featureSource, /photo-fullscreen-modal/);
    assert.match(featureSource, /runPhotoViewerRegeneration/);
    assert.match(featureSource, /requestVeniceImage/);
});

test('Photo Viewer cold feature delegates persistence and does not own chat or group generation', () => {
    const featureSource = readFileSync(new URL('../features/photoViewerUi.ts', import.meta.url), 'utf8');
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');

    assert.match(featureSource, /getDependencies\(\)\.addStudioResult/);
    assert.match(featureSource, /getDependencies\(\)\.appendVisiblePhoto/);
    assert.match(indexSource, /addStudioResult: result =>/);
    assert.match(indexSource, /appendVisiblePhoto: content => appendMessage\(content, 'bot'\)/);

    assert.doesNotMatch(featureSource, /runGroupTurnAdapter|runSingleTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText|buildGroupSystemPrompt|parseGroupGeneration|sendMessage/);
});
