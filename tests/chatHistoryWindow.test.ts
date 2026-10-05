import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    CHAT_HISTORY_INITIAL_RENDER_LIMIT,
    CHAT_HISTORY_PREPEND_BATCH_SIZE,
    getHiddenChatHistoryCount,
    getInitialChatHistoryStartIndex,
    getPreviousChatHistoryStartIndex,
} from '../chatHistoryWindow.js';

test('chat history opens with a bounded tail instead of the full history', () => {
    assert.equal(CHAT_HISTORY_INITIAL_RENDER_LIMIT, 80);
    assert.equal(getInitialChatHistoryStartIndex(0), 0);
    assert.equal(getInitialChatHistoryStartIndex(30), 0);
    assert.equal(getInitialChatHistoryStartIndex(80), 0);
    assert.equal(getInitialChatHistoryStartIndex(81), 1);
    assert.equal(getInitialChatHistoryStartIndex(5000), 4920);
});

test('older history prepends in bounded batches without losing the full-history index', () => {
    assert.equal(CHAT_HISTORY_PREPEND_BATCH_SIZE, 60);
    assert.equal(getPreviousChatHistoryStartIndex(4920), 4860);
    assert.equal(getPreviousChatHistoryStartIndex(40), 0);
    assert.equal(getPreviousChatHistoryStartIndex(0), 0);
    assert.equal(getHiddenChatHistoryCount(4860), 4860);
});


test('production chat entry renders only the bounded window and search can explicitly expand older history', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const searchSource = readFileSync(new URL('../features/chatSearchUi.ts', import.meta.url), 'utf8');
    const standardChat = source.slice(source.indexOf('const startChat ='), source.indexOf('const showSelectionView ='));
    assert.match(standardChat, /renderChatHistoryWindow\(key, chatHistory\)/u);
    assert.doesNotMatch(standardChat, /chatHistory\.forEach\(/u);
    assert.match(source, /history\s*\.slice\(renderedChatHistoryStartIndex\)/u);
    assert.match(source, /chatContainer\.addEventListener\('scroll',[\s\S]*prependOlderChatHistory\(\)/u);
    assert.match(source, /getHiddenHistoryCount: \(\) => renderedChatHistoryStartIndex/u);
    assert.match(source, /expandOlderHistory: count => prependOlderChatHistory\(count\)/u);
    assert.match(standardChat, /setInstantScrollTop\(chatContainer, chatContainer\.scrollHeight\)/u);
    assert.match(searchSource, /const hiddenHistoryCount = getDeps\(\)\.getHiddenHistoryCount\(\);/u);
    assert.match(searchSource, /if \(hiddenHistoryCount > 0\) getDeps\(\)\.expandOlderHistory\(hiddenHistoryCount\);/u);
});
