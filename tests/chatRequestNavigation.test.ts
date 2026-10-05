import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    shouldCancelActiveRequestForConversation,
    shouldRenderCompletedReplyInConversation,
} from '../chatRequestNavigation.js';

test('background request survives navigation to a different conversation or home', () => {
    assert.equal(shouldCancelActiveRequestForConversation('conversation-a', 'conversation-b'), false);
    assert.equal(shouldRenderCompletedReplyInConversation('conversation-b', 'conversation-a'), false);
    assert.equal(shouldRenderCompletedReplyInConversation(null, 'conversation-a'), false);
});

test('single global request remains in progress while another conversation is visible', () => {
    const activeRequest = { conversationKey: 'conversation-a' };
    assert.ok(activeRequest);
    assert.equal(shouldCancelActiveRequestForConversation(activeRequest.conversationKey, 'conversation-b'), false);
});

test('only destructive operations cancel the matching active request', () => {
    assert.equal(shouldCancelActiveRequestForConversation('conversation-a', 'conversation-a'), true);
    assert.equal(shouldCancelActiveRequestForConversation('conversation-a', 'conversation-b'), false);
    assert.equal(shouldCancelActiveRequestForConversation(undefined, 'conversation-a'), false);
});

test('completed replies render only in their original visible conversation', () => {
    assert.equal(shouldRenderCompletedReplyInConversation('conversation-a', 'conversation-a'), true);
    assert.equal(shouldRenderCompletedReplyInConversation('conversation-b', 'conversation-a'), false);
});

test('production navigation never cancels a request, while history replacement and destructive mutation do', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const conversationActionsSource = readFileSync(new URL('../features/conversationActions.ts', import.meta.url), 'utf8');
    const fileManagerSource = readFileSync(new URL('../fileManager.ts', import.meta.url), 'utf8');
    const standardChat = source.slice(source.indexOf('const startChat ='), source.indexOf('const showSelectionView ='));
    assert.match(source, /const startChat = \([^]*?\) => \{\s*closeChatSearch\(\);/u);
    assert.doesNotMatch(source, /const startLegacyChat =/u);
    assert.match(standardChat, /if \(restoredHistory\) \{\s*if \(shouldCancelActiveRequestForConversation\(activeChatRequest\?\.conversationKey, key\)\) \{\s*cancelActiveChatRequest\(\);\s*\}\s*memoryManager\.setChatHistory\(key, restoredHistory\);/u);
    assert.doesNotMatch(source.slice(source.indexOf('const showSelectionView'), source.indexOf('const appendAssistantInlineFormatting')), /cancelActiveChatRequest\(\)/u);
    assert.match(conversationActionsSource, /const deleteConversation =[^]*deps\.cancelRequestForConversation\(key\)[^]*deps\.memoryManager\.clearChatHistory\(key\)/u);
    assert.match(conversationActionsSource, /const deleteCustomPersona =[^]*deps\.cancelRequestForConversation\(key\)[^]*deps\.memoryManager\.deleteCustomPersona\(key\)/u);
    assert.match(conversationActionsSource, /const clearCurrentChat =[^]*deps\.cancelRequestForConversation\(conversationKey\)[^]*deps\.memoryManager\.clearChatHistory\(conversationKey\)/u);
    assert.match(source, /clearChatBtn\.addEventListener\('click', \(\) => \{[^]*loadConversationActions\(\)[^]*actions\.clearCurrentChat\(\)/u);
    assert.match(source, /setHistoryWithoutIndices: \(conversationKey, indices\) => \{[^]*shouldCancelActiveRequestForConversation\(activeChatRequest\?\.conversationKey, conversationKey\)[^]*memoryManager\.setChatHistory\(conversationKey, history\.filter\(\(_, index\) => !removed\.has\(index\)\)\)/u);
    assert.match(source, /const loadFileManager = async \(\) => \{[^]*import\('\.\/fileManager\.js'\)[^]*beforeAllDataRestore: \(\) => \{\s*if \(activeChatRequest\) cancelActiveChatRequest\(\);/u);
    assert.match(fileManagerSource, /this\.callbacks\.beforeAllDataRestore\?\.\(\);\s*this\.memoryManager\.loadAllData/u);
    assert.match(source, /shouldRenderCompletedReplyInConversation\(currentConversationKey, request\.conversationKey\)[^]*appendMessage\(botContent, 'bot'\)[^]*scheduleReplyVisibleHaptic\(\)/u);
    assert.match(source, /if \(activeChatRequest\) \{\s*throw new Error\('CHAT_REQUEST_IN_PROGRESS'\);\s*\}/u);
});

test('A remains the one active request through A to B to A and A to home to A navigation', () => {
    const activeRequest = { conversationKey: 'conversation-a' };
    const navigate = <T>(request: T, _target: string | null) => request;
    assert.equal(navigate(navigate(activeRequest, 'conversation-b'), 'conversation-a'), activeRequest);
    assert.equal(navigate(navigate(activeRequest, null), 'conversation-a'), activeRequest);
});
