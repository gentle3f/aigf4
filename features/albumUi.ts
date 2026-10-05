import type { ChatAttachment, ChatMessage, Content } from '../managers.js';
import {
    deleteCharacterPhotoAsset,
    getCharacterPhotoBlob,
    listCharacterPhotoAssets,
} from '../photoStore.js';
import { loadJsZip } from '../jsZipLoader.js';

type AlbumPhoto = {
    imageUrl?: string;
    imageAssetId?: string;
    caption: string;
    prompt: string;
    historyIndex: number | null;
    createdAt: number;
    recoveredFromStore?: boolean;
    content: Content;
};

export type AlbumUiHandle = {
    open: () => Promise<void>;
    refresh: () => void;
    isOpen: () => boolean;
};

export type AlbumUiDependencies = {
    getContext: () => {
        conversationKey: string | null;
        personaName: string | null;
        roomTitle: string | null;
    };
    getHistory: (conversationKey: string) => ChatMessage[];
    getPersonaName: (conversationKey: string) => string | undefined;
    setHistoryWithoutIndices: (conversationKey: string, indices: number[]) => void;
    getContentImageUrl: (content: Content) => Promise<string | null>;
    openPhoto: (imageUrl: string, content: Content, conversationKey: string | null) => void;
    createAttachmentCard: (attachment: ChatAttachment) => HTMLElement;
    revokePhotoObjectUrl: (assetId: string) => void;
    refreshChat: (conversationKey: string) => void;
    hideMoreOptionsMenu: () => void;
};

const albumModal = document.getElementById('album-modal')!;
const closeAlbumModalBtn = document.getElementById('close-album-modal')!;
const albumModalTitle = document.getElementById('album-modal-title')!;
const albumGridContainer = document.getElementById('album-grid-container')!;
const albumActions = document.getElementById('album-actions')!;
const albumSelectAll = document.getElementById('album-select-all') as HTMLInputElement;
const albumMainButtons = document.getElementById('album-main-buttons')!;
const albumDownloadBtn = document.getElementById('album-download-btn') as HTMLButtonElement;
const albumDeleteBtn = document.getElementById('album-delete-btn') as HTMLButtonElement;
const deleteConfirmationSection = document.getElementById('delete-confirmation-section')!;
const confirmDeleteBtn = document.getElementById('confirm-delete-btn') as HTMLButtonElement;
const cancelDeleteBtn = document.getElementById('cancel-delete-btn') as HTMLButtonElement;

export const createAlbumUi = (dependencies: AlbumUiDependencies): AlbumUiHandle => {
    let albumPhotos: AlbumPhoto[] = [];
    let albumAttachments: ChatAttachment[] = [];
    const selectedPhotoIndices = new Set<number>();

    const isOpen = () => !albumModal.classList.contains('hidden');

    const showMainAlbumButtons = () => {
        albumMainButtons.classList.remove('hidden');
        deleteConfirmationSection.classList.add('hidden');
        deleteConfirmationSection.classList.remove('flex');
    };

    const updateAlbumActionButtons = () => {
        const hasSelection = selectedPhotoIndices.size > 0;
        albumDownloadBtn.disabled = !hasSelection;
        albumDeleteBtn.disabled = !hasSelection;
        albumSelectAll.checked = albumPhotos.length > 0 && selectedPhotoIndices.size === albumPhotos.length;
    };

    const updateAlbumState = () => {
        const { conversationKey } = dependencies.getContext();
        if (!conversationKey) return;
        const history = dependencies.getHistory(conversationKey);
        albumPhotos = history
            .map((msg, index) => ({ ...msg, historyIndex: index }))
            .filter(msg => msg.content.imageUrl || msg.content.imageAssetId)
            .map(msg => ({
                imageUrl: msg.content.imageUrl,
                imageAssetId: msg.content.imageAssetId,
                caption: msg.content.text || '',
                prompt: msg.content.imagePrompt || msg.content.text || '',
                historyIndex: msg.historyIndex,
                createdAt: msg.createdAt || msg.historyIndex,
                content: msg.content,
            }));
        albumAttachments = history.flatMap(message => message.content.attachments || []);
        albumDownloadBtn.disabled = true;
        albumDeleteBtn.disabled = true;
        albumSelectAll.checked = false;
        selectedPhotoIndices.clear();
        showMainAlbumButtons();
    };

    const renderAlbum = () => {
        const context = dependencies.getContext();
        if (!context.personaName) return;
        albumModalTitle.textContent = `${context.roomTitle || context.personaName} 的媒體`;
        albumGridContainer.innerHTML = '';

        if (albumPhotos.length === 0 && albumAttachments.length === 0) {
            albumGridContainer.innerHTML = '<p class="text-gray-400 col-span-full text-center py-8">目前還沒有照片、文件或影片附件。</p>';
            albumActions.classList.add('hidden');
            return;
        }
        albumActions.classList.toggle('hidden', albumPhotos.length === 0);

        albumPhotos.forEach((photo, index) => {
            const thumb = document.createElement('div');
            thumb.className = 'album-thumbnail';
            const image = document.createElement('img');
            image.alt = `${context.personaName} 的照片 ${index + 1}`;
            image.className = 'w-full h-full object-cover is-loading';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'thumbnail-checkbox form-checkbox h-5 w-5 text-yellow-500 bg-gray-900/50 border-gray-500 focus:ring-yellow-400 rounded';
            thumb.append(image, checkbox);
            void dependencies.getContentImageUrl(photo.content)
                .then(imageUrl => {
                    if (!imageUrl || !image.isConnected) return;
                    image.src = imageUrl;
                    image.classList.remove('is-loading');
                })
                .catch(error => {
                    image.classList.remove('is-loading');
                    image.title = '照片載入失敗';
                    console.warn('Unable to load album thumbnail:', error);
                });

            thumb.addEventListener('click', event => {
                if (event.target === checkbox) return;
                void dependencies.getContentImageUrl(photo.content)
                    .then(imageUrl => {
                        if (!imageUrl) return;
                        dependencies.openPhoto(
                            imageUrl,
                            photo.content,
                            dependencies.getContext().conversationKey,
                        );
                    })
                    .catch(error => console.warn('Unable to open album photo:', error));
            });

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    selectedPhotoIndices.add(index);
                    thumb.classList.add('selected');
                } else {
                    selectedPhotoIndices.delete(index);
                    thumb.classList.remove('selected');
                }
                updateAlbumActionButtons();
            });
            albumGridContainer.appendChild(thumb);
        });

        if (albumAttachments.length > 0) {
            const attachmentSection = document.createElement('section');
            attachmentSection.className = 'album-attachment-section';
            const heading = document.createElement('h3');
            heading.textContent = `文件與附件 (${albumAttachments.length})`;
            attachmentSection.appendChild(heading);
            albumAttachments.forEach(attachment => {
                attachmentSection.appendChild(dependencies.createAttachmentCard(attachment));
            });
            albumGridContainer.appendChild(attachmentSection);
        }
    };

    const mergeStoredPhotosIntoAlbum = async (conversationKey: string) => {
        const personaName = dependencies.getPersonaName(conversationKey);
        const isCcConversation = personaName?.trim().toLocaleLowerCase() === 'cc';
        const storedAssets = isCcConversation
            ? (await listCharacterPhotoAssets()).filter(asset => (
                asset.personaKey === conversationKey
                || asset.personaKey === 'cc'
                || asset.personaKey === 'custom_seed_cc'
            ))
            : await listCharacterPhotoAssets(conversationKey);
        if (dependencies.getContext().conversationKey !== conversationKey) return;

        const knownAssetIds = new Set(albumPhotos.map(photo => photo.imageAssetId).filter(Boolean));
        storedAssets.forEach(asset => {
            if (!asset.id || knownAssetIds.has(asset.id)) return;
            const content: Content = {
                text: '從本機照片庫救回的舊照片',
                imageAssetId: asset.id,
                imagePrompt: asset.prompt || '',
                legacy: true,
            };
            albumPhotos.push({
                imageAssetId: asset.id,
                caption: content.text || '',
                prompt: asset.prompt || '',
                historyIndex: null,
                createdAt: asset.createdAt || 0,
                recoveredFromStore: true,
                content,
            });
            knownAssetIds.add(asset.id);
        });
        albumPhotos.sort((left, right) => left.createdAt - right.createdAt);
    };

    const refresh = () => {
        if (!isOpen()) return;
        updateAlbumState();
        renderAlbum();
    };

    const toggleSelectAllPhotos = () => {
        const checkboxes = albumGridContainer.querySelectorAll('.thumbnail-checkbox') as NodeListOf<HTMLInputElement>;
        const thumbnails = albumGridContainer.querySelectorAll('.album-thumbnail') as NodeListOf<HTMLElement>;
        if (albumSelectAll.checked) {
            checkboxes.forEach((checkbox, index) => {
                checkbox.checked = true;
                thumbnails[index].classList.add('selected');
                selectedPhotoIndices.add(index);
            });
        } else {
            checkboxes.forEach((checkbox, index) => {
                checkbox.checked = false;
                thumbnails[index].classList.remove('selected');
                selectedPhotoIndices.delete(index);
            });
        }
        updateAlbumActionButtons();
    };

    const downloadSelectedPhotos = async () => {
        const context = dependencies.getContext();
        if (selectedPhotoIndices.size === 0 || !context.personaName) return;
        const originalText = albumDownloadBtn.textContent;
        albumDownloadBtn.disabled = true;
        albumDownloadBtn.textContent = '下載中...';
        albumDownloadBtn.title = '';

        try {
            const JSZip = await loadJsZip();
            const zip = new JSZip();
            await Promise.all(Array.from(selectedPhotoIndices).map(async index => {
                const photo = albumPhotos[index];
                let blob: Blob | null = null;
                if (photo.imageAssetId) {
                    blob = await getCharacterPhotoBlob(photo.imageAssetId);
                } else if (photo.imageUrl) {
                    const response = await fetch(photo.imageUrl);
                    if (!response.ok) throw new Error(`Photo download failed with HTTP ${response.status}.`);
                    blob = await response.blob();
                }
                if (!blob) throw new Error('Selected photo is no longer available.');
                const extension = blob.type.split('/')[1] || 'png';
                zip.file(`photo_${index + 1}.${extension}`, blob);
            }));

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${context.personaName}_photos_${Date.now()}.zip`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            albumDownloadBtn.textContent = originalText;
        } catch (error) {
            console.error('Failed to download selected album photos:', error);
            albumDownloadBtn.textContent = '下載失敗，請重試';
            albumDownloadBtn.title = error instanceof Error ? error.message : '下載失敗';
        } finally {
            updateAlbumActionButtons();
        }
    };

    const showDeleteConfirmation = () => {
        albumMainButtons.classList.add('hidden');
        deleteConfirmationSection.classList.remove('hidden');
        deleteConfirmationSection.classList.add('flex');
    };

    const deleteSelectedPhotos = async () => {
        const { conversationKey } = dependencies.getContext();
        if (selectedPhotoIndices.size === 0 || !conversationKey) return;

        const historyIndices = Array.from(selectedPhotoIndices)
            .map(photoIndex => albumPhotos[photoIndex].historyIndex)
            .filter((historyIndex): historyIndex is number => historyIndex !== null);
        const assetIds = Array.from(selectedPhotoIndices)
            .map(photoIndex => albumPhotos[photoIndex].imageAssetId)
            .filter((assetId): assetId is string => Boolean(assetId));

        if (historyIndices.length > 0) dependencies.setHistoryWithoutIndices(conversationKey, historyIndices);
        const deletionResults = await Promise.allSettled(assetIds.map(async assetId => {
            dependencies.revokePhotoObjectUrl(assetId);
            await deleteCharacterPhotoAsset(assetId);
        }));
        const failedDeletionCount = deletionResults.filter(result => result.status === 'rejected').length;
        if (failedDeletionCount > 0) {
            console.warn(`Failed to delete ${failedDeletionCount} album photo asset(s); chat history removal still completed.`);
        }

        updateAlbumState();
        renderAlbum();
        dependencies.refreshChat(conversationKey);
        showMainAlbumButtons();
    };

    const open = async () => {
        updateAlbumState();
        albumModal.classList.remove('hidden');
        dependencies.hideMoreOptionsMenu();
        renderAlbum();
        const { conversationKey } = dependencies.getContext();
        if (!conversationKey) return;
        try {
            await mergeStoredPhotosIntoAlbum(conversationKey);
            if (dependencies.getContext().conversationKey === conversationKey && isOpen()) renderAlbum();
        } catch (error) {
            console.warn('Unable to scan the local character photo vault:', error);
        }
    };

    const close = () => albumModal.classList.add('hidden');

    closeAlbumModalBtn.addEventListener('click', close);
    albumSelectAll.addEventListener('change', toggleSelectAllPhotos);
    albumDownloadBtn.addEventListener('click', () => { void downloadSelectedPhotos(); });
    albumDeleteBtn.addEventListener('click', showDeleteConfirmation);
    cancelDeleteBtn.addEventListener('click', showMainAlbumButtons);
    confirmDeleteBtn.addEventListener('click', () => { void deleteSelectedPhotos(); });

    return { open, refresh, isOpen };
};