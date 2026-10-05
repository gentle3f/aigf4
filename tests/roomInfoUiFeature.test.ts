import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Room Info admin UI is lazy loaded', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/roomInfoUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/roomInfoUi\.js['"]\)/);
    assert.match(featureSource, /export const openRoomInfo/);
    assert.match(featureSource, /export const refreshRoomInfo/);
    assert.match(featureSource, /openPersonaSettingsForMember/);
    assert.match(featureSource, /openPrivateChat/);
    assert.match(featureSource, /setMemberPresence/);
    assert.match(featureSource, /favoritePhotoPrompt/);
});

test('Room Info cold feature does not own group generation, review, or chat send', () => {
    const featureSource = readFileSync(new URL('../features/roomInfoUi.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(featureSource, /runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText|sendMessage|appendMessage/);
});
