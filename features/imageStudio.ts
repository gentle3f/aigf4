import {queuePilotStudioMedia,refreshPilotStudioMedia} from '../pilotStudioMedia.js';
import { VPS_CHAT_BUILD } from '../vpsChatMode.js';
import { getSavedStudioImage,persistStudioImage,listSavedStudioImages,deleteSavedStudioImage } from '../studioMediaStore.js';
import type { CharacterPhotoAsset } from '../photoStore.js';
import { IMAGE_RECEIPT_KEY,readImageReceipt,createVpsImageTransport,submitDurableImage,type ImageReceipt } from '../vpsImageJob.js';
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
    savedAssetId?: string;
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
    getStudioRecovery?:()=>ReturnType<typeof import('../studioMediaRecoveryClient.js').createStudioMediaRecovery>|null;
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
        if(result.savedAssetId){
            const remove=document.createElement('button');remove.type='button';remove.className='image-result-action';remove.textContent='刪除已保存圖片';
            remove.onclick=()=>{if(isImageRequestRunning||!confirm('刪除這張本機保存圖片？'))return;void deleteSavedStudioImage(result.savedAssetId!).then(()=>{URL.revokeObjectURL(result.url);imageResults=imageResults.filter(r=>r.id!==result.id);renderImageResults();}).catch(()=>showImageStudioError('未能刪除已保存圖片。'));};
            actions.append(remove);
        }
        card.append(image, actions, meta);
        imageStudioResults.appendChild(card);
    });
};

const clearImageResults = () => {
    imageResults.forEach(result => URL.revokeObjectURL(result.url));
    imageResults = [];
    renderImageResults();
    imageStudioStatus.textContent = VPS_CHAT_BUILD?'本頁顯示已清除；已保存圖片可重新進入工作室取回。':'作品已清除';
};

const cancelImageRequest = () => {
    imageRequestController?.abort();
    imageRequestController = null;
    if (isImageRequestRunning) {
        setImageStudioBusy(false);
        imageStudioStatus.textContent = '已停止生成';
    }
};

const showSavedStudioImage=(asset:CharacterPhotoAsset)=>{
    if(imageResults.some(r=>r.id===asset.id))return;
    imageResults=[{id:asset.id,savedAssetId:asset.id,blob:asset.blob,url:URL.createObjectURL(asset.blob),prompt:asset.prompt,model:asset.studio?.modelName||'Qwen Image 3',modelId:'qwen-image-3',mode:'generate',aspectRatio:asset.studio?.aspectRatio||'1:1',resolution:asset.studio?.resolution,seed:asset.studio?.seed,createdAt:new Date(asset.createdAt)},...imageResults];
};
const restoreSavedStudioImages=async()=>{
    try{await refreshPilotStudioMedia().catch(e=>console.warn('Pilot media refresh pending:',e));for(const asset of await listSavedStudioImages())showSavedStudioImage(asset);renderImageResults();}
    catch{showImageStudioError('未能讀取本機已保存圖片。');}
};
const receiveVpsImage=async(receipt:ImageReceipt,signal:AbortSignal)=>{
    const transport=createVpsImageTransport();
    const deadline=Date.now()+300000;
    while(Date.now()<deadline){
        if(signal.aborted)throw new DOMException('Aborted','AbortError');
        const saved=await getSavedStudioImage(receipt);
        const blob=saved?.blob||await transport.retrieve(receipt,signal);
        if(signal.aborted)throw new DOMException('Aborted','AbortError');
        if(blob){
            if(!navigator.locks)throw Error('VPS_IMAGE_WEB_LOCKS_REQUIRED');
            await navigator.locks.request('aigf-vps-image-v1',async()=>{
                if(readImageReceipt(localStorage)?.jobId!==receipt.jobId||signal.aborted)throw Error('VPS_IMAGE_RECEIPT_CHANGED');
                const asset=await persistStudioImage(receipt,blob);
                queuePilotStudioMedia('image',asset.id);
                if(signal.aborted||readImageReceipt(localStorage)?.jobId!==receipt.jobId)throw Error('VPS_IMAGE_RECEIPT_CHANGED');
                showSavedStudioImage(asset);
                renderImageResults();
                localStorage.removeItem(IMAGE_RECEIPT_KEY);
                imageStudioStatus.textContent='圖片已保存至本機相片庫，可重新開啟工作室取回。';
            });
            return;
        }
        imageStudioStatus.textContent='VPS 背景生成中；可關閉手機，稍後取回。';
        await new Promise(resolve=>setTimeout(resolve,2000));
    }
    throw Error('背景工作仍待取回，原任務已保存。');
};
const resumeVpsImage=async()=>{
    if(!VPS_CHAT_BUILD||isImageRequestRunning)return;
    let receipt:ImageReceipt|null;
    try{receipt=readImageReceipt(localStorage);}catch{showImageStudioError('背景圖片紀錄無效；請清除紀錄後再試。');return;}
    if(!receipt)return;
    const controller=new AbortController();
    imageRequestController=controller;setImageStudioBusy(true);clearImageStudioError();
    try{await receiveVpsImage(receipt,controller.signal);}
    catch(e){if(!controller.signal.aborted){const message=e instanceof Error?e.message:'背景圖片取回失敗';showImageStudioError(message);if(message===VENICE_AUTH_REQUIRED_ERROR)getDeps().handleAuthRequired();}imageStudioStatus.textContent='背景任務紀錄已保留，沒有重新提交。';}
    finally{if(imageRequestController===controller){imageRequestController=null;setImageStudioBusy(false);}}
};
// Recover previously submitted jobs only. Never issue a generation request here.
const recoverCloudImages=async()=>{
    if(isImageRequestRunning)return true;
    const recovery=getDeps().getStudioRecovery?.();if(!recovery)return false;
    setImageStudioBusy(true);
    try{
        const rows=await recovery.list('image');
        for(const r of rows.filter(r=>r.status==='archived'||r.status==='transferred')){
            if(r.status==='archived'){
                try{await recovery.transfer(r);}catch(e){if(!(e instanceof Error)||e.message!=='STUDIO_RECOVERY_ALREADY_TRANSFERRED')throw e;}
            }
            if(readImageReceipt(localStorage)?.jobId===r.job_id&&await recovery.localAsset(r))localStorage.removeItem(IMAGE_RECEIPT_KEY);
        }
        await restoreSavedStudioImages();
        const pending=rows.some(r=>r.status==='pending');
        imageStudioStatus.textContent=pending?'雲端圖片任務尚在處理；毋須再次生成。':'已核對雲端圖片任務。';
        return pending;
    }finally{setImageStudioBusy(false);}
};
const runImageGeneration = async () => {
    if(isImageRequestRunning)return;
    if(VPS_CHAT_BUILD){
        try{if(await recoverCloudImages())return;if(readImageReceipt(localStorage)){await resumeVpsImage();return;}}
        catch{showImageStudioError('背景圖片紀錄無效；請清除紀錄後再試。');return;}
    }
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
        const options:VeniceImageRequest = {
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
        };
        if(VPS_CHAT_BUILD&&options.mode==='generate'&&options.model==='qwen-image-3'&&options.variants===1){
            if(!navigator.locks)throw Error('VPS_IMAGE_WEB_LOCKS_REQUIRED');
            const receipt=await submitDurableImage({options:{...options,sourceImageBase64:undefined},modelName:model.name,storage:localStorage,lock:async work=>await navigator.locks.request('aigf-vps-image-v1',work),transport:createVpsImageTransport(),beforeSubmit:async r=>{const recovery=getDeps().getStudioRecovery?.();if(recovery)await recovery.registerImage(r);}});
            await receiveVpsImage(receipt,controller.signal);
            return;
        }
        const result=await getDeps().requestImage(options);

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
    if(VPS_CHAT_BUILD){
        const controls=document.createElement('div');
        const resume=document.createElement('button');resume.type='button';resume.textContent='取回背景圖片';resume.onclick=()=>void resumeVpsImage();
        const abandon=document.createElement('button');abandon.type='button';abandon.textContent='清除背景任務紀錄';abandon.onclick=()=>{
            if(isImageRequestRunning||!navigator.locks)return;
            void navigator.locks.request('aigf-vps-image-v1',()=>{
                if(!localStorage.getItem(IMAGE_RECEIPT_KEY))return;
                if(confirm('清除本機背景任務紀錄？遠端工作不會取消；尚未下載的圖片可能無法再取回。')){localStorage.removeItem(IMAGE_RECEIPT_KEY);imageStudioStatus.textContent='本機背景任務紀錄已清除';}
            });
        };
        const note=document.createElement('p');note.textContent='VPS Preview：單張背景圖片須於 24 小時內取回，成功後自動保存本機。';
        controls.append(note,resume,abandon);
        if(import.meta.env?.VITE_AIGF_STUDIO_MEDIA_RECOVERY_V4==='1'){const cloud=document.createElement('button');cloud.type='button';cloud.textContent='取回雲端圖片';cloud.onclick=()=>void recoverCloudImages().catch(e=>showImageStudioError(e instanceof Error?e.message:'STUDIO_RECOVERY_FAILED'));controls.append(cloud);}
        imageStudioStatus.after(controls);
    }
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
            if(VPS_CHAT_BUILD){void restoreSavedStudioImages();void recoverCloudImages().then(pending=>{if(!pending)return resumeVpsImage();}).catch(e=>showImageStudioError(e instanceof Error?e.message:'STUDIO_RECOVERY_FAILED'));}
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
