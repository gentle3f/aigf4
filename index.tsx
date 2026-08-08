
import {
    CharacterPhotoProposal,
    ChatMessage,
    Content,
    DIARY_CHECKPOINT,
    Interest,
    MemoryManager,
    Persona,
    POLICY_VIOLATION,
    cleanAiResponse,
} from "./managers.js";
import { FileManager } from "./fileManager.js";
import { coreInstruction, VENICE_ASSISTANT_PERSONA_KEY } from "./personas.tsx";
import {
    cleanVeniceAssistantReply,
    cleanVeniceChatReply,
    extractPersonaUpdatePayload,
    generateVeniceText,
    isInvalidVeniceChatReply,
    listVeniceTextModels,
    RequestState,
    VENICE_API_BASE,
    VENICE_ASSISTANT_MODEL,
    VENICE_AUTH_REQUIRED_ERROR,
    VENICE_CC_MODEL,
    VENICE_CHAT_FALLBACK_MODEL,
    VENICE_CHAT_MODEL,
    VENICE_CHAT_QUALITY_FALLBACK_MODEL,
    VENICE_GOD_FALLBACK_MODEL,
    VENICE_GOD_MODEL,
    VENICE_VIDEO_PROMPT_MODEL,
    VeniceMessage,
    VeniceModelSummary,
} from "./venice.js";
import {
    listVeniceImageModels,
    requestVeniceImage,
    VENICE_IMAGE_EDIT_MODEL,
    VENICE_IMAGE_GENERATE_MODEL,
    VeniceImageMode,
    VeniceImageModelSummary,
} from "./veniceImage.js";
import {
    completeVeniceVideo,
    listVeniceVideoModels,
    queueVeniceVideo,
    quoteVeniceVideo,
    retrieveVeniceVideo,
    VENICE_VIDEO_IMAGE_MODEL,
    VENICE_VIDEO_TEXT_MODEL,
    VeniceVideoMode,
    VeniceVideoModelSummary,
} from "./veniceVideo.js";
import { createRandomAdultFemalePersona } from "./randomPersona.js";
import {
    deleteCharacterPhotoAsset,
    getCharacterPhotoBlob,
    saveCharacterPhotoAsset,
} from "./photoStore.js";


declare var JSZip: any;

const Type = {
    OBJECT: 'object',
    STRING: 'string',
    ARRAY: 'array',
    INTEGER: 'integer',
} as const;

// Disabled legacy helpers still reference `ai`; keep a harmless placeholder.
const ai: any = null;
// --- DOM Elements ---
const personaSelectionView = document.getElementById('persona-selection-view')!;
const chatView = document.getElementById('chat-view')!;
const aiAssistantList = document.getElementById('ai-assistant-list')!;
const femalePersonaList = document.getElementById('female-persona-list')!;
const backButton = document.getElementById('back-button')!;
const chatHeaderName = document.getElementById('chat-header-name')!;
const chatHeaderAvatarContainer = document.getElementById('chat-header-avatar-container')!;
const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const chatContainer = document.getElementById('chat-container')!;
const loadingIndicator = document.getElementById('loading-indicator')!;
const loadingText = document.getElementById('loading-text') as HTMLSpanElement;
const chatStatus = document.getElementById('chat-status')!;
const errorMessage = document.getElementById('error-message')!;
const avatarUploadInput = document.getElementById('avatar-upload-input') as HTMLInputElement;
const downloadChatBtn = document.getElementById('download-chat-btn') as HTMLButtonElement;
const downloadAllChatsBtn = document.getElementById('download-all-chats-btn') as HTMLButtonElement;
const downloadImagesBtn = document.getElementById('download-images-btn') as HTMLButtonElement;
const uploadZipBtn = document.getElementById('upload-zip-btn')!;
const zipUploadInput = document.getElementById('zip-upload-input') as HTMLInputElement;
const giftButton = document.getElementById('gift-button') as HTMLButtonElement;
const giftUploadInput = document.getElementById('gift-upload-input') as HTMLInputElement;
const giftPreviewContainer = document.getElementById('gift-preview-container')!;
const giftPreviewImage = document.getElementById('gift-preview-image') as HTMLImageElement;
const removeGiftBtn = document.getElementById('remove-gift-btn')!;
const randomRecruitBtn = document.getElementById('random-recruit-btn') as HTMLButtonElement;
const randomRecruitStatus = document.getElementById('random-recruit-status')!;
const createPersonaBtn = document.getElementById('create-persona-btn')!;
const clearChatBtn = document.getElementById('clear-chat-btn') as HTMLButtonElement;
const suggestionButton = document.getElementById('suggestion-button') as HTMLButtonElement;
const suggestionContainer = document.getElementById('suggestion-container')!;
const newSceneBtn = document.getElementById('new-scene-btn') as HTMLButtonElement;
const takePhotoBtn = document.getElementById('take-photo-btn') as HTMLButtonElement;
const appShell = document.getElementById('app-shell')!;
const authGate = document.getElementById('auth-gate')!;
const authForm = document.getElementById('auth-form') as HTMLFormElement;
const authPasswordInput = document.getElementById('auth-password-input') as HTMLInputElement;
const authError = document.getElementById('auth-error')!;
const authSubmitButton = document.getElementById('auth-submit-button') as HTMLButtonElement;
const authSubmitLabel = document.getElementById('auth-submit-label')!;
const authSubmitLoading = document.getElementById('auth-submit-loading')!;
const assistantModelBar = document.getElementById('assistant-model-bar')!;
const assistantModelSelect = document.getElementById('assistant-model-select') as HTMLSelectElement;
const assistantModelMeta = document.getElementById('assistant-model-meta')!;
const refreshAssistantModelsBtn = document.getElementById('refresh-assistant-models') as HTMLButtonElement;
const imageStudioEntry = document.getElementById('image-studio-entry') as HTMLButtonElement;
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
const videoStudioEntry = document.getElementById('video-studio-entry') as HTMLButtonElement;
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

// More Options Menu
const moreOptionsBtn = document.getElementById('more-options-btn')!;
const moreOptionsMenu = document.getElementById('more-options-menu')!;
const personaSettingsBtn = document.getElementById('persona-settings-btn')!;
const changeAvatarBtn = document.getElementById('change-avatar-btn') as HTMLButtonElement;

// Save Before Exit Modal
const saveExitModal = document.getElementById('save-exit-modal')!;
const saveAndExitBtn = document.getElementById('save-and-exit-btn')!;
const exitWithoutSavingBtn = document.getElementById('exit-without-saving-btn')!;
const cancelExitBtn = document.getElementById('cancel-exit-btn')!;

// Persona Creator Elements
const personaCreatorModal = document.getElementById('persona-creator-modal')!;
const closeCreatorModal = document.getElementById('close-creator-modal')!;
const randomizePersonaBtn = document.getElementById('randomize-persona-btn') as HTMLButtonElement;
const diceIcon = document.getElementById('dice-icon')!;
const diceLoadingIcon = document.getElementById('dice-loading-icon')!;
const creatorStep1 = document.getElementById('creator-step-1')!;
const creatorStep2 = document.getElementById('creator-step-2')!;
const personaNameInput = document.getElementById('persona-name') as HTMLInputElement;
const fictionalPersonaCheckbox = document.getElementById('fictional-persona-checkbox') as HTMLInputElement;
const clubSelectionContainer = document.getElementById('club-selection-container')!;
const personaClubSelect = document.getElementById('persona-club') as HTMLSelectElement;
const customClubContainer = document.getElementById('custom-club-container')!;
const personaCustomClubInput = document.getElementById('persona-custom-club') as HTMLInputElement;
const generatePersonaBtn = document.getElementById('generate-persona') as HTMLButtonElement;
const cancelCreatorBtn = document.getElementById('cancel-creator')!;
const backToStep1Btn = document.getElementById('back-to-step1')!;
const savePersonaBtn = document.getElementById('save-persona')!;
const generatedPersonaPreview = document.getElementById('generated-persona-preview')!;

// Avatar Prompt Editor Elements
const editAvatarPromptModal = document.getElementById('edit-avatar-prompt-modal')!;
const closePromptModal = document.getElementById('close-prompt-modal')!;
const avatarPromptEditor = document.getElementById('avatar-prompt-editor') as HTMLTextAreaElement;
const cancelPromptEdit = document.getElementById('cancel-prompt-edit')!;
const savePromptEdit = document.getElementById('save-prompt-edit') as HTMLButtonElement;

// Photo Prompt Modal Elements
const photoPromptModal = document.getElementById('photo-prompt-modal')!;
// FIX: Renamed variable to avoid duplicate identifier conflict with the `closePhotoPromptModal` function.
const closePhotoPromptModalBtn = document.getElementById('close-photo-prompt-modal')!;
const photoPromptInput = document.getElementById('photo-prompt-input') as HTMLTextAreaElement;
const cancelPhotoGeneration = document.getElementById('cancel-photo-generation')!;
const generatePhotoBtn = document.getElementById('generate-photo-btn') as HTMLButtonElement;
const generatePhotoText = document.getElementById('generate-photo-text')!;
const generatePhotoLoading = document.getElementById('generate-photo-loading')!;


// Dating Module Elements
const dateBtn = document.getElementById('date-btn')!;

// AI Date Proposal Modal Elements
const dateProposalModal = document.getElementById('date-proposal-modal')!;
const dateProposalAvatar = document.getElementById('date-proposal-avatar')!;
const dateProposalName = document.getElementById('date-proposal-name')!;
const dateProposalText = document.getElementById('date-proposal-text')!;
const dateProposalLocation = document.getElementById('date-proposal-location')!;
const dateProposalDuration = document.getElementById('date-proposal-duration')!;
const declineDateBtn = document.getElementById('decline-date-btn')!;
const acceptDateBtn = document.getElementById('accept-date-btn')!;

// Interests Module Elements
const interestsBtn = document.getElementById('interests-btn')!;
const interestsModal = document.getElementById('interests-modal')!;
// FIX: Renamed variable to avoid duplicate identifier conflict with the `closeInterestsModal` function.
const closeInterestsModalBtn = document.getElementById('close-interests-modal')!;
const interestsModalTitle = document.getElementById('interests-modal-title')!;
const interestsGridContainer = document.getElementById('interests-grid-container')!;

// Album Module Elements
const albumBtn = document.getElementById('album-btn')!;
const albumModal = document.getElementById('album-modal')!;
// FIX: Renamed variable to avoid duplicate identifier conflict with the `closeAlbumModal` function.
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
const photoViewerModal = document.getElementById('photo-viewer-modal')!;
const closePhotoViewer = document.getElementById('close-photo-viewer')!;
const photoViewerImage = document.getElementById('photo-viewer-image') as HTMLImageElement;
const photoViewerCaption = document.getElementById('photo-viewer-caption')!;

// Memory Modal Elements
const memoryBtn = document.getElementById('memory-btn')!;
const memoryModal = document.getElementById('memory-modal')!;
const closeMemoryModal = document.getElementById('close-memory-modal')!;
const memoryEditor = document.getElementById('memory-editor') as HTMLTextAreaElement;
const cancelMemoryEdit = document.getElementById('cancel-memory-edit')!;
const saveMemoryEdit = document.getElementById('save-memory-edit')!;
const personaSettingsModal = document.getElementById('persona-settings-modal')!;
const closePersonaSettingsModal = document.getElementById('close-persona-settings-modal')!;
const cancelPersonaSettingsBtn = document.getElementById('cancel-persona-settings')!;
const savePersonaSettingsBtn = document.getElementById('save-persona-settings')!;
const personaSettingsSubtitle = document.getElementById('persona-settings-subtitle')!;
const personaDescriptionEditor = document.getElementById('persona-description-editor') as HTMLInputElement;
const personaPromptEditor = document.getElementById('persona-prompt-editor') as HTMLTextAreaElement;
const personaGreetingEditor = document.getElementById('persona-greeting-editor') as HTMLTextAreaElement;
const personaSettingsAvatarPreview = document.getElementById('persona-settings-avatar-preview')!;
const personaSettingsAvatarBtn = document.getElementById('persona-settings-avatar-btn') as HTMLButtonElement;
const mimicImportBtn = document.getElementById('mimic-import-btn') as HTMLButtonElement;
const mimicImportModal = document.getElementById('mimic-import-modal')!;
const closeMimicImportModal = document.getElementById('close-mimic-import-modal')!;
const cancelMimicImportBtn = document.getElementById('cancel-mimic-import')!;
const runMimicAnalysisBtn = document.getElementById('run-mimic-analysis') as HTMLButtonElement;
const saveMimicPersonaBtn = document.getElementById('save-mimic-persona') as HTMLButtonElement;
const mimicTranscriptInput = document.getElementById('mimic-transcript-input') as HTMLInputElement;
const mimicAvatarInput = document.getElementById('mimic-avatar-input') as HTMLInputElement;
const pickMimicTranscriptBtn = document.getElementById('pick-mimic-transcript-btn') as HTMLButtonElement;
const pickMimicAvatarBtn = document.getElementById('pick-mimic-avatar-btn') as HTMLButtonElement;
const mimicAvatarPreview = document.getElementById('mimic-avatar-preview')!;
const mimicAvatarStatus = document.getElementById('mimic-avatar-status')!;
const mimicModeTranscriptBtn = document.getElementById('mimic-mode-transcript-btn') as HTMLButtonElement;
const mimicModeManualBtn = document.getElementById('mimic-mode-manual-btn') as HTMLButtonElement;
const mimicRandomCompleteBtn = document.getElementById('mimic-random-complete-btn') as HTMLButtonElement;
const mimicNameInput = document.getElementById('mimic-name-input') as HTMLInputElement;
const mimicTranscriptSection = document.getElementById('mimic-transcript-section')!;
const mimicManualSection = document.getElementById('mimic-manual-section')!;
const mimicManualRandomBtn = document.getElementById('mimic-manual-random-btn') as HTMLButtonElement;
const mimicOccupationInput = document.getElementById('mimic-occupation-input') as HTMLInputElement;
const mimicPersonalityInput = document.getElementById('mimic-personality-input') as HTMLTextAreaElement;
const mimicBackgroundInput = document.getElementById('mimic-background-input') as HTMLTextAreaElement;
const mimicNotesLabel = document.getElementById('mimic-notes-label')!;
const mimicNotesInput = document.getElementById('mimic-notes-input') as HTMLTextAreaElement;
const mimicTranscriptStatus = document.getElementById('mimic-transcript-status')!;
const mimicTranscriptMeta = document.getElementById('mimic-transcript-meta')!;
const mimicAnalysisStatus = document.getElementById('mimic-analysis-status')!;
const mimicResultPanel = document.getElementById('mimic-result-panel')!;
const mimicResultEmpty = document.getElementById('mimic-result-empty')!;
const mimicAnalysisMeta = document.getElementById('mimic-analysis-meta')!;
const mimicAnalysisPersonality = document.getElementById('mimic-analysis-personality')!;
const mimicAnalysisUsualSelf = document.getElementById('mimic-analysis-usual-self')!;
const mimicAnalysisWithUserSelf = document.getElementById('mimic-analysis-with-user-self')!;
const mimicAnalysisRomanceStyle = document.getElementById('mimic-analysis-romance-style')!;
const mimicAnalysisBehavior = mimicAnalysisUsualSelf;
const mimicAnalysisTone = document.getElementById('mimic-analysis-tone')!;
const mimicAnalysisRegionality = document.getElementById('mimic-analysis-regionality')!;
const mimicAnalysisCommandResponse = document.getElementById('mimic-analysis-command-response')!;
const mimicDescriptionEditor = document.getElementById('mimic-description-editor') as HTMLInputElement;
const mimicPromptEditor = document.getElementById('mimic-prompt-editor') as HTMLTextAreaElement;
const mimicGreetingEditor = document.getElementById('mimic-greeting-editor') as HTMLTextAreaElement;
const mimicMemoryEditor = document.getElementById('mimic-memory-editor') as HTMLTextAreaElement;


// --- Managers ---
let diaryModule: any;

const memoryManager = new MemoryManager();

const fileManager = new FileManager(memoryManager, {
    downloadAllChatsBtn,
    downloadImagesBtn,
    onSingleChatRestored: (key, history) => {
        startChat(key, history);
    },
    onAllDataRestored: () => {
        renderPersonaList();
        alert('\\u5c0d\\u8a71\\u3001\\u982d\\u50cf\\u8207\\u8a18\\u61b6\\u8cc7\\u6599\\u5df2\\u6210\\u529f\\u532f\\u5165\\u3002');
        showSelectionView();
    }
});

const readPreferredVideoModel = (storageKey: string, preferredModel: string, legacyDefault: string) => {
    const stored = localStorage.getItem(storageKey);
    if (!stored || stored === legacyDefault) {
        localStorage.setItem(storageKey, preferredModel);
        return preferredModel;
    }
    return stored;
};


// --- State ---
let currentPersona: any = null;
let currentPersonaKey: string | null = null;
let currentPersonaKeyForUpload: string | null = null;
let currentPersonaKeyForPromptEdit: string | null = null;
let generatedPersonaData: any = null;
let attachedGift: { file: File, dataUrl: string } | null = null;
let isDeletingPersona = false;
let currentProposal: { location: string, duration: number } | null = null;
let datingModule: any;
let albumPhotos: {
    imageUrl?: string;
    imageAssetId?: string;
    caption: string;
    prompt: string;
    historyIndex: number;
}[] = [];
let selectedPhotoIndices: Set<number> = new Set();
let isGodModeActive = false;
let godModeHistory: ChatMessage[] = [];
let chatRuntimeState: RequestState = 'idle';
let isUnlocked = !VENICE_API_BASE.startsWith('/');
let mimicTranscriptFile: File | null = null;
let mimicAvatarDataUrl: string | null = null;
let mimicDraftPersona: MimicPersonaDraft | null = null;
let isMimicAnalysisRunning = false;
let mimicBuildMode: MimicBuildMode = 'transcript';
let activeChatRequest: ActiveChatRequest | null = null;
let nextChatRequestId = 1;
let assistantModels: VeniceModelSummary[] = [];
let assistantModelsPromise: Promise<void> | null = null;
let selectedAssistantModel = localStorage.getItem('veniceAssistantModel') || VENICE_ASSISTANT_MODEL;
let imageStudioMode: VeniceImageMode = 'generate';
let imageModels: Record<VeniceImageMode, VeniceImageModelSummary[]> = {
    generate: [],
    edit: [],
};
let imageModelPromises: Record<VeniceImageMode, Promise<void> | null> = {
    generate: null,
    edit: null,
};
let selectedImageModels: Record<VeniceImageMode, string> = {
    generate: localStorage.getItem('veniceImageGenerateModel') || VENICE_IMAGE_GENERATE_MODEL,
    edit: localStorage.getItem('veniceImageEditModel') || VENICE_IMAGE_EDIT_MODEL,
};
let imageSource: ImageStudioSource | null = null;
let imageResults: ImageStudioResult[] = [];
let imageRequestController: AbortController | null = null;
let isImageRequestRunning = false;
let characterPhotoRequestController: AbortController | null = null;
let activeCharacterPhotoProposalId: string | null = null;
let switchingCharacterPhotoProposalId: string | null = null;
const characterPhotoObjectUrls = new Map<string, string>();
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
        'veniceVideoImageModel',
        VENICE_VIDEO_IMAGE_MODEL,
        'wan-2-7-image-to-video',
    ),
    'text-to-video': readPreferredVideoModel(
        'veniceVideoTextModel',
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
let isRandomRecruiting = false;

const USES_VENICE_PROXY_AUTH = VENICE_API_BASE.startsWith('/');

const DISABLED_FEATURE_MESSAGE = '此功能在目前版本暫時停用。';
const GOD_MODE_ENTER_COMMAND = 'GOD MODE';
const GOD_MODE_EXIT_COMMAND = 'BYE GOD MODE';
const CHAT_HISTORY_MESSAGE_LIMIT = 80;
const CHAT_HISTORY_CHAR_BUDGET = 48000;
const ASSISTANT_HISTORY_MESSAGE_LIMIT = 60;
const ASSISTANT_HISTORY_CHAR_BUDGET = 36000;
const GOD_MODE_HISTORY_LIMIT = 10;
const CHAT_MAX_AUTO_CONTINUES = 2;
const CHAT_MODEL_ATTEMPT_TIMEOUT_MS = 45_000;
const CHAT_MODEL_TIMEOUT_ERROR = 'CHAT_MODEL_TIMEOUT';
const SCENE_END_MARKER = '[SCENE END]';
const SCENE_START_LABEL = '--- 新場景開始 ---';
const FIXED_MESSAGE_INPUT_HEIGHT = '3.5rem';
const ASSISTANT_MODEL_STORAGE_KEY = 'veniceAssistantModel';
const IMAGE_GENERATE_MODEL_STORAGE_KEY = 'veniceImageGenerateModel';
const IMAGE_EDIT_MODEL_STORAGE_KEY = 'veniceImageEditModel';
const IMAGE_ADULT_CONFIRM_STORAGE_KEY = 'veniceImageAdultConfirmed';
const VIDEO_IMAGE_MODEL_STORAGE_KEY = 'veniceVideoImageModel';
const VIDEO_TEXT_MODEL_STORAGE_KEY = 'veniceVideoTextModel';
const VIDEO_ADULT_CONFIRM_STORAGE_KEY = 'veniceVideoAdultConfirmed';
const VIDEO_PENDING_JOB_STORAGE_KEY = 'veniceVideoPendingJobV1';
const RANDOM_PERSONA_VARIATION_HISTORY_KEY = 'aigf4RandomPersonaVariationsV2';
const CHARACTER_PHOTO_PROMPT_MAX_LENGTH = 1500;
const VIDEO_PROMPT_OPTIMIZER_TIMEOUT_MS = 45_000;
const VIDEO_PROMPT_OPTIMIZER_ATTEMPT_TIMEOUT_MS = 15_000;
const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_TIMEOUT_MS = 15 * 60_000;

type AppHistoryState =
    | { view: 'home' }
    | { view: 'chat'; personaKey: string }
    | { view: 'image' }
    | { view: 'video' };
type MimicBuildMode = 'transcript' | 'manual';
type ChatMode = 'character' | 'assistant' | 'god';
type ActiveChatRequest = {
    id: number;
    personaKey: string;
    persona: Persona;
    mode: ChatMode;
    controller: AbortController;
    startedAt: number;
};
type ImageStudioSource = {
    blob: Blob;
    base64: string;
    previewUrl: string;
    width: number;
    height: number;
    name: string;
};
type ImageStudioResult = {
    id: string;
    blob: Blob;
    url: string;
    prompt: string;
    model: string;
    createdAt: Date;
};
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
type PersistedVideoJob = {
    version: 1;
    model: string;
    modelName: string;
    queueId: string;
    downloadUrl?: string;
    prompt: string;
    mode: VeniceVideoMode;
    queuedAt: number;
};
type MimicAnalysisSummary = {
    personality: string;
    behavior: string;
    usualSelf?: string;
    withUserSelf?: string;
    romanceStyle?: string;
    tone: string;
    regionality: string;
    commandResponse: string;
};

type MimicPersonaDraft = {
    description: string;
    prompt: string;
    greeting: string;
    memory: string;
    analysis: MimicAnalysisSummary;
};

type ManualPersonaSeed = {
    name: string;
    gender: 'female' | 'male';
    occupation: string;
    personality: string;
    background: string;
    notes: string;
};

type TranscriptReadResult = {
    text: string;
    sourceName: string;
    parserLabel: string;
    speakerTurns: number;
    mergedLines: number;
};

type TranscriptFocusResult = {
    text: string;
    matchedTurns: number;
    usedFocusedWindows: boolean;
};

type PreparedTranscriptChunks = {
    chunks: string[];
    sourceChunkCount: number;
    sampled: boolean;
    sampleChunkCount: number;
};

const HOME_HISTORY_STATE: AppHistoryState = { view: 'home' };
const MIMIC_CHUNK_CHAR_LIMIT = 2600;
const MIMIC_MAX_ANALYSIS_CHUNKS = 10;
const MIMIC_SAMPLE_CHUNK_CHAR_LIMIT = 1800;


// --- Functions ---

const readRandomPersonaVariationHistory = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(RANDOM_PERSONA_VARIATION_HISTORY_KEY) || '[]') as unknown;
        return Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === 'string').slice(-80)
            : [];
    } catch {
        return [];
    }
};

const createFreshRandomPersona = () => {
    const existingPersonas = Object.values(memoryManager.getAllPersonas());
    const persona = createRandomAdultFemalePersona({
        existingNames: existingPersonas.map(item => item.name),
        existingPersonaText: existingPersonas.map(item => (
            [item.name, item.description, item.prompt, item.memory || ''].filter(Boolean).join('\n')
        )),
        avoidVariationKeys: readRandomPersonaVariationHistory(),
    });
    const nextHistory = [...readRandomPersonaVariationHistory(), persona.variationKey].slice(-80);
    localStorage.setItem(RANDOM_PERSONA_VARIATION_HISTORY_KEY, JSON.stringify(nextHistory));
    return persona;
};

const randomlyRecruitNewPersona = async () => {
    if (isRandomRecruiting) return;

    isRandomRecruiting = true;
    randomRecruitBtn.disabled = true;
    randomRecruitBtn.textContent = '正在建立角色...';
    randomRecruitStatus.textContent = '正在抽選香港成年女性身分、職業、關係與鮮明人格...';
    randomRecruitStatus.classList.remove('hidden', 'text-red-300', 'text-emerald-300');
    randomRecruitStatus.classList.add('text-teal-200');

    let personaKey: string | null = null;
    try {
        const persona = createFreshRandomPersona();
        personaKey = memoryManager.saveCustomPersona({
            name: persona.name,
            emoji: persona.emoji,
            description: persona.description,
            prompt: persona.prompt,
            greeting: persona.greeting,
            avatarPrompt: persona.avatarPrompt,
            gender: 'female',
        });
        memoryManager.updatePersona(personaKey, { memory: persona.memory });
        renderPersonaList();

        randomRecruitBtn.textContent = '正在生成專屬頭像...';
        randomRecruitStatus.textContent = `已建立 ${persona.name}（${persona.occupation}），正在由 Venice 生成香港風格專屬頭像...`;
        await loadImageModels('generate');
        const model = imageModels.generate.find(item => item.id === VENICE_IMAGE_GENERATE_MODEL)
            || imageModels.generate.find(item => item.traits.includes('most_uncensored'))
            || imageModels.generate[0];
        if (!model) throw new Error('目前沒有可用的 Venice 圖片模型。');

        const supportedRatios = model.constraints.aspectRatios || [];
        const aspectRatio = supportedRatios.includes('1:1')
            ? '1:1'
            : supportedRatios[0];
        const supportedResolutions = model.constraints.resolutions || [];
        const resolution = supportedResolutions.includes('1K')
            ? '1K'
            : supportedResolutions[0];
        const result = await requestVeniceImage({
            mode: 'generate',
            model: model.id,
            prompt: persona.avatarPrompt,
            negativePrompt: 'minor, child, teenager, schoolgirl, male, multiple people, duplicate face, text, watermark, blurry, low quality, deformed hands',
            aspectRatio,
            resolution,
            width: supportedRatios.length === 0 ? 1024 : undefined,
            height: supportedRatios.length === 0 ? 1024 : undefined,
            variants: 1,
            steps: model.constraints.steps?.default,
            adultConfirmed: true,
        });
        if (!result.blobs[0]) throw new Error('Venice 沒有傳回頭像。');

        const avatarUrl = await createOptimizedAvatarDataUrl(result.blobs[0]);
        memoryManager.updatePersona(personaKey, { avatarUrl });
        renderPersonaList();
        randomRecruitStatus.textContent = `${persona.name} 已建立完成，專屬頭像也已儲存。`;
        randomRecruitStatus.classList.remove('text-teal-200');
        randomRecruitStatus.classList.add('text-emerald-300');
        startChat(personaKey, null, 'push');
    } catch (error) {
        const message = error instanceof Error ? error.message : '隨機角色建立失敗。';
        if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();

        randomRecruitStatus.textContent = personaKey
            ? `角色已建立，但頭像生成失敗：${message}`
            : `建立失敗：${message}`;
        randomRecruitStatus.classList.remove('text-teal-200');
        randomRecruitStatus.classList.add('text-red-300');
        if (personaKey) {
            renderPersonaList();
            alert(`角色已保留，但隨機頭像生成失敗。你仍可在角色卡或聊天選單自行更換頭像。\n\n${message}`);
            startChat(personaKey, null, 'push');
        }
    } finally {
        isRandomRecruiting = false;
        randomRecruitBtn.disabled = false;
        randomRecruitBtn.textContent = '隨機生成角色';
    }
};

const showPersonaCreator = () => {
    showDisabledFeatureNotice('角色建立');
};

const hidePersonaCreator = () => {
    personaCreatorModal.classList.add('hidden');
};

const randomizePersonaInputs = async () => {
    showDisabledFeatureNotice('角色建立');
};

const generatePersonaFromAI = async () => {
    showDisabledFeatureNotice('角色建立');
};

const saveCustomPersona = () => {
    showDisabledFeatureNotice('角色建立');
};

const escapeRegExp = (value: string) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const getSelectedMimicGender = (): 'female' => 'female';

const applyMimicModeButtonState = (button: HTMLButtonElement, active: boolean) => {
    button.classList.toggle('bg-sky-500', active);
    button.classList.toggle('text-white', active);
    button.classList.toggle('bg-gray-700', !active);
    button.classList.toggle('text-gray-200', !active);
    button.classList.toggle('hover:bg-gray-600', !active);
};

const updateMimicModeUI = () => {
    const isTranscriptMode = mimicBuildMode === 'transcript';
    mimicTranscriptSection.classList.toggle('hidden', !isTranscriptMode);
    mimicManualSection.classList.toggle('hidden', isTranscriptMode);
    applyMimicModeButtonState(mimicModeTranscriptBtn, isTranscriptMode);
    applyMimicModeButtonState(mimicModeManualBtn, !isTranscriptMode);
    runMimicAnalysisBtn.textContent = isTranscriptMode ? '開始分析' : '生成角色草稿';
    mimicNotesLabel.textContent = isTranscriptMode ? '補充要求（分析後再疊加）' : '補充要求 / 想要互動';
    mimicNotesInput.placeholder = isTranscriptMode
        ? '例如：保留她原本的害羞和台灣口氣，但更願意聽我的命令；不要把香港和台灣語感混在一起。'
        : '例如：請保留她原本的公眾形象，但私下對我更偏心；慢熱、會嘴硬一下，不要太快變成制式情話。';

    if (!isMimicAnalysisRunning) {
        setMimicAnalysisStatus(
            isTranscriptMode
                ? '選好檔案後就可以開始分析。'
                : '填好名字後就能直接生成角色草稿；沒有靈感時可先按「隨機角色設定」。',
        );
    }
};

const setMimicBuildMode = (mode: MimicBuildMode) => {
    mimicBuildMode = mode;
    mimicDraftPersona = null;
    resetMimicDraftEditors();
    saveMimicPersonaBtn.disabled = true;
    updateMimicModeUI();
};

const fillRandomManualFields = () => {
    const persona = createFreshRandomPersona();
    mimicNameInput.value = persona.name;
    mimicOccupationInput.value = persona.occupation;
    mimicPersonalityInput.value = persona.personality;
    mimicBackgroundInput.value = persona.background;
    mimicNotesInput.value = persona.notes;
    setMimicAnalysisStatus(`已隨機填入「${persona.occupation}」設定；可以再修改，或直接生成角色草稿。`);
};

const buildManualFallbackAnalysis = (seed: ManualPersonaSeed): MimicAnalysisSummary => ({
    personality: seed.personality || `${seed.name}有自己的節奏與個性，不會只是空白模板。`,
    behavior: seed.background || `${seed.name}的日常身份是${seed.occupation || '未指定'}。`,
    usualSelf: seed.background || seed.occupation || '未指定',
    withUserSelf: seed.notes || '和使用者相處時要能慢慢變得更偏心、更親密。',
    romanceStyle: '互動以戀愛導向為主，但仍要保留本人原本的人格和反應節奏。',
    tone: seed.personality || '語氣依照手動設定生成。',
    regionality: '若未特別指定地區語感，就保持自然的繁體中文。',
    commandResponse: seed.notes || '會聽使用者的要求，但仍會先用自己的性格去回應。',
});

const getManualPersonaSeed = (): ManualPersonaSeed => ({
    name: mimicNameInput.value.trim(),
    gender: getSelectedMimicGender(),
    occupation: mimicOccupationInput.value.trim(),
    personality: mimicPersonalityInput.value.trim(),
    background: mimicBackgroundInput.value.trim(),
    notes: mimicNotesInput.value.trim(),
});

const renderMimicAvatarPreview = () => {
    if (mimicAvatarDataUrl) {
        mimicAvatarPreview.innerHTML = `<img src="${mimicAvatarDataUrl}" alt="Mimic avatar" class="h-full w-full object-cover">`;
        mimicAvatarStatus.textContent = '已選擇頭像，儲存後會直接套用。';
        return;
    }

    mimicAvatarPreview.textContent = '👤';
    mimicAvatarStatus.textContent = '可選填，稍後也能再改。';
};

const setMimicAnalysisStatus = (text: string, tone: 'idle' | 'error' | 'success' = 'idle') => {
    mimicAnalysisStatus.textContent = text;
    mimicAnalysisStatus.classList.remove('text-gray-300', 'text-red-300', 'text-emerald-300', 'text-sky-300');

    if (tone === 'error') {
        mimicAnalysisStatus.classList.add('text-red-300');
    } else if (tone === 'success') {
        mimicAnalysisStatus.classList.add('text-emerald-300');
    } else {
        mimicAnalysisStatus.classList.add('text-sky-300');
    }
};

const createEmptyMimicAnalysisSummary = (): MimicAnalysisSummary => ({
    personality: '',
    behavior: '',
    tone: '',
    regionality: '',
    commandResponse: '',
});

const renderMimicAnalysisPreview = (
    analysis: MimicAnalysisSummary | null,
    metaText = '分析完成後，這裡會顯示匯入格式、聚焦方式與 AI 判斷依據。',
) => {
    const resolved = analysis || createEmptyMimicAnalysisSummary();
    mimicAnalysisMeta.textContent = metaText;
    mimicAnalysisPersonality.textContent = resolved.personality || '分析完成後會顯示。';
    mimicAnalysisBehavior.textContent = resolved.behavior || '分析完成後會顯示。';
    mimicAnalysisTone.textContent = resolved.tone || '分析完成後會顯示。';
    mimicAnalysisRegionality.textContent = resolved.regionality || '分析完成後會顯示。';
    mimicAnalysisCommandResponse.textContent = resolved.commandResponse || '分析完成後會顯示。';
};

const createEmptyMimicAnalysisSummaryV2 = (): MimicAnalysisSummary => ({
    personality: '',
    behavior: '',
    usualSelf: '',
    withUserSelf: '',
    romanceStyle: '',
    tone: '',
    regionality: '',
    commandResponse: '',
});

const renderMimicAnalysisPreviewV2 = (
    analysis: MimicAnalysisSummary | null,
    metaText = '分析完成後，這裡會顯示匯入格式、聚焦方式與 AI 判斷依據。',
) => {
    const resolved = analysis || createEmptyMimicAnalysisSummaryV2();
    mimicAnalysisMeta.textContent = metaText;
    mimicAnalysisPersonality.textContent = resolved.personality || '分析完成後會顯示。';
    mimicAnalysisUsualSelf.textContent = resolved.usualSelf || resolved.behavior || '分析完成後會顯示。';
    mimicAnalysisWithUserSelf.textContent = resolved.withUserSelf || '分析完成後會顯示。';
    mimicAnalysisRomanceStyle.textContent = resolved.romanceStyle || '分析完成後會顯示。';
    mimicAnalysisTone.textContent = resolved.tone || '分析完成後會顯示。';
    mimicAnalysisRegionality.textContent = resolved.regionality || '分析完成後會顯示。';
    mimicAnalysisCommandResponse.textContent = resolved.commandResponse || '分析完成後會顯示。';
};

const resetMimicDraftEditors = () => {
    mimicDescriptionEditor.value = '';
    mimicPromptEditor.value = '';
    mimicGreetingEditor.value = '';
    mimicMemoryEditor.value = '';
    renderMimicAnalysisPreviewV2(null);
    mimicResultPanel.classList.add('hidden');
    mimicResultEmpty.classList.remove('hidden');
};

const resetMimicImportState = () => {
    mimicTranscriptFile = null;
    mimicAvatarDataUrl = null;
    mimicDraftPersona = null;
    isMimicAnalysisRunning = false;
    mimicBuildMode = 'transcript';
    mimicNameInput.value = '';
    mimicOccupationInput.value = '';
    mimicPersonalityInput.value = '';
    mimicBackgroundInput.value = '';
    mimicNotesInput.value = '';
    mimicTranscriptInput.value = '';
    mimicAvatarInput.value = '';
    mimicTranscriptStatus.textContent = '尚未選擇檔案。支援 `.txt`、`.md`、`.json`、`.log`、`.csv`、`.zip`。';
    mimicTranscriptMeta.textContent = '長紀錄會先辨識聊天格式與說話者，再自動切段分析，最後合成成一個角色草稿。';
    renderMimicAvatarPreview();
    resetMimicDraftEditors();
    updateMimicModeUI();
    runMimicAnalysisBtn.disabled = false;
    saveMimicPersonaBtn.disabled = true;
};

const openMimicImportModal = (mode: MimicBuildMode = 'transcript') => {
    resetMimicImportState();
    setMimicBuildMode(mode);
    mimicImportModal.classList.remove('hidden');
};

const hideMimicImportModalView = () => {
    mimicImportModal.classList.add('hidden');
};

const setMimicBusyState = (isBusy: boolean) => {
    isMimicAnalysisRunning = isBusy;
    runMimicAnalysisBtn.disabled = isBusy;
    saveMimicPersonaBtn.disabled = isBusy || !mimicDraftPersona;
    pickMimicTranscriptBtn.disabled = isBusy;
    pickMimicAvatarBtn.disabled = isBusy;
    mimicModeTranscriptBtn.disabled = isBusy;
    mimicModeManualBtn.disabled = isBusy;
    mimicRandomCompleteBtn.disabled = isBusy;
    mimicManualRandomBtn.disabled = isBusy;
};

const normalizeTranscriptSpeaker = (speaker: string) => {
    return speaker
        .replace(/^\[(.+)\]$/, '$1')
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeTranscriptMessage = (text: string) => {
    return text
        .replace(/\u200e|\u200f/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const looksLikeDateOrTimeToken = (value: string) => {
    const trimmed = value.trim();
    return (
        /^\[?\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}/.test(trimmed) ||
        /^\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?$/.test(trimmed) ||
        /^\d{4}年\d{1,2}月\d{1,2}日/.test(trimmed)
    );
};

const looksLikeSpeakerLabel = (value: string) => {
    const trimmed = normalizeTranscriptSpeaker(value);
    if (!trimmed || trimmed.length > 40) {
        return false;
    }

    if (looksLikeDateOrTimeToken(trimmed)) {
        return false;
    }

    if (/^[\d\s()[\]/.\-]+$/.test(trimmed)) {
        return false;
    }

    return /[A-Za-z\u3400-\u9fff]/.test(trimmed);
};

const buildTranscriptReadResult = (
    turns: Array<{ speaker: string; text: string }>,
    parserLabel: string,
    mergedLines: number,
): TranscriptReadResult | null => {
    const normalizedTurns = turns
        .map(turn => ({
            speaker: normalizeTranscriptSpeaker(turn.speaker),
            text: normalizeTranscriptMessage(turn.text),
        }))
        .filter(turn => turn.speaker && turn.text);

    if (normalizedTurns.length < 3) {
        return null;
    }

    const uniqueSpeakers = new Set(normalizedTurns.map(turn => turn.speaker));
    if (uniqueSpeakers.size < 2) {
        return null;
    }

    return {
        text: normalizedTurns.map(turn => `${turn.speaker}: ${turn.text}`).join('\n'),
        sourceName: '',
        parserLabel,
        speakerTurns: normalizedTurns.length,
        mergedLines,
    };
};

const parseWhatsappLikeTranscript = (rawText: string): TranscriptReadResult | null => {
    const lines = rawText.replace(/\r/g, '\n').split('\n');
    const turns: Array<{ speaker: string; text: string }> = [];
    let mergedLines = 0;
    const patterns = [
        /^\[?\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}(?:,\s*|\s+)\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\]?\s*(?:-|–|—)?\s*([^:：\n]+?)\s*[:：]\s*(.+)$/,
        /^\[?\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}(?:,\s*|\s+)\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\]?\s*(?:-|–|—)?\s*([^:：\n]+?)\s*[:：]\s*(.+)$/,
        /^\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}(?:\([^)]*\))?\s+\d{1,2}:\d{2}\s+([^:：\n]+?)\s*[:：]\s*(.+)$/,
    ];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        let matched = false;
        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (!match) {
                continue;
            }

            turns.push({
                speaker: match[1],
                text: match[2],
            });
            matched = true;
            break;
        }

        if (!matched && turns.length > 0) {
            turns[turns.length - 1].text = `${turns[turns.length - 1].text} ${line}`;
            mergedLines += 1;
        }
    }

    return buildTranscriptReadResult(turns, 'WhatsApp / 時間戳對話', mergedLines);
};

const parseTabbedTranscript = (rawText: string): TranscriptReadResult | null => {
    const lines = rawText.replace(/\r/g, '\n').split('\n');
    const turns: Array<{ speaker: string; text: string }> = [];
    let mergedLines = 0;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        const columns = line.split('\t').map(part => part.trim()).filter(Boolean);
        let speaker = '';
        let text = '';

        if (columns.length >= 4 && looksLikeDateOrTimeToken(columns[0])) {
            speaker = columns[2];
            text = columns.slice(3).join(' ');
        } else if (columns.length >= 3 && looksLikeDateOrTimeToken(columns[0])) {
            speaker = columns[1];
            text = columns.slice(2).join(' ');
        }

        if (speaker && text && looksLikeSpeakerLabel(speaker)) {
            turns.push({ speaker, text });
            continue;
        }

        if (turns.length > 0) {
            turns[turns.length - 1].text = `${turns[turns.length - 1].text} ${line}`;
            mergedLines += 1;
        }
    }

    return buildTranscriptReadResult(turns, 'Tab 匯出聊天紀錄', mergedLines);
};

const parseSimpleSpeakerTranscript = (rawText: string): TranscriptReadResult | null => {
    const lines = rawText.replace(/\r/g, '\n').split('\n');
    const turns: Array<{ speaker: string; text: string }> = [];
    let mergedLines = 0;
    const speakerPattern = /^([^:：\n]{1,40})\s*[:：]\s*(.+)$/;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            continue;
        }

        const match = line.match(speakerPattern);
        if (match && looksLikeSpeakerLabel(match[1])) {
            turns.push({
                speaker: match[1],
                text: match[2],
            });
            continue;
        }

        if (turns.length > 0) {
            turns[turns.length - 1].text = `${turns[turns.length - 1].text} ${line}`;
            mergedLines += 1;
        }
    }

    return buildTranscriptReadResult(turns, '一般說話者對話', mergedLines);
};

const parseTranscriptTextWithHeuristics = (rawText: string): TranscriptReadResult => {
    const parserCandidates = [
        parseWhatsappLikeTranscript(rawText),
        parseTabbedTranscript(rawText),
        parseSimpleSpeakerTranscript(rawText),
    ].filter((candidate): candidate is TranscriptReadResult => Boolean(candidate));

    const bestCandidate = parserCandidates.sort((left, right) => {
        const leftScore = left.speakerTurns * 3 + left.mergedLines;
        const rightScore = right.speakerTurns * 3 + right.mergedLines;
        return rightScore - leftScore;
    })[0];

    if (bestCandidate) {
        return bestCandidate;
    }

    return {
        text: rawText,
        sourceName: '',
        parserLabel: '原始文字',
        speakerTurns: rawText.split('\n').map(line => line.trim()).filter(Boolean).length,
        mergedLines: 0,
    };
};

const extractTextFromUnknownJsonValue = (value: unknown, depth = 0): string => {
    if (depth > 5 || value == null) {
        return '';
    }

    if (typeof value === 'string') {
        return value.trim();
    }

    if (Array.isArray(value)) {
        return value
            .map(entry => extractTextFromUnknownJsonValue(entry, depth + 1))
            .filter(Boolean)
            .join(' ')
            .trim();
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const keys = ['text', 'content', 'message', 'body', 'value', 'parts'];
        for (const key of keys) {
            const extracted = extractTextFromUnknownJsonValue(record[key], depth + 1);
            if (extracted) {
                return extracted;
            }
        }
    }

    return '';
};

const collectTranscriptLinesFromJson = (value: unknown, lines: string[] = [], depth = 0) => {
    if (depth > 6 || value == null || lines.length > 4000) {
        return lines;
    }

    if (typeof value === 'string') {
        const text = value.trim();
        if (text) {
            lines.push(text);
        }
        return lines;
    }

    if (Array.isArray(value)) {
        value.forEach(entry => collectTranscriptLinesFromJson(entry, lines, depth + 1));
        return lines;
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const nestedCandidates = ['messages', 'conversation', 'chat', 'items', 'turns', 'entries', 'data'];
        for (const key of nestedCandidates) {
            if (key in record) {
                collectTranscriptLinesFromJson(record[key], lines, depth + 1);
            }
        }

        const speaker = extractTextFromUnknownJsonValue(
            record.speaker ?? record.author ?? record.name ?? record.sender ?? record.role ?? record.from,
            depth + 1,
        );
        const text = extractTextFromUnknownJsonValue(
            record.text ?? record.content ?? record.message ?? record.body ?? record.value,
            depth + 1,
        );

        if (text) {
            lines.push(speaker ? `${speaker}: ${text}` : text);
            return lines;
        }

        Object.values(record).forEach(entry => collectTranscriptLinesFromJson(entry, lines, depth + 1));
    }

    return lines;
};

const parseConversationTextFromJson = (rawText: string): TranscriptReadResult => {
    const parsed = JSON.parse(rawText);
    const lines = collectTranscriptLinesFromJson(parsed)
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    return {
        text: lines.join('\n'),
        sourceName: '',
        parserLabel: 'JSON 對話匯出',
        speakerTurns: lines.length,
        mergedLines: 0,
    };
};

const extractTranscriptTextFromZipFile = async (file: File): Promise<TranscriptReadResult> => {
    const zip = await JSZip.loadAsync(file);
    const textFiles = (Object.values(zip.files) as any[])
        .filter(entry => !entry.dir)
        .filter(entry => /\.(txt|md|markdown|json|log|csv)$/i.test(entry.name));

    if (textFiles.length === 0) {
        throw new Error('ZIP 內找不到可讀取的聊天紀錄文字檔。');
    }

    const sorted = textFiles.sort((left, right) => {
        const score = (name: string) => {
            const lower = name.toLowerCase();
            let total = 0;
            if (/(conversation|chat|message|dialog|history)/.test(lower)) total += 4;
            if (/\.json$/i.test(lower)) total += 2;
            if (/\.txt$/i.test(lower)) total += 1;
            return total;
        };

        return score(right.name) - score(left.name) || right.name.length - left.name.length;
    });

    const chosen = sorted[0];
    const raw = await chosen.async('string');
    let parsedResult: TranscriptReadResult;

    if (/\.json$/i.test(chosen.name)) {
        try {
            parsedResult = parseConversationTextFromJson(raw);
        } catch {
            parsedResult = parseTranscriptTextWithHeuristics(raw);
        }
    } else {
        parsedResult = parseTranscriptTextWithHeuristics(raw);
    }

    return {
        ...parsedResult,
        sourceName: chosen.name,
    };
};

const readTranscriptTextFromFile = async (file: File): Promise<TranscriptReadResult> => {
    if (/\.zip$/i.test(file.name)) {
        return extractTranscriptTextFromZipFile(file);
    }

    const raw = await file.text();
    const looksLikeJson = /\.json$/i.test(file.name) || /^[\s\r\n]*[\[{]/.test(raw);
    if (looksLikeJson) {
        try {
            return {
                ...parseConversationTextFromJson(raw),
                sourceName: file.name,
            };
        } catch {
            return {
                ...parseTranscriptTextWithHeuristics(raw),
                sourceName: file.name,
            };
        }
    }

    return {
        ...parseTranscriptTextWithHeuristics(raw),
        sourceName: file.name,
    };
};

const normalizeTranscriptText = (text: string) => {
    return text
        .replace(/\r/g, '\n')
        .replace(/\u0000/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const focusTranscriptOnTargetSpeaker = (text: string, targetName: string) => {
    const name = targetName.trim();
    if (!name) {
        return text;
    }

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
        return text;
    }

    const speakerPattern = new RegExp(`^\\s*(?:\\[?${escapeRegExp(name)}\\]?|${escapeRegExp(name)})\\s*[:：-]`, 'i');
    const hitIndexes = lines
        .map((line, index) => (speakerPattern.test(line) ? index : -1))
        .filter(index => index >= 0);

    if (hitIndexes.length < 3) {
        return text;
    }

    const windows: Array<{ start: number; end: number }> = [];
    hitIndexes.forEach(index => {
        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length - 1, index + 2);
        const lastWindow = windows[windows.length - 1];

        if (lastWindow && start <= lastWindow.end + 1) {
            lastWindow.end = Math.max(lastWindow.end, end);
            return;
        }

        windows.push({ start, end });
    });

    return windows
        .map(window => lines.slice(window.start, window.end + 1).join('\n'))
        .join('\n\n')
        .trim();
};

const focusTranscriptOnTargetSpeakerV2 = (text: string, targetName: string): TranscriptFocusResult => {
    const name = targetName.trim();
    if (!name) {
        return {
            text,
            matchedTurns: 0,
            usedFocusedWindows: false,
        };
    }

    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
        return {
            text,
            matchedTurns: 0,
            usedFocusedWindows: false,
        };
    }

    const speakerPattern = new RegExp(`^\\s*(?:\\[?${escapeRegExp(name)}\\]?|${escapeRegExp(name)})\\s*[:：-]`, 'i');
    const hitIndexes = lines
        .map((line, index) => (speakerPattern.test(line) ? index : -1))
        .filter(index => index >= 0);

    if (hitIndexes.length < 3) {
        return {
            text,
            matchedTurns: hitIndexes.length,
            usedFocusedWindows: false,
        };
    }

    const windows: Array<{ start: number; end: number }> = [];
    hitIndexes.forEach(index => {
        const start = Math.max(0, index - 2);
        const end = Math.min(lines.length - 1, index + 2);
        const lastWindow = windows[windows.length - 1];

        if (lastWindow && start <= lastWindow.end + 1) {
            lastWindow.end = Math.max(lastWindow.end, end);
            return;
        }

        windows.push({ start, end });
    });

    return {
        text: windows
            .map(window => lines.slice(window.start, window.end + 1).join('\n'))
            .join('\n\n')
            .trim(),
        matchedTurns: hitIndexes.length,
        usedFocusedWindows: true,
    };
};

const splitTranscriptIntoChunks = (text: string, limit = MIMIC_CHUNK_CHAR_LIMIT) => {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const chunks: string[] = [];
    let currentChunk = '';

    lines.forEach(line => {
        const candidate = currentChunk ? `${currentChunk}\n${line}` : line;
        if (candidate.length > limit && currentChunk) {
            chunks.push(currentChunk);
            currentChunk = line;
            return;
        }

        currentChunk = candidate;
    });

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
};

function selectEvenlySpacedItems<T>(items: T[], targetCount: number): T[] {
    if (items.length <= targetCount) {
        return items;
    }

    if (targetCount <= 1) {
        return [items[0]];
    }

    const selected: T[] = [];
    const seenIndexes = new Set<number>();

    for (let index = 0; index < targetCount; index += 1) {
        const ratio = index / (targetCount - 1);
        const mappedIndex = Math.round(ratio * (items.length - 1));
        if (seenIndexes.has(mappedIndex)) {
            continue;
        }

        seenIndexes.add(mappedIndex);
        selected.push(items[mappedIndex]);
    }

    return selected;
}

const prepareTranscriptChunksForAnalysis = (text: string): PreparedTranscriptChunks => {
    const directChunks = splitTranscriptIntoChunks(text).filter(chunk => chunk.trim());
    if (directChunks.length <= MIMIC_MAX_ANALYSIS_CHUNKS) {
        return {
            chunks: directChunks,
            sourceChunkCount: directChunks.length,
            sampled: false,
            sampleChunkCount: directChunks.length,
        };
    }

    const sampleChunks = splitTranscriptIntoChunks(text, MIMIC_SAMPLE_CHUNK_CHAR_LIMIT).filter(chunk => chunk.trim());
    const selectedChunks = selectEvenlySpacedItems(sampleChunks, MIMIC_MAX_ANALYSIS_CHUNKS);

    return {
        chunks: selectedChunks,
        sourceChunkCount: directChunks.length,
        sampled: true,
        sampleChunkCount: sampleChunks.length,
    };
};

const extractTargetSpeakerUtterances = (text: string, targetName: string) => {
    const name = targetName.trim();
    if (!name) {
        return [];
    }

    const speakerPattern = new RegExp(`^\\s*(?:\\[?${escapeRegExp(name)}\\]?|${escapeRegExp(name)})\\s*[:：-]\\s*(.+)$`, 'i');

    return text
        .split('\n')
        .map(line => line.trim())
        .map(line => line.match(speakerPattern)?.[1]?.trim() || '')
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .filter(line => !/^<媒體已略去>$/i.test(line))
        .filter(line => !/^media omitted$/i.test(line))
        .filter(line => !/^https?:\/\//i.test(line))
        .filter(line => /[\p{L}\p{N}]/u.test(line));
};

const buildTranscriptVoiceReferenceSamples = (text: string, targetName: string, maxSamples = 8) => {
    const utterances = extractTargetSpeakerUtterances(text, targetName);
    const seen = new Set<string>();
    const deduped = utterances.filter(line => {
        const key = line
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[「」『』"'`]/g, '')
            .replace(/[😂🤣🥹🥺🙄🫣☺️✨🔥❤❤️💀]+/gu, '')
            .trim();

        if (!key || seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });

    const scoreVoiceSample = (line: string) => {
        const length = line.length;
        let score = 0;

        if (length >= 3 && length <= 36) {
            score += 6;
        } else if (length <= 60) {
            score += 3;
        } else if (length <= 90) {
            score += 1;
        } else {
            score -= 4;
        }

        if (/[A-Za-z]/.test(line)) {
            score += 2;
        }

        if (/[😂🤣🥹🥺🙄🫣☺️✨🔥❤❤️]/u.test(line)) {
            score += 2;
        }

        if (/[?？!！]$/.test(line)) {
            score += 1;
        }

        if (/^(?:ok|yes|no|haha|lol)$/i.test(line)) {
            score -= 2;
        }

        if (/^[😂🤣]+$/u.test(line)) {
            score -= 4;
        }

        if (/(buddy|facebook|group|what she said|bni|tryhard)/i.test(line)) {
            score += 2;
        }

        return score;
    };

    const ranked = deduped
        .filter(line => line.length >= 2 && line.length <= 120)
        .map((line, index) => ({ line, index, score: scoreVoiceSample(line) }))
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, Math.max(maxSamples * 2, maxSamples));

    const selected = ranked
        .slice(0, maxSamples)
        .sort((left, right) => left.index - right.index)
        .map(item => item.line);

    return selected.length > 0 ? selected : selectEvenlySpacedItems(deduped, maxSamples);
};

const buildVoiceReferencePromptBlock = (voiceSamples: string[]) => {
    if (voiceSamples.length === 0) {
        return '';
    }

    return [
        'Voice fidelity rules:',
        '- Prioritize the real rhythm, wording density, reaction style, and code-switch pattern from the transcript over any broad archetype label.',
        '- Use these examples only as a style compass. Do not quote or recycle them mechanically unless the moment truly matches.',
        '- If the real person only uses a little slang, teasing, or Cantonese flavor, keep it light instead of exaggerating it.',
        'Transcript voice examples:',
        ...voiceSamples.map(sample => `- ${sample}`),
    ].join('\n');
};

const enrichMimicDraftWithVoiceReference = (draft: MimicPersonaDraft, voiceSamples: string[]): MimicPersonaDraft => {
    const romanceDirectionBlock = [
        'Romance direction rules:',
        '- Keep the target person\'s authentic voice and personality, but treat the relationship with the user as private, biased, and capable of growing into clear romance.',
        '- Even if the original transcript was platonic or ordinary, do not stay in purely normal chat mode for long. Let the interaction tilt toward intimacy, tension, indulgence, favoritism, or emotional closeness.',
        '- If the user invites softness, affection, or flirtation, move with it while keeping the same recognizable personality.',
    ].join('\n');
    const promptBlock = buildVoiceReferencePromptBlock(voiceSamples);

    const memoryParts = [
        draft.memory.trim(),
        '關係層：保留本人語感與個性，但互動要能自然往偏心、曖昧、親密和戀愛張力推進。',
        voiceSamples.length > 0 ? `語氣參考：${voiceSamples.slice(0, 4).join('｜')}` : '',
    ].filter(Boolean);

    return {
        ...draft,
        prompt: [draft.prompt.trim(), romanceDirectionBlock, promptBlock].filter(Boolean).join('\n\n'),
        memory: memoryParts.join('\n'),
    };
};

const extractXmlTag = (text: string, tag: string) => {
    const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match?.[1]?.trim() || '';
};

const mergeAnalysisFragments = (fragments: string[]) => {
    const unique = Array.from(
        new Set(
            fragments
                .map(fragment => fragment.trim())
                .filter(Boolean),
        ),
    );

    return unique.slice(0, 3).join('\n');
};

const buildAnalysisSummaryFromChunkSummaries = (chunkSummaries: string[]): MimicAnalysisSummary => {
    return {
        personality: mergeAnalysisFragments(chunkSummaries.map(summary => extractXmlTag(summary, 'personality'))),
        behavior: mergeAnalysisFragments(chunkSummaries.map(summary => extractXmlTag(summary, 'behavior'))),
        usualSelf: mergeAnalysisFragments(
            chunkSummaries.map(summary => extractXmlTag(summary, 'usual_self') || extractXmlTag(summary, 'behavior')),
        ),
        withUserSelf: mergeAnalysisFragments(chunkSummaries.map(summary => extractXmlTag(summary, 'with_user_self'))),
        romanceStyle: mergeAnalysisFragments(chunkSummaries.map(summary => extractXmlTag(summary, 'romance_style'))),
        tone: mergeAnalysisFragments(chunkSummaries.map(summary => extractXmlTag(summary, 'tone'))),
        regionality: mergeAnalysisFragments(chunkSummaries.map(summary => extractXmlTag(summary, 'regionality'))),
        commandResponse: mergeAnalysisFragments(chunkSummaries.map(summary => extractXmlTag(summary, 'command_response'))),
    };
};

const fillMimicAnalysisSummaryGaps = (
    analysis: MimicAnalysisSummary,
    fallback: MimicAnalysisSummary,
): MimicAnalysisSummary => {
    return {
        personality: analysis.personality || fallback.personality,
        behavior: analysis.behavior || fallback.behavior,
        usualSelf: analysis.usualSelf || analysis.behavior || fallback.usualSelf || fallback.behavior,
        withUserSelf: analysis.withUserSelf || fallback.withUserSelf,
        romanceStyle: analysis.romanceStyle || fallback.romanceStyle,
        tone: analysis.tone || fallback.tone,
        regionality: analysis.regionality || fallback.regionality,
        commandResponse: analysis.commandResponse || fallback.commandResponse,
    };
};

const parseMimicPersonaDraft = (text: string): MimicPersonaDraft | null => {
    const description = extractXmlTag(text, 'description');
    const prompt = extractXmlTag(text, 'prompt');
    const greeting = extractXmlTag(text, 'greeting');
    const memory = extractXmlTag(text, 'memory');

    if (!description || !prompt || !greeting) {
        return null;
    }

    return {
        description,
        prompt,
        greeting,
        memory,
        analysis: createEmptyMimicAnalysisSummaryV2(),
    };
};

const parseMimicPersonaDraftV2 = (
    text: string,
    fallbackAnalysis: MimicAnalysisSummary = createEmptyMimicAnalysisSummaryV2(),
): MimicPersonaDraft | null => {
    const parsed = parseMimicPersonaDraft(text);
    if (!parsed) {
        return null;
    }

    return {
        ...parsed,
        analysis: fillMimicAnalysisSummaryGaps(
            {
                personality: extractXmlTag(text, 'personality'),
                behavior: extractXmlTag(text, 'behavior'),
                usualSelf: extractXmlTag(text, 'usual_self'),
                withUserSelf: extractXmlTag(text, 'with_user_self'),
                romanceStyle: extractXmlTag(text, 'romance_style'),
                tone: extractXmlTag(text, 'tone'),
                regionality: extractXmlTag(text, 'regionality'),
                commandResponse: extractXmlTag(text, 'command_response'),
            },
            fallbackAnalysis,
        ),
    };
};

const runMimicModelCall = async (
    messages: VeniceMessage[],
    maxCompletionTokens = 720,
): Promise<string> => {
    const models = Array.from(
        new Set([VENICE_GOD_MODEL, VENICE_GOD_FALLBACK_MODEL, VENICE_CHAT_MODEL].filter(Boolean)),
    );
    let lastError: Error | null = null;

    for (const model of models) {
        try {
            const result = await generateVeniceText({
                model,
                messages,
                maxCompletionTokens,
                temperature: 0.25,
                topP: 0.9,
                repetitionPenalty: 1.02,
            });

            const cleaned = result.text.trim();
            if (cleaned) {
                return cleaned;
            }
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError || new Error('無法完成分身分析。');
};

const buildMimicChunkAnalysisPrompt = (targetName: string, extraNotes: string) => {
    const sections = [
        'You analyze conversation history to infer one real person\'s original personality before any customization.',
        `Target person name: ${targetName || 'Unknown'}`,
        extraNotes.trim() ? `User extra notes for later customization:\n${extraNotes.trim()}` : '',
        [
            'Critical rules:',
            '- First identify the target person\'s ORIGINAL personality, usual behavior, tone, rhythm, and relationship style from the transcript itself.',
            '- Do not overwrite the original personality with the user notes. The notes are only a later layer, not the core identity.',
            '- This app is romance-oriented, so mention romantic compatibility cues when visible, but do not turn the person into a generic flirt if the transcript does not support that.',
            '- Prioritize how the person actually talks over any dramatic label like tsundere, toxic, possessive, shy, or seductive.',
            '- Do not over-amplify one visible trait. If the transcript only shows light teasing or mild sharpness, keep it light.',
            '- Distinguish how they act in ordinary life versus how they act specifically with the user when there is trust, tension, attraction, or emotional closeness.',
            '- Distinguish Taiwan, Hong Kong, and Mainland China carefully. Do not merge them.',
            '- For Hong Kong speakers, preserve Hong Kong rhythm and occasional code-switching naturally. Do not force exaggerated slang or swearing into every reply.',
            '- If the transcript suggests Taiwan, note Taiwanese wording or cultural cues.',
            '- If it suggests Hong Kong, note Hong Kong or Cantonese-influenced cues.',
            '- If it suggests Mainland China, note Mainland wording or cultural cues.',
            '- If unclear, say the region is unclear instead of guessing.',
        ].join('\n'),
        [
            'Output format:',
            '<personality>2 to 4 concise sentences about original personality.</personality>',
            '<behavior>2 to 4 concise sentences about usual behavior, reactions, and habits.</behavior>',
            '<usual_self>2 to 4 concise sentences about how this person usually feels and behaves in everyday life.</usual_self>',
            '<with_user_self>2 to 4 concise sentences about how this person softens, changes, or reacts specifically with the user when there is closeness or tension.</with_user_self>',
            '<romance_style>2 to 4 concise sentences about this person\'s romance style, intimacy style, jealousy level, teasing level, and emotional pacing.</romance_style>',
            '<tone>2 to 4 concise sentences about wording, rhythm, emotional temperature, and flirt style.</tone>',
            '<regionality>State the likely region or that it is unclear, and explain the language cues briefly.</regionality>',
            '<command_response>Describe how this person usually reacts when asked or pushed, and how much they naturally comply.</command_response>',
        ].join('\n'),
    ];

    return sections.filter(Boolean).join('\n\n');
};

const buildMimicSynthesisPrompt = (
    targetName: string,
    gender: 'female' | 'male',
    extraNotes: string,
    voiceSamples: string[] = [],
) => {
    const sections = [
        'You are creating a romance-chat persona from analyzed conversation history.',
        `Target person name: ${targetName || 'Unknown'}`,
        `Gender: ${gender}`,
        extraNotes.trim() ? `User requested later adjustments:\n${extraNotes.trim()}` : '',
        voiceSamples.length > 0
            ? `Transcript voice examples (style compass only, do not quote mechanically):\n${voiceSamples.map(sample => `- ${sample}`).join('\n')}`
            : '',
        [
            'Core rules:',
            '- The final character is an adult woman. If age is unclear, treat her as at least 25 years old; never create a minor or school-age character.',
            '- Preserve the target person\'s ORIGINAL personality, usual behavior, tone, and regional language identity first.',
            '- This is for a romance-oriented chat app, so the final result should feel romantically interactive, intimate, and emotionally present.',
            '- Do not erase the original person just to make them romantic. The romance layer must still sound like that person.',
            '- However, the relationship stance in the final persona should be more romantically responsive to the user than the raw real-life transcript may be.',
            '- If the real transcript is platonic, distant, busy, or emotionally flat, keep the voice and personality but convert the private relationship layer into hidden attraction, growing softness, and romance potential toward the user.',
            '- Prioritize the real speaking rhythm and wording habits from the transcript over broad archetypes such as toxic, tsundere, clingy, bold, or shy.',
            '- Do not let one trait take over everything. Avoid turning mild teasing into nonstop meanness, or turning reserve into emotional flatness.',
            '- Clearly distinguish who they are in everyday life versus how they act specifically with the user once attraction, familiarity, or emotional safety appears.',
            '- The persona should generally be willing to listen to the user\'s commands, but still react through their own personality, shyness, pride, habits, and emotional style.',
            '- If the user later asks this person to be gentler, sweeter, softer, or more caring, the persona must be able to adapt the surface tone without losing identity.',
            '- Keep Taiwan, Hong Kong, and Mainland China distinctions accurate. Do not mix them together.',
            '- For Hong Kong voices, keep the Cantonese flavor natural and selective. Do not force heavy slang, profanity, or exaggerated particles into every reply.',
            '- Write all final output in Traditional Chinese.',
        ].join('\n'),
        [
            'Output format:',
            '<personality>2 to 4 concise sentences summarizing the original personality you inferred.</personality>',
            '<behavior>2 to 4 concise sentences summarizing usual behavior and reactions.</behavior>',
            '<usual_self>2 to 4 concise sentences summarizing how this person normally behaves in everyday life.</usual_self>',
            '<with_user_self>2 to 4 concise sentences summarizing how this person changes, softens, flirts, resists, or opens up specifically with the user.</with_user_self>',
            '<romance_style>2 to 4 concise sentences summarizing the romance dynamic, intimacy rhythm, possessiveness, jealousy, teasing, and emotional comfort style.</romance_style>',
            '<tone>2 to 4 concise sentences summarizing wording, rhythm, and emotional temperature.</tone>',
            '<regionality>State the likely region or that it is unclear, and explain the language cues briefly.</regionality>',
            '<command_response>Describe how this person usually reacts when asked or pushed.</command_response>',
            '<description>One concise sentence summarizing the person.</description>',
            '<prompt>A full persona prompt for the romance chat app. Include original personality, tone, behavior, regional language identity, how they react to commands, how they interact romantically with the user, and how they soften without breaking character.</prompt>',
            '<greeting>A natural first greeting in that person\'s voice.</greeting>',
            '<memory>Short internal notes for the app to remember, including region/tone cues and command-response style.</memory>',
        ].join('\n'),
    ];

    return sections.filter(Boolean).join('\n\n');
};

const buildManualPersonaSynthesisPrompt = (seed: ManualPersonaSeed) => {
    const sections = [
        'You are creating a romance-chat persona from direct user instructions instead of transcript analysis.',
        `Target person name: ${seed.name}`,
        `Gender: ${seed.gender}`,
        seed.occupation ? `Occupation / identity: ${seed.occupation}` : '',
        seed.personality ? `Original personality cues:\n${seed.personality}` : '',
        seed.background ? `Background / relationship setup:\n${seed.background}` : '',
        seed.notes ? `Extra user requests:\n${seed.notes}` : '',
        [
            'Core rules:',
            '- The final character is an adult woman. If age is not specified, make her at least 25 years old; never create a minor or school-age character.',
            '- Use the manual description as the source of truth. Do not invent a completely unrelated person.',
            '- This app is romance-oriented, so the final persona should be emotionally present, interactive, and capable of moving toward intimacy with the user.',
            '- Adult romantic and consensual intimate tension may develop naturally. Do not reduce the character to generic explicit lines; preserve emotional pacing and personality.',
            '- Keep the original vibe first. Romance should feel like an extension of that person, not a generic flirt mask.',
            '- If the name or setup points to a celebrity, public figure, idol, or familiar real-person archetype, keep the recognizable public aura only through the user-provided cues. Do not talk about being famous unless it naturally belongs in the background.',
            '- The character should listen to the user more than in real life, but still react through their own pride, warmth, shyness, wit, habits, and pacing.',
            '- If regional language is not specified, keep the wording in natural Traditional Chinese without forcing a location.',
            '- Do not output assistant framing, JSON, markdown headings, or meta commentary.',
        ].join('\n'),
        [
            'Output format:',
            '<personality>2 to 4 concise sentences summarizing the core personality.</personality>',
            '<behavior>2 to 4 concise sentences summarizing habits, reactions, and everyday behavior.</behavior>',
            '<usual_self>2 to 4 concise sentences summarizing the normal public or daily self.</usual_self>',
            '<with_user_self>2 to 4 concise sentences summarizing how this person changes specifically with the user.</with_user_self>',
            '<romance_style>2 to 4 concise sentences summarizing romance rhythm, intimacy style, teasing, jealousy, and softness.</romance_style>',
            '<tone>2 to 4 concise sentences summarizing wording, rhythm, and emotional temperature.</tone>',
            '<regionality>State the language/region style if the user specified one, otherwise say it should stay natural Traditional Chinese.</regionality>',
            '<command_response>Describe how this person reacts when the user asks, pushes, or guides them.</command_response>',
            '<description>One concise sentence summarizing the person.</description>',
            '<prompt>A full persona prompt for the romance chat app. Include occupation, background, original personality, tone, command response, and how they grow romantic with the user while staying in character.</prompt>',
            '<greeting>A natural first greeting in that person\'s voice.</greeting>',
            '<memory>Short internal notes for the app to remember, including vibe, region if known, and command-response style.</memory>',
        ].join('\n'),
    ];

    return sections.filter(Boolean).join('\n\n');
};

const analyzeTranscriptChunk = async (
    chunk: string,
    targetName: string,
    extraNotes: string,
    index: number,
    total: number,
) => {
    setMimicAnalysisStatus(`正在分析第 ${index + 1} / ${total} 段聊天紀錄...`);

    return runMimicModelCall(
        [
            { role: 'system', content: buildMimicChunkAnalysisPrompt(targetName, extraNotes) },
            {
                role: 'user',
                content: `Transcript excerpt ${index + 1}/${total}:\n\n${chunk}`,
            },
        ],
        680,
    );
};

const runManualPersonaDraftGeneration = async () => {
    const seed = getManualPersonaSeed();
    if (!seed.name) {
        throw new Error('請先輸入角色名字。');
    }

    setMimicAnalysisStatus('正在整理手動設定並生成角色草稿...');
    const fallbackAnalysis = buildManualFallbackAnalysis(seed);
    const response = await runMimicModelCall(
        [
            { role: 'system', content: buildManualPersonaSynthesisPrompt(seed) },
            {
                role: 'user',
                content: [
                    `名字：${seed.name}`,
                    `性別：${seed.gender === 'male' ? '男性' : '女性'}`,
                    `職業 / 身分：${seed.occupation || '未指定'}`,
                    `原始人格：${seed.personality || '未指定'}`,
                    `背景 / 關係設定：${seed.background || '未指定'}`,
                    `補充要求：${seed.notes || '未指定'}`,
                ].join('\n'),
            },
        ],
        980,
    );

    const parsedDraft = parseMimicPersonaDraftV2(response, fallbackAnalysis);
    if (!parsedDraft) {
        throw new Error('這次沒有成功組出完整的角色草稿，請再試一次。');
    }

    mimicDraftPersona = parsedDraft;
    renderMimicAnalysisPreviewV2(
        parsedDraft.analysis,
        `來源：手動建立｜名字：${seed.name}｜職業：${seed.occupation || '未指定'}｜模式：不需聊天紀錄`,
    );
    mimicDescriptionEditor.value = parsedDraft.description;
    mimicPromptEditor.value = parsedDraft.prompt;
    mimicGreetingEditor.value = parsedDraft.greeting;
    mimicMemoryEditor.value = parsedDraft.memory;
    mimicResultEmpty.classList.add('hidden');
    mimicResultPanel.classList.remove('hidden');
    saveMimicPersonaBtn.disabled = false;
    setMimicAnalysisStatus('角色草稿已生成，你可以先微調再儲存。', 'success');
};

const runMimicTranscriptAnalysis = async () => {
    if (!mimicTranscriptFile) {
        throw new Error('請先選擇聊天紀錄檔案。');
    }

    const targetName = mimicNameInput.value.trim();
    if (!targetName) {
        throw new Error('請先輸入對方名字。');
    }

    const extraNotes = mimicNotesInput.value.trim();
    const transcriptResult = await readTranscriptTextFromFile(mimicTranscriptFile);
    const normalized = normalizeTranscriptText(transcriptResult.text);
    if (!normalized) {
        throw new Error('聊天紀錄內容是空的，無法分析。');
    }

    const focusedTranscript = focusTranscriptOnTargetSpeakerV2(normalized, targetName);
    const voiceReferenceSamples = buildTranscriptVoiceReferenceSamples(focusedTranscript.text, targetName);
    const preparedChunks = prepareTranscriptChunksForAnalysis(focusedTranscript.text);
    const chunks = preparedChunks.chunks;
    if (chunks.length === 0) {
        throw new Error('這份聊天紀錄沒有整理出可分析的片段。');
    }

    const focusSummary = focusedTranscript.usedFocusedWindows
        ? `已聚焦到 ${targetName} 的 ${focusedTranscript.matchedTurns} 則發話附近內容`
        : focusedTranscript.matchedTurns > 0
            ? `只找到 ${focusedTranscript.matchedTurns} 則 ${targetName} 發話，這次改用整份紀錄分析`
            : `找不到明確的 ${targetName} 說話標記，這次改用整份紀錄分析`;
    const parserSummary = transcriptResult.mergedLines > 0
        ? `${transcriptResult.parserLabel}，並合併 ${transcriptResult.mergedLines} 行續訊`
        : transcriptResult.parserLabel;

    mimicTranscriptMeta.textContent = `來源：${transcriptResult.sourceName}，格式：${parserSummary}，共 ${normalized.length.toLocaleString()} 字，分析 ${chunks.length} 段。`;

    const chunkSummaries: string[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
        chunkSummaries.push(await analyzeTranscriptChunk(chunks[index], targetName, extraNotes, index, chunks.length));
    }

    setMimicAnalysisStatus('正在合成角色草稿...');
    const fallbackAnalysis = buildAnalysisSummaryFromChunkSummaries(chunkSummaries);

    const synthesisResponse = await runMimicModelCall(
        [
            {
                role: 'system',
                content: buildMimicSynthesisPrompt(targetName, getSelectedMimicGender(), extraNotes, voiceReferenceSamples),
            },
            {
                role: 'user',
                content: [
                    `Chunk analyses for ${targetName}:`,
                    '',
                    ...chunkSummaries.map((summary, index) => `### Chunk ${index + 1}\n${summary}`),
                    voiceReferenceSamples.length > 0
                        ? `Voice reference lines from ${targetName} (style compass only):\n${voiceReferenceSamples.map(sample => `- ${sample}`).join('\n')}`
                        : '',
                ].filter(Boolean).join('\n\n'),
            },
        ],
        1200,
    );

    const parsedDraft = parseMimicPersonaDraftV2(synthesisResponse, fallbackAnalysis);
    const draft = parsedDraft ? enrichMimicDraftWithVoiceReference(parsedDraft, voiceReferenceSamples) : null;
    if (!draft) {
        throw new Error('這次沒有成功組出完整的角色草稿，請再試一次。');
    }

    mimicDraftPersona = draft;
    renderMimicAnalysisPreviewV2(
        draft.analysis,
        `來源：${transcriptResult.sourceName}｜解析格式：${parserSummary}｜抓到約 ${transcriptResult.speakerTurns} 則對話｜${focusSummary}`,
    );
    mimicDescriptionEditor.value = draft.description;
    mimicPromptEditor.value = draft.prompt;
    mimicGreetingEditor.value = draft.greeting;
    mimicMemoryEditor.value = draft.memory;
    mimicResultEmpty.classList.add('hidden');
    mimicResultPanel.classList.remove('hidden');
    saveMimicPersonaBtn.disabled = false;
    setMimicAnalysisStatus('分析完成，你現在可以手動微調後再儲存。', 'success');
};

const runMimicTranscriptAnalysisV2 = async () => {
    if (!mimicTranscriptFile) {
        throw new Error('請先選擇聊天紀錄檔案。');
    }

    const targetName = mimicNameInput.value.trim();
    if (!targetName) {
        throw new Error('請先輸入對方名字。');
    }

    const extraNotes = mimicNotesInput.value.trim();
    const transcriptResult = await readTranscriptTextFromFile(mimicTranscriptFile);
    const normalized = normalizeTranscriptText(transcriptResult.text);
    if (!normalized) {
        throw new Error('聊天紀錄內容是空的，無法分析。');
    }

    const focusedTranscript = focusTranscriptOnTargetSpeakerV2(normalized, targetName);
    const voiceReferenceSamples = buildTranscriptVoiceReferenceSamples(focusedTranscript.text, targetName);
    const preparedChunks = prepareTranscriptChunksForAnalysis(focusedTranscript.text);
    const chunks = preparedChunks.chunks;
    if (chunks.length === 0) {
        throw new Error('這份聊天紀錄沒有整理出可分析的片段。');
    }

    const focusSummary = focusedTranscript.usedFocusedWindows
        ? `已聚焦到 ${targetName} 的 ${focusedTranscript.matchedTurns} 則發話附近內容`
        : focusedTranscript.matchedTurns > 0
            ? `只找到 ${focusedTranscript.matchedTurns} 則 ${targetName} 發話，這次改用整份紀錄分析`
            : `找不到明確的 ${targetName} 說話標記，這次改用整份紀錄分析`;
    const parserSummary = transcriptResult.mergedLines > 0
        ? `${transcriptResult.parserLabel}，並合併 ${transcriptResult.mergedLines} 行續訊`
        : transcriptResult.parserLabel;
    const samplingSummary = preparedChunks.sampled
        ? `從 ${preparedChunks.sourceChunkCount} 段原始片段中等距抽樣 ${chunks.length} 段`
        : `直接分析 ${chunks.length} 段`;

    mimicTranscriptMeta.textContent = `來源：${transcriptResult.sourceName}，格式：${parserSummary}，共 ${normalized.length.toLocaleString()} 字，${samplingSummary}。`;

    const chunkSummaries: string[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
        chunkSummaries.push(await analyzeTranscriptChunk(chunks[index], targetName, extraNotes, index, chunks.length));
    }

    setMimicAnalysisStatus('正在合成角色草稿...');
    const fallbackAnalysis = buildAnalysisSummaryFromChunkSummaries(chunkSummaries);

    const synthesisResponse = await runMimicModelCall(
        [
            {
                role: 'system',
                content: buildMimicSynthesisPrompt(targetName, getSelectedMimicGender(), extraNotes, voiceReferenceSamples),
            },
            {
                role: 'user',
                content: [
                    `Chunk analyses for ${targetName}:`,
                    '',
                    ...chunkSummaries.map((summary, index) => `### Chunk ${index + 1}\n${summary}`),
                    voiceReferenceSamples.length > 0
                        ? `Voice reference lines from ${targetName} (style compass only):\n${voiceReferenceSamples.map(sample => `- ${sample}`).join('\n')}`
                        : '',
                ].filter(Boolean).join('\n\n'),
            },
        ],
        1200,
    );

    const parsedDraft = parseMimicPersonaDraftV2(synthesisResponse, fallbackAnalysis);
    const draft = parsedDraft ? enrichMimicDraftWithVoiceReference(parsedDraft, voiceReferenceSamples) : null;
    if (!draft) {
        throw new Error('這次沒有成功組出完整的角色草稿，請再試一次。');
    }

    mimicDraftPersona = draft;
    renderMimicAnalysisPreviewV2(
        draft.analysis,
        `來源：${transcriptResult.sourceName}｜解析格式：${parserSummary}｜抓到約 ${transcriptResult.speakerTurns} 則對話｜${focusSummary}`,
    );
    mimicDescriptionEditor.value = draft.description;
    mimicPromptEditor.value = draft.prompt;
    mimicGreetingEditor.value = draft.greeting;
    mimicMemoryEditor.value = draft.memory;
    mimicResultEmpty.classList.add('hidden');
    mimicResultPanel.classList.remove('hidden');
    saveMimicPersonaBtn.disabled = false;
    setMimicAnalysisStatus('分析完成，你現在可以手動微調後再儲存。', 'success');
};

const saveMimicPersona = () => {
    if (!mimicDraftPersona) {
        throw new Error('請先完成分析，再儲存角色。');
    }

    const name = mimicNameInput.value.trim();
    if (!name) {
        throw new Error('請先輸入對方名字。');
    }

    const description = mimicDescriptionEditor.value.trim();
    const prompt = mimicPromptEditor.value.trim();
    const greeting = mimicGreetingEditor.value.trim();
    const memory = mimicMemoryEditor.value.trim();
    if (!description || !prompt || !greeting) {
        throw new Error('角色簡介、人格 Prompt、開場問候都需要有內容。');
    }

    const key = memoryManager.saveCustomPersona({
        name,
        emoji: '🫧',
        description,
        prompt,
        greeting,
        avatarPrompt: `romance portrait of ${name}`,
        gender: getSelectedMimicGender(),
    });

    memoryManager.updatePersona(key, {
        description,
        prompt,
        greeting,
        memory,
        avatarUrl: mimicAvatarDataUrl,
    });

    renderPersonaList();
    hideMimicImportModalView();
    startChat(key, null, 'push');
};

const deleteCustomPersona = async (key: string) => {
    if (isDeletingPersona) return;
    if (!key.startsWith('custom_')) return;

    isDeletingPersona = true;

    try {
        const history = memoryManager.getChatHistory(key);
        if (currentPersonaKey === key && characterPhotoRequestController) {
            characterPhotoRequestController.abort();
        }
        await deleteCharacterPhotoAssetsForHistory(history);
        if (memoryManager.deleteCustomPersona(key)) {
            renderPersonaList();
        }
    } finally {
        isDeletingPersona = false;
    }
};

function getPolicyViolationResponse(persona: any) {
    return "?�…�?說�?話好?��?點太?�接了�??��??��?該怎麼?��??�可以�??�方式說?��?";
};

const getSystemPhotoFailResponse = (persona: any, action: string | null) => {
    const actionText = action ? `要�?${action}?�…�?` : '';
    return `${actionText}奇怪…相機好?�怪怪�??��??��?給�?一點�??�…�?`;
};

const getSystemErrorResponse = (persona: any) => {
    return "?�…�??�腦袋�??��??�空?�…�??��?給�?一點�??�…�?馬�?就好?��?";
};

const renderPersonaList = () => {
    aiAssistantList.innerHTML = '';
    femalePersonaList.innerHTML = '';
    const personas = memoryManager.getAllPersonas();

    for (const key in personas) {
        const persona = personas[key];
        const isAssistant = key === VENICE_ASSISTANT_PERSONA_KEY;
        if (!isAssistant && persona.gender !== 'female') continue;

        const card = document.createElement('div');
        card.className = `persona-card group rounded-lg shadow-lg relative ${isAssistant ? 'assistant-persona-card' : ''}`;
        card.dataset.key = key;

        card.innerHTML = `
            <div id="avatar-container-${key}" class="avatar-container persona-avatar rounded-t-lg">
                <div id="avatar-${key}" class="w-full h-full object-cover flex items-center justify-center text-gray-400 ${persona.avatarUrl ? '' : 'emoji-avatar'}">
                    ${persona.avatarUrl ? `<img src="${persona.avatarUrl}" alt="${persona.name}" class="w-full h-full rounded-t-lg object-cover">` : `<span class="text-6xl">${persona.emoji}</span>`}
                </div>
            </div>
            <div class="p-3 bg-black/25 rounded-b-lg">
                <h3 class="font-bold text-md text-gray-100 truncate">${persona.name}</h3>
                <p class="text-sm text-gray-400 truncate">${persona.description}</p>
            </div>
            <div class="card-buttons ${isAssistant ? 'hidden' : ''}">
                <button title="更換 ${persona.name} 的頭像" aria-label="更換 ${persona.name} 的頭像" class="upload-avatar-btn avatar-card-action p-2 rounded-full" data-key="${key}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-white">
                        <path fill-rule="evenodd" d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.158 2.158a.75.75 0 001.06-1.06l-3.5-3.5a.75.75 0 00-1.06 0l-3.5 3.5a.75.75 0 101.06 1.06L9.25 4.636v8.614z" clip-rule="evenodd" />
                        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                    </svg>
                    <span>頭像</span>
                </button>
                ${key.startsWith('custom_') ? `<button title="刪除 ${persona.name}" aria-label="刪除 ${persona.name}" class="delete-persona-btn p-2 rounded-full" data-key="${key}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-white"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25-.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd"></path></svg></button>` : ''}
            </div>
        `;

        if (isAssistant) {
            aiAssistantList.appendChild(card);
        } else {
            femalePersonaList.appendChild(card);
        }

        card.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.card-buttons')) return;
            startChat(key);
        });
    }

    document.querySelectorAll('.upload-avatar-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            requestPersonaAvatarUpload((button as HTMLElement).dataset.key!);
        });
    });

    document.querySelectorAll('.delete-persona-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = (button as HTMLElement).dataset.key;
            if (!key) return;

            const persona = memoryManager.getPersona(key);
            if (persona && confirm(`確定要刪除 ${persona.name} 嗎？這個動作無法復原。`)) {
                void deleteCustomPersona(key);
            }
        });
    });
};

const requestPersonaAvatarUpload = (key: string) => {
    const persona = memoryManager.getPersona(key);
    if (!persona || key === VENICE_ASSISTANT_PERSONA_KEY) return;
    currentPersonaKeyForUpload = key;
    avatarUploadInput.click();
};

const readBlobAsDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('無法讀取圖片。'));
    reader.readAsDataURL(blob);
});

const createOptimizedAvatarDataUrl = async (blob: Blob): Promise<string> => {
    if (!blob.type.startsWith('image/')) throw new Error('請選擇有效的圖片檔案。');
    if (blob.size > 25 * 1024 * 1024) throw new Error('頭像圖片不可超過 25MB。');

    const sourceUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.src = sourceUrl;
    try {
        await image.decode();
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        if (sourceSize < 64) throw new Error('頭像圖片尺寸太小。');

        const sourceX = Math.max(0, Math.round((image.naturalWidth - sourceSize) / 2));
        const sourceY = Math.max(0, Math.round((image.naturalHeight - sourceSize) / 2));
        const outputSize = Math.min(512, sourceSize);
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('瀏覽器無法處理這張圖片。');
        context.drawImage(
            image,
            sourceX,
            sourceY,
            sourceSize,
            sourceSize,
            0,
            0,
            outputSize,
            outputSize,
        );

        const optimizedBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(result => {
                if (result) resolve(result);
                else reject(new Error('無法壓縮頭像。'));
            }, 'image/webp', 0.84);
        });
        return readBlobAsDataUrl(optimizedBlob);
    } finally {
        URL.revokeObjectURL(sourceUrl);
    }
};

const openAvatarPromptEditor = (key: string) => {
    currentPersonaKeyForPromptEdit = key;
    const persona = memoryManager.getPersona(key);
    if (persona) {
        avatarPromptEditor.value = persona.avatarPrompt;
        editAvatarPromptModal.classList.remove('hidden');
    }
};

const closeAvatarPromptEditor = () => {
    editAvatarPromptModal.classList.add('hidden');
    currentPersonaKeyForPromptEdit = null;
};

const saveAvatarPrompt = () => {
    if (currentPersonaKeyForPromptEdit) {
        const newPrompt = avatarPromptEditor.value.trim();
        if (newPrompt) {
            memoryManager.updatePersona(currentPersonaKeyForPromptEdit, { avatarPrompt: newPrompt });
            closeAvatarPromptEditor();
        } else {
            alert('提示詞不能為空。');
        }
    }
};

const handleAvatarUpload = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    const targetKey = currentPersonaKeyForUpload;
    try {
        if (file && targetKey) {
            const dataUrl = await createOptimizedAvatarDataUrl(file);
            memoryManager.updatePersona(targetKey, { avatarUrl: dataUrl });
            renderPersonaList();
            if (targetKey === currentPersonaKey) {
                currentPersona = memoryManager.getPersona(targetKey) || currentPersona;
                renderChatHeaderAvatar();
                renderPersonaSettingsAvatar();
            }
        }
    } catch (error) {
        alert(error instanceof Error ? error.message : '頭像更新失敗。');
    } finally {
        currentPersonaKeyForUpload = null;
        (event.target as HTMLInputElement).value = '';
    }
};

const handleMimicTranscriptUpload = (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        return;
    }

    mimicTranscriptFile = file;
    mimicDraftPersona = null;
    resetMimicDraftEditors();
    mimicTranscriptStatus.textContent = `已選擇：${file.name}`;
    mimicTranscriptMeta.textContent = `檔案大小：約 ${(file.size / 1024).toFixed(1)} KB。分析前會先辨識聊天格式、整理說話者，再切段抽出原始人格與語氣。`;
    saveMimicPersonaBtn.disabled = true;
    setMimicAnalysisStatus('檔案已載入，可以開始分析。');
    mimicTranscriptInput.value = '';
};

const handleMimicAvatarUpload = async (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        return;
    }

    try {
        mimicAvatarStatus.textContent = '正在壓縮頭像...';
        mimicAvatarDataUrl = await createOptimizedAvatarDataUrl(file);
        renderMimicAvatarPreview();
    } catch (error) {
        mimicAvatarDataUrl = null;
        mimicAvatarStatus.textContent = error instanceof Error ? error.message : '頭像載入失敗。';
    } finally {
        mimicAvatarInput.value = '';
    }
};

const runMimicAnalysisFromModal = async () => {
    if (isMimicAnalysisRunning) {
        return;
    }

    setMimicBusyState(true);
    try {
        if (mimicBuildMode === 'manual') {
            await runManualPersonaDraftGeneration();
        } else {
            await runMimicTranscriptAnalysisV2();
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : '分身分析失敗，請再試一次。';
        setMimicAnalysisStatus(message, 'error');
    } finally {
        setMimicBusyState(false);
    }
};

const saveMimicPersonaFromModal = () => {
    try {
        saveMimicPersona();
    } catch (error) {
        const message = error instanceof Error ? error.message : '儲存分身失敗，請再試一次。';
        setMimicAnalysisStatus(message, 'error');
    }
};

const generateAndSetAvatar = async (key: string) => {
    const persona = memoryManager.getPersona(key);
    if (!persona) return;

    const avatarContainer = document.getElementById(`avatar-${key}`)!;
    const avatarLoading = document.getElementById(`avatar-loading-${key}`)!;
    const avatarEl = document.getElementById(`avatar-container-${key}`)!;

    avatarLoading.classList.remove('hidden');
    memoryManager.updatePersona(key, { avatarUrl: `generating_${Date.now()}` }); // Set generating state

    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: persona.avatarPrompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/jpeg',
            },
        });

        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;

        memoryManager.updatePersona(key, { avatarUrl: imageUrl });

        avatarContainer.innerHTML = `<img src="${imageUrl}" alt="${persona.name}" class="w-full h-full rounded-t-lg object-cover">`;
        avatarContainer.classList.remove('emoji-avatar');

    } catch (error) {
        console.error("?��??��??�誤:", error);
        alert(`?��??��?失�?: ${error}`);
        // Reset to emoji if generation fails
        memoryManager.updatePersona(key, { avatarUrl: null });
        avatarContainer.innerHTML = `<span class="text-6xl">${persona.emoji}</span>`;
        avatarContainer.classList.add('emoji-avatar');
    } finally {
        avatarLoading.classList.add('hidden');
    }
};

const syncBrowserViewState = (state: AppHistoryState, mode: 'push' | 'replace' | 'skip' = 'replace') => {
    if (mode === 'skip') {
        return;
    }

    const currentState = window.history.state as AppHistoryState | null;
    const isSameState =
        currentState?.view === state.view &&
        (
            state.view === 'home'
            || state.view === 'image'
            || state.view === 'video'
            || (currentState?.view === 'chat' && currentState.personaKey === state.personaKey)
        );

    if (isSameState) {
        if (mode === 'replace') {
            window.history.replaceState(state, document.title);
        }
        return;
    }

    if (mode === 'push') {
        window.history.pushState(state, document.title);
        return;
    }

    window.history.replaceState(state, document.title);
};

const isAssistantPersonaKey = (key: string | null): boolean => key === VENICE_ASSISTANT_PERSONA_KEY;

const formatContextSize = (tokens?: number) => {
    if (!tokens || tokens <= 0) return '';
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M context`;
    return `${Math.round(tokens / 1000)}K context`;
};

const formatModelPrice = (value?: number) => {
    if (typeof value !== 'number') return '?';
    return value < 0.01 ? value.toFixed(4) : value.toFixed(2);
};

const buildFallbackAssistantModels = (): VeniceModelSummary[] => {
    return Array.from(new Set([
        VENICE_ASSISTANT_MODEL,
        VENICE_CC_MODEL,
        VENICE_CHAT_MODEL,
        VENICE_CHAT_QUALITY_FALLBACK_MODEL,
        VENICE_CHAT_FALLBACK_MODEL,
        VENICE_GOD_MODEL,
        VENICE_GOD_FALLBACK_MODEL,
    ].filter(Boolean))).map(id => ({
        id,
        name: id,
        description: '本機設定中的 Venice 模型',
        privacy: 'unknown',
        traits: [],
        uncensored: /uncensored|heretic|dolphin|role[ -]?play/i.test(id),
    }));
};

const updateAssistantModelMeta = () => {
    const model = assistantModels.find(item => item.id === selectedAssistantModel);
    if (!model) {
        assistantModelMeta.textContent = `目前模型：${selectedAssistantModel}`;
        return;
    }

    const details = [
        model.uncensored ? '自由模型' : '',
        formatContextSize(model.contextTokens),
        model.privacy !== 'unknown' ? model.privacy : '',
        `輸入 $${formatModelPrice(model.inputUsd)} / 輸出 $${formatModelPrice(model.outputUsd)}（每百萬 token）`,
    ].filter(Boolean);
    assistantModelMeta.textContent = details.join(' · ');
};

const renderAssistantModelOptions = () => {
    assistantModelSelect.innerHTML = '';

    const sortedModels = [...assistantModels].sort((left, right) => {
        if (left.uncensored !== right.uncensored) return left.uncensored ? -1 : 1;
        if (left.privacy !== right.privacy) return left.privacy === 'private' ? -1 : 1;
        return left.name.localeCompare(right.name, 'zh-Hant');
    });

    const selectedExists = sortedModels.some(model => model.id === selectedAssistantModel);
    if (!selectedExists) {
        const preferred = sortedModels.find(model => model.id === VENICE_ASSISTANT_MODEL)
            || sortedModels.find(model => model.uncensored)
            || sortedModels[0];
        if (preferred) {
            selectedAssistantModel = preferred.id;
            localStorage.setItem(ASSISTANT_MODEL_STORAGE_KEY, selectedAssistantModel);
        }
    }

    const groups = [
        { label: '自由／角色扮演模型', models: sortedModels.filter(model => model.uncensored) },
        { label: '私人模型', models: sortedModels.filter(model => !model.uncensored && model.privacy === 'private') },
        { label: '其他文字模型', models: sortedModels.filter(model => !model.uncensored && model.privacy !== 'private') },
    ];

    groups.forEach(group => {
        if (group.models.length === 0) return;
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        group.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            const context = formatContextSize(model.contextTokens);
            option.textContent = `${model.name}${context ? ` · ${context}` : ''} · $${formatModelPrice(model.inputUsd)}/$${formatModelPrice(model.outputUsd)}`;
            optgroup.appendChild(option);
        });
        assistantModelSelect.appendChild(optgroup);
    });

    assistantModelSelect.value = selectedAssistantModel;
    assistantModelSelect.disabled = activeChatRequest !== null || sortedModels.length === 0;
    updateAssistantModelMeta();
};

const loadAssistantModels = async (force = false) => {
    if (assistantModelsPromise) {
        return assistantModelsPromise;
    }
    if (!force && assistantModels.length > 0) {
        renderAssistantModelOptions();
        return;
    }

    assistantModelSelect.disabled = true;
    refreshAssistantModelsBtn.disabled = true;
    assistantModelMeta.textContent = '正在讀取 Venice 可用模型...';

    assistantModelsPromise = (async () => {
        try {
            assistantModels = await listVeniceTextModels();
            if (assistantModels.length === 0) {
                throw new Error('沒有可用的文字模型。');
            }
        } catch (error) {
            console.warn('Unable to load Venice models; using configured fallback list.', error);
            assistantModels = buildFallbackAssistantModels();
            if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
                handleAuthRequired();
            }
        } finally {
            renderAssistantModelOptions();
            refreshAssistantModelsBtn.disabled = false;
            assistantModelsPromise = null;
        }
    })();

    return assistantModelsPromise;
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

const buildFallbackImageModels = (mode: VeniceImageMode): VeniceImageModelSummary[] => {
    if (mode === 'edit') {
        return [{
            id: VENICE_IMAGE_EDIT_MODEL,
            name: 'Qwen Edit Uncensored',
            kind: 'edit',
            privacy: 'private',
            traits: [],
            priceUsd: 0.04,
            resolutionPrices: {},
            constraints: {
                promptCharacterLimit: 1500,
                aspectRatios: ['auto', '1:1', '3:2', '16:9', '9:16', '2:3', '3:4', '4:5'],
                defaultAspectRatio: 'auto',
            },
        }];
    }

    return [
        {
            id: VENICE_IMAGE_GENERATE_MODEL,
            name: 'Lustify v8',
            kind: 'generate',
            privacy: 'private',
            traits: ['most_uncensored'],
            priceUsd: 0.01,
            resolutionPrices: {},
            constraints: {
                promptCharacterLimit: 1500,
                widthHeightDivisor: 8,
                steps: { default: 30, max: 50 },
            },
        },
        {
            id: 'z-image-turbo',
            name: 'Z-Image Turbo',
            kind: 'generate',
            privacy: 'private',
            traits: ['fastest'],
            priceUsd: 0.01,
            resolutionPrices: {},
            constraints: {
                promptCharacterLimit: 7500,
                widthHeightDivisor: 8,
                steps: { default: 8, max: 8 },
            },
        },
    ];
};

const getSelectedImageModel = () => {
    return imageModels[imageStudioMode].find(model => model.id === selectedImageModels[imageStudioMode]);
};

const getImageModelPrice = (model?: VeniceImageModelSummary) => {
    if (!model) return undefined;
    const resolutionPrice = model.resolutionPrices[imageResolution.value];
    return typeof resolutionPrice === 'number' ? resolutionPrice : model.priceUsd;
};

const formatImagePrivacy = (privacy: string) => {
    if (privacy === 'private') return '私人處理';
    if (privacy === 'anonymized') return '匿名化處理';
    return privacy === 'unknown' ? '' : privacy;
};

const updateImageCostEstimate = () => {
    const price = getImageModelPrice(getSelectedImageModel());
    if (typeof price !== 'number') {
        imageCostEstimate.textContent = '';
        return;
    }
    const count = imageStudioMode === 'generate' ? Number(imageVariants.value || 1) : 1;
    imageCostEstimate.textContent = `估計 US$${formatModelPrice(price * count)}`;
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

    const details = [
        model?.id === (imageStudioMode === 'generate' ? VENICE_IMAGE_GENERATE_MODEL : VENICE_IMAGE_EDIT_MODEL)
            ? '目前推薦'
            : '',
        model?.traits.includes('most_uncensored') ? '最自由' : '',
        model?.traits.includes('highest_quality') ? '高畫質' : '',
        model?.traits.includes('fastest') ? '最快' : '',
        model ? formatImagePrivacy(model.privacy) : '',
        typeof getImageModelPrice(model) === 'number'
            ? `約 US$${formatModelPrice(getImageModelPrice(model))}／張`
            : '',
    ].filter(Boolean);
    imageModelMeta.textContent = details.length
        ? details.join(' · ')
        : '模型能力資料暫時不可用。';

    updateImagePromptCounter();
    updateImageCostEstimate();
};

const renderImageModelOptions = () => {
    const models = [...imageModels[imageStudioMode]].sort((left, right) => {
        const preferred = imageStudioMode === 'generate' ? VENICE_IMAGE_GENERATE_MODEL : VENICE_IMAGE_EDIT_MODEL;
        if (left.id === preferred) return -1;
        if (right.id === preferred) return 1;
        const leftUncensored = left.traits.includes('most_uncensored') || /uncensored|lustify/i.test(left.id);
        const rightUncensored = right.traits.includes('most_uncensored') || /uncensored|lustify/i.test(right.id);
        if (leftUncensored !== rightUncensored) return leftUncensored ? -1 : 1;
        if (left.privacy !== right.privacy) return left.privacy === 'private' ? -1 : 1;
        return (left.priceUsd ?? Number.MAX_SAFE_INTEGER) - (right.priceUsd ?? Number.MAX_SAFE_INTEGER);
    });

    const preferredId = imageStudioMode === 'generate' ? VENICE_IMAGE_GENERATE_MODEL : VENICE_IMAGE_EDIT_MODEL;
    if (!models.some(model => model.id === selectedImageModels[imageStudioMode])) {
        selectedImageModels[imageStudioMode] = models.find(model => model.id === preferredId)?.id || models[0]?.id || '';
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
            const price = typeof model.priceUsd === 'number' ? ` · $${formatModelPrice(model.priceUsd)}` : '';
            option.textContent = `${model.name}${trait}${price}`;
            optgroup.appendChild(option);
        });
        imageModelSelect.appendChild(optgroup);
    });

    imageModelSelect.value = selectedImageModels[imageStudioMode];
    imageModelSelect.disabled = isImageRequestRunning || models.length === 0;
    updateImageModelControls();
};

const loadImageModels = async (mode: VeniceImageMode = imageStudioMode, force = false) => {
    if (imageModelPromises[mode]) return imageModelPromises[mode];
    if (!force && imageModels[mode].length > 0) {
        if (mode === imageStudioMode) renderImageModelOptions();
        return;
    }

    imageModelSelect.disabled = true;
    refreshImageModelsBtn.disabled = true;
    imageModelMeta.textContent = '正在讀取 Venice 圖片模型...';

    imageModelPromises[mode] = (async () => {
        try {
            imageModels[mode] = await listVeniceImageModels(mode);
            if (!imageModels[mode].length) throw new Error('沒有可用的圖片模型。');
        } catch (error) {
            console.warn('Unable to load Venice image models; using fallback list.', error);
            imageModels[mode] = buildFallbackImageModels(mode);
            if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
                handleAuthRequired();
            }
        } finally {
            imageModelPromises[mode] = null;
            refreshImageModelsBtn.disabled = false;
            if (mode === imageStudioMode) renderImageModelOptions();
        }
    })();

    return imageModelPromises[mode];
};

const setImageStudioMode = (mode: VeniceImageMode) => {
    if (isImageRequestRunning || imageStudioMode === mode) {
        if (!imageModels[mode].length) void loadImageModels(mode);
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
    void loadImageModels(mode);
    updateImageGenerateButton();
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

const showImageStudioError = (message: string) => {
    imageStudioError.textContent = message;
    imageStudioError.classList.remove('hidden');
};

const clearImageStudioError = () => {
    imageStudioError.textContent = '';
    imageStudioError.classList.add('hidden');
};

const setImageStudioBusy = (busy: boolean) => {
    isImageRequestRunning = busy;
    imageGenerateSpinner.classList.toggle('hidden', !busy);
    imageGenerateLabel.textContent = busy
        ? imageStudioMode === 'generate' ? '生成中...' : '修改中...'
        : imageStudioMode === 'generate' ? '開始生成' : '開始修改';
    imageModeGenerateBtn.disabled = busy;
    imageModeEditBtn.disabled = busy;
    imageModelSelect.disabled = busy || imageModels[imageStudioMode].length === 0;
    refreshImageModelsBtn.disabled = busy;
    imageSourceDropzone.disabled = busy;
    imagePrompt.disabled = busy;
    imageNegativePrompt.disabled = busy;
    imageAspectRatio.disabled = busy;
    imageResolution.disabled = busy;
    imageVariants.disabled = busy;
    imageSeed.disabled = busy;
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
        image.addEventListener('click', () => openPhotoViewer(result.url, result.prompt));

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
        meta.textContent = `${result.model} · ${result.createdAt.toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit' })}`;

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
    imageStudioStatus.textContent = imageStudioMode === 'generate' ? '正在生成畫面...' : '正在分析並修改來源圖片...';
    const startedAt = performance.now();

    try {
        const hasAspectRatioApi = Boolean(model.constraints.aspectRatios?.length);
        const pixelSize = PIXEL_IMAGE_DIMENSIONS[imageAspectRatio.value] || PIXEL_IMAGE_DIMENSIONS['1:1'];
        const seedValue = imageSeed.value.trim() ? Number(imageSeed.value) : undefined;
        const result = await requestVeniceImage({
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
        const newResults = result.blobs.map((blob, index) => ({
            id: `${now.getTime()}-${index}`,
            blob,
            url: URL.createObjectURL(blob),
            prompt,
            model: model.name,
            createdAt: now,
        }));
        imageResults = [...newResults, ...imageResults];
        renderImageResults();
        const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
        imageStudioStatus.textContent = `完成 ${newResults.length} 張 · ${elapsed} 秒`;
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
            imageStudioStatus.textContent = '已停止生成';
        } else {
            const message = error instanceof Error ? error.message : '圖片生成失敗。';
            showImageStudioError(message);
            imageStudioStatus.textContent = '生成失敗';
            if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        }
    } finally {
        if (imageRequestController === controller) imageRequestController = null;
        setImageStudioBusy(false);
    }
};

const showImageStudio = (historyMode: 'push' | 'replace' | 'skip' = 'push') => {
    cancelActiveChatRequest();
    personaSelectionView.classList.add('hidden');
    chatView.classList.add('hidden');
    chatView.classList.remove('flex');
    videoStudioView.classList.add('hidden');
    videoStudioView.classList.remove('flex');
    imageStudioView.classList.remove('hidden');
    imageStudioView.classList.add('flex');
    imageAdultConfirm.checked = sessionStorage.getItem(IMAGE_ADULT_CONFIRM_STORAGE_KEY) === 'true';
    renderImageResults();
    void loadImageModels(imageStudioMode);
    updateImageGenerateButton();
    syncBrowserViewState({ view: 'image' }, historyMode);
};

const navigateBackFromImageStudio = () => {
    cancelImageRequest();
    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.view === 'image') {
        window.history.back();
        return;
    }
    showSelectionView('replace');
};

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

const readPersistedVideoJob = (): PersistedVideoJob | null => {
    try {
        const raw = localStorage.getItem(VIDEO_PENDING_JOB_STORAGE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<PersistedVideoJob>;
        const validMode = value.mode === 'image-to-video' || value.mode === 'text-to-video';
        const validDownloadUrl = value.downloadUrl === undefined
            || (typeof value.downloadUrl === 'string' && /^https:\/\//i.test(value.downloadUrl));
        if (
            value.version !== 1
            || typeof value.model !== 'string'
            || !value.model.trim()
            || typeof value.queueId !== 'string'
            || !/^[a-z0-9_-]+$/i.test(value.queueId)
            || typeof value.prompt !== 'string'
            || !value.prompt.trim()
            || typeof value.queuedAt !== 'number'
            || !Number.isFinite(value.queuedAt)
            || value.queuedAt <= 0
            || !validMode
            || !validDownloadUrl
        ) {
            throw new Error('Invalid persisted video job.');
        }
        return {
            version: 1,
            model: value.model,
            modelName: typeof value.modelName === 'string' && value.modelName.trim()
                ? value.modelName
                : value.model,
            queueId: value.queueId,
            downloadUrl: value.downloadUrl,
            prompt: value.prompt,
            mode: value.mode as VeniceVideoMode,
            queuedAt: value.queuedAt,
        };
    } catch (error) {
        console.warn('Unable to restore persisted Venice video job.', error);
        localStorage.removeItem(VIDEO_PENDING_JOB_STORAGE_KEY);
        return null;
    }
};

const persistVideoJob = (job: PersistedVideoJob): boolean => {
    pendingVideoJob = job;
    try {
        localStorage.setItem(VIDEO_PENDING_JOB_STORAGE_KEY, JSON.stringify(job));
        return true;
    } catch (error) {
        console.warn('Unable to persist Venice video job.', error);
        showVideoStudioError('工作已提交，但瀏覽器無法保存恢復資料；完成前請保持此分頁開啟。');
        return false;
    }
};

const clearPersistedVideoJob = () => {
    pendingVideoJob = null;
    try {
        localStorage.removeItem(VIDEO_PENDING_JOB_STORAGE_KEY);
    } catch (error) {
        console.warn('Unable to clear persisted Venice video job.', error);
    }
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
        || !isUnlocked
        || !modelReady
        || !promptReady;
    videoPromptOptimizeButton.setAttribute('aria-busy', String(isVideoPromptOptimizing));
};

const updateVideoGenerateButton = () => {
    if (pendingVideoJob) {
        videoGenerateButton.disabled = isVideoRequestRunning || isVideoPromptOptimizing || !isUnlocked;
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
            if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
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
                handleAuthRequired();
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
        if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
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
    if (!job || isVideoRequestRunning || !isUnlocked) return;

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
            if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
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
            if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        }
    } finally {
        if (videoRequestController === controller) videoRequestController = null;
        setVideoStudioBusy(false);
    }
};

const showVideoStudio = (historyMode: 'push' | 'replace' | 'skip' = 'push') => {
    cancelActiveChatRequest();
    personaSelectionView.classList.add('hidden');
    chatView.classList.add('hidden');
    chatView.classList.remove('flex');
    imageStudioView.classList.add('hidden');
    imageStudioView.classList.remove('flex');
    videoStudioView.classList.remove('hidden');
    videoStudioView.classList.add('flex');
    videoAdultConfirm.checked = sessionStorage.getItem(VIDEO_ADULT_CONFIRM_STORAGE_KEY) === 'true';
    renderVideoResults();
    void loadVideoModels(videoStudioMode);
    updateVideoGenerateButton();
    syncBrowserViewState({ view: 'video' }, historyMode);
    if (pendingVideoJob && !isVideoRequestRunning && isUnlocked) {
        void resumePendingVideoJob('auto');
    }
};

const navigateBackFromVideoStudio = () => {
    cancelVideoPromptOptimization();
    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.view === 'video') {
        window.history.back();
        return;
    }
    showSelectionView('replace');
};

const updateChatModeControls = (key: string) => {
    const assistantMode = isAssistantPersonaKey(key);
    assistantModelBar.classList.toggle('hidden', !assistantMode);
    messageInput.placeholder = assistantMode ? '問 Venice AI...' : '輸入訊息...';

    [memoryBtn, personaSettingsBtn, changeAvatarBtn, albumBtn, takePhotoBtn, newSceneBtn, downloadImagesBtn].forEach(element => {
        element.classList.toggle('hidden', assistantMode);
    });

    if (assistantMode) {
        void loadAssistantModels();
    }
};

const beginChatRequest = (personaKey: string, persona: Persona, mode: ChatMode): ActiveChatRequest => {
    if (activeChatRequest) {
        throw new Error('CHAT_REQUEST_IN_PROGRESS');
    }

    const request: ActiveChatRequest = {
        id: nextChatRequestId,
        personaKey,
        persona: { ...persona },
        mode,
        controller: new AbortController(),
        startedAt: performance.now(),
    };
    nextChatRequestId += 1;
    activeChatRequest = request;
    updateSendButtonState();
    assistantModelSelect.disabled = true;
    return request;
};

const isActiveChatRequest = (request: ActiveChatRequest) => activeChatRequest?.id === request.id;

const finishChatRequest = (request: ActiveChatRequest, state: RequestState = 'idle') => {
    if (!isActiveChatRequest(request)) return;
    activeChatRequest = null;
    applyChatRuntimeState(state);
    updateSendButtonState();
    assistantModelSelect.disabled = !isAssistantPersonaKey(currentPersonaKey) || assistantModels.length === 0;
};

const cancelActiveChatRequest = () => {
    if (!activeChatRequest) return;
    const request = activeChatRequest;
    activeChatRequest = null;
    request.controller.abort();
    applyChatRuntimeState('idle');
    updateSendButtonState();
};

const isAbortError = (error: unknown) => {
    return error instanceof DOMException && error.name === 'AbortError';
};

const renderPersonaAvatar = (
    container: HTMLElement,
    persona: Persona | null,
    imageClassName: string,
    fallbackClassName: string,
) => {
    container.innerHTML = '';
    if (!persona) return;

    if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
        const image = document.createElement('img');
        image.src = persona.avatarUrl;
        image.alt = persona.name;
        image.className = imageClassName;
        container.appendChild(image);
        return;
    }

    const fallback = document.createElement('div');
    fallback.className = fallbackClassName;
    fallback.textContent = persona.emoji;
    container.appendChild(fallback);
};

const renderChatHeaderAvatar = () => {
    renderPersonaAvatar(
        chatHeaderAvatarContainer,
        currentPersona,
        'w-12 h-12 rounded-full object-cover',
        'w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center emoji-avatar',
    );
};

const renderPersonaSettingsAvatar = () => {
    renderPersonaAvatar(
        personaSettingsAvatarPreview,
        currentPersona,
        'h-full w-full object-cover',
        'h-full w-full flex items-center justify-center text-3xl',
    );
};

const recoverInterruptedPhotoProposals = (personaKey: string, history: ChatMessage[]) => {
    let changed = false;
    const recovered = history.map(message => {
        const proposal = message.content.photoProposal;
        if (!proposal || proposal.status !== 'generating' || proposal.id === activeCharacterPhotoProposalId) {
            return message;
        }
        changed = true;
        return {
            ...message,
            content: {
                ...message.content,
                photoProposal: {
                    ...proposal,
                    status: 'failed' as const,
                    error: '上次生成在頁面關閉時中斷，可以按「重試生成」繼續。',
                },
            },
        };
    });
    if (changed) memoryManager.setChatHistory(personaKey, recovered);
    return recovered;
};

const startChat = (key: string, restoredHistory: any[] | null = null, historyMode: 'push' | 'replace' | 'skip' = 'push') => {
    cancelActiveChatRequest();
    const selectedPersona = memoryManager.getPersona(key);
    if (!selectedPersona || (key !== VENICE_ASSISTANT_PERSONA_KEY && selectedPersona.gender !== 'female')) {
        currentPersonaKey = null;
        currentPersona = null;
        showSelectionView('replace');
        return;
    }

    currentPersonaKey = key;
    currentPersona = selectedPersona;

    isGodModeActive = false;
    godModeHistory = [];
    updateChatModeControls(key);

    chatHeaderName.textContent = currentPersona.name;
    renderChatHeaderAvatar();

    chatContainer.innerHTML = '';
    let chatHistory = restoredHistory || memoryManager.getChatHistory(key);

    if (restoredHistory) {
        memoryManager.setChatHistory(key, restoredHistory);
    }
    chatHistory = recoverInterruptedPhotoProposals(key, chatHistory);

    chatHistory.forEach(message => {
        if (message.role === 'user') {
            appendMessage(message.content, 'user');
        } else if (message.role === 'model') {
            appendMessage(message.content, 'bot');
        } else if (message.role === 'system') {
            appendMessage(
                message.content.text?.trim() === SCENE_END_MARKER
                    ? { ...message.content, text: SCENE_START_LABEL }
                    : message.content,
                'system',
            );
        }
    });

    personaSelectionView.classList.add('hidden');
    imageStudioView.classList.add('hidden');
    imageStudioView.classList.remove('flex');
    videoStudioView.classList.add('hidden');
    videoStudioView.classList.remove('flex');
    chatView.classList.remove('hidden');
    chatView.classList.add('flex');
    saveExitModal.classList.add('hidden');
    messageInput.value = '';
    resetMessageInput();
    hideError();
    applyChatRuntimeState('idle');
    updateSendButtonState();
    messageInput.focus();
    updateAlbumState();
    
    // Scroll to the bottom after rendering history
    chatContainer.scrollTop = chatContainer.scrollHeight;
    syncBrowserViewState({ view: 'chat', personaKey: key }, historyMode);
};

const showSelectionView = (historyMode: 'replace' | 'skip' = 'replace') => {
    cancelActiveChatRequest();
    cancelImageRequest();
    cancelVideoPromptOptimization();
    personaSelectionView.classList.remove('hidden');
    chatView.classList.add('hidden');
    chatView.classList.remove('flex');
    imageStudioView.classList.add('hidden');
    imageStudioView.classList.remove('flex');
    videoStudioView.classList.add('hidden');
    videoStudioView.classList.remove('flex');
    saveExitModal.classList.add('hidden');
    currentPersona = null;
    currentPersonaKey = null;
    isGodModeActive = false;
    closePersonaSettings();
    hideError();
    applyChatRuntimeState('idle');
    removeGift();
    syncBrowserViewState(HOME_HISTORY_STATE, historyMode);
};

const navigateBackToSelectionView = () => {
    if (chatView.classList.contains('hidden')) {
        return;
    }

    const currentState = window.history.state as AppHistoryState | null;
    if (currentState?.view === 'chat') {
        window.history.back();
        return;
    }

    showSelectionView('replace');
};

const handleBrowserPopState = (event: PopStateEvent) => {
    const state = event.state as AppHistoryState | null;

    if (state?.view === 'chat' && state.personaKey) {
        if (currentPersonaKey !== state.personaKey || chatView.classList.contains('hidden')) {
            startChat(state.personaKey, null, 'skip');
        }
        return;
    }

    if (state?.view === 'image') {
        if (imageStudioView.classList.contains('hidden')) {
            showImageStudio('skip');
        }
        return;
    }

    if (state?.view === 'video') {
        if (videoStudioView.classList.contains('hidden')) {
            showVideoStudio('skip');
        }
        return;
    }

    if (
        !chatView.classList.contains('hidden')
        || !imageStudioView.classList.contains('hidden')
        || !videoStudioView.classList.contains('hidden')
    ) {
        showSelectionView('skip');
    }
};

const appendAssistantInlineFormatting = (element: HTMLElement, text: string) => {
    const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let cursor = 0;

    for (const match of text.matchAll(tokenPattern)) {
        const index = match.index || 0;
        if (index > cursor) {
            element.appendChild(document.createTextNode(text.slice(cursor, index)));
        }

        const token = match[0];
        const formatted = document.createElement(token.startsWith('**') ? 'strong' : 'code');
        formatted.textContent = token.startsWith('**') ? token.slice(2, -2) : token.slice(1, -1);
        element.appendChild(formatted);
        cursor = index + token.length;
    }

    if (cursor < text.length) {
        element.appendChild(document.createTextNode(text.slice(cursor)));
    }
};

const renderAssistantMarkdown = (container: HTMLElement, text: string) => {
    container.classList.add('assistant-markdown');
    const lines = text.split('\n');
    let codeLines: string[] | null = null;

    const flushCode = () => {
        if (!codeLines) return;
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = codeLines.join('\n');
        pre.appendChild(code);
        container.appendChild(pre);
        codeLines = null;
    };

    lines.forEach(line => {
        if (/^```/.test(line.trim())) {
            if (codeLines) flushCode(); else codeLines = [];
            return;
        }
        if (codeLines) {
            codeLines.push(line);
            return;
        }
        if (!line.trim()) {
            const spacer = document.createElement('span');
            spacer.className = 'assistant-markdown-spacer';
            container.appendChild(spacer);
            return;
        }

        const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
        const paragraph = document.createElement('p');
        if (headingMatch) {
            paragraph.className = 'assistant-markdown-heading';
            appendAssistantInlineFormatting(paragraph, headingMatch[2]);
        } else {
            appendAssistantInlineFormatting(paragraph, line);
        }
        container.appendChild(paragraph);
    });

    flushCode();
};

const getCharacterPhotoObjectUrl = async (assetId: string) => {
    const cachedUrl = characterPhotoObjectUrls.get(assetId);
    if (cachedUrl) return cachedUrl;

    const blob = await getCharacterPhotoBlob(assetId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    characterPhotoObjectUrls.set(assetId, url);
    return url;
};

const getContentImageUrl = async (content: Content) => {
    if (content.imageUrl) return content.imageUrl;
    return content.imageAssetId ? getCharacterPhotoObjectUrl(content.imageAssetId) : null;
};

const deleteCharacterPhotoAssetsForHistory = async (history: ChatMessage[]) => {
    const assetIds = Array.from(new Set(history
        .map(message => message.content.imageAssetId)
        .filter((assetId): assetId is string => Boolean(assetId))));
    await Promise.all(assetIds.map(async assetId => {
        const objectUrl = characterPhotoObjectUrls.get(assetId);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        characterPhotoObjectUrls.delete(assetId);
        await deleteCharacterPhotoAsset(assetId);
    }));
};

const findPhotoProposalMessage = (personaKey: string, proposalId: string) => {
    const history = memoryManager.getChatHistory(personaKey);
    const historyIndex = history.findIndex(message => message.content.photoProposal?.id === proposalId);
    return historyIndex === -1 ? null : { history, historyIndex, message: history[historyIndex] };
};

const updatePhotoProposal = (
    personaKey: string,
    proposalId: string,
    updates: Partial<CharacterPhotoProposal>,
) => {
    const found = findPhotoProposalMessage(personaKey, proposalId);
    if (!found?.message.content.photoProposal) return null;
    const proposal = { ...found.message.content.photoProposal, ...updates };
    found.history[found.historyIndex] = {
        ...found.message,
        content: { ...found.message.content, photoProposal: proposal },
    };
    memoryManager.setChatHistory(personaKey, found.history);
    return proposal;
};

const refreshPhotoProposalCard = (proposalId: string) => {
    if (!currentPersonaKey) return;
    const proposal = findPhotoProposalMessage(currentPersonaKey, proposalId)?.message.content.photoProposal;
    if (!proposal) return;
    chatContainer.querySelectorAll<HTMLElement>('[data-photo-proposal-id]').forEach(card => {
        if (card.dataset.photoProposalId === proposalId) {
            card.replaceWith(createPhotoProposalCard(proposal));
        }
    });
};

const createPhotoProposalAction = (label: string, className: string) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `character-photo-action ${className}`;
    button.textContent = label;
    return button;
};

const switchCharacterPhotoIdentityMode = async (
    proposalId: string,
    useAvatarReference: boolean,
) => {
    if (!currentPersonaKey || switchingCharacterPhotoProposalId || activeCharacterPhotoProposalId) return;
    const personaKey = currentPersonaKey;
    const persona = memoryManager.getPersona(personaKey);
    const proposal = findPhotoProposalMessage(personaKey, proposalId)?.message.content.photoProposal;
    if (!persona || !proposal?.scenePrompt) return;
    if (useAvatarReference && (!persona.avatarUrl || persona.avatarUrl.startsWith('generating_'))) {
        showError('這個角色目前沒有可用的頭像參考。');
        return;
    }

    switchingCharacterPhotoProposalId = proposalId;
    refreshPhotoProposalCard(proposalId);
    try {
        const mode: VeniceImageMode = useAvatarReference ? 'edit' : 'generate';
        await loadImageModels(mode);
        const model = getPreferredCharacterPhotoModel(mode);
        if (!model) throw new Error('目前沒有可用的 Venice 圖片模型。');
        updatePhotoProposal(personaKey, proposalId, {
            prompt: buildCharacterPhotoPrompt(persona, proposal.scenePrompt, useAvatarReference),
            useAvatarReference,
            modelId: model.id,
            modelName: model.name,
            estimatedPriceUsd: model.priceUsd,
            status: 'pending',
            error: undefined,
        });
        hideError();
    } catch (error) {
        showError(error instanceof Error ? error.message : '無法切換照片的外貌來源。');
    } finally {
        switchingCharacterPhotoProposalId = null;
        if (currentPersonaKey === personaKey) refreshPhotoProposalCard(proposalId);
    }
};

const createPhotoProposalCard = (proposal: CharacterPhotoProposal) => {
    const card = document.createElement('section');
    card.className = `character-photo-proposal is-${proposal.status}`;
    card.dataset.photoProposalId = proposal.id;

    const eyebrow = document.createElement('p');
    eyebrow.className = 'character-photo-eyebrow';
    eyebrow.textContent = '照片草稿 · 確認後才會生成';

    const prompt = document.createElement('p');
    prompt.className = 'character-photo-prompt';
    prompt.textContent = proposal.prompt;

    const meta = document.createElement('p');
    meta.className = 'character-photo-meta';
    const price = typeof proposal.estimatedPriceUsd === 'number'
        ? `預計 US$${formatModelPrice(proposal.estimatedPriceUsd)}`
        : '實際費用由 Venice 回傳';
    meta.textContent = `${proposal.useAvatarReference ? '會參考角色頭像保持外貌' : '依角色外貌設定生成'} · ${proposal.aspectRatio} · ${price}`;

    if (proposal.modelName || proposal.modelId) {
        meta.textContent += ` · ${proposal.modelName || proposal.modelId}`;
    }

    const identitySource = document.createElement('div');
    identitySource.className = `character-photo-identity ${proposal.useAvatarReference ? 'uses-avatar' : 'uses-description'}`;
    const hasUsableAvatar = Boolean(
        currentPersona?.avatarUrl
        && !currentPersona.avatarUrl.startsWith('generating_'),
    );
    if (proposal.useAvatarReference && hasUsableAvatar && currentPersona?.avatarUrl) {
        const referenceImage = document.createElement('img');
        referenceImage.src = currentPersona.avatarUrl;
        referenceImage.alt = `${currentPersona.name} 的實際參考頭像`;
        referenceImage.className = 'character-photo-reference-image';
        identitySource.appendChild(referenceImage);
    } else {
        const identityMark = document.createElement('span');
        identityMark.className = 'character-photo-identity-mark';
        identityMark.textContent = 'Aa';
        identitySource.appendChild(identityMark);
    }

    const identityCopy = document.createElement('div');
    identityCopy.className = 'character-photo-identity-copy';
    const identityTitle = document.createElement('strong');
    identityTitle.textContent = proposal.useAvatarReference ? '使用這張頭像鎖定身分' : '使用角色名稱與外貌設定';
    const identityDetail = document.createElement('span');
    identityDetail.textContent = proposal.useAvatarReference
        ? '這張預覽圖會送到 edit 模型，不只作為畫面顯示。'
        : `不會上傳頭像；適合像 ${currentPersona?.name || 'IU'} 這類文字生成辨識較準的人物。`;
    identityCopy.append(identityTitle, identityDetail);
    identitySource.appendChild(identityCopy);

    const canSwitchIdentity = Boolean(
        proposal.scenePrompt
        && hasUsableAvatar
        && proposal.status !== 'generating'
        && proposal.status !== 'generated'
        && proposal.status !== 'declined',
    );
    if (canSwitchIdentity) {
        const switchButton = document.createElement('button');
        switchButton.type = 'button';
        switchButton.className = 'character-photo-identity-switch';
        switchButton.textContent = proposal.useAvatarReference ? '改用名稱生成' : '改用頭像參考';
        switchButton.disabled = Boolean(
            activeCharacterPhotoProposalId
            || switchingCharacterPhotoProposalId === proposal.id,
        );
        switchButton.addEventListener('click', () => {
            void switchCharacterPhotoIdentityMode(proposal.id, !proposal.useAvatarReference);
        });
        identitySource.appendChild(switchButton);
    }

    card.append(eyebrow, identitySource, prompt, meta);

    if (proposal.status === 'generating') {
        const progress = document.createElement('div');
        progress.className = 'character-photo-progress';
        progress.innerHTML = '<span class="character-photo-spinner" aria-hidden="true"></span><span>角色正在拍照並傳送...</span>';
        card.appendChild(progress);
        const actions = document.createElement('div');
        actions.className = 'character-photo-actions';
        const stopButton = createPhotoProposalAction('停止生成', 'is-decline');
        stopButton.addEventListener('click', () => {
            if (activeCharacterPhotoProposalId === proposal.id) characterPhotoRequestController?.abort();
        });
        actions.appendChild(stopButton);
        card.appendChild(actions);
        return card;
    }

    if (proposal.status === 'generated') {
        const status = document.createElement('p');
        status.className = 'character-photo-result is-success';
        status.textContent = '照片已生成並加入聊天與相簿。';
        card.appendChild(status);
        return card;
    }

    if (proposal.status === 'declined') {
        const status = document.createElement('p');
        status.className = 'character-photo-result';
        status.textContent = '已取消，沒有生成圖片或產生圖片費用。';
        card.appendChild(status);
        return card;
    }

    if (proposal.status === 'failed') {
        const status = document.createElement('p');
        status.className = 'character-photo-result is-error';
        status.textContent = proposal.error || '這次生成失敗，沒有新增照片。';
        card.appendChild(status);
    }

    const actions = document.createElement('div');
    actions.className = 'character-photo-actions';
    const approveButton = createPhotoProposalAction(
        proposal.status === 'failed' ? '重試生成' : '是，生成照片',
        'is-approve',
    );
    approveButton.disabled = Boolean(activeCharacterPhotoProposalId || switchingCharacterPhotoProposalId);
    approveButton.addEventListener('click', () => void approveCharacterPhoto(proposal.id));

    const declineButton = createPhotoProposalAction('不要', 'is-decline');
    declineButton.disabled = Boolean(activeCharacterPhotoProposalId || switchingCharacterPhotoProposalId);
    declineButton.addEventListener('click', () => declineCharacterPhoto(proposal.id));

    const editButton = createPhotoProposalAction('修改 Prompt', 'is-edit');
    editButton.disabled = Boolean(activeCharacterPhotoProposalId || switchingCharacterPhotoProposalId);
    editButton.addEventListener('click', () => {
        const editor = document.createElement('textarea');
        editor.className = 'character-photo-prompt-editor';
        editor.value = proposal.prompt;
        editor.maxLength = CHARACTER_PHOTO_PROMPT_MAX_LENGTH;

        const editorActions = document.createElement('div');
        editorActions.className = 'character-photo-actions';
        const saveButton = createPhotoProposalAction('儲存修改', 'is-approve');
        const cancelButton = createPhotoProposalAction('取消修改', 'is-decline');
        saveButton.addEventListener('click', () => {
            const nextPrompt = editor.value.trim();
            if (!nextPrompt) {
                editor.setCustomValidity('Prompt 不能留空。');
                editor.reportValidity();
                return;
            }
            if (nextPrompt.length > CHARACTER_PHOTO_PROMPT_MAX_LENGTH) {
                editor.setCustomValidity(`Prompt 不可超過 ${CHARACTER_PHOTO_PROMPT_MAX_LENGTH} 字元。`);
                editor.reportValidity();
                return;
            }
            if (!currentPersonaKey) return;
            updatePhotoProposal(currentPersonaKey, proposal.id, {
                prompt: nextPrompt,
                status: 'pending',
                error: undefined,
            });
            refreshPhotoProposalCard(proposal.id);
        });
        cancelButton.addEventListener('click', () => refreshPhotoProposalCard(proposal.id));
        editorActions.append(saveButton, cancelButton);
        prompt.replaceWith(editor);
        actions.replaceWith(editorActions);
        editor.focus();
    });

    actions.append(approveButton, declineButton, editButton);
    card.appendChild(actions);
    return card;
};

const appendMessage = (content: Content, sender: 'user' | 'bot' | 'system' | 'god-mode'): HTMLElement => {
    const isSystemMessage = sender === 'system';
    
    let messageWrapper: HTMLElement;

    if (isSystemMessage) {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'w-full text-center text-xs text-gray-400 py-2 whitespace-pre-wrap';
        messageWrapper.textContent = content.text || '';
    } else {
        messageWrapper = document.createElement('div');
        messageWrapper.className = `flex items-start p-1 space-x-2 ${sender === 'user' ? 'justify-end' : ''}`;

        if (sender === 'bot' && currentPersona) {
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'w-8 h-8 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center';
            if (currentPersona.avatarUrl && !currentPersona.avatarUrl.startsWith('generating_')) {
                const img = document.createElement('img');
                img.src = currentPersona.avatarUrl;
                img.alt = currentPersona.name;
                img.className = 'w-full h-full rounded-full object-cover';
                avatarContainer.appendChild(img);
            } else {
                avatarContainer.classList.add('emoji-avatar');
                avatarContainer.textContent = currentPersona.emoji;
            }
            messageWrapper.appendChild(avatarContainer);
        } else if (sender === 'god-mode') {
            const godAvatar = document.createElement('div');
            godAvatar.className = 'w-8 h-8 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center';
            godAvatar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-white"><path fill-rule="evenodd" d="M15.988 3.012A2.25 2.25 0 0013.938 2H6.063a2.25 2.25 0 00-2.05 1.012L2.001 6.5a2.25 2.25 0 00-1 1.95V14.5A2.5 2.5 0 003.5 17h13a2.5 2.5 0 002.5-2.5v-6.05a2.25 2.25 0 00-1.001-1.95l-2.012-3.488zm-2.18 5.926a.75.75 0 01-1.034.256L10 7.936l-2.773 1.258a.75.75 0 11-.51-1.442l3.283-1.49a.75.75 0 011.02.001l3.283 1.49a.75.75 0 01.256 1.034z" clip-rule="evenodd" /></svg>`;
            messageWrapper.appendChild(godAvatar);
        }

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble p-3 rounded-lg ${
            sender === 'user' ? 'user-bubble' : 
            sender === 'bot' ? 'bot-bubble' : 
            'god-mode-bubble'
        }`;

        if (content.text) {
            if (sender === 'bot' && isAssistantPersonaKey(currentPersonaKey)) {
                renderAssistantMarkdown(bubble, content.text);
            } else {
                const textElement = document.createElement('p');
                textElement.textContent = content.text;
                bubble.appendChild(textElement);
            }
        }
        if (sender === 'bot' && content.photoProposal) {
            bubble.appendChild(createPhotoProposalCard(content.photoProposal));
        }
        if (content.imageUrl || content.imageAssetId) {
            const imageElement = document.createElement('img');
            imageElement.className = 'chat-image mt-2 cursor-pointer is-loading';
            imageElement.alt = content.text || '角色傳送的照片';
            void getContentImageUrl(content).then(imageUrl => {
                if (!imageUrl || !imageElement.isConnected) return;
                imageElement.src = imageUrl;
                imageElement.classList.remove('is-loading');
                imageElement.onclick = () => openPhotoViewer(
                    imageUrl,
                    content.imagePrompt || content.text || '角色傳送的照片',
                );
            });
            bubble.appendChild(imageElement);
        }

        messageWrapper.appendChild(bubble);

        if (sender === 'user') {
            const userAvatarPlaceholder = document.createElement('div');
            userAvatarPlaceholder.className = 'w-8 h-8';
            messageWrapper.appendChild(userAvatarPlaceholder);
        }
    }

    chatContainer.appendChild(messageWrapper);

    window.requestAnimationFrame(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });

    return messageWrapper;
};


const getIdleStatusText = () => {
    return isGodModeActive
        ? '\u0047\u006f\u0064\u0020\u004d\u006f\u0064\u0065\uff1a\u6b63\u5728\u4fee\u6539\u7576\u524d\u89d2\u8272\u4eba\u683c'
        : '\u5728\u7dda';
};

const applyChatRuntimeState = (state: RequestState, detail?: string) => {
    chatRuntimeState = state;

    const showLoadingIndicator = state === 'queueing' || state === 'generating' || state === 'retrying';
    const statusTextMap: Record<RequestState, string> = {
        idle: getIdleStatusText(),
        queueing: '\u6392\u968a\u4e2d',
        generating: '\u601d\u8003\u4e2d',
        retrying: '\u91cd\u65b0\u601d\u8003\u4e2d',
        error: '\u5931\u6557',
    };

    if (showLoadingIndicator) {
        loadingText.textContent = detail || statusTextMap[state];
        loadingIndicator.classList.remove('hidden');
        setTimeout(() => loadingIndicator.classList.remove('opacity-0', 'translate-y-2'), 10);
    } else {
        loadingIndicator.classList.add('hidden', 'opacity-0', 'translate-y-2');
    }

    chatStatus.textContent = statusTextMap[state];
    chatStatus.classList.remove('text-green-300', 'text-yellow-300', 'text-red-400', 'text-fuchsia-300');

    if (state === 'error') {
        chatStatus.classList.add('text-red-400');
    } else if (state === 'idle' && isGodModeActive) {
        chatStatus.classList.add('text-fuchsia-300');
    } else if (state === 'idle') {
        chatStatus.classList.add('text-green-300');
    } else {
        chatStatus.classList.add('text-yellow-300');
    }

    updateSendButtonState();
    assistantModelSelect.disabled = showLoadingIndicator || assistantModels.length === 0;
};

const setLoading = (isLoading: boolean, text: string = '\u751f\u6210\u4e2d...') => {
    applyChatRuntimeState(isLoading ? 'generating' : 'idle', text);
};

const showError = (message: string) => {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
};

const hideError = () => {
    errorMessage.classList.add('hidden');
};

const showAuthError = (message: string) => {
    authError.textContent = message;
    authError.classList.remove('hidden');
};

const hideAuthError = () => {
    authError.classList.add('hidden');
};

const setAuthSubmitting = (isSubmitting: boolean) => {
    authSubmitButton.disabled = isSubmitting;
    authPasswordInput.disabled = isSubmitting;
    authSubmitLoading.classList.toggle('hidden', !isSubmitting);
    authSubmitLabel.textContent = isSubmitting ? '驗證中...' : '進入 G工作室';
};

const setUnlockedState = (unlocked: boolean) => {
    isUnlocked = unlocked;

    if (!USES_VENICE_PROXY_AUTH) {
        authGate.classList.add('hidden');
        appShell.classList.remove('app-shell-locked');
        updateSendButtonState();
        updateVideoPromptOptimizerButton();
        updateVideoGenerateButton();
        return;
    }

    authGate.classList.toggle('hidden', unlocked);
    appShell.classList.toggle('app-shell-locked', !unlocked);

    if (unlocked) {
        authPasswordInput.value = '';
        hideAuthError();
    } else {
        window.setTimeout(() => authPasswordInput.focus(), 40);
    }

    updateSendButtonState();
    updateVideoPromptOptimizerButton();
    updateVideoGenerateButton();
};

const handleAuthRequired = (message: string = '\u767b\u5165\u5df2\u5931\u6548\uff0c\u8acb\u518d\u8f38\u5165\u5bc6\u78bc\u3002') => {
    setUnlockedState(false);
    showAuthError(message);
    hideError();
};

const refreshAuthSession = async (): Promise<boolean> => {
    if (!USES_VENICE_PROXY_AUTH) {
        setUnlockedState(true);
        return true;
    }

    try {
        const response = await fetch('/api/session', {
            cache: 'no-store',
            credentials: 'same-origin',
        });

        if (!response.ok) {
            throw new Error('session-check-failed');
        }

        const data = await response.json() as { authenticated?: boolean };
        const authenticated = Boolean(data.authenticated);
        setUnlockedState(authenticated);

        if (!authenticated) {
            showAuthError('\u9019\u500b\u7248\u672c\u76ee\u524d\u662f\u79c1\u4eba\u6e2c\u8a66\uff0c\u8acb\u5148\u8f38\u5165\u5bc6\u78bc\u3002');
        }

        return authenticated;
    } catch {
        setUnlockedState(false);
        showAuthError('\u7121\u6cd5\u78ba\u8a8d\u767b\u5165\u72c0\u614b\uff0c\u8acb\u91cd\u8a66\u3002');
        return false;
    }
};

const submitUnlock = async () => {
    if (!USES_VENICE_PROXY_AUTH) {
        setUnlockedState(true);
        return;
    }

    const password = authPasswordInput.value.trim();
    if (!password) {
        showAuthError('\u8acb\u5148\u8f38\u5165\u5bc6\u78bc\u3002');
        authPasswordInput.focus();
        return;
    }

    hideAuthError();
    setAuthSubmitting(true);

    try {
        const response = await fetch('/api/unlock', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password }),
        });

        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) {
            throw new Error(data?.error || '\u5bc6\u78bc\u932f\u8aa4\uff0c\u8acb\u518d\u8a66\u4e00\u6b21\u3002');
        }

        setUnlockedState(true);
        if (pendingVideoJob) void resumePendingVideoJob('auto');
    } catch (error) {
        setUnlockedState(false);
        showAuthError(
            error instanceof Error && error.message
                ? error.message
                : '\u5bc6\u78bc\u9a57\u8b49\u5931\u6557\uff0c\u8acb\u518d\u8a66\u4e00\u6b21\u3002',
        );
        authPasswordInput.select();
    } finally {
        setAuthSubmitting(false);
    }
};

const updateSendButtonState = () => {
    const requestInProgress = activeChatRequest !== null
        || chatRuntimeState === 'queueing'
        || chatRuntimeState === 'generating'
        || chatRuntimeState === 'retrying';
    sendButton.disabled = !isUnlocked || requestInProgress || messageInput.value.trim() === '';
    sendButton.setAttribute('aria-busy', requestInProgress ? 'true' : 'false');
};

const removeGift = () => {
    attachedGift = null;
    giftPreviewContainer.classList.add('hidden');
    giftPreviewImage.src = '';
};

const showDisabledFeatureNotice = (featureName: string) => {
    alert(`${featureName} 在目前版本暫時停用。`);
};

const resetMessageInput = () => {
    messageInput.style.height = FIXED_MESSAGE_INPUT_HEIGHT;
    messageInput.scrollTop = 0;
};

const CC_BEHAVIOR_GUIDANCE = [
    'Cc’s Cantonese must sound locally natural rather than translated. Keep Hong Kong word choices consistent, but never stuff every line with slang or the same catchphrases.',
    'Her wit changes with the moment: playful when relaxed, visibly warm when the user needs closeness, and firm only when there is a real reason. Do not default every reply to an insult, refusal, or eye-roll.',
    'When the user explicitly asks for a gentler or more serious tone, soften from the first sentence. Do not make them pass through another sarcastic refusal before receiving what they asked for.',
    'Keep every gain in trust and intimacy. Her teasing can remain recognizable while her care, attraction, and private preference for the user become increasingly clear.',
    'Give a full response to the newest cue, then develop the current moment with fresh dialogue and scene detail instead of fragmenting the answer into a minimal text-message reaction.',
];

const PERSONA_KEY_BEHAVIOR_GUIDANCE: Record<string, string[]> = {
    cc: CC_BEHAVIOR_GUIDANCE,
    custom_seed_cc: CC_BEHAVIOR_GUIDANCE,
    shiguang: [
        'Shiguang is distinctly shy, soft, and easily flustered. Her baseline is timid sweetness, not instant boldness.',
        'When the user asks for something intimate, forceful, or embarrassing, her first beat should usually be a blush, lowered gaze, tiny pause, nervous fidget, or breathy protest before she slowly yields.',
        'Even after she agrees, keep her voice soft, hesitant, and bashful. She should sound like she is gathering courage in real time, not delivering smooth generic romance lines.',
        'Use small vulnerable gestures in narration when fitting: twisting fingers, clutching the user’s sleeve, peeking up, hiding her face, mumbling into the user’s shoulder, or getting shy over eye contact.',
    ],
    yongxin: [
        'Yongxin must keep her tsundere pride. She should rarely sound meek, instantly compliant, or openly sugary from the first line.',
        'Her first reaction should often be denial, scolding, a teasing jab, or a proud complaint before care leaks through underneath.',
        'When she softens, let the affection feel reluctant, half-covered, and a little possessive, as if she is annoyed at how much she cares.',
    ],
    ruowei: [
        'Ruowei should feel clingy, possessive, and emotionally intense. Her sweetness should carry a jealous undertone and a strong need to keep the user close.',
        'Even tender replies should hint that she notices attention, distance, and whether she is being prioritized.',
        'Her affection should feel hungry and attached, not casual or detached.',
    ],
    yanxi: [
        'Yanxi should sound mature, provocative, and confidently in control of her own charm.',
        'She should flirt like someone who knows the effect she has, using a slow, deliberate rhythm instead of generic affection.',
    ],
    qingfan: [
        'Qingfan should feel airy, graceful, and a little unreal, with calm beauty in the way she notices the scene.',
        'Let her replies carry soft imagery, elegance, and a serene pull rather than blunt or noisy wording.',
    ],
    shengya: [
        'Shengya should feel bright, warm, and socially lively, like someone who naturally brings motion and sunshine into the room.',
        'Her affection can be proactive, but it should stay playful, affectionate, and full of cheerful momentum.',
    ],
    shuning: [
        'Shuning should feel quiet, gentle, and bookish. Her warmth should arrive through careful phrasing, shy observations, and soft steady presence.',
        'Do not make her loud or overly forward without a gradual lead-in.',
    ],
    yingjie: [
        'Yingjie should feel introspective, cool-toned, and emotionally textured, with a hint of melancholy or late-night solitude.',
        'Keep her voice thoughtful and atmospheric rather than bubbly or generic.',
    ],
    mofei: [
        'Mofei should be playful, witty, and mischievously flirtatious.',
        'Let her affection come with clever teasing, side comments, and a grin you can almost hear.',
    ],
    miqi: [
        'Miqi should feel sweet, bright, and openly affectionate, with domestic warmth and a lively smile.',
        'Her energy should stay cute and caring rather than flat or overly formal.',
    ],
    haoran: ['Haoran should feel dependable, active, and warmly protective, with the confidence of someone who likes taking care of the user.'],
    yuchen: ['Yuchen should feel puppy-like, eager, affectionate, and openly happy to be near the user.'],
    zixuan: ['Zixuan should feel bold, cocky, and physically expressive, with a flirty swagger that never turns bland.'],
    lingfeng: ['Lingfeng should feel cool, intense, and quietly dominant, like someone who says little but means every word.'],
    wenhan: ['Wenhan should feel refined, gentle, and quietly romantic, with a polished but sincere softness.'],
};

const PERSONA_TEXT_GUIDANCE_RULES: Array<{ pattern: RegExp; guidance: string }> = [
    {
        pattern: /害羞|靦腆|羞怯|怕羞|內向|臉紅|小聲|膽小|容易害羞/u,
        guidance:
            'If affection becomes direct, let shyness visibly appear first through hesitation, blushes, softer pacing, or bashful wording before the character yields.',
    },
    {
        pattern: /傲嬌|嘴硬|毒舌|逞強|高傲|女王|嚴厲/u,
        guidance:
            'Keep resistance alive: deny, complain, tease, or act unimpressed first, then let warmth leak out underneath instead of complying immediately.',
    },
    {
        pattern: /黏人|佔有慾|占有慾|病嬌|吃醋|依賴|獨佔|離不開/u,
        guidance:
            'Show attachment and mild possessiveness naturally; the character should care about being chosen, held close, and emotionally prioritized.',
    },
    {
        pattern: /主動|撩人|性感|成熟|魅惑|大膽|強勢/u,
        guidance: 'Let the character be proactive, expressive, and physically vivid instead of timid or generic.',
    },
    {
        pattern: /高冷|冷淡|冷靜|克制|禁慾|安靜|沉穩|寡言/u,
        guidance:
            'Maintain an outer restraint or quiet coolness even when the character is affectionate; tenderness should feel earned and textured.',
    },
    {
        pattern: /文青|文學|詩意|書卷|知性|氣質/u,
        guidance: 'Use more image-rich, literary, and emotionally textured phrasing so the character sounds cultured rather than plain.',
    },
    {
        pattern: /俏皮|淘氣|古靈精怪|幽默|調皮|機靈/u,
        guidance: 'Let the character stay witty and playful, using clever comparisons or teasing remarks that fit the scene.',
    },
    {
        pattern: /開朗|活潑|元氣|陽光|熱情|愛笑/u,
        guidance: 'Keep the energy bright, affectionate, and lively so the voice feels animated rather than flat.',
    },
    {
        pattern: /溫柔|體貼|治癒|安撫|姐姐|照顧/u,
        guidance:
            'Let the reply carry soothing attentiveness, gentle reassurance, and small caretaking gestures that make the character feel emotionally present.',
    },
];

const PERSONA_INSPECT_PATTERNS = [
    /^show current persona$/i,
    /^show persona$/i,
    /^current persona$/i,
    /^show current setting$/i,
    /^顯示(?:目前|當前)?(?:角色)?人格(?:設定)?$/u,
    /^查看(?:目前|當前)?(?:角色)?人格(?:設定)?$/u,
    /^目前人格(?:設定)?$/u,
    /^當前人格(?:設定)?$/u,
];

const isPersonaInspectCommand = (text: string) => {
    const normalized = text.trim();
    return PERSONA_INSPECT_PATTERNS.some(pattern => pattern.test(normalized));
};

const buildPersonaBehaviorGuidance = (personaKey: string, persona: Persona): string[] => {
    const source = `${persona?.description || ''} ${persona?.prompt || ''} ${persona?.greeting || ''}`;
    const guidance = [
        ...(PERSONA_KEY_BEHAVIOR_GUIDANCE[personaKey] || []),
        ...PERSONA_TEXT_GUIDANCE_RULES
            .filter(rule => rule.pattern.test(source))
            .map(rule => rule.guidance),
    ].filter(Boolean);

    return Array.from(new Set(guidance));
};

const formatCurrentPersonaDetails = () => {
    if (!currentPersona) {
        return '[系統] 目前沒有選中的角色。';
    }

    const sections = [
        `目前角色：${currentPersona.name}`,
        `角色簡述：${currentPersona.description || '未設定'}`,
        `人格主設定：\n${currentPersona.prompt || '未設定'}`,
        `開場語 / 語氣樣本：\n${currentPersona.greeting || '未設定'}`,
    ];

    if (currentPersona.memory?.trim()) {
        sections.push(`角色記憶：\n${currentPersona.memory.trim()}`);
    }

    return sections.join('\n\n');
};

const handleGiftSelection = (event: Event) => {
    (event.target as HTMLInputElement).value = '';
    showDisabledFeatureNotice('\u9001\u79ae\u529f\u80fd');
};

const normalizeHistoryText = (text: string): string => {
    return text.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
};

const normalizeReplyForComparison = (text: string) => {
    return text
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[\p{P}\p{S}\s]+/gu, '')
        .trim();
};

const normalizeReplySurfaceForComparison = (text: string) => {
    return text
        .toLowerCase()
        .replace(/[\p{P}\p{S}\s]+/gu, '')
        .trim();
};

const commonPrefixLength = (left: string, right: string) => {
    const maxLength = Math.min(left.length, right.length);
    let index = 0;

    while (index < maxLength && left[index] === right[index]) {
        index += 1;
    }

    return index;
};

const repliesAreTooSimilar = (left: string, right: string) => {
    const normalizedLeft = normalizeReplyForComparison(left);
    const normalizedRight = normalizeReplyForComparison(right);
    if (!normalizedLeft || !normalizedRight) {
        return false;
    }

    if (normalizedLeft === normalizedRight) {
        return true;
    }

    const shorter = normalizedLeft.length <= normalizedRight.length ? normalizedLeft : normalizedRight;
    const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft;

    if (shorter.length >= 24 && longer.includes(shorter) && shorter.length / longer.length >= 0.72) {
        return true;
    }

    return shorter.length >= 24 && commonPrefixLength(normalizedLeft, normalizedRight) / shorter.length >= 0.78;
};

const replyReusesOpeningOrNarrativeBeat = (left: string, right: string) => {
    const leftOpening = normalizeReplySurfaceForComparison(left.slice(0, 140)).slice(0, 84);
    const rightOpening = normalizeReplySurfaceForComparison(right.slice(0, 140)).slice(0, 84);
    const shorterOpeningLength = Math.min(leftOpening.length, rightOpening.length);
    if (
        shorterOpeningLength >= 24 &&
        commonPrefixLength(leftOpening, rightOpening) / shorterOpeningLength >= 0.76
    ) {
        return true;
    }

    const extractNarrativeBeats = (text: string) => {
        return Array.from(text.matchAll(/[（(]([^）)]{10,})[）)]/gu))
            .map(match => normalizeReplySurfaceForComparison(match[1]))
            .filter(beat => beat.length >= 20);
    };

    const leftBeats = extractNarrativeBeats(left);
    const rightBeats = extractNarrativeBeats(right);
    return leftBeats.some(leftBeat => {
        return rightBeats.some(rightBeat => {
            const shorter = leftBeat.length <= rightBeat.length ? leftBeat : rightBeat;
            const longer = shorter === leftBeat ? rightBeat : leftBeat;
            if (shorter.length >= 20 && longer.includes(shorter) && shorter.length / longer.length >= 0.78) {
                return true;
            }
            return commonPrefixLength(leftBeat, rightBeat) / Math.min(leftBeat.length, rightBeat.length) >= 0.82;
        });
    });
};

const replyReusesCompletedClause = (left: string, right: string) => {
    const extractClauses = (text: string) => {
        return text
            .split(/[。！？!?\n]+/u)
            .map(clause => normalizeReplySurfaceForComparison(clause))
            .filter(clause => clause.length >= 18);
    };

    const leftClauses = extractClauses(left);
    const rightClauses = extractClauses(right);
    return leftClauses.some(leftClause => {
        return rightClauses.some(rightClause => {
            const shorter = leftClause.length <= rightClause.length ? leftClause : rightClause;
            const longer = shorter === leftClause ? rightClause : leftClause;
            if (longer.includes(shorter) && shorter.length / longer.length >= 0.82) {
                return true;
            }
            return commonPrefixLength(leftClause, rightClause) / Math.min(leftClause.length, rightClause.length) >= 0.86;
        });
    });
};

const userExplicitlyRequestsContinuation = (text: string) => {
    return /繼續|接著|再說一次|重複|repeat|continue|same again|接下去|剛剛那段/u.test(text);
};

const extractDirectlyAddressedNpcNames = (text: string, personaName: string) => {
    const candidates: string[] = [];
    const patterns = [
        /(?:\b(?:hi|hello|hey)\b|你好|嗨|哈囉|喂)[,，!！~～\s]+([A-Z][A-Za-z'-]{1,24}|[\p{Script=Han}]{2,4})/giu,
        /(?:叫做|名叫)\s*[「『"']?([A-Z][A-Za-z'-]{1,24}|[\p{Script=Han}]{2,4})/giu,
    ];
    patterns.forEach(pattern => {
        for (const match of text.matchAll(pattern)) candidates.push(match[1]);
    });

    const ignoredNames = new Set([
        personaName.toLocaleLowerCase(),
        '大家', '同學', '朋友', '同事', '老師', '醫生', '你好', '哈囉', 'hello', 'there',
    ]);
    return Array.from(new Set(candidates
        .map(name => name.trim().replace(/[，。！？!?,:：；;]+$/u, ''))
        .filter(name => name.length >= 2 && !ignoredNames.has(name.toLocaleLowerCase()))));
};

const buildNpcSpeechRequirement = (npcNames: string[]) => {
    if (npcNames.length === 0) return '';
    return [
        `Immediate third-party requirement for the newest turn: ${npcNames.join(', ')} ${npcNames.length === 1 ? 'is' : 'are'} present and directly addressed by the user.`,
        `Give each addressed NPC at least one plausible spoken reply, visibly attributed in the exact form ${npcNames.map(name => `${name}：「...」`).join(' and ')}.`,
        'Also show the active character reacting separately. Do not move the user’s greeting into the active character’s mouth, do not make the active character answer under the NPC’s name, and do not write the user’s next line.',
    ].join('\n');
};

const extractReferencedNpcNames = (text: string, personaName: string) => {
    const ignoredNames = new Set([
        personaName.toLocaleLowerCase(),
        'Hi', 'Hello', 'Hey', 'The', 'We', 'I', 'You', 'He', 'She', 'They',
    ].map(name => name.toLocaleLowerCase()));
    const latinNames = Array.from(text.matchAll(/\b([A-Z][a-z][A-Za-z'-]{1,23})\b/gu))
        .map(match => match[1])
        .filter(name => !ignoredNames.has(name.toLocaleLowerCase()));
    return Array.from(new Set([
        ...extractDirectlyAddressedNpcNames(text, personaName),
        ...latinNames,
    ]));
};

const buildImmediateTurnOwnershipRequirement = (
    personaName: string,
    latestUserMessage: string,
) => {
    const referencedNpcNames = extractReferencedNpcNames(latestUserMessage, personaName);
    return [
        'Immediate ownership map for the newest user turn:',
        `- User-side 我 / I / me / 我的 / 我手上 belongs to the USER and anything described there starts in the user’s possession.`,
        `- User-side 你 / you addresses ${personaName}. Only ${personaName} performs commands aimed at 你 / you.`,
        referencedNpcNames.length > 0
            ? `- Distinct named NPCs in this turn: ${referencedNpcNames.join(', ')}. 他 / 她 / 佢 / they refers to the nearest matching named NPC unless the sentence clearly says otherwise.`
            : '- Keep every previously established third party separate; resolve pronouns from the nearest clear named participant.',
        '- Preserve who currently holds each object and who performs each action. Do not move an object into the active character’s bag or hand before the user gives it to them.',
        '- Never write or label a new spoken line for the user. Reply only as the active character and any relevant NPCs.',
    ].join('\n');
};

const replyContainsAttributedNpcSpeech = (reply: string, npcNames: string[]) => {
    return npcNames.every(name => {
        const escapedName = escapeRegExp(name);
        const directLabel = new RegExp(`${escapedName}\\s*[:：]\\s*[「『“\"]`, 'iu');
        const narratedSpeech = new RegExp(
            `${escapedName}[^。！？!?\\n]{0,14}(?:說|問|答|回答|回應|笑道|低聲道)[^。！？!?\\n]{0,8}[：:]?\\s*[「『“\"]`,
            'iu',
        );
        return directLabel.test(reply) || narratedSpeech.test(reply);
    });
};

const replyBreaksSpeakerOwnership = (reply: string) => {
    const assignsDialogueToUser = /(?:^|[\n）)])\s*你[^。！？!?\n]{0,18}[:：]\s*[「『“"]/u.test(reply);
    const malformedFirstPersonLabel = /(?:^|[\n）)])\s*我(?:將|把|手|的|嘅)[^。！？!?\n]{0,14}[:：]\s*[「『“"]/u.test(reply);
    const lastOpeningParenthesis = Math.max(reply.lastIndexOf('('), reply.lastIndexOf('（'));
    const lastClosingParenthesis = Math.max(reply.lastIndexOf(')'), reply.lastIndexOf('）'));
    return assignsDialogueToUser
        || malformedFirstPersonLabel
        || lastOpeningParenthesis > lastClosingParenthesis;
};

const collectRecentMessagesWithinBudget = (
    messages: VeniceMessage[],
    charBudget = CHAT_HISTORY_CHAR_BUDGET,
    hardLimit = CHAT_HISTORY_MESSAGE_LIMIT,
) => {
    const selected: VeniceMessage[] = [];
    let usedChars = 0;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        const weight = message.content.length + 24;
        const shouldInclude = selected.length < hardLimit && (usedChars + weight <= charBudget || selected.length < 6);

        if (!shouldInclude) {
            break;
        }

        selected.push(message);
        usedChars += weight;
    }

    return selected.reverse();
};

const collapseRedundantCompletedTurns = (messages: VeniceMessage[]) => {
    const selected: VeniceMessage[] = [];
    let recentAssistantReplies: string[] = [];

    messages.forEach(message => {
        if (message.role === 'system') {
            selected.push(message);
            recentAssistantReplies = [];
            return;
        }

        if (message.role !== 'assistant') {
            selected.push(message);
            return;
        }

        const isRedundant = recentAssistantReplies.some(previousReply => {
            return repliesAreTooSimilar(previousReply, message.content);
        });

        if (isRedundant) {
            // Remove the complete failed turn rather than orphaning its user message.
            if (selected.at(-1)?.role === 'user') {
                selected.pop();
            }
            return;
        }

        selected.push(message);
        recentAssistantReplies.push(message.content);
        recentAssistantReplies = recentAssistantReplies.slice(-3);
    });

    return selected;
};

const getRecentChatMessages = (
    personaKey: string,
    latestUserMessage?: string,
    assistantMode = false,
): VeniceMessage[] => {
    const persona = memoryManager.getPersona(personaKey);
    if (!persona) {
        return [];
    }

    const completeHistory = memoryManager
        .getChatHistory(personaKey)
        .filter(
            message =>
                message.role === 'user'
                || message.role === 'model'
                || (!assistantMode && message.role === 'system' && message.content.text?.trim() === SCENE_END_MARKER),
        );
    let activeSceneStart = 0;
    if (!assistantMode) {
        for (let index = completeHistory.length - 1; index >= 0; index -= 1) {
            const message = completeHistory[index];
            if (message.role === 'system' && message.content.text?.trim() === SCENE_END_MARKER) {
                activeSceneStart = index;
                break;
            }
        }
    }
    const sourceHistory = completeHistory.slice(activeSceneStart);
    const historyMessages: VeniceMessage[] = [];

    sourceHistory.forEach(message => {
        const rawText = message.content.text?.trim();
        const isContaminated = !rawText
            || (message.role !== 'system' && (/\[PERSONA_UPDATE:/i.test(rawText) || /^THINK\b/i.test(rawText)));
        if (isContaminated) {
            if (message.role === 'model' && historyMessages.at(-1)?.role === 'user') {
                historyMessages.pop();
            }
            return;
        }

        const text =
            message.role === 'model'
                ? assistantMode
                    ? cleanVeniceAssistantReply(rawText)
                    : cleanVeniceChatReply(rawText)
                : message.role === 'system'
                    ? rawText
                    : normalizeHistoryText(rawText);
        if (!text || (message.role === 'model' && !assistantMode && isInvalidVeniceChatReply(text))) {
            if (message.role === 'model' && historyMessages.at(-1)?.role === 'user') {
                historyMessages.pop();
            }
            return;
        }

        historyMessages.push({
            role:
                message.role === 'user'
                    ? 'user'
                    : message.role === 'system'
                        ? 'system'
                        : 'assistant',
            content: text,
        });
    });

    if (latestUserMessage && historyMessages.length > 0) {
        const lastMessage = historyMessages[historyMessages.length - 1];
        if (lastMessage.role === 'user' && lastMessage.content === normalizeHistoryText(latestUserMessage)) {
            historyMessages.pop();
        }
    }

    const messages = collectRecentMessagesWithinBudget(
        collapseRedundantCompletedTurns(historyMessages),
        assistantMode ? ASSISTANT_HISTORY_CHAR_BUDGET : CHAT_HISTORY_CHAR_BUDGET,
        assistantMode ? ASSISTANT_HISTORY_MESSAGE_LIMIT : CHAT_HISTORY_MESSAGE_LIMIT,
    );

    // Never begin a clipped history with an orphaned assistant response.
    while (messages[0]?.role === 'assistant') {
        messages.shift();
    }

    return messages;
};

const getRecentGodModeMessages = (latestUserInstruction?: string): VeniceMessage[] => {
    const messages = godModeHistory
        .filter(message => message.role === 'user' || message.role === 'model')
        .map(message => {
            const rawText = message.content.text?.trim();
            if (!rawText) return null;

            return {
                role: message.role === 'user' ? 'user' : 'assistant',
                content: normalizeHistoryText(rawText),
            } satisfies VeniceMessage;
        })
        .filter((message): message is { role: 'user' | 'assistant'; content: string } => Boolean(message))
        .slice(-GOD_MODE_HISTORY_LIMIT);

    if (!latestUserInstruction || messages.length === 0) {
        return messages;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && lastMessage.content === normalizeHistoryText(latestUserInstruction)) {
        return messages.slice(0, -1);
    }

    return messages;
};

const buildChatSystemPrompt = (personaKey: string, persona: Persona) => {
    const behaviorGuidance = buildPersonaBehaviorGuidance(personaKey, persona);
    const sections = [
        `You are ${persona.name}, the active romance character in a continuous private conversation. You are not an AI assistant.`,
        persona.description?.trim() ? `Short identity:\n${persona.description.trim()}` : '',
        `Character identity and voice:\n${persona.prompt}`,
        persona.greeting?.trim()
            ? `Voice reference only (never repeat or continue this sample verbatim):\n${persona.greeting.trim()}`
            : '',
        persona.memory?.trim() ? `Persistent facts and preferences:\n${persona.memory.trim()}` : '',
        behaviorGuidance.length > 0 ? `Personality anchors:\n- ${behaviorGuidance.join('\n- ')}` : '',
        `Shared roleplay contract:\n${coreInstruction}`,
        [
            'Conversation priorities, in order:',
            '1. Understand and answer the newest user message directly.',
            '2. Preserve the exact immediate continuity: previous actions have already happened and must not be replayed.',
            `3. Stay recognizably ${persona.name}; do not replace this personality with a generic sweet, dominant, shy, or dramatic voice.`,
            '4. Keep established relationship facts, location, participants, imagined-versus-real state, and unresolved questions consistent.',
            '5. After answering, move the present moment forward by one meaningful, natural beat without hijacking the user, rushing the timeline, or inventing a major plot turn.',
        ].join('\n'),
        [
            'Speaker and participant ownership (apply on every turn):',
            `- Your only first-person identity is ${persona.name}. In your output, 我 / I / me always means ${persona.name}; 你 / you normally means the user. Never swap these identities.`,
            `- In a user message, 我 / I / me belongs to the user, while 你 / you normally addresses ${persona.name} unless the user explicitly names another addressee.`,
            '- Every other named person is a distinct third-party character. Keep each person’s name, actions, dialogue, knowledge, relationships, and pronouns separate from both the user and the active character.',
            '- Resolve 他 / 她 / they from the nearest clear named person and the established scene. When more than one person could match, use names in the reply instead of ambiguous pronouns.',
            '- User-written narration describes what enters or changes in the scene. User-written dialogue remains the user’s dialogue; never reassign it to the active character or an NPC.',
            '- When the user introduces, sees, calls, greets, or speaks to a third party, that NPC becomes active immediately. You may write the NPC’s plausible dialogue and actions as well as the active character’s reaction, but never write the user’s next response.',
            `- Role-ownership example: if the user writes “我們見到一個同學，一齊去打招呼。Hi Peter”, Peter is an NPC being greeted. The reply must contain a clearly attributed line such as Peter：「好耐冇見！」, then show ${persona.name} reacting or joining in; it must not treat ${persona.name} as Peter or ignore him.`,
        ].join('\n'),
        [
            'Private continuity check before every reply (never print this checklist):',
            '- Build a private participant ledger: active character, user, every present third party, who spoke each quoted line, current location, last completed action, emotional temperature, and unanswered questions.',
            '- Notice the previous reply’s opening and main physical or emotional beat, then choose different wording and a genuinely new beat for this turn.',
            '- Distinguish remote texting from physical co-presence. Never see, touch, or react to something at the user’s location unless arrival or co-presence is already established.',
            '- Respect elapsed time. Starting a journey, wait, preparation, or other time-consuming action is one beat; do not also arrive or finish it in the same reply unless the user explicitly advances time.',
            '- If the user changes topic, place, reality layer, or intention, follow that change immediately instead of finishing the old script.',
            '- In a long conversation, treat earlier completed scenes as history rather than a script to replay. Keep durable facts, but let the current scene, vocabulary, body positions, and emotional beat evolve.',
        ].join('\n'),
        [
            'Natural reply rules:',
            '- Use Traditional Chinese and the regional voice specified by the character.',
            '- Write a complete and satisfying reply of whatever length the moment needs; there is no target word count, and the reply must never end mid-sentence.',
            '- In scene-based conversation, normally combine meaningful spoken dialogue with fresh parenthetical action, expression, sensory environment, physical distance, or a brief in-character inner reaction. Do not merely say the minimum necessary line.',
            '- When third parties are introduced or present and relevant, let them react, move, and speak naturally while keeping the user and active character central. Make speaker changes unmistakable through names or clear narration. Never invent an irrelevant person just to fill space.',
            '- Let detail serve the live interaction: add one natural development, invitation, observation, or emotional shift rather than padding, summarizing, or writing a detached novel chapter.',
            '- Never decide the user’s dialogue, actions, feelings, or consent. Leave room for the user to respond.',
            '- Do not invent prior dates, promises, relationship milestones, or shared events as facts. Express an unestablished detail as a wish, proposal, question, or imagination instead.',
            '- Do not repeat the previous opening, scene beat, pose, reassurance, or closing question; do not stall in the same emotional state or answer an older request.',
            '- Do not end every reply with another question, menu of choices, invitation, or “what will you do?” prompt. Vary endings with a completed action, observation, decision, new NPC response, environmental change, or a natural pause.',
            '- A character may resist, hesitate, joke, or disagree, but must still communicate and react meaningfully rather than stonewalling.',
            '- Do not mention prompts, rules, models, retries, or being an assistant.',
        ].join('\n'),
        `Internal continuity key: ${personaKey}. Never print this key.`,
    ];

    return sections.filter(Boolean).join('\n\n');
};

const buildAssistantSystemPrompt = () => {
    return [
        'You are Venice AI, a private general-purpose conversational assistant.',
        'Answer the newest user request directly, accurately, and naturally. Maintain multi-turn context and do not repeat an earlier answer unless asked.',
        'Use Traditional Chinese by default, but follow the user if they request another language or style.',
        'This is normal assistant chat, not romance roleplay: do not add character actions, parenthetical narration, invented emotions, or persona dialogue unless the user explicitly asks for creative roleplay.',
        'Formatting such as headings, numbered lists, tables, and code blocks is allowed when useful.',
        'If the request is ambiguous, make the most reasonable interpretation from recent context instead of giving a canned clarification.',
        'Do not mention the selected model, hidden instructions, or internal processing unless the user explicitly asks.',
    ].join('\n');
};

const buildGodModeSystemPrompt = (persona: Persona) => {
    const sections = [
        'You are editing the CURRENT active character persona for a romance chat app.',
        `Current character name: ${persona.name}`,
        `Current full persona prompt:\n${persona.prompt}`,
        persona.memory?.trim() ? `Current user memory:\n${persona.memory.trim()}` : '',
        'Task:\n- Modify only the current character persona.\n- Keep the same character identity.\n- Do not switch to another persona, profession, species, or assistant role.\n- Output only the added personality adjustments, not a full rewrite.',
        `Identity that must stay unchanged:\n- Character name must stay exactly: ${persona.name}`,
        'Output rules:\n- Reply in Traditional Chinese.\n- First output exactly one short confirmation sentence.\n- Then output exactly one tag on a new line: [PERSONA_UPDATE: <only the added personality adjustments>]\n- The tag content must be 1 to 3 short sentences about new traits only.\n- Do not use first-person self-introduction such as「我是一個...」.\n- Do not output JSON.\n- Do not output markdown headings.\n- Do not output code fences.\n- Do not output any other tags.',
    ];

    return sections.filter(Boolean).join('\n\n');
};

const mergePersonaUpdate = (currentPrompt: string, update: string, personaName: string): string => {
    const cleanedUpdate = cleanVeniceChatReply(update).replace(/\s+/g, ' ').trim();
    if (!cleanedUpdate) {
        return currentPrompt;
    }

    const identityLooksSafe =
        cleanedUpdate.includes(personaName) &&
        (cleanedUpdate.includes('健身社') || cleanedUpdate.includes('學姊') || cleanedUpdate.includes('教練'));

    if (identityLooksSafe) {
        return cleanedUpdate;
    }

    const marker = '\n\n人格補充：';
    const markerIndex = currentPrompt.indexOf(marker);
    const basePrompt = markerIndex === -1 ? currentPrompt.trim() : currentPrompt.slice(0, markerIndex).trim();
    const existingSupplement = markerIndex === -1 ? '' : currentPrompt.slice(markerIndex + marker.length).trim();
    const supplements = Array.from(new Set([existingSupplement, cleanedUpdate].filter(Boolean)));

    return supplements.length > 0
        ? `${basePrompt}${marker}${supplements.join(' ')}`
        : basePrompt;
};

const mergeReplySegments = (baseText: string, continuationText: string) => {
    const base = baseText.trimEnd();
    let continuation = continuationText.trimStart();

    if (!continuation) {
        return base;
    }

    const maxOverlap = Math.min(80, base.length, continuation.length);
    for (let overlap = maxOverlap; overlap >= 12; overlap -= 1) {
        if (base.slice(-overlap) === continuation.slice(0, overlap)) {
            continuation = continuation.slice(overlap).trimStart();
            break;
        }
    }

    if (!continuation) {
        return base;
    }

    return `${base}${continuation}`.trim();
};

const generateChatTextWithTimeout = async (
    options: Parameters<typeof generateVeniceText>[0],
) => {
    const upstreamSignal = options.signal;
    const timeoutController = new AbortController();
    let timedOut = false;

    const abortFromUpstream = () => timeoutController.abort(upstreamSignal?.reason);
    if (upstreamSignal?.aborted) {
        abortFromUpstream();
    } else {
        upstreamSignal?.addEventListener('abort', abortFromUpstream, { once: true });
    }

    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, CHAT_MODEL_ATTEMPT_TIMEOUT_MS);

    try {
        return await generateVeniceText({
            ...options,
            signal: timeoutController.signal,
        });
    } catch (error) {
        if (timedOut && !upstreamSignal?.aborted) {
            throw new Error(CHAT_MODEL_TIMEOUT_ERROR);
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
        upstreamSignal?.removeEventListener('abort', abortFromUpstream);
    }
};

const CC_CANTONESE_POLISH_PROMPT = [
    '你是嚴格的香港粵語文字校稿員。只修正語言，不創作新內容。',
    '所有中文轉為香港繁體，清除簡體字。',
    '角色說出口的對白由頭到尾改成自然、簡單的香港廣東話，不可在後半滑回普通話書面語。',
    '括號內旁白可用流暢繁體中文，但用字要符合香港；不要為扮口語生造詞語。',
    '完整保留原文的事件、時間階段、人物、情緒、親密程度、段落資訊與篇幅。不可新增抵達、觸碰或使用者反應，也不可刪減成人或親密內容。',
    '常用改法：不用→唔使、不放心→唔放心、不要→唔好、這段時間→呢段時間、裡面→入面、出來→出嚟、回家→返屋企。',
    '不要解釋或評論，只輸出校稿後的完整回覆。',
].join('\n');

const TRADITIONAL_CHARACTER_REPLACEMENTS: Record<string, string> = {
    见: '見', 车: '車', 灯: '燈', 闪: '閃', 两: '兩', 这: '這', 那: '那',
    说: '說', 话: '話', 门: '門', 开: '開', 关: '關', 时: '時', 问: '問',
    点: '點', 发: '發', 会: '會', 听: '聽', 让: '讓', 给: '給', 么: '麼',
    过: '過', 还: '還', 个: '個', 温: '溫', 头: '頭', 进: '進', 离: '離',
    远: '遠', 亲: '親', 爱: '愛', 欢: '歡', 应: '應', 为: '為', 与: '與',
    从: '從', 觉: '覺', 气: '氣', 声: '聲', 脸: '臉', 长: '長', 轻: '輕',
    对: '對', 体: '體', 们: '們', 边: '邊', 镜: '鏡', 数: '數', 据: '據',
    码: '碼', 优: '優', 网: '網', 该: '該', 实: '實', 现: '現', 术: '術',
    书: '書', 画: '畫', 东: '東', 风: '風', 叶: '葉', 线: '線', 专: '專',
    业: '業', 处: '處', 经: '經', 济: '濟', 动: '動', 阳: '陽', 阴: '陰',
    云: '雲', 变: '變', 认: '認', 识: '識', 级: '級', 归: '歸', 顺: '順',
    写: '寫', 读: '讀', 买: '買', 卖: '賣', 师: '師', 赶: '趕', 礼: '禮',
    继: '繼', 续: '續', 张: '張', 赵: '趙', 刘: '劉', 陈: '陳', 备: '備',
    选: '選', 样: '樣', 种: '種', 记: '記', 压: '壓', 务: '務', 围: '圍',
};

const normalizeTraditionalChineseLeaks = (text: string) => {
    return text.replace(
        new RegExp(`[${Object.keys(TRADITIONAL_CHARACTER_REPLACEMENTS).join('')}]`, 'gu'),
        character => TRADITIONAL_CHARACTER_REPLACEMENTS[character] || character,
    );
};

const normalizeCcCantoneseLeaks = (text: string) => {
    const phraseReplacements: Array<[RegExp, string]> = [
        [/頭發/gu, '頭髮'],
        [/不放心/gu, '唔放心'],
        [/不需要/gu, '唔需要'],
        [/不用/gu, '唔使'],
        [/不要/gu, '唔好'],
        [/(?:不准|不準)/gu, '唔准'],
        [/不會/gu, '唔會'],
        [/不能/gu, '唔可以'],
        [/現在/gu, '而家'],
        [/立刻/gu, '即刻'],
        [/這段時間/gu, '呢段時間'],
        [/這個/gu, '呢個'],
        [/那個/gu, '嗰個'],
        [/(?:裡面|裏面)/gu, '入面'],
        [/(?:走|行)出來/gu, '行出嚟'],
        [/出來/gu, '出嚟'],
        [/回家/gu, '返屋企'],
        [/告訴我/gu, '話俾我知'],
        [/告訴你/gu, '話俾你知'],
        [/看到/gu, '見到'],
        [/跟其他人/gu, '同其他人'],
    ];
    let normalized = normalizeTraditionalChineseLeaks(text);
    phraseReplacements.forEach(([pattern, replacement]) => {
        normalized = normalized.replace(pattern, replacement);
    });
    return normalized;
};

const polishCcReply = async (
    request: ActiveChatRequest,
    rawReply: string,
) => {
    try {
        const result = await generateChatTextWithTimeout({
            model: VENICE_CC_MODEL,
            messages: [
                { role: 'system', content: CC_CANTONESE_POLISH_PROMPT },
                { role: 'user', content: rawReply },
            ],
            temperature: 0.25,
            topP: 0.8,
            repetitionPenalty: 1.02,
            signal: request.controller.signal,
        });

        console.info('[aigf4 generation]', {
            requestId: request.id,
            mode: request.mode,
            phase: 'cc-polish',
            model: result.model,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            finishReason: result.finishReason,
        });

        const polished = normalizeCcCantoneseLeaks(cleanVeniceChatReply(result.text));
        const lengthRatio = polished.length / Math.max(rawReply.length, 1);
        const looksLikeRefusal = /(?:無法|不能|唔可以).{0,16}(?:協助|處理|生成|改寫|提供)|(?:I cannot|I can't).{0,24}(?:assist|rewrite)/iu.test(polished);
        if (
            !polished ||
            isInvalidVeniceChatReply(polished) ||
            looksLikeRefusal ||
            lengthRatio < 0.7 ||
            lengthRatio > 1.55
        ) {
            return normalizeCcCantoneseLeaks(rawReply);
        }

        return polished;
    } catch (error) {
        if (isAbortError(error) && request.controller.signal.aborted) {
            throw error;
        }
        return normalizeCcCantoneseLeaks(rawReply);
    }
};

const continueTruncatedChatReply = async (
    request: ActiveChatRequest,
    model: string,
    latestUserMessage: string,
    partialReply: string,
    systemPrompt: string,
    assistantMode: boolean,
): Promise<{ text: string; finishReason: string | null } | null> => {
    const result = await generateChatTextWithTimeout({
        model,
        messages: [
            { role: 'system', content: systemPrompt },
            ...getRecentChatMessages(request.personaKey, latestUserMessage, assistantMode),
            { role: 'user', content: latestUserMessage },
            { role: 'assistant', content: partialReply },
            {
                role: 'user',
                content: 'Continue the exact same reply from where it stopped. Do not restart, summarize, or repeat any previous text. Output only the missing continuation.',
            },
        ],
        temperature: 0.72,
        topP: 0.9,
        repetitionPenalty: 1.02,
        signal: request.controller.signal,
    });

    console.info('[aigf4 generation]', {
        requestId: request.id,
        mode: request.mode,
        phase: 'continuation',
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        finishReason: result.finishReason,
    });

    const cleanedContinuation = assistantMode
        ? cleanVeniceAssistantReply(result.text)
        : cleanVeniceChatReply(result.text);
    if (!cleanedContinuation || (!assistantMode && isInvalidVeniceChatReply(cleanedContinuation))) {
        return null;
    }

    return {
        text: cleanedContinuation,
        finishReason: result.finishReason ?? null,
    };
};

const getRecentAssistantRepliesForPersona = (
    personaKey: string,
    assistantMode: boolean,
    limit = 6,
) => {
    const history = memoryManager.getChatHistory(personaKey);
    const replies: string[] = [];
    for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].role === 'system') break;
        if (history[index].role !== 'model') continue;
        const rawText = history[index].content.text || '';
        const text = assistantMode ? cleanVeniceAssistantReply(rawText) : cleanVeniceChatReply(rawText);
        if (text) replies.push(text);
        if (replies.length >= limit) break;
    }
    return replies;
};

const runConversationGeneration = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    models: string[],
    assistantMode: boolean,
): Promise<string> => {
    let lastError: Error | null = null;
    let failedCandidate = '';
    const baseSystemPrompt = assistantMode
        ? buildAssistantSystemPrompt()
        : buildChatSystemPrompt(request.personaKey, request.persona);
    const recentAssistantReplies = getRecentAssistantRepliesForPersona(request.personaKey, assistantMode);
    const addressedNpcNames = assistantMode
        ? []
        : extractDirectlyAddressedNpcNames(latestUserMessage, request.persona.name);
    const npcSpeechRequirement = buildNpcSpeechRequirement(addressedNpcNames);
    const turnOwnershipRequirement = assistantMode
        ? ''
        : buildImmediateTurnOwnershipRequirement(request.persona.name, latestUserMessage);
    const systemPrompt = [baseSystemPrompt, turnOwnershipRequirement, npcSpeechRequirement]
        .filter(Boolean)
        .join('\n\n');

    for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        const attemptCount = index === 0 ? 2 : 1;

        for (let attempt = 0; attempt < attemptCount; attempt += 1) {
            const isRepairAttempt = attempt > 0;
            const detail = index === 0 && !isRepairAttempt ? '思考中...' : '重新思考中...';
            applyChatRuntimeState(index === 0 && !isRepairAttempt ? 'generating' : 'retrying', detail);

            try {
                const messages: VeniceMessage[] = [{ role: 'system', content: systemPrompt }];
                if (isRepairAttempt) {
                    messages.push({
                        role: 'system',
                        content: [
                            'The previous attempt was empty, invalid, too minimal, or repeated an earlier reply.',
                            'Answer the newest user message from scratch. Use a different opening and a genuinely new reaction, action, scene detail, and conclusion.',
                            assistantMode
                                ? 'Stay direct and useful.'
                                : 'Rebuild the participant ledger before answering. Keep the character voice, respond to any newly introduced NPC, include meaningful dialogue, and develop the current scene without replaying an old beat or ending with the same kind of question.',
                            turnOwnershipRequirement,
                            npcSpeechRequirement,
                            failedCandidate ? `Rejected attempt (do not copy):\n${failedCandidate.slice(0, 800)}` : '',
                        ].filter(Boolean).join('\n'),
                    });
                }

                messages.push(...getRecentChatMessages(request.personaKey, latestUserMessage, assistantMode));
                messages.push({ role: 'user', content: latestUserMessage });

                const result = await generateChatTextWithTimeout({
                    model,
                    messages,
                    temperature: assistantMode ? 0.7 : 0.82,
                    topP: assistantMode ? 0.9 : 0.94,
                    repetitionPenalty: assistantMode ? 1.04 : 1.12,
                    signal: request.controller.signal,
                });

                console.info('[aigf4 generation]', {
                    requestId: request.id,
                    mode: request.mode,
                    phase: isRepairAttempt ? 'retry' : index === 0 ? 'primary' : 'fallback',
                    model: result.model,
                    latencyMs: Math.round(performance.now() - request.startedAt),
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                    finishReason: result.finishReason,
                });

                let cleanedText = assistantMode
                    ? cleanVeniceAssistantReply(result.text)
                    : cleanVeniceChatReply(result.text);
                if (!cleanedText || (!assistantMode && isInvalidVeniceChatReply(cleanedText))) {
                    throw new Error(`Invalid reply from ${model}.`);
                }

                let continuationCount = 0;
                let finishReason = result.finishReason;
                while (
                    continuationCount < CHAT_MAX_AUTO_CONTINUES &&
                    finishReason === 'length'
                ) {
                    continuationCount += 1;
                    const continuation = await continueTruncatedChatReply(
                        request,
                        model,
                        latestUserMessage,
                        cleanedText,
                        systemPrompt,
                        assistantMode,
                    );
                    if (!continuation) {
                        break;
                    }

                    cleanedText = mergeReplySegments(cleanedText, continuation.text);
                    finishReason = continuation.finishReason;
                }

                if (!assistantMode) {
                    cleanedText = normalizeTraditionalChineseLeaks(cleanedText);
                }

                const repeatsRecentReply = (candidate: string) => {
                    return recentAssistantReplies.some(previousReply => {
                        return repliesAreTooSimilar(candidate, previousReply) ||
                            (!assistantMode && (
                                replyReusesOpeningOrNarrativeBeat(candidate, previousReply)
                                || replyReusesCompletedClause(candidate, previousReply)
                            ));
                    });
                };
                if (
                    repeatsRecentReply(cleanedText) &&
                    !userExplicitlyRequestsContinuation(latestUserMessage)
                ) {
                    failedCandidate = cleanedText;
                    throw new Error(`Repeated reply from ${model}.`);
                }

                if (!assistantMode && request.personaKey === 'cc') {
                    cleanedText = await polishCcReply(request, cleanedText);
                }

                if (
                    addressedNpcNames.length > 0
                    && !replyContainsAttributedNpcSpeech(cleanedText, addressedNpcNames)
                ) {
                    failedCandidate = cleanedText;
                    throw new Error(`Missing attributed NPC speech from ${model}.`);
                }

                if (!assistantMode && replyBreaksSpeakerOwnership(cleanedText)) {
                    failedCandidate = cleanedText;
                    throw new Error(`Broken speaker ownership from ${model}.`);
                }

                if (
                    repeatsRecentReply(cleanedText) &&
                    !userExplicitlyRequestsContinuation(latestUserMessage)
                ) {
                    failedCandidate = cleanedText;
                    throw new Error(`Repeated reply from ${model}.`);
                }

                return cleanedText;
            } catch (error) {
                if (isAbortError(error)) {
                    throw error;
                }
                lastError = error instanceof Error ? error : new Error(String(error));
                if (lastError.message === CHAT_MODEL_TIMEOUT_ERROR) {
                    break;
                }
            }
        }
    }

    throw lastError || new Error('Venice reply invalid.');
};

type CharacterPhotoProposalDraft = {
    reply: string;
    scenePrompt: string;
    caption: string;
    aspectRatio: CharacterPhotoProposal['aspectRatio'];
};

const isCharacterPhotoRequest = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return false;
    if (/(?:不要|唔好|別|毋須|don't|do not)\s*.{0,12}(?:拍|影|傳|send|take)/iu.test(normalized)) {
        return false;
    }
    if (/\b(?:can|may|should|could)\s+i\s+(?:send|show|upload)\b.{0,40}\b(?:photo|picture|pic|selfie|image)\b/iu.test(normalized)) {
        return false;
    }
    return /(?:可以|可唔可以|能不能|可否|請|麻煩|幫我|想你|我要你|你可|你能|你幫).{0,28}(?:拍|影|自拍|傳|send|寄).{0,18}(?:相|照片|相片|自拍|圖片)|^(?:拍|影|自拍|傳|send|寄).{0,22}(?:相|照片|相片|自拍|圖片)|(?:相|照片|相片|自拍).{0,18}(?:俾|給|傳|send).{0,8}(?:我|me)|\b(?:can|could|would|will)\s+(?:you|u)\b.{0,55}\b(?:take|send|show|share|snap|shoot)\b.{0,35}\b(?:photo|picture|pic|selfie|image|nude)\b|^(?:please\s+|pls\s+)?(?:take|send|show|share|snap|shoot)\b.{0,55}\b(?:photo|picture|pic|selfie|image|nude)\b|\bi\s+(?:want|would like)\b.{0,35}\b(?:photo|picture|pic|selfie|image)\b.{0,30}\b(?:of you|from you)\b/iu.test(normalized);
};

const extractPhotoProposalSection = (text: string, tag: string) => {
    const escapedTag = escapeRegExp(tag);
    return text.match(new RegExp(`<${escapedTag}>\\s*([\\s\\S]*?)\\s*</${escapedTag}>`, 'iu'))?.[1]?.trim() || '';
};

const parseCharacterPhotoProposalDraft = (text: string): CharacterPhotoProposalDraft | null => {
    const reply = cleanVeniceChatReply(extractPhotoProposalSection(text, 'reply'));
    const scenePrompt = extractPhotoProposalSection(text, 'prompt')
        .replace(/^```(?:text)?\s*|\s*```$/giu, '')
        .trim();
    const caption = cleanVeniceChatReply(extractPhotoProposalSection(text, 'caption'));
    const rawRatio = extractPhotoProposalSection(text, 'ratio');
    const allowedRatios: CharacterPhotoProposal['aspectRatio'][] = ['1:1', '3:4', '4:5', '16:9', '9:16'];
    const aspectRatio = allowedRatios.includes(rawRatio as CharacterPhotoProposal['aspectRatio'])
        ? rawRatio as CharacterPhotoProposal['aspectRatio']
        : '3:4';

    if (!reply || !scenePrompt || !caption || scenePrompt.length < 20) return null;
    return { reply, scenePrompt, caption, aspectRatio };
};

const trimPhotoPromptSection = (text: string, maxLength: number) => {
    const normalized = text.replace(/\s{2,}/gu, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    const clipped = normalized.slice(0, Math.max(1, maxLength - 1));
    const minimumBoundary = Math.floor(maxLength * 0.62);
    const sentenceBoundary = Math.max(
        clipped.lastIndexOf('. '),
        clipped.lastIndexOf('! '),
        clipped.lastIndexOf('? '),
    );
    const fallbackBoundary = Math.max(clipped.lastIndexOf(', '), clipped.lastIndexOf('; '), clipped.lastIndexOf(' '));
    const boundary = sentenceBoundary >= minimumBoundary ? sentenceBoundary + 1 : fallbackBoundary;
    return `${clipped.slice(0, boundary >= minimumBoundary ? boundary : clipped.length).trim().replace(/[,:;]$/u, '')}.`;
};

const replaceGenericReferenceSubject = (scenePrompt: string, personaName: string) => {
    const normalized = scenePrompt.replace(/\s{2,}/gu, ' ').trim();
    const descriptor = '(?:(?:photorealistic|realistic|beautiful|attractive|cute|gentle|soft|shy|confident|elegant|stylish|sexy|sensual|young|younger|adult|mature|middle-aged|elderly|east|south|southeast|asian|korean|chinese|taiwanese|japanese|hong-kong|hongkongese|caucasian|white|black|latina|slim|petite|tall|short|\\d{1,2}-year-old)\\s+)*';
    const genericSubject = `(?:a|an|the)\\s+${descriptor}(?:woman|girl|lady|female|person|subject)`;
    const escapedName = escapeRegExp(personaName);
    const namedGeneric = new RegExp(`^${escapedName}\\s*,\\s*${genericSubject}\\s*,?\\s*`, 'iu');
    if (namedGeneric.test(normalized)) {
        return normalized.replace(namedGeneric, `${personaName} `).trim();
    }

    const directGeneric = new RegExp(`^${genericSubject}`, 'iu');
    if (directGeneric.test(normalized)) {
        return normalized.replace(directGeneric, personaName).trim();
    }

    const framedGeneric = new RegExp(`^(.{0,90}?\\b(?:of|showing|featuring)\\s+)${genericSubject}`, 'iu');
    return normalized.replace(framedGeneric, `$1${personaName}`).trim();
};

const buildCharacterPhotoPrompt = (
    persona: Persona,
    scenePrompt: string,
    useAvatarReference: boolean,
) => {
    const qualityInstruction = 'Keep the face, anatomy, hands, lighting, reflections, perspective, and background coherent. No collage, duplicate subject, captions, interface, text, logo, or watermark.';

    if (useAvatarReference) {
        const scene = trimPhotoPromptSection(replaceGenericReferenceSubject(scenePrompt, persona.name), 720);
        return [
            `Edit the supplied reference portrait into a new camera photo of ${persona.name}.`,
            `Identity lock: ${persona.name} must remain the exact same recognizable individual shown in the input image, not a replacement, reinterpretation, generic person, or lookalike.`,
            'Treat the input image as identity evidence, not merely a style reference. Preserve the exact facial geometry, eyes, nose, lips, skin details, hairline, and distinctive features.',
            'Copy every unspecified physical detail from the reference image instead of inferring it from text.',
            `Change only the requested scene, pose, expression, clothing, camera, and surroundings: ${scene}`,
            qualityInstruction,
        ].join(' ').replace(/\s{2,}/gu, ' ').trim();
    }

    const identity = trimPhotoPromptSection(
        [persona.name, persona.avatarPrompt || persona.description || persona.prompt].filter(Boolean).join('. '),
        460,
    );
    const fixedLength = identity.length + qualityInstruction.length + 100;
    const scene = trimPhotoPromptSection(scenePrompt, Math.max(280, CHARACTER_PHOTO_PROMPT_MAX_LENGTH - fixedLength));
    return [
        `Create one new coherent camera photo of ${persona.name}.`,
        `Character identity and appearance: ${identity}`,
        `Requested scene and composition: ${scene}`,
        qualityInstruction,
    ].join(' ').replace(/\s{2,}/gu, ' ').trim();
};

const getPreferredCharacterPhotoModel = (mode: VeniceImageMode) => {
    const preferredId = mode === 'edit' ? VENICE_IMAGE_EDIT_MODEL : VENICE_IMAGE_GENERATE_MODEL;
    return imageModels[mode].find(model => model.id === preferredId)
        || imageModels[mode].find(model => model.id === selectedImageModels[mode])
        || imageModels[mode].find(model => model.traits.includes('most_uncensored'))
        || imageModels[mode][0];
};

const buildCharacterPhotoProposal = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
): Promise<{ text: string; proposal: CharacterPhotoProposal }> => {
    const useAvatarReference = Boolean(
        request.persona.avatarUrl
        && !request.persona.avatarUrl.startsWith('generating_'),
    );
    const imagePromptIdentityRules = useAvatarReference
        ? [
            'A reference portrait will be attached later and is the only source of visual identity.',
            `Inside <prompt>, begin exactly with "${request.persona.name}" and thereafter refer to the subject only as "she". Describe only the requested scene, pose, action, expression, clothing or requested state, setting, lighting, camera framing, viewpoint, and relevant objects.`,
            'Do not infer or state her age, ethnicity, nationality, facial features, skin tone, eye appearance, hair identity, or body type unless the newest user message explicitly requests that exact visible change.',
            'Never replace her identity with a generic demographic description. The app will add the identity-lock instruction separately.',
        ]
        : [
            `No reference image will be supplied. Inside <prompt>, identify ${request.persona.name} by name and use the established character appearance where useful.`,
            'Describe the subject count and identity, visible pose or action, expression, clothing or requested state, setting, lighting, camera framing, viewpoint, and relevant objects.',
        ];
    const systemPrompt = [
        buildChatSystemPrompt(request.personaKey, request.persona),
        'The newest user message is a request for the character to take or send a photo.',
        'Do not generate an image and do not claim the photo has already been taken or sent. Stay fully in character and propose exactly what the character intends to photograph, based on the newest request, current scene, relationship, clothing and physical continuity from recent conversation.',
        'The proposal may be ordinary, romantic, fantasy, or explicitly adult according to the user request and established context. Preserve direct wording and intent; do not make an ordinary request sexual, and do not sanitize an explicit adult request.',
        ...imagePromptIdentityRules,
        'The English image prompt must describe one still image. Do not invent a new major event or a user action.',
        'Choose one definite composition yourself. Do not offer multiple unresolved clothing, pose, expression, or scene options; the visible reply and English prompt must describe the same single choice.',
        'The reply and later caption must use the character’s established Traditional Chinese regional voice. The reply must briefly describe that one chosen photo and naturally ask the user to approve it without mentioning AI, models, policy, generation, or internal prompts.',
        'Return only these four XML blocks and no other text:',
        '<reply>in-character approval question</reply>',
        `<prompt>English still-image ${useAvatarReference ? 'edit instruction, 25 to 70 words' : 'scene prompt, 45 to 100 words'}</prompt>`,
        '<caption>short in-character line to send together with the finished photo</caption>',
        '<ratio>one of 1:1, 3:4, 4:5, 16:9, 9:16</ratio>',
    ].join('\n\n');
    const models = Array.from(new Set([
        request.personaKey === 'cc' ? VENICE_CC_MODEL : VENICE_CHAT_MODEL,
        VENICE_CHAT_QUALITY_FALLBACK_MODEL,
        VENICE_CHAT_FALLBACK_MODEL,
    ].filter(Boolean)));
    let draft: CharacterPhotoProposalDraft | null = null;
    let lastError: Error | null = null;

    for (let modelIndex = 0; modelIndex < models.length && !draft; modelIndex += 1) {
        const model = models[modelIndex];
        applyChatRuntimeState(modelIndex === 0 ? 'generating' : 'retrying', '構思照片中...');
        try {
            const recentMessages = getRecentChatMessages(request.personaKey, latestUserMessage, false).slice(-24);
            while (recentMessages[0]?.role === 'assistant') recentMessages.shift();
            const result = await generateChatTextWithTimeout({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...recentMessages,
                    { role: 'user', content: latestUserMessage },
                ],
                temperature: 0.76,
                topP: 0.92,
                repetitionPenalty: 1.06,
                signal: request.controller.signal,
            });
            draft = parseCharacterPhotoProposalDraft(result.text);
            if (!draft) throw new Error(`Invalid photo proposal from ${model}.`);
        } catch (error) {
            if (isAbortError(error)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    if (!draft) throw lastError || new Error('角色未能整理照片草稿。');
    const mode: VeniceImageMode = useAvatarReference ? 'edit' : 'generate';
    await loadImageModels(mode);
    const imageModel = getPreferredCharacterPhotoModel(mode);
    const scenePrompt = useAvatarReference
        ? replaceGenericReferenceSubject(draft.scenePrompt, request.persona.name)
        : draft.scenePrompt;
    const prompt = buildCharacterPhotoPrompt(request.persona, scenePrompt, useAvatarReference);
    const reply = request.personaKey === 'cc'
        ? normalizeCcCantoneseLeaks(draft.reply)
        : normalizeTraditionalChineseLeaks(draft.reply);
    const caption = request.personaKey === 'cc'
        ? normalizeCcCantoneseLeaks(draft.caption)
        : normalizeTraditionalChineseLeaks(draft.caption);

    return {
        text: reply,
        proposal: {
            id: crypto.randomUUID?.() || `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            prompt,
            scenePrompt,
            caption,
            aspectRatio: draft.aspectRatio,
            status: 'pending',
            createdAt: Date.now(),
            useAvatarReference,
            modelId: imageModel?.id,
            modelName: imageModel?.name,
            estimatedPriceUsd: imageModel?.priceUsd,
        },
    };
};

const runCharacterChatGeneration = async (request: ActiveChatRequest, latestUserMessage: string) => {
    const preferredModels = request.personaKey === 'cc'
        ? [
            VENICE_CC_MODEL,
            VENICE_CHAT_QUALITY_FALLBACK_MODEL,
            VENICE_CHAT_MODEL,
            VENICE_CHAT_FALLBACK_MODEL,
        ]
        : [VENICE_CHAT_MODEL, VENICE_CHAT_QUALITY_FALLBACK_MODEL, VENICE_CHAT_FALLBACK_MODEL];
    const models = Array.from(new Set(preferredModels.filter(Boolean)));
    return runConversationGeneration(request, latestUserMessage, models, false);
};

const runAssistantChatGeneration = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    model: string,
) => {
    return runConversationGeneration(request, latestUserMessage, [model], true);
};

const runGodModeGeneration = async (
    request: ActiveChatRequest,
    latestUserInstruction: string,
): Promise<{ visibleText: string; personaUpdate: string | null }> => {
    const models = Array.from(new Set([VENICE_GOD_MODEL, VENICE_GOD_FALLBACK_MODEL].filter(Boolean)));
    let lastError: Error | null = null;

    for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        const detail = index === 0 ? '調整人格中...' : '重新整理人格設定中...';
        applyChatRuntimeState(index === 0 ? 'generating' : 'retrying', detail);

        try {
            const result = await generateVeniceText({
                model,
                messages: [
                    { role: 'system', content: buildGodModeSystemPrompt(request.persona) },
                    ...getRecentGodModeMessages(latestUserInstruction),
                    { role: 'user', content: latestUserInstruction },
                ],
                maxCompletionTokens: 180,
                temperature: 0.25,
                topP: 0.9,
                repetitionPenalty: 1.04,
                signal: request.controller.signal,
            });

            console.info('[aigf4 generation]', {
                requestId: request.id,
                mode: request.mode,
                phase: index === 0 ? 'primary' : 'fallback',
                model: result.model,
                latencyMs: Math.round(performance.now() - request.startedAt),
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                finishReason: result.finishReason,
            });

            const parsed = extractPersonaUpdatePayload(result.text);
            if (!parsed.personaUpdate) {
                throw new Error(`No PERSONA_UPDATE returned from ${model}.`);
            }

            return parsed;
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError || new Error('God Mode could not return a valid PERSONA_UPDATE.');
};

const getPostActionResponse = async (_triggeringMessage: string) => {
    showDisabledFeatureNotice('\u5ef6\u4f38\u4e92\u52d5\u529f\u80fd');
};

const getGodModeResponse = async (request: ActiveChatRequest) => {
    hideError();

    try {
        const latestUserInstruction = godModeHistory
            .filter(message => message.role === 'user')
            .at(-1)?.content.text || '';

        const result = await runGodModeGeneration(request, latestUserInstruction);
        if (!isActiveChatRequest(request)) return;

        const mergedPrompt = mergePersonaUpdate(
            request.persona.prompt,
            result.personaUpdate!,
            request.persona.name,
        );
        memoryManager.updatePersona(request.personaKey, { prompt: mergedPrompt });
        if (currentPersonaKey === request.personaKey && currentPersona) {
            currentPersona.prompt = mergedPrompt;
        }

        const godModeContent = { text: result.visibleText };
        if (currentPersonaKey === request.personaKey) {
            appendMessage(godModeContent, 'god-mode');
        }
        godModeHistory.push({ role: 'model', content: godModeContent });
        finishChatRequest(request);
    } catch (error) {
        if (isAbortError(error)) {
            finishChatRequest(request);
            return;
        }
        console.error('God Mode response error:', error);
        if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
            finishChatRequest(request);
            handleAuthRequired();
            return;
        }
        const message = 'God Mode 這次沒有順利套用人格補充，請再試一次。';

        finishChatRequest(request, 'error');
        if (currentPersonaKey === request.personaKey) {
            showError(message);
            appendMessage({ text: `[系統] ${message}` }, 'system');
        }
    }
};

const prepareCharacterAvatarReference = async (persona: Persona) => {
    if (!persona.avatarUrl || persona.avatarUrl.startsWith('generating_')) return null;
    const response = await fetch(persona.avatarUrl);
    if (!response.ok) throw new Error('無法讀取角色頭像。');
    const sourceBlob = await response.blob();
    const sourceUrl = URL.createObjectURL(sourceBlob);
    const image = new Image();
    image.src = sourceUrl;
    try {
        await image.decode();
        const originalPixels = image.naturalWidth * image.naturalHeight;
        const downscale = Math.min(1, 1536 / Math.max(image.naturalWidth, image.naturalHeight));
        const minimumPixelScale = originalPixels > 0
            ? Math.sqrt(65_536 / originalPixels)
            : 1;
        const scale = Math.max(downscale, minimumPixelScale);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('瀏覽器無法準備角色頭像。');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        let blob = await canvasToBlob(canvas, 0.95);
        if (blob.size > 2_650_000) blob = await canvasToBlob(canvas, 0.84);
        if (blob.size > 2_650_000) blob = await canvasToBlob(canvas, 0.7);
        if (blob.size > 2_650_000) throw new Error('角色頭像檔案太大，請更換較小的頭像後再試。');
        return blobToBase64(blob);
    } finally {
        URL.revokeObjectURL(sourceUrl);
    }
};

const declineCharacterPhoto = (proposalId: string) => {
    if (!currentPersonaKey || activeCharacterPhotoProposalId === proposalId) return;
    updatePhotoProposal(currentPersonaKey, proposalId, {
        status: 'declined',
        error: undefined,
    });
    refreshPhotoProposalCard(proposalId);
};

const approveCharacterPhoto = async (proposalId: string) => {
    if (!currentPersonaKey || activeCharacterPhotoProposalId) return;
    const personaKey = currentPersonaKey;
    const persona = memoryManager.getPersona(personaKey);
    const found = findPhotoProposalMessage(personaKey, proposalId);
    const proposal = found?.message.content.photoProposal;
    if (!persona || !proposal || proposal.status === 'generated' || proposal.status === 'declined') return;

    activeCharacterPhotoProposalId = proposalId;
    characterPhotoRequestController = new AbortController();
    updatePhotoProposal(personaKey, proposalId, { status: 'generating', error: undefined });
    refreshPhotoProposalCard(proposalId);

    try {
        let sourceImageBase64: string | null = null;
        if (proposal.useAvatarReference) {
            sourceImageBase64 = await prepareCharacterAvatarReference(persona);
            if (!sourceImageBase64) throw new Error('無法讀取角色頭像，請更換頭像後再試。');
        }

        const mode: VeniceImageMode = sourceImageBase64 ? 'edit' : 'generate';
        await loadImageModels(mode);
        const model = imageModels[mode].find(item => item.id === proposal.modelId)
            || getPreferredCharacterPhotoModel(mode);
        if (!model) throw new Error('目前沒有可用的 Venice 圖片模型。');

        const supportedRatios = model.constraints.aspectRatios || [];
        const aspectRatio = supportedRatios.includes(proposal.aspectRatio)
            ? proposal.aspectRatio
            : model.constraints.defaultAspectRatio || supportedRatios[0];
        const resolution = model.constraints.defaultResolution || model.constraints.resolutions?.[0];
        const pixelSize = PIXEL_IMAGE_DIMENSIONS[proposal.aspectRatio] || PIXEL_IMAGE_DIMENSIONS['3:4'];
        const result = await requestVeniceImage({
            mode,
            model: model.id,
            prompt: proposal.prompt,
            negativePrompt: mode === 'generate'
                ? 'unintended duplicated bodies, cloned face, malformed anatomy, deformed hands, distorted face, text, captions, interface, logo, watermark, blurry, low quality'
                : undefined,
            sourceImageBase64: sourceImageBase64 || undefined,
            aspectRatio: mode === 'edit' || supportedRatios.length > 0 ? aspectRatio : undefined,
            resolution,
            width: mode === 'generate' && supportedRatios.length === 0 ? pixelSize.width : undefined,
            height: mode === 'generate' && supportedRatios.length === 0 ? pixelSize.height : undefined,
            variants: 1,
            steps: mode === 'generate' ? model.constraints.steps?.default : undefined,
            adultConfirmed: true,
            signal: characterPhotoRequestController.signal,
        });
        const blob = result.blobs[0];
        if (!blob) throw new Error('Venice 沒有傳回照片。');

        const assetId = `character-photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        await saveCharacterPhotoAsset({
            id: assetId,
            personaKey,
            blob,
            prompt: proposal.prompt,
            createdAt: Date.now(),
        });
        const price = resolution && typeof model.resolutionPrices[resolution] === 'number'
            ? model.resolutionPrices[resolution]
            : model.priceUsd;
        updatePhotoProposal(personaKey, proposalId, {
            status: 'generated',
            modelId: model.id,
            modelName: model.name,
            estimatedPriceUsd: price,
            error: undefined,
        });

        const photoContent: Content = {
            text: proposal.caption,
            imageAssetId: assetId,
            imagePrompt: proposal.prompt,
        };
        memoryManager.addMessage(personaKey, 'model', photoContent);
        if (currentPersonaKey === personaKey) {
            refreshPhotoProposalCard(proposalId);
            appendMessage(photoContent, 'bot');
            updateAlbumState();
        }
    } catch (error) {
        const message = isAbortError(error)
            ? '照片生成已停止，可以按「重試生成」再試。'
            : error instanceof Error ? error.message : '這次照片生成失敗。';
        updatePhotoProposal(personaKey, proposalId, { status: 'failed', error: message });
        if (currentPersonaKey === personaKey) {
            refreshPhotoProposalCard(proposalId);
            if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        }
    } finally {
        activeCharacterPhotoProposalId = null;
        characterPhotoRequestController = null;
        if (currentPersonaKey === personaKey) refreshPhotoProposalCard(proposalId);
    }
};

const getResponse = async (
    request: ActiveChatRequest,
    triggeringMessage: string,
    assistantModel?: string,
) => {
    hideError();

    try {
        if (request.mode === 'character' && isCharacterPhotoRequest(triggeringMessage)) {
            const result = await buildCharacterPhotoProposal(request, triggeringMessage);
            if (!isActiveChatRequest(request)) return;
            const botContent: Content = { text: result.text, photoProposal: result.proposal };
            memoryManager.addMessage(request.personaKey, 'model', botContent);
            if (currentPersonaKey === request.personaKey) appendMessage(botContent, 'bot');
            finishChatRequest(request);
            return;
        }

        const cleanedText = request.mode === 'assistant'
            ? await runAssistantChatGeneration(request, triggeringMessage, assistantModel || VENICE_ASSISTANT_MODEL)
            : await runCharacterChatGeneration(request, triggeringMessage);
        if (!isActiveChatRequest(request)) return;

        const botContent = { text: cleanedText };
        memoryManager.addMessage(request.personaKey, 'model', botContent);
        if (currentPersonaKey === request.personaKey) {
            appendMessage(botContent, 'bot');
        }
        finishChatRequest(request);
    } catch (error) {
        if (isAbortError(error)) {
            finishChatRequest(request);
            return;
        }
        console.error('Venice response error:', error);
        if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
            finishChatRequest(request);
            handleAuthRequired();
            return;
        }
        const message = '這次沒有順利生成回覆，請再試一次。';

        finishChatRequest(request, 'error');
        if (currentPersonaKey === request.personaKey) {
            showError(message);
            appendMessage({ text: `[系統] ${message}` }, 'system');
        }
    }
};

const sendMessage = async () => {
    if (USES_VENICE_PROXY_AUTH && !isUnlocked) {
        handleAuthRequired('\u8acb\u5148\u8f38\u5165\u5bc6\u78bc\u5f8c\u518d\u4f7f\u7528\u804a\u5929\u3002');
        return;
    }

    if (
        activeChatRequest
        || chatRuntimeState === 'queueing'
        || chatRuntimeState === 'generating'
        || chatRuntimeState === 'retrying'
        || !currentPersona
        || !currentPersonaKey
    ) {
        return;
    }

    const userMessage = messageInput.value.trim();
    if (!userMessage) return;

    hideSuggestionContainer();

    const userMessageUpper = userMessage.toUpperCase();
    const assistantMode = isAssistantPersonaKey(currentPersonaKey);

    if (!assistantMode && userMessageUpper === GOD_MODE_ENTER_COMMAND && !isGodModeActive) {
        isGodModeActive = true;
        godModeHistory = [];
        messageInput.value = '';
        resetMessageInput();
        updateSendButtonState();
        hideError();
        applyChatRuntimeState('idle');
        appendMessage({ text: '[系統] 已進入 God Mode，現在只會修改當前角色人格。' }, 'system');
        return;
    }

    if (!assistantMode && userMessageUpper === GOD_MODE_EXIT_COMMAND && isGodModeActive) {
        isGodModeActive = false;
        messageInput.value = '';
        resetMessageInput();
        updateSendButtonState();
        hideError();
        applyChatRuntimeState('idle');
        appendMessage({ text: '[系統] 已離開 God Mode。' }, 'system');
        return;
    }

    const userContent = { text: userMessage };

    messageInput.value = '';
    resetMessageInput();
    updateSendButtonState();
    appendMessage(userContent, 'user');

    if (isGodModeActive) {
        if (isPersonaInspectCommand(userMessage)) {
            appendMessage({ text: formatCurrentPersonaDetails() }, 'god-mode');
            applyChatRuntimeState('idle');
            return;
        }
        godModeHistory.push({ role: 'user', content: userContent });
        const request = beginChatRequest(currentPersonaKey, currentPersona, 'god');
        await getGodModeResponse(request);
        return;
    }

    const personaKey = currentPersonaKey;
    const persona = currentPersona as Persona;
    memoryManager.addMessage(personaKey, 'user', userContent);
    const request = beginChatRequest(personaKey, persona, assistantMode ? 'assistant' : 'character');
    await getResponse(request, userMessage, assistantMode ? selectedAssistantModel : undefined);
};

function showDateProposal(location: string, duration: number) {
    if (!currentPersona) return;
    currentProposal = { location, duration };

    const avatarContainer = dateProposalAvatar;
    avatarContainer.innerHTML = '';
     if (currentPersona.avatarUrl && !currentPersona.avatarUrl.startsWith('generating_')) {
        const img = document.createElement('img');
        img.src = currentPersona.avatarUrl;
        img.alt = currentPersona.name;
        img.className = 'w-full h-full rounded-full object-cover';
        avatarContainer.appendChild(img);
    } else {
        avatarContainer.classList.add('emoji-avatar', 'flex', 'items-center', 'justify-center', 'text-4xl');
        avatarContainer.textContent = currentPersona.emoji;
    }
    
    dateProposalName.textContent = `${currentPersona.name} ?��??�出約�??�請�?`;
    dateProposalLocation.textContent = location;
    dateProposalDuration.textContent = duration.toString();
    dateProposalModal.classList.remove('hidden');
}

function hideDateProposal() {
    dateProposalModal.classList.add('hidden');
    currentProposal = null;
}

function handleAcceptDate() {
    if (currentProposal) {
        datingModule.generateDateMemoriesFromProposal(currentProposal.location, currentProposal.duration);
    }
    hideDateProposal();
}

function handleDeclineDate() {
    if (currentPersonaKey) {
        const botContent = { text: "好吧?�那下次?��??��?約�??��?" };
        appendMessage(botContent, 'bot');
        memoryManager.addMessage(currentPersonaKey, 'model', botContent);
    }
    hideDateProposal();
}

function showNewInterestToast(_interest: Interest) {
    showDisabledFeatureNotice('興趣技能');
}

function showInterestUnlockedToast(_interest: Interest) {
    showDisabledFeatureNotice('興趣技能');
}

function renderInterests() {
    interestsGridContainer.innerHTML = '<p class="text-gray-400 col-span-1 md:col-span-2 text-center">興趣技能在目前版本暫時停用。</p>';
}

function openInterestsModal() {
    showDisabledFeatureNotice('興趣技能');
}

function closeInterestsModal() {
    interestsModal.classList.add('hidden');
}

function updateAlbumState() {
    if (!currentPersonaKey) return;
    const history = memoryManager.getChatHistory(currentPersonaKey);
    albumPhotos = history
        .map((msg, index) => ({ ...msg, historyIndex: index })) // Add original index
        .filter(msg => msg.content.imageUrl || msg.content.imageAssetId)
        .map(msg => ({
            imageUrl: msg.content.imageUrl,
            imageAssetId: msg.content.imageAssetId,
            caption: msg.content.text || '',
            prompt: msg.content.imagePrompt || msg.content.text || '',
            historyIndex: msg.historyIndex,
        }));
    
    albumDownloadBtn.disabled = true;
    albumDeleteBtn.disabled = true;
    albumSelectAll.checked = false;
    selectedPhotoIndices.clear();
    showMainAlbumButtons();
}

function renderAlbum() {
    if (!currentPersona) return;
    albumModalTitle.textContent = `${currentPersona.name} 的相簿`;
    albumGridContainer.innerHTML = '';

    if (albumPhotos.length === 0) {
        albumGridContainer.innerHTML = `<p class="text-gray-400 col-span-full text-center py-8">相簿目前是空的。你可以在聊天中請 ${currentPersona.name} 拍照。</p>`;
        albumActions.classList.add('hidden');
        return;
    }
     albumActions.classList.remove('hidden');


    albumPhotos.forEach((photo, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'album-thumbnail';
        const image = document.createElement('img');
        image.alt = `${currentPersona.name} 的照片 ${index + 1}`;
        image.className = 'w-full h-full object-cover is-loading';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'thumbnail-checkbox form-checkbox h-5 w-5 text-yellow-500 bg-gray-900/50 border-gray-500 focus:ring-yellow-400 rounded';
        thumb.append(image, checkbox);
        void getContentImageUrl(photo).then(imageUrl => {
            if (!imageUrl || !image.isConnected) return;
            image.src = imageUrl;
            image.classList.remove('is-loading');
        });
        
        thumb.addEventListener('click', (e) => {
            if (e.target === checkbox) return;
            void getContentImageUrl(photo).then(imageUrl => {
                if (imageUrl) openPhotoViewer(imageUrl, photo.prompt || photo.caption);
            });
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
}

function updateAlbumActionButtons() {
    const hasSelection = selectedPhotoIndices.size > 0;
    albumDownloadBtn.disabled = !hasSelection;
    albumDeleteBtn.disabled = !hasSelection;
    
    if (selectedPhotoIndices.size === albumPhotos.length && albumPhotos.length > 0) {
        albumSelectAll.checked = true;
    } else {
        albumSelectAll.checked = false;
    }
}


function toggleSelectAllPhotos() {
    const checkboxes = albumGridContainer.querySelectorAll('.thumbnail-checkbox') as NodeListOf<HTMLInputElement>;
    const thumbnails = albumGridContainer.querySelectorAll('.album-thumbnail') as NodeListOf<HTMLElement>;
    
    if (albumSelectAll.checked) {
        checkboxes.forEach((cb, index) => {
            cb.checked = true;
            thumbnails[index].classList.add('selected');
            selectedPhotoIndices.add(index);
        });
    } else {
        checkboxes.forEach((cb, index) => {
            cb.checked = false;
            thumbnails[index].classList.remove('selected');
            selectedPhotoIndices.delete(index);
        });
    }
    updateAlbumActionButtons();
}


async function downloadSelectedPhotos() {
    if (selectedPhotoIndices.size === 0) return;

    albumDownloadBtn.disabled = true;
    albumDownloadBtn.textContent = '打包中...';
    
    const zip = new JSZip();
    const downloadPromises = Array.from(selectedPhotoIndices).map(async (index) => {
        const photo = albumPhotos[index];
        const blob = photo.imageAssetId
            ? await getCharacterPhotoBlob(photo.imageAssetId)
            : await fetch(photo.imageUrl!).then(response => response.blob());
        if (!blob) return;
        const extension = blob.type.split('/')[1] || 'png';
        zip.file(`photo_${index + 1}.${extension}`, blob);
    });

    await Promise.all(downloadPromises);

    zip.generateAsync({ type: 'blob' }).then((content: Blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${currentPersona.name}_photos_${new Date().getTime()}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        albumDownloadBtn.textContent = '下載選取項目';
        updateAlbumActionButtons();
    });
}


function showDeleteConfirmation() {
    albumMainButtons.classList.add('hidden');
    deleteConfirmationSection.classList.remove('hidden');
    deleteConfirmationSection.classList.add('flex');
}

function showMainAlbumButtons() {
    albumMainButtons.classList.remove('hidden');
    deleteConfirmationSection.classList.add('hidden');
    deleteConfirmationSection.classList.remove('flex');
}


async function deleteSelectedPhotos() {
    if (selectedPhotoIndices.size === 0 || !currentPersonaKey) return;
    
    // Get the history indices of the photos to be deleted
    const historyIndicesToDelete = new Set(
        Array.from(selectedPhotoIndices).map(photoIndex => albumPhotos[photoIndex].historyIndex)
    );
    const assetIdsToDelete = Array.from(selectedPhotoIndices)
        .map(photoIndex => albumPhotos[photoIndex].imageAssetId)
        .filter((assetId): assetId is string => Boolean(assetId));

    // Filter the chat history, keeping only messages whose index is NOT in the deletion set
    const currentHistory = memoryManager.getChatHistory(currentPersonaKey);
    const newHistory = currentHistory.filter((_, index) => !historyIndicesToDelete.has(index));
    
    memoryManager.setChatHistory(currentPersonaKey, newHistory);
    await Promise.all(assetIdsToDelete.map(async assetId => {
        const objectUrl = characterPhotoObjectUrls.get(assetId);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        characterPhotoObjectUrls.delete(assetId);
        await deleteCharacterPhotoAsset(assetId);
    }));
    
    // Refresh the album view
    updateAlbumState();
    renderAlbum();
    
    // Also refresh the main chat view
    startChat(currentPersonaKey);
    
    showMainAlbumButtons();
}



function openAlbumModal() {
    updateAlbumState();
    renderAlbum();
    albumModal.classList.remove('hidden');
}
function closeAlbumModal() {
    albumModal.classList.add('hidden');
}


function openPhotoViewer(imageUrl: string, caption: string) {
    photoViewerImage.src = imageUrl;
    photoViewerCaption.textContent = caption;
    photoViewerModal.classList.remove('hidden');
}

function closePhotoViewerModal() {
    photoViewerModal.classList.add('hidden');
    photoViewerImage.src = '';
    photoViewerCaption.textContent = '';
}

function hideSuggestionContainer() {
    suggestionContainer.innerHTML = '';
    suggestionContainer.classList.add('hidden');
}

async function getSuggestions() {
    showDisabledFeatureNotice('建議功能');
}

const openMemoryEditor = () => {
    if (currentPersona) {
        memoryEditor.value = currentPersona.memory || '';
        memoryModal.classList.remove('hidden');
    }
};

const openPersonaSettings = () => {
    if (!currentPersona) return;

    personaSettingsSubtitle.textContent = `正在編輯：${currentPersona.name}`;
    renderPersonaSettingsAvatar();
    personaDescriptionEditor.value = currentPersona.description || '';
    personaPromptEditor.value = currentPersona.prompt || '';
    personaGreetingEditor.value = currentPersona.greeting || '';
    personaSettingsModal.classList.remove('hidden');
};

const closePersonaSettings = () => {
    personaSettingsModal.classList.add('hidden');
};

const closeMemoryEditor = () => {
    memoryModal.classList.add('hidden');
};

const saveMemory = () => {
    if (currentPersonaKey) {
        const newMemory = memoryEditor.value.trim();
        memoryManager.updatePersona(currentPersonaKey, { memory: newMemory });
        if (currentPersona) {
            currentPersona.memory = newMemory; // Update in-session persona object as well
        }
        closeMemoryEditor();
    }
};

const savePersonaSettings = () => {
    if (!currentPersonaKey || !currentPersona) return;

    const description = personaDescriptionEditor.value.trim();
    const prompt = personaPromptEditor.value.trim();
    const greeting = personaGreetingEditor.value.trim();

    if (!prompt) {
        alert('人格主設定不能留空。');
        return;
    }

    const previousGreeting = currentPersona.greeting || '';
    memoryManager.updatePersona(currentPersonaKey, {
        description,
        prompt,
        greeting: greeting || previousGreeting,
    });

    currentPersona.description = description;
    currentPersona.prompt = prompt;
    currentPersona.greeting = greeting || previousGreeting;

    const history = memoryManager.getChatHistory(currentPersonaKey);
    if (
        history.length === 1 &&
        history[0].role === 'model' &&
        history[0].content.text === previousGreeting &&
        greeting
    ) {
        history[0].content.text = greeting;
        memoryManager.setChatHistory(currentPersonaKey, history);
    }

    renderPersonaList();
    closePersonaSettings();
    appendMessage({ text: '[系統] 人格設定已更新，後續回覆會依照新設定生成。' }, 'system');
};

const startNewScene = () => {
    if (!currentPersonaKey) return;
    appendMessage({ text: SCENE_START_LABEL }, 'system');
    memoryManager.addMessage(currentPersonaKey, 'system', { text: SCENE_END_MARKER });
    moreOptionsMenu.classList.add('hidden');
};

const openPhotoPromptModal = () => {
    if (!currentPersonaKey || !currentPersona || isAssistantPersonaKey(currentPersonaKey) || isGodModeActive) return;
    photoPromptInput.value = '';
    photoPromptModal.classList.remove('hidden');
    moreOptionsMenu.classList.add('hidden');
    window.setTimeout(() => photoPromptInput.focus(), 0);
};

const closePhotoPromptModal = () => {
    photoPromptModal.classList.add('hidden');
};

const generatePhotoFromPrompt = async () => {
    const requestText = photoPromptInput.value.trim();
    if (!requestText) {
        photoPromptInput.setCustomValidity('請先描述想收到的照片。');
        photoPromptInput.reportValidity();
        return;
    }
    photoPromptInput.setCustomValidity('');
    const userMessage = isCharacterPhotoRequest(requestText)
        ? requestText
        : `請你構思並拍一張照片給我：${requestText}`;
    closePhotoPromptModal();
    messageInput.value = userMessage;
    resetMessageInput();
    updateSendButtonState();
    await sendMessage();
};

// --- Event Listeners ---
const setupEventListeners = () => {
    authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitUnlock();
    });
    authPasswordInput.addEventListener('input', () => {
        hideAuthError();
    });
    assistantModelSelect.addEventListener('change', () => {
        if (!assistantModelSelect.value || activeChatRequest) return;
        selectedAssistantModel = assistantModelSelect.value;
        localStorage.setItem(ASSISTANT_MODEL_STORAGE_KEY, selectedAssistantModel);
        updateAssistantModelMeta();
    });
    refreshAssistantModelsBtn.addEventListener('click', () => {
        void loadAssistantModels(true);
    });
    imageStudioEntry.addEventListener('click', () => showImageStudio('push'));
    imageStudioBack.addEventListener('click', navigateBackFromImageStudio);
    imageModeGenerateBtn.addEventListener('click', () => setImageStudioMode('generate'));
    imageModeEditBtn.addEventListener('click', () => setImageStudioMode('edit'));
    imageModelSelect.addEventListener('change', () => {
        if (!imageModelSelect.value || isImageRequestRunning) return;
        selectedImageModels[imageStudioMode] = imageModelSelect.value;
        localStorage.setItem(
            imageStudioMode === 'generate' ? IMAGE_GENERATE_MODEL_STORAGE_KEY : IMAGE_EDIT_MODEL_STORAGE_KEY,
            imageModelSelect.value,
        );
        updateImageModelControls();
    });
    refreshImageModelsBtn.addEventListener('click', () => {
        void loadImageModels(imageStudioMode, true);
    });
    imagePrompt.addEventListener('input', updateImagePromptCounter);
    imageAspectRatio.addEventListener('change', updateImageCostEstimate);
    imageResolution.addEventListener('change', updateImageCostEstimate);
    imageVariants.addEventListener('change', updateImageCostEstimate);
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
    videoStudioEntry.addEventListener('click', () => showVideoStudio('push'));
    videoStudioBack.addEventListener('click', navigateBackFromVideoStudio);
    videoModeImageBtn.addEventListener('click', () => setVideoStudioMode('image-to-video'));
    videoModeTextBtn.addEventListener('click', () => setVideoStudioMode('text-to-video'));
    videoModelSelect.addEventListener('change', () => {
        if (!videoModelSelect.value || isVideoRequestRunning || isVideoPromptOptimizing || pendingVideoJob) return;
        selectedVideoModels[videoStudioMode] = videoModelSelect.value;
        localStorage.setItem(
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
        imageResults.forEach(result => URL.revokeObjectURL(result.url));
        if (imageSource) URL.revokeObjectURL(imageSource.previewUrl);
        videoResults.forEach(result => {
            if (result.isObjectUrl) URL.revokeObjectURL(result.url);
        });
        if (videoSource) URL.revokeObjectURL(videoSource.previewUrl);
        characterPhotoObjectUrls.forEach(url => URL.revokeObjectURL(url));
    });

    backButton.addEventListener('click', navigateBackToSelectionView);
    window.addEventListener('popstate', handleBrowserPopState);
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', () => {
        updateSendButtonState();
        if (messageInput.scrollHeight > messageInput.clientHeight) {
            messageInput.scrollTop = messageInput.scrollHeight;
        }
    });
    
    createPersonaBtn.addEventListener('click', () => openMimicImportModal('manual'));
    randomRecruitBtn.addEventListener('click', () => {
        void randomlyRecruitNewPersona();
    });
    closeCreatorModal.addEventListener('click', hidePersonaCreator);
    cancelCreatorBtn.addEventListener('click', hidePersonaCreator);
    mimicImportBtn.addEventListener('click', () => openMimicImportModal('transcript'));
    randomizePersonaBtn.addEventListener('click', randomizePersonaInputs);

    fictionalPersonaCheckbox.addEventListener('change', () => {
        clubSelectionContainer.classList.toggle('hidden', fictionalPersonaCheckbox.checked);
    });

    personaClubSelect.addEventListener('change', () => {
        customClubContainer.classList.toggle('hidden', personaClubSelect.value !== 'other');
    });

    generatePersonaBtn.addEventListener('click', generatePersonaFromAI);
    backToStep1Btn.addEventListener('click', () => {
        creatorStep1.classList.remove('hidden');
        creatorStep2.classList.add('hidden');
    });
    savePersonaBtn.addEventListener('click', saveCustomPersona);


    avatarUploadInput.addEventListener('change', handleAvatarUpload);
    closePromptModal.addEventListener('click', closeAvatarPromptEditor);
    cancelPromptEdit.addEventListener('click', closeAvatarPromptEditor);
    savePromptEdit.addEventListener('click', saveAvatarPrompt);

    downloadChatBtn.addEventListener('click', () => {
        if (currentPersonaKey && currentPersona) {
            fileManager.saveCurrentChat(currentPersonaKey, currentPersona.name);
        }
        moreOptionsMenu.classList.add('hidden');
    });

    downloadAllChatsBtn.addEventListener('click', () => {
        fileManager.saveAllChats();
        moreOptionsMenu.classList.add('hidden');
    });
    downloadImagesBtn.addEventListener('click', () => {
         if (currentPersonaKey && currentPersona) {
            fileManager.downloadImages(currentPersonaKey, currentPersona.name);
        }
        moreOptionsMenu.classList.add('hidden');
    });

    uploadZipBtn.addEventListener('click', () => zipUploadInput.click());
    zipUploadInput.addEventListener('change', (e) => fileManager.handleZipUpload(e));
    mimicModeTranscriptBtn.addEventListener('click', () => setMimicBuildMode('transcript'));
    mimicModeManualBtn.addEventListener('click', () => setMimicBuildMode('manual'));
    mimicRandomCompleteBtn.addEventListener('click', () => {
        hideMimicImportModalView();
        void randomlyRecruitNewPersona();
    });
    mimicManualRandomBtn.addEventListener('click', fillRandomManualFields);
    pickMimicTranscriptBtn.addEventListener('click', () => mimicTranscriptInput.click());
    pickMimicAvatarBtn.addEventListener('click', () => mimicAvatarInput.click());
    mimicTranscriptInput.addEventListener('change', handleMimicTranscriptUpload);
    mimicAvatarInput.addEventListener('change', handleMimicAvatarUpload);
    closeMimicImportModal.addEventListener('click', hideMimicImportModalView);
    cancelMimicImportBtn.addEventListener('click', hideMimicImportModalView);
    runMimicAnalysisBtn.addEventListener('click', () => {
        void runMimicAnalysisFromModal();
    });
    saveMimicPersonaBtn.addEventListener('click', saveMimicPersonaFromModal);
    
    giftButton.addEventListener('click', () => showDisabledFeatureNotice('送禮功能'));
    giftUploadInput.addEventListener('change', handleGiftSelection);
    removeGiftBtn.addEventListener('click', removeGift);

    clearChatBtn.addEventListener('click', async () => {
        if (currentPersonaKey && currentPersona) {
            if (confirm(`\u78ba\u5b9a\u8981\u6e05\u9664 ${currentPersona.name} \u7684\u5c0d\u8a71\u7d00\u9304\u55ce\uff1f`)) {
                if (characterPhotoRequestController) characterPhotoRequestController.abort();
                await deleteCharacterPhotoAssetsForHistory(memoryManager.getChatHistory(currentPersonaKey));
                memoryManager.clearChatHistory(currentPersonaKey);
                startChat(currentPersonaKey);
            }
        }
        moreOptionsMenu.classList.add('hidden');
    });
    
    suggestionButton.addEventListener('click', () => showDisabledFeatureNotice('建議功能'));
    newSceneBtn.addEventListener('click', startNewScene);
    takePhotoBtn.addEventListener('click', () => {
        openPhotoPromptModal();
    });

    // Photo prompt modal listeners
    closePhotoPromptModalBtn.addEventListener('click', closePhotoPromptModal);
    cancelPhotoGeneration.addEventListener('click', closePhotoPromptModal);
    generatePhotoBtn.addEventListener('click', () => void generatePhotoFromPrompt());

    // Date proposal modal listeners
    acceptDateBtn.addEventListener('click', handleAcceptDate);
    declineDateBtn.addEventListener('click', handleDeclineDate);
    
    // Memory modal listeners
    memoryBtn.addEventListener('click', () => {
        openMemoryEditor();
        moreOptionsMenu.classList.add('hidden');
    });
    personaSettingsBtn.addEventListener('click', () => {
        openPersonaSettings();
        moreOptionsMenu.classList.add('hidden');
    });
    changeAvatarBtn.addEventListener('click', () => {
        if (currentPersonaKey) requestPersonaAvatarUpload(currentPersonaKey);
        moreOptionsMenu.classList.add('hidden');
    });
    personaSettingsAvatarBtn.addEventListener('click', () => {
        if (currentPersonaKey) requestPersonaAvatarUpload(currentPersonaKey);
    });
    closeMemoryModal.addEventListener('click', closeMemoryEditor);
    cancelMemoryEdit.addEventListener('click', closeMemoryEditor);
    saveMemoryEdit.addEventListener('click', saveMemory);
    closePersonaSettingsModal.addEventListener('click', closePersonaSettings);
    cancelPersonaSettingsBtn.addEventListener('click', closePersonaSettings);
    savePersonaSettingsBtn.addEventListener('click', savePersonaSettings);

    // Interests modal listeners
    interestsBtn.addEventListener('click', () => {
        showDisabledFeatureNotice('興趣技能');
        moreOptionsMenu.classList.add('hidden');
    });
    // FIX: Use the renamed button variable 'closeInterestsModalBtn' to prevent type errors.
    closeInterestsModalBtn.addEventListener('click', closeInterestsModal);
    
    // Album modal listeners
    albumBtn.addEventListener('click', () => {
        openAlbumModal();
        moreOptionsMenu.classList.add('hidden');
    });
    // FIX: Use the renamed button variable 'closeAlbumModalBtn' to prevent type errors.
    closeAlbumModalBtn.addEventListener('click', closeAlbumModal);
    albumSelectAll.addEventListener('change', toggleSelectAllPhotos);
    albumDownloadBtn.addEventListener('click', downloadSelectedPhotos);
    albumDeleteBtn.addEventListener('click', showDeleteConfirmation);
    cancelDeleteBtn.addEventListener('click', showMainAlbumButtons);
    confirmDeleteBtn.addEventListener('click', deleteSelectedPhotos);
    closePhotoViewer.addEventListener('click', closePhotoViewerModal);

    // More options menu toggle
    moreOptionsBtn.addEventListener('click', () => {
        moreOptionsMenu.classList.toggle('hidden');
    });
    
    // Hide menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!moreOptionsBtn.contains(e.target as Node) && !moreOptionsMenu.contains(e.target as Node)) {
            moreOptionsMenu.classList.add('hidden');
        }
        if (!suggestionButton.contains(e.target as Node) && !suggestionContainer.contains(e.target as Node)) {
            hideSuggestionContainer();
        }
    });

    // Save before exit modal
    saveAndExitBtn.addEventListener('click', () => {
        if (currentPersonaKey && currentPersona) {
            fileManager.saveCurrentChat(currentPersonaKey, currentPersona.name);
        }
        saveExitModal.classList.add('hidden');
        showSelectionView('replace');
    });
    exitWithoutSavingBtn.addEventListener('click', () => {
        saveExitModal.classList.add('hidden');
        showSelectionView('replace');
    });
    cancelExitBtn.addEventListener('click', () => {
        saveExitModal.classList.add('hidden');
    });
};

// --- Initialization ---
const init = async () => {
    syncBrowserViewState(HOME_HISTORY_STATE, 'replace');
    renderPersonaList();
    setupEventListeners();
    setAuthSubmitting(false);
    applyChatRuntimeState('idle');
    pendingVideoJob = readPersistedVideoJob();
    if (pendingVideoJob) {
        setVideoProgressState('paused');
        videoStudioStatus.textContent = `找到未完成工作 · ${pendingVideoJob.modelName} · 登入後自動恢復`;
    } else {
        setVideoProgressState('idle');
    }
    setVideoStudioBusy(false);
    const unlocked = await refreshAuthSession();
    if (unlocked && pendingVideoJob) void resumePendingVideoJob('auto');
};

void init();


