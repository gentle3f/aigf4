import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Persona Settings is lazy loaded and hot avatar refresh never imports it implicitly', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/personaSettingsUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/personaSettingsUi\.js['"]\)/);
    assert.match(indexSource, /const renderPersonaSettingsAvatar = \(\) => personaSettingsUi\?\.refreshAvatar\(\)/);
    assert.doesNotMatch(indexSource, /persona-settings-modal|persona-description-editor|persona-public-identity-checkbox/);
    assert.match(featureSource, /persona-settings-modal/);
    assert.match(featureSource, /normalizeFavoritePhotoPrompt/);
    assert.match(featureSource, /resolvePublicIdentity\(query\)/);
});

test('Persona Settings cold feature delegates persistence while main preserves persona and room mutation semantics', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/personaSettingsUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /memoryManager\.updatePersona\(personaKey, updates\)/);
    assert.match(indexSource, /roomManager\.updateMember\(roomTarget\.roomId, roomTarget\.memberId, \{ persona: updates \}\)/);
    assert.match(indexSource, /memoryManager\.setChatHistory\(personaKey, history\)/);
    assert.match(indexSource, /Object\.assign\(currentPersona, updates\)/);
    assert.match(indexSource, /appendMessage\(\{/);

    assert.match(featureSource, /deps\.applySettings\(/);
    assert.doesNotMatch(featureSource, /memoryManager\.(?:get|set|update|save|delete)|roomManager\.(?:get|set|update|save|delete)|appendMessage|runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText/);
});
