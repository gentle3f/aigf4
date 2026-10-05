export const VIDEO_PENDING_JOB_STORAGE_KEY = 'veniceVideoPendingJobV1';

export type PersistedVideoMode = 'image-to-video' | 'text-to-video';

export type PersistedVideoJob = {
    version: 1;
    model: string;
    modelName: string;
    queueId: string;
    downloadUrl?: string;
    prompt: string;
    mode: PersistedVideoMode;
    queuedAt: number;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const getStorage = (): StorageLike | null => {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
        return null;
    }
};

export const sanitizePersistedVideoJob = (input: unknown): PersistedVideoJob | null => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const value = input as Partial<PersistedVideoJob>;
    const validMode = value.mode === 'image-to-video' || value.mode === 'text-to-video';
    const validDownloadUrl = value.downloadUrl === undefined
        || (typeof value.downloadUrl === 'string' && /^https:\/\//i.test(value.downloadUrl));
    if (
        value.version !== 1
        || typeof value.model !== 'string'
        || !value.model.trim()
        || typeof value.queueId !== 'string'
        || !/^[a-z0-9_-]+$/i.test(value.queueId)
        || typeof value.prompt !== 'string'
        || !value.prompt.trim()
        || typeof value.queuedAt !== 'number'
        || !Number.isFinite(value.queuedAt)
        || value.queuedAt <= 0
        || !validMode
        || !validDownloadUrl
    ) return null;

    return {
        version: 1,
        model: value.model,
        modelName: typeof value.modelName === 'string' && value.modelName.trim()
            ? value.modelName
            : value.model,
        queueId: value.queueId,
        downloadUrl: value.downloadUrl,
        prompt: value.prompt,
        mode: value.mode,
        queuedAt: value.queuedAt,
    };
};

export const readPersistedVideoJob = (): PersistedVideoJob | null => {
    const storage = getStorage();
    if (!storage) return null;
    try {
        const raw = storage.getItem(VIDEO_PENDING_JOB_STORAGE_KEY);
        if (!raw) return null;
        const job = sanitizePersistedVideoJob(JSON.parse(raw));
        if (job) return job;
        storage.removeItem(VIDEO_PENDING_JOB_STORAGE_KEY);
        return null;
    } catch {
        try {
            storage.removeItem(VIDEO_PENDING_JOB_STORAGE_KEY);
        } catch {
            // Recovery metadata is best-effort.
        }
        return null;
    }
};

export const writePersistedVideoJob = (job: PersistedVideoJob): boolean => {
    const storage = getStorage();
    if (!storage) return false;
    const safe = sanitizePersistedVideoJob(job);
    if (!safe) return false;
    try {
        storage.setItem(VIDEO_PENDING_JOB_STORAGE_KEY, JSON.stringify(safe));
        return true;
    } catch {
        return false;
    }
};

export const removePersistedVideoJob = () => {
    const storage = getStorage();
    if (!storage) return;
    try {
        storage.removeItem(VIDEO_PENDING_JOB_STORAGE_KEY);
    } catch {
        // Recovery metadata is best-effort.
    }
};
