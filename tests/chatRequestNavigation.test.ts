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

test('same-conversation reload and destructive mutation cancel the matching active request', () => {
    assert.equal(shouldCancelActiveRequestForConversation('conversation-a', 'conversation-a'), true);
    assert.equal(shouldCancelActiveRequestForConversation(undefined, 'conversation-a'), false);
});

test('completed replies render only in their original visible conversation', () => {
    assert.equal(shouldRenderCompletedReplyInConversation('conversation-a', 'conversation-a'), true);
    assert.equal(shouldRenderCompletedReplyInConversation('conversation-b', 'conversation-a'), false);
});

test('production navigation keeps background chats, preserves target cancellation, and leaves generic rendering untouched', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    assert.match(source, /const startChat =[^]*shouldCancelActiveRequestForConversation\(activeChatRequest\?\.conversationKey, key\)/u);
    assert.doesNotMatch(source.slice(source.indexOf('const showSelectionView'), source.indexOf('const deleteCharacterPhotoAssetsForHistory')), /cancelActiveChatRequest\(\)/u);
    assert.match(source, /const deleteConversationFromList =[^]*shouldCancelActiveRequestForConversation\(activeChatRequest\?\.conversationKey, key\)[^]*memoryManager\.clearChatHistory\(key\)/u);
    assert.match(source, /const deleteCustomPersona =[^]*shouldCancelActiveRequestForConversation\(activeChatRequest\?\.conversationKey, key\)[^]*memoryManager\.deleteCustomPersona\(key\)/u);
    assert.match(source, /clearChatBtn\.addEventListener\('click', async \(\) => \{[^]*shouldCancelActiveRequestForConversation\(activeChatRequest\?\.conversationKey, conversationKey\)[^]*memoryManager\.clearChatHistory\(conversationKey\)/u);
    assert.match(source, /shouldRenderCompletedReplyInConversation\(currentConversationKey, request\.conversationKey\)[^]*appendMessage\(botContent, 'bot'\)[^]*scheduleReplyVisibleHaptic\(\)/u);
});
