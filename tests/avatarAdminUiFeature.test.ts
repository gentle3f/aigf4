import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Avatar admin local upload and image optimization stay cold', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/avatarAdminUi.ts', import.meta.url), 'utf8');
    const imageSource = readFileSync(new URL('../features/avatarImage.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/avatarAdminUi\.js['"]\)/);
    assert.doesNotMatch(indexSource, /const handleAvatarUpload = async|const createOptimizedAvatarDataUrl = async|avatar-upload-input/);
    assert.doesNotMatch(indexSource, /avatar-source-modal|avatar-source-members|avatar-source-search/);
    assert.match(indexSource, /saveLocalAvatar: async \(target, avatarUrl\) =>/);
    assert.match(indexSource, /memoryManager\.setPersonaAvatar\(target\.personaKey, avatarUrl\)/);
    assert.match(indexSource, /roomManager\.setMemberAvatar\(target\.roomId, target\.memberId, avatarUrl\)/);

    assert.match(featureSource, /avatar-upload-input/);
    assert.match(featureSource, /optimizeAvatarDataUrl\(file\)/);
    assert.match(featureSource, /saveLocalAvatar\(target, avatarUrl\)/);
    assert.match(featureSource, /resolvePublicIdentity\(query\)/);
    assert.match(imageSource, /export const optimizeAvatarDataUrl/);
    assert.match(imageSource, /Math\.min\(512, sourceSize\)/);
    assert.match(imageSource, /canvas\.toBlob/);
});

test('Avatar admin cold feature delegates persistence and does not own chat/group/review execution', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/avatarAdminUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /updatePersona: \(key, update\) => memoryManager\.updatePersona\(key, update\)/);
    assert.match(indexSource, /roomManager\.updateMember\(roomId, memberId, \{ persona: update \}\)/);
    assert.doesNotMatch(featureSource, /memoryManager\.(?:get|set|update|save|delete)|roomManager\.(?:get|set|update|save|delete)|new MemoryManager|new RoomManager|runSingleTurnAdapter|runGroupTurnAdapter|runReviewPipeline|startJevShadowEvaluation|appendMessage|generateVeniceText/);
});
