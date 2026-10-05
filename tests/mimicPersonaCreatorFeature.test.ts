import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Mimic persona creator is lazy loaded from the three creation entry points', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/mimicPersonaCreator.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/mimicPersonaCreator\.js['"]\)/);
    assert.match(indexSource, /publicFigureCreateBtn\.addEventListener\('click', \(\) => openMimicImportModal\('public'\)\)/);
    assert.match(indexSource, /createPersonaBtn\.addEventListener\('click', \(\) => openMimicImportModal\('manual'\)\)/);
    assert.match(indexSource, /mimicImportBtn\.addEventListener\('click', \(\) => openMimicImportModal\('transcript'\)\)/);
    assert.doesNotMatch(indexSource, /mimic-transcript-input|mimic-analysis-status|mimic-prompt-editor|mimic-mode-transcript-btn/);
    assert.match(featureSource, /readTranscriptTextFromFile/);
    assert.match(featureSource, /runMimicTranscriptAnalysisV2/);
    assert.match(featureSource, /runManualPersonaDraftGeneration/);
    assert.match(featureSource, /runPublicPersonaDraftGeneration/);
});

test('Mimic cold feature delegates persona persistence and navigation without owning chat runtime', () => {
    const featureSource = readFileSync(new URL('../features/mimicPersonaCreator.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /getDependencies\(\)\.savePersona/);
    assert.match(featureSource, /getDependencies\(\)\.afterSave/);
    assert.match(featureSource, /import \{ optimizeAvatarDataUrl \} from ['"]\.\/avatarImage\.js['"]/);
    assert.match(featureSource, /optimizeAvatarDataUrl\(file\)/);
    assert.doesNotMatch(featureSource, /memoryManager|roomManager|runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|appendMessage|buildGroupSystemPrompt/);
});
