import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeChatHistoryStorage } from '../chatHistoryStorage.js';
import { MemoryManager } from '../managers.js';

const installLocalStorage = () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => storage.set(key, value),
            removeItem: (key: string) => storage.delete(key),
        },
    });
    return storage;
};

test('recalling a user message removes only that turn and keeps the next user turn', () => {
    installLocalStorage();
    const manager = new MemoryManager();
    manager.setChatHistory('recall-room', [
        { id: 'before', role: 'model', content: { text: '之前的內容' } },
        { id: 'apple', role: 'user', content: { text: '吃一個蘋果' } },
        { id: 'apple-reply', role: 'model', content: { text: '好，我吃蘋果。' } },
        { id: 'apple-system', role: 'system', content: { text: '這一回合的系統內容' } },
        { id: 'later-user', role: 'user', content: { text: '下一個回合' } },
        { id: 'later-reply', role: 'model', content: { text: '下一個回覆' } },
    ]);

    const result = manager.removeUserTurn('recall-room', 'apple');

    assert.deepEqual(result?.removed.map(message => message.id), ['apple', 'apple-reply', 'apple-system']);
    assert.deepEqual(
        manager.getChatHistory('recall-room').map(message => message.id),
        ['before', 'later-user', 'later-reply'],
    );
});

test('old imported messages receive stable IDs before recall is used', () => {
    const storage = installLocalStorage();
    storage.set('chatHistories', JSON.stringify({
        old: [
            { role: 'user', content: { text: '舊訊息' } },
            { role: 'model', content: { text: '舊回覆' } },
        ],
    }));

    const history = new MemoryManager().getChatHistory('old');

    assert.ok(history.every(message => message.id && message.createdAt));
    const persisted = decodeChatHistoryStorage<Record<string, Array<{ id?: string }>>>(
        storage.get('chatHistories') || '',
    );
    assert.ok(persisted.old.every(message => message.id));
});
