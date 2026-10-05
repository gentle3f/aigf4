import assert from 'node:assert/strict';
import test from 'node:test';
import {
    addSessionMemory,
    clearSessionMemories,
    formatSessionMemoryPrompt,
    getSessionMemories,
    removeSessionMemoriesBySourceMessageIds,
} from '../sessionMemory.js';

test('session memory remains available for the browser session but is not persisted', () => {
    clearSessionMemories();
    addSessionMemory('chat-a', {
        kind: 'preference',
        summary: '使用者今次想坐窗邊。',
        targetMemberIds: [],
    });
    assert.equal(getSessionMemories('chat-a').length, 1);
    assert.match(formatSessionMemoryPrompt('chat-a'), /session-only/u);
    assert.match(formatSessionMemoryPrompt('chat-a'), /窗邊/u);
    clearSessionMemories('chat-a');
    assert.equal(getSessionMemories('chat-a').length, 0);
});

test('session memory deduplicates the same summary instead of growing prompt noise', () => {
    clearSessionMemories();
    addSessionMemory('room-a', {
        kind: 'event',
        summary: '今晚先不要談工作。',
        targetMemberIds: ['iu'],
    });
    addSessionMemory('room-a', {
        kind: 'boundary',
        summary: '今晚先不要談工作。',
        targetMemberIds: ['iu', 'jennie'],
    });
    const entries = getSessionMemories('room-a');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'boundary');
    assert.deepEqual(entries[0].targetMemberIds, ['iu', 'jennie']);
});


test('recalling a source turn removes only session memories derived from that turn', () => {
    clearSessionMemories();
    addSessionMemory('chat-recall', {
        kind: 'preference',
        summary: '今次想坐窗邊。',
        targetMemberIds: [],
        sourceMessageIds: ['user-1'],
    });
    addSessionMemory('chat-recall', {
        kind: 'event',
        summary: '另一件仍然有效的事情。',
        targetMemberIds: [],
        sourceMessageIds: ['user-2'],
    });

    assert.equal(
        removeSessionMemoriesBySourceMessageIds('chat-recall', ['user-1', 'reply-1']),
        1,
    );
    assert.deepEqual(
        getSessionMemories('chat-recall').map(entry => entry.summary),
        ['另一件仍然有效的事情。'],
    );
});


test('recalling one of multiple identical session-memory sources preserves the remaining source', () => {
    clearSessionMemories();
    addSessionMemory('chat-shared-source', {
        kind: 'preference',
        summary: '今次想坐窗邊。',
        targetMemberIds: [],
        sourceMessageIds: ['user-1'],
    });
    addSessionMemory('chat-shared-source', {
        kind: 'preference',
        summary: '今次想坐窗邊。',
        targetMemberIds: [],
        sourceMessageIds: ['user-2'],
    });

    assert.equal(removeSessionMemoriesBySourceMessageIds('chat-shared-source', ['user-1']), 0);
    const [remaining] = getSessionMemories('chat-shared-source');
    assert.deepEqual(remaining.sourceMessageIds, ['user-2']);
});
