import type {
    CharacterPhotoProposal,
    Content,
    MemoryManager,
    Persona,
} from '../managers.js';
import {
    requestVeniceImage,
    VENICE_IMAGE_EDIT_MODEL,
    VENICE_IMAGE_GENERATE_MODEL,
} from '../veniceImage.js';
import type {
    VeniceImageMode,
    VeniceImageModelSummary,
} from '../veniceImage.js';
import { VENICE_AUTH_REQUIRED_ERROR } from '../venice.js';
import { saveCharacterPhotoAsset } from '../photoStore.js';
import { setPersistedAppSetting } from '../appSettings.js';

const IMAGE_SEED_STORAGE_KEY = 'veniceImageSeed';
const IMAGE_SEED_LOCK_STORAGE_KEY = 'veniceImageSeedLocked';

const PIXEL_IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
    '1:1': { width: 1024, height: 1024 },
    '3:2': { width: 1152, height: 768 },
    '2:3': { width: 768, height: 1152 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 },
    '4:5': { width: 896, height: 1120 },
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720, height: 1280 },
    '21:9': { width: 1280, height: 544 },
};

export type PhotoViewerContext = {
    source: 'chat' | 'album' | 'studio';
    prompt: string;
    caption: string;
    mode: VeniceImageMode;
    modelId?: string;
    modelName?: string;
    aspectRatio: string;
    resolution?: string;
    negativePrompt?: string;
    personaKey?: string;
    content?: Content;
    useAvatarReference: boolean;
    identityMode?: CharacterPhotoProposal['identityMode'];
    sourceImageBase64?: string;
    seed?: number;
};

export type PhotoViewerStudioResult = {
    id: string;
    blob: Blob;
    url: string;
    prompt: string;
    model: string;
    modelId: string;
    mode: VeniceImageMode;
    aspectRatio: string;
    resolution?: string;
    negativePrompt?: string;
    sourceImageBase64?: string;
    seed?: number;
    createdAt: Date;
};

export type PhotoViewerUiDependencies = {
    memoryManager: MemoryManager;
    getImageModels: (mode: VeniceImageMode) => VeniceImageModelSummary[];
    loadImageModels: (mode: VeniceImageMode) => Promise<unknown>;
    getCurrentPersonaName: () => string | null;
    getCurrentPersonaKey: () => string | null;
    prepareCharacterAvatarReference: (persona: Persona) => Promise<string | null>;
    getCharacterPhotoObjectUrl: (assetId: string) => Promise<string | null>;
    buildPhotoViewerContextFromContent: (
        content: Content,
        source: 'chat' | 'album',
        personaKey: string | null,
    ) => PhotoViewerContext;
    addStudioResult: (result: PhotoViewerStudioResult) => void;
    appendVisiblePhoto: (content: Content) => void;
    updateAlbumState: () => void;
    handleAuthRequired: () => void;
    syncSharedSeed: (locked: boolean, seed?: number) => void;
};

export type PhotoViewerUiHandle = {
    openPhoto: (imageUrl: string, context: PhotoViewerContext) => void;
    openAvatar: (imageUrl: string, personaName: string) => void;
    openImage: (imageUrl: string, altText: string) => void;
    close: () => void;
};

const photoViewerModal = document.getElementById('photo-viewer-modal')!;
const photoViewerShell = photoViewerModal.querySelector('.photo-viewer-shell')!;
const closePhotoViewer = document.getElementById('close-photo-viewer') as HTMLButtonElement;
const togglePhotoViewerEditor = document.getElementById('toggle-photo-viewer-editor') as HTMLButtonElement;
const photoViewerToggleLabel = document.getElementById('photo-viewer-toggle-label')!;
const openPhotoFullscreen = document.getElementById('open-photo-fullscreen') as HTMLButtonElement;
const photoViewerImage = document.getElementById('photo-viewer-image') as HTMLImageElement;
const photoViewerMode = document.getElementById('photo-viewer-mode')!;
const photoViewerTitle = document.getElementById('photo-viewer-title')!;
const photoViewerMeta = document.getElementById('photo-viewer-meta')!;
const photoViewerPrompt = document.getElementById('photo-viewer-prompt') as HTMLTextAreaElement;
const photoViewerPromptCount = document.getElementById('photo-viewer-prompt-count')!;
const photoViewerModel = document.getElementById('photo-viewer-model') as HTMLSelectElement;
const photoViewerModelMeta = document.getElementById('photo-viewer-model-meta')!;
const photoViewerAspectRatio = document.getElementById('photo-viewer-aspect-ratio') as HTMLSelectElement;
const photoViewerResolutionWrap = document.getElementById('photo-viewer-resolution-wrap')!;
const photoViewerResolution = document.getElementById('photo-viewer-resolution') as HTMLSelectElement;
const photoViewerSeedWrap = document.getElementById('photo-viewer-seed-wrap')!;
const photoViewerSeed = document.getElementById('photo-viewer-seed') as HTMLInputElement;
const photoViewerSeedLock = document.getElementById('photo-viewer-seed-lock') as HTMLInputElement;
const photoViewerStatus = document.getElementById('photo-viewer-status')!;
const photoViewerRegenerate = document.getElementById('photo-viewer-regenerate') as HTMLButtonElement;
const photoViewerRegenerateLabel = document.getElementById('photo-viewer-regenerate-label')!;
const photoViewerRegenerateSpinner = document.getElementById('photo-viewer-regenerate-spinner')!;
const photoFullscreenModal = document.getElementById('photo-fullscreen-modal')!;
const closePhotoFullscreen = document.getElementById('close-photo-fullscreen') as HTMLButtonElement;
const photoFullscreenImage = document.getElementById('photo-fullscreen-image') as HTMLImageElement;
const photoFullscreenStage = document.getElementById('photo-fullscreen-stage')!;
const photoFullscreenZoomLevel = document.getElementById('photo-fullscreen-zoom-level')!;
const photoFullscreenZoomOut = document.getElementById('photo-fullscreen-zoom-out') as HTMLButtonElement;
const photoFullscreenZoomIn = document.getElementById('photo-fullscreen-zoom-in') as HTMLButtonElement;
const photoFullscreenReset = document.getElementById('photo-fullscreen-reset') as HTMLButtonElement;

let dependencies: PhotoViewerUiDependencies | null = null;
let memoryManager: MemoryManager;
let imageModels: Record<VeniceImageMode, VeniceImageModelSummary[]> = {
    generate: [],
    edit: [],
};
let activePhotoViewerContext: PhotoViewerContext | null = null;
let isPhotoViewerRegenerating = false;
let photoViewerRequestController: AbortController | null = null;
let isPhotoViewerEditorCollapsed = false;
let photoFullscreenScale = 1;
let photoFullscreenPan = { x: 0, y: 0 };
let photoFullscreenDrag: { pointerId: number; x: number; y: number; panX: number; panY: number } | null = null;
let photoFullscreenPinch: { distance: number; scale: number } | null = null;
const photoFullscreenPointers = new Map<number, { x: number; y: number }>();
let listenersReady = false;

const getDependencies = () => {
    if (!dependencies) throw new Error('Photo Viewer dependencies are not initialized.');
    return dependencies;
};

const syncImageModels = () => {
    const deps = getDependencies();
    imageModels = {
        generate: deps.getImageModels('generate'),
        edit: deps.getImageModels('edit'),
    };
};

const loadImageModels = async (mode: VeniceImageMode) => {
    await getDependencies().loadImageModels(mode);
    syncImageModels();
};

const getImageModelPrice = (model?: VeniceImageModelSummary, requestedResolution?: string) => {
    if (!model) return undefined;
    const resolution = requestedResolution
        || model.constraints.defaultResolution
        || Object.keys(model.resolutionPrices)[0];
    const resolutionPrice = resolution ? model.resolutionPrices[resolution] : undefined;
    return typeof resolutionPrice === 'number' ? resolutionPrice : model.priceUsd;
};

const formatImagePrivacy = (privacy: string) => {
    if (privacy === 'private') return '私人處理';
    if (privacy === 'anonymized') return '匿名化處理';
    return privacy === 'unknown' ? '' : privacy;
};

const formatModelPrice = (value?: number) => {
    if (typeof value !== 'number') return '?';
    return value < 0.01 ? value.toFixed(4) : value.toFixed(2);
};

const replaceSelectOptions = (
    select: HTMLSelectElement,
    values: string[],
    preferred: string,
    labels: Record<string, string> = {},
) => {
    const previous = select.value;
    select.innerHTML = '';
    values.forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labels[value] || value;
        select.appendChild(option);
    });
    select.value = values.includes(previous)
        ? previous
        : values.includes(preferred)
            ? preferred
            : values[0] || '';
};

const normalizeImageSeed = (value: string | number | undefined) => {
    if (typeof value === 'string' && !value.trim()) return undefined;
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number)) return undefined;
    return Math.round(Math.min(999_999_999, Math.max(-999_999_999, number)));
};

const createRandomImageSeed = () => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return Number(values[0] % 1_999_999_999) - 999_999_999;
};

const setSeedInputValue = (input: HTMLInputElement, seed: number) => {
    input.value = String(seed);
    return seed;
};

const resolveImageSeedForRequest = (input: HTMLInputElement, locked: boolean) => {
    let seed = normalizeImageSeed(input.value);
    if (!locked || seed === undefined) {
        seed = setSeedInputValue(input, createRandomImageSeed());
    }
    setPersistedAppSetting(IMAGE_SEED_STORAGE_KEY, String(seed));
    return seed;
};

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

let prepareCharacterAvatarReference: PhotoViewerUiDependencies['prepareCharacterAvatarReference'];
let getCharacterPhotoObjectUrl: PhotoViewerUiDependencies['getCharacterPhotoObjectUrl'];
let buildPhotoViewerContextFromContent: PhotoViewerUiDependencies['buildPhotoViewerContextFromContent'];
let updateAlbumState: PhotoViewerUiDependencies['updateAlbumState'];
let handleAuthRequired: PhotoViewerUiDependencies['handleAuthRequired'];

const setPhotoViewerEditorCollapsed = (collapsed: boolean) => {
    isPhotoViewerEditorCollapsed = collapsed;
    photoViewerShell.classList.toggle('is-editor-collapsed', collapsed);
    togglePhotoViewerEditor.setAttribute('aria-expanded', String(!collapsed));
    togglePhotoViewerEditor.title = collapsed ? '展開重新生成設定' : '收起重新生成設定';
    photoViewerToggleLabel.textContent = collapsed ? '重新生成' : '收起設定';
};

const clampPhotoFullscreenScale = (scale: number) => Math.min(4, Math.max(1, scale));

const renderPhotoFullscreenTransform = () => {
    photoFullscreenImage.style.transform = `translate(${photoFullscreenPan.x}px, ${photoFullscreenPan.y}px) scale(${photoFullscreenScale})`;
    photoFullscreenZoomLevel.textContent = `${Math.round(photoFullscreenScale * 100)}%`;
    photoFullscreenStage.classList.toggle('is-zoomed', photoFullscreenScale > 1);
};

const setPhotoFullscreenScale = (scale: number) => {
    photoFullscreenScale = clampPhotoFullscreenScale(scale);
    if (photoFullscreenScale === 1) photoFullscreenPan = { x: 0, y: 0 };
    renderPhotoFullscreenTransform();
};

const resetPhotoFullscreenTransform = () => {
    photoFullscreenScale = 1;
    photoFullscreenPan = { x: 0, y: 0 };
    photoFullscreenDrag = null;
    photoFullscreenPinch = null;
    photoFullscreenPointers.clear();
    photoFullscreenStage.classList.remove('is-dragging');
    renderPhotoFullscreenTransform();
};

const getPhotoFullscreenPointerDistance = () => {
    const pointers = [...photoFullscreenPointers.values()];
    if (pointers.length < 2) return 0;
    return Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
};

function openPhotoFullscreenModal() {
    if (!photoViewerImage.src) return;
    photoFullscreenImage.src = photoViewerImage.src;
    photoFullscreenModal.classList.remove('hidden');
    resetPhotoFullscreenTransform();
    window.setTimeout(() => closePhotoFullscreen.focus(), 0);
}

function openImageFullscreen(imageUrl: string, altText: string) {
    photoFullscreenImage.src = imageUrl;
    photoFullscreenImage.alt = altText;
    photoFullscreenModal.classList.remove('hidden');
    resetPhotoFullscreenTransform();
    window.setTimeout(() => closePhotoFullscreen.focus(), 0);
}

function openAvatarFullscreen(imageUrl: string, personaName: string) {
    openImageFullscreen(imageUrl, `${personaName} 的完整頭像`);
}

function closePhotoFullscreenModal() {
    photoFullscreenModal.classList.add('hidden');
    photoFullscreenImage.removeAttribute('src');
    resetPhotoFullscreenTransform();
    if (!photoViewerModal.classList.contains('hidden')) {
        window.setTimeout(() => openPhotoFullscreen.focus(), 0);
    }
}


const getPhotoViewerSelectedModel = () => {
    if (!activePhotoViewerContext) return undefined;
    return imageModels[activePhotoViewerContext.mode].find(model => model.id === photoViewerModel.value);
};

const setPhotoViewerStatus = (
    message: string,
    tone: 'idle' | 'busy' | 'success' | 'error' = 'idle',
) => {
    photoViewerStatus.textContent = message;
    photoViewerStatus.classList.remove('is-busy', 'is-success', 'is-error');
    if (tone !== 'idle') photoViewerStatus.classList.add(`is-${tone}`);
};

const updatePhotoViewerRegenerateButton = () => {
    const model = getPhotoViewerSelectedModel();
    const maxLength = model?.constraints.promptCharacterLimit || 10000;
    const prompt = photoViewerPrompt.value.trim();
    photoViewerPromptCount.textContent = `${photoViewerPrompt.value.length} / ${maxLength}`;
    photoViewerRegenerate.disabled = Boolean(
        isPhotoViewerRegenerating
        || !activePhotoViewerContext
        || !model
        || !prompt
        || prompt.length > maxLength,
    );
};

const updatePhotoViewerModelControls = () => {
    if (!activePhotoViewerContext) return;
    const context = activePhotoViewerContext;
    photoViewerSeedWrap.classList.toggle('hidden', context.mode !== 'generate');
    const model = getPhotoViewerSelectedModel();
    if (!model) {
        photoViewerModelMeta.textContent = '目前沒有相容的 Venice 圖片模型。';
        updatePhotoViewerRegenerateButton();
        return;
    }

    const ratios = model.constraints.aspectRatios?.length
        ? model.constraints.aspectRatios
        : Object.keys(PIXEL_IMAGE_DIMENSIONS);
    const preferredRatio = ratios.includes(context.aspectRatio)
        ? context.aspectRatio
        : model.constraints.defaultAspectRatio || (ratios.includes('3:4') ? '3:4' : ratios[0]);
    replaceSelectOptions(photoViewerAspectRatio, ratios, preferredRatio, { auto: '自動（跟隨原圖）' });

    const resolutions = (model.constraints.resolutions || []).filter(resolution => resolution !== '4K');
    photoViewerResolutionWrap.classList.toggle('hidden', resolutions.length === 0);
    replaceSelectOptions(
        photoViewerResolution,
        resolutions,
        context.resolution || model.constraints.defaultResolution || '1K',
    );

    const maxLength = model.constraints.promptCharacterLimit || 10000;
    photoViewerPrompt.maxLength = maxLength;
    const price = getImageModelPrice(model, photoViewerResolution.value);
    const details = [
        context.mode === 'edit' ? '頭像參考圖生圖' : '文字生圖',
        formatImagePrivacy(model.privacy),
        typeof price === 'number' ? `約 US$${formatModelPrice(price)}／張` : '',
    ].filter(Boolean);
    photoViewerModelMeta.textContent = details.join(' · ');
    updatePhotoViewerRegenerateButton();
};

const renderPhotoViewerModelOptions = () => {
    if (!activePhotoViewerContext) return;
    const context = activePhotoViewerContext;
    const preferredId = context.mode === 'generate' ? VENICE_IMAGE_GENERATE_MODEL : VENICE_IMAGE_EDIT_MODEL;
    const requestedId = context.mode === 'generate' && context.modelId === 'lustify-v8'
        ? VENICE_IMAGE_GENERATE_MODEL
        : context.modelId;
    const models = [...imageModels[context.mode]].sort((left, right) => {
        if (left.id === preferredId) return -1;
        if (right.id === preferredId) return 1;
        return (getImageModelPrice(left, left.constraints.defaultResolution) ?? Number.MAX_SAFE_INTEGER)
            - (getImageModelPrice(right, right.constraints.defaultResolution) ?? Number.MAX_SAFE_INTEGER);
    });

    photoViewerModel.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        const price = getImageModelPrice(model, model.constraints.defaultResolution);
        option.textContent = `${model.name}${typeof price === 'number' ? ` · $${formatModelPrice(price)}` : ''}`;
        photoViewerModel.appendChild(option);
    });
    photoViewerModel.value = models.some(model => model.id === requestedId)
        ? requestedId || preferredId
        : models.some(model => model.id === preferredId) ? preferredId : models[0]?.id || '';
    photoViewerModel.disabled = isPhotoViewerRegenerating || models.length === 0;
    updatePhotoViewerModelControls();
};

const setPhotoViewerBusy = (busy: boolean) => {
    isPhotoViewerRegenerating = busy;
    const hasModel = Boolean(getPhotoViewerSelectedModel());
    photoViewerPrompt.disabled = busy;
    photoViewerModel.disabled = busy || !activePhotoViewerContext || !imageModels[activePhotoViewerContext.mode].length;
    photoViewerAspectRatio.disabled = busy || !hasModel;
    photoViewerResolution.disabled = busy || !hasModel;
    photoViewerSeed.disabled = busy || activePhotoViewerContext?.mode !== 'generate';
    photoViewerSeedLock.disabled = busy || activePhotoViewerContext?.mode !== 'generate';
    photoViewerRegenerateSpinner.classList.toggle('hidden', !busy);
    photoViewerRegenerateLabel.textContent = busy ? '重新生成中...' : '重新生成';
    updatePhotoViewerRegenerateButton();
};

function openPhotoViewer(imageUrl: string, context: PhotoViewerContext) {
    photoViewerRequestController?.abort();
    const normalizedContext = {
        ...context,
        modelId: context.mode === 'generate' && context.modelId === 'lustify-v8'
            ? VENICE_IMAGE_GENERATE_MODEL
            : context.modelId,
    };
    activePhotoViewerContext = normalizedContext;
    photoViewerImage.src = imageUrl;
    photoViewerPrompt.value = normalizedContext.prompt;
    photoViewerSeedLock.checked = localStorage.getItem(IMAGE_SEED_LOCK_STORAGE_KEY) === 'true';
    const viewerSeed = normalizeImageSeed(normalizedContext.seed)
        ?? normalizeImageSeed(localStorage.getItem(IMAGE_SEED_STORAGE_KEY) || undefined)
        ?? createRandomImageSeed();
    setSeedInputValue(photoViewerSeed, viewerSeed);
    photoViewerSeedWrap.classList.toggle('hidden', normalizedContext.mode !== 'generate');
    photoViewerAspectRatio.innerHTML = '';
    photoViewerResolution.innerHTML = '';
    photoViewerModel.innerHTML = '<option value="">載入模型中...</option>';
    photoViewerMode.textContent = normalizedContext.mode === 'edit' ? '頭像參考圖生圖' : '文字生成';
    const persona = normalizedContext.personaKey
        ? memoryManager.getPersona(normalizedContext.personaKey)
        : null;
    photoViewerTitle.textContent = normalizedContext.source === 'studio'
        ? '圖片工作室作品'
        : `${persona?.name || getDependencies().getCurrentPersonaName() || '角色'} 的照片`;
    photoViewerMeta.textContent = [
        normalizedContext.modelName,
        normalizedContext.aspectRatio,
        normalizedContext.resolution,
        typeof normalizedContext.seed === 'number' ? `Seed ${normalizedContext.seed}` : '',
        '原圖會保留',
    ].filter(Boolean).join(' · ');
    setPhotoViewerStatus('可修改 Prompt、模型與畫面設定後重新生成。');
    setPhotoViewerBusy(false);
    setPhotoViewerEditorCollapsed(window.matchMedia('(max-width: 760px)').matches);
    photoViewerModal.classList.remove('hidden');
    document.body.classList.add('photo-viewer-open');
    window.setTimeout(() => closePhotoViewer.focus(), 0);

    const openedContext = activePhotoViewerContext;
    void loadImageModels(normalizedContext.mode).then(() => {
        if (activePhotoViewerContext !== openedContext) return;
        renderPhotoViewerModelOptions();
    });
}

const runPhotoViewerRegeneration = async () => {
    const context = activePhotoViewerContext;
    const model = getPhotoViewerSelectedModel();
    const prompt = photoViewerPrompt.value.trim();
    if (!context || !model || !prompt || isPhotoViewerRegenerating) return;
    if (prompt.length > (model.constraints.promptCharacterLimit || 10000)) {
        setPhotoViewerStatus('Prompt 超過這個模型的長度上限，請先縮短內容。', 'error');
        return;
    }

    const controller = new AbortController();
    photoViewerRequestController = controller;
    setPhotoViewerBusy(true);
    setPhotoViewerStatus('正在重新生成；完成後會新增一張並保留原圖...', 'busy');
    const startedAt = performance.now();

    try {
        let sourceImageBase64 = context.sourceImageBase64;
        if (context.mode === 'edit' && !sourceImageBase64) {
            const persona = context.personaKey ? memoryManager.getPersona(context.personaKey) : null;
            if (!persona || !context.useAvatarReference) {
                throw new Error('這張照片缺少原本的參考圖片，無法使用圖生圖模型重新生成。');
            }
            sourceImageBase64 = await prepareCharacterAvatarReference(persona) || undefined;
            if (!sourceImageBase64) throw new Error('無法讀取角色頭像，請先更換頭像後再試。');
        }

        const supportedRatios = model.constraints.aspectRatios || [];
        const selectedRatio = photoViewerAspectRatio.value || context.aspectRatio || '3:4';
        const aspectRatio = supportedRatios.includes(selectedRatio)
            ? selectedRatio
            : model.constraints.defaultAspectRatio || supportedRatios[0];
        const resolution = model.constraints.resolutions?.length
            ? photoViewerResolution.value || model.constraints.defaultResolution || model.constraints.resolutions[0]
            : undefined;
        const pixelSize = PIXEL_IMAGE_DIMENSIONS[selectedRatio] || PIXEL_IMAGE_DIMENSIONS['3:4'];
        const generationSeed = context.mode === 'generate'
            ? resolveImageSeedForRequest(photoViewerSeed, photoViewerSeedLock.checked)
            : undefined;
        const result = await requestVeniceImage({
            mode: context.mode,
            model: model.id,
            prompt,
            negativePrompt: context.mode === 'generate'
                ? context.negativePrompt || 'unintended duplicated bodies, cloned face, malformed anatomy, deformed hands, distorted face, text, captions, interface, logo, watermark, blurry, low quality'
                : undefined,
            sourceImageBase64,
            aspectRatio: context.mode === 'edit' || supportedRatios.length > 0 ? aspectRatio : undefined,
            resolution,
            width: context.mode === 'generate' && supportedRatios.length === 0 ? pixelSize.width : undefined,
            height: context.mode === 'generate' && supportedRatios.length === 0 ? pixelSize.height : undefined,
            variants: 1,
            steps: context.mode === 'generate' ? model.constraints.steps?.default : undefined,
            seed: generationSeed,
            adultConfirmed: true,
            signal: controller.signal,
        });
        const blob = result.blobs[0];
        if (!blob) throw new Error('Venice 沒有傳回圖片。');
        if (controller.signal.aborted) throw new DOMException('Image regeneration aborted.', 'AbortError');

        let nextImageUrl = '';
        let nextContext: PhotoViewerContext;
        if (context.source === 'studio') {
            const now = new Date();
            const studioResult: PhotoViewerStudioResult = {
                id: `${now.getTime()}-regenerated`,
                blob,
                url: URL.createObjectURL(blob),
                prompt,
                model: model.name,
                modelId: model.id,
                mode: context.mode,
                aspectRatio: selectedRatio,
                resolution,
                negativePrompt: context.negativePrompt,
                sourceImageBase64,
                seed: generationSeed,
                createdAt: now,
            };
            getDependencies().addStudioResult(studioResult);
            nextImageUrl = studioResult.url;
            nextContext = {
                ...context,
                prompt,
                modelId: model.id,
                modelName: model.name,
                aspectRatio: selectedRatio,
                resolution,
                sourceImageBase64,
                seed: generationSeed,
            };
        } else {
            if (!context.personaKey) throw new Error('找不到這張照片所屬的角色。');
            const assetId = `character-photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            await saveCharacterPhotoAsset({
                id: assetId,
                personaKey: context.personaKey,
                blob,
                prompt,
                createdAt: Date.now(),
            });
            const photoContent: Content = {
                text: context.caption,
                imageAssetId: assetId,
                imagePrompt: prompt,
                imageGeneration: {
                    mode: context.mode,
                    modelId: model.id,
                    modelName: model.name,
                    aspectRatio: selectedRatio,
                    resolution,
                    seed: generationSeed,
                    useAvatarReference: context.useAvatarReference,
                    identityMode: context.identityMode,
                },
            };
            memoryManager.addMessage(context.personaKey, 'model', photoContent);
            nextImageUrl = await getCharacterPhotoObjectUrl(assetId) || '';
            nextContext = buildPhotoViewerContextFromContent(photoContent, context.source, context.personaKey);
            if (getDependencies().getCurrentPersonaKey() === context.personaKey) {
                getDependencies().appendVisiblePhoto(photoContent);
                updateAlbumState();
            }
        }

        if (!nextImageUrl) throw new Error('新圖片已生成，但暫時無法開啟預覽。');
        activePhotoViewerContext = nextContext;
        photoViewerImage.src = nextImageUrl;
        if (!photoFullscreenModal.classList.contains('hidden')) photoFullscreenImage.src = nextImageUrl;
        photoViewerMeta.textContent = [
            model.name,
            selectedRatio,
            resolution,
            typeof generationSeed === 'number' ? `Seed ${generationSeed}` : '',
            '已另存新圖',
        ].filter(Boolean).join(' · ');
        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
        setPhotoViewerStatus(`重新生成完成 · ${elapsed} 秒；原圖仍然保留。`, 'success');
    } catch (error) {
        if (isAbortError(error)) {
            if (!photoViewerModal.classList.contains('hidden')) {
                setPhotoViewerStatus('已停止重新生成。', 'error');
            }
        } else {
            const message = error instanceof Error ? error.message : '重新生成失敗。';
            setPhotoViewerStatus(`重新生成失敗：${message}`, 'error');
            if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        }
    } finally {
        if (photoViewerRequestController === controller) photoViewerRequestController = null;
        setPhotoViewerBusy(false);
    }
};

function closePhotoViewerModal() {
    photoViewerRequestController?.abort();
    photoViewerRequestController = null;
    if (!photoFullscreenModal.classList.contains('hidden')) closePhotoFullscreenModal();
    photoViewerModal.classList.add('hidden');
    document.body.classList.remove('photo-viewer-open');
    photoViewerImage.removeAttribute('src');
    photoViewerPrompt.value = '';
    photoViewerModel.innerHTML = '';
    activePhotoViewerContext = null;
    setPhotoViewerBusy(false);
}


const setupPhotoViewerListeners = () => {
    if (listenersReady) return;
    listenersReady = true;
    closePhotoViewer.addEventListener('click', closePhotoViewerModal);
    togglePhotoViewerEditor.addEventListener('click', () => {
        setPhotoViewerEditorCollapsed(!isPhotoViewerEditorCollapsed);
    });
    openPhotoFullscreen.addEventListener('click', openPhotoFullscreenModal);
    photoViewerModal.addEventListener('click', event => {
        if (event.target === photoViewerModal) closePhotoViewerModal();
    });
    photoViewerPrompt.addEventListener('input', updatePhotoViewerRegenerateButton);
    photoViewerModel.addEventListener('change', updatePhotoViewerModelControls);
    photoViewerAspectRatio.addEventListener('change', updatePhotoViewerRegenerateButton);
    photoViewerResolution.addEventListener('change', updatePhotoViewerModelControls);
    photoViewerSeedLock.addEventListener('change', () => {
        setPersistedAppSetting(IMAGE_SEED_LOCK_STORAGE_KEY, String(photoViewerSeedLock.checked));
        let seed = normalizeImageSeed(photoViewerSeed.value);
        if (photoViewerSeedLock.checked) {
            seed ??= setSeedInputValue(photoViewerSeed, createRandomImageSeed());
            setPersistedAppSetting(IMAGE_SEED_STORAGE_KEY, String(seed));
        }
        getDependencies().syncSharedSeed(photoViewerSeedLock.checked, seed);
    });
    photoViewerSeed.addEventListener('change', () => {
        const seed = normalizeImageSeed(photoViewerSeed.value);
        if (seed === undefined) return;
        setSeedInputValue(photoViewerSeed, seed);
        setPersistedAppSetting(IMAGE_SEED_STORAGE_KEY, String(seed));
        getDependencies().syncSharedSeed(photoViewerSeedLock.checked, seed);
    });
    photoViewerRegenerate.addEventListener('click', () => {
        void runPhotoViewerRegeneration();
    });
    closePhotoFullscreen.addEventListener('click', closePhotoFullscreenModal);
    photoFullscreenModal.addEventListener('click', event => {
        if (event.target === photoFullscreenModal) closePhotoFullscreenModal();
    });
    photoFullscreenZoomIn.addEventListener('click', () => setPhotoFullscreenScale(photoFullscreenScale + 0.25));
    photoFullscreenZoomOut.addEventListener('click', () => setPhotoFullscreenScale(photoFullscreenScale - 0.25));
    photoFullscreenReset.addEventListener('click', resetPhotoFullscreenTransform);
    photoFullscreenStage.addEventListener('dblclick', () => {
        setPhotoFullscreenScale(photoFullscreenScale > 1 ? 1 : 2);
    });
    photoFullscreenStage.addEventListener('wheel', event => {
        event.preventDefault();
        setPhotoFullscreenScale(photoFullscreenScale + (event.deltaY < 0 ? 0.18 : -0.18));
    }, { passive: false });
    photoFullscreenStage.addEventListener('pointerdown', event => {
        photoFullscreenPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        photoFullscreenStage.setPointerCapture(event.pointerId);
        if (photoFullscreenPointers.size === 1) {
            photoFullscreenDrag = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                panX: photoFullscreenPan.x,
                panY: photoFullscreenPan.y,
            };
        } else if (photoFullscreenPointers.size === 2) {
            photoFullscreenPinch = {
                distance: getPhotoFullscreenPointerDistance(),
                scale: photoFullscreenScale,
            };
            photoFullscreenDrag = null;
        }
    });
    photoFullscreenStage.addEventListener('pointermove', event => {
        if (!photoFullscreenPointers.has(event.pointerId)) return;
        photoFullscreenPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (photoFullscreenPointers.size >= 2 && photoFullscreenPinch) {
            const distance = getPhotoFullscreenPointerDistance();
            if (photoFullscreenPinch.distance > 0) {
                setPhotoFullscreenScale(photoFullscreenPinch.scale * (distance / photoFullscreenPinch.distance));
            }
            return;
        }
        if (!photoFullscreenDrag || photoFullscreenDrag.pointerId !== event.pointerId || photoFullscreenScale <= 1) return;
        photoFullscreenPan = {
            x: photoFullscreenDrag.panX + event.clientX - photoFullscreenDrag.x,
            y: photoFullscreenDrag.panY + event.clientY - photoFullscreenDrag.y,
        };
        photoFullscreenStage.classList.add('is-dragging');
        renderPhotoFullscreenTransform();
    });
    const finishPhotoFullscreenPointer = (event: PointerEvent) => {
        photoFullscreenPointers.delete(event.pointerId);
        if (photoFullscreenStage.hasPointerCapture(event.pointerId)) {
            photoFullscreenStage.releasePointerCapture(event.pointerId);
        }
        photoFullscreenStage.classList.remove('is-dragging');
        photoFullscreenPinch = null;
        const remainingPointer = [...photoFullscreenPointers.entries()][0];
        photoFullscreenDrag = remainingPointer
            ? {
                pointerId: remainingPointer[0],
                x: remainingPointer[1].x,
                y: remainingPointer[1].y,
                panX: photoFullscreenPan.x,
                panY: photoFullscreenPan.y,
            }
            : null;
    };
    photoFullscreenStage.addEventListener('pointerup', finishPhotoFullscreenPointer);
    photoFullscreenStage.addEventListener('pointercancel', finishPhotoFullscreenPointer);
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (!photoFullscreenModal.classList.contains('hidden')) {
            closePhotoFullscreenModal();
        } else if (!photoViewerModal.classList.contains('hidden')) {
            closePhotoViewerModal();
        }
    });

};


export const createPhotoViewerUi = (
    nextDependencies: PhotoViewerUiDependencies,
): PhotoViewerUiHandle => {
    dependencies = nextDependencies;
    memoryManager = nextDependencies.memoryManager;
    prepareCharacterAvatarReference = nextDependencies.prepareCharacterAvatarReference;
    getCharacterPhotoObjectUrl = nextDependencies.getCharacterPhotoObjectUrl;
    buildPhotoViewerContextFromContent = nextDependencies.buildPhotoViewerContextFromContent;
    updateAlbumState = nextDependencies.updateAlbumState;
    handleAuthRequired = nextDependencies.handleAuthRequired;
    syncImageModels();
    setupPhotoViewerListeners();
    return {
        openPhoto: (imageUrl, context) => {
            syncImageModels();
            openPhotoViewer(imageUrl, context);
        },
        openAvatar: openAvatarFullscreen,
        openImage: openImageFullscreen,
        close: closePhotoViewerModal,
    };
};
