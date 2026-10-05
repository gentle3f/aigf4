import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('New Scene action is lazy loaded from the more-options entry point', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/newSceneAction.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/newSceneAction\.js['"]\)/);
    assert.match(indexSource, /const startNewScene =/);
    assert.doesNotMatch(indexSource, /已完成位置：|使用者剛開始一個新場景/);

    assert.match(featureSource, /selectLatestSceneHistory/);
    assert.match(featureSource, /buildContextBridge/);
    assert.match(featureSource, /roomManager\.addEpisodicMemories/);
    assert.match(featureSource, /emptyWardrobeState\(\)/);
});

test('New Scene cold action preserves scene persistence but not chat generation', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/newSceneAction.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /appendSceneStart: \(\) => appendMessage\(\{ text: SCENE_START_LABEL \}, 'system'\)/);
    assert.match(featureSource, /memoryManager\.addMessage\(conversationKey, 'system'/);
    assert.match(featureSource, /roomManager\.updateRoom/);
    assert.doesNotMatch(featureSource, /sendMessage|runGroupTurnAdapter|runSingleTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText|getResponse/);
});
