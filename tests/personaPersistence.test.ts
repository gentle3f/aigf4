import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getPersonaAvatarAsset } from '../avatarStore.js';
import { MemoryManager } from '../managers.js';
import { readPersonaRecovery, savePersonaRecovery } from '../personaRecoveryStore.js';

const installLocalStorage = (shouldThrow?: (key: string) => boolean) => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => {
                if (shouldThrow?.(key)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
                storage.set(key, value);
            },
            removeItem: (key: string) => storage.delete(key),
        },
    });
    return storage;
};

test('chat preferences survive reload for a built-in character without other edits', () => {
    installLocalStorage();
    const manager = new MemoryManager();
    manager.updatePersona('cc', { chatPreferences: { length: 'detailed', style: 'dialogue', pace: 'slow' } });
    assert.deepEqual(new MemoryManager().getPersona('cc')?.chatPreferences, {
        length: 'detailed', style: 'dialogue', pace: 'slow',
    });
});

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
    assert.ok(restored?.memories?.at(-1)?.searchTags?.includes('偏好'));
    assert.ok((restored?.memories?.at(-1)?.searchTags?.length || 0) > 0);
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
        searchTags: ['sunrise', '海邊'],
        importance: 4,
    }], 12, 3);
    const added = manager.applyPersonaMemorySummary('cc', [{
        kind: 'promise',
        title: '一起看海邊日出',
        summary: '兩人認真約定下次一起到海邊看日出，而且不能突然失約。',
        sourceMessageIds: ['message-1', 'message-2'],
        searchTags: ['日出約定', 'beach promise'],
        importance: 5,
    }], 24, 3);

    const memories = manager.getPersonaMemoryEntries('cc', 'memory');
    assert.equal(added, 0);
    assert.equal(memories.length, 1);
    assert.deepEqual(memories[0].sourceMessageIds, ['message-1', 'message-2']);
    assert.ok(memories[0].searchTags?.includes('sunrise'));
    assert.ok(memories[0].searchTags?.includes('日出約定'));
    assert.ok(memories[0].searchTags?.includes('beach promise'));
    assert.equal(memories[0].importance, 5);
});

test('recalling a sourced turn removes both permanent and episodic memories derived from it', () => {
    installLocalStorage();
    const manager = new MemoryManager();
    manager.addPersonaMemory('cc', 'soul', {
        kind: 'preference',
        title: '已收回永久記憶',
        summary: '這項永久記憶只來自即將收回的回合。',
        sourceMessageIds: ['user-message'],
    });
    manager.applyPersonaMemorySummary('cc', [{
        kind: 'event',
        title: '已收回事件',
        summary: '這項事件記憶只來自即將收回的回合。',
        sourceMessageIds: ['user-message', 'reply-message'],
    }], 12, 3);

    const removed = manager.removePersonaMemoriesBySourceMessageIds('cc', ['user-message'], 11);
    assert.equal(removed, 2);
    assert.equal(manager.getPersonaMemoryEntries('cc', 'soul').length, 0);
    assert.equal(manager.getPersonaMemoryEntries('cc', 'memory').length, 0);
    assert.equal(manager.getPersona('cc')?.lastMemorySummaryUserMessageCount, 11);
});


const waitForPersonaRecovery = async (
    matches: (value: Awaited<ReturnType<typeof readPersonaRecovery>>) => boolean,
    timeoutMs = 1000,
) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const value = await readPersonaRecovery();
        if (matches(value)) return value;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Timed out waiting for persona recovery state.');
};

test('built-in relationship state persists even without any other persona edits', () => {
    installLocalStorage();
    const manager = new MemoryManager();
    const relationshipState = {
        closeness: 61,
        trust: 72,
        romanticTension: 44,
        initiative: 53,
        stage: 'close' as const,
        updatedAt: 123,
    };

    manager.updatePersona('cc', { relationshipState });

    const reloaded = new MemoryManager();
    assert.deepEqual(reloaded.getPersona('cc')?.relationshipState, relationshipState);
});

test('persona settings recover after primary localStorage quota failure', async () => {
    await savePersonaRecovery(null);
    let rejectPersonaWrites = false;
    const storage = installLocalStorage(key => rejectPersonaWrites && key === 'customPersonas');
    const manager = new MemoryManager();
    const baseline = storage.get('customPersonas') || null;

    rejectPersonaWrites = true;
    manager.updatePersona('cc', {
        chatPreferences: { length: 'detailed', style: 'dialogue', pace: 'slow' },
        relationshipState: {
            closeness: 80,
            trust: 81,
            romanticTension: 62,
            initiative: 66,
            stage: 'romantic',
            updatedAt: 456,
        },
    });

    const recovery = await waitForPersonaRecovery(value => Boolean(value));
    assert.equal(recovery?.baseline, baseline);
    assert.match(recovery?.data || '', /"relationshipState"/u);

    rejectPersonaWrites = false;
    const reloaded = new MemoryManager();
    assert.notDeepEqual(reloaded.getPersona('cc')?.chatPreferences, {
        length: 'detailed', style: 'dialogue', pace: 'slow',
    });
    assert.equal(await reloaded.restorePersonaRecovery(), true);
    assert.deepEqual(reloaded.getPersona('cc')?.chatPreferences, {
        length: 'detailed', style: 'dialogue', pace: 'slow',
    });
    assert.equal(reloaded.getPersona('cc')?.relationshipState?.stage, 'romantic');

    await waitForPersonaRecovery(value => value === undefined);
});

test('persona recovery preserves a failed custom-persona deletion across reload', async () => {
    await savePersonaRecovery(null);
    let rejectPersonaWrites = false;
    installLocalStorage(key => rejectPersonaWrites && key === 'customPersonas');
    const manager = new MemoryManager();
    const key = manager.saveCustomPersona({
        name: 'Temporary Persona',
        emoji: 'T',
        description: 'temporary',
        prompt: 'temporary',
        greeting: 'hello',
        avatarPrompt: '',
    });

    assert.ok(manager.getPersona(key));
    rejectPersonaWrites = true;
    assert.equal(manager.deleteCustomPersona(key), true);
    assert.equal(manager.getPersona(key), undefined);
    await waitForPersonaRecovery(value => Boolean(value));

    rejectPersonaWrites = false;
    const reloaded = new MemoryManager();
    assert.ok(reloaded.getPersona(key));
    assert.equal(await reloaded.restorePersonaRecovery(), true);
    assert.equal(reloaded.getPersona(key), undefined);

    await waitForPersonaRecovery(value => value === undefined);
});

test('persona recovery never overwrites a newer primary persona baseline', async () => {
    await savePersonaRecovery(null);
    let rejectPersonaWrites = false;
    const storage = installLocalStorage(key => rejectPersonaWrites && key === 'customPersonas');
    const manager = new MemoryManager();

    rejectPersonaWrites = true;
    manager.updatePersona('cc', {
        chatPreferences: { length: 'concise', style: 'balanced', pace: 'slow' },
    });
    await waitForPersonaRecovery(value => Boolean(value));

    const newer = JSON.parse(storage.get('customPersonas') || '{}');
    newer.cc = {
        ...manager.getPersona('cc'),
        chatPreferences: { length: 'detailed', style: 'descriptive', pace: 'active' },
    };
    storage.set('customPersonas', JSON.stringify(newer));

    rejectPersonaWrites = false;
    const reloaded = new MemoryManager();
    assert.deepEqual(reloaded.getPersona('cc')?.chatPreferences, {
        length: 'detailed', style: 'descriptive', pace: 'active',
    });
    assert.equal(await reloaded.restorePersonaRecovery(), false);
    assert.deepEqual(reloaded.getPersona('cc')?.chatPreferences, {
        length: 'detailed', style: 'descriptive', pace: 'active',
    });
    assert.equal(await readPersonaRecovery(), undefined);
});


test('app restores persona recovery before private avatars and initial list rendering', () => {
    const source = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const initStart = source.indexOf('const init = async () => {');
    const recoveryIndex = source.indexOf('await memoryManager.restorePersonaRecovery();', initStart);
    const avatarIndex = source.indexOf('memoryManager.restorePrivateAvatars()', initStart);
    const renderIndex = source.indexOf('renderPersonaList();', initStart);

    assert.ok(initStart >= 0);
    assert.ok(recoveryIndex > initStart);
    assert.ok(avatarIndex > recoveryIndex);
    assert.ok(renderIndex > avatarIndex);
    assert.match(
        source,
        /window\.addEventListener\('wetapp-persona-storage-recovered',[\s\S]*角色設定與長期記憶已寫入本機備援儲存/,
    );
});


test('private persona avatars stay out of localStorage and survive through IndexedDB pointers', async () => {
    await savePersonaRecovery(null);
    const storage = installLocalStorage();
    const manager = new MemoryManager();
    const avatarUrl = 'data:image/png;base64,YXZhdGFy';

    await manager.setPersonaAvatar('cc', avatarUrl);

    const saved = storage.get('customPersonas') || '';
    assert.match(saved, /private-avatar:cc/u);
    assert.doesNotMatch(saved, /data:image\//u);
    const asset = await getPersonaAvatarAsset('cc');
    assert.ok(asset);
    assert.equal(await asset!.blob.text(), 'avatar');

    const reloaded = new MemoryManager();
    assert.doesNotMatch(reloaded.getPersona('cc')?.avatarUrl || '', /^data:image\//u);
    assert.ok(await getPersonaAvatarAsset('cc'));
});

test('generated persona avatar entry points use private avatar storage instead of persona metadata blobs', () => {
    const indexSource = readFileSync(new URL('../index.tsx', import.meta.url), 'utf8');
    const mimicSource = readFileSync(new URL('../features/mimicPersonaCreator.ts', import.meta.url), 'utf8');

    const randomStart = indexSource.indexOf('const loadRandomRecruitUi = async');
    const randomEnd = indexSource.indexOf('const randomlyRecruitNewPersona = async', randomStart);
    const randomSource = indexSource.slice(randomStart, randomEnd);
    assert.match(randomSource, /saveAvatar: \(personaKey, avatarUrl\) => memoryManager\.setPersonaAvatar\(personaKey, avatarUrl\)/);
    assert.doesNotMatch(randomSource, /updatePersona\(personaKey, \{ avatarUrl \}\)/);

    const mimicDependencyStart = indexSource.indexOf('savePersona: async input =>');
    const mimicDependencyEnd = indexSource.indexOf('afterSave:', mimicDependencyStart);
    const mimicDependencySource = indexSource.slice(mimicDependencyStart, mimicDependencyEnd);
    assert.match(mimicDependencySource, /input\.avatarUrl\?\.startsWith\('data:image\/'\)/);
    assert.match(mimicDependencySource, /await memoryManager\.setPersonaAvatar\(key, input\.avatarUrl\)/);
    assert.match(mimicSource, /savePersona: \(input: MimicPersonaSaveInput\) => string \| Promise<string>/);
    assert.match(mimicSource, /const key = await getDependencies\(\)\.savePersona\(/);
});


test('persona recovery replays only failed deltas and preserves newer in-memory migrations', async () => {
    await savePersonaRecovery(null);
    const storage = installLocalStorage();

    const seedManager = new MemoryManager();
    const seed = structuredClone(seedManager.getPersona('cc')!);
    storage.clear();

    const baselinePersona = {
        ...seed,
        description: 'baseline description',
        chatPreferences: { length: 'natural', style: 'balanced', pace: 'natural' } as const,
    };
    const baseline = JSON.stringify({ cc: baselinePersona });
    storage.set('customPersonas', baseline);

    const recoveredPersona = {
        ...baselinePersona,
        chatPreferences: { length: 'detailed', style: 'dialogue', pace: 'slow' } as const,
    };
    await savePersonaRecovery({
        baseline,
        data: JSON.stringify({ cc: recoveredPersona }),
    });

    const manager = new MemoryManager();
    manager.updatePersona('cc', { description: 'migration-updated description' });
    assert.notEqual(storage.get('customPersonas'), baseline);

    assert.equal(await manager.restorePersonaRecovery(), true);
    const restored = manager.getPersona('cc');
    assert.equal(restored?.description, 'migration-updated description');
    assert.deepEqual(restored?.chatPreferences, {
        length: 'detailed',
        style: 'dialogue',
        pace: 'slow',
    });

    const persisted = JSON.parse(storage.get('customPersonas') || '{}');
    assert.equal(persisted.cc.description, 'migration-updated description');
    assert.deepEqual(persisted.cc.chatPreferences, {
        length: 'detailed',
        style: 'dialogue',
        pace: 'slow',
    });
});
