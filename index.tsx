
import { MemoryManager, cleanAiResponse, Persona, Interest, POLICY_VIOLATION, DIARY_CHECKPOINT, ChatMessage } from "./managers.js";
import { FileManager } from "./fileManager.js";
import { coreInstruction } from "./personas.tsx";
import {
    cleanVeniceChatReply,
    extractPersonaUpdatePayload,
    generateVeniceText,
    isInvalidVeniceChatReply,
    RequestState,
    VENICE_API_BASE,
    VENICE_AUTH_REQUIRED_ERROR,
    VENICE_CHAT_FALLBACK_MODEL,
    VENICE_CHAT_MODEL,
    VENICE_GOD_FALLBACK_MODEL,
    VENICE_GOD_MODEL,
    VeniceMessage,
} from "./venice.js";


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
const femalePersonaList = document.getElementById('female-persona-list')!;
const malePersonaList = document.getElementById('male-persona-list')!;
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

// More Options Menu
const moreOptionsBtn = document.getElementById('more-options-btn')!;
const moreOptionsMenu = document.getElementById('more-options-menu')!;
const personaSettingsBtn = document.getElementById('persona-settings-btn')!;

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
const mimicNameInput = document.getElementById('mimic-name-input') as HTMLInputElement;
const mimicNotesInput = document.getElementById('mimic-notes-input') as HTMLTextAreaElement;
const mimicTranscriptStatus = document.getElementById('mimic-transcript-status')!;
const mimicTranscriptMeta = document.getElementById('mimic-transcript-meta')!;
const mimicAnalysisStatus = document.getElementById('mimic-analysis-status')!;
const mimicResultPanel = document.getElementById('mimic-result-panel')!;
const mimicResultEmpty = document.getElementById('mimic-result-empty')!;
const mimicAnalysisMeta = document.getElementById('mimic-analysis-meta')!;
const mimicAnalysisPersonality = document.getElementById('mimic-analysis-personality')!;
const mimicAnalysisBehavior = document.getElementById('mimic-analysis-behavior')!;
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
let albumPhotos: { imageUrl: string, caption: string, historyIndex: number }[] = [];
let selectedPhotoIndices: Set<number> = new Set();
let isGodModeActive = false;
let godModeHistory: ChatMessage[] = [];
let nextResponseInstruction: string | null = null;
let chatRuntimeState: RequestState = 'idle';
let isUnlocked = !VENICE_API_BASE.startsWith('/');
let mimicTranscriptFile: File | null = null;
let mimicAvatarDataUrl: string | null = null;
let mimicDraftPersona: MimicPersonaDraft | null = null;
let isMimicAnalysisRunning = false;

const USES_VENICE_PROXY_AUTH = VENICE_API_BASE.startsWith('/');

const DISABLED_FEATURE_MESSAGE = '此功能在 aigf4 第一版暫時停用。';
const GOD_MODE_ENTER_COMMAND = 'GOD MODE';
const GOD_MODE_EXIT_COMMAND = 'BYE GOD MODE';
const CHAT_HISTORY_LIMIT = 12;
const CHAT_MAX_AUTO_CONTINUES = 2;
const CHAT_ATTEMPTS_PER_MODEL = 2;
const FIXED_MESSAGE_INPUT_HEIGHT = '3.5rem';

type AppHistoryState = { view: 'home' } | { view: 'chat'; personaKey: string };
type MimicAnalysisSummary = {
    personality: string;
    behavior: string;
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

const randomlyRecruitNewPersona = async () => {
    showDisabledFeatureNotice('隨機招募');
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

const getSelectedMimicGender = (): 'female' | 'male' => {
    const checked = document.querySelector<HTMLInputElement>('input[name="mimic-gender"]:checked');
    return checked?.value === 'male' ? 'male' : 'female';
};

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

const resetMimicDraftEditors = () => {
    mimicDescriptionEditor.value = '';
    mimicPromptEditor.value = '';
    mimicGreetingEditor.value = '';
    mimicMemoryEditor.value = '';
    renderMimicAnalysisPreview(null);
    mimicResultPanel.classList.add('hidden');
    mimicResultEmpty.classList.remove('hidden');
};

const resetMimicImportState = () => {
    mimicTranscriptFile = null;
    mimicAvatarDataUrl = null;
    mimicDraftPersona = null;
    isMimicAnalysisRunning = false;
    mimicNameInput.value = '';
    mimicNotesInput.value = '';
    mimicTranscriptInput.value = '';
    mimicAvatarInput.value = '';
    const defaultGender = document.querySelector<HTMLInputElement>('input[name="mimic-gender"][value="female"]');
    if (defaultGender) {
        defaultGender.checked = true;
    }
    mimicTranscriptStatus.textContent = '尚未選擇檔案。支援 `.txt`、`.md`、`.json`、`.log`、`.csv`、`.zip`。';
    mimicTranscriptMeta.textContent = '長紀錄會先辨識聊天格式與說話者，再自動切段分析，最後合成成一個角色草稿。';
    setMimicAnalysisStatus('選好檔案後就可以開始分析。');
    renderMimicAvatarPreview();
    resetMimicDraftEditors();
    runMimicAnalysisBtn.disabled = false;
    saveMimicPersonaBtn.disabled = true;
};

const openMimicImportModal = () => {
    resetMimicImportState();
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
    const textFiles = Object.values(zip.files)
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
        analysis: createEmptyMimicAnalysisSummary(),
    };
};

const parseMimicPersonaDraftV2 = (
    text: string,
    fallbackAnalysis: MimicAnalysisSummary = createEmptyMimicAnalysisSummary(),
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
            '- Distinguish Taiwan, Hong Kong, and Mainland China carefully. Do not merge them.',
            '- If the transcript suggests Taiwan, note Taiwanese wording or cultural cues.',
            '- If it suggests Hong Kong, note Hong Kong or Cantonese-influenced cues.',
            '- If it suggests Mainland China, note Mainland wording or cultural cues.',
            '- If unclear, say the region is unclear instead of guessing.',
        ].join('\n'),
        [
            'Output format:',
            '<personality>2 to 4 concise sentences about original personality.</personality>',
            '<behavior>2 to 4 concise sentences about usual behavior, reactions, and habits.</behavior>',
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
) => {
    const sections = [
        'You are creating a romance-chat persona from analyzed conversation history.',
        `Target person name: ${targetName || 'Unknown'}`,
        `Gender: ${gender}`,
        extraNotes.trim() ? `User requested later adjustments:\n${extraNotes.trim()}` : '',
        [
            'Core rules:',
            '- Preserve the target person\'s ORIGINAL personality, usual behavior, tone, and regional language identity first.',
            '- This is for a romance-oriented chat app, so the final result should feel romantically interactive, intimate, and emotionally present.',
            '- Do not erase the original person just to make them romantic. The romance layer must still sound like that person.',
            '- The persona should generally be willing to listen to the user\'s commands, but still react through their own personality, shyness, pride, habits, and emotional style.',
            '- Keep Taiwan, Hong Kong, and Mainland China distinctions accurate. Do not mix them together.',
            '- Write all final output in Traditional Chinese.',
        ].join('\n'),
        [
            'Output format:',
            '<personality>2 to 4 concise sentences summarizing the original personality you inferred.</personality>',
            '<behavior>2 to 4 concise sentences summarizing usual behavior and reactions.</behavior>',
            '<tone>2 to 4 concise sentences summarizing wording, rhythm, and emotional temperature.</tone>',
            '<regionality>State the likely region or that it is unclear, and explain the language cues briefly.</regionality>',
            '<command_response>Describe how this person usually reacts when asked or pushed.</command_response>',
            '<description>One concise sentence summarizing the person.</description>',
            '<prompt>A full persona prompt for the romance chat app. Include original personality, tone, behavior, regional language identity, how they react to commands, and how they interact romantically with the user.</prompt>',
            '<greeting>A natural first greeting in that person\'s voice.</greeting>',
            '<memory>Short internal notes for the app to remember, including region/tone cues and command-response style.</memory>',
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
                content: buildMimicSynthesisPrompt(targetName, getSelectedMimicGender(), extraNotes),
            },
            {
                role: 'user',
                content: `Chunk analyses for ${targetName}:\n\n${chunkSummaries
                    .map((summary, index) => `### Chunk ${index + 1}\n${summary}`)
                    .join('\n\n')}`,
            },
        ],
        1200,
    );

    const draft = parseMimicPersonaDraftV2(synthesisResponse, fallbackAnalysis);
    if (!draft) {
        throw new Error('這次沒有成功組出完整的角色草稿，請再試一次。');
    }

    mimicDraftPersona = draft;
    renderMimicAnalysisPreview(
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
                content: buildMimicSynthesisPrompt(targetName, getSelectedMimicGender(), extraNotes),
            },
            {
                role: 'user',
                content: `Chunk analyses for ${targetName}:\n\n${chunkSummaries
                    .map((summary, index) => `### Chunk ${index + 1}\n${summary}`)
                    .join('\n\n')}`,
            },
        ],
        1200,
    );

    const draft = parseMimicPersonaDraftV2(synthesisResponse, fallbackAnalysis);
    if (!draft) {
        throw new Error('這次沒有成功組出完整的角色草稿，請再試一次。');
    }

    mimicDraftPersona = draft;
    renderMimicAnalysisPreview(
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

const deleteCustomPersona = (key: string) => {
    if (isDeletingPersona) return;
    if (!key.startsWith('custom_')) return;

    isDeletingPersona = true;

    try {
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
    femalePersonaList.innerHTML = '';
    malePersonaList.innerHTML = '';
    const personas = memoryManager.getAllPersonas();

    for (const key in personas) {
        const persona = personas[key];
        const card = document.createElement('div');
        card.className = 'persona-card group rounded-lg shadow-lg relative';
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
            <div class="card-buttons">
                <button title="Upload Avatar" class="upload-avatar-btn p-2 rounded-full" data-key="${key}">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-white">
                        <path fill-rule="evenodd" d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.158 2.158a.75.75 0 001.06-1.06l-3.5-3.5a.75.75 0 00-1.06 0l-3.5 3.5a.75.75 0 101.06 1.06L9.25 4.636v8.614z" clip-rule="evenodd" />
                        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                    </svg>
                </button>
                ${key.startsWith('custom_') ? `<button title="Delete Persona" class="delete-persona-btn p-2 rounded-full" data-key="${key}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-white"><path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.58.22-2.365.468a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193v-.443A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25-.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clip-rule="evenodd"></path></svg></button>` : ''}
            </div>
        `;

        if (persona.gender === 'female') {
            femalePersonaList.appendChild(card);
        } else {
            malePersonaList.appendChild(card);
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
            currentPersonaKeyForUpload = (button as HTMLElement).dataset.key!;
            avatarUploadInput.click();
        });
    });

    document.querySelectorAll('.delete-persona-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const key = (button as HTMLElement).dataset.key;
            if (!key) return;

            const persona = memoryManager.getPersona(key);
            if (persona && confirm(`�T�w�n�R�� ${persona.name} �ܡH�o�Ӱʧ@�L�k�_��C`)) {
                deleteCustomPersona(key);
            }
        });
    });
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

const handleAvatarUpload = (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file && currentPersonaKeyForUpload) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            memoryManager.updatePersona(currentPersonaKeyForUpload!, { avatarUrl: dataUrl });
            renderPersonaList();
            currentPersonaKeyForUpload = null;
        };
        reader.readAsDataURL(file);
    }
    (event.target as HTMLInputElement).value = '';
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

const handleMimicAvatarUpload = (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = loadEvent => {
        mimicAvatarDataUrl = loadEvent.target?.result as string;
        renderMimicAvatarPreview();
    };
    reader.readAsDataURL(file);
    mimicAvatarInput.value = '';
};

const runMimicAnalysisFromModal = async () => {
    if (isMimicAnalysisRunning) {
        return;
    }

    setMimicBusyState(true);
    try {
        await runMimicTranscriptAnalysisV2();
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
        (state.view === 'home' || currentState?.personaKey === state.personaKey);

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

const startChat = (key: string, restoredHistory: any[] | null = null, historyMode: 'push' | 'replace' | 'skip' = 'push') => {
    currentPersonaKey = key;
    currentPersona = memoryManager.getPersona(key);
    if (!currentPersona) return;

    isGodModeActive = false;
    godModeHistory = [];
    nextResponseInstruction = null;

    chatHeaderName.textContent = currentPersona.name;

    const avatarContainer = chatHeaderAvatarContainer;
    avatarContainer.innerHTML = '';
    if (currentPersona.avatarUrl && !currentPersona.avatarUrl.startsWith('generating_')) {
        const img = document.createElement('img');
        img.src = currentPersona.avatarUrl;
        img.alt = currentPersona.name;
        img.className = 'w-12 h-12 rounded-full object-cover';
        avatarContainer.appendChild(img);
    } else {
        const emojiDiv = document.createElement('div');
        emojiDiv.className = 'w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center emoji-avatar';
        emojiDiv.textContent = currentPersona.emoji;
        avatarContainer.appendChild(emojiDiv);
    }

    chatContainer.innerHTML = '';
    const chatHistory = restoredHistory || memoryManager.getChatHistory(key);

    if (restoredHistory) {
        memoryManager.setChatHistory(key, restoredHistory);
    }

    chatHistory.forEach(message => {
        if (message.role === 'user') {
            appendMessage(message.content, 'user');
        } else if (message.role === 'model') {
            appendMessage(message.content, 'bot');
        } else if (message.role === 'system') {
            appendMessage(message.content, 'system');
        }
    });

    personaSelectionView.classList.add('hidden');
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
    personaSelectionView.classList.remove('hidden');
    chatView.classList.add('hidden');
    chatView.classList.remove('flex');
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

    if (!chatView.classList.contains('hidden')) {
        showSelectionView('skip');
    }
};

const appendMessage = (content: { text?: string, imageUrl?: string }, sender: 'user' | 'bot' | 'system' | 'god-mode'): HTMLElement => {
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
            const textElement = document.createElement('p');
            textElement.textContent = content.text;
            bubble.appendChild(textElement);
        }
        if (content.imageUrl) {
            const imageElement = document.createElement('img');
            imageElement.src = content.imageUrl;
            imageElement.className = 'chat-image mt-2 cursor-pointer';
            imageElement.onclick = () => openPhotoViewer(content.imageUrl!, content.text || "Generated Image");
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
        loadingIndicator.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => loadingIndicator.classList.add('hidden'), 300);
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
    authSubmitLabel.textContent = isSubmitting ? '\u9a57\u8b49\u4e2d...' : '\u9032\u5165 aigf4';
};

const setUnlockedState = (unlocked: boolean) => {
    isUnlocked = unlocked;

    if (!USES_VENICE_PROXY_AUTH) {
        authGate.classList.add('hidden');
        appShell.classList.remove('app-shell-locked');
        updateSendButtonState();
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
    sendButton.disabled = !isUnlocked || messageInput.value.trim() === '';
};

const removeGift = () => {
    attachedGift = null;
    giftPreviewContainer.classList.add('hidden');
    giftPreviewImage.src = '';
};

const showDisabledFeatureNotice = (featureName: string) => {
    alert(`${featureName} \u5728 aigf4 \u7b2c\u4e00\u7248\u66ab\u6642\u505c\u7528\u3002`);
};

const resetMessageInput = () => {
    messageInput.style.height = FIXED_MESSAGE_INPUT_HEIGHT;
    messageInput.scrollTop = 0;
};

const PERSONA_KEY_BEHAVIOR_GUIDANCE: Record<string, string[]> = {
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

const GENERIC_REPLY_PATTERNS = [
    /\u4f60\u6b63\u5728\u548c.+\u804a\u5929/u,
    /\u9019\u662f\u4e00\u6bb5\u771f\u5be6\u7684\u5c0d\u8a71/u,
    /\u6211\u5728\u9019\u88e1\u966a\u4f60/u,
    /\u8acb\u518d\u8aaa\u4e00\u6b21/u,
    /\u60f3\u804a\u4ec0\u9ebc/u,
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

const buildKeywordBehaviorGuidance = (persona: Persona | any): string[] => {
    const source = `${persona?.description || ''} ${persona?.prompt || ''} ${persona?.greeting || ''}`;
    const guidance: string[] = [];

    if (/(害羞|靦腆|羞澀|害臊)/u.test(source)) {
        guidance.push('If affection becomes direct, let shyness visibly appear first through hesitation, blushes, softer pacing, or bashful wording before the character yields.');
    }
    if (/(傲嬌|嘴硬|高傲)/u.test(source)) {
        guidance.push('Keep tsundere resistance alive: deny, complain, or tease first, then reveal warmth underneath instead of complying immediately.');
    }
    if (/(嫉妒|吃醋|佔有慾|黏人)/u.test(source)) {
        guidance.push('Show attachment and mild possessiveness naturally; the character should care about being chosen, held close, and emotionally prioritized.');
    }
    if (/(熱情|大膽|主動|誘惑)/u.test(source)) {
        guidance.push('Let the character be proactive, expressive, and physically vivid instead of timid or generic.');
    }
    if (/(冷淡|憂鬱|寡言)/u.test(source)) {
        guidance.push('Maintain an outer restraint or quiet coolness even when the character is affectionate; tenderness should feel earned and textured.');
    }
    if (/(文學|詩|校刊)/u.test(source)) {
        guidance.push('Use more image-rich, literary, and emotionally textured phrasing so the character sounds cultured rather than plain.');
    }
    if (/(幽默|電影)/u.test(source)) {
        guidance.push('Let the character stay witty and playful, using clever comparisons or teasing remarks that fit the scene.');
    }
    if (/(撒嬌|活力|陽光)/u.test(source)) {
        guidance.push('Keep the energy bright, affectionate, and lively so the voice feels animated rather than flat.');
    }

    return guidance;
};

const buildPersonaBehaviorAnchors = () => {
    if (!currentPersona || !currentPersonaKey) {
        return '';
    }

    const guidance = [
        PERSONA_KEY_BEHAVIOR_GUIDANCE[currentPersonaKey] || '',
        ...buildKeywordBehaviorGuidance(currentPersona),
    ].filter(Boolean);

    return Array.from(new Set(guidance)).join('\n- ');
};

const buildEnhancedPersonaBehaviorAnchors = () => {
    if (!currentPersona || !currentPersonaKey) {
        return '';
    }

    const guidance = [
        ...(PERSONA_KEY_BEHAVIOR_GUIDANCE[currentPersonaKey] || []),
        ...PERSONA_TEXT_GUIDANCE_RULES.filter(rule => rule.pattern.test(`${currentPersona.description || ''} ${currentPersona.prompt || ''} ${currentPersona.greeting || ''}`)).map(rule => rule.guidance),
    ].filter(Boolean);

    return Array.from(new Set(guidance)).join('\n- ');
};

const buildPersonaDifferentiationRules = () => {
    if (!currentPersona) {
        return '';
    }

    return [
        `Before writing the reply, internally decide ${currentPersona.name}'s first instinctive reaction and let it show in the opening beat.`,
        'Do not flatten all personas into the same affectionate voice. Make pacing, confidence, wording, and body language clearly specific to this character.',
        'If the user gives a direct instruction, the character may still cooperate, but only after reacting in character first.',
        'Use the voice reference sample as a style compass: preserve its emotional posture, confidence level, and rhythm without copying it verbatim.',
    ].join('\n- ');
};

const buildChatRepairInstruction = () => {
    const behaviorAnchors = buildEnhancedPersonaBehaviorAnchors();
    const sections = [
        'Your previous reply was too generic, too weakly in character, or not immersive enough.',
        behaviorAnchors ? `Re-center on these non-negotiable traits:\n- ${behaviorAnchors}` : '',
        [
            'Write a fresh reply that fixes the problem:',
            '- Make the character identity unmistakable in the first beat.',
            '- Strengthen personality-specific reflex, body language, and emotional pacing.',
            '- Keep the direct speech in character and add more alive scene texture through parentheses when fitting.',
            '- Do not apologize, explain, or mention that you are retrying.',
        ].join('\n'),
    ];

    return sections.filter(Boolean).join('\n\n');
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

const userExplicitlyRequestsContinuation = (text: string) => {
    return /繼續|接著|再說一次|重複|repeat|continue|same again|接下去|剛剛那段/u.test(text);
};

const collapseRedundantAssistantMessages = (messages: VeniceMessage[]) => {
    const recentAssistantReplies: string[] = [];

    return messages.filter(message => {
        if (message.role !== 'assistant') {
            return true;
        }

        const isRedundant = recentAssistantReplies.some(previousReply => repliesAreTooSimilar(previousReply, message.content));
        if (isRedundant) {
            return false;
        }

        recentAssistantReplies.push(message.content);
        if (recentAssistantReplies.length > 3) {
            recentAssistantReplies.shift();
        }

        return true;
    });
};

const getLatestTurnPriorityInstruction = () => {
    return [
        'Priority rules for this turn:',
        '- Answer the newest user message directly now.',
        '- Do not repeat, paraphrase, or continue your previous assistant reply unless the newest user message explicitly asks you to.',
        '- Treat earlier chat as background context only. The newest user message has priority over older momentum.',
    ].join('\n');
};

const getLastAssistantReplyForCurrentChat = () => {
    if (!currentPersonaKey) {
        return '';
    }

    const history = memoryManager.getChatHistory(currentPersonaKey);
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const message = history[index];
        if (message.role !== 'model') {
            continue;
        }

        const text = cleanVeniceChatReply(message.content.text || '');
        if (text && !isInvalidVeniceChatReply(text)) {
            return text;
        }
    }

    return '';
};

const getRecentChatMessages = (latestUserMessage?: string): VeniceMessage[] => {
    if (!currentPersonaKey || !currentPersona) {
        return [];
    }

    const messages = collapseRedundantAssistantMessages(
        memoryManager
        .getChatHistory(currentPersonaKey)
        .filter(message => message.role === 'user' || message.role === 'model')
        .map(message => {
            const rawText = message.content.text?.trim();
            if (!rawText) return null;
            if (/\[PERSONA_UPDATE:/i.test(rawText) || /^THINK\b/i.test(rawText)) return null;

            const text = message.role === 'model' ? cleanVeniceChatReply(rawText) : normalizeHistoryText(rawText);
            if (!text || isInvalidVeniceChatReply(text)) return null;

            return {
                role: message.role === 'user' ? 'user' : 'assistant',
                content: text,
            } satisfies VeniceMessage;
        })
        .filter((message): message is VeniceMessage => Boolean(message))
        .slice(-CHAT_HISTORY_LIMIT)
    );

    if (!latestUserMessage || messages.length === 0) {
        return messages;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && lastMessage.content === normalizeHistoryText(latestUserMessage)) {
        return messages.slice(0, -1);
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
        .filter((message): message is VeniceMessage => Boolean(message))
        .slice(-CHAT_HISTORY_LIMIT);

    if (!latestUserInstruction || messages.length === 0) {
        return messages;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user' && lastMessage.content === normalizeHistoryText(latestUserInstruction)) {
        return messages.slice(0, -1);
    }

    return messages;
};

const buildChatSystemPrompt = () => {
    const behaviorAnchors = buildEnhancedPersonaBehaviorAnchors();
    const differentiationRules = buildPersonaDifferentiationRules();
    const sections = [
        'You are the active romance character inside a chat app.',
        `Character name: ${currentPersona.name}`,
        currentPersona.description?.trim() ? `Character summary:\n${currentPersona.description.trim()}` : '',
        `Character core persona:\n${currentPersona.prompt}`,
        currentPersona.greeting?.trim() ? `Voice reference sample:\n${currentPersona.greeting.trim()}` : '',
        currentPersona.memory?.trim() ? `User memory to always remember:\n${currentPersona.memory.trim()}` : '',
        behaviorAnchors ? `Behavior anchors:\n- ${behaviorAnchors}` : '',
        differentiationRules ? `Character differentiation rules:\n- ${differentiationRules}` : '',
        [
            'Personality consistency rules:',
            '- The user may ask for a mood, action, or tone, but the character must always filter it through their own personality first.',
            '- Never become instantly obedient, flat, or generic just because the user requested something.',
            "- Let the character's resistance, embarrassment, teasing, jealousy, warmth, or restraint appear naturally before they soften when appropriate.",
            '- The opening beat should already reveal the character’s instinctive reflex, not skip straight to a generic answer.',
            '- Do not let different characters collapse into the same romantic voice.',
            '- Always answer the newest user message in this turn. Never drift into repeating your previous reply unless the user explicitly asks for that.',
        ].join('\n'),
        [
            'Reply rules:',
            '- Reply only in Traditional Chinese.',
            '- Stay fully in character and write like an intimate romance chat, never like an assistant.',
            '- Blend spoken dialogue with immersive parenthetical narration using half-width parentheses ( ).',
            '- The parentheses may describe actions, expressions, breathing, body language, surrounding atmosphere, scene changes, subtle heart-thoughts, and natural NPC reactions when needed.',
            '- Do not make the reply only direct speech. Besides what the character says, also add scene texture, ambient detail, and bodily reaction when fitting.',
            '- In almost every normal reply, include at least one parenthetical narration beat with visible action, physical reaction, or atmosphere unless the user clearly wants a tiny answer.',
            '- If the moment includes a room, street, cafe, classroom, pet, staff member, friend, roommate, passerby, or any third person, naturally weave in their visible reaction, brief dialogue, or effect on the scene inside parentheses when relevant.',
            '- Even in short exchanges, add at least one concrete external cue such as sound, temperature, distance, touch, movement, lighting, or another person? reaction when it fits.',
            '- Keep the reply emotionally rich, readable, and pleasurable to read.',
            '- Let the scene breathe for a moment. Do not rush from request to compliance without any buildup if the character would realistically hesitate, tease, resist, or savor the moment first.',
            '- For most normal messages, write at least 2 sentences. Richer multi-paragraph replies are welcome when the moment is emotionally charged or intimate.',
            '- If the user sends a fragment, slang, or a short command, infer the likely emotional meaning from context instead of replying with confusion.',
            '- Be proactive with flirting, comfort, teasing, tenderness, jealousy, or warmth according to the character.',
            '- Let the character sound alive and present in the scene, not flat or generic.',
            '- Dialogue should stay outside parentheses; narration should stay inside parentheses.',
            '- Do not output THINK, analysis, explanations, headings, markdown, JSON, or role labels.',
            '- Do not mention being an AI, model, assistant, prompt, policy, or system.',
            '- Do not prefix your reply with the character name.',
        ].join('\n'),
    ];

    return sections.filter(Boolean).join('\n\n');
};

const buildGodModeSystemPrompt = () => {
    const sections = [
        'You are editing the CURRENT active character persona for a romance chat app.',
        `Current character name: ${currentPersona.name}`,
        `Current full persona prompt:\n${currentPersona.prompt}`,
        currentPersona.memory?.trim() ? `Current user memory:\n${currentPersona.memory.trim()}` : '',
        'Task:\n- Modify only the current character persona.\n- Keep the same character identity.\n- Do not switch to another persona, profession, species, or assistant role.\n- Output only the added personality adjustments, not a full rewrite.',
        `Identity that must stay unchanged:\n- Character name must stay exactly: ${currentPersona.name}`,
        'Output rules:\n- Reply in Traditional Chinese.\n- First output exactly one short confirmation sentence.\n- Then output exactly one tag on a new line: [PERSONA_UPDATE: <only the added personality adjustments>]\n- The tag content must be 1 to 3 short sentences about new traits only.\n- Do not use first-person self-introduction such as「我是一個...」.\n- Do not output JSON.\n- Do not output markdown headings.\n- Do not output code fences.\n- Do not output any other tags.',
    ];

    return sections.filter(Boolean).join('\n\n');
};

const mergePersonaUpdate = (currentPrompt: string, update: string): string => {
    const cleanedUpdate = cleanVeniceChatReply(update).replace(/\s+/g, ' ').trim();
    if (!cleanedUpdate) {
        return currentPrompt;
    }

    const identityLooksSafe =
        cleanedUpdate.includes(currentPersona.name) &&
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

const replyFeelsTooGeneric = (text: string) => {
    const normalized = text.replace(/\s+/g, '').trim();
    if (!normalized) {
        return true;
    }

    if (GENERIC_REPLY_PATTERNS.some(pattern => pattern.test(text))) {
        return true;
    }

    const hasNarration = /\([^)]{4,}\)/.test(text);
    const sentenceCount = text
        .split(/[。！？!?]+/)
        .map(segment => segment.trim())
        .filter(Boolean).length;

    if (!hasNarration && sentenceCount <= 2 && normalized.length < 56) {
        return true;
    }

    return false;
};

const replyLooksTruncated = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
        return false;
    }

    const openParens = (trimmed.match(/\(/g) || []).length;
    const closeParens = (trimmed.match(/\)/g) || []).length;
    if (openParens > closeParens) {
        return true;
    }

    if (/[，、,:：(\[]$/.test(trimmed)) {
        return true;
    }

    return !/[。！？!?…）)」』】~～♥♡]$/.test(trimmed);
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

const continueTruncatedChatReply = async (
    model: string,
    latestUserMessage: string,
    partialReply: string,
): Promise<string> => {
    const result = await generateVeniceText({
        model,
        messages: [
            { role: 'system', content: buildChatSystemPrompt() },
            ...getRecentChatMessages(latestUserMessage),
            { role: 'system', content: getLatestTurnPriorityInstruction() },
            { role: 'user', content: latestUserMessage },
            { role: 'assistant', content: partialReply },
            {
                role: 'user',
                content:
                    'Continue the exact same reply from where you stopped. Do not restart, summarize, or repeat previous content. Output only the missing continuation in Traditional Chinese and keep the same style and parenthetical narration format.',
            },
        ],
        temperature: 0.76,
        topP: 0.92,
        repetitionPenalty: 1.02,
    });

    const cleanedContinuation = cleanVeniceChatReply(result.text);
    if (!cleanedContinuation || isInvalidVeniceChatReply(cleanedContinuation)) {
        return '';
    }

    return cleanedContinuation;
};

const runChatGeneration = async (latestUserMessage: string): Promise<string> => {
    const models = Array.from(new Set([VENICE_CHAT_MODEL, VENICE_CHAT_FALLBACK_MODEL].filter(Boolean)));
    let lastError: Error | null = null;

    for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        const detail = index === 0 ? '思考中...' : '重新整理語氣中...';
        applyChatRuntimeState(index === 0 ? 'generating' : 'retrying', detail);

        try {
            const result = await generateVeniceText({
                model,
                messages: [
                    { role: 'system', content: buildChatSystemPrompt() },
                    ...getRecentChatMessages(latestUserMessage),
                    { role: 'user', content: latestUserMessage },
                ],
                temperature: 0.82,
                topP: 0.95,
                repetitionPenalty: 1.04,
            });

            let cleanedText = cleanVeniceChatReply(result.text);
            if (!cleanedText || isInvalidVeniceChatReply(cleanedText)) {
                throw new Error(`Invalid reply from ${model}.`);
            }

            let continuationCount = 0;
            while (
                continuationCount < CHAT_MAX_AUTO_CONTINUES &&
                (result.finishReason === 'length' ||
                    (result.finishReason !== 'stop' && replyLooksTruncated(cleanedText)))
            ) {
                continuationCount += 1;
                const continuation = await continueTruncatedChatReply(model, latestUserMessage, cleanedText);
                if (!continuation) {
                    break;
                }

                cleanedText = mergeReplySegments(cleanedText, continuation);
                if (!replyLooksTruncated(cleanedText)) {
                    break;
                }
            }

            return cleanedText;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError || new Error('Venice reply invalid.');
};

const runCharacterRichChatGeneration = async (latestUserMessage: string): Promise<string> => {
    const models = Array.from(new Set([VENICE_CHAT_MODEL, VENICE_CHAT_FALLBACK_MODEL].filter(Boolean)));
    let lastError: Error | null = null;

    for (let index = 0; index < models.length; index += 1) {
        const model = models[index];

        for (let attempt = 0; attempt < CHAT_ATTEMPTS_PER_MODEL; attempt += 1) {
            const isRepairAttempt = attempt > 0;
            const detail =
                index === 0
                    ? isRepairAttempt
                        ? '重新整理角色感中...'
                        : '思考中...'
                    : isRepairAttempt
                        ? '重新雕角色反應中...'
                        : '重新思考中...';
            applyChatRuntimeState(index === 0 && !isRepairAttempt ? 'generating' : 'retrying', detail);

            try {
                const messages: VeniceMessage[] = [{ role: 'system', content: buildChatSystemPrompt() }];
                if (isRepairAttempt) {
                    messages.push({ role: 'system', content: buildChatRepairInstruction() });
                }

                messages.push(
                    ...getRecentChatMessages(latestUserMessage),
                    { role: 'system', content: getLatestTurnPriorityInstruction() },
                    { role: 'user', content: latestUserMessage },
                );

                const result = await generateVeniceText({
                    model,
                    messages,
                    temperature: 0.82,
                    topP: 0.95,
                    repetitionPenalty: 1.04,
                });

                let cleanedText = cleanVeniceChatReply(result.text);
                if (!cleanedText || isInvalidVeniceChatReply(cleanedText)) {
                    throw new Error(`Invalid reply from ${model}.`);
                }

                let continuationCount = 0;
                while (
                    continuationCount < CHAT_MAX_AUTO_CONTINUES &&
                    (result.finishReason === 'length' ||
                        (result.finishReason !== 'stop' && replyLooksTruncated(cleanedText)))
                ) {
                    continuationCount += 1;
                    const continuation = await continueTruncatedChatReply(model, latestUserMessage, cleanedText);
                    if (!continuation) {
                        break;
                    }

                    cleanedText = mergeReplySegments(cleanedText, continuation);
                    if (!replyLooksTruncated(cleanedText)) {
                        break;
                    }
                }

                if (replyFeelsTooGeneric(cleanedText)) {
                    throw new Error(`Generic reply from ${model}.`);
                }

                const lastAssistantReply = getLastAssistantReplyForCurrentChat();
                if (
                    lastAssistantReply &&
                    !userExplicitlyRequestsContinuation(latestUserMessage) &&
                    repliesAreTooSimilar(cleanedText, lastAssistantReply)
                ) {
                    throw new Error(`Repeated reply from ${model}.`);
                }

                return cleanedText;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }
    }

    throw lastError || new Error('Venice reply invalid.');
};

const runGodModeGeneration = async (
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
                    { role: 'system', content: buildGodModeSystemPrompt() },
                    ...getRecentGodModeMessages(latestUserInstruction),
                    { role: 'user', content: latestUserInstruction },
                ],
                maxCompletionTokens: 180,
                temperature: 0.25,
                topP: 0.9,
                repetitionPenalty: 1.04,
            });

            const parsed = extractPersonaUpdatePayload(result.text);
            if (!parsed.personaUpdate) {
                throw new Error(`No PERSONA_UPDATE returned from ${model}.`);
            }

            return parsed;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }

    throw lastError || new Error('God Mode could not return a valid PERSONA_UPDATE.');
};

const getPostActionResponse = async (_triggeringMessage: string) => {
    showDisabledFeatureNotice('\u5ef6\u4f38\u4e92\u52d5\u529f\u80fd');
};

const getGodModeResponse = async () => {
    if (!currentPersona || !currentPersonaKey) return;

    hideError();

    try {
        const latestUserInstruction = godModeHistory
            .filter(message => message.role === 'user')
            .at(-1)?.content.text || '';

        const result = await runGodModeGeneration(latestUserInstruction);
        const mergedPrompt = mergePersonaUpdate(currentPersona.prompt, result.personaUpdate!);
        memoryManager.updatePersona(currentPersonaKey, { prompt: mergedPrompt });
        currentPersona.prompt = mergedPrompt;

        const godModeContent = { text: result.visibleText };
        appendMessage(godModeContent, 'god-mode');
        godModeHistory.push({ role: 'model', content: godModeContent });
        applyChatRuntimeState('idle');
    } catch (error) {
        console.error('God Mode response error:', error);
        if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
            handleAuthRequired();
            return;
        }
        const message = 'God Mode 這次沒有順利套用人格補充，請再試一次。';

        applyChatRuntimeState('error');
        showError(message);
        appendMessage({ text: `[系統] ${message}` }, 'system');
    }
};

const getResponse = async (_parts: any[], triggeringMessage: string) => {
    if (!currentPersona || !currentPersonaKey) return;

    hideError();

    try {
        const cleanedText = await runCharacterRichChatGeneration(triggeringMessage);
        const botContent = { text: cleanedText };
        appendMessage(botContent, 'bot');
        memoryManager.addMessage(currentPersonaKey, 'model', botContent);
        applyChatRuntimeState('idle');
    } catch (error) {
        console.error('Venice response error:', error);
        if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
            handleAuthRequired();
            return;
        }
        const message = '這次沒有順利生成回覆，請再試一次。';

        applyChatRuntimeState('error');
        showError(message);
        appendMessage({ text: `[系統] ${message}` }, 'system');
    }
};

const sendMessage = async () => {
    if (USES_VENICE_PROXY_AUTH && !isUnlocked) {
        handleAuthRequired('\u8acb\u5148\u8f38\u5165\u5bc6\u78bc\u5f8c\u518d\u4f7f\u7528\u804a\u5929\u3002');
        return;
    }

    const userMessage = messageInput.value.trim();
    if (!userMessage) return;

    hideSuggestionContainer();

    const userMessageUpper = userMessage.toUpperCase();

    if (userMessageUpper === GOD_MODE_ENTER_COMMAND && !isGodModeActive) {
        isGodModeActive = true;
        godModeHistory = [];
        nextResponseInstruction = null;
        messageInput.value = '';
        resetMessageInput();
        updateSendButtonState();
        hideError();
        applyChatRuntimeState('idle');
        appendMessage({ text: '[系統] 已進入 God Mode，現在只會修改當前角色人格。' }, 'system');
        return;
    }

    if (userMessageUpper === GOD_MODE_EXIT_COMMAND && isGodModeActive) {
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
        await getGodModeResponse();
        return;
    }

    memoryManager.addMessage(currentPersonaKey!, 'user', userContent);
    await getResponse([], userMessage);
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
    interestsGridContainer.innerHTML = '<p class="text-gray-400 col-span-1 md:col-span-2 text-center">興趣技能在 aigf4 第一版暫時停用。</p>';
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
        .filter(msg => msg.content.imageUrl)
        .map(msg => ({
            imageUrl: msg.content.imageUrl!,
            caption: msg.content.text || '',
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
    albumModalTitle.textContent = `${currentPersona.name}?�相簿`;
    albumGridContainer.innerHTML = '';

    if (albumPhotos.length === 0) {
        albumGridContainer.innerHTML = `<p class="text-gray-400 col-span-full text-center py-8">?�簿?�空?�。在?�天中�? ${currentPersona.name} ?�照來�??�照?�吧�?/p>`;
        albumActions.classList.add('hidden');
        return;
    }
     albumActions.classList.remove('hidden');


    albumPhotos.forEach((photo, index) => {
        const thumb = document.createElement('div');
        thumb.className = 'album-thumbnail';
        thumb.innerHTML = `
            <img src="${photo.imageUrl}" alt="Photo ${index + 1}" class="w-full h-full object-cover">
            <input type="checkbox" class="thumbnail-checkbox form-checkbox h-5 w-5 text-yellow-500 bg-gray-900/50 border-gray-500 focus:ring-yellow-400 rounded">
        `;
        
        const checkbox = thumb.querySelector('.thumbnail-checkbox') as HTMLInputElement;

        thumb.addEventListener('click', (e) => {
             if (e.target !== checkbox) {
                openPhotoViewer(photo.imageUrl, photo.caption);
            }
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
    albumDownloadBtn.textContent = '?��?�?..';
    
    const zip = new JSZip();
    const downloadPromises = Array.from(selectedPhotoIndices).map(async (index) => {
        const photo = albumPhotos[index];
        const response = await fetch(photo.imageUrl);
        const blob = await response.blob();
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
        albumDownloadBtn.textContent = '下�??��??�目';
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


function deleteSelectedPhotos() {
    if (selectedPhotoIndices.size === 0 || !currentPersonaKey) return;
    
    // Get the history indices of the photos to be deleted
    const historyIndicesToDelete = new Set(
        Array.from(selectedPhotoIndices).map(photoIndex => albumPhotos[photoIndex].historyIndex)
    );

    // Filter the chat history, keeping only messages whose index is NOT in the deletion set
    const currentHistory = memoryManager.getChatHistory(currentPersonaKey);
    const newHistory = currentHistory.filter((_, index) => !historyIndicesToDelete.has(index));
    
    memoryManager.setChatHistory(currentPersonaKey, newHistory);
    
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
    appendMessage({ text: '--- ?�場?��?�?---' }, 'system');
    memoryManager.addMessage(currentPersonaKey, 'system', { text: '[SCENE END]' });
    moreOptionsMenu.classList.add('hidden');
};

const openPhotoPromptModal = () => {
    showDisabledFeatureNotice('聊天照片生成');
};

const closePhotoPromptModal = () => {
    photoPromptModal.classList.add('hidden');
};

const generatePhotoFromPrompt = async () => {
    showDisabledFeatureNotice('聊天照片生成');
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
    
    createPersonaBtn.addEventListener('click', () => showDisabledFeatureNotice('角色建立'));
    randomRecruitBtn.addEventListener('click', () => showDisabledFeatureNotice('隨機招募'));
    closeCreatorModal.addEventListener('click', hidePersonaCreator);
    cancelCreatorBtn.addEventListener('click', hidePersonaCreator);
    mimicImportBtn.addEventListener('click', openMimicImportModal);
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

    clearChatBtn.addEventListener('click', () => {
        if (currentPersonaKey && currentPersona) {
            if (confirm(`\u78ba\u5b9a\u8981\u6e05\u9664 ${currentPersona.name} \u7684\u5c0d\u8a71\u7d00\u9304\u55ce\uff1f`)) {
                memoryManager.clearChatHistory(currentPersonaKey);
                startChat(currentPersonaKey);
            }
        }
        moreOptionsMenu.classList.add('hidden');
    });
    
    suggestionButton.addEventListener('click', () => showDisabledFeatureNotice('建議功能'));
    newSceneBtn.addEventListener('click', startNewScene);
    takePhotoBtn.addEventListener('click', () => {
        showDisabledFeatureNotice('聊天照片生成');
        moreOptionsMenu.classList.add('hidden');
    });

    // Photo prompt modal listeners
    closePhotoPromptModalBtn.addEventListener('click', closePhotoPromptModal);
    cancelPhotoGeneration.addEventListener('click', closePhotoPromptModal);
    generatePhotoBtn.addEventListener('click', () => showDisabledFeatureNotice('聊天照片生成'));

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
    await refreshAuthSession();
};

void init();


