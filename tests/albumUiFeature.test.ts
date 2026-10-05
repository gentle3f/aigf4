import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Album media library is lazy loaded and hot paths only refresh an existing handle', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/albumUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/albumUi\.js['"]\)/);
    assert.match(indexSource, /const updateAlbumState = \(\) => albumUi\?\.refresh\(\)/);
    assert.doesNotMatch(indexSource, /album-grid-container|album-select-all|album-download-btn|album-delete-btn/);
    assert.match(featureSource, /listCharacterPhotoAssets/);
    assert.match(featureSource, /getCharacterPhotoBlob/);
    assert.match(featureSource, /deleteCharacterPhotoAsset/);
    assert.match(featureSource, /selectedPhotoIndices/);
});

test('Album cold feature delegates chat mutation and photo viewing without owning generation or review', () => {
    const featureSource = readFileSync(new URL('../features/albumUi.ts', import.meta.url), 'utf8');
    assert.match(featureSource, /setHistoryWithoutIndices/);
    assert.match(featureSource, /dependencies\.openPhoto/);
    assert.match(featureSource, /dependencies\.refreshChat/);
    assert.doesNotMatch(featureSource, /runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText|requestVeniceImage/);
});
