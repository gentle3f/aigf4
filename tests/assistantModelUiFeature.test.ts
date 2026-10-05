import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Venice Assistant model catalogue stays cold until Assistant or model settings access', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/assistantModelUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/assistantModelUi\.js['"]\)/);
    assert.match(indexSource, /if \(assistantMode\) \{[\s\S]*loadAssistantModelUi\(\)/);
    assert.match(indexSource, /loadChatModelSettingsUi = async[\s\S]*loadAssistantModelUi\(\)/);
    assert.doesNotMatch(indexSource, /assistant-model-select|refresh-assistant-models|listVeniceTextModels|buildFallbackAssistantModels/);

    assert.match(featureSource, /assistant-model-select/);
    assert.match(featureSource, /refresh-assistant-models/);
    assert.match(featureSource, /listVeniceTextModels/);
    assert.match(featureSource, /buildFallbackModels/);
});

test('Assistant selected model stays hot for generation while catalogue UI owns no chat runtime', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/assistantModelUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /let selectedAssistantModel = localStorage\.getItem\('veniceAssistantModel'\) \|\| VENICE_ASSISTANT_MODEL/);
    assert.match(indexSource, /assistantMode \? selectedAssistantModel : undefined/);
    assert.match(indexSource, /assistantModelUi\?\.setBusy\(true\)/);
    assert.match(indexSource, /assistantModelUi\?\.setBusy\(showLoadingIndicator\)/);
    assert.doesNotMatch(
        featureSource,
        /runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|appendMessage|memoryManager|roomManager|sendMessage/,
    );
});
