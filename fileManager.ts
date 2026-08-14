// fileManager.ts
import { MemoryManager, ChatMessage, Interest } from './managers.js';
import { getCharacterPhotoBlob, saveCharacterPhotoAsset } from './photoStore.js';
import { RoomManager } from './roomManager.js';
import { getChatAttachmentBlob, saveChatAttachment } from './chatMediaStore.js';

declare var JSZip: any;

const EXPORTED_APP_SETTING_KEYS = [
    'veniceAssistantModel',
    'aigf4ChatModelSettingsV1',
    'veniceImageGenerateModel',
    'veniceImageEditModel',
    'veniceImageAdultConfirmed',
    'veniceImageSeed',
    'veniceImageSeedLocked',
    'veniceVideoImageModel',
    'veniceVideoTextModel',
    'veniceVideoAdultConfirmed',
    'aigf4RandomPersonaVariationsV2',
];

interface FileManagerCallbacks {
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
    summary: ImportSummary;
}

interface UIElements {
    downloadAllChatsBtn: HTMLButtonElement;
    downloadImagesBtn: HTMLButtonElement;
}

export interface BackupMediaSummary {
    referencedPhotos: number;
    embeddedPhotos: number;
    migratedLegacyPhotos: number;
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
            summary: { importedMessages, renamedConflicts, skippedDuplicates },
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
        return Object.fromEntries(EXPORTED_APP_SETTING_KEYS.flatMap(key => {
            const value = localStorage.getItem(key);
            return value === null ? [] : [[key, value]];
        }));
    }

    private restoreAppSettings(value: unknown) {
        if (!value || typeof value !== 'object') return;
        const settings = value as Record<string, unknown>;
        EXPORTED_APP_SETTING_KEYS.forEach(key => {
            if (typeof settings[key] === 'string') localStorage.setItem(key, settings[key]);
        });
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
            tasks.push(fileEntry.async('base64').then((base64: string) => {
                if (!this.roomManager?.getMember(roomId, memberId)) return;
                this.roomManager.updateMember(roomId, memberId, {
                    persona: { avatarUrl: `data:${fallbackMimeType};base64,${base64}` },
                });
            }));
        });
        await Promise.all(tasks);
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

        return summary;
    }

    private async restoreCharacterPhotosFromZip(
        zip: any,
        keyMap: Map<string, string> = new Map(),
    ) {
        const folder = zip.folder('photos');
        if (!folder) return;

        const promptByAssetId = new Map<string, string>();
        Object.values(this.memoryManager.getAllChatHistories()).forEach(history => {
            history.forEach(message => {
                if (message.content.imageAssetId) {
                    promptByAssetId.set(message.content.imageAssetId, message.content.imagePrompt || '');
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
            const personaKey = keyMap.get(archivedPersonaKey) || archivedPersonaKey;
            const fileName = pathParts[pathParts.length - 1];
            const assetId = fileName.replace(/\.[^.]+$/u, '');
            tasks.push(fileEntry.async('blob').then((blob: Blob) => saveCharacterPhotoAsset({
                id: assetId,
                personaKey,
                blob,
                prompt: promptByAssetId.get(assetId) || '',
                createdAt: Date.now(),
            })).then(() => undefined));
        });
        await Promise.all(tasks);
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
            const conversationKey = keyMap.get(parts[0]) || parts[0];
            const assetId = parts.at(-1)!.replace(/\.[^.]+$/u, '');
            const meta = attachmentMeta.get(assetId);
            tasks.push(fileEntry.async('blob').then((blob: Blob) => saveChatAttachment({
                id: assetId,
                conversationKey: meta?.conversationKey || conversationKey,
                blob,
                name: meta?.name || fileEntry.name.split('/').at(-1) || assetId,
                mimeType: meta?.mimeType || blob.type || 'application/octet-stream',
                createdAt: Date.now(),
            })).then(() => undefined));
        });
        await Promise.all(tasks);
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

        zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 },
        }).then((content: Blob) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            const timestamp = new Date().getTime();
            link.download = `${personaName}_${timestamp}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
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
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            const timestamp = new Date().getTime();
            link.download = `all_chats_${timestamp}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
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
            const zip = new JSZip();

            await Promise.all(imageMessages.map(async (msg, index) => {
                const blob = msg.content.imageAssetId
                    ? await getCharacterPhotoBlob(msg.content.imageAssetId)
                    : await fetch(msg.content.imageUrl!).then(response => response.blob());
                if (!blob) return;
                const extension = blob.type.split('/')[1] || 'png';
                zip.file(`image_${index + 1}.${extension}`, blob);
            }));

            zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 },
            }).then((content: Blob) => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                const timestamp = new Date().getTime();
                link.download = `${personaName}_images_${timestamp}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        } catch (error) {
            console.error("圖片下載錯誤:", error);
            alert(`圖片打包失敗: ${error}`);
        } finally {
            this.ui.downloadImagesBtn.disabled = false;
            this.ui.downloadImagesBtn.textContent = originalText;
        }
    }

    private async restoreLoadedZip(zip: any) {
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

            const prepared = this.prepareMergeSafeImport(rawAllData);
            const allData = prepared.data;
            this.memoryManager.loadAllData(allData);
            this.roomManager?.importData(allData.rooms);

            const avatarFolder = zip.folder("avatars");
            if (avatarFolder) {
                const avatarPromises: Promise<void>[] = [];
                avatarFolder.forEach((relativePath: string, fileEntry: any) => {
                    const sourceKey = relativePath.split('.')[0];
                    if (prepared.skippedSourceKeys.has(sourceKey)) return;
                    const key = prepared.keyMap.get(sourceKey) || sourceKey;
                    if (this.memoryManager.getPersona(key) && !fileEntry.dir) {
                        avatarPromises.push(fileEntry.async("base64").then((base64: string) => {
                            const mimeType = fileEntry.name.endsWith('png') ? 'image/png' : 'image/jpeg';
                            this.memoryManager.updatePersona(key, { avatarUrl: `data:${mimeType};base64,${base64}` });
                        }));
                    }
                });
                await Promise.all(avatarPromises);
            }

            await this.restoreRoomAvatarsFromZip(zip, prepared.keyMap, prepared.skippedSourceKeys);
            await this.restoreCharacterPhotosFromZip(zip, prepared.keyMap);
            await this.restoreChatAttachmentsFromZip(zip, prepared.keyMap);
            this.restoreAppSettings(rawAllData.appSettings);
            this.callbacks.onAllDataRestored(prepared.summary);
            return;
        }

        const historyFile = zip.file("history.json");
        if (historyFile) {
            const historyString = await historyFile.async("string");
            if (!historyString.trim()) throw new Error("history.json 檔案是空的");

            const historyData = JSON.parse(historyString);
            const { personaKey, history, personaData } = historyData;
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
            this.memoryManager.loadAllData(prepared.data);

            if (!mappedPersonaKey || !this.memoryManager.getPersona(mappedPersonaKey)) {
                throw new Error("無效的角色鍵值或角色資料遺失");
            }
            if (!Array.isArray(history)) throw new Error("對話歷史格式錯誤");

            const avatarFile = zip.file("avatar.png");
            if (avatarFile && !prepared.skippedSourceKeys.has(personaKey)) {
                const base64 = await avatarFile.async("base64");
                this.memoryManager.updatePersona(mappedPersonaKey, { avatarUrl: `data:image/png;base64,${base64}` });
            }

            await this.restoreRoomAvatarsFromZip(zip, prepared.keyMap, prepared.skippedSourceKeys);
            await this.restoreCharacterPhotosFromZip(zip, prepared.keyMap);
            await this.restoreChatAttachmentsFromZip(zip, prepared.keyMap);
            this.callbacks.onSingleChatRestored(mappedPersonaKey, mappedHistory);
            return;
        }

        throw new Error("ZIP 檔案中找不到有效的對話紀錄檔 (all_data.json 或 history.json)");
    }

    async restoreAllDataArchive(blob: Blob, askForConfirmation = true) {
        if (askForConfirmation && !window.confirm(
            '將以安全合併方式匯入：不會刪除現有聊天室；若同一角色已有不同內容，匯入資料會另存為備份副本。要繼續嗎？',
        )) return false;

        const zip = await JSZip.loadAsync(blob);
        await this.restoreLoadedZip(zip);
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
