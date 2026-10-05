import type {
    VeniceImageMode,
    VeniceImageModelSummary,
    VeniceImageRequest,
} from '../veniceImage.js';
import {
    VENICE_IMAGE_EDIT_MODEL,
    VENICE_IMAGE_GENERATE_MODEL,
} from '../veniceImagePolicy.js';
import { VENICE_AUTH_REQUIRED_ERROR } from '../venice.js';

export type ImageStudioHistoryMode = 'push' | 'replace' | 'skip';

export type ImageStudioPhotoContext = {
    source: 'studio';
    prompt: string;
    caption: string;
    mode: VeniceImageMode;
    modelId?: string;
    modelName?: string;
    aspectRatio: string;
    resolution?: string;
    negativePrompt?: string;
    useAvatarReference: false;
    sourceImageBase64?: string;
    seed?: number;
};

export type ImageStudioResult = {
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

export type ImageStudioDependencies = {
    getImageModels: (mode: VeniceImageMode) => VeniceImageModelSummary[];
    loadImageModels: (mode: VeniceImageMode, force?: boolean) => Promise<void>;
    getSelectedImageModelId: (mode: VeniceImageMode) => string;
    setSelectedImageModelId: (mode: VeniceImageMode, modelId: string) => void;
    getImageModelPrice: (model?: VeniceImageModelSummary, requestedResolution?: string) => number | undefined;
    formatModelPrice: (value?: number) => string;
    requestImage: (request: VeniceImageRequest) => ReturnType<
        typeof import('../veniceImage.js')['requestVeniceImage']
    >;
    resolveSharedSeed: () => number;
    getSharedSeed: () => number | undefined;
    getSharedSeedLocked: () => boolean;
    setSharedSeedLocked: (locked: boolean) => void;
    setSharedSeed: (seed: number) => number;
    randomizeSharedSeed: () => number;
    handleAuthRequired: () => void;
    cancelActiveChatRequest: () => void;
    enterImageView: (historyMode: ImageStudioHistoryMode) => void;
    showSelectionView: () => void;
    hideVideoStudio: () => void;
    openPhotoViewer: (imageUrl: string, context: ImageStudioPhotoContext) => void;
};

export type ImageStudioHandle = {
    show: (historyMode?: ImageStudioHistoryMode) => void;
    hide: () => void;
    isVisible: () => boolean;
    cancelRequest: () => void;
    addResult: (result: ImageStudioResult) => void;
    cleanup: () => void;
};

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

const IMAGE_ADULT_CONFIRM_STORAGE_KEY = 'veniceImageAdultConfirmed';

const imageStudioView = document.getElementById('image-studio-view')!;
const imageStudioBack = document.getElementById('image-studio-back') as HTMLButtonElement;
const imageModeGenerateBtn = document.getElementById('image-mode-generate') as HTMLButtonElement;
const imageModeEditBtn = document.getElementById('image-mode-edit') as HTMLButtonElement;
const imageModelSelect = document.getElementById('image-model-select') as HTMLSelectElement;
const imageModelMeta = document.getElementById('image-model-meta')!;
const refreshImageModelsBtn = document.getElementById('refresh-image-models') as HTMLButtonElement;
const imageSourceSection = document.getElementById('image-source-section')!;
const imageSourceInput = document.getElementById('image-source-input') as HTMLInputElement;
const imageSourceDropzone = document.getElementById('image-source-dropzone') as HTMLButtonElement;
const imageSourceEmpty = document.getElementById('image-source-empty')!;
const imageSourcePreviewWrap = document.getElementById('image-source-preview-wrap')!;
const imageSourcePreview = document.getElementById('image-source-preview') as HTMLImageElement;
const imageSourceMeta = document.getElementById('image-source-meta')!;
const imagePrompt = document.getElementById('image-prompt') as HTMLTextAreaElement;
const imagePromptCount = document.getElementById('image-prompt-count')!;
const imageNegativeSection = document.getElementById('image-negative-section')!;
const imageNegativePrompt = document.getElementById('image-negative-prompt') as HTMLTextAreaElement;
const imageAspectRatio = document.getElementById('image-aspect-ratio') as HTMLSelectElement;
const imageResolutionWrap = document.getElementById('image-resolution-wrap')!;
const imageResolution = document.getElementById('image-resolution') as HTMLSelectElement;
const imageVariantWrap = document.getElementById('image-variant-wrap')!;
const imageVariants = document.getElementById('image-variants') as HTMLSelectElement;
const imageSeedWrap = document.getElementById('image-seed-wrap')!;
const imageSeed = document.getElementById('image-seed') as HTMLInputElement;
const imageSeedLock = document.getElementById('image-seed-lock') as HTMLInputElement;
const imageSeedRandom = document.getElementById('image-seed-random') as HTMLButtonElement;
const imageAdultConfirm = document.getElementById('image-adult-confirm') as HTMLInputElement;
const imageStudioError = document.getElementById('image-studio-error')!;
const imageGenerateButton = document.getElementById('image-generate-button') as HTMLButtonElement;
const imageGenerateLabel = document.getElementById('image-generate-label')!;
const imageGenerateSpinner = document.getElementById('image-generate-spinner')!;
const imageStudioStatus = document.getElementById('image-studio-status')!;
const imageCostEstimate = document.getElementById('image-cost-estimate')!;
const imageStudioEmpty = document.getElementById('image-studio-empty')!;
const imageStudioResults = document.getElementById('image-studio-results')!;
const clearImageResultsBtn = document.getElementById('clear-image-results') as HTMLButtonElement;

let dependencies: ImageStudioDependencies | null = null;
let listenersAttached = false;
let imageStudioMode: VeniceImageMode = 'generate';
let imageSource: {
    blob: Blob;
    base64: string;
    previewUrl: string;
    width: number;
    height: number;
    name: string;
} | null = null;
let imageResults: ImageStudioResult[] = [];
let imageRequestController: AbortController | null = null;
let isImageRequestRunning = false;

const getDeps = () => {
    if (!dependencies) throw new Error('Image Studio dependencies are not initialized.');
    return dependencies;
};

const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('無法讀取圖片。'));
    reader.readAsDataURL(blob);
});

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('無法壓縮圖片。'));
    }, 'image/webp', quality);
});

const getSelectedImageModel = () => getDeps()
    .getImageModels(imageStudioMode)
    .find(model => model.id === getDeps().getSelectedImageModelId(imageStudioMode));

const formatImagePrivacy = (privacy: string) => {
    if (privacy === 'private') return '私人處理';
    if (privacy === 'anonymized') return '匿名化處理';
    return privacy === 'unknown' ? '' : privacy;
};

const updateImageCostEstimate = () => {
    const model = getSelectedImageModel();
    const price = getDeps().getImageModelPrice(model, imageResolution.value);
    if (typeof price !== 'number') {
        imageCostEstimate.textContent = '';
        return;
    }
    const count = imageStudioMode === 'generate' ? Number(imageVariants.value || 1) : 1;
    imageCostEstimate.textContent = `估計 US$${getDeps().formatModelPrice(price * count)}`;
};

const updateImageGenerateButton = () => {
    const promptReady = Boolean(imagePrompt.value.trim());
    const sourceReady = imageStudioMode === 'generate' || Boolean(imageSource);
    const modelReady = Boolean(imageModelSelect.value);
    imageGenerateButton.disabled = isImageRequestRunning
        || !promptReady
        || !sourceReady
        || !modelReady
        || !imageAdultConfirm.checked;
};

const updateImagePromptCounter = () => {
    const model = getSelectedImageModel();
    const maxLength = model?.constraints.promptCharacterLimit || 7500;
    imagePrompt.maxLength = maxLength;
    imagePromptCount.textContent = `${imagePrompt.value.length} / ${maxLength}`;
    updateImageGenerateButton();
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

const updateImageModelControls = () => {
    const model = getSelectedImageModel();
    const constraints = model?.constraints || {};
    const supportedRatios = constraints.aspectRatios?.length
        ? constraints.aspectRatios
        : Object.keys(PIXEL_IMAGE_DIMENSIONS);
    const preferredRatio = imageStudioMode === 'edit'
        ? constraints.defaultAspectRatio || (supportedRatios.includes('auto') ? 'auto' : supportedRatios[0])
        : constraints.defaultAspectRatio || (supportedRatios.includes('3:4') ? '3:4' : supportedRatios[0]);

    replaceSelectOptions(imageAspectRatio, supportedRatios, preferredRatio, { auto: '自動（跟隨原圖）' });

    const resolutions = (constraints.resolutions || []).filter(resolution => resolution !== '4K');
    imageResolutionWrap.classList.toggle('hidden', resolutions.length === 0);
    replaceSelectOptions(imageResolution, resolutions, constraints.defaultResolution || '1K');

    const price = getDeps().getImageModelPrice(model, imageResolution.value);
    const details = [
        model?.id === (imageStudioMode === 'generate' ? VENICE_IMAGE_GENERATE_MODEL : VENICE_IMAGE_EDIT_MODEL)
            ? '目前推薦'
            : '',
        model?.traits.includes('most_uncensored') ? '最自由' : '',
        model?.traits.includes('highest_quality') ? '高畫質' : '',
        model?.traits.includes('fastest') ? '最快' : '',
        model ? formatImagePrivacy(model.privacy) : '',
        typeof price === 'number'
            ? `約 US$${getDeps().formatModelPrice(price)}／張`
            : '',
    ].filter(Boolean);
    imageModelMeta.textContent = details.length
        ? details.join(' · ')
        : '模型能力資料暫時不可用。';

    updateImagePromptCounter();
    updateImageCostEstimate();
};

const renderImageModelOptions = () => {
    const models = [...getDeps().getImageModels(imageStudioMode)].sort((left, right) => {
        const preferred = imageStudioMode === 'generate' ? VENICE_IMAGE_GENERATE_MODEL : VENICE_IMAGE_EDIT_MODEL;
        if (left.id === preferred) return -1;
        if (right.id === preferred) return 1;
        const leftUncensored = left.traits.includes('most_uncensored') || /uncensored|lustify/i.test(left.id);
        const rightUncensored = right.traits.includes('most_uncensored') || /uncensored|lustify/i.test(right.id);
        if (leftUncensored !== rightUncensored) return leftUncensored ? -1 : 1;
        if (left.privacy !== right.privacy) return left.privacy === 'private' ? -1 : 1;
        return (getDeps().getImageModelPrice(left, left.constraints.defaultResolution) ?? Number.MAX_SAFE_INTEGER)
            - (getDeps().getImageModelPrice(right, right.constraints.defaultResolution) ?? Number.MAX_SAFE_INTEGER);
    });

    const preferredId = imageStudioMode === 'generate' ? VENICE_IMAGE_GENERATE_MODEL : VENICE_IMAGE_EDIT_MODEL;
    const selectedId = getDeps().getSelectedImageModelId(imageStudioMode);
    if (!models.some(model => model.id === selectedId)) {
        getDeps().setSelectedImageModelId(
            imageStudioMode,
            models.find(model => model.id === preferredId)?.id || models[0]?.id || '',
        );
    }

    imageModelSelect.innerHTML = '';
    const recommended = models.filter(model => model.id === preferredId);
    const privateModels = models.filter(model => model.id !== preferredId && model.privacy === 'private');
    const otherModels = models.filter(model => model.id !== preferredId && model.privacy !== 'private');
    [
        { label: '推薦', models: recommended },
        { label: '其他私人模型', models: privateModels },
        { label: '其他模型', models: otherModels },
    ].forEach(group => {
        if (!group.models.length) return;
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        group.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            const trait = model.traits.includes('most_uncensored')
                ? ' · 最自由'
                : model.traits.includes('fastest')
                    ? ' · 最快'
                    : model.traits.includes('highest_quality')
                        ? ' · 高畫質'
                        : '';
            const modelPrice = getDeps().getImageModelPrice(model, model.constraints.defaultResolution);
            const price = typeof modelPrice === 'number'
                ? ` · $${getDeps().formatModelPrice(modelPrice)}`
                : '';
            option.textContent = `${model.name}${trait}${price}`;
            optgroup.appendChild(option);
        });
        imageModelSelect.appendChild(optgroup);
    });

    imageModelSelect.value = getDeps().getSelectedImageModelId(imageStudioMode);
    imageModelSelect.disabled = isImageRequestRunning || models.length === 0;
    updateImageModelControls();
};

const loadModelsAndRender = async (mode: VeniceImageMode, force = false) => {
    imageModelSelect.disabled = true;
    refreshImageModelsBtn.disabled = true;
    imageModelMeta.textContent = '正在讀取 Venice 圖片模型...';
    try {
        await getDeps().loadImageModels(mode, force);
    } finally {
        refreshImageModelsBtn.disabled = false;
        if (mode === imageStudioMode) renderImageModelOptions();
    }
};

const syncSeedControlsFromSharedState = () => {
    imageSeedLock.checked = getDeps().getSharedSeedLocked();
    const seed = getDeps().getSharedSeed() ?? getDeps().randomizeSharedSeed();
    imageSeed.value = String(seed);
};

const setImageStudioMode = (mode: VeniceImageMode) => {
    if (isImageRequestRunning || imageStudioMode === mode) {
        if (!getDeps().getImageModels(mode).length) void loadModelsAndRender(mode);
        return;
    }
    imageStudioMode = mode;
    const isGenerate = mode === 'generate';
    imageModeGenerateBtn.classList.toggle('is-active', isGenerate);
    imageModeGenerateBtn.setAttribute('aria-selected', String(isGenerate));
    imageModeEditBtn.classList.toggle('is-active', !isGenerate);
    imageModeEditBtn.setAttribute('aria-selected', String(!isGenerate));
    imageSourceSection.classList.toggle('hidden', isGenerate);
    imageNegativeSection.classList.toggle('hidden', !isGenerate);
    imageVariantWrap.classList.toggle('hidden', !isGenerate);
    imageSeedWrap.classList.toggle('hidden', !isGenerate);
    imageAspectRatio.value = '';
    imageResolution.value = '';
    imageGenerateLabel.textContent = isGenerate ? '開始生成' : '開始修改';
    imageStudioStatus.textContent = isGenerate ? '填寫描述後即可生成' : '加入來源圖片及修改指令';
    imageStudioError.classList.add('hidden');
    imageModelSelect.innerHTML = '<option value="">載入模型中...</option>';
    void loadModelsAndRender(mode);
    updateImageGenerateButton();
};

const setImageSourceFromBlob = async (sourceBlob: Blob, name: string) => {
    if (!sourceBlob.type.startsWith('image/')) throw new Error('請選擇 JPEG、PNG 或 WebP 圖片。');
    if (sourceBlob.size > 25 * 1024 * 1024) throw new Error('來源圖片不可超過 25MB。');

    const rawUrl = URL.createObjectURL(sourceBlob);
    const sourceImage = new Image();
    sourceImage.src = rawUrl;
    try {
        await sourceImage.decode();
        if (sourceImage.naturalWidth * sourceImage.naturalHeight < 65_536) {
            throw new Error('來源圖片太小，寬高總像素至少需要 65,536。');
        }

        const scale = Math.min(1, 1536 / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
        const width = Math.max(256, Math.round(sourceImage.naturalWidth * scale));
        const height = Math.max(256, Math.round(sourceImage.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('瀏覽器無法處理這張圖片。');
        context.drawImage(sourceImage, 0, 0, width, height);

        let compressed = await canvasToBlob(canvas, 0.88);
        if (compressed.size > 2_650_000) compressed = await canvasToBlob(canvas, 0.68);
        if (compressed.size > 2_650_000) throw new Error('壓縮後的圖片仍然太大，請改用較小的來源圖。');

        if (imageSource) URL.revokeObjectURL(imageSource.previewUrl);
        const previewUrl = URL.createObjectURL(compressed);
        imageSource = {
            blob: compressed,
            base64: await blobToBase64(compressed),
            previewUrl,
            width,
            height,
            name,
        };
        imageSourcePreview.src = previewUrl;
        imageSourceMeta.textContent = `${name} · ${width} × ${height} · ${(compressed.size / 1024).toFixed(0)} KB`;
        imageSourceEmpty.classList.add('hidden');
        imageSourcePreviewWrap.classList.remove('hidden');
        updateImageGenerateButton();
    } finally {
        URL.revokeObjectURL(rawUrl);
    }
};

const showImageStudioError = (message: string) => {
    imageStudioError.textContent = message;
    imageStudioError.classList.remove('hidden');
};

const clearImageStudioError = () => {
    imageStudioError.textContent = '';
    imageStudioError.classList.add('hidden');
};

const loadImageSourceFile = async (file?: File) => {
    if (!file) return;
    clearImageStudioError();
    imageStudioStatus.textContent = '正在準備來源圖片...';
    try {
        await setImageSourceFromBlob(file, file.name);
        imageStudioStatus.textContent = '來源圖片已準備好';
    } catch (error) {
        showImageStudioError(error instanceof Error ? error.message : '無法讀取來源圖片。');
        imageStudioStatus.textContent = '來源圖片載入失敗';
    } finally {
        imageSourceInput.value = '';
    }
};

const setImageStudioBusy = (busy: boolean) => {
    isImageRequestRunning = busy;
    imageGenerateSpinner.classList.toggle('hidden', !busy);
    imageGenerateLabel.textContent = busy
        ? imageStudioMode === 'generate' ? '生成中...' : '修改中...'
        : imageStudioMode === 'generate' ? '開始生成' : '開始修改';
    imageModeGenerateBtn.disabled = busy;
    imageModeEditBtn.disabled = busy;
    imageModelSelect.disabled = busy || getDeps().getImageModels(imageStudioMode).length === 0;
    refreshImageModelsBtn.disabled = busy;
    imageSourceDropzone.disabled = busy;
    imagePrompt.disabled = busy;
    imageNegativePrompt.disabled = busy;
    imageAspectRatio.disabled = busy;
    imageResolution.disabled = busy;
    imageVariants.disabled = busy;
    imageSeed.disabled = busy;
    imageSeedLock.disabled = busy;
    imageSeedRandom.disabled = busy;
    imageAdultConfirm.disabled = busy;
    updateImageGenerateButton();
};

const renderImageResults = () => {
    imageStudioResults.innerHTML = '';
    imageStudioEmpty.classList.toggle('hidden', imageResults.length > 0);
    clearImageResultsBtn.classList.toggle('hidden', imageResults.length === 0);

    imageResults.forEach((result, index) => {
        const card = document.createElement('article');
        card.className = 'image-result-card';
        card.style.animationDelay = `${Math.min(index, 5) * 55}ms`;

        const image = document.createElement('img');
        image.src = result.url;
        image.alt = result.prompt;
        image.loading = 'lazy';
        image.addEventListener('click', () => getDeps().openPhotoViewer(result.url, {
            source: 'studio',
            prompt: result.prompt,
            caption: 'Venice 圖片工作室作品',
            mode: result.mode,
            modelId: result.modelId,
            modelName: result.model,
            aspectRatio: result.aspectRatio,
            resolution: result.resolution,
            negativePrompt: result.negativePrompt,
            useAvatarReference: false,
            sourceImageBase64: result.sourceImageBase64,
            seed: result.seed,
        }));

        const actions = document.createElement('div');
        actions.className = 'image-result-actions';
        const downloadButton = document.createElement('button');
        downloadButton.type = 'button';
        downloadButton.className = 'image-result-action';
        downloadButton.textContent = '下載 WebP';
        downloadButton.addEventListener('click', () => {
            const anchor = document.createElement('a');
            anchor.href = result.url;
            anchor.download = `venice-${result.createdAt.toISOString().replace(/[:.]/g, '-')}.webp`;
            anchor.click();
        });

        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'image-result-action';
        editButton.textContent = '以此圖繼續修改';
        editButton.addEventListener('click', async () => {
            try {
                clearImageStudioError();
                await setImageSourceFromBlob(result.blob, 'Venice 生成圖片');
                setImageStudioMode('edit');
                imageSourceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (error) {
                showImageStudioError(error instanceof Error ? error.message : '無法載入這張圖片。');
            }
        });

        const meta = document.createElement('p');
        meta.className = 'image-result-meta';
        meta.textContent = [
            result.model,
            typeof result.seed === 'number' ? `Seed ${result.seed}` : '',
            result.createdAt.toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit' }),
        ].filter(Boolean).join(' · ');

        actions.append(downloadButton, editButton);
        card.append(image, actions, meta);
        imageStudioResults.appendChild(card);
    });
};

const clearImageResults = () => {
    imageResults.forEach(result => URL.revokeObjectURL(result.url));
    imageResults = [];
    renderImageResults();
    imageStudioStatus.textContent = '作品已清除';
};

const cancelImageRequest = () => {
    imageRequestController?.abort();
    imageRequestController = null;
    if (isImageRequestRunning) {
        setImageStudioBusy(false);
        imageStudioStatus.textContent = '已停止生成';
    }
};

const runImageGeneration = async () => {
    const prompt = imagePrompt.value.trim();
    const model = getSelectedImageModel();
    clearImageStudioError();

    if (!prompt || !model || !imageAdultConfirm.checked) {
        showImageStudioError('請填寫畫面描述、選擇模型並確認成年及圖片使用權。');
        return;
    }
    if (imageStudioMode === 'edit' && !imageSource) {
        showImageStudioError('圖生圖需要先加入一張來源圖片。');
        return;
    }
    if (/\b(?:minor|underage|child|kid|teen(?:ager)?|schoolgirl|schoolboy|loli|shota)\b|(?:未成年|幼女|兒童|小孩|學生妹)/i.test(prompt)) {
        showImageStudioError('此工作室只可生成明確成年的人物，請修改描述。');
        return;
    }

    const controller = new AbortController();
    imageRequestController = controller;
    setImageStudioBusy(true);
    imageStudioStatus.textContent = imageStudioMode === 'generate'
        ? '正在生成畫面...'
        : '正在分析並修改來源圖片...';
    const startedAt = performance.now();

    try {
        const hasAspectRatioApi = Boolean(model.constraints.aspectRatios?.length);
        const pixelSize = PIXEL_IMAGE_DIMENSIONS[imageAspectRatio.value] || PIXEL_IMAGE_DIMENSIONS['1:1'];
        const seedValue = imageStudioMode === 'generate'
            ? getDeps().resolveSharedSeed()
            : undefined;
        imageSeed.value = typeof seedValue === 'number' ? String(seedValue) : imageSeed.value;
        const result = await getDeps().requestImage({
            mode: imageStudioMode,
            model: model.id,
            prompt,
            negativePrompt: imageNegativePrompt.value.trim(),
            sourceImageBase64: imageSource?.base64,
            aspectRatio: imageStudioMode === 'edit' || hasAspectRatioApi ? imageAspectRatio.value : undefined,
            resolution: model.constraints.resolutions?.length ? imageResolution.value : undefined,
            width: imageStudioMode === 'generate' && !hasAspectRatioApi ? pixelSize.width : undefined,
            height: imageStudioMode === 'generate' && !hasAspectRatioApi ? pixelSize.height : undefined,
            variants: imageStudioMode === 'generate' ? Number(imageVariants.value || 1) : 1,
            steps: imageStudioMode === 'generate' ? model.constraints.steps?.default : undefined,
            seed: Number.isFinite(seedValue) ? seedValue : undefined,
            adultConfirmed: true,
            signal: controller.signal,
        });

        const now = new Date();
        const newResults: ImageStudioResult[] = result.blobs.map((blob, index) => ({
            id: `${now.getTime()}-${index}`,
            blob,
            url: URL.createObjectURL(blob),
            prompt,
            model: model.name,
            modelId: model.id,
            mode: imageStudioMode,
            aspectRatio: imageAspectRatio.value,
            resolution: model.constraints.resolutions?.length ? imageResolution.value : undefined,
            negativePrompt: imageNegativePrompt.value.trim(),
            sourceImageBase64: imageStudioMode === 'edit' ? imageSource?.base64 : undefined,
            seed: seedValue,
            createdAt: now,
        }));
        imageResults = [...newResults, ...imageResults];
        renderImageResults();
        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
        imageStudioStatus.textContent = [
            `完成 ${newResults.length} 張`,
            typeof seedValue === 'number' ? `Seed ${seedValue}` : '',
            `${elapsed} 秒`,
        ].filter(Boolean).join(' · ');
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            imageStudioStatus.textContent = '已停止生成';
        } else {
            const message = error instanceof Error ? error.message : '圖片生成失敗。';
            showImageStudioError(message);
            imageStudioStatus.textContent = '生成失敗';
            if (message === VENICE_AUTH_REQUIRED_ERROR) getDeps().handleAuthRequired();
        }
    } finally {
        if (imageRequestController === controller) imageRequestController = null;
        setImageStudioBusy(false);
    }
};

const navigateBackFromImageStudio = () => {
    cancelImageRequest();
    const currentState = window.history.state as { view?: string } | null;
    if (currentState?.view === 'image') {
        window.history.back();
        return;
    }
    getDeps().showSelectionView();
};

const attachListeners = () => {
    if (listenersAttached) return;
    listenersAttached = true;

    imageStudioBack.addEventListener('click', navigateBackFromImageStudio);
    imageModeGenerateBtn.addEventListener('click', () => setImageStudioMode('generate'));
    imageModeEditBtn.addEventListener('click', () => setImageStudioMode('edit'));
    imageModelSelect.addEventListener('change', () => {
        if (!imageModelSelect.value || isImageRequestRunning) return;
        getDeps().setSelectedImageModelId(imageStudioMode, imageModelSelect.value);
        updateImageModelControls();
    });
    refreshImageModelsBtn.addEventListener('click', () => {
        void loadModelsAndRender(imageStudioMode, true);
    });
    imagePrompt.addEventListener('input', updateImagePromptCounter);
    imageAspectRatio.addEventListener('change', updateImageCostEstimate);
    imageResolution.addEventListener('change', updateImageCostEstimate);
    imageVariants.addEventListener('change', updateImageCostEstimate);
    imageSeedLock.addEventListener('change', () => {
        getDeps().setSharedSeedLocked(imageSeedLock.checked);
        if (imageSeedLock.checked) {
            const seed = getDeps().getSharedSeed() ?? getDeps().randomizeSharedSeed();
            imageSeed.value = String(seed);
        }
    });
    imageSeedRandom.addEventListener('click', () => {
        imageSeed.value = String(getDeps().randomizeSharedSeed());
    });
    imageSeed.addEventListener('change', () => {
        const normalized = Number(imageSeed.value);
        if (!Number.isFinite(normalized)) return;
        imageSeed.value = String(getDeps().setSharedSeed(normalized));
    });
    imageAdultConfirm.addEventListener('change', () => {
        sessionStorage.setItem(IMAGE_ADULT_CONFIRM_STORAGE_KEY, String(imageAdultConfirm.checked));
        updateImageGenerateButton();
    });
    imageSourceDropzone.addEventListener('click', () => imageSourceInput.click());
    imageSourceInput.addEventListener('change', () => {
        void loadImageSourceFile(imageSourceInput.files?.[0]);
    });
    imageSourceDropzone.addEventListener('dragover', event => {
        event.preventDefault();
        imageSourceDropzone.classList.add('is-dragging');
    });
    imageSourceDropzone.addEventListener('dragleave', () => {
        imageSourceDropzone.classList.remove('is-dragging');
    });
    imageSourceDropzone.addEventListener('drop', event => {
        event.preventDefault();
        imageSourceDropzone.classList.remove('is-dragging');
        void loadImageSourceFile(event.dataTransfer?.files?.[0]);
    });
    imageGenerateButton.addEventListener('click', () => {
        void runImageGeneration();
    });
    clearImageResultsBtn.addEventListener('click', clearImageResults);
};

export const createImageStudio = (deps: ImageStudioDependencies): ImageStudioHandle => {
    dependencies = deps;
    attachListeners();
    syncSeedControlsFromSharedState();

    return {
        show: (historyMode: ImageStudioHistoryMode = 'push') => {
            getDeps().cancelActiveChatRequest();
            getDeps().hideVideoStudio();
            getDeps().enterImageView(historyMode);
            imageStudioView.classList.remove('hidden');
            imageStudioView.classList.add('flex');
            imageAdultConfirm.checked = sessionStorage.getItem(IMAGE_ADULT_CONFIRM_STORAGE_KEY) === 'true';
            syncSeedControlsFromSharedState();
            renderImageResults();
            void loadModelsAndRender(imageStudioMode);
            updateImageGenerateButton();
        },
        hide: () => {
            imageStudioView.classList.add('hidden');
            imageStudioView.classList.remove('flex');
        },
        isVisible: () => !imageStudioView.classList.contains('hidden'),
        cancelRequest: cancelImageRequest,
        addResult: result => {
            imageResults = [result, ...imageResults];
            renderImageResults();
        },
        cleanup: () => {
            cancelImageRequest();
            imageResults.forEach(result => URL.revokeObjectURL(result.url));
            imageResults = [];
            if (imageSource) {
                URL.revokeObjectURL(imageSource.previewUrl);
                imageSource = null;
            }
        },
    };
};
