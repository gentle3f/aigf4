import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('Room-member persona conversion stays inside the cold participant-action path', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const transferSource = readFileSync(new URL('../conversationTransfer.ts', import.meta.url), 'utf8');
    const participantSource = readFileSync(new URL('../features/participantActionUi.ts', import.meta.url), 'utf8');

    assert.doesNotMatch(indexSource, /conversationTransferPersona|roomMemberToPersona/);
    assert.doesNotMatch(transferSource, /roomMemberToPersona|roomMemoryToPersonaMemory|mergeMemoryEntries/);
    assert.match(participantSource, /from ['"]\.\.\/conversationTransferPersona\.js['"]/);
    assert.match(participantSource, /roomMemberToPersona\(/);
});

test('Hot conversation-transfer module retains only bridge and continuity helpers', () => {
    const source = readFileSync(new URL('../conversationTransfer.ts', import.meta.url), 'utf8');

    assert.match(source, /export const buildContextBridge/);
    assert.match(source, /export const findLatestPrivateReturnHandoff/);
    assert.match(source, /export const ensureLatestSceneTransitionBridge/);
    assert.match(source, /export const contextBridgeToSystemPrompt/);
    assert.match(source, /export const contextBridgeDisplayText/);
});
