// fileManager.ts
import { MemoryManager, ChatMessage, Interest } from './managers.js';
import type { MemoryImportSnapshot } from './managers.js';
import {
    deleteCharacterPhotoAsset,
    getCharacterPhotoAsset,
    getCharacterPhotoBlob,
    listCharacterPhotoAssets,
    saveCharacterPhotoAsset,
} from './photoStore.js';
import type { CharacterPhotoAsset } from './photoStore.js';
import { RoomManager, roomAvatarStorageKey } from './roomManager.js';
import type { RoomImportSnapshot } from './roomManager.js';
import {
    deleteChatAttachment,
    getChatAttachment,
    getChatAttachmentBlob,
    saveChatAttachment,
} from './chatMediaStore.js';
import type { StoredChatAttachment } from './chatMediaStore.js';
import {
    deletePersonaAvatar,
    getPersonaAvatarAsset,
    savePersonaAvatarBlob,
} from './avatarStore.js';
import type { StoredPersonaAvatar } from './avatarStore.js';
import { beginLocalCloudChangeBatch } from './cloudSyncEvents.js';
import { loadJsZip } from './jsZipLoader.js';
import {
    PERSISTED_APP_SETTING_KEYS,
    restorePersistedAppSettings,
} from './appSettings.js';

interface FileManagerCallbacks {
    beforeAllDataRestore?: () => void;
    onSingleChatRestored: (key: string, history: ChatMessage[]) => void;
    onAllDataRestored: (summary: ImportSummary) => void;
}

export interface ImportSummary {
    importedMessages: number;
    renamedConflicts: number;
    skippedDuplicates: number;
}

interface PreparedImport {
    data: any;
    keyMap: Map<string, string>;
    skippedSourceKeys: Set<string>;
    photoAssetIdMap: Map<string, string>;
    attachmentAssetIdMap: Map<string, string>;
    summary: ImportSummary;
}

interface ImportTransactionSnapshot {
    memory: MemoryImportSnapshot;
    rooms?: RoomImportSnapshot;
    appSettings: Record<string, string | null>;
    avatarAssets: Map<string, StoredPersonaAvatar | null>;
    photoAssets: Map<string, CharacterPhotoAsset | null>;
    attachmentAssets: Map<string, StoredChatAttachment | null>;
}

interface UIElements {
    downloadAllChatsBtn: HTMLButtonElement;
    downloadImagesBtn: HTMLButtonElement;
}

export interface BackupMediaSummary {
    referencedPhotos: number;
    embeddedPhotos: number;
    migratedLegacyPhotos: number;
    recoveredOrphanPhotos: number;
    unavailablePhotos: number;
}

const photoExtension = (mimeType: string) => ({
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
} as Record<string, string>)[mimeType.toLowerCase()] || 'img';

/**
 * Manages all file-related operations like saving, loading, and downloading.
 */
export class FileManager {
    private memoryManager: MemoryManager;
    private callbacks: FileManagerCallbacks;
    private ui: UIElements;
    private roomManager?: RoomManager;
    private lastBackupMediaSummary: BackupMediaSummary | null = null;

    constructor(
        memoryManager: MemoryManager,
        uiAndCallbacks: UIElements & FileManagerCallbacks,
        roomManager?: RoomManager,
    ) {
        this.memoryManager = memoryManager;
        this.roomManager = roomManager;
        this.ui = {
            downloadAllChatsBtn: uiAndCallbacks.downloadAllChatsBtn,
            downloadImagesBtn: uiAndCallbacks.downloadImagesBtn
        };
        this.callbacks = {
            beforeAllDataRestore: uiAndCallbacks.beforeAllDataRestore,
            onSingleChatRestored: uiAndCallbacks.onSingleChatRestored,
            onAllDataRestored: uiAndCallbacks.onAllDataRestored,
        };
    }

    private prepareMergeSafeImport(rawData: any): PreparedImport {
        const importedPersonas = rawData?.customPersonas && typeof rawData.customPersonas === 'object'
            ? rawData.customPersonas as Record<string, any>
            : {};
        const importedHistories = rawData?.chatHistories && typeof rawData.chatHistories === 'object'
            ? rawData.chatHistories as Record<string, ChatMessage[]>
            : {};
        const importedDiaries = rawData?.diaries && typeof rawData.diaries === 'object'
            ? rawData.diaries as Record<string, any>
            : {};
        const importedInterests = rawData?.interests && typeof rawData.interests === 'object'
            ? rawData.interests as Record<string, any>
            : {};
        const importedRooms = Array.isArray(rawData?.rooms?.rooms) ? rawData.rooms.rooms as any[] : [];
        const roomIds = new Set(importedRooms.map(room => String(room?.id || '')).filter(Boolean));
        const sourceKeys = new Set([
            ...Object.keys(importedPersonas),
            ...Object.keys(importedHistories),
            ...Object.keys(importedDiaries),
            ...Object.keys(importedInterests),
            ...roomIds,
        ]);
        const currentPersonas = this.memoryManager.getModifiedAndCustomPersonas();
        const currentHistories = this.memoryManager.getAllChatHistories();
        const currentDiaries = this.memoryManager.getAllDiaryEntries();
        const currentInterests = this.memoryManager.getAllInterests();
        const usedKeys = new Set([
            ...Object.keys(this.memoryManager.getAllPersonas()),
            ...Object.keys(currentHistories),
            ...(this.roomManager?.getRooms().map(room => room.id) || []),
        ]);
        const keyMap = new Map<string, string>();
        const skippedSourceKeys = new Set<string>();
        let renamedConflicts = 0;
        let skippedDuplicates = 0;
        const timestamp = Date.now();

        const comparablePersona = (persona: any) => persona
            ? JSON.stringify({ ...persona, avatarUrl: null })
            : '';
        const isSameOrPrefixHistory = (incoming: ChatMessage[] | undefined, current: ChatMessage[] | undefined) => {
            if (!Array.isArray(incoming) || !Array.isArray(current) || incoming.length > current.length) return false;
            return incoming.every((message, index) => JSON.stringify(message) === JSON.stringify(current[index]));
        };
        const sameValue = (incoming: unknown, current: unknown) => (
            incoming === undefined || JSON.stringify(incoming) === JSON.stringify(current)
        );
        const withoutPortablePhotoReference = (message: ChatMessage) => {
            const content = { ...message.content };
            delete content.imageUrl;
            delete content.imageAssetId;
            return { ...message, content };
        };
        const isPortablePhotoUpgrade = (incoming: ChatMessage[] | undefined, current: ChatMessage[] | undefined) => {
            if (!Array.isArray(incoming) || !Array.isArray(current) || incoming.length !== current.length) return false;
            let upgradedPhoto = false;
            const sameConversation = incoming.every((message, index) => {
                const currentMessage = current[index];
                if (!currentMessage) return false;
                if (
                    message.content.imageAssetId
                    && currentMessage.content.imageUrl
                    && !currentMessage.content.imageAssetId
                ) upgradedPhoto = true;
                return JSON.stringify(withoutPortablePhotoReference(message))
                    === JSON.stringify(withoutPortablePhotoReference(currentMessage));
            });
            return sameConversation && upgradedPhoto;
        };
        const createUniqueKey = (sourceKey: string, isRoom: boolean) => {
            const safeKey = sourceKey.replace(/[^a-zA-Z0-9_-]+/gu, '_').slice(0, 48) || 'data';
            const prefix = isRoom ? 'room_import' : 'custom_import';
            let suffix = 1;
            let candidate = `${prefix}_${safeKey}_${timestamp}`;
            while (usedKeys.has(candidate)) candidate = `${prefix}_${safeKey}_${timestamp}_${suffix++}`;
            usedKeys.add(candidate);
            return candidate;
        };

        sourceKeys.forEach(sourceKey => {
            const isRoom = roomIds.has(sourceKey);
            const hasCurrentPayload = Boolean(
                currentPersonas[sourceKey]
                || currentHistories[sourceKey]
                || currentDiaries[sourceKey]
                || currentInterests[sourceKey]
                || this.roomManager?.getRoom(sourceKey)
            );
            if (!hasCurrentPayload) {
                keyMap.set(sourceKey, sourceKey);
                usedKeys.add(sourceKey);
                return;
            }

            if (!isRoom && isPortablePhotoUpgrade(importedHistories[sourceKey], currentHistories[sourceKey])) {
                keyMap.set(sourceKey, sourceKey);
                usedKeys.add(sourceKey);
                return;
            }

            const isDuplicate = !isRoom
                && isSameOrPrefixHistory(importedHistories[sourceKey], currentHistories[sourceKey])
                && (!importedPersonas[sourceKey]
                    || comparablePersona(importedPersonas[sourceKey]) === comparablePersona(this.memoryManager.getPersona(sourceKey)))
                && sameValue(importedDiaries[sourceKey], currentDiaries[sourceKey])
                && sameValue(importedInterests[sourceKey], currentInterests[sourceKey]);
            if (isDuplicate) {
                keyMap.set(sourceKey, sourceKey);
                skippedSourceKeys.add(sourceKey);
                skippedDuplicates += 1;
                return;
            }

            keyMap.set(sourceKey, createUniqueKey(sourceKey, isRoom));
            renamedConflicts += 1;
        });

        const remapRecord = (record: Record<string, any>) => Object.fromEntries(
            Object.entries(record)
                .filter(([sourceKey]) => !skippedSourceKeys.has(sourceKey))
                .map(([sourceKey, value]) => [keyMap.get(sourceKey) || sourceKey, value]),
        );
        const mappedPersonas = remapRecord(importedPersonas);
        keyMap.forEach((targetKey, sourceKey) => {
            if (targetKey === sourceKey || skippedSourceKeys.has(sourceKey) || mappedPersonas[targetKey]) return;
            const sourcePersona = this.memoryManager.getPersona(sourceKey);
            if (sourcePersona && !roomIds.has(sourceKey)) mappedPersonas[targetKey] = { ...sourcePersona, avatarUrl: null };
        });
        const mappedRooms = rawData?.rooms && Array.isArray(rawData.rooms.rooms)
            ? {
                ...rawData.rooms,
                rooms: importedRooms
                    .filter(room => room?.id && !skippedSourceKeys.has(room.id))
                    .map(room => ({
                        ...room,
                        id: keyMap.get(room.id) || room.id,
                        title: (keyMap.get(room.id) || room.id) === room.id ? room.title : `${room.title}（匯入備份）`,
                        legacySourcePersonaKey: room.legacySourcePersonaKey
                            ? keyMap.get(room.legacySourcePersonaKey) || room.legacySourcePersonaKey
                            : undefined,
                        members: Array.isArray(room.members)
                            ? room.members.map((member: any) => ({
                                ...member,
                                sourcePersonaKey: member.sourcePersonaKey
                                    ? keyMap.get(member.sourcePersonaKey) || member.sourcePersonaKey
                                    : undefined,
                            }))
                            : [],
                    })),
            }
            : rawData?.rooms;
        const mappedHistories = remapRecord(importedHistories);
        const currentPhotoAssetIds = new Set<string>();
        const currentAttachmentAssetIds = new Set<string>();
        Object.values(currentHistories).forEach(history => {
            history.forEach(message => {
                const photoAssetId = message.content.imageAssetId?.trim();
                if (photoAssetId) currentPhotoAssetIds.add(photoAssetId);
                message.content.attachments?.forEach(attachment => {
                    if (attachment.assetId) currentAttachmentAssetIds.add(attachment.assetId);
                });
            });
        });

        const usedPhotoAssetIds = new Set(currentPhotoAssetIds);
        const usedAttachmentAssetIds = new Set(currentAttachmentAssetIds);
        Object.values(mappedHistories).forEach(history => {
            if (!Array.isArray(history)) return;
            history.forEach(message => {
                const photoAssetId = message?.content?.imageAssetId?.trim();
                if (photoAssetId) usedPhotoAssetIds.add(photoAssetId);
                message?.content?.attachments?.forEach((attachment: any) => {
                    if (attachment?.assetId) usedAttachmentAssetIds.add(attachment.assetId);
                });
            });
        });

        let importedMediaSequence = 0;
        const createImportedMediaId = (
            prefix: 'photo' | 'attachment',
            originalId: string,
            usedIds: Set<string>,
        ) => {
            const safeId = originalId.replace(/[^a-zA-Z0-9_-]+/gu, '_').slice(0, 48) || 'asset';
            let candidate = '';
            do {
                importedMediaSequence += 1;
                candidate = `${prefix}_import_${timestamp}_${importedMediaSequence}_${safeId}`;
            } while (usedIds.has(candidate));
            usedIds.add(candidate);
            return candidate;
        };

        const photoAssetIdMap = new Map<string, string>();
        const attachmentAssetIdMap = new Map<string, string>();
        Object.values(mappedHistories).forEach(history => {
            if (!Array.isArray(history)) return;
            history.forEach(message => {
                const photoAssetId = message?.content?.imageAssetId?.trim();
                if (photoAssetId && currentPhotoAssetIds.has(photoAssetId)) {
                    let mappedId = photoAssetIdMap.get(photoAssetId);
                    if (!mappedId) {
                        mappedId = createImportedMediaId('photo', photoAssetId, usedPhotoAssetIds);
                        photoAssetIdMap.set(photoAssetId, mappedId);
                    }
                    message.content.imageAssetId = mappedId;
                }

                message?.content?.attachments?.forEach((attachment: any) => {
                    const attachmentAssetId = attachment?.assetId?.trim();
                    if (!attachmentAssetId || !currentAttachmentAssetIds.has(attachmentAssetId)) return;
                    let mappedId = attachmentAssetIdMap.get(attachmentAssetId);
                    if (!mappedId) {
                        mappedId = createImportedMediaId(
                            'attachment',
                            attachmentAssetId,
                            usedAttachmentAssetIds,
                        );
                        attachmentAssetIdMap.set(attachmentAssetId, mappedId);
                    }
                    attachment.assetId = mappedId;
                });
            });
        });

        const importedMessages = Object.values(mappedHistories)
            .reduce((total: number, history: any) => total + (Array.isArray(history) ? history.length : 0), 0);

        return {
            data: {
                ...rawData,
                customPersonas: mappedPersonas,
                chatHistories: mappedHistories,
                diaries: remapRecord(importedDiaries),
                interests: remapRecord(importedInterests),
                rooms: mappedRooms,
            },
            keyMap,
            skippedSourceKeys,
            photoAssetIdMap,
            attachmentAssetIdMap,
            summary: { importedMessages, renamedConflicts, skippedDuplicates },
        };
    }

    private prepareReplacementImport(rawData: any): PreparedImport {
        const histories = rawData?.chatHistories && typeof rawData.chatHistories === 'object'
            ? rawData.chatHistories as Record<string, ChatMessage[]>
            : {};
        const roomIds = Array.isArray(rawData?.rooms?.rooms)
            ? rawData.rooms.rooms.map((room: any) => String(room?.id || '')).filter(Boolean)
            : [];
        const sourceKeys = new Set([
            ...Object.keys(rawData?.customPersonas || {}),
            ...Object.keys(histories),
            ...roomIds,
        ]);
        return {
            data: rawData,
            keyMap: new Map([...sourceKeys].map(key => [key, key])),
            skippedSourceKeys: new Set(),
            photoAssetIdMap: new Map(),
            attachmentAssetIdMap: new Map(),
            summary: {
                importedMessages: Object.values(histories)
                    .reduce((total, history) => total + (Array.isArray(history) ? history.length : 0), 0),
                renamedConflicts: 0,
                skippedDuplicates: 0,
            },
        };
    }

    private createExportSafeRooms(roomId?: string) {
        if (!this.roomManager) return undefined;
        const exported = this.roomManager.exportData();
        return {
            ...exported,
            rooms: exported.rooms
                .filter(room => !roomId || room.id === roomId)
                .map(room => ({
                    ...room,
                    members: room.members.map(member => ({
                        ...member,
                        persona: this.createExportSafePersona(member.persona),
                    })),
                })),
        };
    }

    getLastBackupMediaSummary() {
        return this.lastBackupMediaSummary ? { ...this.lastBackupMediaSummary } : null;
    }

    private createExportSafePersona(persona: any) {
        if (!persona) {
            return persona;
        }

        // Data-URL avatars are exported as binary files under /avatars,
        // so removing the inline base64 copy keeps JSON exports much smaller.
        if (typeof persona.avatarUrl === 'string' && persona.avatarUrl.startsWith('data:image')) {
            return {
                ...persona,
                avatarUrl: null,
            };
        }

        return { ...persona };
    }

    private getExportedAppSettings() {
        return Object.fromEntries(PERSISTED_APP_SETTING_KEYS.flatMap(key => {
            const value = localStorage.getItem(key);
            return value === null ? [] : [[key, value]];
        }));
    }

    private restoreAppSettings(value: unknown) {
        restorePersistedAppSettings(value);
    }

    private captureAppSettingsSnapshot() {
        return Object.fromEntries(
            PERSISTED_APP_SETTING_KEYS.map(key => [key, localStorage.getItem(key)]),
        ) as Record<string, string | null>;
    }

    private restoreAppSettingsSnapshot(snapshot: Record<string, string | null>) {
        PERSISTED_APP_SETTING_KEYS.forEach(key => {
            const value = snapshot[key];
            if (value === null || value === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, value);
        });
    }

    private createImportTransactionSnapshot(): ImportTransactionSnapshot {
        return {
            memory: this.memoryManager.createImportSnapshot(),
            rooms: this.roomManager?.createImportSnapshot(),
            appSettings: this.captureAppSettingsSnapshot(),
            avatarAssets: new Map(),
            photoAssets: new Map(),
            attachmentAssets: new Map(),
        };
    }

    private async rememberAvatarAsset(snapshot: ImportTransactionSnapshot, key: string) {
        if (snapshot.avatarAssets.has(key)) return;
        snapshot.avatarAssets.set(key, await getPersonaAvatarAsset(key) || null);
    }

    private async rememberPhotoAsset(snapshot: ImportTransactionSnapshot, id: string) {
        if (snapshot.photoAssets.has(id)) return;
        snapshot.photoAssets.set(id, await getCharacterPhotoAsset(id) || null);
    }

    private async rememberAttachmentAsset(snapshot: ImportTransactionSnapshot, id: string) {
        if (snapshot.attachmentAssets.has(id)) return;
        snapshot.attachmentAssets.set(id, await getChatAttachment(id) || null);
    }

    private async rollbackImportTransaction(snapshot: ImportTransactionSnapshot) {
        const rollbackErrors: unknown[] = [];
        const attempt = async (operation: () => Promise<void> | void) => {
            try {
                await operation();
            } catch (error) {
                rollbackErrors.push(error);
            }
        };

        for (const [key, asset] of snapshot.avatarAssets) {
            await attempt(async () => {
                if (asset) await savePersonaAvatarBlob(key, asset.blob, asset.updatedAt);
                else await deletePersonaAvatar(key);
            });
        }
        for (const [id, asset] of snapshot.photoAssets) {
            await attempt(async () => {
                if (asset) await saveCharacterPhotoAsset(asset);
                else await deleteCharacterPhotoAsset(id);
            });
        }
        for (const [id, asset] of snapshot.attachmentAssets) {
            await attempt(async () => {
                if (asset) await saveChatAttachment(asset);
                else await deleteChatAttachment(id);
            });
        }

        if (snapshot.rooms && this.roomManager) {
            await attempt(() => this.roomManager!.restoreImportSnapshot(snapshot.rooms!));
        }
        await attempt(() => this.memoryManager.restoreImportSnapshot(snapshot.memory));
        await attempt(() => this.restoreAppSettingsSnapshot(snapshot.appSettings));

        if (rollbackErrors.length) {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('wetapp-storage-failed'));
            }
            throw new AggregateError(rollbackErrors, 'Import rollback was incomplete.');
        }
    }

    private async awaitImportTasks(tasks: Promise<void>[]) {
        const results = await Promise.allSettled(tasks);
        const failed = results.find(
            (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failed) throw failed.reason;
    }

    private async runImportTransaction<T>(
        operation: (snapshot: ImportTransactionSnapshot) => Promise<T>,
    ): Promise<T> {
        const snapshot = this.createImportTransactionSnapshot();
        const cloudBatch = beginLocalCloudChangeBatch();
        try {
            const result = await operation(snapshot);
            cloudBatch.close(true);
            return result;
        } catch (error) {
            try {
                await this.rollbackImportTransaction(snapshot);
                cloudBatch.close(false);
            } catch (rollbackError) {
                cloudBatch.close(false);
                console.error('Import rollback failed:', rollbackError);
                throw new AggregateError(
                    [error, rollbackError],
                    '匯入失敗，而且部分原有資料無法自動回復。請保持此頁開啟並立即匯出備份。',
                );
            }
            throw error;
        }
    }

    private async addRoomAvatarsToZip(zip: any, roomId?: string) {
        if (!this.roomManager) return;
        const folder = zip.folder('room-avatars');
        if (!folder) return;
        const rooms = this.roomManager.exportData().rooms.filter(room => !roomId || room.id === roomId);

        await Promise.all(rooms.flatMap(room => room.members.map(async member => {
            const sourcePersona = member.sourcePersonaKey
                ? this.memoryManager.getPersona(member.sourcePersonaKey)
                : null;
            const avatarUrl = member.persona.avatarUrl || sourcePersona?.avatarUrl;
            if (!avatarUrl?.startsWith('data:image')) return;
            const response = await fetch(avatarUrl);
            const blob = await response.blob();
            const extension = blob.type.split('/')[1] || 'png';
            folder.file(`${room.id}/${member.id}.${extension}`, blob);
        })));
    }

    private async restoreRoomAvatarsFromZip(
        zip: any,
        keyMap: Map<string, string> = new Map(),
        skippedSourceKeys: Set<string> = new Set(),
        transaction?: ImportTransactionSnapshot,
    ) {
        if (!this.roomManager) return;
        const folder = zip.folder('room-avatars');
        if (!folder) return;
        const tasks: Promise<void>[] = [];

        folder.forEach((relativePath: string, fileEntry: any) => {
            if (fileEntry.dir) return;
            const parts = relativePath.split('/').filter(Boolean);
            if (parts.length < 2) return;
            const sourceRoomId = parts[0];
            if (skippedSourceKeys.has(sourceRoomId)) return;
            const roomId = keyMap.get(sourceRoomId) || sourceRoomId;
            const fileName = parts.at(-1)!;
            const memberId = fileName.replace(/\.[^.]+$/u, '');
            const extension = fileName.split('.').at(-1)?.toLowerCase();
            const fallbackMimeType = ({
                png: 'image/png',
                webp: 'image/webp',
                gif: 'image/gif',
                avif: 'image/avif',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
            } as Record<string, string>)[extension || ''] || 'image/jpeg';
            tasks.push(fileEntry.async('base64').then(async (base64: string) => {
                if (!this.roomManager?.getMember(roomId, memberId)) return;
                if (transaction) {
                    await this.rememberAvatarAsset(transaction, roomAvatarStorageKey(roomId, memberId));
                }
                await this.roomManager.setMemberAvatar(
                    roomId,
                    memberId,
                    `data:${fallbackMimeType};base64,${base64}`,
                );
            }));
        });
        await this.awaitImportTasks(tasks);
    }

    private async addCharacterPhotosToZip(
        zip: any,
        chatHistories: { [key: string]: ChatMessage[] },
    ): Promise<BackupMediaSummary> {
        const folder = zip.folder('photos');
        const summary: BackupMediaSummary = {
            referencedPhotos: 0,
            embeddedPhotos: 0,
            migratedLegacyPhotos: 0,
            recoveredOrphanPhotos: 0,
            unavailablePhotos: 0,
        };
        if (!folder) return summary;

        const exportedIds = new Set<string>();
        const legacyIdsByUrl = new Map<string, string>();
        let legacySequence = 0;

        for (const [personaKey, history] of Object.entries(chatHistories)) {
            for (const message of history) {
                const content = message?.content;
                const imageUrl = content?.imageUrl?.trim();
                const originalAssetId = content?.imageAssetId?.trim();
                if (!imageUrl && !originalAssetId) continue;
                summary.referencedPhotos += 1;

                const reusedLegacyId = imageUrl ? legacyIdsByUrl.get(imageUrl) : undefined;
                let assetId = originalAssetId || reusedLegacyId;
                if (assetId && exportedIds.has(assetId)) {
                    content.imageAssetId = assetId;
                    delete content.imageUrl;
                    continue;
                }

                let blob: Blob | null = null;
                if (originalAssetId) {
                    try {
                        blob = await getCharacterPhotoBlob(originalAssetId);
                    } catch (error) {
                        console.warn('Unable to read a stored character photo while backing up.', error);
                    }
                }

                let migratedFromLegacyUrl = false;
                if (!blob && imageUrl) {
                    try {
                        const response = await fetch(imageUrl, { cache: 'force-cache' });
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const fetched = await response.blob();
                        if (!fetched.size) throw new Error('Empty image');
                        blob = fetched;
                        migratedFromLegacyUrl = true;
                    } catch (error) {
                        console.warn('Unable to embed a legacy character photo while backing up.', error);
                    }
                }

                if (!blob?.size) {
                    summary.unavailablePhotos += 1;
                    continue;
                }

                if (!assetId) {
                    legacySequence += 1;
                    assetId = `legacy-photo-${Date.now()}-${legacySequence}-${Math.random().toString(36).slice(2, 8)}`;
                }
                const encodedPersonaKey = encodeURIComponent(personaKey);
                folder.file(`${encodedPersonaKey}/${assetId}.${photoExtension(blob.type)}`, blob);
                exportedIds.add(assetId);
                summary.embeddedPhotos += 1;
                if (migratedFromLegacyUrl) summary.migratedLegacyPhotos += 1;
                if (imageUrl) legacyIdsByUrl.set(imageUrl, assetId);

                content.imageAssetId = assetId;
                delete content.imageUrl;
            }
        }

        // A photo blob is saved before its chat message. If localStorage is full,
        // the blob survives in IndexedDB while its message disappears on reload.
        // Preserve and re-index those orphaned assets in the archive copy only.
        if (typeof indexedDB !== 'undefined') {
            const storedAssets = await listCharacterPhotoAssets();
            for (const asset of storedAssets) {
                if (!asset?.id || exportedIds.has(asset.id) || !asset.blob?.size) continue;
                const personaKey = asset.personaKey === 'custom_seed_cc' && this.memoryManager.getPersona('cc')
                    ? 'cc'
                    : asset.personaKey || 'recovered-photos';
                const encodedPersonaKey = encodeURIComponent(personaKey);
                folder.file(`${encodedPersonaKey}/${asset.id}.${photoExtension(asset.blob.type)}`, asset.blob);
                exportedIds.add(asset.id);
                summary.embeddedPhotos += 1;
                summary.recoveredOrphanPhotos += 1;

                const history = (chatHistories[personaKey] ||= []);
                if (!history.some(message => message.content.imageAssetId === asset.id)) {
                    history.push({
                        id: `recovered-${asset.id}`,
                        createdAt: asset.createdAt || Date.now(),
                        role: 'model',
                        content: {
                            text: '從本機照片庫救回的舊照片',
                            imageAssetId: asset.id,
                            imagePrompt: asset.prompt || '',
                            legacy: true,
                        },
                    });
                }
            }
        }

        return summary;
    }

    private async restoreCharacterPhotosFromZip(
        zip: any,
        keyMap: Map<string, string> = new Map(),
        assetIdMap: Map<string, string> = new Map(),
        skippedSourceKeys: Set<string> = new Set(),
        transaction?: ImportTransactionSnapshot,
    ) {
        const folder = zip.folder('photos');
        if (!folder) return;

        const photoMetaByAssetId = new Map<string, { personaKey: string; prompt: string }>();
        Object.entries(this.memoryManager.getAllChatHistories()).forEach(([personaKey, history]) => {
            history.forEach(message => {
                if (message.content.imageAssetId) {
                    photoMetaByAssetId.set(message.content.imageAssetId, {
                        personaKey,
                        prompt: message.content.imagePrompt || '',
                    });
                }
            });
        });

        const tasks: Promise<void>[] = [];
        folder.forEach((relativePath: string, fileEntry: any) => {
            if (fileEntry.dir) return;
            const pathParts = relativePath.split('/').filter(Boolean);
            if (pathParts.length < 2) return;
            let archivedPersonaKey = pathParts[0];
            try {
                archivedPersonaKey = decodeURIComponent(archivedPersonaKey);
            } catch {
                // Older archives used the raw conversation key.
            }
            const fileName = pathParts[pathParts.length - 1];
            const archivedAssetId = fileName.replace(/\.[^.]+$/u, '');
            const assetId = assetIdMap.get(archivedAssetId) || archivedAssetId;
            if (skippedSourceKeys.has(archivedPersonaKey) && !assetIdMap.has(archivedAssetId)) return;
            const meta = photoMetaByAssetId.get(assetId);
            const personaKey = meta?.personaKey || keyMap.get(archivedPersonaKey) || archivedPersonaKey;
            tasks.push(fileEntry.async('blob').then(async (blob: Blob) => {
                if (transaction) await this.rememberPhotoAsset(transaction, assetId);
                await saveCharacterPhotoAsset({
                    id: assetId,
                    personaKey,
                    blob,
                    prompt: meta?.prompt || '',
                    createdAt: Date.now(),
                });
            }));
        });
        await this.awaitImportTasks(tasks);
    }

    private async addChatAttachmentsToZip(
        zip: any,
        chatHistories: { [key: string]: ChatMessage[] },
    ) {
        const folder = zip.folder('attachments');
        if (!folder) return;
        const exportedIds = new Set<string>();
        const tasks: Promise<void>[] = [];
        Object.entries(chatHistories).forEach(([conversationKey, history]) => {
            history.forEach(message => {
                message.content.attachments?.forEach(attachment => {
                    if (exportedIds.has(attachment.assetId)) return;
                    exportedIds.add(attachment.assetId);
                    tasks.push((async () => {
                        const blob = await getChatAttachmentBlob(attachment.assetId);
                        if (!blob) return;
                        const extension = attachment.name.includes('.')
                            ? attachment.name.split('.').pop()
                            : blob.type.split('/')[1] || 'bin';
                        folder.file(`${conversationKey}/${attachment.assetId}.${extension}`, blob);
                    })());
                });
            });
        });
        await Promise.all(tasks);
    }

    private async restoreChatAttachmentsFromZip(
        zip: any,
        keyMap: Map<string, string> = new Map(),
        assetIdMap: Map<string, string> = new Map(),
        skippedSourceKeys: Set<string> = new Set(),
        transaction?: ImportTransactionSnapshot,
    ) {
        const folder = zip.folder('attachments');
        if (!folder) return;
        const attachmentMeta = new Map<string, { name: string; mimeType: string; conversationKey: string }>();
        Object.entries(this.memoryManager.getAllChatHistories()).forEach(([conversationKey, history]) => {
            history.forEach(message => message.content.attachments?.forEach(attachment => {
                attachmentMeta.set(attachment.assetId, {
                    name: attachment.name,
                    mimeType: attachment.mimeType,
                    conversationKey,
                });
            }));
        });
        const tasks: Promise<void>[] = [];
        folder.forEach((relativePath: string, fileEntry: any) => {
            if (fileEntry.dir) return;
            const parts = relativePath.split('/').filter(Boolean);
            if (parts.length < 2) return;
            const archivedConversationKey = parts[0];
            const archivedAssetId = parts.at(-1)!.replace(/\.[^.]+$/u, '');
            const assetId = assetIdMap.get(archivedAssetId) || archivedAssetId;
            if (
                skippedSourceKeys.has(archivedConversationKey)
                && !assetIdMap.has(archivedAssetId)
            ) return;
            const conversationKey = keyMap.get(archivedConversationKey) || archivedConversationKey;
            const meta = attachmentMeta.get(assetId);
            tasks.push(fileEntry.async('blob').then(async (blob: Blob) => {
                if (transaction) await this.rememberAttachmentAsset(transaction, assetId);
                await saveChatAttachment({
                    id: assetId,
                    conversationKey: meta?.conversationKey || conversationKey,
                    blob,
                    name: meta?.name || fileEntry.name.split('/').at(-1) || assetId,
                    mimeType: meta?.mimeType || blob.type || 'application/octet-stream',
                    createdAt: Date.now(),
                });
            }));
        });
        await this.awaitImportTasks(tasks);
    }

    private addMemoryMarkdownToZip(zip: any, roomId?: string, personaKey?: string) {
        if (roomId) {
            this.roomManager?.buildMarkdownFiles(roomId).forEach(file => zip.file(file.path, file.content));
        } else if (!personaKey) {
            this.roomManager?.buildMarkdownFiles().forEach(file => zip.file(file.path, file.content));
        }
        if (personaKey) {
            this.memoryManager.buildPersonaMarkdownFiles(personaKey).forEach(file => zip.file(file.path, file.content));
        } else if (!roomId) {
            this.memoryManager.buildPersonaMarkdownFiles().forEach(file => zip.file(file.path, file.content));
        }
    }

    async saveCurrentChat(personaKey: string, personaName: string) {
        const chatHistory = this.memoryManager.getChatHistory(personaKey);
        const exportChatHistory = structuredClone(chatHistory);
        const persona = this.memoryManager.getPersona(personaKey);
        const room = this.roomManager?.getRoom(personaKey);
        const diaries = this.memoryManager.getDiaryEntries(personaKey);
        const interests = this.memoryManager.getInterests(personaKey);
        
        if ((!persona && !room) || chatHistory.length === 0) {
            alert("沒有對話可以儲存！");
            return;
        }

        const JSZip = await loadJsZip();
        const zip = new JSZip();
        const saveData: { [key: string]: any } = {
            backupFormatVersion: 4,
            createdAt: Date.now(),
            chatHistories: { [personaKey]: exportChatHistory },
            diaries: { [personaKey]: diaries },
            interests: { [personaKey]: interests },
            customPersonas: persona ? { [personaKey]: this.createExportSafePersona(persona) } : {},
            rooms: room ? this.createExportSafeRooms(room.id) : undefined,
        };

        const avatarUrl = persona?.avatarUrl;
        if (avatarUrl && avatarUrl.startsWith('data:image')) {
            const response = await fetch(avatarUrl);
            const blob = await response.blob();
             const extension = blob.type.split('/')[1] || 'png';
            zip.folder("avatars")?.file(`${personaKey}.${extension}`, blob);
        }

        await this.addRoomAvatarsToZip(zip, room?.id);

        const mediaSummary = await this.addCharacterPhotosToZip(zip, { [personaKey]: exportChatHistory });
        if (mediaSummary.unavailablePhotos > 0) {
            throw new Error(`有 ${mediaSummary.unavailablePhotos} 張聊天相片無法讀取，未建立不完整匯出檔。`);
        }
        await this.addChatAttachmentsToZip(zip, { [personaKey]: exportChatHistory });
        this.addMemoryMarkdownToZip(zip, room?.id, room ? undefined : personaKey);
        zip.file("all_data.json", JSON.stringify({ ...saveData, mediaSummary }, null, 2));

        const content = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        }) as Blob;
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        const timestamp = new Date().getTime();
        link.download = `${personaName}_${timestamp}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async createAllDataArchive() {
        const allChatHistories = this.memoryManager.getAllChatHistories();
        const exportChatHistories = structuredClone(allChatHistories);
        const personasToSave = this.memoryManager.getModifiedAndCustomPersonas();
        const allDiaries = this.memoryManager.getAllDiaryEntries();
        const allInterests = this.memoryManager.getAllInterests();

        if (Object.keys(allChatHistories).length === 0 && Object.keys(personasToSave).length === 0) {
            throw new Error('沒有任何對話或自訂/修改過的角色可以備份。');
        }

        const JSZip = await loadJsZip();
        const zip = new JSZip();
        const exportSafePersonas = Object.fromEntries(
            Object.entries(personasToSave).map(([key, persona]) => [key, this.createExportSafePersona(persona)]),
        );

        const saveData = {
            backupFormatVersion: 4,
            createdAt: Date.now(),
            chatHistories: exportChatHistories,
            customPersonas: exportSafePersonas,
            diaries: allDiaries,
            interests: allInterests,
            rooms: this.createExportSafeRooms(),
            appSettings: this.getExportedAppSettings(),
        };

        const avatarFolder = zip.folder("avatars");
        if (avatarFolder) {
            const avatarPromises = [];
            const allPersonas = this.memoryManager.getAllPersonas();
            for (const key in allPersonas) {
                const persona = allPersonas[key];
                if (persona.avatarUrl && persona.avatarUrl.startsWith('data:image')) {
                    const promise = fetch(persona.avatarUrl)
                        .then(res => res.blob())
                        .then(blob => {
                            const extension = blob.type.split('/')[1] || 'png';
                            avatarFolder.file(`${key}.${extension}`, blob);
                        });
                    avatarPromises.push(promise);
                }
            }
            await Promise.all(avatarPromises);
        }

        await this.addRoomAvatarsToZip(zip);

        const mediaSummary = await this.addCharacterPhotosToZip(zip, exportChatHistories);
        this.lastBackupMediaSummary = { ...mediaSummary };
        if (mediaSummary.unavailablePhotos > 0) {
            throw new Error(
                `有 ${mediaSummary.unavailablePhotos} 張聊天相片無法讀取，因此沒有建立不完整備份。`
                + '請在原裝置保持連線、逐張打開媒體庫相片後再試。',
            );
        }
        await this.addChatAttachmentsToZip(zip, exportChatHistories);
        this.addMemoryMarkdownToZip(zip);
        zip.file("all_data.json", JSON.stringify({ ...saveData, mediaSummary }, null, 2));

        return zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        }) as Promise<Blob>;
    }

    async saveAllChats() {
        const originalText = this.ui.downloadAllChatsBtn.textContent;
        this.ui.downloadAllChatsBtn.disabled = true;
        this.ui.downloadAllChatsBtn.textContent = '打包中...';

        try {
            const content = await this.createAllDataArchive();
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().getTime();
            link.download = `all_chats_${timestamp}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            console.error("儲存所有對話錯誤:", error);
            alert(`儲存失敗: ${error}`);
        } finally {
            this.ui.downloadAllChatsBtn.disabled = false;
            this.ui.downloadAllChatsBtn.textContent = originalText;
        }
    }

    async downloadImages(personaKey: string, personaName: string) {
        const chatHistory = this.memoryManager.getChatHistory(personaKey);
        const imageMessages = chatHistory.filter(msg => msg.content.imageUrl || msg.content.imageAssetId);

        if (imageMessages.length === 0) {
            alert("對話中沒有圖片可以下載！");
            return;
        }

        const originalText = this.ui.downloadImagesBtn.textContent;
        this.ui.downloadImagesBtn.disabled = true;
        this.ui.downloadImagesBtn.textContent = '打包中...';

        try {
            const JSZip = await loadJsZip();
        const zip = new JSZip();

            await Promise.all(imageMessages.map(async (msg, index) => {
                let blob: Blob | null = null;
                if (msg.content.imageAssetId) {
                    blob = await getCharacterPhotoBlob(msg.content.imageAssetId);
                } else if (msg.content.imageUrl) {
                    const response = await fetch(msg.content.imageUrl);
                    if (!response.ok) throw new Error(`Image download failed with HTTP ${response.status}.`);
                    blob = await response.blob();
                }
                if (!blob) throw new Error('A selected image is no longer available.');
                const extension = blob.type.split('/')[1] || 'png';
                zip.file(`image_${index + 1}.${extension}`, blob);
            }));

            const content = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 },
            }) as Blob;
            const url = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().getTime();
            link.download = `${personaName}_images_${timestamp}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            console.error("圖片下載錯誤:", error);
            alert(`圖片打包失敗: ${error}`);
        } finally {
            this.ui.downloadImagesBtn.disabled = false;
            this.ui.downloadImagesBtn.textContent = originalText;
        }
    }

    private collectReferencedHistoryMedia(chatHistories: Record<string, ChatMessage[]>) {
        const photos = new Set<string>();
        const attachments = new Set<string>();
        Object.values(chatHistories).forEach(history => {
            history.forEach(message => {
                const photoId = message?.content?.imageAssetId?.trim();
                if (photoId) photos.add(photoId);
                message?.content?.attachments?.forEach(attachment => {
                    const assetId = attachment?.assetId?.trim();
                    if (assetId) attachments.add(assetId);
                });
            });
        });
        return { photos, attachments };
    }

    private async cleanupUnusedReplacementHistoryMedia(snapshot: MemoryImportSnapshot) {
        const before = this.collectReferencedHistoryMedia(snapshot.chatHistories);
        const after = this.collectReferencedHistoryMedia(this.memoryManager.getAllChatHistories());
        const tasks: Array<Promise<void>> = [];

        before.photos.forEach(id => {
            if (after.photos.has(id)) return;
            tasks.push((async () => {
                try {
                    if (await getCharacterPhotoAsset(id)) await deleteCharacterPhotoAsset(id);
                } catch (error) {
                    console.warn(`Failed to remove unused replaced character photo ${id}:`, error);
                }
            })());
        });

        before.attachments.forEach(id => {
            if (after.attachments.has(id)) return;
            tasks.push((async () => {
                try {
                    if (await getChatAttachment(id)) await deleteChatAttachment(id);
                } catch (error) {
                    console.warn(`Failed to remove unused replaced chat attachment ${id}:`, error);
                }
            })());
        });

        await Promise.all(tasks);
    }

    private async preflightArchiveMedia(zip: any) {
        const entries: any[] = [];
        const standaloneAvatar = zip.file("avatar.png");
        if (standaloneAvatar && !standaloneAvatar.dir) entries.push(standaloneAvatar);

        ['avatars', 'room-avatars', 'photos', 'attachments'].forEach(folderName => {
            const folder = zip.folder(folderName);
            if (!folder) return;
            folder.forEach((_relativePath: string, fileEntry: any) => {
                if (!fileEntry.dir) entries.push(fileEntry);
            });
        });

        for (const fileEntry of entries) {
            await fileEntry.async('uint8array');
        }
    }

    private async restoreLoadedZip(zip: any, replaceExisting = false) {
        const allDataFile = zip.file("all_data.json");
        if (allDataFile) {
            const allDataString = await allDataFile.async("string");
            const rawAllData = JSON.parse(allDataString);

            if (rawAllData.stories && !rawAllData.diaries) {
                rawAllData.diaries = {};
                for (const key in rawAllData.stories) {
                    rawAllData.diaries[key] = rawAllData.stories[key].map((content: string, index: number) => ({
                        title: `導入的章節 ${index + 1}`,
                        content,
                    }));
                }
                delete rawAllData.stories;
            }

            const prepared = replaceExisting
                ? this.prepareReplacementImport(rawAllData)
                : this.prepareMergeSafeImport(rawAllData);
            const allData = prepared.data;
            await this.preflightArchiveMedia(zip);
            const commitBatch = beginLocalCloudChangeBatch();
            let committedSnapshot!: {
                memory: MemoryImportSnapshot;
                rooms?: RoomImportSnapshot;
            };
            try {
                committedSnapshot = await this.runImportTransaction(async transaction => {
                    this.callbacks.beforeAllDataRestore?.();
                    this.memoryManager.loadAllData(allData, replaceExisting);
                    this.roomManager?.importData(allData.rooms, replaceExisting, false, true);

                    const avatarFolder = zip.folder("avatars");
                    if (avatarFolder) {
                        const avatarPromises: Promise<void>[] = [];
                        avatarFolder.forEach((relativePath: string, fileEntry: any) => {
                            const sourceKey = relativePath.split('.')[0];
                            if (prepared.skippedSourceKeys.has(sourceKey)) return;
                            const key = prepared.keyMap.get(sourceKey) || sourceKey;
                            if (this.memoryManager.getPersona(key) && !fileEntry.dir) {
                                avatarPromises.push(fileEntry.async("base64").then(async (base64: string) => {
                                    const mimeType = fileEntry.name.endsWith('png') ? 'image/png' : 'image/jpeg';
                                    await this.rememberAvatarAsset(transaction, key);
                                    await this.memoryManager.setPersonaAvatar(key, `data:${mimeType};base64,${base64}`);
                                }));
                            }
                        });
                        await this.awaitImportTasks(avatarPromises);
                    }

                    await this.restoreRoomAvatarsFromZip(
                        zip,
                        prepared.keyMap,
                        prepared.skippedSourceKeys,
                        transaction,
                    );
                    await this.restoreCharacterPhotosFromZip(
                        zip,
                        prepared.keyMap,
                        prepared.photoAssetIdMap,
                        prepared.skippedSourceKeys,
                        transaction,
                    );
                    await this.restoreChatAttachmentsFromZip(
                        zip,
                        prepared.keyMap,
                        prepared.attachmentAssetIdMap,
                        prepared.skippedSourceKeys,
                        transaction,
                    );
                    this.restoreAppSettings(rawAllData.appSettings);
                    return {
                        memory: transaction.memory,
                        rooms: transaction.rooms,
                    };
                });

                await this.memoryManager.cleanupUnusedImportSnapshotAvatars(committedSnapshot.memory);
                if (committedSnapshot.rooms && this.roomManager) {
                    await this.roomManager.cleanupUnusedImportSnapshotAvatars(committedSnapshot.rooms);
                }
                if (replaceExisting) {
                    await this.cleanupUnusedReplacementHistoryMedia(committedSnapshot.memory);
                }
            } finally {
                commitBatch.close(true);
            }
            try {
                this.callbacks.onAllDataRestored(prepared.summary);
            } catch (error) {
                console.error('All-data restore completion UI failed:', error);
            }
            return;
        }

        const historyFile = zip.file("history.json");
        if (historyFile) {
            const historyString = await historyFile.async("string");
            if (!historyString.trim()) throw new Error("history.json 檔案是空的");

            const historyData = JSON.parse(historyString);
            const { personaKey, history, personaData } = historyData;
            if (typeof personaKey !== 'string' || !personaKey.trim()) {
                throw new Error("無效的角色鍵值或角色資料遺失");
            }
            if (!Array.isArray(history)) throw new Error("對話歷史格式錯誤");
            const dataToLoad: any = {
                customPersonas: personaData ? { [personaKey]: personaData } : {},
                chatHistories: { [personaKey]: history },
                diaries: historyData.stories || {},
                interests: historyData.interests || {},
            };
            const prepared = this.prepareMergeSafeImport(dataToLoad);
            const mappedPersonaKey = prepared.keyMap.get(personaKey) || personaKey;
            const mappedHistory = prepared.data.chatHistories[mappedPersonaKey]
                || this.memoryManager.peekChatHistory(mappedPersonaKey);
            const mappedPersona = prepared.data.customPersonas?.[mappedPersonaKey]
                || this.memoryManager.getPersona(mappedPersonaKey);
            if (!mappedPersonaKey || !mappedPersona) {
                throw new Error("無效的角色鍵值或角色資料遺失");
            }
            await this.preflightArchiveMedia(zip);
            await this.runImportTransaction(async transaction => {
                this.memoryManager.loadAllData(prepared.data);

                const avatarFile = zip.file("avatar.png");
                if (avatarFile && !prepared.skippedSourceKeys.has(personaKey)) {
                    const base64 = await avatarFile.async("base64");
                    await this.rememberAvatarAsset(transaction, mappedPersonaKey);
                    await this.memoryManager.setPersonaAvatar(
                        mappedPersonaKey,
                        `data:image/png;base64,${base64}`,
                    );
                }

                await this.restoreRoomAvatarsFromZip(
                    zip,
                    prepared.keyMap,
                    prepared.skippedSourceKeys,
                    transaction,
                );
                await this.restoreCharacterPhotosFromZip(
                    zip,
                    prepared.keyMap,
                    prepared.photoAssetIdMap,
                    prepared.skippedSourceKeys,
                    transaction,
                );
                await this.restoreChatAttachmentsFromZip(
                    zip,
                    prepared.keyMap,
                    prepared.attachmentAssetIdMap,
                    prepared.skippedSourceKeys,
                    transaction,
                );
            });
            try {
                this.callbacks.onSingleChatRestored(mappedPersonaKey, mappedHistory);
            } catch (error) {
                console.error('Single-chat restore completion UI failed:', error);
            }
            return;
        }

        throw new Error("ZIP 檔案中找不到有效的對話紀錄檔 (all_data.json 或 history.json)");
    }

    async restoreAllDataArchive(blob: Blob, askForConfirmation = true, replaceExisting = false) {
        if (askForConfirmation && !window.confirm(
            '將以安全合併方式匯入：不會刪除現有聊天室；若同一角色已有不同內容，匯入資料會另存為備份副本。要繼續嗎？',
        )) return false;

        const JSZip = await loadJsZip();
        const zip = await JSZip.loadAsync(blob);
        await this.restoreLoadedZip(zip, replaceExisting);
        return true;
    }

    async handleZipUpload(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        try {
            await this.restoreAllDataArchive(file);
        } catch (error) {
            alert(`讀取檔案失敗: ${error}`);
            console.error("ZIP 上傳錯誤:", error);
        } finally {
            input.value = '';
        }
    }
}