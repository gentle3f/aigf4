import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Participant Action workflow is lazy loaded from room admin entry points', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const featureSource = readFileSync(new URL('../features/participantActionUi.ts', import.meta.url), 'utf8');
    const roomInfoSource = readFileSync(new URL('../features/roomInfoUi.ts', import.meta.url), 'utf8');

    assert.match(indexSource, /import\(['"]\.\/features\/participantActionUi\.js['"]\)/);
    assert.match(indexSource, /const openParticipantAction =/);
    assert.match(indexSource, /const openPrivateChatForRoomMember = async/);
    assert.match(indexSource, /const setRoomMemberPresence = async/);
    assert.doesNotMatch(indexSource, /participant-action-modal|ParticipantTransferCandidate|collectParticipantTransferCandidates/);

    assert.match(featureSource, /collectParticipantTransferCandidates/);
    assert.match(featureSource, /openPrivateChatForRoomMember/);
    assert.match(featureSource, /inviteParticipantCandidate/);
    assert.match(featureSource, /setRoomMemberPresence/);
    assert.match(roomInfoSource, /await dependencies\.setMemberPresence/);
});

test('Participant Action cold feature owns admin continuity only, not group generation or review', () => {
    const featureSource = readFileSync(new URL('../features/participantActionUi.ts', import.meta.url), 'utf8');

    assert.match(featureSource, /buildContextBridge/);
    assert.match(featureSource, /memoryManager\.addPersonaMemory/);
    assert.match(featureSource, /roomManager\.replaceMember/);
    assert.doesNotMatch(featureSource, /runGroupTurnAdapter|runSingleTurnAdapter|runReviewPipeline|startJevShadowEvaluation|generateVeniceText|buildGroupSystemPrompt|parseGroupGeneration|sendMessage/);
});


test('Room presence toggles stay lightweight and do not rerender the full chat', () => {
    const featureSource = readFileSync(new URL('../features/participantActionUi.ts', import.meta.url), 'utf8');
    const roomInfoSource = readFileSync(new URL('../features/roomInfoUi.ts', import.meta.url), 'utf8');

    const presenceStart = featureSource.indexOf('const setRoomMemberPresence =');
    const presenceEnd = featureSource.indexOf('const closeParticipantAction =', presenceStart);
    const presenceBlock = featureSource.slice(presenceStart, presenceEnd);
    assert.match(presenceBlock, /return true/);
    assert.doesNotMatch(presenceBlock, /startChat\(/);
    assert.doesNotMatch(presenceBlock, /renderPersonaList\(/);

    const changeStart = roomInfoSource.indexOf("checkbox.addEventListener('change'");
    const changeEnd = roomInfoSource.indexOf('const actions =', changeStart);
    const changeBlock = roomInfoSource.slice(changeStart, changeEnd);
    assert.doesNotMatch(changeBlock, /checkbox\.disabled = true/);
    assert.doesNotMatch(changeBlock, /renderRoomInfo\(\)/);
    assert.match(changeBlock, /roomInfoSummary\.textContent/);
});
