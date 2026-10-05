const CLOUD_STATE_STORAGE_KEY = 'wetappCloudBackupStateV1';

export interface PersistedCloudBackupState {
    enabled: boolean;
    deviceId: string;
    vaultId?: string;
    lastBackupAt?: number;
    lastBackupSize?: number;
    lastBackupPathname?: string;
    lastBackupPhotoCount?: number;
    lastBackupMigratedPhotoCount?: number;
    lastFingerprint?: string;
    lastError?: string;
}

const createDeviceId = () => (
    crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
).toLocaleLowerCase();

export const readCloudBackupState = (): PersistedCloudBackupState => {
    try {
        const parsed = JSON.parse(
            localStorage.getItem(CLOUD_STATE_STORAGE_KEY) || '{}',
        ) as Partial<PersistedCloudBackupState>;
        return {
            enabled: parsed.enabled === true,
            deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId
                ? parsed.deviceId
                : createDeviceId(),
            vaultId: typeof parsed.vaultId === 'string' && /^[a-zA-Z0-9_-]{43}$/u.test(parsed.vaultId)
                ? parsed.vaultId
                : undefined,
            lastBackupAt: parsed.lastBackupAt,
            lastBackupSize: parsed.lastBackupSize,
            lastBackupPathname: parsed.lastBackupPathname,
            lastBackupPhotoCount: parsed.lastBackupPhotoCount,
            lastBackupMigratedPhotoCount: parsed.lastBackupMigratedPhotoCount,
            lastFingerprint: parsed.lastFingerprint,
            lastError: parsed.lastError,
        };
    } catch {
        return { enabled: false, deviceId: createDeviceId() };
    }
};

export const persistCloudBackupState = (state: PersistedCloudBackupState) => {
    try {
        localStorage.setItem(CLOUD_STATE_STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch (error) {
        console.warn('Unable to persist Cloud Backup state:', error);
        if (typeof window !== 'undefined') {
            queueMicrotask(() => window.dispatchEvent(new CustomEvent('wetapp-storage-failed')));
        }
        return false;
    }
};

export const initializeCloudBackupState = () => {
    const state = readCloudBackupState();
    persistCloudBackupState(state);
    return state;
};

export const cloudBackupStateStorageKey = CLOUD_STATE_STORAGE_KEY;
