import assert from 'node:assert/strict';
import test from 'node:test';
import { FileManager } from '../fileManager.js';

const createHarness = () => {
    let loadAllDataCalls = 0;
    let importRoomCalls = 0;
    let beforeRestoreCalls = 0;

    const memoryManager = {
        getModifiedAndCustomPersonas: () => ({}),
        getAllChatHistories: () => ({}),
        getAllDiaryEntries: () => ({}),
        getAllInterests: () => ({}),
        getAllPersonas: () => ({}),
        getPersona: () => undefined,
        peekChatHistory: () => [],
        loadAllData: () => { loadAllDataCalls += 1; },
    };
    const roomManager = {
        getRooms: () => [],
        getRoom: () => undefined,
        importData: () => { importRoomCalls += 1; },
    };
    const manager = new FileManager(memoryManager as never, {
        downloadAllChatsBtn: {} as HTMLButtonElement,
        downloadImagesBtn: {} as HTMLButtonElement,
        beforeAllDataRestore: () => { beforeRestoreCalls += 1; },
        onSingleChatRestored: () => undefined,
        onAllDataRestored: () => undefined,
    }, roomManager as never);

    return {
        manager: manager as unknown as {
            restoreLoadedZip: (zip: unknown, replaceExisting?: boolean) => Promise<void>;
        },
        counts: () => ({ loadAllDataCalls, importRoomCalls, beforeRestoreCalls }),
    };
};

test('corrupt archive media fails before all-data state mutation begins', async () => {
    const { manager, counts } = createHarness();
    const mediaReads: string[] = [];
    const goodEntry = {
        dir: false,
        async: async (kind: string) => {
            mediaReads.push(`good:${kind}`);
            return new Uint8Array([1, 2, 3]);
        },
    };
    const corruptEntry = {
        dir: false,
        async: async (kind: string) => {
            mediaReads.push(`corrupt:${kind}`);
            throw new Error('corrupt media entry');
        },
    };
    const zip = {
        file: (name: string) => name === 'all_data.json'
            ? { async: async () => JSON.stringify({
                customPersonas: {},
                chatHistories: {},
                diaries: {},
                interests: {},
                rooms: { version: 2, rooms: [] },
            }) }
            : null,
        folder: (name: string) => name === 'photos'
            ? {
                forEach: (callback: (path: string, entry: unknown) => void) => {
                    callback('persona/good.webp', goodEntry);
                    callback('persona/corrupt.webp', corruptEntry);
                },
            }
            : null,
    };

    await assert.rejects(
        manager.restoreLoadedZip(zip),
        /corrupt media entry/u,
    );

    assert.deepEqual(mediaReads, ['good:uint8array', 'corrupt:uint8array']);
    assert.deepEqual(counts(), {
        loadAllDataCalls: 0,
        importRoomCalls: 0,
        beforeRestoreCalls: 0,
    });
});

test('malformed history payload is rejected before any state mutation', async () => {
    const { manager, counts } = createHarness();
    const zip = {
        file: (name: string) => {
            if (name === 'all_data.json') return null;
            if (name === 'history.json') {
                return {
                    async: async () => JSON.stringify({
                        personaKey: 'custom_bad',
                        history: { not: 'an array' },
                        personaData: { name: 'Bad archive' },
                    }),
                };
            }
            return null;
        },
        folder: () => null,
    };

    await assert.rejects(
        manager.restoreLoadedZip(zip),
        /對話歷史格式錯誤/u,
    );
    assert.deepEqual(counts(), {
        loadAllDataCalls: 0,
        importRoomCalls: 0,
        beforeRestoreCalls: 0,
    });
});
