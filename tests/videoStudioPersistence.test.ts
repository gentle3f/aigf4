import assert from 'node:assert/strict';
import test from 'node:test';
import {
    VIDEO_PENDING_JOB_STORAGE_KEY,
    readPersistedVideoJob,
    removePersistedVideoJob,
    sanitizePersistedVideoJob,
    writePersistedVideoJob,
} from '../videoStudioPersistence.js';

const createStorage = () => {
    const values = new Map<string, string>();
    return {
        values,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
    };
};

test('pending video job persistence accepts only safe resumable metadata', () => {
    const valid = {
        version: 1 as const,
        model: 'venice-video-model',
        modelName: 'Video Model',
        queueId: 'queue_abc-123',
        downloadUrl: 'https://example.com/video.mp4',
        prompt: 'adult cinematic scene',
        mode: 'image-to-video' as const,
        queuedAt: 123456,
    };
    assert.deepEqual(sanitizePersistedVideoJob(valid), valid);
    assert.equal(sanitizePersistedVideoJob({ ...valid, queueId: '../bad' }), null);
    assert.equal(sanitizePersistedVideoJob({ ...valid, downloadUrl: 'http://example.com/video.mp4' }), null);
    assert.equal(sanitizePersistedVideoJob({ ...valid, prompt: '' }), null);
    assert.equal(sanitizePersistedVideoJob({ ...valid, mode: 'other' }), null);
});

test('pending video job storage round-trips metadata and clears corrupt state', () => {
    const storage = createStorage();
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
        const job = {
            version: 1 as const,
            model: 'venice-video-model',
            modelName: 'Video Model',
            queueId: 'queue_123',
            prompt: 'adult cinematic scene',
            mode: 'text-to-video' as const,
            queuedAt: 987654,
        };
        assert.equal(writePersistedVideoJob(job), true);
        assert.deepEqual(readPersistedVideoJob(), { ...job, downloadUrl: undefined });

        storage.setItem(VIDEO_PENDING_JOB_STORAGE_KEY, JSON.stringify({ ...job, queueId: '../bad' }));
        assert.equal(readPersistedVideoJob(), null);
        assert.equal(storage.getItem(VIDEO_PENDING_JOB_STORAGE_KEY), null);

        assert.equal(writePersistedVideoJob(job), true);
        removePersistedVideoJob();
        assert.equal(storage.getItem(VIDEO_PENDING_JOB_STORAGE_KEY), null);
    } finally {
        if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
        else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
});
