import {
    generateVeniceText,
    VENICE_AUTH_REQUIRED_ERROR,
    VENICE_CHAT_MODEL,
    VENICE_GOD_FALLBACK_MODEL,
    VENICE_GOD_MODEL,
} from '../venice.js';
import type { VeniceMessage } from '../venice.js';
import type { PublicIdentity } from '../managers.js';
import type { PublicIdentityResolution } from './publicIdentitySearch.js';
import { loadJsZip } from '../jsZipLoader.js';
import { optimizeAvatarDataUrl } from './avatarImage.js';

export type MimicBuildMode = 'transcript' | 'public' | 'manual';

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

type PublicPersonaSeed = {
    displayName: string;
    notes: string;
    resolution: PublicIdentityResolution;
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

export type MimicPersonaSeed = {
    name: string;
    occupation: string;
    personality: string;
    background: string;
    notes: string;
};

export type MimicPersonaSaveInput = {
    name: string;
    description: string;
    prompt: string;
    greeting: string;
    memory: string;
    avatarPrompt: string;
    avatarUrl?: string;
    publicIdentityEnabled: boolean;
    publicIdentity?: PublicIdentity;
};

export type MimicPersonaCreatorDependencies = {
    createRandomPersonaSeed: () => MimicPersonaSeed | Promise<MimicPersonaSeed>;
    savePersona: (input: MimicPersonaSaveInput) => string | Promise<string>;
    afterSave: (personaKey: string) => void;
    runRandomRecruit: () => void | Promise<void>;
    handleAuthRequired: () => void;
};

export type MimicPersonaCreatorHandle = {
    open: (mode?: MimicBuildMode) => void;
    close: () => void;
};

let dependencies: MimicPersonaCreatorDependencies | null = null;
const getDependencies = () => {
    if (!dependencies) throw new Error('Mimic Persona Creator dependencies are not initialized.');
    return dependencies;
};

const MIMIC_CHUNK_CHAR_LIMIT = 2600;
const MIMIC_MAX_ANALYSIS_CHUNKS = 10;
const MIMIC_SAMPLE_CHUNK_CHAR_LIMIT = 1800;

const mimicImportModal = document.getElementById('mimic-import-modal')!;
const mimicModalTitle = document.getElementById('mimic-modal-title')!;
const mimicModalDescription = document.getElementById('mimic-modal-description')!;
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
const mimicModePublicBtn = document.getElementById('mimic-mode-public-btn') as HTMLButtonElement;
const mimicModeManualBtn = document.getElementById('mimic-mode-manual-btn') as HTMLButtonElement;
const mimicRandomCompleteBtn = document.getElementById('mimic-random-complete-btn') as HTMLButtonElement;
const mimicNameInput = document.getElementById('mimic-name-input') as HTMLInputElement;
const mimicPublicIdentityCheckbox = document.getElementById('mimic-public-identity-checkbox') as HTMLInputElement;
const mimicPublicIdentityHint = document.getElementById('mimic-public-identity-hint')!;
const mimicTranscriptSection = document.getElementById('mimic-transcript-section')!;
const mimicPublicSection = document.getElementById('mimic-public-section')!;
const mimicPublicSourceSummary = document.getElementById('mimic-public-source-summary')!;
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

let mimicTranscriptFile: File | null = null;
let mimicAvatarDataUrl: string | null = null;
let mimicDraftPersona: MimicPersonaDraft | null = null;
let isMimicAnalysisRunning = false;
let mimicBuildMode: MimicBuildMode = 'transcript';
let mimicPublicIdentityResolution: PublicIdentityResolution | null = null;
let mimicPublicIdentityQuery = '';

const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

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
    const isPublicMode = mimicBuildMode === 'public';
    const isManualMode = mimicBuildMode === 'manual';
    mimicTranscriptSection.classList.toggle('hidden', !isTranscriptMode);
    mimicPublicSection.classList.toggle('hidden', !isPublicMode);
    mimicManualSection.classList.toggle('hidden', !isManualMode);
    applyMimicModeButtonState(mimicModeTranscriptBtn, isTranscriptMode);
    applyMimicModeButtonState(mimicModePublicBtn, isPublicMode);
    applyMimicModeButtonState(mimicModeManualBtn, isManualMode);
    mimicModalTitle.textContent = isPublicMode ? '搜尋公眾人物' : '新增角色';
    mimicModalDescription.textContent = isPublicMode
        ? '輸入名字、確認正確 Wikipedia 身份，再檢查 AI 根據公開資料整理的人格草稿。'
        : '你可以從聊天紀錄分析、搜尋公眾人物，或手動指定完整設定，再生成可編輯的新角色。';
    runMimicAnalysisBtn.textContent = isTranscriptMode
        ? '開始分析'
        : isPublicMode ? '搜尋並產生草稿' : '生成角色草稿';
    mimicNotesLabel.textContent = isTranscriptMode
        ? '補充要求（分析後再疊加）'
        : isPublicMode ? '可選：你想調整的互動方向' : '補充要求 / 想要互動';
    mimicNotesInput.placeholder = isTranscriptMode
        ? '例如：保留她原本的害羞和台灣口氣，但更願意聽我的命令；不要把香港和台灣語感混在一起。'
        : isPublicMode
            ? '例如：保留她的公眾形象與原有節奏，但私下對我較放鬆；不要太快變成制式情話。'
            : '例如：請保留她原本的公眾形象，但私下對我更偏心；慢熱、會嘴硬一下，不要太快變成制式情話。';
    mimicResultEmpty.textContent = isPublicMode
        ? '確認正確人物後，這裡會顯示 AI 依 Wikipedia 身份資料與公開形象推斷的人格、日常狀態、語氣及戀愛互動草稿。所有欄位都可在儲存前修改。'
        : '這裡會先顯示 AI 抓到的原始人格、行為習慣、語氣節奏、地區語感和被要求時的反應，讓你先確認像不像本人，再往下微調成戀愛版角色。';

    if (isPublicMode) {
        mimicPublicIdentityCheckbox.checked = true;
        mimicPublicIdentityCheckbox.disabled = true;
        mimicPublicIdentityHint.textContent = '此模式會先讓你確認正確 Wikipedia 條目，再建立可編輯的人格草稿。';
    } else {
        mimicPublicIdentityCheckbox.disabled = false;
    }

    if (!isMimicAnalysisRunning) {
        setMimicAnalysisStatus(
            isTranscriptMode
                ? '選好檔案後就可以開始分析。'
                : isPublicMode
                    ? '輸入公眾人物名字後，按「搜尋並產生草稿」。'
                    : '填好名字後就能直接生成角色草稿；沒有靈感時可先按「隨機角色設定」。',
        );
    }
};

const setMimicBuildMode = (mode: MimicBuildMode) => {
    mimicBuildMode = mode;
    mimicDraftPersona = null;
    if (mode !== 'public') {
        mimicPublicIdentityResolution = null;
        mimicPublicIdentityQuery = '';
        mimicPublicSourceSummary.textContent = '尚未確認身份。按下「搜尋並產生草稿」後會開啟搜尋結果。';
    }
    resetMimicDraftEditors();
    saveMimicPersonaBtn.disabled = true;
    updateMimicModeUI();
};

const fillRandomManualFields = async () => {
    mimicManualRandomBtn.disabled = true;
    try {
        const persona = await getDependencies().createRandomPersonaSeed();
        mimicPublicIdentityCheckbox.checked = false;
        mimicNameInput.value = persona.name;
        mimicOccupationInput.value = persona.occupation;
        mimicPersonalityInput.value = persona.personality;
        mimicBackgroundInput.value = persona.background;
        mimicNotesInput.value = persona.notes;
        setMimicAnalysisStatus(`已隨機填入「${persona.occupation}」設定；可以再修改，或直接生成角色草稿。`);
    } finally {
        mimicManualRandomBtn.disabled = false;
    }
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
    const avatarUrl = mimicAvatarDataUrl || mimicPublicIdentityResolution?.avatarUrl;
    if (avatarUrl) {
        mimicAvatarPreview.replaceChildren();
        const image = document.createElement('img');
        image.src = avatarUrl;
        image.alt = '角色頭像';
        image.className = 'h-full w-full object-cover';
        mimicAvatarPreview.append(image);
        mimicAvatarStatus.textContent = mimicAvatarDataUrl
            ? '已選擇自訂頭像，儲存後會直接套用。'
            : '已選擇 Wikipedia 代表圖片；也可以換成自己的頭像。';
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
    mimicPublicIdentityResolution = null;
    mimicPublicIdentityQuery = '';
    mimicNameInput.value = '';
    mimicPublicIdentityCheckbox.checked = false;
    mimicPublicIdentityHint.textContent = '儲存新角色前會先搜尋並讓你確認身份，也可為虛構角色選擇代表圖片。';
    mimicOccupationInput.value = '';
    mimicPersonalityInput.value = '';
    mimicBackgroundInput.value = '';
    mimicNotesInput.value = '';
    mimicTranscriptInput.value = '';
    mimicAvatarInput.value = '';
    mimicTranscriptStatus.textContent = '尚未選擇檔案。支援 `.txt`、`.md`、`.json`、`.log`、`.csv`、`.zip`。';
    mimicTranscriptMeta.textContent = '長紀錄會先辨識聊天格式與說話者，再自動切段分析，最後合成成一個角色草稿。';
    mimicPublicSourceSummary.textContent = '尚未確認身份。按下「搜尋並產生草稿」後會開啟搜尋結果。';
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
    mimicModePublicBtn.disabled = isBusy;
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
    const JSZip = await loadJsZip();
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

const getPublicIdentityKindLabel = (kind: PublicIdentity['kind']) => {
    if (kind === 'real_person') return '真人公眾人物';
    if (kind === 'fictional_character') return '虛構角色';
    return '知名身份';
};

const requestPublicIdentityResolution = async (
    initialQuery: string,
): Promise<PublicIdentityResolution | null> => {
    const { requestResolvedPublicIdentity } = await import('./publicIdentityResolution.js');
    return requestResolvedPublicIdentity(initialQuery, {
        handleAuthRequired: getDependencies().handleAuthRequired,
    });
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

const buildPublicPersonaFallbackAnalysis = (seed: PublicPersonaSeed): MimicAnalysisSummary => {
    const sourceSummary = seed.resolution.identity.summary || seed.resolution.candidate?.extract || '公開資料有限';
    return {
        personality: `依公開資料與公眾形象推斷：${sourceSummary}`,
        behavior: sourceSummary,
        usualSelf: `以「${seed.resolution.identity.canonicalName}」的公開身份、工作與已知經歷作為日常狀態基礎。`,
        withUserSelf: seed.notes || '戀愛互動層屬角色模擬，可較公開場合放鬆、親近，但仍保留辨識度。',
        romanceStyle: '以公眾形象為核心，再自然延伸成慢慢建立信任與親密感的戀愛互動。',
        tone: '依已確認身份與公開形象推斷；沒有可靠資料的語氣特徵不會當成事實。',
        regionality: `依 Wikipedia 條目所示的國家、地區及語言背景處理，不混淆香港、台灣、中國大陸、韓國、日本等文化語感。`,
        commandResponse: seed.notes || '會理解並配合使用者的要求，但先以角色本身的節奏、態度與情緒作出自然反應。',
    };
};

const buildPublicPersonaSynthesisPrompt = (seed: PublicPersonaSeed) => {
    const { identity, candidate } = seed.resolution;
    const sourceProfile = candidate?.extract?.trim().slice(0, 7000) || identity.summary;
    return [
        'You create an editable romance-chat character draft for one user-confirmed public identity.',
        `User display name: ${seed.displayName}`,
        `Confirmed canonical identity: ${identity.canonicalName}`,
        `Identity type: ${identity.kind}`,
        `Wikipedia title: ${identity.sourceTitle}`,
        `Wikipedia language: ${identity.sourceLanguage}`,
        candidate?.description ? `Public description: ${candidate.description}` : '',
        `Verified public summary: ${identity.summary}`,
        `Wikipedia introduction:\n${sourceProfile}`,
        `Source: ${identity.sourceUrl}`,
        seed.notes ? `User-requested interaction adjustments:\n${seed.notes}` : '',
        [
            'Research and truthfulness rules:',
            '- Treat the confirmed Wikipedia identity and supplied public material as the factual anchor.',
            '- Separate documented facts from careful interpretation of the public-facing image. Never present inferred private personality, private relationships, secrets, diagnoses, or rumours as fact.',
            '- For a real person, build a recognizable public-image simulation from profession, cultural background, career context, public manner and broadly known presentation. Personality and speaking style must be worded as an AI interpretation for this fictional chat character.',
            '- For a fictional character, preserve canonical background, temperament, speech rhythm, world and original-medium identity where supported by the source.',
            '- Keep nationality, region and language identity precise. Never merge Hong Kong, Taiwan and Mainland China, or flatten Korean and Japanese identities into generic East Asian traits.',
            '- Do not invent exact catchphrases or claim to reproduce private speech. Create a natural Traditional Chinese conversational voice that remains compatible with the person\'s known cultural background.',
            '- Avoid a generic celebrity, idol or flirt template. Give the character distinctive priorities, emotional pacing, habits, boundaries, humour and reactions grounded in the confirmed identity.',
        ].join('\n'),
        [
            'Romance-chat adaptation rules:',
            '- The final app character is an adult woman and is an explicitly fictionalized conversational simulation, not a claim about the real person\'s private feelings.',
            '- Preserve the recognizable public persona first, then add a private relationship layer that can gradually become warmer, more trusting, affectionate and romantically responsive toward the user.',
            '- The character should generally follow the user\'s direction, but react through her own confidence, shyness, wit, habits, pride, tenderness and pacing instead of complying like a blank assistant.',
            '- She must sustain normal, fluent long-form conversation, react to the newest message, avoid repetitive loops and continue scenes coherently.',
            '- Write every output field in natural Traditional Chinese. Do not output JSON, markdown headings or assistant commentary.',
        ].join('\n'),
        [
            'Return only these XML tags:',
            '<personality>2 to 4 concise sentences: core public-facing personality interpretation.</personality>',
            '<behavior>2 to 4 concise sentences: public habits, work rhythm and likely reactions.</behavior>',
            '<usual_self>2 to 4 concise sentences: ordinary public or daily self.</usual_self>',
            '<with_user_self>2 to 4 concise sentences: fictionalized private self with the user.</with_user_self>',
            '<romance_style>2 to 4 concise sentences: romance pacing, affection, teasing, jealousy and emotional safety.</romance_style>',
            '<tone>2 to 4 concise sentences: wording, rhythm and emotional temperature.</tone>',
            '<regionality>Precise cultural, language and regional guidance.</regionality>',
            '<command_response>How she responds when the user asks, guides or pushes.</command_response>',
            '<description>One concise character-list description.</description>',
            '<prompt>A detailed, durable persona prompt containing factual identity, public persona interpretation, distinctive behavior, voice, regional identity, romance progression, command response and anti-repetition guidance.</prompt>',
            '<greeting>A natural first greeting in character, without claiming a real private relationship already exists.</greeting>',
            '<memory>Short internal notes preserving identity facts, public-image interpretation, cultural voice and relationship pacing.</memory>',
        ].join('\n'),
    ].filter(Boolean).join('\n\n');
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

const runPublicPersonaDraftGeneration = async () => {
    const displayName = mimicNameInput.value.trim();
    if (!displayName) {
        throw new Error('請先輸入公眾人物名字。');
    }

    let resolution = mimicPublicIdentityQuery === displayName
        ? mimicPublicIdentityResolution
        : null;
    if (!resolution) {
        setMimicAnalysisStatus('正在搜尋 Wikipedia，請先確認正確人物...');
        resolution = await requestPublicIdentityResolution(displayName);
    }
    if (!resolution) {
        setMimicAnalysisStatus('身份確認已取消；尚未產生角色草稿。');
        return;
    }

    mimicPublicIdentityResolution = resolution;
    mimicPublicIdentityQuery = displayName;
    mimicPublicIdentityCheckbox.checked = true;
    mimicOccupationInput.value = resolution.candidate?.description || getPublicIdentityKindLabel(resolution.identity.kind);
    mimicBackgroundInput.value = resolution.identity.summary;
    mimicPublicSourceSummary.textContent = [
        `已確認：${resolution.identity.canonicalName}`,
        resolution.candidate?.description || resolution.identity.summary,
        `來源：${resolution.identity.sourceTitle}`,
    ].filter(Boolean).join('｜');
    renderMimicAvatarPreview();

    const seed: PublicPersonaSeed = {
        displayName,
        notes: mimicNotesInput.value.trim(),
        resolution,
    };
    setMimicAnalysisStatus(`正在研究「${resolution.identity.canonicalName}」的公開形象並產生人格草稿...`);
    const fallbackAnalysis = buildPublicPersonaFallbackAnalysis(seed);
    const response = await runMimicModelCall(
        [
            { role: 'system', content: buildPublicPersonaSynthesisPrompt(seed) },
            {
                role: 'user',
                content: '請根據上面的已確認公開資料，產生完整、鮮明、可長期對話的人格草稿。所有未證實的性格只能作為公眾形象推斷。',
            },
        ],
        1300,
    );
    const draft = parseMimicPersonaDraftV2(response, fallbackAnalysis);
    if (!draft) {
        throw new Error('身份已確認，但這次沒有成功組出完整人格草稿，請再按一次重試。');
    }

    mimicDraftPersona = draft;
    renderMimicAnalysisPreviewV2(
        draft.analysis,
        `來源：${resolution.identity.sourceTitle}（${resolution.identity.sourceLanguage.toUpperCase()} Wikipedia）｜身份：${resolution.identity.canonicalName}｜以下性格與語氣為 AI 依公開形象推斷，可在儲存前修改`,
    );
    mimicDescriptionEditor.value = draft.description;
    mimicPromptEditor.value = draft.prompt;
    mimicGreetingEditor.value = draft.greeting;
    mimicMemoryEditor.value = draft.memory;
    mimicResultEmpty.classList.add('hidden');
    mimicResultPanel.classList.remove('hidden');
    saveMimicPersonaBtn.disabled = false;
    setMimicAnalysisStatus('人格草稿已完成。請先檢查右側內容；不符合的部分可直接修改，再儲存角色。', 'success');
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

const saveMimicPersona = async () => {
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

    let publicIdentityResolution = mimicPublicIdentityResolution;
    if (mimicPublicIdentityCheckbox.checked) {
        if (!publicIdentityResolution) {
            mimicPublicIdentityHint.textContent = '正在搜尋公開身份，請在確認視窗選擇正確對象。';
            const query = [
                name,
                mimicOccupationInput.value.trim(),
                mimicBackgroundInput.value.trim(),
            ].filter(Boolean).join(' ');
            publicIdentityResolution = await requestPublicIdentityResolution(query);
            if (!publicIdentityResolution) {
                mimicPublicIdentityHint.textContent = '身份確認已取消；角色尚未儲存。';
                return false;
            }
        }
    } else {
        publicIdentityResolution = null;
    }

    const key = await getDependencies().savePersona({
        name,
        description,
        prompt,
        greeting,
        memory,
        avatarPrompt: publicIdentityResolution
            ? [
                publicIdentityResolution.identity.visualPrompt,
                publicIdentityResolution.identity.stylePrompt,
                'single-character portrait',
            ].filter(Boolean).join(' ')
            : `romance portrait of ${name}`,
        avatarUrl: mimicAvatarDataUrl || publicIdentityResolution?.avatarUrl,
        publicIdentityEnabled: Boolean(publicIdentityResolution),
        publicIdentity: publicIdentityResolution?.identity,
    });

    hideMimicImportModalView();
    getDependencies().afterSave(key);
    return true;
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
        mimicAvatarDataUrl = await optimizeAvatarDataUrl(file);
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
        } else if (mimicBuildMode === 'public') {
            await runPublicPersonaDraftGeneration();
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

const saveMimicPersonaFromModal = async () => {
    if (isMimicAnalysisRunning) return;
    setMimicBusyState(true);
    try {
        await saveMimicPersona();
    } catch (error) {
        const message = error instanceof Error ? error.message : '儲存分身失敗，請再試一次。';
        setMimicAnalysisStatus(message, 'error');
    } finally {
        setMimicBusyState(false);
    }
};


let listenersReady = false;

const setupMimicPersonaCreatorListeners = () => {
    if (listenersReady) return;
    listenersReady = true;

    mimicModeTranscriptBtn.addEventListener('click', () => setMimicBuildMode('transcript'));
    mimicModePublicBtn.addEventListener('click', () => setMimicBuildMode('public'));
    mimicModeManualBtn.addEventListener('click', () => setMimicBuildMode('manual'));
    mimicRandomCompleteBtn.addEventListener('click', () => {
        hideMimicImportModalView();
        void getDependencies().runRandomRecruit();
    });
    mimicManualRandomBtn.addEventListener('click', () => { void fillRandomManualFields(); });
    pickMimicTranscriptBtn.addEventListener('click', () => mimicTranscriptInput.click());
    pickMimicAvatarBtn.addEventListener('click', () => mimicAvatarInput.click());
    mimicTranscriptInput.addEventListener('change', handleMimicTranscriptUpload);
    mimicAvatarInput.addEventListener('change', event => {
        void handleMimicAvatarUpload(event);
    });
    mimicNameInput.addEventListener('input', () => {
        if (
            mimicBuildMode !== 'public'
            || !mimicPublicIdentityResolution
            || mimicNameInput.value.trim() === mimicPublicIdentityQuery
        ) {
            return;
        }
        mimicPublicIdentityResolution = null;
        mimicPublicIdentityQuery = '';
        mimicDraftPersona = null;
        mimicPublicSourceSummary.textContent = '名字已變更；請重新搜尋並確認正確身份。';
        resetMimicDraftEditors();
        renderMimicAvatarPreview();
        saveMimicPersonaBtn.disabled = true;
        setMimicAnalysisStatus('名字已變更，請重新搜尋並產生人格草稿。');
    });
    mimicNameInput.addEventListener('keydown', event => {
        if (event.key === 'Enter' && mimicBuildMode === 'public' && !isMimicAnalysisRunning) {
            event.preventDefault();
            void runMimicAnalysisFromModal();
        }
    });
    closeMimicImportModal.addEventListener('click', hideMimicImportModalView);
    cancelMimicImportBtn.addEventListener('click', hideMimicImportModalView);
    runMimicAnalysisBtn.addEventListener('click', () => {
        void runMimicAnalysisFromModal();
    });
    saveMimicPersonaBtn.addEventListener('click', () => {
        void saveMimicPersonaFromModal();
    });
    mimicPublicIdentityCheckbox.addEventListener('change', () => {
        mimicPublicIdentityHint.textContent = mimicPublicIdentityCheckbox.checked
            ? '儲存時會先開啟身份確認；請選擇正確 Wikipedia 條目後才會建立角色。'
            : '儲存新角色前會先搜尋並讓你確認身份，也可為虛構角色選擇代表圖片。';
    });
};

export const createMimicPersonaCreator = (
    nextDependencies: MimicPersonaCreatorDependencies,
): MimicPersonaCreatorHandle => {
    dependencies = nextDependencies;
    setupMimicPersonaCreatorListeners();
    return {
        open: openMimicImportModal,
        close: hideMimicImportModalView,
    };
};