import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
const groupPromptSource = readFileSync(new URL('../groupChatPrompt.ts', import.meta.url), 'utf8');
const actionsSource = readFileSync(new URL('../features/conversationActions.ts', import.meta.url), 'utf8');
const policySource = readFileSync(new URL('../autoMemoryPolicy.ts', import.meta.url), 'utf8');

test('auto-memory uses a fixed dedicated model route rather than current chat-model settings', () => {
    const start = indexSource.indexOf('async function generateValidatedAutoMemory');
    const end = indexSource.indexOf('type MemorySummaryRunResult', start);
    const block = indexSource.slice(start, end);

    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(block, /chatModelSettings/);
    assert.match(
        block,
        /DEFAULT_CHAT_MODEL_SETTINGS\.qualityFallback[\s\S]*DEFAULT_CHAT_MODEL_SETTINGS\.primary[\s\S]*DEFAULT_CHAT_MODEL_SETTINGS\.emergencyFallback/,
    );
});

test('manual memory decisions own their source turn and block later auto-promotion', () => {
    assert.match(indexSource, /sourceMessageId:\s*userMessageMeta\?\.id/);
    assert.match(indexSource, /getManualMemoryControlledSourceIds\(history\)/);
    assert.match(indexSource, /manuallyControlledSourceIds/);
    assert.match(indexSource, /autoMemoryMatchesManualDecision\(memory\.summary, manualLongTermExclusions\)/);
    assert.match(indexSource, /sourceMessageIds:\s*proposal\.sourceMessageId \? \[proposal\.sourceMessageId\] : \[\]/);
});

test('auto-memory writes on an eight-turn cadence and rejects low-importance candidates', () => {
    assert.match(policySource, /AUTO_MEMORY_TURN_INTERVAL = 8/);
    assert.match(policySource, /AUTO_MEMORY_MIN_IMPORTANCE = 3/);
    assert.match(indexSource, /Number\(memory\.importance \?\? 3\) >= AUTO_MEMORY_MIN_IMPORTANCE/);
});

test('session-only memory is injected into single and group prompts exactly through their owned paths', () => {
    assert.match(indexSource, /const sessionMemory = formatSessionMemoryPrompt\(conversationKey\)/);
    assert.match(indexSource, /SESSION-ONLY MEMORY — valid only for this browser session and never a permanent fact/);
    assert.match(groupPromptSource, /sessionMemory = ''/);
    assert.match(groupPromptSource, /Respect each known_by target/);

    const roomStart = indexSource.indexOf('const runRoomConversationGeneration = async');
    const roomEnd = indexSource.indexOf('const requestStrictReviewDecision', roomStart);
    const roomBlock = indexSource.slice(roomStart, roomEnd);
    assert.match(roomBlock, /buildGroupSystemPromptWithAccounting\([\s\S]*formatSessionMemoryPrompt\(request\.conversationKey\)/);
    assert.doesNotMatch(roomBlock, /sessionMemoryContract/);
});

test('clearing or deleting a conversation clears its temporary session memory', () => {
    assert.match(actionsSource, /clearSessionMemories:\s*\(conversationKey: string\) => void/);
    assert.match(actionsSource, /deps\.clearSessionMemories\(conversationKey\)/);
    assert.match(actionsSource, /deps\.clearSessionMemories\(key\)/);
});
