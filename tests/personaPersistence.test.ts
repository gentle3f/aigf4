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
