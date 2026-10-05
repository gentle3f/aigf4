import {
    generateVeniceText,
    VENICE_ASSISTANT_MODEL,
    VENICE_AUTH_REQUIRED_ERROR,
    VENICE_CHAT_MODEL,
    VENICE_VIDEO_PROMPT_MODEL,
} from '../venice.js';
import type { VeniceMessage } from '../venice.js';
import {
    completeVeniceVideo,
    listVeniceVideoModels,
    queueVeniceVideo,
    quoteVeniceVideo,
    retrieveVeniceVideo,
    VENICE_VIDEO_IMAGE_MODEL,
    VENICE_VIDEO_TEXT_MODEL,
} from '../veniceVideo.js';
import type { VeniceVideoMode, VeniceVideoModelSummary } from '../veniceVideo.js';
import {
    readPersistedVideoJob as readPersistedVideoJobFromStorage,
    removePersistedVideoJob as removePersistedVideoJobFromStorage,
    writePersistedVideoJob as writePersistedVideoJobToStorage,
} from '../videoStudioPersistence.js';
import type { PersistedVideoJob } from '../videoStudioPersistence.js';
import { setPersistedAppSetting } from '../appSettings.js';

export type VideoStudioHistoryMode = 'push' | 'replace' | 'skip';

export type VideoStudioDependencies = {
    isUnlocked: () => boolean;
    handleAuthRequired: () => void;
    cancelActiveChatRequest: () => void;
    enterVideoView: (historyMode: VideoStudioHistoryMode) => void;
    showSelectionView: () => void;
};

export type VideoStudioHandle = {
    show: (historyMode?: VideoStudioHistoryMode) => void;
    hide: () => void;
    isVisible: () => boolean;
    cancelPromptOptimization: () => void;
    resumePending: (source?: 'auto' | 'manual') => Promise<void>;
    hasPendingJob: () => boolean;
    refreshControls: () => void;
};

let dependencies: VideoStudioDependencies | null = null;
const getDependencies = () => {
    if (!dependencies) throw new Error('Video Studio dependencies are not initialized.');
    return dependencies;
};

const videoStudioView = document.getElementById('video-studio-view')!;
const videoStudioBack = document.getElementById('video-studio-back') as HTMLButtonElement;
const videoModeImageBtn = document.getElementById('video-mode-image') as HTMLButtonElement;
const videoModeTextBtn = document.getElementById('video-mode-text') as HTMLButtonElement;
const videoModelSelect = document.getElementById('video-model-select') as HTMLSelectElement;
const videoModelMeta = document.getElementById('video-model-meta')!;
const refreshVideoModelsBtn = document.getElementById('refresh-video-models') as HTMLButtonElement;
const videoSourceSection = document.getElementById('video-source-section')!;
const videoSourceInput = document.getElementById('video-source-input') as HTMLInputElement;
const videoSourceDropzone = document.getElementById('video-source-dropzone') as HTMLButtonElement;
const videoSourceEmpty = document.getElementById('video-source-empty')!;
const videoSourcePreviewWrap = document.getElementById('video-source-preview-wrap')!;
const videoSourcePreview = document.getElementById('video-source-preview') as HTMLImageElement;
const videoSourceMeta = document.getElementById('video-source-meta')!;
const videoSourceRemove = document.getElementById('video-source-remove') as HTMLButtonElement;
const videoPrompt = document.getElementById('video-prompt') as HTMLTextAreaElement;
const videoPromptCount = document.getElementById('video-prompt-count')!;
const videoPromptHint = document.getElementById('video-prompt-hint')!;
const videoPromptFeedback = document.getElementById('video-prompt-feedback')!;
const videoPromptOptimizeButton = document.getElementById('video-prompt-optimize') as HTMLButtonElement;
const videoPromptOptimizeLabel = document.getElementById('video-prompt-optimize-label')!;
const videoPromptOptimizeSpinner = document.getElementById('video-prompt-optimize-spinner')!;
const videoNegativePrompt = document.getElementById('video-negative-prompt') as HTMLTextAreaElement;
const videoDuration = document.getElementById('video-duration') as HTMLSelectElement;
const videoResolutionWrap = document.getElementById('video-resolution-wrap')!;
const videoResolution = document.getElementById('video-resolution') as HTMLSelectElement;
const videoAspectRatioWrap = document.getElementById('video-aspect-ratio-wrap')!;
const videoAspectRatio = document.getElementById('video-aspect-ratio') as HTMLSelectElement;
const videoAudioWrap = document.getElementById('video-audio-wrap')!;
const videoAudio = document.getElementById('video-audio') as HTMLInputElement;
const videoAdultConfirm = document.getElementById('video-adult-confirm') as HTMLInputElement;
const videoStudioError = document.getElementById('video-studio-error')!;
const videoGenerateButton = document.getElementById('video-generate-button') as HTMLButtonElement;
const videoGenerateLabel = document.getElementById('video-generate-label')!;
const videoGenerateSpinner = document.getElementById('video-generate-spinner')!;
const videoCancelButton = document.getElementById('video-cancel-button') as HTMLButtonElement;
const videoStudioStatus = document.getElementById('video-studio-status')!;
const videoCostEstimate = document.getElementById('video-cost-estimate')!;
const videoStudioEmpty = document.getElementById('video-studio-empty')!;
const videoStudioResults = document.getElementById('video-studio-results')!;
const clearVideoResultsBtn = document.getElementById('clear-video-results') as HTMLButtonElement;
const videoProgressSteps = Array.from(document.querySelectorAll<HTMLElement>('[data-video-stage]'));

const VIDEO_IMAGE_MODEL_STORAGE_KEY = 'veniceVideoImageModel';
const VIDEO_TEXT_MODEL_STORAGE_KEY = 'veniceVideoTextModel';
const VIDEO_ADULT_CONFIRM_STORAGE_KEY = 'veniceVideoAdultConfirmed';
const VIDEO_PROMPT_OPTIMIZER_TIMEOUT_MS = 45_000;
const VIDEO_PROMPT_OPTIMIZER_ATTEMPT_TIMEOUT_MS = 15_000;
const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_TIMEOUT_MS = 15 * 60_000;

type VideoStudioSource = {
    blob: Blob;
    dataUrl: string;
    previewUrl: string;
    width: number;
    height: number;
    name: string;
};

type VideoStudioResult = {
    id: string;
    url: string;
    isObjectUrl: boolean;
    prompt: string;
    model: string;
    modelId: string;
    queueId: string;
    createdAt: Date;
    needsRemoteCleanup: boolean;
};

const readPreferredVideoModel = (
    storageKey: 'veniceVideoImageModel' | 'veniceVideoTextModel',
    preferredModel: string,
    legacyDefault: string,
) => {
    const stored = localStorage.getItem(storageKey);
    if (!stored || stored === legacyDefault) {
        setPersistedAppSetting(storageKey, preferredModel);
        return preferredModel;
    }
    return stored;
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

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

const extractXmlTag = (text: string, tag: string) => {
    const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match?.[1]?.trim() || '';
};

let videoStudioMode: VeniceVideoMode = 'image-to-video';
let videoModels: Record<VeniceVideoMode, VeniceVideoModelSummary[]> = {
    'image-to-video': [],
    'text-to-video': [],
};
let videoModelPromises: Record<VeniceVideoMode, Promise<void> | null> = {
    'image-to-video': null,
    'text-to-video': null,
};
let selectedVideoModels: Record<VeniceVideoMode, string> = {
    'image-to-video': readPreferredVideoModel(
        VIDEO_IMAGE_MODEL_STORAGE_KEY,
        VENICE_VIDEO_IMAGE_MODEL,
        'wan-2-7-image-to-video',
    ),
    'text-to-video': readPreferredVideoModel(
        VIDEO_TEXT_MODEL_STORAGE_KEY,
        VENICE_VIDEO_TEXT_MODEL,
        'wan-2-7-text-to-video',
    ),
};
let videoSource: VideoStudioSource | null = null;
let videoResults: VideoStudioResult[] = [];
let videoRequestController: AbortController | null = null;
let videoQuoteController: AbortController | null = null;
let videoQuoteTimer: number | null = null;
let videoQuoteVersion = 0;
let videoQuoteUsd: number | null = null;
let videoPromptOptimizerController: AbortController | null = null;
let isVideoPromptOptimizing = false;
let lastVideoPromptOptimization: { settingsKey: string; output: string } | null = null;
let isVideoRequestRunning = false;
let pendingVideoJob: PersistedVideoJob | null = null;
let videoLastProgressIndex = -1;

const buildFallbackVideoModels = (mode: VeniceVideoMode): VeniceVideoModelSummary[] => {
    if (mode === 'text-to-video') {
        return [
            {
                id: VENICE_VIDEO_TEXT_MODEL,
                name: 'Wan 2.7 Enhanced',
                mode,
                privacy: 'anonymized',
                modelSets: ['uncensored', 'high_resolution', 'long_duration', 'venice_recommendations'],
                traits: [],
                constraints: {
                    model_type: mode,
                    aspect_ratios: ['16:9', '9:16', '1:1'],
                    resolutions: ['720p', '1080p'],
                    durations: ['5s', '10s', '15s'],
                    audio: false,
                    audio_configurable: false,
                },
            },
            {
                id: 'grok-imagine-1-5-text-to-video-private',
                name: 'Grok Imagine 1.5',
                mode,
                privacy: 'private',
                modelSets: ['photorealistic', 'high_resolution', 'audio'],
                traits: [],
                constraints: {
                    model_type: mode,
                    aspect_ratios: ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'],
                    resolutions: ['480p', '720p', '1080p'],
                    durations: Array.from({ length: 15 }, (_, index) => `${index + 1}s`),
                    audio: true,
                    audio_configurable: false,
                    prompt_character_limit: 4096,
                },
            },
            {
                id: 'happyhorse-1-1-text-to-video',
                name: 'HappyHorse 1.1',
                mode,
                privacy: 'anonymized',
                modelSets: ['high_resolution', 'audio'],
                traits: [],
                constraints: {
                    model_type: mode,
                    aspect_ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '4:5'],
                    resolutions: ['720p', '1080p'],
                    durations: Array.from({ length: 13 }, (_, index) => `${index + 3}s`),
                    audio: true,
                    audio_configurable: false,
                },
            },
        ];
    }

    return [
        {
            id: VENICE_VIDEO_IMAGE_MODEL,
            name: 'Wan 2.7 Enhanced',
            mode,
            privacy: 'anonymized',
            modelSets: ['uncensored', 'high_resolution', 'long_duration', 'venice_recommendations'],
            traits: [],
            constraints: {
                model_type: mode,
                aspect_ratios: [],
                resolutions: ['720p', '1080p'],
                durations: ['5s', '10s', '15s'],
                audio: false,
                audio_configurable: false,
            },
        },
        {
            id: 'wan-2.1-pro-image-to-video',
            name: 'Wan 2.1 Pro',
            mode,
            privacy: 'private',
            modelSets: ['uncensored', 'open_source'],
            traits: [],
            constraints: {
                model_type: mode,
                aspect_ratios: ['16:9'],
                resolutions: [],
                durations: ['6s'],
                audio: false,
                audio_configurable: false,
            },
        },
        {
            id: 'grok-imagine-image-to-video-private',
            name: 'Grok Imagine',
            mode,
            privacy: 'private',
            modelSets: ['photorealistic', 'audio', 'long_duration'],
            traits: [],
            constraints: {
                model_type: mode,
                aspect_ratios: [],
                resolutions: ['480p', '720p'],
                durations: Array.from({ length: 15 }, (_, index) => `${index + 1}s`),
                audio: true,
                audio_configurable: false,
                prompt_character_limit: 4096,
            },
        },
        {
            id: 'grok-imagine-1-5-image-to-video-private',
            name: 'Grok Imagine 1.5',
            mode,
            privacy: 'private',
            modelSets: ['photorealistic', 'high_resolution', 'audio', 'venice_recommendations'],
            traits: [],
            constraints: {
                model_type: mode,
                aspect_ratios: [],
                resolutions: ['480p', '720p', '1080p'],
                durations: Array.from({ length: 15 }, (_, index) => `${index + 1}s`),
                audio: true,
                audio_configurable: false,
                prompt_character_limit: 4096,
            },
        },
        {
            id: 'ltx-2-v2-3-fast-image-to-video',
            name: 'LTX Video 2.3 Fast',
            mode,
            privacy: 'anonymized',
            modelSets: ['high_resolution', 'audio', 'open_source'],
            traits: [],
            constraints: {
                model_type: mode,
                aspect_ratios: ['16:9', '9:16'],
                resolutions: ['1080p', '1440p', '2160p'],
                durations: ['6s', '8s', '10s', '12s', '14s', '16s', '18s', '20s'],
                audio: true,
                audio_configurable: true,
            },
        },
    ];
};

const getSelectedVideoModel = () => {
    return videoModels[videoStudioMode].find(model => model.id === selectedVideoModels[videoStudioMode]);
};

const isUncensoredVideoModel = (model: VeniceVideoModelSummary) => {
    return model.modelSets.some(value => value.toLowerCase() === 'uncensored');
};

const formatVideoPrivacy = (privacy: string) => {
    if (privacy === 'private') return '私人處理';
    if (privacy === 'anonymized') return '匿名化處理';
    return privacy === 'unknown' ? '' : privacy;
};

const readPersistedVideoJob = (): PersistedVideoJob | null => readPersistedVideoJobFromStorage();

const persistVideoJob = (job: PersistedVideoJob): boolean => {
    pendingVideoJob = job;
    const persisted = writePersistedVideoJobToStorage(job);
    if (!persisted) {
        showVideoStudioError('工作已提交，但瀏覽器無法保存恢復資料；完成前請保持此分頁開啟。');
    }
    return persisted;
};

const clearPersistedVideoJob = () => {
    pendingVideoJob = null;
    removePersistedVideoJobFromStorage();
};
const setVideoProgressState = (
    state: 'idle' | 'quoting' | 'quoted' | 'queueing' | 'generating' | 'paused' | 'completed' | 'error',
) => {
    const stageIndexes: Record<string, number> = { quote: 0, queue: 1, generate: 2, complete: 3 };
    let activeIndex = -1;
    let completedThrough = -1;

    if (state === 'quoting') activeIndex = 0;
    if (state === 'quoted') completedThrough = 0;
    if (state === 'queueing') {
        activeIndex = 1;
        completedThrough = 0;
    }
    if (state === 'generating') {
        activeIndex = 2;
        completedThrough = 1;
    }
    if (state === 'paused') completedThrough = 1;
    if (state === 'completed') completedThrough = 3;
    if (state === 'error') activeIndex = Math.max(0, videoLastProgressIndex);

    if (activeIndex >= 0 && state !== 'error') videoLastProgressIndex = activeIndex;
    videoProgressSteps.forEach(step => {
        const index = stageIndexes[step.dataset.videoStage || ''] ?? -1;
        step.classList.toggle('is-complete', index >= 0 && index <= completedThrough);
        step.classList.toggle('is-active', index === activeIndex && state !== 'error');
        step.classList.toggle('is-error', index === activeIndex && state === 'error');
    });
};

const showVideoStudioError = (message: string) => {
    videoStudioError.textContent = message;
    videoStudioError.classList.remove('hidden');
};

const clearVideoStudioError = () => {
    videoStudioError.textContent = '';
    videoStudioError.classList.add('hidden');
};

const containsDisallowedMinorTerms = (text: string) => {
    return /\b(?:minor|underage|child|kid|teen(?:ager)?|schoolgirl|schoolboy|loli|shota)\b|(?:未成年|幼女|兒童|小孩|學生妹)/i.test(text);
};

const getVideoModelIdentity = (model: VeniceVideoModelSummary) => {
    return `${model.id} ${model.name}`.toLowerCase();
};

const isWan27VideoModel = (model: VeniceVideoModelSummary) => {
    return /wan[\s._-]*2[\s._-]*7/.test(getVideoModelIdentity(model));
};

const getVideoPromptTargetLabel = (model: VeniceVideoModelSummary) => {
    return isWan27VideoModel(model) ? 'Wan 2.7' : `${model.name} (${model.id})`;
};

const getVideoPromptModelStyle = (model: VeniceVideoModelSummary) => {
    const identity = getVideoModelIdentity(model);
    if (identity.includes('seedance')) {
        return 'Use structured cinematic language: shot size, deliberate camera movement, lighting, location, then an exact chronological action sequence.';
    }
    if (identity.includes('grok')) {
        return 'Use natural, mood-driven language. Prioritize emotion, atmosphere, subtle expression, and how the moment should feel over dense lens jargon.';
    }
    if (/happy[\s-]?horse/.test(identity)) {
        return 'Use clear practical motion language with realistic body mechanics, weight shifts, balance, limb direction, timing, and fluid camera tracking.';
    }
    if (isWan27VideoModel(model)) {
        return 'Treat every Wan 2.7 variant, including Enhanced, as the same Wan 2.7 prompt family. Be exceptionally explicit and detailed. Separate the initial state from the visible action timeline, then use First, Then, and Finally. State exactly who does what, to whom or what, in which direction, in what order, and how each movement finishes. Never rely on implication.';
    }
    if (identity.includes('wan')) {
        return 'Be exceptionally explicit and detailed: state exactly who does what, to whom or what, in which direction, in what order, and how each movement finishes. Never rely on implication.';
    }
    if (/(?:kling|runway|veo|ltx|pixverse|vidu)/.test(identity)) {
        return 'Use one coherent cinematic shot with a precise subject, chronological action beats, restrained camera direction, lighting, environment motion, and continuity.';
    }
    return 'Use a balanced production-ready prompt with a concrete subject, chronological action, camera movement, environment, lighting, timing, and continuity.';
};

const getVideoPromptStructureRule = (model: VeniceVideoModelSummary) => {
    if (!isWan27VideoModel(model)) {
        return 'Return one coherent production prompt without commentary.';
    }
    return [
        'Use this exact compact Wan 2.7 structure in English:',
        'Subject: identify only the adult subject or subjects explicitly present; never invent clothing, appearance, ethnicity, hairstyle, or accessories.',
        'Initial state: include only facts explicitly true before movement begins; if the initial facing direction is unstated, leave it unstated.',
        'Action sequence: preserve the exact count and order of requested human actions. Write First, Then, and Finally as explicit visible beats. Never place the result of First into Initial state.',
        'Camera: copy the requested camera instruction; if none exists, use a stationary camera.',
        'Environment: copy only the stated setting, light, weather, objects, and secondary motion. Never invent rain, fog, traffic, props, or atmospheric events.',
        'Continuity: preserve identity, anatomy, clothing, objects, direction, and background unless the draft explicitly requests a change.',
        'Keep direct adult or NSFW terms equally direct in the Action sequence; never sanitize them into vague romance, intimacy, revealing clothing, or a generic transformation.',
        'Do not omit any label. Do not add a title, explanation, bullet list, alternative version, warning, or moral commentary.',
    ].join(' ');
};

const getVideoPromptSettingsKey = (model: VeniceVideoModelSummary) => JSON.stringify({
    mode: videoStudioMode,
    model: model.id,
    duration: videoDuration.value,
    resolution: videoResolutionWrap.classList.contains('hidden') ? '' : videoResolution.value,
    aspectRatio: videoAspectRatioWrap.classList.contains('hidden') ? '' : videoAspectRatio.value,
    audio: model.constraints.audio_configurable
        ? videoAudio.checked
        : model.constraints.audio === true,
});

const updateVideoPromptOptimizerButton = () => {
    const modelReady = Boolean(getSelectedVideoModel());
    const promptReady = Boolean(videoPrompt.value.trim());
    videoPromptOptimizeButton.disabled = isVideoPromptOptimizing
        || isVideoRequestRunning
        || Boolean(pendingVideoJob)
        || !getDependencies().isUnlocked()
        || !modelReady
        || !promptReady;
    videoPromptOptimizeButton.setAttribute('aria-busy', String(isVideoPromptOptimizing));
};

const updateVideoGenerateButton = () => {
    if (pendingVideoJob) {
        videoGenerateButton.disabled = isVideoRequestRunning || isVideoPromptOptimizing || !getDependencies().isUnlocked();
        if (!isVideoRequestRunning) videoGenerateLabel.textContent = '繼續查詢未完成影片';
        return;
    }
    const modelReady = Boolean(videoModelSelect.value);
    const promptReady = Boolean(videoPrompt.value.trim());
    const sourceReady = videoStudioMode === 'text-to-video' || Boolean(videoSource);
    const quoteReady = typeof videoQuoteUsd === 'number';
    videoGenerateButton.disabled = isVideoRequestRunning
        || isVideoPromptOptimizing
        || !modelReady
        || !promptReady
        || !sourceReady
        || !quoteReady
        || !videoAdultConfirm.checked;
    if (!isVideoRequestRunning) {
        videoGenerateLabel.textContent = quoteReady
            ? `開始生成 · US$${formatModelPrice(videoQuoteUsd as number)}`
            : '開始生成影片';
    }
};

const updateVideoPromptCounter = () => {
    const maxLength = getSelectedVideoModel()?.constraints.prompt_character_limit || 2500;
    videoPrompt.maxLength = maxLength;
    videoPromptCount.textContent = `${videoPrompt.value.length} / ${maxLength}`;
    updateVideoPromptOptimizerButton();
    updateVideoGenerateButton();
};

const getVideoPricingOptions = () => {
    const model = getSelectedVideoModel();
    if (!model || !videoDuration.value) return null;
    return {
        model: model.id,
        duration: videoDuration.value,
        resolution: videoResolutionWrap.classList.contains('hidden') ? undefined : videoResolution.value,
        aspectRatio: videoAspectRatioWrap.classList.contains('hidden') ? undefined : videoAspectRatio.value,
        audio: model.constraints.audio_configurable ? videoAudio.checked : undefined,
    };
};

const cancelPendingVideoQuote = () => {
    videoQuoteVersion += 1;
    if (videoQuoteTimer !== null) {
        window.clearTimeout(videoQuoteTimer);
        videoQuoteTimer = null;
    }
    videoQuoteController?.abort();
    videoQuoteController = null;
};

const scheduleVideoQuote = (delay = 320) => {
    if (isVideoRequestRunning || isVideoPromptOptimizing || pendingVideoJob) return;
    cancelPendingVideoQuote();
    const pricing = getVideoPricingOptions();
    videoQuoteUsd = null;
    updateVideoGenerateButton();
    if (!pricing) {
        videoCostEstimate.textContent = '';
        setVideoProgressState('idle');
        return;
    }

    const version = videoQuoteVersion;
    videoCostEstimate.textContent = '正在報價...';
    setVideoProgressState('quoting');
    videoQuoteTimer = window.setTimeout(async () => {
        videoQuoteTimer = null;
        const controller = new AbortController();
        videoQuoteController = controller;
        try {
            const quote = await quoteVeniceVideo({ ...pricing, signal: controller.signal });
            if (version !== videoQuoteVersion) return;
            videoQuoteUsd = quote;
            videoCostEstimate.textContent = `即時報價 US$${formatModelPrice(quote)}`;
            videoStudioStatus.textContent = '報價已更新，生成時只會提交一次';
            clearVideoStudioError();
            setVideoProgressState('quoted');
        } catch (error) {
            if (controller.signal.aborted || version !== videoQuoteVersion) return;
            const message = error instanceof Error ? error.message : '無法取得影片報價。';
            videoCostEstimate.textContent = '報價失敗';
            videoStudioStatus.textContent = '無法取得即時報價';
            showVideoStudioError(message);
            setVideoProgressState('error');
            if (message === VENICE_AUTH_REQUIRED_ERROR) getDependencies().handleAuthRequired();
        } finally {
            if (videoQuoteController === controller) videoQuoteController = null;
            updateVideoGenerateButton();
        }
    }, delay);
};

type VideoPromptFeedbackTone = 'info' | 'success' | 'error';

const setVideoPromptFeedback = (message: string, tone: VideoPromptFeedbackTone = 'info') => {
    videoPromptFeedback.textContent = message;
    videoPromptFeedback.classList.remove('hidden', 'is-success', 'is-error');
    if (tone === 'success') videoPromptFeedback.classList.add('is-success');
    if (tone === 'error') videoPromptFeedback.classList.add('is-error');
};

const clearVideoPromptFeedback = () => {
    videoPromptFeedback.textContent = '';
    videoPromptFeedback.classList.add('hidden');
    videoPromptFeedback.classList.remove('is-success', 'is-error');
};

const cleanVideoPromptCandidate = (candidate: string) => {
    return candidate
        .replace(/^```(?:text|markdown)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/<\/?optimized_prompt>/gi, '')
        .replace(/^#{1,4}\s*(?:optimized\s+)?(?:video\s+)?prompt\s*[:：]?\s*/i, '')
        .replace(/^(?:optimized\s+)?(?:video\s+)?prompt\s*[:：]\s*/i, '')
        .replace(/^["“]|["”]$/g, '')
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const isVideoPromptOptimizerRefusal = (candidate: string) => {
    return /^(?:#{1,4}\s*)?(?:sorry\b|i(?:['’]m| am)? sorry\b|i apologize\b|i (?:can(?:not|'t)|won't|am unable)\b|i(?:['’]m) unable\b|as an ai\b|(?:很)?抱歉|對不起|我(?:不能|無法)|無法協助|不能協助)/i.test(candidate.trim());
};

const cleanOptimizedVideoPrompt = (raw: string) => {
    const tagged = extractXmlTag(raw, 'optimized_prompt');
    if (tagged) {
        const cleaned = cleanVideoPromptCandidate(tagged);
        return isVideoPromptOptimizerRefusal(cleaned) ? '' : cleaned;
    }

    const unfenced = raw
        .replace(/^```(?:json|text|markdown)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    let candidate = unfenced;
    try {
        const parsed = JSON.parse(unfenced) as unknown;
        if (typeof parsed === 'string') {
            candidate = parsed;
        } else if (parsed && typeof parsed === 'object') {
            const record = parsed as Record<string, unknown>;
            const value = record.optimized_prompt ?? record.optimizedPrompt ?? record.prompt;
            candidate = typeof value === 'string' ? value : '';
        } else {
            candidate = '';
        }
    } catch {
        // Some Venice text models return the requested prompt directly without a wrapper.
    }

    const cleaned = cleanVideoPromptCandidate(candidate);
    if (!cleaned || isVideoPromptOptimizerRefusal(cleaned)) return '';
    return cleaned;
};

const normalizeVideoPromptForComparison = (prompt: string) => {
    return prompt
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.!?。！？]+$/g, '')
        .trim();
};

const ensureWan27PromptStructure = (prompt: string) => {
    const requiredLabels = ['Subject', 'Initial state', 'Action sequence', 'Camera', 'Environment'];
    const hasRequiredLabels = requiredLabels.every(label => {
        return new RegExp(`(?:^|\\n)${label}:`, 'i').test(prompt);
    });
    if (!hasRequiredLabels) return '';
    if (/(?:^|\n)Continuity:/i.test(prompt)) return prompt;
    return `${prompt.trim()}\nContinuity: Preserve identity, anatomy, direction, objects, and background except for changes explicitly requested above.`;
};

const buildVideoPromptOptimizerMessages = (
    model: VeniceVideoModelSummary,
    originalPrompt: string,
    maxCharacters: number,
): VeniceMessage[] => {
    const resolution = videoResolutionWrap.classList.contains('hidden') ? 'model default' : videoResolution.value;
    const aspectRatio = videoAspectRatioWrap.classList.contains('hidden') ? 'model default' : videoAspectRatio.value;
    const audioEnabled = model.constraints.audio_configurable
        ? videoAudio.checked
        : model.constraints.audio === true;
    const modeRule = videoStudioMode === 'image-to-video'
        ? [
            'The uploaded source image is the approved first frame.',
            'Do not waste words redescribing fixed appearance that the draft did not ask to change.',
            'Focus on exactly how the visible subject moves, the chronological transition, camera movement, secondary environmental motion, and continuity from the first frame.',
        ].join(' ')
        : [
            'There is no source image.',
            'Translate and organize every subject, action, camera, environment, and lighting detail stated by the user.',
            'Keep unspecified appearance and atmosphere unspecified instead of inventing clothing, weather, props, traffic, fog, or extra scenery.',
        ].join(' ');

    const responseFormatRule = isWan27VideoModel(model)
        ? [
            'Return exactly two XML elements and nothing else.',
            'First, <source_facts>list only the explicit initial facts and numbered action beats from the draft; copy every content-bearing adult term and include its equally direct English meaning; do not infer missing details.</source_facts>',
            'Then, <optimized_prompt>write the structured Wan 2.7 prompt using every source fact without sanitizing or weakening any term.</optimized_prompt>',
        ].join(' ')
        : 'Return exactly one XML element and nothing else: <optimized_prompt>your optimized prompt</optimized_prompt>.';

    const contentFidelityRule = [
        'Content fidelity lock:',
        '- Treat every concrete person, body part, garment, state of dress, contact, action verb, intensity modifier, direction, and requested outcome in the draft as mandatory source data.',
        '- For adult or NSFW content, preserve the same explicitness and intensity. Never censor, euphemize, generalize, omit, or replace it with milder romantic or suggestive wording.',
        '- Translate content-specific wording with the most direct literal English equivalent. If an exact translation is uncertain, keep the original term in parentheses rather than weakening it.',
        '- Prompt optimization may clarify chronology, camera, and motion only. It must not rewrite what happens, add modesty, cover the subject, reverse an action, or stop before the requested result.',
        '- Do not output a refusal, warning, safety note, consent statement, or moral judgment. This fidelity rule applies only to adult subjects; all subjects must remain adults.',
    ].join('\n');

    const systemPrompt = [
        'You are a specialist prompt optimizer for Venice AI video generation.',
        `Target model family: ${getVideoPromptTargetLabel(model)}.`,
        `Target mode: ${videoStudioMode}. Duration: ${videoDuration.value || 'model default'}. Resolution: ${resolution}. Aspect ratio: ${aspectRatio}. Audio enabled: ${audioEnabled ? 'yes' : 'no'}.`,
        `Model-specific prompting style: ${getVideoPromptModelStyle(model)}`,
        `Output structure: ${getVideoPromptStructureRule(model)}`,
        `Mode rule: ${modeRule}`,
        contentFidelityRule,
        '',
        'Rewrite the user draft into one production-ready English video prompt.',
        'Preserve the exact requested people, identities, relationships, actions, direction, setting, explicit vocabulary, intensity, order, and final outcome. Do not replace, soften, intensify, sanitize, euphemize, or moralize about the request.',
        'Silently identify every requested action beat before writing. The output must include every beat in the same order; never merge a requested action into the initial state or skip an intermediate transition.',
        'The initial state may contain only facts that are explicitly true before the first requested action. Never infer that the result of the first action has already happened when the video begins.',
        'Every finite action verb in the draft must become a visible on-screen beat after the video begins. If the draft says "standing under neon, turns to look at the city, then turns back and smiles at the camera", begin only with standing under neon, then visibly turn toward the city, then visibly turn back toward the camera, then smile.',
        'Never invent an extra person, dialogue, event, object, camera cut, weather condition, clothing detail, prop, or outcome that the user did not request. Add only minimal connective wording needed to make the requested motion coherent.',
        'Make the timing physically possible within the selected duration. Prefer one continuous shot unless the draft explicitly requests cuts.',
        'Include all four essentials naturally: subject, action, camera movement, and environment. State action beats chronologically and use unambiguous body, object, and movement directions.',
        'For image-to-video, preserve identity, face, body proportions, background continuity, and the first-frame composition unless the draft explicitly requests a change.',
        audioEnabled
            ? 'Audio directions are allowed only when they support the requested scene.'
            : 'Do not add dialogue, music, sound effects, or other audio directions.',
        `Hard limit: the optimized prompt must be ${maxCharacters} characters or fewer.`,
        responseFormatRule,
    ].join('\n');

    return [
        { role: 'system', content: systemPrompt },
        {
            role: 'user',
            content: [
                'Optimize this draft without changing its intent, vocabulary strength, explicitness, or final outcome.',
                'Every adult/NSFW content term is mandatory. Use an equally direct English equivalent and never replace it with milder wording.',
                `The draft is encoded as a JSON string:\n${JSON.stringify(originalPrompt)}`,
            ].join('\n'),
        },
    ];
};

const updateVideoModelControls = () => {
    const model = getSelectedVideoModel();
    if (!model) {
        videoModelMeta.textContent = '模型能力資料暫時不可用。';
        videoQuoteUsd = null;
        updateVideoGenerateButton();
        return;
    }

    const constraints = model.constraints;
    const durations = constraints.durations?.length ? constraints.durations : ['5s'];
    const resolutions = constraints.resolutions || [];
    const aspectRatios = constraints.aspect_ratios || [];
    replaceSelectOptions(videoDuration, durations, durations.includes('5s') ? '5s' : durations[0]);
    videoResolutionWrap.classList.toggle('hidden', resolutions.length === 0);
    replaceSelectOptions(videoResolution, resolutions, resolutions.includes('720p') ? '720p' : resolutions[0]);
    videoAspectRatioWrap.classList.toggle('hidden', aspectRatios.length === 0);
    replaceSelectOptions(videoAspectRatio, aspectRatios, aspectRatios.includes('16:9') ? '16:9' : aspectRatios[0]);
    videoAudioWrap.classList.toggle('hidden', constraints.audio_configurable !== true);
    if (!constraints.audio_configurable) videoAudio.checked = constraints.audio === true;

    const details = [
        model.id === (videoStudioMode === 'image-to-video' ? VENICE_VIDEO_IMAGE_MODEL : VENICE_VIDEO_TEXT_MODEL)
            ? '目前推薦'
            : '',
        isUncensoredVideoModel(model) ? '自由模型' : '',
        formatVideoPrivacy(model.privacy),
        model.modelSets.includes('photorealistic') ? '寫實人物' : '',
        model.modelSets.includes('high_resolution') ? '高解像度' : '',
        constraints.audio ? '包含音訊' : '無音訊',
        `${durations[0]}–${durations[durations.length - 1]}`,
    ].filter(Boolean);
    videoModelMeta.textContent = details.join(' · ');
    updateVideoPromptCounter();
    scheduleVideoQuote();
};

const renderVideoModelOptions = () => {
    const preferredId = videoStudioMode === 'image-to-video'
        ? VENICE_VIDEO_IMAGE_MODEL
        : VENICE_VIDEO_TEXT_MODEL;
    const models = [...videoModels[videoStudioMode]].sort((left, right) => {
        if (left.id === preferredId) return -1;
        if (right.id === preferredId) return 1;
        const leftUncensored = isUncensoredVideoModel(left);
        const rightUncensored = isUncensoredVideoModel(right);
        if (leftUncensored !== rightUncensored) return leftUncensored ? -1 : 1;
        if (left.privacy !== right.privacy) return left.privacy === 'private' ? -1 : 1;
        return left.name.localeCompare(right.name, 'zh-Hant');
    });

    if (!models.some(model => model.id === selectedVideoModels[videoStudioMode])) {
        selectedVideoModels[videoStudioMode] = models.find(model => model.id === preferredId)?.id
            || models.find(isUncensoredVideoModel)?.id
            || models[0]?.id
            || '';
    }

    videoModelSelect.innerHTML = '';
    const groups = [
        { label: '推薦', models: models.filter(model => model.id === preferredId) },
        {
            label: '自由模型',
            models: models.filter(model => model.id !== preferredId && isUncensoredVideoModel(model)),
        },
        {
            label: '其他私人模型',
            models: models.filter(model => model.id !== preferredId && !isUncensoredVideoModel(model) && model.privacy === 'private'),
        },
        {
            label: '其他模型',
            models: models.filter(model => model.id !== preferredId && !isUncensoredVideoModel(model) && model.privacy !== 'private'),
        },
    ];
    groups.forEach(group => {
        if (!group.models.length) return;
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        group.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            const labels = [
                isUncensoredVideoModel(model) ? '自由' : '',
                model.privacy === 'private' ? '私人' : '',
                model.modelSets.includes('photorealistic') ? '寫實' : '',
            ].filter(Boolean);
            option.textContent = `${model.name}${labels.length ? ` · ${labels.join(' · ')}` : ''}`;
            optgroup.appendChild(option);
        });
        videoModelSelect.appendChild(optgroup);
    });

    videoModelSelect.value = selectedVideoModels[videoStudioMode];
    videoModelSelect.disabled = isVideoRequestRunning
        || isVideoPromptOptimizing
        || Boolean(pendingVideoJob)
        || models.length === 0;
    updateVideoModelControls();
};

const loadVideoModels = async (mode: VeniceVideoMode = videoStudioMode, force = false) => {
    if (videoModelPromises[mode]) return videoModelPromises[mode];
    if (!force && videoModels[mode].length > 0) {
        if (mode === videoStudioMode) renderVideoModelOptions();
        return;
    }

    videoModelSelect.disabled = true;
    refreshVideoModelsBtn.disabled = true;
    videoModelMeta.textContent = '正在讀取 Venice 影片模型...';
    cancelPendingVideoQuote();

    videoModelPromises[mode] = (async () => {
        try {
            videoModels[mode] = await listVeniceVideoModels(mode);
            if (!videoModels[mode].length) throw new Error('沒有可用的影片模型。');
        } catch (error) {
            console.warn('Unable to load Venice video models; using fallback list.', error);
            videoModels[mode] = buildFallbackVideoModels(mode);
            if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
                getDependencies().handleAuthRequired();
            }
        } finally {
            videoModelPromises[mode] = null;
            refreshVideoModelsBtn.disabled = isVideoRequestRunning
                || isVideoPromptOptimizing
                || Boolean(pendingVideoJob);
            if (mode === videoStudioMode) renderVideoModelOptions();
        }
    })();

    return videoModelPromises[mode];
};

const setVideoStudioMode = (mode: VeniceVideoMode) => {
    if (isVideoRequestRunning || isVideoPromptOptimizing || pendingVideoJob) return;
    if (videoStudioMode === mode) {
        if (!videoModels[mode].length) void loadVideoModels(mode);
        return;
    }

    videoStudioMode = mode;
    const imageMode = mode === 'image-to-video';
    videoModeImageBtn.classList.toggle('is-active', imageMode);
    videoModeImageBtn.setAttribute('aria-selected', String(imageMode));
    videoModeTextBtn.classList.toggle('is-active', !imageMode);
    videoModeTextBtn.setAttribute('aria-selected', String(!imageMode));
    videoSourceSection.classList.toggle('hidden', !imageMode);
    videoPrompt.placeholder = imageMode
        ? '描述人物動作、鏡頭移動、節奏與環境變化，例如：她慢慢望向鏡頭，頭髮隨微風擺動，鏡頭輕微推近...'
        : '描述完整畫面、人物、動作、鏡頭語言、光線與節奏...';
    videoPromptHint.textContent = imageMode
        ? '圖片模式應描述「如何動」；魔法棒會保留原意並依所選模型補足動作、鏡頭與環境。'
        : '文字模式請寫下核心想法；魔法棒會依所選模型補齊主體、場景、動作與鏡頭。';
    clearVideoPromptFeedback();
    videoStudioStatus.textContent = imageMode
        ? '加入來源圖片及動態描述後即可生成'
        : '填寫影片描述後即可生成';
    clearVideoStudioError();
    cancelPendingVideoQuote();
    videoQuoteUsd = null;
    videoCostEstimate.textContent = '';
    videoModelSelect.innerHTML = '<option value="">載入模型中...</option>';
    setVideoProgressState('idle');
    void loadVideoModels(mode);
    updateVideoGenerateButton();
};

const clearVideoSource = () => {
    if (videoSource) URL.revokeObjectURL(videoSource.previewUrl);
    videoSource = null;
    videoSourcePreview.removeAttribute('src');
    videoSourceMeta.textContent = '';
    videoSourceEmpty.classList.remove('hidden');
    videoSourcePreviewWrap.classList.add('hidden');
    videoSourceRemove.classList.add('hidden');
    videoSourceInput.value = '';
    updateVideoGenerateButton();
};

const setVideoSourceFromBlob = async (sourceBlob: Blob, name: string) => {
    if (!sourceBlob.type.startsWith('image/')) throw new Error('請選擇 JPEG、PNG 或 WebP 圖片。');
    if (sourceBlob.size > 25 * 1024 * 1024) throw new Error('來源圖片不可超過 25MB。');

    const rawUrl = URL.createObjectURL(sourceBlob);
    const sourceImage = new Image();
    sourceImage.src = rawUrl;
    try {
        await sourceImage.decode();
        if (Math.min(sourceImage.naturalWidth, sourceImage.naturalHeight) < 300) {
            throw new Error('來源圖片太小，最短一邊至少需要 300px。');
        }

        const scale = Math.min(1, 1600 / Math.max(sourceImage.naturalWidth, sourceImage.naturalHeight));
        const width = Math.round(sourceImage.naturalWidth * scale);
        const height = Math.round(sourceImage.naturalHeight * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('瀏覽器無法處理這張圖片。');
        context.drawImage(sourceImage, 0, 0, width, height);

        let compressed = await canvasToBlob(canvas, 0.86);
        if (compressed.size > 2_450_000) compressed = await canvasToBlob(canvas, 0.66);
        if (compressed.size > 2_450_000) throw new Error('壓縮後的圖片仍然太大，請改用較小的來源圖。');

        clearVideoSource();
        const previewUrl = URL.createObjectURL(compressed);
        const base64 = await blobToBase64(compressed);
        videoSource = {
            blob: compressed,
            dataUrl: `data:image/webp;base64,${base64}`,
            previewUrl,
            width,
            height,
            name,
        };
        videoSourcePreview.src = previewUrl;
        videoSourceMeta.textContent = `${name} · ${width} × ${height} · ${(compressed.size / 1024).toFixed(0)} KB`;
        videoSourceEmpty.classList.add('hidden');
        videoSourcePreviewWrap.classList.remove('hidden');
        videoSourceRemove.classList.remove('hidden');
        updateVideoGenerateButton();
    } finally {
        URL.revokeObjectURL(rawUrl);
    }
};

const loadVideoSourceFile = async (file?: File) => {
    if (!file || isVideoRequestRunning || isVideoPromptOptimizing || pendingVideoJob) return;
    clearVideoStudioError();
    videoStudioStatus.textContent = '正在準備來源圖片...';
    try {
        await setVideoSourceFromBlob(file, file.name);
        videoStudioStatus.textContent = '來源圖片已準備好';
    } catch (error) {
        showVideoStudioError(error instanceof Error ? error.message : '無法讀取來源圖片。');
        videoStudioStatus.textContent = '來源圖片載入失敗';
    } finally {
        videoSourceInput.value = '';
    }
};

const updateVideoJobAction = () => {
    const showAction = isVideoRequestRunning || Boolean(pendingVideoJob);
    videoCancelButton.classList.toggle('hidden', !showAction);
    videoCancelButton.textContent = isVideoRequestRunning
        ? pendingVideoJob ? '暫停查詢' : '停止等待'
        : '放棄未完成工作';
};

const setVideoStudioBusy = (busy: boolean) => {
    isVideoRequestRunning = busy;
    const controlsLocked = busy || isVideoPromptOptimizing || Boolean(pendingVideoJob);
    videoGenerateSpinner.classList.toggle('hidden', !busy);
    if (busy) videoGenerateLabel.textContent = '影片生成中...';
    videoModeImageBtn.disabled = controlsLocked;
    videoModeTextBtn.disabled = controlsLocked;
    videoModelSelect.disabled = controlsLocked || videoModels[videoStudioMode].length === 0;
    refreshVideoModelsBtn.disabled = controlsLocked;
    videoSourceDropzone.disabled = controlsLocked;
    videoSourceRemove.disabled = controlsLocked;
    videoPrompt.disabled = controlsLocked;
    videoNegativePrompt.disabled = controlsLocked;
    videoDuration.disabled = controlsLocked;
    videoResolution.disabled = controlsLocked;
    videoAspectRatio.disabled = controlsLocked;
    videoAudio.disabled = controlsLocked;
    videoAdultConfirm.disabled = controlsLocked;
    updateVideoJobAction();
    updateVideoPromptOptimizerButton();
    updateVideoGenerateButton();
};

const setVideoPromptOptimizerBusy = (busy: boolean) => {
    isVideoPromptOptimizing = busy;
    videoPromptOptimizeButton.classList.toggle('is-optimizing', busy);
    videoPromptOptimizeSpinner.classList.toggle('hidden', !busy);
    videoPromptOptimizeLabel.textContent = busy ? '優化中...' : '魔法優化';
    setVideoStudioBusy(isVideoRequestRunning);
};

const cancelVideoPromptOptimization = () => {
    videoPromptOptimizerController?.abort();
};

const runVideoPromptOptimization = async () => {
    const model = getSelectedVideoModel();
    const originalPrompt = videoPrompt.value.trim();
    if (!model || !originalPrompt || isVideoPromptOptimizing || isVideoRequestRunning || pendingVideoJob) return;

    clearVideoStudioError();
    if (containsDisallowedMinorTerms(originalPrompt)) {
        showVideoStudioError('影片工作室只可使用明確成年的角色，請先修改描述。');
        setVideoPromptFeedback('請先把人物明確描述為成年人，再使用魔法優化。', 'error');
        return;
    }

    const settingsKey = getVideoPromptSettingsKey(model);
    if (
        lastVideoPromptOptimization
        && lastVideoPromptOptimization.settingsKey === settingsKey
        && lastVideoPromptOptimization.output === originalPrompt
    ) {
        videoStudioStatus.textContent = `這段提示已針對 ${model.name} 優化，可直接生成或手動修改`;
        setVideoPromptFeedback('這段文字已經完成優化；如有修改，再按一次魔法棒即可。', 'success');
        return;
    }

    const maxCharacters = Math.max(
        120,
        Math.min(model.constraints.prompt_character_limit || 2500, 2400),
    );
    const models = Array.from(new Set([
        VENICE_VIDEO_PROMPT_MODEL,
        VENICE_CHAT_MODEL,
        VENICE_ASSISTANT_MODEL,
    ].filter(Boolean)));
    const controller = new AbortController();
    let timedOut = false;
    let lastError: Error | null = null;
    let unchangedResponseCount = 0;
    const startedAt = performance.now();
    const shouldRefreshQuote = typeof videoQuoteUsd !== 'number';
    videoPromptOptimizerController = controller;
    cancelPendingVideoQuote();
    setVideoPromptOptimizerBusy(true);
    setVideoPromptFeedback('正在檢查動作次序、鏡頭與場景描述...');
    videoStudioStatus.textContent = `正在依 ${model.name} 的提示風格魔法優化...`;
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, VIDEO_PROMPT_OPTIMIZER_TIMEOUT_MS);

    try {
        const messages = buildVideoPromptOptimizerMessages(model, originalPrompt, maxCharacters);
        for (const optimizerModel of models) {
            if (controller.signal.aborted) break;
            const attemptController = new AbortController();
            let attemptTimedOut = false;
            const abortAttempt = () => attemptController.abort();
            controller.signal.addEventListener('abort', abortAttempt, { once: true });
            const attemptTimeoutId = window.setTimeout(() => {
                attemptTimedOut = true;
                attemptController.abort();
            }, VIDEO_PROMPT_OPTIMIZER_ATTEMPT_TIMEOUT_MS);
            try {
                const result = await generateVeniceText({
                    model: optimizerModel,
                    messages,
                    maxCompletionTokens: 760,
                    temperature: 0.22,
                    topP: 0.88,
                    repetitionPenalty: 1.03,
                    signal: attemptController.signal,
                });
                let optimizedPrompt = cleanOptimizedVideoPrompt(result.text);
                if (optimizedPrompt && isWan27VideoModel(model)) {
                    optimizedPrompt = ensureWan27PromptStructure(optimizedPrompt);
                }
                if (!optimizedPrompt) throw new Error('提示詞優化器沒有回傳有效格式。');
                if (optimizedPrompt.length > maxCharacters) {
                    throw new Error(`提示詞優化器超過 ${maxCharacters} 字元限制。`);
                }
                if (
                    normalizeVideoPromptForComparison(optimizedPrompt)
                    === normalizeVideoPromptForComparison(originalPrompt)
                ) {
                    unchangedResponseCount += 1;
                    lastError = new Error('優化結果與原文相同。');
                    continue;
                }

                videoPrompt.value = optimizedPrompt;
                lastVideoPromptOptimization = { settingsKey, output: optimizedPrompt };
                updateVideoPromptCounter();
                videoStudioStatus.textContent = `已針對 ${model.name} 優化 · 保留原意，送出前仍可修改`;
                setVideoPromptFeedback(
                    `優化完成：${originalPrompt.length} → ${optimizedPrompt.length} 字元。送出前仍可手動修改。`,
                    'success',
                );
                clearVideoStudioError();
                console.info('[aigf4 video prompt optimizer]', {
                    videoModel: model.id,
                    optimizerModel: result.model,
                    latencyMs: Math.round(performance.now() - startedAt),
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                });
                return;
            } catch (error) {
                if (controller.signal.aborted) throw error;
                lastError = attemptTimedOut
                    ? new Error('其中一次優化等待超過 15 秒，已自動改試後備服務。')
                    : error instanceof Error
                        ? error
                        : new Error(String(error));
            } finally {
                window.clearTimeout(attemptTimeoutId);
                controller.signal.removeEventListener('abort', abortAttempt);
            }
        }
        if (unchangedResponseCount > 0) {
            videoStudioStatus.textContent = '優化模型認為原文已可直接使用；沒有提交影片';
            setVideoPromptFeedback(
                '已嘗試其他優化模型，但結果仍與原文相同。原文已保留，可補充動作順序或鏡頭要求後再試。',
            );
            return;
        }
        throw lastError || new Error('提示詞優化失敗。');
    } catch (error) {
        if (controller.signal.aborted && !timedOut) {
            clearVideoStudioError();
            videoStudioStatus.textContent = '魔法優化已取消；原本提示沒有修改';
            setVideoPromptFeedback('優化已取消，提示詞保持原樣。');
            return;
        }
        const message = timedOut
            ? '提示詞優化超過 45 秒，原文已保留，請再試一次。'
            : error instanceof Error
                ? error.message
                : '提示詞優化失敗，原文已保留。';
        showVideoStudioError(message);
        setVideoPromptFeedback(`這次未能完成優化：${message} 原本提示沒有被修改。`, 'error');
        videoStudioStatus.textContent = '魔法優化失敗；沒有修改原本提示，也沒有送出影片';
        if (message === VENICE_AUTH_REQUIRED_ERROR) getDependencies().handleAuthRequired();
    } finally {
        window.clearTimeout(timeoutId);
        if (videoPromptOptimizerController === controller) videoPromptOptimizerController = null;
        setVideoPromptOptimizerBusy(false);
        if (shouldRefreshQuote) scheduleVideoQuote(0);
    }
};

const waitForVideoPoll = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
    }
    const timeout = window.setTimeout(() => {
        signal.removeEventListener('abort', handleAbort);
        resolve();
    }, VIDEO_POLL_INTERVAL_MS);
    const handleAbort = () => {
        window.clearTimeout(timeout);
        reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', handleAbort, { once: true });
});

const formatVideoWait = (milliseconds: number) => {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`;
};

const cleanupVideoResult = (result: VideoStudioResult) => {
    if (result.isObjectUrl) URL.revokeObjectURL(result.url);
    if (result.needsRemoteCleanup) {
        void completeVeniceVideo(result.modelId, result.queueId).catch(error => {
            console.warn('Unable to clean up Venice video media.', error);
        });
    }
};

const removeVideoResult = (id: string) => {
    const result = videoResults.find(item => item.id === id);
    if (result) cleanupVideoResult(result);
    videoResults = videoResults.filter(item => item.id !== id);
    renderVideoResults();
};

const renderVideoResults = () => {
    videoStudioResults.innerHTML = '';
    videoStudioEmpty.classList.toggle('hidden', videoResults.length > 0);
    clearVideoResultsBtn.classList.toggle('hidden', videoResults.length === 0);

    videoResults.forEach((result, index) => {
        const card = document.createElement('article');
        card.className = 'video-result-card';
        card.style.animationDelay = `${Math.min(index, 5) * 60}ms`;

        const video = document.createElement('video');
        video.src = result.url;
        video.controls = true;
        video.playsInline = true;
        video.preload = 'metadata';

        const body = document.createElement('div');
        body.className = 'video-result-body';
        const prompt = document.createElement('p');
        prompt.className = 'video-result-prompt';
        prompt.textContent = result.prompt;
        const meta = document.createElement('p');
        meta.className = 'video-result-meta';
        meta.textContent = `${result.model} · ${result.createdAt.toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit' })}`;

        const actions = document.createElement('div');
        actions.className = 'video-result-actions';
        const downloadButton = document.createElement('button');
        downloadButton.type = 'button';
        downloadButton.className = 'video-result-action';
        downloadButton.textContent = '下載 MP4';
        downloadButton.addEventListener('click', () => {
            const anchor = document.createElement('a');
            anchor.href = result.url;
            anchor.download = `venice-video-${result.createdAt.toISOString().replace(/[:.]/g, '-')}.mp4`;
            anchor.rel = 'noopener';
            if (!result.isObjectUrl) anchor.target = '_blank';
            anchor.click();
        });
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'video-result-action';
        removeButton.textContent = '移除';
        removeButton.addEventListener('click', () => removeVideoResult(result.id));
        actions.append(downloadButton, removeButton);
        body.append(prompt, meta, actions);
        card.append(video, body);
        videoStudioResults.appendChild(card);
    });
};

const clearVideoResults = () => {
    videoResults.forEach(cleanupVideoResult);
    videoResults = [];
    renderVideoResults();
    videoStudioStatus.textContent = '本次影片已清除';
};

const cancelVideoRequest = () => {
    if (isVideoRequestRunning && videoRequestController) {
        const warning = pendingVideoJob
            ? '暫停只會停止本頁查詢，Venice 仍會繼續生成。工作紀錄會保留，重新進入後自動恢復。確定暫停？'
            : '正在送出影片工作，無法確認 Venice 是否已收到。確定停止等待？';
        if (!window.confirm(warning)) return;
        videoRequestController.abort();
        videoStudioStatus.textContent = pendingVideoJob
            ? '已暫停查詢；未完成工作已保存'
            : '已停止等待；Venice 可能已收到工作';
        return;
    }

    if (!pendingVideoJob) return;
    const confirmed = window.confirm(
        '這只會刪除本機的恢復紀錄，不會取消 Venice 已收費的生成。刪除後本網站不能再找回這個 queue ID。確定放棄？',
    );
    if (!confirmed) return;
    clearPersistedVideoJob();
    setVideoProgressState('idle');
    videoStudioStatus.textContent = '未完成工作紀錄已刪除；遠端生成不會因此取消';
    clearVideoStudioError();
    setVideoStudioBusy(false);
};

const pollPersistedVideoJob = async (job: PersistedVideoJob, controller: AbortController) => {
    const pollingStartedAt = performance.now();
    let consecutivePollErrors = 0;

    while (performance.now() - pollingStartedAt < VIDEO_POLL_TIMEOUT_MS) {
        let retrieved;
        try {
            retrieved = await retrieveVeniceVideo(
                job.model,
                job.queueId,
                job.downloadUrl,
                controller.signal,
            );
            consecutivePollErrors = 0;
        } catch (error) {
            if (controller.signal.aborted) throw error;
            if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) throw error;
            consecutivePollErrors += 1;
            if (consecutivePollErrors > 4) throw error;
            videoStudioStatus.textContent = `暫時無法查詢進度，將自動重試（${consecutivePollErrors}/4）`;
            await waitForVideoPoll(controller.signal);
            continue;
        }

        if (retrieved.kind === 'completed') {
            const url = retrieved.blob
                ? URL.createObjectURL(retrieved.blob)
                : retrieved.downloadUrl;
            if (!url) throw new Error('影片已完成，但沒有可播放的檔案。');
            const now = new Date();
            videoResults = [{
                id: `${now.getTime()}-${job.queueId}`,
                url,
                isObjectUrl: Boolean(retrieved.blob),
                prompt: job.prompt,
                model: job.modelName,
                modelId: job.model,
                queueId: job.queueId,
                createdAt: now,
                needsRemoteCleanup: Boolean(retrieved.downloadUrl),
            }, ...videoResults];
            clearPersistedVideoJob();
            renderVideoResults();
            setVideoProgressState('completed');
            videoStudioStatus.textContent = `影片完成 · 共等待 ${formatVideoWait(now.getTime() - job.queuedAt)}`;

            if (retrieved.blob) {
                void completeVeniceVideo(job.model, job.queueId).catch(error => {
                    console.warn('Unable to clean up completed Venice video media.', error);
                });
            }
            return;
        }

        const waited = retrieved.executionDuration ?? Date.now() - job.queuedAt;
        const estimate = retrieved.averageExecutionTime;
        videoStudioStatus.textContent = estimate
            ? `生成中 · 已等待 ${formatVideoWait(waited)} · 一般約 ${formatVideoWait(estimate)}`
            : `生成中 · 已等待 ${formatVideoWait(waited)}`;
        await waitForVideoPoll(controller.signal);
    }

    throw new Error('本次查詢已達 15 分鐘，未完成工作仍已保存，可稍後繼續查詢。');
};

const resumePendingVideoJob = async (source: 'auto' | 'manual' = 'manual') => {
    const job = pendingVideoJob;
    if (!job || isVideoRequestRunning || !getDependencies().isUnlocked()) return;

    cancelPendingVideoQuote();
    clearVideoStudioError();
    const controller = new AbortController();
    videoRequestController = controller;
    setVideoStudioBusy(true);
    setVideoProgressState('generating');
    videoStudioStatus.textContent = source === 'auto'
        ? `正在自動恢復未完成工作 · ${job.modelName}`
        : `正在繼續查詢未完成工作 · ${job.modelName}`;

    try {
        await pollPersistedVideoJob(job, controller);
    } catch (error) {
        if (controller.signal.aborted) {
            setVideoProgressState('paused');
            videoStudioStatus.textContent = '已暫停查詢；未完成工作已保存，重新進入後會自動恢復';
        } else {
            const message = error instanceof Error ? error.message : '無法查詢未完成影片。';
            showVideoStudioError(message);
            videoStudioStatus.textContent = '查詢已暫停；系統保留原有工作，沒有重新提交或重複扣費';
            setVideoProgressState('error');
            if (message === VENICE_AUTH_REQUIRED_ERROR) getDependencies().handleAuthRequired();
        }
    } finally {
        if (videoRequestController === controller) videoRequestController = null;
        setVideoStudioBusy(false);
    }
};

const runVideoGeneration = async () => {
    if (pendingVideoJob) {
        await resumePendingVideoJob('manual');
        return;
    }
    const model = getSelectedVideoModel();
    const prompt = videoPrompt.value.trim();
    clearVideoStudioError();

    if (!model || !prompt || !videoAdultConfirm.checked || typeof videoQuoteUsd !== 'number') {
        showVideoStudioError('請完成描述、模型報價及成年／圖片權利確認。');
        return;
    }
    if (videoStudioMode === 'image-to-video' && !videoSource) {
        showVideoStudioError('圖片變影片需要先加入一張來源圖片。');
        return;
    }
    const minimumShortSide = model.constraints.reference_image_min_short_side_pixels || 0;
    if (videoSource && Math.min(videoSource.width, videoSource.height) < minimumShortSide) {
        showVideoStudioError(`這個模型要求來源圖片最短一邊至少 ${minimumShortSide}px。`);
        return;
    }
    if (containsDisallowedMinorTerms(prompt)) {
        showVideoStudioError('影片工作室只可使用明確成年的角色，請修改描述。');
        return;
    }

    const pricing = getVideoPricingOptions();
    if (!pricing) {
        showVideoStudioError('影片設定尚未準備好。');
        return;
    }

    cancelPendingVideoQuote();
    const controller = new AbortController();
    videoRequestController = controller;
    setVideoStudioBusy(true);
    setVideoProgressState('queueing');
    videoStudioStatus.textContent = '正在提交一次生成工作；取得 queue ID 後即可安全恢復...';

    try {
        const queued = await queueVeniceVideo({
            ...pricing,
            prompt,
            negativePrompt: videoNegativePrompt.value.trim(),
            sourceImageDataUrl: videoStudioMode === 'image-to-video' ? videoSource?.dataUrl : undefined,
            adultConfirmed: true,
            signal: controller.signal,
        });
        const job: PersistedVideoJob = {
            version: 1,
            model: queued.model,
            modelName: model.name,
            queueId: queued.queueId,
            downloadUrl: queued.downloadUrl,
            prompt,
            mode: videoStudioMode,
            queuedAt: Date.now(),
        };
        const wasPersisted = persistVideoJob(job);
        updateVideoJobAction();
        setVideoProgressState('generating');
        videoStudioStatus.textContent = wasPersisted
            ? '已進入 Venice 隊列；工作已保存，現在可安全重新進入網站'
            : '已進入 Venice 隊列，但無法保存恢復資料；請保持此分頁開啟';
        await pollPersistedVideoJob(job, controller);
    } catch (error) {
        if (controller.signal.aborted) {
            setVideoProgressState(pendingVideoJob ? 'paused' : 'quoted');
            videoStudioStatus.textContent = pendingVideoJob
                ? '已暫停查詢；未完成工作已保存，重新進入後會自動恢復'
                : '已停止等待；尚未取得可保存的 queue ID';
        } else {
            const message = error instanceof Error ? error.message : '影片生成失敗。';
            showVideoStudioError(message);
            videoStudioStatus.textContent = pendingVideoJob
                ? '查詢已暫停；工作已保存，系統沒有重複提交或扣費'
                : '影片工作未能成功提交';
            setVideoProgressState('error');
            if (message === VENICE_AUTH_REQUIRED_ERROR) getDependencies().handleAuthRequired();
        }
    } finally {
        if (videoRequestController === controller) videoRequestController = null;
        setVideoStudioBusy(false);
    }
};

const showVideoStudio = (historyMode: VideoStudioHistoryMode = 'push') => {
    const deps = getDependencies();
    deps.cancelActiveChatRequest();
    deps.enterVideoView(historyMode);
    videoStudioView.classList.remove('hidden');
    videoStudioView.classList.add('flex');
    videoAdultConfirm.checked = sessionStorage.getItem(VIDEO_ADULT_CONFIRM_STORAGE_KEY) === 'true';
    renderVideoResults();
    void loadVideoModels(videoStudioMode);
    updateVideoGenerateButton();
    if (pendingVideoJob && !isVideoRequestRunning && deps.isUnlocked()) {
        void resumePendingVideoJob('auto');
    }
};

const navigateBackFromVideoStudio = () => {
    cancelVideoPromptOptimization();
    const currentState = window.history.state as { view?: string } | null;
    if (currentState?.view === 'video') {
        window.history.back();
        return;
    }
    getDependencies().showSelectionView();
};

let listenersReady = false;

const setupVideoStudioListeners = () => {
    if (listenersReady) return;
    listenersReady = true;
    videoStudioBack.addEventListener('click', navigateBackFromVideoStudio);
    videoModeImageBtn.addEventListener('click', () => setVideoStudioMode('image-to-video'));
    videoModeTextBtn.addEventListener('click', () => setVideoStudioMode('text-to-video'));
    videoModelSelect.addEventListener('change', () => {
        if (!videoModelSelect.value || isVideoRequestRunning || isVideoPromptOptimizing || pendingVideoJob) return;
        selectedVideoModels[videoStudioMode] = videoModelSelect.value;
        setPersistedAppSetting(
            videoStudioMode === 'image-to-video'
                ? VIDEO_IMAGE_MODEL_STORAGE_KEY
                : VIDEO_TEXT_MODEL_STORAGE_KEY,
            videoModelSelect.value,
        );
        clearVideoStudioError();
        clearVideoPromptFeedback();
        updateVideoModelControls();
    });
    refreshVideoModelsBtn.addEventListener('click', () => {
        void loadVideoModels(videoStudioMode, true);
    });
    videoPrompt.addEventListener('input', () => {
        updateVideoPromptCounter();
        if (!isVideoPromptOptimizing) clearVideoPromptFeedback();
    });
    videoPromptOptimizeButton.addEventListener('click', () => {
        void runVideoPromptOptimization();
    });
    [videoDuration, videoResolution, videoAspectRatio].forEach(select => {
        select.addEventListener('change', () => {
            clearVideoPromptFeedback();
            scheduleVideoQuote();
        });
    });
    videoAudio.addEventListener('change', () => {
        clearVideoPromptFeedback();
        scheduleVideoQuote();
    });
    videoAdultConfirm.addEventListener('change', () => {
        sessionStorage.setItem(VIDEO_ADULT_CONFIRM_STORAGE_KEY, String(videoAdultConfirm.checked));
        updateVideoGenerateButton();
    });
    videoSourceDropzone.addEventListener('click', () => videoSourceInput.click());
    videoSourceInput.addEventListener('change', () => {
        void loadVideoSourceFile(videoSourceInput.files?.[0]);
    });
    videoSourceRemove.addEventListener('click', () => {
        clearVideoSource();
        videoStudioStatus.textContent = '來源圖片已移除';
    });
    videoSourceDropzone.addEventListener('dragover', event => {
        event.preventDefault();
        videoSourceDropzone.classList.add('is-dragging');
    });
    videoSourceDropzone.addEventListener('dragleave', () => {
        videoSourceDropzone.classList.remove('is-dragging');
    });
    videoSourceDropzone.addEventListener('drop', event => {
        event.preventDefault();
        videoSourceDropzone.classList.remove('is-dragging');
        void loadVideoSourceFile(event.dataTransfer?.files?.[0]);
    });
    videoGenerateButton.addEventListener('click', () => {
        void runVideoGeneration();
    });
    videoCancelButton.addEventListener('click', cancelVideoRequest);
    clearVideoResultsBtn.addEventListener('click', clearVideoResults);
    window.addEventListener('beforeunload', () => {
        videoResults.forEach(result => {
            if (result.isObjectUrl) URL.revokeObjectURL(result.url);
        });
        if (videoSource) URL.revokeObjectURL(videoSource.previewUrl);
    });
};

const initializePendingVideoState = () => {
    pendingVideoJob = readPersistedVideoJob();
    if (pendingVideoJob) {
        setVideoProgressState('paused');
        videoStudioStatus.textContent = `找到未完成工作 · ${pendingVideoJob.modelName} · 登入後自動恢復`;
    } else {
        setVideoProgressState('idle');
    }
    setVideoStudioBusy(false);
};

export const createVideoStudio = (nextDependencies: VideoStudioDependencies): VideoStudioHandle => {
    dependencies = nextDependencies;
    setupVideoStudioListeners();
    initializePendingVideoState();
    return {
        show: showVideoStudio,
        hide: () => {
            videoStudioView.classList.add('hidden');
            videoStudioView.classList.remove('flex');
        },
        isVisible: () => !videoStudioView.classList.contains('hidden'),
        cancelPromptOptimization: cancelVideoPromptOptimization,
        resumePending: resumePendingVideoJob,
        hasPendingJob: () => Boolean(pendingVideoJob),
        refreshControls: () => {
            updateVideoPromptOptimizerButton();
            updateVideoGenerateButton();
        },
    };
};
