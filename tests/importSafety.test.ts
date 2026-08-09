import assert from 'node:assert/strict';
import test from 'node:test';
import { FileManager } from '../fileManager.js';
import { ChatMessage, MemoryManager, Persona } from '../managers.js';

const persona: Persona = {
    name: 'IU',
    emoji: '*',
    gender: 'female',
    description: 'IU',
    prompt: 'persona',
    greeting: 'hello',
    avatarPrompt: 'IU',
    avatarUrl: 'data:image/jpeg;base64,current-avatar',
};

const existingHistory: ChatMessage[] = [
    { id: 'one', role: 'model', content: { text: 'old message' } },
    { id: 'two', role: 'user', content: { text: 'newer local message' } },
];

const createFileManager = () => {
    const memoryManager = {
        getModifiedAndCustomPersonas: () => ({ custom_iu: persona }),
        getAllChatHistories: () => ({ custom_iu: existingHistory }),
        getAllDiaryEntries: () => ({}),
        getAllInterests: () => ({}),
        getAllPersonas: () => ({ custom_iu: persona }),
        getPersona: (key: string) => key === 'custom_iu' ? persona : undefined,
    };
    const roomManager = {
        getRooms: () => [],
        getRoom: () => undefined,
    };
    const manager = new FileManager(memoryManager as never, {
        downloadAllChatsBtn: {} as HTMLButtonElement,
        downloadImagesBtn: {} as HTMLButtonElement,
        onSingleChatRestored: () => undefined,
        onAllDataRestored: () => undefined,
    }, roomManager as never);
    return manager as unknown as {
        prepareMergeSafeImport: (data: unknown) => {
            data: { customPersonas: Record<string, Persona>; chatHistories: Record<string, ChatMessage[]> };
            keyMap: Map<string, string>;
            skippedSourceKeys: Set<string>;
            summary: { importedMessages: number; renamedConflicts: number; skippedDuplicates: number };
        };
    };
};

test('safe import skips an archive that is already a prefix of newer local history', () => {
    const prepared = createFileManager().prepareMergeSafeImport({
        customPersonas: { custom_iu: { ...persona, avatarUrl: null } },
        chatHistories: { custom_iu: [existingHistory[0]] },
        diaries: {},
        interests: {},
    });

    assert.equal(prepared.skippedSourceKeys.has('custom_iu'), true);
    assert.equal(prepared.summary.skippedDuplicates, 1);
    assert.equal(prepared.summary.importedMessages, 0);
    assert.deepEqual(existingHistory.map(message => message.id), ['one', 'two']);
});

test('safe import renames conflicting history instead of overwriting the local room', () => {
    const importedHistory: ChatMessage[] = [
        { id: 'different', role: 'model', content: { text: 'different archive' } },
    ];
    const prepared = createFileManager().prepareMergeSafeImport({
        customPersonas: { custom_iu: { ...persona, avatarUrl: null } },
        chatHistories: { custom_iu: importedHistory },
        diaries: {},
        interests: {},
    });
    const targetKey = prepared.keyMap.get('custom_iu');

    assert.match(targetKey || '', /^custom_import_custom_iu_/u);
    assert.equal(prepared.summary.renamedConflicts, 1);
    assert.equal(prepared.data.chatHistories[targetKey!], importedHistory);
    assert.deepEqual(existingHistory.map(message => message.id), ['one', 'two']);
});

test('storage failure rolls back the whole import instead of leaving partial data', () => {
    const storage = new Map<string, string>();
    let rejectImportedHistory = false;
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => storage.get(key) || null,
            setItem: (key: string, value: string) => {
                if (rejectImportedHistory && key === 'chatHistories' && value.includes('imported-message')) {
                    throw new DOMException('Quota exceeded', 'QuotaExceededError');
                }
                storage.set(key, value);
            },
        },
    });
    const manager = new MemoryManager();
    manager.setChatHistory('keep-room', [
        { id: 'keep-message', role: 'model', content: { text: 'keep me' } },
    ]);
    rejectImportedHistory = true;
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
        assert.throws(() => manager.loadAllData({
            customPersonas: { custom_imported: { ...persona, avatarUrl: null } },
            chatHistories: {
                custom_imported: [
                    { id: 'imported-message', role: 'model', content: { text: 'new import' } },
                ],
            },
        }), /匯入已取消/u);
    } finally {
        console.error = originalConsoleError;
    }
    assert.equal(manager.getPersona('custom_imported'), undefined);
    assert.deepEqual(manager.peekChatHistory('keep-room').map(message => message.id), ['keep-message']);
    assert.equal(manager.peekChatHistory('custom_imported').length, 0);
});
