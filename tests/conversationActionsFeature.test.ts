import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Conversation destructive actions are lazy loaded from user-triggered entry points', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/conversationActions.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/conversationActions\.js['"]\)/);
    assert.match(indexSource, /const deleteCustomPersona =/);
    assert.match(indexSource, /const deleteConversationFromList =/);
    assert.match(indexSource, /const createTimelineBranch =/);
    assert.match(indexSource, /const recallUserMessage =/);
    assert.doesNotMatch(indexSource, /collectReferencedPhotoAssetIds|branchMemoryEntriesAt|TIMELINE_BRANCH_HISTORY_LIMIT/);

    assert.match(featureSource, /deleteCharacterPhotoAssetsForHistory/);
    assert.match(featureSource, /deleteChatAttachmentAssetsForHistory/);
    assert.match(featureSource, /createTimelineBranch/);
    assert.match(featureSource, /recallUserMessage/);
});

test('Conversation actions preserve destructive persistence without owning chat generation or review', () => {
    const featureSource = readFileSync(new URL('../features/conversationActions.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /memoryManager\.removeUserTurn/);
    assert.match(featureSource, /roomManager\.removeMemoriesBySourceMessageIds/);
    assert.match(featureSource, /roomManager\.saveRoom/);
    assert.match(featureSource, /memoryManager\.saveCustomPersonaCopy/);
    assert.doesNotMatch(featureSource, /runGroupTurnAdapter|runSingleTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText|buildGroupSystemPrompt|parseGroupGeneration|sendMessage/);
});


test('message recall completes turn rollback without a second synchronous room transaction', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/conversationActions.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /abortCharacterPhotoRequest\(\)/);
    assert.match(featureSource, /removeSessionMemoriesBySourceMessageIds\(conversationKey, removedSourceMessageIds\)/);
    assert.match(
        featureSource,
        /removeMemoriesBySourceMessageIds\([\s\S]*conversationKey,[\s\S]*removedSourceMessageIds,[\s\S]*remainingUserMessageCount,[\s\S]*sceneBeforeTurn,[\s\S]*\)/,
    );
    assert.doesNotMatch(
        featureSource,
        /roomManager\.updateRoom\(conversationKey,[\s\S]*room\.scene\s*=/,
    );
    assert.match(indexSource, /收回訊息失敗，請重試/);
});
