// fileManager.ts
import { MemoryManager, ChatMessage, Interest } from './managers.js';
import { getCharacterPhotoBlob, saveCharacterPhotoAsset } from './photoStore.js';

declare var JSZip: any;

interface FileManagerCallbacks {
    onSingleChatRestored: (key: string, history: ChatMessage[]) => void;
    onAllDataRestored: () => void;
}

interface UIElements {
    downloadAllChatsBtn: HTMLButtonElement;
    downloadImagesBtn: HTMLButtonElement;
}

/**
 * Manages all file-related operations like saving, loading, and downloading.
 */
export class FileManager {
    private memoryManager: MemoryManager;
    private callbacks: FileManagerCallbacks;
    private ui: UIElements;

    constructor(memoryManager: MemoryManager, uiAndCallbacks: UIElements & FileManagerCallbacks) {
        this.memoryManager = memoryManager;
        this.ui = {
            downloadAllChatsBtn: uiAndCallbacks.downloadAllChatsBtn,
            downloadImagesBtn: uiAndCallbacks.downloadImagesBtn
        };
        this.callbacks = {
            onSingleChatRestored: uiAndCallbacks.onSingleChatRestored,
            onAllDataRestored: uiAndCallbacks.onAllDataRestored,
        };
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

    private async addCharacterPhotosToZip(
        zip: any,
        chatHistories: { [key: string]: ChatMessage[] },
    ) {
        const folder = zip.folder('photos');
        if (!folder) return;

        const exportedIds = new Set<string>();
        const tasks: Promise<void>[] = [];
        Object.entries(chatHistories).forEach(([personaKey, history]) => {
            history.forEach(message => {
                const assetId = message.content.imageAssetId;
                if (!assetId || exportedIds.has(assetId)) return;
                exportedIds.add(assetId);
                tasks.push((async () => {
                    const blob = await getCharacterPhotoBlob(assetId);
                    if (!blob) return;
                    const extension = blob.type.split('/')[1] || 'webp';
                    folder.file(`${personaKey}/${assetId}.${extension}`, blob);
                })());
            });
        });
        await Promise.all(tasks);
    }

    private async restoreCharacterPhotosFromZip(zip: any) {
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
            const personaKey = pathParts[0];
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

    async saveCurrentChat(personaKey: string, personaName: string) {
        const chatHistory = this.memoryManager.getChatHistory(personaKey);
        const persona = this.memoryManager.getPersona(personaKey);
        const diaries = this.memoryManager.getDiaryEntries(personaKey);
        const interests = this.memoryManager.getInterests(personaKey);
        
        if (!persona || chatHistory.length === 0) {
            alert("沒有對話可以儲存！");
            return;
        }

        const zip = new JSZip();
        const saveData: { [key: string]: any } = {
            chatHistories: { [personaKey]: chatHistory },
            diaries: { [personaKey]: diaries },
            interests: { [personaKey]: interests },
            customPersonas: { [personaKey]: this.createExportSafePersona(persona) }, // Always save the current persona state
        };

        // Using all_data.json to be consistent with the new format
        zip.file("all_data.json", JSON.stringify(saveData, null, 2));

        const avatarUrl = persona.avatarUrl;
        if (avatarUrl && avatarUrl.startsWith('data:image')) {
            const response = await fetch(avatarUrl);
            const blob = await response.blob();
             const extension = blob.type.split('/')[1] || 'png';
            zip.folder("avatars")?.file(`${personaKey}.${extension}`, blob);
        }

        await this.addCharacterPhotosToZip(zip, { [personaKey]: chatHistory });

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

    async saveAllChats() {
        const allChatHistories = this.memoryManager.getAllChatHistories();
        const personasToSave = this.memoryManager.getModifiedAndCustomPersonas();
        const allDiaries = this.memoryManager.getAllDiaryEntries();
        const allInterests = this.memoryManager.getAllInterests();

        if (Object.keys(allChatHistories).length === 0 && Object.keys(personasToSave).length === 0) {
            alert("沒有任何對話或自訂/修改過的角色可以儲存！");
            return;
        }

        const originalText = this.ui.downloadAllChatsBtn.textContent;
        this.ui.downloadAllChatsBtn.disabled = true;
        this.ui.downloadAllChatsBtn.textContent = '打包中...';

        try {
            const zip = new JSZip();
            const exportSafePersonas = Object.fromEntries(
                Object.entries(personasToSave).map(([key, persona]) => [key, this.createExportSafePersona(persona)]),
            );

            const saveData = {
                chatHistories: allChatHistories,
                customPersonas: exportSafePersonas,
                diaries: allDiaries,
                interests: allInterests,
            };

            zip.file("all_data.json", JSON.stringify(saveData, null, 2));

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

            await this.addCharacterPhotosToZip(zip, allChatHistories);

            const content = await zip.generateAsync({
                type: "blob",
                compression: "DEFLATE",
                compressionOptions: { level: 6 },
            });
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

    async handleZipUpload(event: Event) {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;

        try {
            const zip = await JSZip.loadAsync(file);
            
            // Prefer the new "all data" format
            const allDataFile = zip.file("all_data.json");
            if (allDataFile) {
                const allDataString = await allDataFile.async("string");
                const allData = JSON.parse(allDataString);

                // Quick migration for old 'stories' format to 'diaries'
                if (allData.stories && !allData.diaries) {
                    allData.diaries = {};
                    for (const key in allData.stories) {
                        allData.diaries[key] = allData.stories[key].map((content: string, index: number) => ({
                            title: `導入的章節 ${index + 1}`,
                            content: content,
                        }));
                    }
                    delete allData.stories;
                }
                
                this.memoryManager.loadAllData(allData);

                const avatarFolder = zip.folder("avatars");
                if (avatarFolder) {
                    const avatarPromises: Promise<void>[] = [];
                    avatarFolder.forEach((relativePath, fileEntry) => {
                        const key = relativePath.split('.')[0];
                        if (this.memoryManager.getPersona(key) && !fileEntry.dir) {
                            const promise = fileEntry.async("base64").then(base64 => {
                                const mimeType = fileEntry.name.endsWith('png') ? 'image/png' : 'image/jpeg';
                                this.memoryManager.updatePersona(key, { avatarUrl: `data:${mimeType};base64,${base64}` });
                            });
                            avatarPromises.push(promise);
                        }
                    });
                    await Promise.all(avatarPromises);
                }

                await this.restoreCharacterPhotosFromZip(zip);
                
                this.callbacks.onAllDataRestored();
                return;
            }

            // Fallback to old single chat format (history.json)
            const historyFile = zip.file("history.json");
            if (historyFile) {
                const historyString = await historyFile.async("string");
                if (!historyString.trim()) throw new Error("history.json 檔案是空的");

                const historyData = JSON.parse(historyString);
                const { personaKey, history, personaData } = historyData;

                // Create a structure compatible with `loadAllData`
                const dataToLoad: any = {
                    customPersonas: personaData ? { [personaKey]: personaData } : {},
                    chatHistories: { [personaKey]: history },
                    diaries: {},
                    interests: {},
                };

                 if (historyData.stories) {
                     dataToLoad.diaries = historyData.stories;
                 }
                 if (historyData.interests) {
                    dataToLoad.interests = historyData.interests;
                 }


                this.memoryManager.loadAllData(dataToLoad);

                if (!personaKey || !this.memoryManager.getPersona(personaKey)) throw new Error("無效的角色鍵值或角色資料遺失");
                if (!Array.isArray(history)) throw new Error("對話歷史格式錯誤");

                const avatarFile = zip.file("avatar.png");
                if (avatarFile) {
                    const base64 = await avatarFile.async("base64");
                    this.memoryManager.updatePersona(personaKey, { avatarUrl: `data:image/png;base64,${base64}` });
                }

                await this.restoreCharacterPhotosFromZip(zip);

                this.callbacks.onSingleChatRestored(personaKey, history);
                return;
            }

            throw new Error("ZIP 檔案中找不到有效的對話紀錄檔 (all_data.json 或 history.json)");

        } catch (error) {
            alert(`讀取檔案失敗: ${error}`);
            console.error("ZIP 上傳錯誤:", error);
        } finally {
            (event.target as HTMLInputElement).value = '';
        }
    }
}
