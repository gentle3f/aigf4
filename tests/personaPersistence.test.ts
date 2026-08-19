import assert from 'node:assert/strict';
import test from 'node:test';
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

test('built-in persona edits use an independent default snapshot and survive reload', () => {
    const storage = installLocalStorage();
    const avatarUrl = 'data:image/webp;base64,Y2MtdGVzdA==';
    const manager = new MemoryManager();

    manager.updatePersona('cc', { avatarUrl });

    const saved = JSON.parse(storage.get('customPersonas') || '{}');
    assert.equal(saved.cc.avatarUrl, avatarUrl);

    const reloadedManager = new MemoryManager();
    assert.equal(reloadedManager.getPersona('cc')?.avatarUrl, avatarUrl);
});

test('one-to-one soul.md and memory.md entries survive reload and export as markdown', () => {
    const storage = installLocalStorage();
    const manager = new MemoryManager();

    manager.addPersonaMemory('cc', 'soul', {
        kind: 'promise',
        title: '重要承諾',
        summary: '她答應會記住使用者最需要被理解的時刻。',
    });
    manager.addPersonaMemory('cc', 'memory', {
        kind: 'event',
        title: '雨夜談心',
        summary: '兩人在雨夜完成了一次真誠的談話。',
    });

    assert.ok(storage.get('customPersonas')?.includes('重要承諾'));
    const reloadedManager = new MemoryManager();
    assert.equal(reloadedManager.getPersonaMemoryEntries('cc', 'soul').at(-1)?.title, '重要承諾');
    assert.equal(reloadedManager.getPersonaMemoryEntries('cc', 'memory').at(-1)?.title, '雨夜談心');

    const markdown = Object.fromEntries(
        reloadedManager.buildPersonaMarkdownFiles('cc').map(file => [file.path, file.content]),
    );
    assert.match(Object.keys(markdown).find(path => path.endsWith('/soul.md')) || '', /soul\.md$/u);
    assert.match(Object.values(markdown).join('\n'), /重要承諾/u);
    assert.match(Object.values(markdown).join('\n'), /雨夜談心/u);
});

test('auto memory entries and checkpoint are persisted together', () => {
    installLocalStorage();
    const manager = new MemoryManager();

    const added = manager.applyPersonaMemorySummary('cc', [{
        kind: 'preference',
        title: '喜歡橙汁',
        summary: '使用者早餐偏好飲橙汁。',
    }], 24, 2);

    assert.equal(added, 1);
    const restored = new MemoryManager().getPersona('cc');
    assert.equal(restored?.memories?.at(-1)?.title, '喜歡橙汁');
    assert.equal(restored?.lastMemorySummaryUserMessageCount, 24);
    assert.equal(restored?.memorySummaryVersion, 2);
});

test('overlapping memory batches merge the same event instead of duplicating it', () => {
    installLocalStorage();
    const manager = new MemoryManager();
    manager.applyPersonaMemorySummary('cc', [{
        kind: 'promise',
        title: '海邊日出約定',
        summary: '兩人約定一起到海邊看日出。',
        sourceMessageIds: ['message-1'],
        importance: 4,
    }], 12, 3);
    const added = manager.applyPersonaMemorySummary('cc', [{
        kind: 'promise',
        title: '一起看海邊日出',
        summary: '兩人認真約定下次一起到海邊看日出，而且不能突然失約。',
        sourceMessageIds: ['message-1', 'message-2'],
        importance: 5,
    }], 24, 3);

    const memories = manager.getPersonaMemoryEntries('cc', 'memory');
    assert.equal(added, 0);
    assert.equal(memories.length, 1);
    assert.deepEqual(memories[0].sourceMessageIds, ['message-1', 'message-2']);
    assert.equal(memories[0].importance, 5);
});

test('recalling a sourced turn also removes the derived long-term memory', () => {
    installLocalStorage();
    const manager = new MemoryManager();
    manager.applyPersonaMemorySummary('cc', [{
        kind: 'event',
        title: '已收回事件',
        summary: '這項記憶只來自即將收回的回合。',
        sourceMessageIds: ['user-message', 'reply-message'],
    }], 12, 3);

    const removed = manager.removePersonaMemoriesBySourceMessageIds('cc', ['user-message'], 11);
    assert.equal(removed, 1);
    assert.equal(manager.getPersonaMemoryEntries('cc', 'memory').length, 0);
    assert.equal(manager.getPersona('cc')?.lastMemorySummaryUserMessageCount, 11);
});
