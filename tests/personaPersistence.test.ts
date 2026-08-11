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
