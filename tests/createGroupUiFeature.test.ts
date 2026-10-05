import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Create Group management UI is lazy loaded from the home and room-admin entry points', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/createGroupUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/createGroupUi\.js['"]\)/);
    assert.doesNotMatch(indexSource, /const renderCreateGroupMembers|const confirmCreateGroup|create-group-member-list/);
    assert.match(featureSource, /roomManager\.addMember\(room\.id/);
    assert.match(featureSource, /roomManager\.createRoom\(createGroupName\.value, selected\)/);
    assert.match(featureSource, /memoryManager\.addMessage\(room\.id, 'system'/);
    assert.match(featureSource, /afterRoomCreated\(room\.id\)/);
    assert.match(featureSource, /confirmCreateGroupBtn\.addEventListener\('click', confirmCreateGroup\)/);
});

test('Create Group cold feature does not own Group generation, review, memory extraction, or wardrobe logic', () => {
    const featureSource = readFileSync(new URL('../features/createGroupUi.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(featureSource, /generateVeniceText|runGroupTurnAdapter|runReviewPipeline|strictReview|Jev|wardrobe|autoMemory|buildGroupSystemPrompt/i);
});
