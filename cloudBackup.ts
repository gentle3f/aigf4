import type { FileManager } from './fileManager.js';

const BACKUP_MAGIC = 'WETAPP-CLOUD-BACKUP-V1\n';
const BACKUP_FORMAT_VERSION = 1;
const PBKDF2_ITERATIONS = 350_000;
const ENCRYPTION_CHUNK_SIZE = 8 * 1024 * 1024;
const AES_GCM_TAG_SIZE = 16;
const HEADER_PREVIEW_SIZE = 64 * 1024;
const CLOUD_STATE_STORAGE_KEY = 'wetappCloudBackupStateV1';
const CLOUD_KEY_DATABASE = 'wetapp-cloud-backup-key';
const CLOUD_KEY_STORE = 'keys';
const CLOUD_KEY_RECORD_ID = 'active';
const AUTO_CHECK_INTERVAL_MS = 60 * 1000;
const AUTO_BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000;
const BACKUP_CONTENT_VERSION = 4;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface CloudBackupHeader {
    version: 1;
    createdAt: number;
    originalSize: number;
    chunkSize: number;
    chunkCount: number;
    salt: string;
    ivPrefix: string;
    kdf: 'PBKDF2-SHA256';
    iterations: number;
}

export interface CloudBackupListItem {
    pathname: string;
    size: number;
    uploadedAt: string;
}

export interface CloudBackupState {
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

export type CloudBackupStage = 'idle' | 'packing' | 'encrypting' | 'uploading' | 'restoring' | 'success' | 'error';

export interface CloudBackupProgress {
    stage: CloudBackupStage;
    percent?: number;
    message: string;
}

interface StoredCloudKey {
    id: typeof CLOUD_KEY_RECORD_ID;
    vaultId: string;
    salt: string;
    iterations: number;
    rawKey: ArrayBuffer;
}

interface ParsedBackupHeader {
    header: CloudBackupHeader;
    headerPrefix: Uint8Array;
    dataOffset: number;
}

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    const sliceSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += sliceSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + sliceSize));
    }
    return btoa(binary);
};

const bytesToBase64Url = (bytes: Uint8Array) => (
    bytesToBase64(bytes).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '')
);

export const deriveCloudBackupVaultId = async (passphrase: string) => {
    const normalized = passphrase.normalize('NFKC');
    const digest = await crypto.subtle.digest(
        'SHA-256',
        encoder.encode(`wetapp-cloud-vault-v1\0${normalized}`),
    );
    return bytesToBase64Url(new Uint8Array(digest));
};

const base64ToBytes = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
};

const randomBytes = (length: number) => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
};

const toArrayBuffer = (bytes: Uint8Array) => (
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
);

const buildChunkIv = (prefix: Uint8Array, index: number) => {
    const iv = new Uint8Array(12);
    iv.set(prefix, 0);
    new DataView(iv.buffer).setUint32(8, index, false);
    return iv;
};

const buildChunkAdditionalData = (headerPrefix: Uint8Array, index: number) => {
    const chunkLabel = encoder.encode(`chunk:${index}`);
    const output = new Uint8Array(headerPrefix.length + chunkLabel.length);
    output.set(headerPrefix, 0);
    output.set(chunkLabel, headerPrefix.length);
    return output;
};

export const deriveCloudBackupKey = async (
    passphrase: string,
    salt: Uint8Array,
    iterations = PBKDF2_ITERATIONS,
) => {
    const material = await crypto.subtle.importKey(
        'raw',
        encoder.encode(passphrase.normalize('NFKC')),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt'],
    );
};

export const encryptCloudBackup = async (
    archive: Blob,
    key: CryptoKey,
    salt: Uint8Array,
    onProgress?: (percent: number) => void,
    chunkSize = ENCRYPTION_CHUNK_SIZE,
    iterations = PBKDF2_ITERATIONS,
) => {
    const createdAt = Date.now();
    const ivPrefix = randomBytes(8);
    const chunkCount = Math.ceil(archive.size / chunkSize);
    const header: CloudBackupHeader = {
        version: BACKUP_FORMAT_VERSION,
        createdAt,
        originalSize: archive.size,
        chunkSize,
        chunkCount,
        salt: bytesToBase64(salt),
        ivPrefix: bytesToBase64(ivPrefix),
        kdf: 'PBKDF2-SHA256',
        iterations,
    };
    const headerText = `${BACKUP_MAGIC}${JSON.stringify(header)}\n`;
    const headerPrefix = encoder.encode(headerText);
    const encryptedParts: BlobPart[] = [headerPrefix];

    for (let index = 0; index < chunkCount; index += 1) {
        const start = index * chunkSize;
        const plaintext = await archive.slice(start, Math.min(start + chunkSize, archive.size)).arrayBuffer();
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: buildChunkIv(ivPrefix, index),
                additionalData: buildChunkAdditionalData(headerPrefix, index),
            },
            key,
            plaintext,
        );
        encryptedParts.push(ciphertext);
        onProgress?.(Math.round(((index + 1) / chunkCount) * 100));
    }

    return new Blob(encryptedParts, { type: 'application/octet-stream' });
};

export const parseCloudBackupHeader = async (backup: Blob): Promise<ParsedBackupHeader> => {
    const preview = new Uint8Array(await backup.slice(0, HEADER_PREVIEW_SIZE).arrayBuffer());
    const previewText = decoder.decode(preview);
    if (!previewText.startsWith(BACKUP_MAGIC)) throw new Error('這不是有效的 Wetapp 雲端備份。');
    const headerEnd = previewText.indexOf('\n', BACKUP_MAGIC.length);
    if (headerEnd < 0) throw new Error('雲端備份標頭不完整。');

    const header = JSON.parse(previewText.slice(BACKUP_MAGIC.length, headerEnd)) as CloudBackupHeader;
    if (
        header.version !== BACKUP_FORMAT_VERSION
        || header.kdf !== 'PBKDF2-SHA256'
        || !Number.isSafeInteger(header.originalSize)
        || !Number.isSafeInteger(header.chunkSize)
        || !Number.isSafeInteger(header.chunkCount)
        || !Number.isSafeInteger(header.iterations)
        || header.originalSize <= 0
        || header.chunkSize <= 0
        || header.chunkCount <= 0
        || header.iterations < 100_000
    ) throw new Error('雲端備份格式不受支援或已損壞。');

    const dataOffset = headerEnd + 1;
    const expectedEncryptedSize = header.originalSize + header.chunkCount * AES_GCM_TAG_SIZE;
    if (backup.size - dataOffset !== expectedEncryptedSize) {
        throw new Error('雲端備份大小不符，檔案可能未完整上傳。');
    }

    return {
        header,
        headerPrefix: preview.slice(0, dataOffset),
        dataOffset,
    };
};

export const decryptCloudBackup = async (
    backup: Blob,
    key: CryptoKey,
    onProgress?: (percent: number) => void,
) => {
    const { header, headerPrefix, dataOffset } = await parseCloudBackupHeader(backup);
    const ivPrefix = base64ToBytes(header.ivPrefix);
    if (ivPrefix.length !== 8) throw new Error('雲端備份加密參數無效。');

    const decryptedParts: BlobPart[] = [];
    let encryptedOffset = dataOffset;
    for (let index = 0; index < header.chunkCount; index += 1) {
        const remainingPlaintext = header.originalSize - index * header.chunkSize;
        const plaintextSize = Math.min(header.chunkSize, remainingPlaintext);
        const encryptedSize = plaintextSize + AES_GCM_TAG_SIZE;
        const ciphertext = await backup.slice(encryptedOffset, encryptedOffset + encryptedSize).arrayBuffer();
        let plaintext: ArrayBuffer;
        try {
            plaintext = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: buildChunkIv(ivPrefix, index),
                    additionalData: buildChunkAdditionalData(headerPrefix, index),
                },
                key,
                ciphertext,
            );
        } catch {
            throw new Error('復原密碼不正確，或雲端備份已損壞。');
        }
        decryptedParts.push(plaintext);
        encryptedOffset += encryptedSize;
        onProgress?.(Math.round(((index + 1) / header.chunkCount) * 100));
    }

    return new Blob(decryptedParts, { type: 'application/zip' });
};

const openKeyDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CLOUD_KEY_DATABASE, 1);
    request.onerror = () => reject(request.error || new Error('無法開啟本機備份金鑰庫。'));
    request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(CLOUD_KEY_STORE)) {
            request.result.createObjectStore(CLOUD_KEY_STORE, { keyPath: 'id' });
        }
    };
    request.onsuccess = () => resolve(request.result);
});

const runKeyRequest = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
) => {
    const database = await openKeyDatabase();
    return new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(CLOUD_KEY_STORE, mode);
        const request = operation(transaction.objectStore(CLOUD_KEY_STORE));
        let result!: T;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error || new Error('本機備份金鑰操作失敗。'));
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(transaction.error || new Error('本機備份金鑰操作失敗。'));
    });
};

const saveLocalKey = async (
    key: CryptoKey,
    salt: Uint8Array,
    vaultId: string,
    iterations = PBKDF2_ITERATIONS,
) => {
    const rawKey = await crypto.subtle.exportKey('raw', key);
    await runKeyRequest('readwrite', store => store.put({
        id: CLOUD_KEY_RECORD_ID,
        vaultId,
        salt: bytesToBase64(salt),
        iterations,
        rawKey,
    } satisfies StoredCloudKey));
};

const loadLocalKey = async () => {
    const stored = await runKeyRequest<StoredCloudKey | undefined>('readonly', store => store.get(CLOUD_KEY_RECORD_ID));
    if (!stored || !/^[a-zA-Z0-9_-]{43}$/u.test(stored.vaultId || '')) return null;
    return {
        key: await crypto.subtle.importKey('raw', stored.rawKey, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']),
        vaultId: stored.vaultId,
        salt: base64ToBytes(stored.salt),
        iterations: stored.iterations || PBKDF2_ITERATIONS,
    };
};

const deleteLocalKey = async () => {
    await runKeyRequest('readwrite', store => store.delete(CLOUD_KEY_RECORD_ID));
};

const createDeviceId = () => (
    crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
).toLocaleLowerCase();

const readState = (): CloudBackupState => {
    try {
        const parsed = JSON.parse(localStorage.getItem(CLOUD_STATE_STORAGE_KEY) || '{}') as Partial<CloudBackupState>;
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

const persistState = (state: CloudBackupState) => {
    localStorage.setItem(CLOUD_STATE_STORAGE_KEY, JSON.stringify(state));
};

export const fingerprintLocalState = async () => {
    const keys = Object.keys(localStorage)
        .filter(key => key !== CLOUD_STATE_STORAGE_KEY)
        .sort();
    const serialized = [
        `backup-content-version:${BACKUP_CONTENT_VERSION}`,
        ...keys.map(key => `${key}\u0000${localStorage.getItem(key) || ''}`),
    ].join('\u0001');
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(serialized));
    return bytesToBase64(new Uint8Array(digest));
};

const fetchJson = async <T>(url: string, init?: RequestInit) => {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `雲端服務回傳 ${response.status}`);
    return data as T;
};

export class CloudBackupManager {
    private fileManager: FileManager;
    private onProgress: (progress: CloudBackupProgress) => void;
    private onStateChange: (state: CloudBackupState) => void;
    private state = readState();
    private timer: number | null = null;
    private activeOperation: Promise<void> | null = null;

    constructor(
        fileManager: FileManager,
        callbacks: {
            onProgress?: (progress: CloudBackupProgress) => void;
            onStateChange?: (state: CloudBackupState) => void;
        } = {},
    ) {
        this.fileManager = fileManager;
        this.onProgress = callbacks.onProgress || (() => undefined);
        this.onStateChange = callbacks.onStateChange || (() => undefined);
        persistState(this.state);
    }

    getState() {
        return { ...this.state };
    }

    private updateState(update: Partial<CloudBackupState>) {
        this.state = { ...this.state, ...update };
        persistState(this.state);
        this.onStateChange(this.getState());
    }

    private progress(stage: CloudBackupStage, message: string, percent?: number) {
        this.onProgress({ stage, message, percent });
    }

    async hasLocalRecoveryKey() {
        return Boolean(await loadLocalKey());
    }

    async setup(passphrase: string) {
        if (passphrase.normalize('NFKC').trim().length < 12) {
            throw new Error('復原密碼至少需要 12 個字元。');
        }
        const vaultId = await deriveCloudBackupVaultId(passphrase);
        const existingBackups = await this.listBackupsForVault(vaultId);
        if (existingBackups.length > 0) throw new Error('CLOUD_BACKUP_EXISTS');
        const salt = randomBytes(16);
        const key = await deriveCloudBackupKey(passphrase, salt);
        await saveLocalKey(key, salt, vaultId);
        this.updateState({ enabled: true, vaultId, lastError: undefined });
        await this.backupNow();
    }

    private async listBackupsForVault(vaultId: string) {
        const query = new URLSearchParams({ vault: vaultId });
        const result = await fetchJson<{ backups: CloudBackupListItem[] }>(`/api/cloud-backups?${query}`);
        return result.backups;
    }

    async listBackups(passphrase?: string) {
        const localKey = passphrase ? null : await loadLocalKey();
        const vaultId = passphrase
            ? await deriveCloudBackupVaultId(passphrase)
            : localKey?.vaultId || this.state.vaultId;
        if (!vaultId) return [];
        return this.listBackupsForVault(vaultId);
    }

    async backupNow() {
        if (this.activeOperation) return this.activeOperation;
        this.activeOperation = this.performBackup().finally(() => { this.activeOperation = null; });
        return this.activeOperation;
    }

    private async performBackup() {
        if (!navigator.onLine) throw new Error('目前離線，稍後連線時會再自動備份。');
        const localKey = await loadLocalKey();
        if (!localKey) throw new Error('這部裝置找不到備份金鑰，請重新設定或用復原密碼還原。');

        try {
            this.progress('packing', '正在整理完整資料…');
            const archive = await this.fileManager.createAllDataArchive();
            const mediaSummary = this.fileManager.getLastBackupMediaSummary();
            this.progress('encrypting', '正在本機加密…', 0);
            const encrypted = await encryptCloudBackup(
                archive,
                localKey.key,
                localKey.salt,
                percent => this.progress('encrypting', '正在本機加密…', percent),
                ENCRYPTION_CHUNK_SIZE,
                localKey.iterations,
            );
            const createdAt = Date.now();
            const pathname = `wetapp-backups/v1/${localKey.vaultId}/${createdAt}-${this.state.deviceId}.wetbackup`;
            this.progress('uploading', '正在上傳私人雲端…', 0);
            const { upload } = await import('@vercel/blob/client');
            const result = await upload(pathname, encrypted, {
                access: 'private',
                contentType: 'application/octet-stream',
                handleUploadUrl: '/api/cloud-backup-upload',
                multipart: encrypted.size > 100 * 1024 * 1024,
                onUploadProgress: event => this.progress('uploading', '正在上傳私人雲端…', Math.round(event.percentage)),
            });
            await fetchJson('/api/cloud-backups', {
                method: 'POST',
                body: JSON.stringify({ action: 'prune', vaultId: localKey.vaultId }),
            });
            const fingerprint = await fingerprintLocalState();
            this.updateState({
                enabled: true,
                vaultId: localKey.vaultId,
                lastBackupAt: createdAt,
                lastBackupSize: encrypted.size,
                lastBackupPathname: result.pathname,
                lastBackupPhotoCount: mediaSummary?.embeddedPhotos,
                lastBackupMigratedPhotoCount: mediaSummary?.migratedLegacyPhotos,
                lastFingerprint: fingerprint,
                lastError: undefined,
            });
            this.progress(
                'success',
                mediaSummary
                    ? `雲端備份完成，已收錄 ${mediaSummary.embeddedPhotos} 張聊天相片。`
                    : '雲端備份完成。',
                100,
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : '雲端備份失敗。';
            this.updateState({ lastError: message });
            this.progress('error', message);
            throw error;
        }
    }

    async restoreBackup(backup: CloudBackupListItem, passphrase?: string) {
        if (this.activeOperation) return this.activeOperation;
        this.activeOperation = this.performRestore(backup, passphrase).finally(() => { this.activeOperation = null; });
        return this.activeOperation;
    }

    private async performRestore(backup: CloudBackupListItem, passphrase?: string) {
        const autoBackupWasEnabled = this.state.enabled;
        try {
            let localKey = await loadLocalKey();
            const vaultId = passphrase
                ? await deriveCloudBackupVaultId(passphrase)
                : localKey?.vaultId || this.state.vaultId;
            if (!vaultId) throw new Error('NEEDS_RECOVERY_PASSWORD');
            if (!backup.pathname.startsWith(`wetapp-backups/v1/${vaultId}/`)) {
                throw new Error('復原密碼與這個備份不相符。');
            }
            this.progress('restoring', '正在下載加密備份…', 5);
            const signed = await fetchJson<{ url: string }>('/api/cloud-backups', {
                method: 'POST',
                body: JSON.stringify({ action: 'download', vaultId, pathname: backup.pathname }),
            });
            const response = await fetch(signed.url);
            if (!response.ok) throw new Error(`下載備份失敗（${response.status}）。`);
            const encrypted = await response.blob();
            const parsed = await parseCloudBackupHeader(encrypted);
            const headerSalt = base64ToBytes(parsed.header.salt);
            const sameSalt = localKey && bytesToBase64(localKey.salt) === parsed.header.salt;
            if (!sameSalt) {
                if (!passphrase) throw new Error('NEEDS_RECOVERY_PASSWORD');
                const key = await deriveCloudBackupKey(passphrase, headerSalt, parsed.header.iterations);
                localKey = { key, vaultId, salt: headerSalt, iterations: parsed.header.iterations };
            }
            this.progress('restoring', '正在解密及驗證…', 10);
            const archive = await decryptCloudBackup(
                encrypted,
                localKey!.key,
                percent => this.progress('restoring', '正在解密及驗證…', 10 + Math.round(percent * 0.6)),
            );
            this.progress('restoring', '正在替換這部裝置的本機副本…', 75);
            await this.fileManager.restoreAllDataArchive(archive, false, true);
            await saveLocalKey(localKey!.key, localKey!.salt, vaultId, localKey!.iterations);
            const fingerprint = await fingerprintLocalState();
            this.updateState({
                enabled: autoBackupWasEnabled,
                vaultId,
                lastBackupAt: new Date(backup.uploadedAt).getTime(),
                lastBackupSize: backup.size,
                lastBackupPathname: backup.pathname,
                lastFingerprint: fingerprint,
                lastError: undefined,
            });
            this.progress('success', '雲端資料已安全還原。', 100);
        } catch (error) {
            const message = error instanceof Error ? error.message : '雲端還原失敗。';
            if (message !== 'NEEDS_RECOVERY_PASSWORD') {
                this.updateState({ lastError: message });
                this.progress('error', message);
            }
            throw error;
        }
    }

    setEnabled(enabled: boolean) {
        this.updateState({ enabled, lastError: undefined });
        if (enabled) void this.checkForChanges();
    }

    async deleteAllCloudData() {
        const localKey = await loadLocalKey();
        const vaultId = localKey?.vaultId || this.state.vaultId;
        if (!vaultId) throw new Error('這部裝置沒有可刪除的雲端備份空間。');
        await fetchJson('/api/cloud-backups', {
            method: 'POST',
            body: JSON.stringify({ action: 'delete-all', vaultId }),
        });
        await deleteLocalKey();
        this.updateState({
            enabled: false,
            vaultId: undefined,
            lastBackupAt: undefined,
            lastBackupSize: undefined,
            lastBackupPathname: undefined,
            lastBackupPhotoCount: undefined,
            lastBackupMigratedPhotoCount: undefined,
            lastFingerprint: undefined,
            lastError: undefined,
        });
        this.progress('idle', '雲端備份已刪除。');
    }

    async checkForChanges() {
        if (!this.state.enabled || this.activeOperation || document.visibilityState !== 'visible' || !navigator.onLine) return;
        if (this.state.lastBackupAt && Date.now() - this.state.lastBackupAt < AUTO_BACKUP_MIN_INTERVAL_MS) return;
        const fingerprint = await fingerprintLocalState();
        if (fingerprint === this.state.lastFingerprint) return;
        await this.backupNow().catch(() => undefined);
    }

    startAutoBackup() {
        if (this.timer !== null) return;
        this.timer = window.setInterval(() => void this.checkForChanges(), AUTO_CHECK_INTERVAL_MS);
        window.setTimeout(() => void this.checkForChanges(), 15_000);
        window.addEventListener('online', () => void this.checkForChanges());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void this.checkForChanges();
        });
    }
}
