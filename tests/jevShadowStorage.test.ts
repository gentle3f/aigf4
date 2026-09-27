import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearPersistedJevShadowRecords,
    JEV_SHADOW_STORAGE_KEY,
    loadPersistedJevShadowRecords,
    MAX_PERSISTED_JEV_SHADOW_RECORDS,
    persistJevShadowRecords,
    sanitizePersistedJevShadowRecord,
} from '../engine/review/jevShadowStorage.js';
import type { JevShadowRecord } from '../engine/review/jevShadow.js';

class MemoryStorage {
    private readonly data = new Map<string, string>();
    getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
    setItem(key: string, value: string) { this.data.set(key, String(value)); }
    removeItem(key: string) { this.data.delete(key); }
}

const signals = {
    requestMismatch: 0.01,
    identityConflict: 0.02,
    speakerOwnershipViolation: 0.03,
    continuityViolation: 0.04,
    realityLayerViolation: 0.05,
    wardrobeConflict: 0.06,
    stateConflict: 0.07,
    replayedBeat: 0.08,
    personaVoiceViolation: 0.09,
    thirdPartySpeechViolation: 0.1,
    userAgencyViolation: 0.11,
    incompleteEnding: 0.12,
    groupNarrationViolation: 0.13,
    otherDefect: 0.14,
};

const makeRecord = (requestId: string): JevShadowRecord => ({
    taxonomyVersion: 'v3',
    requestId,
    mode: 'group',
    ccMode: false,
    status: 'ok',
    latencyMs: 123,
    servedModel: 'typesafe/jev-1.13-20260917',
    signals: { ...signals },
    usageInputTokens: 100,
    usageOutputTokens: 20,
    usageCost: 0.0001,
    wardrobeTrial: {
        profile: 'wardrobe-v4',
        status: 'ok',
        latencyMs: 95,
        servedModel: 'typesafe/jev-1.13-20260917',
        wardrobeConflict: 0.02,
        usageInputTokens: 90,
        usageOutputTokens: 10,
        usageCost: 0.00009,
    },
    gemmaDecision: 'revise',
    gemmaIssueCodes: ['wardrobe'],
    gemmaComparableIssueCodes: ['wardrobe'],
    gemmaIssueAnomalies: [],
});

const withStorage = async (fn: (storage: MemoryStorage) => void | Promise<void>) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
        await fn(storage);
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
        else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
};

test('Jev shadow persistence survives reload semantics using metadata only', async () => {
    await withStorage(storage => {
        const unsafe = {
            ...makeRecord('req-1'),
            candidateText: 'PRIVATE_CANDIDATE',
            recentHistoryText: 'PRIVATE_HISTORY',
            personaEvidence: 'PRIVATE_PERSONA',
            rawPrompt: 'PRIVATE_PROMPT',
            authorization: 'Bearer PRIVATE_KEY',
            wardrobeTrial: {
                ...makeRecord('req-1').wardrobeTrial!,
                rawState: 'PRIVATE_STATE',
            },
        } as JevShadowRecord;

        persistJevShadowRecords([unsafe]);
        const raw = storage.getItem(JEV_SHADOW_STORAGE_KEY)!;
        for (const forbidden of [
            'PRIVATE_CANDIDATE', 'PRIVATE_HISTORY', 'PRIVATE_PERSONA', 'PRIVATE_PROMPT',
            'PRIVATE_KEY', 'PRIVATE_STATE', 'candidateText', 'recentHistoryText', 'personaEvidence',
            'rawPrompt', 'authorization', 'rawState',
        ]) assert.equal(raw.includes(forbidden), false);

        const loaded = loadPersistedJevShadowRecords();
        assert.equal(loaded.length, 1);
        assert.deepEqual(loaded[0], makeRecord('req-1'));
    });
});

test('Jev shadow persistence is bounded to the newest 200 safe records', async () => {
    await withStorage(() => {
        const records = Array.from({ length: MAX_PERSISTED_JEV_SHADOW_RECORDS + 7 }, (_, index) => makeRecord(`req-${index}`));
        persistJevShadowRecords(records);
        const loaded = loadPersistedJevShadowRecords();
        assert.equal(loaded.length, MAX_PERSISTED_JEV_SHADOW_RECORDS);
        assert.equal(loaded[0]?.requestId, 'req-7');
        assert.equal(loaded.at(-1)?.requestId, `req-${MAX_PERSISTED_JEV_SHADOW_RECORDS + 6}`);
    });
});

test('Jev shadow persistence rejects corrupt/private-shaped records and clear removes storage', async () => {
    await withStorage(storage => {
        storage.setItem(JEV_SHADOW_STORAGE_KEY, JSON.stringify({
            version: 1,
            records: [
                makeRecord('safe'),
                { ...makeRecord('bad'), status: 'ok', servedModel: 'x', signals: { wardrobeConflict: 999 } },
                { taxonomyVersion: 'v3', requestId: 'private-only', mode: 'group', ccMode: false, status: 'ok', latencyMs: 1, candidateText: 'secret' },
            ],
        }));
        const loaded = loadPersistedJevShadowRecords();
        assert.deepEqual(loaded.map(record => record.requestId), ['safe']);
        clearPersistedJevShadowRecords();
        assert.equal(storage.getItem(JEV_SHADOW_STORAGE_KEY), null);
    });
});

test('single persisted record sanitizer never accepts unknown free-text fields', () => {
    const sanitized = sanitizePersistedJevShadowRecord({
        ...makeRecord('sanitized'),
        latestUserText: 'secret user text',
        candidateText: 'secret candidate',
        recentHistoryText: 'secret history',
        personaEvidence: 'secret persona',
    });
    assert.ok(sanitized);
    const json = JSON.stringify(sanitized);
    for (const secret of ['secret user text', 'secret candidate', 'secret history', 'secret persona']) {
        assert.equal(json.includes(secret), false);
    }
});
