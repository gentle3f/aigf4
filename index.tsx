import {normalizeHongKongTraditional} from './traditionalChinese.js';
import {readDirector,formatDirector,consumeDirectorNext,type DirectorPreferences} from './worldlineDirector.js';
import {editWorldline2Request,getSystemTexts,readFullPromptSettings,resolveWorldline2Parts,composeWorldline2Parts,saveWorldline2Variable,type Worldline2PromptParts} from './worldline2Prompt.js';

import {
    CharacterPhotoProposal,
    ChatAttachment,
    ChatContextBridge,
    ChatMessage,
    ChatSegment,
    Content,
    DIARY_CHECKPOINT,
    MemoryManager,
    Persona,
    PersonaMemoryEntry,
    POLICY_VIOLATION,
    PublicIdentity,
    SurpriseEventContentMode,
    SurpriseEventProposal,
    WardrobeState,
    cleanAiResponse,
} from "./managers.js";
import { createDurableChatTurn, browserTurnLock, type TurnIdentity, type TurnReceipt, type DurableHistory } from './durableChatTurn.js';
import {createNativeStoryPilot,NATIVE_SYNC_KEY,nativePilotEnabled} from './nativeStoryPilotRuntime.js';
import {getPilotConnection,pilotConnectionEnabled} from './pilotConnection.js';
import {askPilotLogin,openPilotMediaLogin} from './pilotLoginUi.js';
import {digestWorldlineContext,verifyWorldlineAppliedPrefix,commitWorldlineReply} from './durableWorldlineTurn.js';
import { runDurableChatStage } from './vpsStageRunner.js';
import { buildVpsWorkflowPayload, decodeVpsWorkflow } from './vpsWorkflow.js';
import { createGroupCommit, digestGroupContext } from './durableGroupTurn.js';
import { listVpsRecovery,readVpsRecoveryText,findMatchingVpsRecovery } from './vpsRecovery.js';
import { GROUP_MEMORY_KEY, roomMemorySnapshot, groupMemoryAliases, groupMemoryPresence, constrainGroupMemories } from './durableGroupMemory.js';
import { createDurableMemoryTask, browserMemoryLock, type MemoryContext } from './durablePersonaMemory.js';
import { buildVpsCharacterPayload, createVpsChatTransport, decodeVpsCharacterResult, VPS_REVIEW_MODELS } from './vpsCharacterTransport.js';
import { QueuePilotError, type PilotJob } from './generationQueuePilot.js';
import { CURRENT_CONTEXT_DIGEST_VERSION } from './contextFingerprint.js';
import {ATOMIC_CLOUD_PREVIEW} from './atomicCloudPreview.js';
import { VPS_CHAT_BUILD, VPS_CHAT_MODE_KEY, selectVpsModel, digestVpsHistory, isVpsChatEligible } from './vpsChatMode.js';
import type { CloudBackupManager, CloudBackupProgress } from "./cloudBackup.js";
import { initializeCloudBackupState } from './cloudBackupState.js';
import { createComposerAutoSize } from './composerAutoSize.js';
import { WORLDLINE_SETTING_KEY, getWorldline, recordWorldlineTurn, reconcileWorldlineChronicle, updateWorldlineRegistry, buildWorldlinePrompt, buildWorldlineVariablePrompt, WORLDLINE_FIXED_HEADER, WORLDLINE_FIXED_CONTRACT } from './worldline.js';
import { buildWorldReadModel, compileWorldRecall } from './worldOs.js';
import { recordWorldResearch, captureResearchMessages, researchText, type ResearchContext } from './worldResearch.js';
import { WORLD_LEDGER_KEY, appendWorldBatches, buildRecoverableWorldExtractionMessages, compileWorldLedger, recoverWorldExtraction, pendingWorldSources, projectWorld, selectWorldBatch } from './worldLedger.js';
import { GROUP_V2_OWNER_PERSONAL_GUIDANCE, isGroupV2PersonalTrialEnabled, normalizeGroupV2OwnerReply, setGroupV2PersonalTrialEnabled } from './groupV2PersonalTrial.js';
import { formatOwnerProfileForGroup, loadOwnerProfile } from './ownerProfile.js';
import { formatRelationshipMeaningsForV2, loadMeaningLedger } from './relationshipMeaning.js';
import { RESEARCH_CAPTURE_SETTING_KEY, setPersistedAppSetting } from './appSettings.js';
import {
    ASSISTANT_TOPIC_PREFIX,
    ASSISTANT_TOPICS_SETTING_KEY,
    getAssistantTopicTitle,
    isAssistantConversationKey,
    listAssistantConversationKeys,
    normalizeAssistantTopicTitle,
    parseAssistantTopicTitles,
} from './assistantTopics.js';
import {
    MAX_ASSISTANT_FILE_CHARACTERS,
    MAX_ASSISTANT_TOTAL_FILE_CHARACTERS,
    extractAssistantJsonExport,
    isAssistantTextFile,
    wrapAssistantFileText,
} from './assistantFiles.js';
import {
    MAX_ASSISTANT_LARGE_JSON_CHARACTERS,
    extractAssistantJsonPatchExport,
    isAssistantJsonFile,
    patchAssistantJsonSave,
    prepareAssistantJsonSave,
    supportsAssistantLargeJson,
} from './assistantLargeSave.js';
import {
    buildAssistantZipDownload,
    extractAssistantZipExport,
    isAssistantZipFile,
    isSafeArchivePath,
    readAssistantZipArchive,
    type AssistantZipInspection,
} from './assistantZip.js';
import type { SupabaseCloudSyncState } from './supabaseCloudSync.js';
import { coreInstruction, VENICE_ASSISTANT_PERSONA_KEY } from "./personas.tsx";
import {
    cleanVeniceAssistantReply,
    cleanVeniceChatReply,
    generateVeniceText,
    getVeniceMessageAggregate,
    isInvalidVeniceChatReply,
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
    VeniceMessage,
    VeniceMessageContentPart,
} from "./venice.js";
import type {
    VeniceImageMode,
    VeniceImageModelSummary,
} from "./veniceImage.js";
import {
    VENICE_IMAGE_EDIT_MODEL,
    VENICE_IMAGE_GENERATE_MODEL,
} from "./veniceImagePolicy.js";
import { readPersistedVideoJob as readPersistedVideoJobFromStorage } from "./videoStudioPersistence.js";
import type { PublicIdentityResolution } from "./features/publicIdentitySearch.js";
import {
    ChatRoom,
    RoomManager,
    RoomMember,
    RoomMemoryEntry,
    RoomSceneState,
    IU_GROUP_ROOM_ID,
    ROOM_MEMBER_LIMIT,
    ROOM_PRESENT_MEMBER_LIMIT,
    cloneRoomSnapshot,
} from "./roomManager.js";
import {
    AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES,
    AUTO_MEMORY_MIN_IMPORTANCE,
    AUTO_MEMORY_SUMMARY_VERSION,
    AUTO_MEMORY_TURN_INTERVAL,
} from "./autoMemoryPolicy.js";
import type { MemoryBatchMode } from "./autoMemory.js";
import {
    ArchivedRecallTurn,
    formatMemoryPromptMetadata,
    getMemoryRecallLimit,
    selectRelevantMemories,
    selectRelevantArchivedTurns,
} from './memoryRetrieval.js';
import {
    autoMemoryMatchesManualDecision,
    detectExplicitMemoryIntent,
    getManualMemoryControlledSourceIds,
    getManualMemoryLongTermExclusionSummaries,
    inferExplicitMemoryKind,
    stripExplicitMemoryDirective,
} from './memoryPolicy.js';
import {
    addSessionMemory,
    clearSessionMemories,
    formatSessionMemoryPrompt,
    getSessionMemories,
    removeSessionMemoriesBySourceMessageIds,
} from './sessionMemory.js';
import {
    contentToGroupHistoryText,
    getGroupDisplaySegments,
    groupNarrationUsesFirstPerson,
    GroupGenerationResult,
    parseGroupGeneration,
    parseGroupXrayStates,
    resolveRoomMemberPersona,
    selectLegacyGroupHistory,
    selectGroupHistorySinceCurrentRealityLayer,
    stripGroupTransportResidue,
    trimTrailingUnansweredUserMessages,
} from "./groupChat.js";
import {
    buildNpcContinuityRequirement,
    collectEstablishedNpcNames,
    collectObservedNpcCandidates,
    extractDirectNpcNames,
    hasNpcPromotionIntent,
    inferNpcPromotionNames,
    inferNpcSpeakersForTurn,
    mergeEstablishedNpcNamesForTurn,
    isUnconfirmedAddressPrefixName,
    replyHasNpcSpeech,
    replyHasNonPersonNpcLabel,
    replyHasUnconfirmedAddressLabel,
} from "./npcDialogue.js";
import type { ObservedNpcPersonaDraft } from "./observedNpcPersona.js";
import {
    selectPhotoPromptVersion,
} from "./photoPromptPreference.js";
import {
    buildCharacterModelRoute,
    buildStrictReviewModelRoute,
    CHAT_MODEL_SETTINGS_STORAGE_KEY,
    getGenerationAttemptCount,
    parseChatModelSettings,
} from "./chatModelSettings.js";
import type { ChatModelSettings } from "./chatModelSettings.js";
import {
    STRICT_REVIEW_RESPONSE_FORMAT,
    STRICT_REVIEW_ISSUE_CODES,
} from "./strictReview.js";
import {
    applyGroupStrictReview,
    applySingleStrictReview,
} from "./engine/reviewApplication.js";
import { runReviewPipeline } from "./engine/review/reviewPipeline.js";
import type { ReviewPipelineAttemptContext } from "./engine/review/reviewPipeline.js";
import { runPreparedStrictReviewAttempt } from "./engine/review/reviewAttemptCoordinator.js";
import { buildJevRecentHistoryText, buildReviewState } from "./engine/review/reviewState.js";
import { serializeGroupGenerationForReview } from "./engine/review/groupCandidateSerialization.js";
import { startJevShadowEvaluation, type JevShadowRecord } from "./engine/review/jevShadow.js";
import { runGroupTurnAdapter } from "./engine/groupTurnAdapter.js";
import { runSingleTurnAdapter } from "./engine/singleTurnAdapter.js";
import {
    classifyGenerationAttemptFailure,
    classifySingleGenerationAttempt,
    classifyStrictReviewAttemptFailure,
    createGenerationTrace,
    createTracedGroupTurnDependencies,
    createTracedSingleTurnDependencies,
    markGenerationAttempt,
    markStrictReview,
    markStrictReviewAttempt,
} from "./engine/observability/generationTrace.js";
import type {
    GenerationAttemptTrace,
    GenerationTrace,
    StrictReviewAttemptTrace,
} from "./engine/observability/generationTrace.js";
import { scheduleReplyVisibleHaptic } from "./chatHaptics.js";
import { createVisibilityAwareTimeout } from "./visibilityAwareTimeout.js";
import { appendStoryInline } from './storyInline.js';
import { createBackgroundMedia } from './backgroundMedia.js';
const worldlineBackgroundMedia = createBackgroundMedia();
import {
    shouldCancelActiveRequestForConversation,
    shouldRenderCompletedReplyInConversation,
} from "./chatRequestNavigation.js";
import {
    CHAT_HISTORY_PRELOAD_SCROLL_PX,
    getHiddenChatHistoryCount,
    getInitialChatHistoryStartIndex,
    getPreviousChatHistoryStartIndex,
} from "./chatHistoryWindow.js";
import {
    advanceRelationshipState,
    formatRelationshipStatePrompt,
} from "./relationshipState.js";
import {
    getSurpriseEventCategoryLabel,
    getSurpriseEventIntensityLabel,
} from "./surpriseEventPresentation.js";
import {
    contextBridgeDisplayText,
    contextBridgeToSystemPrompt,
    ensureLatestSceneTransitionBridge,
    findLatestPrivateReturnHandoff,
} from "./conversationTransfer.js";
import {
    emptyWardrobeState,
    extractWardrobeEnvelope,
    formatWardrobeLedger,
    getLatestWardrobeState,
    normalizeWardrobeState,
} from "./wardrobe.js";
import type { WardrobeParticipant } from "./wardrobe.js";
import { preferencePrompt } from './chatExperience.js';
import { calculateMessageStartScrollTop, setInstantScrollTop } from './chatScroll.js';
import {
    classifyCharacterSystemPrompt,
    estimatePromptTokens,
    promptComponent,
    summarizePromptComponents,
    type PromptComponentSize,
} from './promptAccounting.js';
import { createConversationPromptCacheKey } from './veniceCache.js';
import {
    cancelChatPerformanceTurn,
    completeChatPerformanceTurn,
    isChatPerformanceEnabled,
    markChatPerformance,
    startChatPerformanceTurn,
} from './chatPerformance.js';



let groupChatPromptModuleLoad: Promise<typeof import('./groupChatPrompt.js')> | null = null;

const loadGroupChatPromptModule = () => {
    groupChatPromptModuleLoad ??= import('./groupChatPrompt.js');
    return groupChatPromptModuleLoad;
};

let researchCaptureModuleLoad: Promise<typeof import('./researchCapture.js')> | null = null;

const loadResearchCaptureModule = () => {
    researchCaptureModuleLoad ??= import('./researchCapture.js');
    return researchCaptureModuleLoad;
};

const isResearchCaptureEnabledForTurn = () => (
    localStorage.getItem(RESEARCH_CAPTURE_SETTING_KEY) === 'true'
);

let photoStoreModuleLoad: Promise<typeof import('./photoStore.js')> | null = null;
let chatMediaStoreModuleLoad: Promise<typeof import('./chatMediaStore.js')> | null = null;

const loadPhotoStoreModule = () => {
    photoStoreModuleLoad ??= import('./photoStore.js');
    return photoStoreModuleLoad;
};

const loadChatMediaStoreModule = () => {
    chatMediaStoreModuleLoad ??= import('./chatMediaStore.js');
    return chatMediaStoreModuleLoad;
};

const Type = {
    OBJECT: 'object',
    STRING: 'string',
    ARRAY: 'array',
    INTEGER: 'integer',
} as const;

const DEFAULT_CHAT_MODEL_SETTINGS: ChatModelSettings = {
    primary: VENICE_CHAT_MODEL,
    qualityFallback: VENICE_CHAT_QUALITY_FALLBACK_MODEL,
    emergencyFallback: VENICE_CHAT_FALLBACK_MODEL,
    ccPrimary: VENICE_CC_MODEL,
};

// --- DOM Elements ---
const personaSelectionView = document.getElementById('persona-selection-view')!;
const chatView = document.getElementById('chat-view')!;
const aiAssistantList = document.getElementById('ai-assistant-list')!;
const femalePersonaList = document.getElementById('female-persona-list')!;
const conversationSearchInput = document.getElementById('conversation-search-input') as HTMLInputElement;
let conversationSearchUserActivated = false;
const homeSearchToggle = document.getElementById('home-search-toggle') as HTMLButtonElement;
const homeMenuToggle = document.getElementById('home-menu-toggle') as HTMLButtonElement;
const homeMenu = document.getElementById('home-menu')!;
const homeChatModelSettingsBtn = document.getElementById('home-chat-model-settings') as HTMLButtonElement;
const homeLiveCloudBtn = document.getElementById('home-live-cloud') as HTMLButtonElement;
const homeCloudBackupBtn = document.getElementById('home-cloud-backup') as HTMLButtonElement;
const homeExportAll = document.getElementById('home-export-all') as HTMLButtonElement;
const newChatFab = document.getElementById('new-chat-fab') as HTMLButtonElement;
const newChatMenu = document.getElementById('new-chat-menu')!;
const createGroupRoomBtn = document.getElementById('create-group-room-btn') as HTMLButtonElement;
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
const downloadChatBtn = document.getElementById('download-chat-btn') as HTMLButtonElement;
const downloadAllChatsBtn = document.getElementById('download-all-chats-btn') as HTMLButtonElement;
const downloadImagesBtn = document.getElementById('download-images-btn') as HTMLButtonElement;
const uploadZipBtn = document.getElementById('upload-zip-btn')!;
const zipUploadInput = document.getElementById('zip-upload-input') as HTMLInputElement;
const randomRecruitBtn = document.getElementById('random-recruit-btn') as HTMLButtonElement;
const createPersonaBtn = document.getElementById('create-persona-btn')!;
const clearChatBtn = document.getElementById('clear-chat-btn') as HTMLButtonElement;
const newSceneBtn = document.getElementById('new-scene-btn') as HTMLButtonElement;
const takePhotoBtn = document.getElementById('take-photo-btn') as HTMLButtonElement;
const surpriseEventBtn = document.getElementById('surprise-event-btn') as HTMLButtonElement;
const surpriseEventOptionsModal = document.getElementById('surprise-event-options-modal')!;
const closeSurpriseEventOptionsBtn = document.getElementById('close-surprise-event-options') as HTMLButtonElement;
const cancelSurpriseEventOptionsBtn = document.getElementById('cancel-surprise-event-options') as HTMLButtonElement;
const confirmSurpriseEventOptionsBtn = document.getElementById('confirm-surprise-event-options') as HTMLButtonElement;
const surpriseEventSelectAll = document.getElementById('surprise-event-select-all') as HTMLInputElement;
const surpriseEventMemberCount = document.getElementById('surprise-event-member-count')!;
const surpriseEventMemberList = document.getElementById('surprise-event-member-list')!;
const surpriseEventOptionsError = document.getElementById('surprise-event-options-error')!;
const roomInfoBtn = document.getElementById('room-info-btn') as HTMLButtonElement;
const dmRoomMemberBtn = document.getElementById('dm-room-member-btn') as HTMLButtonElement;
const inviteCharacterBtn = document.getElementById('invite-character-btn') as HTMLButtonElement;
const leaveRoomMemberBtn = document.getElementById('leave-room-member-btn') as HTMLButtonElement;
const chatSearchBtn = document.getElementById('chat-search-btn') as HTMLButtonElement;
const appShell = document.getElementById('app-shell')!;
const authGate = document.getElementById('auth-gate')!;
const authForm = document.getElementById('auth-form') as HTMLFormElement;
const authPasswordInput = document.getElementById('auth-password-input') as HTMLInputElement;
const authError = document.getElementById('auth-error')!;
const authSubmitButton = document.getElementById('auth-submit-button') as HTMLButtonElement;
const authSubmitLabel = document.getElementById('auth-submit-label')!;
const authSubmitLoading = document.getElementById('auth-submit-loading')!;
const chatAttachmentInput = document.getElementById('chat-attachment-input') as HTMLInputElement;
const chatAttachmentPreview = document.getElementById('chat-attachment-preview')!;
const ASSISTANT_WEB_SEARCH_SETTING_KEY = 'veniceAssistantWebSearchV1';
const isVeniceAssistantWebSearchEnabled = () =>
    localStorage.getItem(ASSISTANT_WEB_SEARCH_SETTING_KEY) !== 'off';
const assistantWebSearchButton = document.createElement('button');
assistantWebSearchButton.type = 'button';
assistantWebSearchButton.className = 'assistant-web-search-switch rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-sky-400';
assistantWebSearchButton.title = '啟用 Venice 自動搜尋及網址讀取；網絡搜尋可能產生額外 API 費用。';
const updateAssistantWebSearchButton = () => {
    const enabled = isVeniceAssistantWebSearchEnabled();
    assistantWebSearchButton.textContent = enabled ? '🌐 網絡搜尋：自動' : '🌐 網絡搜尋：關閉';
    assistantWebSearchButton.setAttribute('aria-pressed', String(enabled));
};
assistantWebSearchButton.addEventListener('click', () => {
    setPersistedAppSetting(
        ASSISTANT_WEB_SEARCH_SETTING_KEY,
        isVeniceAssistantWebSearchEnabled() ? 'off' : 'auto',
    );
    updateAssistantWebSearchButton();
});
document.getElementById('refresh-assistant-models')?.after(assistantWebSearchButton);
updateAssistantWebSearchButton();
const assistantFileUploadButton = document.createElement('button');
assistantFileUploadButton.type = 'button';
assistantFileUploadButton.className = 'assistant-file-upload hidden';
assistantFileUploadButton.textContent = '📎 上傳 ZIP／JSON／大型存檔';
assistantFileUploadButton.title = '上傳檔案交由 Venice AI 分析';
assistantFileUploadButton.addEventListener('click', () => chatAttachmentInput.click());
chatAttachmentPreview.after(assistantFileUploadButton);
const composerCameraButton = document.getElementById('composer-camera-button') as HTMLButtonElement;
const imageStudioEntry = document.getElementById('image-studio-entry') as HTMLButtonElement;
const imageSeed = document.getElementById('image-seed') as HTMLInputElement;
const imageSeedLock = document.getElementById('image-seed-lock') as HTMLInputElement;
const videoStudioEntry = document.getElementById('video-studio-entry') as HTMLButtonElement;
// More Options Menu
const moreOptionsBtn = document.getElementById('more-options-btn')!;
const moreOptionsMenu = document.getElementById('more-options-menu')!;
const personaSettingsBtn = document.getElementById('persona-settings-btn')!;
const changeAvatarBtn = document.getElementById('change-avatar-btn') as HTMLButtonElement;
const ccModelSettingsBtn = document.getElementById('cc-model-settings-btn') as HTMLButtonElement;

// Save Before Exit Modal
const saveExitModal = document.getElementById('save-exit-modal')!;
const saveAndExitBtn = document.getElementById('save-and-exit-btn')!;
const exitWithoutSavingBtn = document.getElementById('exit-without-saving-btn')!;
const cancelExitBtn = document.getElementById('cancel-exit-btn')!;

// Photo Prompt Modal Elements


// Interests Module Elements

// Album Module Elements
const albumBtn = document.getElementById('album-btn')!;
const attachFileMenuBtn = document.getElementById('attach-file-menu-btn') as HTMLButtonElement;

// Memory Modal Elements
const memoryBtn = document.getElementById('memory-btn')!;
const publicFigureCreateBtn = document.getElementById('public-figure-create-btn') as HTMLButtonElement;
const mimicImportBtn = document.getElementById('mimic-import-btn') as HTMLButtonElement;
const roomInfoModal = document.getElementById('room-info-modal')!;
const addRoomMemberBtn = document.getElementById('add-room-member-btn') as HTMLButtonElement;
const openRoomMemoryBtn = document.getElementById('open-room-memory-btn') as HTMLButtonElement;
const exportRoomBtn = document.getElementById('export-room-btn') as HTMLButtonElement;

// --- Managers ---

const memoryManager = new MemoryManager();
const roomManager = new RoomManager();
roomManager.ensureIuGroupRoom(memoryManager);

let fileManager: import('./fileManager.js').FileManager | null = null;
let fileManagerLoad: Promise<import('./fileManager.js').FileManager> | null = null;

const loadFileManager = async () => {
    if (fileManager) return fileManager;
    if (!fileManagerLoad) {
        fileManagerLoad = import('./fileManager.js')
            .then(({ FileManager }) => {
                const manager = new FileManager(memoryManager, {
                    downloadAllChatsBtn,
                    downloadImagesBtn,
                    beforeAllDataRestore: () => {
                        if (activeChatRequest) cancelActiveChatRequest();
                    },
                    onSingleChatRestored: (key, history) => {
                        startChat(key, history);
                    },
                    onAllDataRestored: summary => {
                        roomManager.ensureIuGroupRoom(memoryManager);
                        renderPersonaList();
                        const conflictNote = summary.renamedConflicts
                            ? `\n${summary.renamedConflicts} 項同鍵但不同的資料已另存為「匯入備份」，沒有覆蓋原本內容。`
                            : '';
                        const duplicateNote = summary.skippedDuplicates
                            ? `\n${summary.skippedDuplicates} 項重複資料已略過，避免產生副本。`
                            : '';
                        alert(`安全匯入完成，共加入 ${summary.importedMessages.toLocaleString('zh-HK')} 則訊息。${conflictNote}${duplicateNote}`);
                        showSelectionView();
                    },
                }, roomManager);
                fileManager = manager;
                return manager;
            })
            .catch(error => {
                fileManagerLoad = null;
                throw error;
            });
    }
    return fileManagerLoad;
};

type CloudBackupUiHandle = {
    open: () => void;
    renderProgress: (progress: CloudBackupProgress) => void;
    refreshIfOpen: (fetchRemote?: boolean) => Promise<void>;
};
let cloudBackupUi: CloudBackupUiHandle | null = null;
let cloudBackupUiLoad: Promise<CloudBackupUiHandle> | null = null;

const cloudBackupStartupState = initializeCloudBackupState();
let cloudBackupManager: CloudBackupManager | null = null;
let cloudBackupManagerLoad: Promise<CloudBackupManager> | null = null;

const loadCloudBackupManager = async () => {
    if (cloudBackupManager) return cloudBackupManager;
    if (!cloudBackupManagerLoad) {
        cloudBackupManagerLoad = import('./cloudBackup.js')
            .then(({ CloudBackupManager }) => {
                const manager = new CloudBackupManager({
                    createAllDataArchive: async () => (await loadFileManager()).createAllDataArchive(),
                    getLastBackupMediaSummary: () => fileManager?.getLastBackupMediaSummary() || null,
                    restoreAllDataArchive: async (blob, askForConfirmation, replaceExisting) => (
                        await (await loadFileManager()).restoreAllDataArchive(blob, askForConfirmation, replaceExisting)
                    ),
                }, {
                    onProgress: progress => cloudBackupUi?.renderProgress(progress),
                    onStateChange: () => { void cloudBackupUi?.refreshIfOpen(false); },
                });
                manager.startAutoBackup();
                cloudBackupManager = manager;
                return manager;
            })
            .catch(error => {
                cloudBackupManagerLoad = null;
                throw error;
            });
    }
    return cloudBackupManagerLoad;
};

type LiveCloudUiHandle = {
    open: () => void;
    renderState: (state: SupabaseCloudSyncState) => void;
};
let liveCloudUi: LiveCloudUiHandle | null = null;
let liveCloudUiLoad: Promise<LiveCloudUiHandle> | null = null;

let supabaseCloudSyncManager: import('./supabaseCloudSync.js').SupabaseCloudSyncManager | null = null;
let supabaseCloudSyncManagerLoad: Promise<import('./supabaseCloudSync.js').SupabaseCloudSyncManager> | null = null;

const loadSupabaseCloudSyncManager = async () => {
    if (supabaseCloudSyncManager) return supabaseCloudSyncManager;
    if (!supabaseCloudSyncManagerLoad) {
        supabaseCloudSyncManagerLoad = import('./supabaseCloudSync.js')
            .then(({ SupabaseCloudSyncManager }) => {
                const manager = new SupabaseCloudSyncManager(memoryManager, roomManager, {
                    onStateChange: state => liveCloudUi?.renderState(state),
                    onRemoteApplied: () => {
                        if(ATOMIC_CLOUD_PREVIEW)window.setTimeout(()=>void resumeVpsChatTurn(),0);
                        roomManager.ensureIuGroupRoom(memoryManager);
                        renderPersonaList();
                        if (currentConversationKey) {
                            const draft = messageInput.value;
                            startChat(currentConversationKey, null, 'skip');
                            messageInput.value = draft;
                            resetMessageInput();
                            updateSendButtonState();
                        }
                    },
                }, VPS_CHAT_BUILD&&!ATOMIC_CLOUD_PREVIEW,()=>!activeChatRequest&&!resumingVpsTurn&&!pendingVpsTurn(),ATOMIC_CLOUD_PREVIEW);
                supabaseCloudSyncManager = manager;
                return manager;
            })
            .catch(error => {
                supabaseCloudSyncManagerLoad = null;
                throw error;
            });
    }
    return supabaseCloudSyncManagerLoad;
};

const startSupabaseCloudSync = async () => {
    if (VPS_CHAT_BUILD&&!ATOMIC_CLOUD_PREVIEW) return;
    const manager = await loadSupabaseCloudSyncManager();
    await manager.start();
};

let veniceImageModuleLoad: Promise<typeof import('./veniceImage.js')> | null = null;

const loadVeniceImageModule = () => {
    veniceImageModuleLoad ??= import('./veniceImage.js');
    return veniceImageModuleLoad;
};

const listVeniceImageModels = async (mode?: VeniceImageMode) => (
    await loadVeniceImageModule()
).listVeniceImageModels(mode);

const requestVeniceImage = async (
    request: import('./veniceImage.js').VeniceImageRequest,
) => (
    await loadVeniceImageModule()
).requestVeniceImage(request);

const readPreferredImageGenerateModel = () => {
    const storageKey = 'veniceImageGenerateModel';
    const stored = localStorage.getItem(storageKey);
    if (!stored || stored === 'lustify-v8') {
        setPersistedAppSetting(storageKey, VENICE_IMAGE_GENERATE_MODEL);
        return VENICE_IMAGE_GENERATE_MODEL;
    }
    return stored;
};

const readPreferredImageEditModel = () => {
    const storageKey = 'veniceImageEditModel';
    const stored = localStorage.getItem(storageKey);
    if (!stored || stored === 'qwen-edit-uncensored') {
        setPersistedAppSetting(storageKey, VENICE_IMAGE_EDIT_MODEL);
        return VENICE_IMAGE_EDIT_MODEL;
    }
    return stored;
};


// --- State ---
let currentPersona: any = null;
let currentPersonaKey: string | null = null;
let currentConversationKey: string | null = null;
let currentRoom: ChatRoom | null = null;
let activeRoomMemberId: string | null = null;
let expandedLegacyHistoryConversationKey: string | null = null;
let renderedChatHistoryConversationKey: string | null = null;
let renderedChatHistory: ChatMessage[] = [];
let renderedChatHistoryStartIndex = 0;
let renderedChatHistoryAnchor: HTMLElement | null = null;
let renderedChatHistoryLoadOlderButton: HTMLButtonElement | null = null;
let isPrependingChatHistory = false;
let isChatHistoryAutoPreloadEnabled = false;
let isGodModeActive = false;
let godModeHistory: ChatMessage[] = [];
let chatRuntimeState: RequestState = 'idle';
let isUnlocked = !VENICE_API_BASE.startsWith('/');
let activeChatRequest: ActiveChatRequest | null = null;
let nextChatRequestId = 1;
let selectedAssistantModel = localStorage.getItem('veniceAssistantModel') || VENICE_ASSISTANT_MODEL;
let chatModelSettings = parseChatModelSettings(
    localStorage.getItem(CHAT_MODEL_SETTINGS_STORAGE_KEY),
    DEFAULT_CHAT_MODEL_SETTINGS,
);
let imageModels: Record<VeniceImageMode, VeniceImageModelSummary[]> = {
    generate: [],
    edit: [],
};
let imageModelPromises: Record<VeniceImageMode, Promise<void> | null> = {
    generate: null,
    edit: null,
};
let selectedImageModels: Record<VeniceImageMode, string> = {
    generate: readPreferredImageGenerateModel(),
    edit: readPreferredImageEditModel(),
};
let characterPhotoRequestController: AbortController | null = null;
let activeCharacterPhotoProposalId: string | null = null;
let switchingCharacterPhotoProposalId: string | null = null;
let pendingChatAttachments: Array<{ attachment: ChatAttachment; file: File; previewUrl?: string }> = [];
const assistantZipInspections = new Map<string, AssistantZipInspection>();
const chatAttachmentObjectUrls = new Map<string, string>();
let openMessageActionMenu: HTMLElement | null = null;
let personaSettingsUi: import('./features/personaSettingsUi.js').PersonaSettingsUiHandle | null = null;
const characterPhotoObjectUrls = new Map<string, string>();
let surpriseEventReplacingProposalId: string | null = null;
const roomSummaryInFlight = new Set<string>();
const personaSummaryInFlight = new Set<string>();

const USES_VENICE_PROXY_AUTH = VENICE_API_BASE.startsWith('/');

const GOD_MODE_ENTER_COMMAND = 'GOD MODE';
const GOD_MODE_EXIT_COMMAND = 'BYE GOD MODE';
const CHAT_HISTORY_MESSAGE_LIMIT = 48;
const CHAT_HISTORY_CHAR_BUDGET = 48000;
const GROUP_CHAT_HISTORY_MESSAGE_LIMIT = 40;
const GROUP_CHAT_HISTORY_CHAR_BUDGET = 40000;
const ASSISTANT_HISTORY_MESSAGE_LIMIT = 60;
const ASSISTANT_HISTORY_CHAR_BUDGET = 115000;
const GOD_MODE_HISTORY_LIMIT = 10;
const ROOM_MEMORY_SUMMARY_TURN_INTERVAL = AUTO_MEMORY_TURN_INTERVAL;
const AUTO_MEMORY_RECENT_MESSAGE_LIMIT = 32;
const AUTO_MEMORY_MODEL_TIMEOUT_MS = 50_000;
const CHAT_MAX_AUTO_CONTINUES = 2;
const CHAT_MODEL_ATTEMPT_TIMEOUT_MS = 45_000;
// DeepSeek and uncensored reasoning models can take minutes to produce a complete non-streamed reply.
const CHAT_SLOW_MODEL_ATTEMPT_TIMEOUT_MS = 265_000;
const SURPRISE_EVENT_ATTEMPT_TIMEOUT_MS = 45_000;
const CHAT_MODEL_TIMEOUT_ERROR = 'CHAT_MODEL_TIMEOUT';
const SCENE_END_MARKER = '[SCENE END]';
const SCENE_START_LABEL = '--- 新場景開始 ---';
const FIXED_MESSAGE_INPUT_HEIGHT = '3.5rem';
const ASSISTANT_MODEL_STORAGE_KEY = 'veniceAssistantModel';
const IMAGE_GENERATE_MODEL_STORAGE_KEY = 'veniceImageGenerateModel';
const IMAGE_EDIT_MODEL_STORAGE_KEY = 'veniceImageEditModel';
const IMAGE_ADULT_CONFIRM_STORAGE_KEY = 'veniceImageAdultConfirmed';
const IMAGE_SEED_STORAGE_KEY = 'veniceImageSeed';
const IMAGE_SEED_LOCK_STORAGE_KEY = 'veniceImageSeedLocked';
const CHARACTER_PHOTO_PROMPT_MAX_LENGTH = 1500;
const CHARACTER_PHOTO_EDITOR_MAX_LENGTH = 7500;

type AppHistoryState =
    | { view: 'home' }
    | { view: 'chat'; conversationKey: string; personaKey?: string }
    | { view: 'image' }
    | { view: 'video' };
type ChatMode = 'character' | 'assistant' | 'god' | 'photo' | 'event';
type SurpriseEventDrawOptions = {
    contentMode: SurpriseEventContentMode;
    participantIds: string[];
};
type ActiveChatRequest = {
    director?: DirectorPreferences;
    id: number;
    personaKey: string;
    conversationKey: string;
    persona: Persona;
    room?: ChatRoom;
    roomMemberId?: string;
    photoSenderMemberId?: string;
    photoSubjectMemberIds?: string[];
    attachments?: ChatAttachment[];
    attachmentParts?: VeniceMessageContentPart[];
    mode: ChatMode;
    characterPhotoRequest?: boolean;
    surpriseEvent?: SurpriseEventProposal;
    establishedNpcNames: string[];
    wardrobeState: WardrobeState;
    pendingWardrobeState?: WardrobeState;
    controller: AbortController;
    startedAt: number;
    vpsTurn?: { identity: TurnIdentity; model: string; receipt?: TurnReceipt; job?: PilotJob };
    /** Temporary DOM only. Never persisted until the full streamed answer finishes. */
    streamPreview?: HTMLElement;
};
type PhotoViewerContext = {
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
const HOME_HISTORY_STATE: AppHistoryState = { view: 'home' };


// --- Functions ---

const createFreshRandomPersona = async () => {
    const { createFreshRandomPersona: createPersonaSeed } = await import('./features/randomPersonaSeed.js');
    return createPersonaSeed(Object.values(memoryManager.getAllPersonas()));
};

let randomRecruitUi: import('./features/randomRecruit.js').RandomRecruitHandle | null = null;
let randomRecruitUiLoad: Promise<import('./features/randomRecruit.js').RandomRecruitHandle> | null = null;

const loadRandomRecruitUi = async () => {
    if (randomRecruitUi) return randomRecruitUi;
    if (!randomRecruitUiLoad) {
        randomRecruitUiLoad = import('./features/randomRecruit.js')
            .then(({ createRandomRecruit }) => {
                const ui = createRandomRecruit({
                    createPersona: createFreshRandomPersona,
                    persistPersona: persona => {
                        const personaKey = memoryManager.saveCustomPersona({
                            name: persona.name,
                            emoji: persona.emoji,
                            description: persona.description,
                            prompt: persona.prompt,
                            greeting: persona.greeting,
                            avatarPrompt: persona.avatarPrompt,
                            gender: 'female',
                        });
                        memoryManager.updatePersona(personaKey, { memory: persona.memory });
                        return personaKey;
                    },
                    loadImageModels: () => loadImageModels('generate'),
                    getImageModels: () => imageModels.generate,
                    requestImage: requestVeniceImage,
                    saveAvatar: (personaKey, avatarUrl) => memoryManager.setPersonaAvatar(personaKey, avatarUrl),
                    refreshPersonaList: renderPersonaList,
                    openPersonaChat: personaKey => startChat(personaKey, null, 'push'),
                    handleAuthRequired: () => handleAuthRequired(),
                });
                randomRecruitUi = ui;
                return ui;
            })
            .catch(error => {
                randomRecruitUiLoad = null;
                throw error;
            });
    }
    return randomRecruitUiLoad;
};

const randomlyRecruitNewPersona = async () => {
    const ui = await loadRandomRecruitUi();
    await ui.run();
};

const escapeRegExp = (value: string) => {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
const getPublicIdentityKindLabel = (kind: PublicIdentity['kind']) => {
    if (kind === 'real_person') return '真人公眾人物';
    if (kind === 'fictional_character') return '虛構角色';
    return '知名身份';
};

const requestPublicIdentityResolution = async (
    initialQuery: string,
): Promise<PublicIdentityResolution | null> => {
    const { requestResolvedPublicIdentity } = await import('./features/publicIdentityResolution.js');
    return requestResolvedPublicIdentity(initialQuery, {
        handleAuthRequired: () => handleAuthRequired(),
    });
};

let mimicPersonaCreatorUi: import('./features/mimicPersonaCreator.js').MimicPersonaCreatorHandle | null = null;
let mimicPersonaCreatorUiLoad: Promise<import('./features/mimicPersonaCreator.js').MimicPersonaCreatorHandle> | null = null;

const loadMimicPersonaCreatorUi = async () => {
    if (mimicPersonaCreatorUi) return mimicPersonaCreatorUi;
    if (!mimicPersonaCreatorUiLoad) {
        mimicPersonaCreatorUiLoad = import('./features/mimicPersonaCreator.js')
            .then(({ createMimicPersonaCreator }) => {
                const ui = createMimicPersonaCreator({
                    createRandomPersonaSeed: async () => {
                        const persona = await createFreshRandomPersona();
                        return {
                            name: persona.name,
                            occupation: persona.occupation,
                            personality: persona.personality,
                            background: persona.background,
                            notes: persona.notes,
                        };
                    },
                    savePersona: async input => {
                        const key = memoryManager.saveCustomPersona({
                            name: input.name,
                            emoji: '🫧',
                            description: input.description,
                            prompt: input.prompt,
                            greeting: input.greeting,
                            avatarPrompt: input.avatarPrompt,
                            gender: 'female',
                            publicIdentityEnabled: input.publicIdentityEnabled,
                            publicIdentity: input.publicIdentity,
                        });
                        memoryManager.updatePersona(key, {
                            description: input.description,
                            prompt: input.prompt,
                            greeting: input.greeting,
                            memory: input.memory,
                            publicIdentityEnabled: input.publicIdentityEnabled,
                            publicIdentity: input.publicIdentity,
                        });
                        if (input.avatarUrl?.startsWith('data:image/')) {
                            await memoryManager.setPersonaAvatar(key, input.avatarUrl);
                        } else if (input.avatarUrl !== undefined) {
                            memoryManager.updatePersona(key, { avatarUrl: input.avatarUrl });
                        }
                        return key;
                    },
                    afterSave: personaKey => {
                        renderPersonaList();
                        startChat(personaKey, null, 'push');
                    },
                    runRandomRecruit: () => randomlyRecruitNewPersona(),
                    handleAuthRequired: () => handleAuthRequired(),
                });
                mimicPersonaCreatorUi = ui;
                return ui;
            })
            .catch(error => {
                mimicPersonaCreatorUiLoad = null;
                throw error;
            });
    }
    return mimicPersonaCreatorUiLoad;
};

const openMimicImportModal = (mode: 'transcript' | 'public' | 'manual' = 'transcript') => {
    void loadMimicPersonaCreatorUi()
        .then(ui => ui.open(mode))
        .catch(error => console.error('Failed to load persona creator', error));
};
const resolveRoomMemberAvatarPersona = (member: RoomMember) => {
    if (member.persona.avatarUrl) return member.persona;
    return member.sourcePersonaKey
        ? memoryManager.getPersona(member.sourcePersonaKey) || member.persona
        : member.persona;
};

const enableAvatarPreview = (target: HTMLElement, persona: Persona) => {
    const avatarUrl = persona.avatarUrl;
    target.onclick = null;
    target.classList.remove('avatar-preview-target');
    target.removeAttribute('title');
    if (!avatarUrl || avatarUrl.startsWith('generating_')) return;
    target.classList.add('avatar-preview-target');
    target.title = `查看 ${persona.name} 的完整頭像`;
    target.onclick = event => {
        event.preventDefault();
        event.stopPropagation();
        openAvatarFullscreen(avatarUrl, persona.name);
    };
};


type AssistantTopicEntry = { key: string; title: string; timestamp: number; preview: string };
const readAssistantTopicNames = () => parseAssistantTopicTitles(localStorage.getItem(ASSISTANT_TOPICS_SETTING_KEY));
const storeAssistantTopicNames = (names: Record<string, string>) =>
    setPersistedAppSetting(ASSISTANT_TOPICS_SETTING_KEY, JSON.stringify(names));
const getAssistantTopicEntries = (): AssistantTopicEntry[] => {
    const names = readAssistantTopicNames();
    const keys = listAssistantConversationKeys(
        Object.keys(memoryManager.getAllChatHistories()),
        names,
        VENICE_ASSISTANT_PERSONA_KEY,
    );
    return keys.map(key => {
        const history = memoryManager.peekChatHistory(key);
        const userText = history.find(message => message.role === 'user')?.content.text || '';
        const latest = history.at(-1);
        return {
            key,
            title: getAssistantTopicTitle(key, VENICE_ASSISTANT_PERSONA_KEY, names, userText),
            timestamp: latest?.createdAt || 0,
            preview: latest?.content.text?.replace(/\s+/gu, ' ').slice(0, 72)
                || (key === VENICE_ASSISTANT_PERSONA_KEY ? '以前的 Venice AI 訊息' : '開始新對話'),
        };
    }).sort((left, right) => right.timestamp - left.timestamp);
};

let assistantTopicPanel: HTMLElement | null = null;
let assistantTopicToggle: HTMLButtonElement | null = null;
let assistantTopicPanelOpen = window.matchMedia('(min-width: 900px)').matches;
let assistantTopicSearch = '';
const createAssistantTopic = () => {
    if (activeChatRequest) cancelActiveChatRequest();
    const key = ASSISTANT_TOPIC_PREFIX + (crypto.randomUUID?.() || Math.random().toString(36).slice(2));
    const names = readAssistantTopicNames();
    names[key] = '新對話';
    storeAssistantTopicNames(names);
    memoryManager.setChatHistory(key, []);
    startChat(key);
};
const renameAssistantTopic = (key: string) => {
    if (key === VENICE_ASSISTANT_PERSONA_KEY) return;
    const current = getAssistantTopicEntries().find(topic => topic.key === key)?.title || '新對話';
    const reply = window.prompt('重新命名 Venice AI 話題', current);
    if (reply === null) return;
    const title = normalizeAssistantTopicTitle(reply);
    if (!title) return;
    const names = readAssistantTopicNames();
    names[key] = title;
    storeAssistantTopicNames(names);
    if (currentConversationKey === key) chatHeaderName.textContent = title;
    renderPersonaList();
};
const deleteAssistantTopic = async (key: string) => {
    if (key === VENICE_ASSISTANT_PERSONA_KEY) return;
    const name = getAssistantTopicEntries().find(topic => topic.key === key)?.title || '此話題';
    if (!window.confirm('確定刪除「' + name + '」及其對話紀錄？此操作不能復原。')) return;
    if (activeChatRequest?.conversationKey === key) cancelActiveChatRequest();
    const history = memoryManager.peekChatHistory(key);
    const assetIds = new Set(history.flatMap(message => message.content.attachments?.map(a => a.assetId) || []));
    if (assetIds.size) {
        const media = await loadChatMediaStoreModule();
        for (const id of assetIds) {
            await media.deleteChatAttachment(id).catch(error => console.warn('Failed to delete assistant attachment', error));
        }
    }
    memoryManager.deleteChatHistory(key);
    const names = readAssistantTopicNames();
    delete names[key];
    storeAssistantTopicNames(names);
    if (currentConversationKey === key) startChat(VENICE_ASSISTANT_PERSONA_KEY, null, 'replace');
    else renderPersonaList();
};

const renderAssistantTopicPanel = () => {
    const body = assistantTopicPanel?.querySelector<HTMLElement>('.assistant-topic-list');
    if (!body) return;
    body.replaceChildren();
    for (const entry of getAssistantTopicEntries()) {
        if (assistantTopicSearch && !entry.title.toLocaleLowerCase().includes(assistantTopicSearch)
            && !entry.preview.toLocaleLowerCase().includes(assistantTopicSearch)) continue;
        const row = document.createElement('div');
        row.className = 'assistant-topic-row';
        if (currentConversationKey === entry.key) row.classList.add('active');
        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'assistant-topic-name';
        select.textContent = entry.title;
        select.title = entry.preview;
        select.addEventListener('click', () => startChat(entry.key));
        row.appendChild(select);
        if (entry.key !== VENICE_ASSISTANT_PERSONA_KEY) {
            const rename = document.createElement('button');
            rename.type = 'button';
            rename.className = 'assistant-topic-action';
            rename.textContent = '✎';
            rename.title = '重新命名';
            rename.setAttribute('aria-label', '重新命名 ' + entry.title);
            rename.addEventListener('click', () => renameAssistantTopic(entry.key));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'assistant-topic-action';
            remove.textContent = '×';
            remove.title = '刪除話題';
            remove.setAttribute('aria-label', '刪除 ' + entry.title);
            remove.addEventListener('click', () => void deleteAssistantTopic(entry.key));
            row.append(rename, remove);
        }
        body.appendChild(row);
    }
};
const ensureAssistantTopicPanel = () => {
    if (assistantTopicPanel) return;
    assistantTopicPanel = document.createElement('aside');
    assistantTopicPanel.id = 'assistant-topic-panel';
    assistantTopicPanel.className = 'assistant-topic-panel hidden';
    assistantTopicPanel.setAttribute('aria-label', 'Venice AI 話題列表');
    const head = document.createElement('div');
    head.className = 'assistant-topic-head';
    const heading = document.createElement('strong');
    heading.textContent = 'Venice AI 話題';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', '收起話題列表');
    close.addEventListener('click', () => {
        assistantTopicPanelOpen = false;
        updateAssistantTopicLayout(true);
    });
    head.append(heading, close);
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'assistant-topic-create';
    create.textContent = '＋ 新對話';
    create.addEventListener('click', createAssistantTopic);
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'assistant-topic-search';
    search.placeholder = '搜尋話題';
    search.setAttribute('aria-label', '搜尋 Venice AI 話題');
    search.addEventListener('input', () => {
        assistantTopicSearch = search.value.trim().toLocaleLowerCase();
        renderAssistantTopicPanel();
    });
    const list = document.createElement('div');
    list.className = 'assistant-topic-list';
    assistantTopicPanel.append(head, create, search, list);
    chatView.prepend(assistantTopicPanel);
    assistantTopicToggle = document.createElement('button');
    assistantTopicToggle.type = 'button';
    assistantTopicToggle.className = 'assistant-topic-toggle hidden';
    assistantTopicToggle.textContent = '☰';
    assistantTopicToggle.setAttribute('aria-label', '切換 Venice AI 話題列表');
    assistantTopicToggle.addEventListener('click', () => {
        assistantTopicPanelOpen = !assistantTopicPanelOpen;
        updateAssistantTopicLayout(true);
    });
    backButton.after(assistantTopicToggle);
};
const updateAssistantTopicLayout = (active: boolean) => {
    ensureAssistantTopicPanel();
    chatView.classList.toggle('assistant-topics-mode', active);
    const opened = active && assistantTopicPanelOpen;
    chatView.classList.toggle('assistant-topics-open', opened);
    assistantTopicPanel?.classList.toggle('hidden', !opened);
    assistantTopicToggle?.classList.toggle('hidden', !active);
    if (active) renderAssistantTopicPanel();
};

let personaListRenderVersion = 0;

const renderPersonaList = () => {
    personaListRenderVersion += 1;
    aiAssistantList.innerHTML = '';
    femalePersonaList.innerHTML = '';
    const personas = memoryManager.getAllPersonas();
    const query = conversationSearchInput.value.trim().toLocaleLowerCase();
    const rooms = roomManager.getRooms();
    const legacyKeys = new Set(rooms.map(room => room.legacySourcePersonaKey).filter(Boolean));

    const latestMessage = (key: string) => memoryManager.peekChatHistory(key).at(-1);
    const latestTimestamp = (key: string, fallback = 0) => latestMessage(key)?.createdAt || fallback;
    const formatTime = (timestamp: number) => {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return new Intl.DateTimeFormat('zh-HK', { hour: '2-digit', minute: '2-digit' }).format(date);
        }
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return '昨天';
        return new Intl.DateTimeFormat('zh-HK', { month: 'numeric', day: 'numeric' }).format(date);
    };
    const previewText = (key: string, fallback: string) => {
        const message = latestMessage(key);
        if (!message) return fallback;
        if (message.content.photoIntent?.status === 'pending') return '待確認：是否請角色準備照片';
        if (message.content.memoryProposal?.status === 'pending') return '待確認：儲存為永久記憶';
        if (message.content.npcProposal?.status === 'pending') return `待確認：是否固定加入 ${message.content.npcProposal.name}`;
        const rawPreview = message.content.text || fallback;
        const visiblePreview = roomManager.getRoom(key)
            ? stripGroupTransportResidue(rawPreview)
            : rawPreview;
        if (message.content.imageAssetId || message.content.imageUrl) return `照片 · ${visiblePreview}`;
        if (message.content.attachments?.length) return `附件 · ${visiblePreview || message.content.attachments[0].name}`;
        return visiblePreview.replace(/\s+/gu, ' ').trim();
    };
    const appendAvatar = (container: HTMLElement, persona: Persona) => {
        if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
            const image = document.createElement('img');
            image.src = persona.avatarUrl;
            image.alt = persona.name;
            container.appendChild(image);
        } else {
            container.textContent = persona.emoji || '●';
        }
    };
    const createRow = (options: {
        key: string;
        title: string;
        preview: string;
        timestamp: number;
        persona?: Persona;
        room?: ChatRoom;
        pinned?: boolean;
        assistantTopic?: boolean;
    }) => {
        const shell = document.createElement('div');
        shell.className = 'conversation-row-shell';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `conversation-row${options.room ? ' is-group-conversation' : options.pinned || options.assistantTopic ? ' is-assistant-conversation' : ' is-persona-conversation'}${currentConversationKey === options.key ? ' is-active' : ''}`;
        button.dataset.key = options.key;

        const avatar = document.createElement('span');
        const roomAvatarClass = options.room
            ? ` group-avatar-grid group-avatar-count-${Math.min(options.room.members.length, 4)}`
            : '';
        avatar.className = `conversation-avatar${roomAvatarClass}${options.pinned ? ' assistant-tool-avatar' : ''}`;
        if (options.room) {
            options.room.members.slice(0, 4).forEach(member => {
                const cell = document.createElement('span');
                const avatarPersona = resolveRoomMemberAvatarPersona(member);
                appendAvatar(cell, avatarPersona);
                enableAvatarPreview(cell, avatarPersona);
                avatar.appendChild(cell);
            });
        } else if (options.persona) {
            appendAvatar(avatar, options.persona);
            if (!options.pinned) enableAvatarPreview(avatar, options.persona);
        }

        const copy = document.createElement('span');
        copy.className = 'conversation-copy';
        const line = document.createElement('span');
        line.className = 'conversation-line';
        const title = document.createElement('strong');
        title.textContent = options.title;
        const time = document.createElement('time');
        time.dateTime = options.timestamp ? new Date(options.timestamp).toISOString() : '';
        time.textContent = options.pinned ? '固定' : formatTime(options.timestamp);
        line.append(title, time);
        const preview = document.createElement('span');
        preview.className = 'conversation-preview';
        preview.textContent = options.preview;
        copy.append(line, preview);
        button.append(avatar, copy);
        button.addEventListener('click', () => startChat(options.key));
        shell.appendChild(button);

        if (!options.pinned) {
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'conversation-delete-button';
            deleteButton.title = options.assistantTopic ? `刪除話題 ${options.title}` : options.room ? `刪除群組 ${options.title}` : `刪除與 ${options.title} 的聊天`;
            deleteButton.setAttribute('aria-label', deleteButton.title);
            deleteButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"></path></svg>';
            deleteButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                if (options.assistantTopic) void deleteAssistantTopic(options.key);
                else void deleteConversationFromList(options.key, options.title, options.room);
            });
            if (options.assistantTopic) {
                const rename = document.createElement('button');
                rename.type = 'button';
                rename.className = 'assistant-topic-action';
                rename.textContent = '✎';
                rename.title = '重新命名';
                rename.setAttribute('aria-label', '重新命名 ' + options.title);
                rename.addEventListener('click', () => renameAssistantTopic(options.key));
                shell.appendChild(rename);
            }
            shell.appendChild(deleteButton);
        }
        return shell;
    };

    const assistant = personas[VENICE_ASSISTANT_PERSONA_KEY];
    if (assistant) {
        const newTopic = document.createElement('button');
        newTopic.type = 'button';
        newTopic.className = 'assistant-topic-home-create';
        newTopic.textContent = '＋ Venice AI 新對話';
        newTopic.addEventListener('click', createAssistantTopic);
        aiAssistantList.appendChild(newTopic);
        aiAssistantList.appendChild(createRow({
            key: VENICE_ASSISTANT_PERSONA_KEY,
            title: 'Venice AI · 原有對話',
            preview: previewText(VENICE_ASSISTANT_PERSONA_KEY, '既有的 Venice AI 聊天紀錄'),
            timestamp: latestTimestamp(VENICE_ASSISTANT_PERSONA_KEY),
            persona: assistant,
            pinned: true,
        }));
        for (const topic of getAssistantTopicEntries()) {
            if (topic.key === VENICE_ASSISTANT_PERSONA_KEY) continue;
            if (query && !topic.title.toLocaleLowerCase().includes(query) && !topic.preview.toLocaleLowerCase().includes(query)) continue;
            aiAssistantList.appendChild(createRow({
                key: topic.key,
                title: topic.title,
                preview: topic.preview,
                timestamp: topic.timestamp,
                persona: assistant,
                assistantTopic: true,
            }));
        }
    }

    const conversations: Array<{
        key: string;
        title: string;
        preview: string;
        timestamp: number;
        persona?: Persona;
        room?: ChatRoom;
    }> = rooms.map(room => ({
        key: room.id,
        title: room.title,
        preview: previewText(room.id, room.description),
        timestamp: latestTimestamp(room.id, room.updatedAt),
        room,
    }));

    Object.entries(personas).forEach(([key, persona]) => {
        if (key === VENICE_ASSISTANT_PERSONA_KEY || persona.gender !== 'female') return;
        const isLegacyBackup = legacyKeys.has(key);
        conversations.push({
            key,
            title: isLegacyBackup
                ? `${persona.conversationLabel || persona.name}（舊聊天）`
                : persona.conversationLabel || persona.name,
            preview: isLegacyBackup
                ? `原始備份 · ${previewText(key, persona.description)}`
                : previewText(key, persona.description),
            timestamp: latestTimestamp(key),
            persona,
        });
    });

    conversations
        .filter(item => !query || `${item.title} ${item.preview}`.toLocaleLowerCase().includes(query))
        .sort((left, right) => right.timestamp - left.timestamp || left.title.localeCompare(right.title, 'zh-Hant'))
        .forEach((item, index) => {
            const shell = createRow(item);
            if (
                index === 0
                && !query
                && document.documentElement.dataset.wetappUi === 'v2'
            ) {
                shell.classList.add('v2-featured-conversation-shell');
                shell.querySelector('.conversation-row')?.classList.add('v2-featured-conversation');
            }
            femalePersonaList.appendChild(shell);
        });

    if (!femalePersonaList.childElementCount) {
        const empty = document.createElement('p');
        empty.className = 'conversation-empty-state';
        empty.textContent = query ? '找不到相符的對話。' : '按右下角按鈕開始新對話。';
        femalePersonaList.appendChild(empty);
    }
    if (assistantTopicPanel) renderAssistantTopicPanel();
};

const schedulePersonaListRefreshAfterPaint = () => {
    const scheduledVersion = personaListRenderVersion;
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            if (personaListRenderVersion !== scheduledVersion) return;
            renderPersonaList();
        });
    });
};

let avatarAdminUi: import('./features/avatarAdminUi.js').AvatarAdminUiHandle | null = null;
let avatarAdminUiLoad: Promise<import('./features/avatarAdminUi.js').AvatarAdminUiHandle> | null = null;

const refreshAvatarUi = () => {
    if (currentRoom) currentRoom = roomManager.getRoom(currentRoom.id) || currentRoom;
    if (currentRoom && activeRoomMemberId) {
        selectActiveRoomMember(activeRoomMemberId);
    } else if (currentPersonaKey) {
        currentPersona = memoryManager.getPersona(currentPersonaKey) || currentPersona;
    }
    renderPersonaList();
    renderChatHeaderAvatar();
    renderPersonaSettingsAvatar();
    if (!roomInfoModal.classList.contains('hidden')) renderRoomInfo();
};

const loadAvatarAdminUi = async () => {
    if (avatarAdminUi) return avatarAdminUi;
    if (!avatarAdminUiLoad) {
        avatarAdminUiLoad = import('./features/avatarAdminUi.js')
            .then(({ createAvatarAdminUi }) => {
                const ui = createAvatarAdminUi({
                    assistantPersonaKey: VENICE_ASSISTANT_PERSONA_KEY,
                    getPersona: key => memoryManager.getPersona(key),
                    getRoom: roomId => roomManager.getRoom(roomId),
                    getRoomMember: (roomId, memberId) => roomManager.getMember(roomId, memberId),
                    updatePersona: (key, update) => memoryManager.updatePersona(key, update),
                    updateRoomMemberPersona: (roomId, memberId, update) => {
                        roomManager.updateMember(roomId, memberId, { persona: update });
                    },
                    saveLocalAvatar: async (target, avatarUrl) => {
                        if ('personaKey' in target) {
                            await memoryManager.setPersonaAvatar(target.personaKey, avatarUrl);
                        } else {
                            await roomManager.setMemberAvatar(target.roomId, target.memberId, avatarUrl);
                        }
                    },
                    resolvePublicIdentity: requestPublicIdentityResolution,
                    refreshAvatarUi,
                    suspendRoomInfo: () => {
                        const wasVisible = !roomInfoModal.classList.contains('hidden');
                        if (wasVisible) roomInfoModal.classList.add('hidden');
                        return wasVisible;
                    },
                    restoreRoomInfo: wasVisible => {
                        if (!wasVisible) return;
                        renderRoomInfo();
                        roomInfoModal.classList.remove('hidden');
                    },
                });
                avatarAdminUi = ui;
                return ui;
            })
            .catch(error => {
                avatarAdminUiLoad = null;
                throw error;
            });
    }
    return avatarAdminUiLoad;
};

const requestPersonaAvatarUpload = (key: string) => {
    void loadAvatarAdminUi()
        .then(ui => ui.openPersona(key))
        .catch(error => console.error('Failed to load Avatar Admin UI', error));
};

const requestRoomMemberAvatarUpload = (roomId: string, memberId: string) => {
    void loadAvatarAdminUi()
        .then(ui => ui.openRoomMember(roomId, memberId))
        .catch(error => console.error('Failed to load Avatar Admin UI', error));
};

const requestRoomAvatarUpload = (roomId: string) => {
    void loadAvatarAdminUi()
        .then(ui => ui.openRoom(roomId))
        .catch(error => console.error('Failed to load Avatar Admin UI', error));
};
const readBlobAsDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('無法讀取圖片。'));
    reader.readAsDataURL(blob);
});

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

const formatModelPrice = (value?: number) => {
    if (typeof value !== 'number') return '?';
    return value < 0.01 ? value.toFixed(4) : value.toFixed(2);
};

let assistantModelUi: import('./features/assistantModelUi.js').AssistantModelUiHandle | null = null;
let assistantModelUiLoad: Promise<import('./features/assistantModelUi.js').AssistantModelUiHandle> | null = null;

const loadAssistantModelUi = async () => {
    if (assistantModelUi) return assistantModelUi;
    if (!assistantModelUiLoad) {
        assistantModelUiLoad = import('./features/assistantModelUi.js')
            .then(({ createAssistantModelUi }) => {
                const ui = createAssistantModelUi({
                    preferredModelId: VENICE_ASSISTANT_MODEL,
                    getSelectedModelId: () => selectedAssistantModel,
                    setSelectedModelId: modelId => {
                        selectedAssistantModel = modelId;
                        setPersistedAppSetting(ASSISTANT_MODEL_STORAGE_KEY, selectedAssistantModel);
                    },
                    getFallbackModelIds: () => [
                        VENICE_ASSISTANT_MODEL,
                        ...Object.values(chatModelSettings),
                        ...Object.values(DEFAULT_CHAT_MODEL_SETTINGS),
                        VENICE_GOD_MODEL,
                        VENICE_GOD_FALLBACK_MODEL,
                    ],
                    isRequestActive: () => activeChatRequest !== null,
                    handleAuthRequired: () => handleAuthRequired(),
                    onModelsUpdated: () => chatModelSettingsUi?.refresh(),
                });
                assistantModelUi = ui;
                return ui;
            })
            .catch(error => {
                assistantModelUiLoad = null;
                throw error;
            });
    }
    return assistantModelUiLoad;
};

let chatModelSettingsUi: import('./features/chatModelSettingsUi.js').ChatModelSettingsUiHandle | null = null;
let chatModelSettingsUiLoad: Promise<import('./features/chatModelSettingsUi.js').ChatModelSettingsUiHandle> | null = null;

const loadChatModelSettingsUi = async () => {
    if (chatModelSettingsUi) return chatModelSettingsUi;
    if (!chatModelSettingsUiLoad) {
        chatModelSettingsUiLoad = Promise.all([
            import('./features/chatModelSettingsUi.js'),
            loadAssistantModelUi(),
        ])
            .then(([{ createChatModelSettingsUi }, modelUi]) => {
                const ui = createChatModelSettingsUi({
                    getSettings: () => chatModelSettings,
                    applySettings: next => { chatModelSettings = next; },
                    getDefaults: () => DEFAULT_CHAT_MODEL_SETTINGS,
                    getModels: () => modelUi.getModels(),
                    getModelListState: () => modelUi.getModelListState(),
                    loadModels: force => modelUi.loadModels(force),
                    formatContextSize: tokens => modelUi.formatContextSize(tokens),
                    hideMenus: () => {
                        homeMenu.classList.add('hidden');
                        moreOptionsMenu.classList.add('hidden');
                    },
                });
                chatModelSettingsUi = ui;
                return ui;
            })
            .catch(error => {
                chatModelSettingsUiLoad = null;
                throw error;
            });
    }
    return chatModelSettingsUiLoad;
};

const openChatModelSettings = (scope: 'global' | 'cc' = 'global') => {
    void loadChatModelSettingsUi()
        .then(ui => ui.open(scope))
        .catch(error => console.error('Failed to load Chat Model Settings UI', error));
};
const loadCloudBackupUi = async (): Promise<CloudBackupUiHandle> => {
    if (cloudBackupUi) return cloudBackupUi;
    if (!cloudBackupUiLoad) {
        cloudBackupUiLoad = Promise.all([
            import('./features/cloudBackupUi.js'),
            loadCloudBackupManager(),
        ])
            .then(([{ createCloudBackupUi }, manager]) => {
                const ui = createCloudBackupUi(manager, memoryManager);
                cloudBackupUi = ui;
                return ui;
            })
            .catch(error => {
                cloudBackupUiLoad = null;
                throw error;
            });
    }
    return cloudBackupUiLoad;
};

const openCloudBackup = () => {
    if (VPS_CHAT_BUILD) { alert('VPS 測試版：雲端備份已停用。'); return; }
    void loadCloudBackupUi()
        .then(ui => ui.open())
        .catch(error => console.error('Failed to load Cloud Backup UI', error));
};
const loadLiveCloudUi = async (): Promise<LiveCloudUiHandle> => {
    if (liveCloudUi) return liveCloudUi;
    if (!liveCloudUiLoad) {
        liveCloudUiLoad = Promise.all([
            import('./features/liveCloudUi.js'),
            loadSupabaseCloudSyncManager(),
        ])
            .then(([{ createLiveCloudUi }, manager]) => {
                const ui = createLiveCloudUi(manager);
                liveCloudUi = ui;
                return ui;
            })
            .catch(error => {
                liveCloudUiLoad = null;
                throw error;
            });
    }
    return liveCloudUiLoad;
};

const openSupabaseCloud = () => {
    void loadLiveCloudUi()
        .then(async ui => {if(VPS_CHAT_BUILD)await (await loadSupabaseCloudSyncManager()).start();ui.open();})
        .catch(error => console.error('Failed to load Live Cloud UI', error));
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
            name: 'Qwen Image 3 Edit',
            kind: 'edit',
            privacy: 'private',
            traits: [],
            priceUsd: 0.036,
            resolutionPrices: {},
            constraints: {
                promptCharacterLimit: 10000,
                aspectRatios: ['auto', '1:1', '3:2', '16:9', '9:16', '2:3', '3:4', '4:5'],
                defaultAspectRatio: 'auto',
                resolutions: ['1K', '2K'],
                defaultResolution: '1K',
            },
        }];
    }

    return [
        {
            id: VENICE_IMAGE_GENERATE_MODEL,
            name: 'Qwen Image 3',
            kind: 'generate',
            privacy: 'anonymized',
            traits: [],
            resolutionPrices: { '1K': 0.036, '2K': 0.036 },
            constraints: {
                promptCharacterLimit: 10000,
                aspectRatios: ['1:1', '3:2', '16:9', '21:9', '9:16', '2:3', '3:4', '4:5'],
                defaultAspectRatio: '1:1',
                resolutions: ['1K', '2K'],
                defaultResolution: '1K',
                widthHeightDivisor: 1,
                steps: { default: 20, max: 50 },
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

const loadImageModels = async (mode: VeniceImageMode, force = false): Promise<void> => {
    if (imageModelPromises[mode]) {
        await imageModelPromises[mode];
        return;
    }
    if (!force && imageModels[mode].length > 0) return;

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
        }
    })();

    await imageModelPromises[mode];
};

const getImageModelPrice = (model?: VeniceImageModelSummary, requestedResolution?: string) => {
    if (!model) return undefined;
    const resolution = requestedResolution
        || model.constraints.defaultResolution
        || Object.keys(model.resolutionPrices)[0];
    const resolutionPrice = resolution ? model.resolutionPrices[resolution] : undefined;
    return typeof resolutionPrice === 'number' ? resolutionPrice : model.priceUsd;
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

const initializeImageSeedControls = () => {
    imageSeedLock.checked = localStorage.getItem(IMAGE_SEED_LOCK_STORAGE_KEY) === 'true';
    const stored = normalizeImageSeed(localStorage.getItem(IMAGE_SEED_STORAGE_KEY) || undefined);
    setSeedInputValue(imageSeed, stored ?? createRandomImageSeed());
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

let imageStudioUi: import('./features/imageStudio.js').ImageStudioHandle | null = null;
let imageStudioUiLoad: Promise<import('./features/imageStudio.js').ImageStudioHandle> | null = null;

const getSharedImageSeed = () => normalizeImageSeed(imageSeed.value);

const setSharedImageSeed = (seed: number) => {
    const normalized = normalizeImageSeed(seed) ?? createRandomImageSeed();
    setSeedInputValue(imageSeed, normalized);
    setPersistedAppSetting(IMAGE_SEED_STORAGE_KEY, String(normalized));
    return normalized;
};

const randomizeSharedImageSeed = () => setSharedImageSeed(createRandomImageSeed());

const setSharedImageSeedLocked = (locked: boolean) => {
    imageSeedLock.checked = locked;
    setPersistedAppSetting(IMAGE_SEED_LOCK_STORAGE_KEY, String(locked));
    if (locked && getSharedImageSeed() === undefined) randomizeSharedImageSeed();
};

const loadImageStudioUi = async () => {
    if (imageStudioUi) return imageStudioUi;
    if (!imageStudioUiLoad) {
        imageStudioUiLoad = import('./features/imageStudio.js')
            .then(({ createImageStudio }) => {
                const ui = createImageStudio({
                    getImageModels: mode => imageModels[mode],
                    loadImageModels,
                    getSelectedImageModelId: mode => selectedImageModels[mode],
                    setSelectedImageModelId: (mode, modelId) => {
                        selectedImageModels[mode] = modelId;
                        setPersistedAppSetting(
                            mode === 'generate' ? IMAGE_GENERATE_MODEL_STORAGE_KEY : IMAGE_EDIT_MODEL_STORAGE_KEY,
                            modelId,
                        );
                    },
                    getImageModelPrice,
                    formatModelPrice,
                    requestImage: requestVeniceImage,
                    resolveSharedSeed: () => resolveImageSeedForRequest(imageSeed, imageSeedLock.checked),
                    getSharedSeed: getSharedImageSeed,
                    getSharedSeedLocked: () => imageSeedLock.checked,
                    setSharedSeedLocked: setSharedImageSeedLocked,
                    setSharedSeed: setSharedImageSeed,
                    randomizeSharedSeed: randomizeSharedImageSeed,
                    handleAuthRequired: () => handleAuthRequired(),
                    cancelActiveChatRequest: () => cancelActiveChatRequest(),
                    enterImageView: historyMode => {
                        personaSelectionView.classList.add('hidden');
                        chatView.classList.add('hidden');
                        chatView.classList.remove('flex');
                        syncBrowserViewState({ view: 'image' }, historyMode);
                    },
                    showSelectionView: () => showSelectionView('replace'),
                    hideVideoStudio: () => videoStudioUi?.hide(),
                    openPhotoViewer: (imageUrl, context) => openPhotoViewer(
                        imageUrl,
                        context as PhotoViewerContext,
                    ),
                });
                imageStudioUi = ui;
                return ui;
            })
            .catch(error => {
                imageStudioUiLoad = null;
                throw error;
            });
    }
    return imageStudioUiLoad;
};

const showImageStudio = (historyMode: 'push' | 'replace' | 'skip' = 'push') => {
    void loadImageStudioUi()
        .then(ui => ui.show(historyMode))
        .catch(error => console.error('Failed to load Image Studio', error));
};

let videoStudioUi: import('./features/videoStudio.js').VideoStudioHandle | null = null;
let videoStudioUiLoad: Promise<import('./features/videoStudio.js').VideoStudioHandle> | null = null;

const loadVideoStudioUi = async () => {
    if (videoStudioUi) return videoStudioUi;
    if (!videoStudioUiLoad) {
        videoStudioUiLoad = import('./features/videoStudio.js')
            .then(({ createVideoStudio }) => {
                const ui = createVideoStudio({
                    isUnlocked: () => isUnlocked,
                    handleAuthRequired,
                    cancelActiveChatRequest,
                    enterVideoView: historyMode => {
                        personaSelectionView.classList.add('hidden');
                        chatView.classList.add('hidden');
                        chatView.classList.remove('flex');
                        imageStudioUi?.hide();
                        syncBrowserViewState({ view: 'video' }, historyMode);
                    },
                    showSelectionView: () => showSelectionView('replace'),
                });
                videoStudioUi = ui;
                return ui;
            })
            .catch(error => {
                videoStudioUiLoad = null;
                throw error;
            });
    }
    return videoStudioUiLoad;
};

const showVideoStudio = (historyMode: 'push' | 'replace' | 'skip' = 'push') => {
    void loadVideoStudioUi()
        .then(ui => ui.show(historyMode))
        .catch(error => console.error('Failed to load Video Studio', error));
};

const cancelVideoPromptOptimization = () => videoStudioUi?.cancelPromptOptimization();
const resumePendingVideoJobIfAny = async () => {
    if (!readPersistedVideoJobFromStorage()) return;
    const ui = await loadVideoStudioUi();
    await ui.resumePending('auto');
};
const updateChatModeControls = (key: string) => {
    const assistantMode = isAssistantPersonaKey(key);
    if (assistantMode) {
        void loadAssistantModelUi()
            .then(ui => {
                if (isAssistantPersonaKey(currentPersonaKey)) ui.show();
                else ui.hide();
            })
            .catch(error => console.error('Failed to load Assistant Model UI', error));
    } else {
        assistantModelUi?.hide();
    }
    messageInput.placeholder = assistantMode ? '問 Venice AI...' : '輸入訊息...';
    assistantFileUploadButton.classList.toggle('hidden', !assistantMode);

    [memoryBtn, personaSettingsBtn, changeAvatarBtn, albumBtn, takePhotoBtn, surpriseEventBtn, newSceneBtn, downloadImagesBtn].forEach(element => {
        element.classList.toggle('hidden', assistantMode);
    });
    inviteCharacterBtn.classList.toggle('hidden', assistantMode);
    dmRoomMemberBtn.classList.toggle('hidden', assistantMode || !currentRoom);
    leaveRoomMemberBtn.classList.toggle('hidden', assistantMode || !currentRoom);
    ccModelSettingsBtn.classList.toggle('hidden', assistantMode || key !== 'cc');

};

const beginChatRequest = (
    personaKey: string,
    persona: Persona,
    mode: ChatMode,
    conversationKey = currentConversationKey || personaKey,
): ActiveChatRequest => {
    if (activeChatRequest) {
        throw new Error('CHAT_REQUEST_IN_PROGRESS');
    }

    const history = memoryManager.peekChatHistory(conversationKey);
    const establishedNpcNames = currentRoom
        ? []
        : collectEstablishedNpcNames(history, persona.name);
    const wardrobeState = currentRoom
        ? normalizeWardrobeState(currentRoom.scene.wardrobe, currentRoom.members.map(member => member.id))
        : getLatestWardrobeState(history, [
            persona.name,
            ...establishedNpcNames,
        ]);
    const request: ActiveChatRequest = {
        id: nextChatRequestId,
        personaKey,
        conversationKey,
        persona: { ...persona },
        room: currentRoom ? cloneRoomSnapshot(currentRoom) : undefined,
        roomMemberId: currentRoom ? activeRoomMemberId || currentRoom.leadMemberId : undefined,
        mode,
        establishedNpcNames,
        wardrobeState,
        controller: new AbortController(),
        startedAt: performance.now(),
        director: mode==='character'&&getActiveWorldline(conversationKey)?readDirector(localStorage,conversationKey):undefined,
    };
    nextChatRequestId += 1;
    activeChatRequest = request;
    if(mode==='character'&&getActiveWorldline(conversationKey))worldlineBackgroundMedia.start(request.id);
    updateSendButtonState();
    assistantModelUi?.setBusy(true);
    return request;
};

// This preview intentionally uses one durable paid request per ordinary character turn.
const makeVpsGroupCommit = () => createGroupCommit({
    readRoom: id => roomManager.getRoom(id),
    readHistory: id => memoryManager.peekChatHistory(id),
    writeReply: (r, content) => memoryManager.persistVpsChatTurnReply(r.conversationKey,r.userMessageId,r.replyId,content),
    confirmReply: r => memoryManager.confirmVpsChatTurnMessage(r.conversationKey,r.replyId,'model'),
    confirmScene: (id,jobId) => roomManager.confirmVpsSceneCommit(id,jobId),
    writeScene: (id,jobId,expected,scene) => roomManager.persistVpsSceneCommit(id,jobId,expected,scene),
});
const readVpsWorld=(key:string)=>{
    const world=getWorldline(localStorage.getItem(WORLDLINE_SETTING_KEY),key);
    return world&&!world.paused?world:null;
};
const digestVpsWorld=async(key:string,history=memoryManager.peekChatHistory(key))=>{
    const world=readVpsWorld(key);
    if(!world)return undefined;
    const {fixedPrompt,variableOverride}=readFullPromptSettings(localStorage,key);
    return digestWorldlineContext(world,projectWorld(localStorage.getItem(WORLD_LEDGER_KEY),key,history),{director:readDirector(localStorage,key),fixedPrompt,variableOverride});
};
const checkWorldlineTurnContext=async(t:TurnIdentity,history=memoryManager.peekChatHistory(t.conversationKey))=>{
    if(await digestVpsWorld(t.conversationKey,history)!==t.worldDigest)throw Error('WORLDLINE_CONTEXT_CHANGED');
};
let nativeStoryPilot:ReturnType<typeof createNativeStoryPilot>|null=null;
let nativeStoryBusy=false;
const makeVpsBaseHistory = (replyContent?: Content, groupScene?: GroupGenerationResult['scene']):DurableHistory => ({
        read: key => memoryManager.peekChatHistory(key),
        persistUser: async t => {
            await checkWorldlineTurnContext(t);
            if (t.roomDigest) {
                const room=roomManager.getRoom(t.conversationKey);
                if (!room || await digestGroupContext(room,t.contextDigestVersion)!==t.roomDigest) throw Error('GROUP_CONTEXT_CHANGED');
            }
            memoryManager.persistVpsChatTurnUser(t.conversationKey, t.userMessageId);
            if (t.contextDigest && await digestVpsHistory(memoryManager.peekChatHistory(t.conversationKey),t.contextDigestVersion) !== t.contextDigest) throw Error('TURN_HISTORY_CHANGED');
        },
        persistReply: async (r, text) => {
            await checkWorldlineTurnContext(r);
            if (await digestVpsHistory(memoryManager.peekChatHistory(r.conversationKey),r.contextDigestVersion) !== r.contextDigest) throw Error('TURN_HISTORY_CHANGED');
            if (r.roomDigest) {
                if(!groupScene)throw Error('GROUP_SCENE_RECEIPT_MISSING');
                await makeVpsGroupCommit().persistReply(r,{...replyContent,text},groupScene);
            } else memoryManager.persistVpsChatTurnReply(r.conversationKey, r.userMessageId, r.replyId, { ...replyContent, text,...(r.worldDigest?{worldlineStoryTurn:true,worldlineVpsDirectorNextId:readDirector(localStorage,r.conversationKey).next?.id}:{}) },r.createdAt+1);
        },
        confirmReply: async r => {
            if(r.roomDigest)await makeVpsGroupCommit().confirm(r);
            else memoryManager.confirmVpsChatTurnMessage(r.conversationKey,r.replyId,'model');
            if(r.worldDigest){
                const world=readVpsWorld(r.conversationKey);
                if(!world)throw Error('WORLDLINE_CONTEXT_CHANGED');
                const history=memoryManager.peekChatHistory(r.conversationKey);
                const exists=world.chronicle.some(row=>row.sourceMessageId===r.replyId);
                const {userIndex:i,replyIndex:j}=await verifyWorldlineAppliedPrefix(history,r,exists);
                if(!exists){
                    await checkWorldlineTurnContext(r,history.slice(0,i+1));
                    const at=r.conversationKey===NATIVE_SYNC_KEY?r.createdAt+1:undefined;
                    const next=at===undefined?commitWorldlineReply(world,r.replyId,history[i].content.text||'',history[j].content.text||''):recordWorldlineTurn(world,history[i].content.text||'',history[j].content.text||'',at,r.replyId);
                    setPersistedAppSetting(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(localStorage.getItem(WORLDLINE_SETTING_KEY),r.conversationKey,next,at)));
                    if(!readVpsWorld(r.conversationKey)?.chronicle.some(row=>row.sourceMessageId===r.replyId))throw Error('WORLDLINE_CHRONICLE_NOT_DURABLE');
                }
                const used=history[j].content.worldlineVpsDirectorNextId;
                const director=readDirector(localStorage,r.conversationKey);
                if(used&&director.next?.id===used)consumeDirectorNext(localStorage,r.conversationKey,director);
            }
        },
});
const nativeHistoryFor=(base:DurableHistory,key:string)=>{if(key!==NATIVE_SYNC_KEY)return base;if(!nativeStoryPilot)throw Error('NATIVE_SYNC_LOGIN_REQUIRED');return nativeStoryPilot.createBridge(base).history;};
const makeVpsTurnController=(replyContent?:Content,groupScene?:GroupGenerationResult['scene'])=>{
    const base=makeVpsBaseHistory(replyContent,groupScene);
    return createDurableChatTurn({storage:localStorage,transport:createVpsChatTransport(),lock:browserTurnLock,history:{read:base.read,persistUser:t=>nativeHistoryFor(base,t.conversationKey).persistUser(t),persistReply:(r,text)=>nativeHistoryFor(base,r.conversationKey).persistReply(r,text),confirmReply:r=>nativeHistoryFor(base,r.conversationKey).confirmReply(r)}});
};
const pendingVpsTurn = () => VPS_CHAT_BUILD ? makeVpsTurnController().pending() : null;
const selectedVpsChatModel = () => {
    return selectVpsModel(VPS_CHAT_BUILD,chatModelSettings.primary,localStorage.getItem(VPS_CHAT_MODE_KEY)==='1');
};
let resumingVpsTurn = false;
const resumeVpsChatTurn = async (openConversation = false) => {
    if (!VPS_CHAT_BUILD || !isUnlocked || activeChatRequest || resumingVpsTurn) return;
    resumingVpsTurn = true;
    try {
        const controller = makeVpsTurnController();
        let pending = controller.pending();
        if (!pending&&ATOMIC_CLOUD_PREVIEW&&supabaseCloudSyncManager?.getState().phase==='synced'&&currentConversationKey){
            const key=currentConversationKey;
            const history=memoryManager.peekChatHistory(key);
            if(history.at(-1)?.role!=='user')return;
            if(key===NATIVE_SYNC_KEY||currentRoom)return;
            const worldDigest=await digestVpsWorld(key,history);
            const match=await findMatchingVpsRecovery(await listVpsRecovery(),key,history,worldDigest);
            if(!match||currentConversationKey!==key||activeChatRequest||currentRoom||currentPersonaKey!==match.receipt.personaKey)return;
            // The restored world and chat history must match the existing server receipt.
            await checkWorldlineTurnContext(match.receipt);
            await controller.adoptRecovery(match.receipt);
            pending=controller.pending();
        }
        if (!pending) return;
        if(pending.conversationKey===NATIVE_SYNC_KEY&&!nativeStoryPilot)return;
        if (await controller.reconcileApplied()) {
            if (pending.roomDigest && currentRoom?.id===pending.conversationKey) {
                const room=roomManager.getRoom(pending.conversationKey);
                if(room){currentRoom=room;renderUiV2ImmersiveSceneChrome();}
            }
            if (currentConversationKey === pending.conversationKey) {
                chatContainer.replaceChildren(); resetRenderedChatHistoryWindow();
                renderChatHistoryWindow(pending.conversationKey, memoryManager.peekChatHistory(pending.conversationKey));
            }
            if(pending.worldDigest){if(pending.conversationKey===NATIVE_SYNC_KEY)maybeSyncNativeLedger();else void syncWorldLedger(pending.conversationKey,true).catch(error=>console.warn('World OS recovery extraction pending:',error));}
            return;
        }
        if (currentConversationKey !== pending.conversationKey) {
            if (!openConversation && currentConversationKey) return;
            startChat(pending.conversationKey, null, 'replace');
        }
        if (pending.roomDigest) {
            const room=roomManager.getRoom(pending.conversationKey);
            if(!room||await digestGroupContext(room,pending.contextDigestVersion)!==pending.roomDigest||!pending.roomMemberId||!selectActiveRoomMember(pending.roomMemberId))throw Error('GROUP_CONTEXT_CHANGED');
        }
        if (currentConversationKey !== pending.conversationKey || !currentPersona || Boolean(currentRoom)!==Boolean(pending.roomDigest) || currentPersonaKey !== pending.personaKey) throw Error('TURN_CONVERSATION_CHANGED');
        const history = memoryManager.peekChatHistory(pending.conversationKey);
        const user = history.at(-1);
        if (user?.id !== pending.userMessageId || user.role !== 'user' || !user.content.text || await digestVpsHistory(history,pending.contextDigestVersion) !== pending.contextDigest) throw Error('TURN_HISTORY_CHANGED');
        await checkWorldlineTurnContext(pending);
        const request = beginChatRequest(pending.personaKey, currentPersona, 'character', pending.conversationKey);
        request.vpsTurn = { identity: pending, model: pending.model, receipt: pending };
        startChatPerformanceTurn();
        await getResponse(request, user.content.text);
    } catch (error) {
        showError('VPS 任務尚未恢復：' + (error instanceof Error ? error.message : 'UNKNOWN') + '。原任務仍保留，可在選單取回或放棄。');
    } finally { resumingVpsTurn = false; updateSendButtonState(); }
};
const isActiveChatRequest = (request: ActiveChatRequest) => activeChatRequest?.id === request.id;

const finishChatRequest = (request: ActiveChatRequest, state: RequestState = 'idle') => {
    if (!isActiveChatRequest(request)) return;
    activeChatRequest = null;
    worldlineBackgroundMedia.stop(request.id);
    applyChatRuntimeState(state);
    updateSendButtonState();
    assistantModelUi?.setBusy(false);
};

const cancelActiveChatRequest = () => {
    if (!activeChatRequest) return;
    const request = activeChatRequest;
    activeChatRequest = null;
    request.controller.abort();
    worldlineBackgroundMedia.stop(request.id);
    clearAssistantStreamPreview(request);
    if (request.surpriseEvent) {
        updateSurpriseEventProposal(request.conversationKey, request.surpriseEvent.id, {
            status: 'pending',
            error: undefined,
        });
    }
    applyChatRuntimeState('idle');
    updateSendButtonState();
    cancelChatPerformanceTurn('send:cancelled');
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
    if (currentRoom) {
        chatHeaderAvatarContainer.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = `group-avatar-grid group-avatar-count-${Math.min(currentRoom.members.length, 4)} h-12 w-12 overflow-hidden rounded-full`;
        currentRoom.members.slice(0, 4).forEach(member => {
            const sourcePersona = resolveRoomMemberAvatarPersona(member);
            const cell = document.createElement('span');
            if (sourcePersona.avatarUrl && !sourcePersona.avatarUrl.startsWith('generating_')) {
                const image = document.createElement('img');
                image.src = sourcePersona.avatarUrl;
                image.alt = sourcePersona.name;
                cell.appendChild(image);
            } else {
                cell.textContent = sourcePersona.emoji || '●';
            }
            enableAvatarPreview(cell, sourcePersona);
            grid.appendChild(cell);
        });
        chatHeaderAvatarContainer.appendChild(grid);
        return;
    }
    renderPersonaAvatar(
        chatHeaderAvatarContainer,
        currentPersona,
        'w-12 h-12 rounded-full object-cover',
        'w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center emoji-avatar',
    );
    if (currentPersona) enableAvatarPreview(chatHeaderAvatarContainer, currentPersona);
};

const renderPersonaSettingsAvatar = () => personaSettingsUi?.refreshAvatar();

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

const LEGACY_HISTORY_PREVIEW_LIMIT = 80;

const appendHistoryDivider = (label: string) => {
    const divider = document.createElement('div');
    divider.className = 'history-period-divider';
    divider.textContent = label;
    chatContainer.appendChild(divider);
};

const appendIuMemorySummary = (room: ChatRoom) => {
    const banner = document.createElement('section');
    banner.className = 'legacy-history-banner is-summary';
    const title = document.createElement('strong');
    title.textContent = '舊 IU 對話已整理成長期回憶';
    const description = document.createElement('p');
    description.textContent = '這個裝置暫時找不到舊 IU 的逐字紀錄。三人的 soul.md 與 memory.md 已保留重要經歷；匯入舊 ZIP 後，完整舊對話會以唯讀方式自動接到這裡。';
    const memories = document.createElement('p');
    memories.className = 'legacy-history-memory-list';
    memories.textContent = room.sharedMemories.slice(0, 6).map(entry => entry.title).join(' · ');
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.textContent = '安全匯入舊 IU ZIP';
    importButton.addEventListener('click', () => zipUploadInput.click());
    banner.append(title, description, memories, importButton);
    chatContainer.appendChild(banner);
};

const appendLinkedLegacyHistory = (room: ChatRoom) => {
    const sourceKey = room.legacySourcePersonaKey;
    const sourceName = sourceKey
        ? memoryManager.getPersona(sourceKey)?.name || room.members.find(member => member.sourcePersonaKey === sourceKey)?.persona.name
        : undefined;
    const sourceLabel = sourceName || '原本角色';
    const sourceHistory = sourceKey
        ? memoryManager.peekChatHistory(sourceKey).filter(message => message.role === 'user' || message.role === 'model')
        : [];
    if (!sourceHistory.length) {
        if (room.id === IU_GROUP_ROOM_ID) appendIuMemorySummary(room);
        return;
    }

    const expanded = expandedLegacyHistoryConversationKey === room.id;
    const visibleHistory = expanded
        ? sourceHistory
        : sourceHistory.slice(-LEGACY_HISTORY_PREVIEW_LIMIT);
    const hiddenCount = sourceHistory.length - visibleHistory.length;
    const banner = document.createElement('section');
    banner.className = 'legacy-history-banner';
    const title = document.createElement('strong');
    title.textContent = `已連結原本 ${sourceLabel} 單人房的 ${sourceHistory.length.toLocaleString('zh-HK')} 則紀錄`;
    const description = document.createElement('p');
    description.textContent = hiddenCount > 0
        ? `目前先顯示最近 ${visibleHistory.length.toLocaleString('zh-HK')} 則，避免手機一次載入過慢。這些訊息只供查看，舊房間本身沒有被移動或改寫。`
        : '完整舊紀錄正在顯示；這些訊息只供查看，舊房間本身沒有被移動或改寫。';
    banner.append(title, description);
    if (hiddenCount > 0) {
        const showAllButton = document.createElement('button');
        showAllButton.type = 'button';
        showAllButton.textContent = `顯示全部（再載入 ${hiddenCount.toLocaleString('zh-HK')} 則）`;
        showAllButton.addEventListener('click', () => {
            expandedLegacyHistoryConversationKey = room.id;
            startChat(room.id, null, 'skip');
            window.requestAnimationFrame(() => {
                chatContainer.scrollTop = 0;
            });
        });
        banner.appendChild(showAllButton);
    }
    chatContainer.appendChild(banner);
    appendHistoryDivider(`原本 ${sourceLabel} 單人聊天 · 唯讀備份`);
    visibleHistory.forEach(message => {
        const sender = message.role === 'user' ? 'user' : 'bot';
        appendMessage({
            ...message.content,
            legacy: true,
            photoProposal: undefined,
            memoryProposal: undefined,
            photoIntent: undefined,
            npcProposal: undefined,
        }, sender, message, 'none');
    });
    appendHistoryDivider('新群組由這裡開始');
};

const appendStoredHistoryMessage = (
    message: ChatMessage,
    target: HTMLElement | DocumentFragment = chatContainer,
) => {
    const sender = message.role === 'user' ? 'user' : message.role === 'model' ? 'bot' : 'system';
    const content = message.role === 'system' && message.content.text?.trim() === SCENE_END_MARKER
        ? { ...message.content, text: SCENE_START_LABEL }
        : message.content;
    return appendMessage(content, sender, message, 'none', target);
};

const resetRenderedChatHistoryWindow = () => {
    renderedChatHistoryConversationKey = null;
    renderedChatHistory = [];
    renderedChatHistoryStartIndex = 0;
    renderedChatHistoryAnchor = null;
    renderedChatHistoryLoadOlderButton = null;
    isPrependingChatHistory = false;
    isChatHistoryAutoPreloadEnabled = false;
};

const updateRenderedChatHistoryLoadOlderButton = () => {
    if (!renderedChatHistoryLoadOlderButton) return;
    const hiddenCount = getHiddenChatHistoryCount(renderedChatHistoryStartIndex);
    renderedChatHistoryLoadOlderButton.hidden = hiddenCount === 0;
    renderedChatHistoryLoadOlderButton.textContent = hiddenCount > 0
        ? `載入較早訊息（尚有 ${hiddenCount.toLocaleString('zh-HK')} 則）`
        : '';
};

const prependOlderChatHistory = (batchSize?: number) => {
    if (
        isPrependingChatHistory
        || !renderedChatHistoryAnchor
        || !renderedChatHistoryConversationKey
        || renderedChatHistoryConversationKey !== currentConversationKey
        || renderedChatHistoryStartIndex <= 0
    ) return;

    isPrependingChatHistory = true;
    try {
        const previousScrollHeight = chatContainer.scrollHeight;
        const previousScrollTop = chatContainer.scrollTop;
        const nextStartIndex = getPreviousChatHistoryStartIndex(
            renderedChatHistoryStartIndex,
            batchSize,
        );
        const fragment = document.createDocumentFragment();
        renderedChatHistory
            .slice(nextStartIndex, renderedChatHistoryStartIndex)
            .forEach(message => appendStoredHistoryMessage(message, fragment));

        chatContainer.insertBefore(fragment, renderedChatHistoryAnchor.nextSibling);
        renderedChatHistoryStartIndex = nextStartIndex;
        updateRenderedChatHistoryLoadOlderButton();

        const addedHeight = Math.max(0, chatContainer.scrollHeight - previousScrollHeight);
        chatContainer.scrollTop = previousScrollTop + addedHeight;
    } finally {
        isPrependingChatHistory = false;
    }
};

const renderChatHistoryWindow = (key: string, history: ChatMessage[]) => {
    renderedChatHistoryConversationKey = key;
    renderedChatHistory = history;
    renderedChatHistoryStartIndex = getInitialChatHistoryStartIndex(history.length);
    isPrependingChatHistory = false;
    isChatHistoryAutoPreloadEnabled = false;

    const loadOlderButton = document.createElement('button');
    loadOlderButton.type = 'button';
    loadOlderButton.className = 'chat-history-load-older';
    loadOlderButton.addEventListener('click', () => prependOlderChatHistory());
    chatContainer.appendChild(loadOlderButton);
    renderedChatHistoryLoadOlderButton = loadOlderButton;

    const anchor = document.createElement('div');
    anchor.className = 'chat-history-window-anchor';
    anchor.setAttribute('aria-hidden', 'true');
    chatContainer.appendChild(anchor);
    renderedChatHistoryAnchor = anchor;

    const fragment = document.createDocumentFragment();
    history
        .slice(renderedChatHistoryStartIndex)
        .forEach(message => appendStoredHistoryMessage(message, fragment));
    chatContainer.appendChild(fragment);
    updateRenderedChatHistoryLoadOlderButton();
    window.requestAnimationFrame(() => {
        if (renderedChatHistoryConversationKey === key) {
            isChatHistoryAutoPreloadEnabled = true;
        }
    });
};

chatContainer.addEventListener('scroll', () => {
    if (
        isChatHistoryAutoPreloadEnabled
        && chatContainer.scrollTop <= CHAT_HISTORY_PRELOAD_SCROLL_PX
        && renderedChatHistoryStartIndex > 0
    ) {
        prependOlderChatHistory();
    }
}, { passive: true });

const restoreRoomPrivateContinuityHandoffs = (room: ChatRoom, history: ChatMessage[]) => {
    const missingHandoffs = new Map<string, ChatContextBridge>();
    room.members.forEach(member => {
        if (member.privateContinuityHandoff) return;
        const handoff = findLatestPrivateReturnHandoff(history, member);
        if (handoff) missingHandoffs.set(member.id, handoff);
    });
    if (missingHandoffs.size === 0) return room;

    return roomManager.updateRoom(room.id, editableRoom => {
        editableRoom.members.forEach(member => {
            const handoff = missingHandoffs.get(member.id);
            if (handoff && !member.privateContinuityHandoff) {
                member.privateContinuityHandoff = cloneRoomSnapshot(handoff);
            }
        });
    }) || room;
};

const UI_V2_ACCENT_PALETTES = [
    { accent: '#98584f', aura1: '152, 88, 79', aura2: '126, 148, 143' },
    { accent: '#765d8e', aura1: '118, 93, 142', aura2: '146, 127, 161' },
    { accent: '#52746c', aura1: '82, 116, 108', aura2: '124, 151, 139' },
    { accent: '#9a6a43', aura1: '154, 106, 67', aura2: '161, 136, 104' },
    { accent: '#8b586d', aura1: '139, 88, 109', aura2: '163, 125, 139' },
    { accent: '#566f8c', aura1: '86, 111, 140', aura2: '123, 143, 163' },
] as const;

const applyUiV2ConversationTheme = (identity: string | null) => {
    if (document.documentElement.dataset.wetappUi !== 'v2') return;
    if (!identity) {
        document.documentElement.style.removeProperty('--v2-accent');
        document.documentElement.style.removeProperty('--v2-aura-1');
        document.documentElement.style.removeProperty('--v2-aura-2');
        return;
    }
    let hash = 0;
    for (const char of identity) hash = ((hash << 5) - hash + char.codePointAt(0)!) | 0;
    const palette = UI_V2_ACCENT_PALETTES[Math.abs(hash) % UI_V2_ACCENT_PALETTES.length];
    document.documentElement.style.setProperty('--v2-accent', palette.accent);
    document.documentElement.style.setProperty('--v2-aura-1', palette.aura1);
    document.documentElement.style.setProperty('--v2-aura-2', palette.aura2);
};


const UI_V2_IMMERSIVE_SCENE_STORAGE_KEY = 'wetappUiV2ImmersiveScene';

const getUiV2ImmersiveScenePreference = () => {
    try {
        const stored = localStorage.getItem(UI_V2_IMMERSIVE_SCENE_STORAGE_KEY);
        return stored === null ? true : stored === 'true';
    } catch {
        return true;
    }
};

const setUiV2ImmersiveScenePreference = (enabled: boolean) => {
    try {
        localStorage.setItem(UI_V2_IMMERSIVE_SCENE_STORAGE_KEY, String(enabled));
    } catch {
        // The visual mode still works for this session if storage is unavailable.
    }
};

const isUiV2ImmersiveSceneActive = () => (
    document.documentElement.dataset.wetappUi === 'v2'
    && document.documentElement.dataset.wetappScene === 'immersive'
    && Boolean(currentRoom)
);

const ensureUiV2ImmersiveSceneStructure = () => {
    if (document.documentElement.dataset.wetappUi !== 'v2') return;

    const topbarActions = chatView.querySelector<HTMLElement>('.chat-topbar > div:last-child');
    if (topbarActions && !document.getElementById('ui-v2-immersive-scene-toggle')) {
        const toggle = document.createElement('button');
        toggle.id = 'ui-v2-immersive-scene-toggle';
        toggle.type = 'button';
        toggle.className = 'v2-immersive-scene-toggle hidden';
        toggle.setAttribute('aria-label', '切換沉浸場景模式');
        toggle.setAttribute('aria-pressed', 'false');
        toggle.innerHTML = '<span aria-hidden="true">◫</span><small>場景</small>';
        toggle.addEventListener('click', () => {
            const enabled = !isUiV2ImmersiveSceneActive();
            setUiV2ImmersiveScenePreference(enabled);
            renderUiV2ImmersiveSceneChrome(enabled);
        });
        topbarActions.insertBefore(toggle, chatSearchBtn);
    }

    if (document.getElementById('ui-v2-immersive-scene-shell')) return;
    const topbar = chatView.querySelector<HTMLElement>('.chat-topbar');
    if (!topbar) return;

    const shell = document.createElement('section');
    shell.id = 'ui-v2-immersive-scene-shell';
    shell.className = 'v2-immersive-scene-shell hidden';
    shell.setAttribute('aria-label', '目前場景');

    const primary = document.createElement('div');
    primary.className = 'v2-scene-primary';

    const copy = document.createElement('div');
    copy.className = 'v2-scene-copy';
    const kicker = document.createElement('span');
    kicker.className = 'v2-scene-kicker';
    kicker.textContent = 'NOW · 此刻';
    const location = document.createElement('strong');
    location.id = 'ui-v2-scene-location';
    const meta = document.createElement('span');
    meta.id = 'ui-v2-scene-meta';
    meta.className = 'v2-scene-meta';
    copy.append(kicker, location, meta);

    const nowButton = document.createElement('button');
    nowButton.id = 'ui-v2-scene-now-toggle';
    nowButton.type = 'button';
    nowButton.className = 'v2-scene-now-toggle';
    nowButton.setAttribute('aria-expanded', 'false');
    nowButton.innerHTML = '<span>此刻</span><span aria-hidden="true">⌄</span>';
    nowButton.addEventListener('click', () => {
        const detail = document.getElementById('ui-v2-scene-detail');
        if (!detail) return;
        const expanded = detail.classList.toggle('hidden') === false;
        nowButton.setAttribute('aria-expanded', String(expanded));
        shell.classList.toggle('is-expanded', expanded);
    });

    primary.append(copy, nowButton);

    const cast = document.createElement('div');
    cast.id = 'ui-v2-scene-cast';
    cast.className = 'v2-scene-cast';

    const detail = document.createElement('div');
    detail.id = 'ui-v2-scene-detail';
    detail.className = 'v2-scene-detail hidden';

    const worldState = document.createElement('div');
    worldState.id = 'ui-v2-scene-world-state';
    worldState.className = 'v2-scene-world-state';

    const insight = document.createElement('section');
    insight.id = 'ui-v2-scene-insight';
    insight.className = 'v2-scene-insight hidden';
    insight.setAttribute('aria-live', 'polite');

    const summary = document.createElement('p');
    summary.id = 'ui-v2-scene-summary';
    summary.className = 'v2-scene-summary';
    const unresolved = document.createElement('div');
    unresolved.id = 'ui-v2-scene-unresolved';
    unresolved.className = 'v2-scene-unresolved';
    detail.append(worldState, insight, summary, unresolved);

    shell.append(primary, cast, detail);
    topbar.insertAdjacentElement('afterend', shell);
};

let uiV2XrayPendingRoomId: string | null = null;

const requestUiV2SceneXray = async (roomId: string) => {
    if (uiV2XrayPendingRoomId) return;
    const room = roomManager.getRoom(roomId);
    if (!room || currentRoom?.id !== roomId || !isUiV2ImmersiveSceneActive()) return;
    const sceneId = room.scene.id;
    const realityEpochId = room.scene.realityEpochId;
    const presentIds = [...room.scene.presentMemberIds];
    const sourceContext = memoryManager.getChatHistory(roomId).slice(-6)
        .map(message => {
            const role = message.role === 'user' ? 'USER' : 'GROUP';
            return `${role}: ${String(message.content.text || '').slice(0, 1300)}`;
        }).join('\n\n').slice(-5700);
    const castLedger = room.members
        .filter(member => presentIds.includes(member.id))
        .map(member => `${member.id}: ${member.persona.name}`)
        .join('\n');

    uiV2XrayPendingRoomId = roomId;
    renderUiV2SceneMemberInsight(
        document.getElementById('ui-v2-immersive-scene-shell')?.dataset.insightMemberId || null,
    );
    try {
        const model = buildCharacterModelRoute(chatModelSettings, false)[0];
        if (!model) throw new Error('No chat model configured');
        const result = await generateChatTextWithTimeout({
            model,
            messages: [
                {
                    role: 'system',
                    content: [
                        'You are a scene-state continuity assistant for a fictional multi-character chat.',
                        'Generate SHORT imagined character states, not model reasoning or actual private facts.',
                        'Only use currently provided scene and conversation. Do not invent user actions, speech or consent.',
                        'Output JSON only: {"member_states":[{"member_id":"EXACT_ID","attention":"short","inner_thought":"short fictional private thought","chemistry":"one concrete current relationship dynamic"}]}.',
                        'Return one entry per listed present member. Every field should be one short Traditional Chinese phrase.',
                        'Private thoughts are fictional character narrative states, never knowledge available to other characters until revealed.',
                        'Do not output dialogue or advance the current scene.',
                    ].join('\n'),
                },
                {
                    role: 'user',
                    content: [
                        `Location: ${room.scene.location || 'unknown'}`,
                        `Reality layer: ${room.scene.realityLayer}`,
                        `Scene summary: ${room.scene.summary?.slice(0, 1100) || 'unknown'}`,
                        'Present members (use these exact IDs):',
                        castLedger,
                        'Recent conversation:',
                        sourceContext || '(no recent messages)',
                    ].join('\n\n'),
                },
            ],
            temperature: 0.5,
            topP: 0.86,
            repetitionPenalty: 1.02,
        }, 30000);

        const latest = roomManager.getRoom(roomId);
        if (
            !latest
            || currentRoom?.id !== roomId
            || latest.scene.id !== sceneId
            || latest.updatedAt !== room.updatedAt
            || latest.scene.realityEpochId !== realityEpochId
            || latest.scene.presentMemberIds.join('|') !== presentIds.join('|')
        ) return;

        const parsed = parseGroupXrayStates(result.text, latest);
        const completed = Object.values(parsed).filter(state => (
            state.innerThought.trim() || state.attention.trim() || state.chemistry.trim()
        )).length;
        if (!completed) throw new Error('AI did not return readable X-ray metadata');

        const mergedStates = { ...latest.scene.memberStates };
        for (const [memberId, state] of Object.entries(parsed)) {
            const old = mergedStates[memberId];
            mergedStates[memberId] = {
                posture: old?.posture || state.posture,
                action: old?.action || state.action,
                attention: state.attention || old?.attention || '',
                innerThought: state.innerThought || old?.innerThought || '',
                chemistry: state.chemistry || old?.chemistry || '',
            };
        }
        const stored = roomManager.updateRoomSceneDeferred(roomId, {
            ...latest.scene,
            memberStates: mergedStates,
        });
        if (currentRoom?.id === roomId) {
            currentRoom = stored || { ...currentRoom, scene: { ...latest.scene, memberStates: mergedStates } };
            renderUiV2ImmersiveSceneChrome();
        }
    } catch (error) {
        console.warn('[wetapp X-ray on-demand]', {
            reason: error instanceof Error ? error.message : String(error),
        });
        if (currentRoom?.id === roomId) {
            const panel = document.getElementById('ui-v2-scene-insight');
            if (panel) {
                const message = document.createElement('p');
                message.className = 'v2-scene-insight-empty';
                message.textContent = '今次未能補讀內心資料，原本對話完全不受影響。可以再試。';
                panel.appendChild(message);
            }
        }
    } finally {
        uiV2XrayPendingRoomId = null;
        if (currentRoom?.id === roomId) {
            const button = document.getElementById('ui-v2-xray-fetch') as HTMLButtonElement | null;
            if (button) {
                button.disabled = false;
                button.textContent = '補讀此刻 X-ray · 額外 1 次 AI 請求';
            }
        }
    }
};

const renderUiV2SceneMemberInsight = (memberId: string | null) => {
    const shell = document.getElementById('ui-v2-immersive-scene-shell');
    const panel = document.getElementById('ui-v2-scene-insight');
    const room = currentRoom;
    document.querySelectorAll<HTMLElement>('#ui-v2-scene-cast .v2-scene-cast-person[data-member-id]').forEach(person => {
        person.classList.toggle('is-inspected', Boolean(memberId) && person.dataset.memberId === memberId);
    });
    if (!shell || !panel || !room || !memberId) {
        if (shell) delete shell.dataset.insightMemberId;
        panel?.classList.add('hidden');
        if (panel) panel.innerHTML = '';
        return;
    }

    const member = room.members.find(item => item.id === memberId);
    if (!member || !room.scene.presentMemberIds.includes(member.id)) {
        delete shell.dataset.insightMemberId;
        panel.classList.add('hidden');
        panel.innerHTML = '';
        return;
    }

    shell.dataset.insightMemberId = member.id;
    panel.innerHTML = '';
    panel.classList.remove('hidden');

    const heading = document.createElement('div');
    heading.className = 'v2-scene-insight-heading';
    const identity = document.createElement('strong');
    identity.textContent = member.persona.name;
    const label = document.createElement('span');
    label.textContent = 'PRIVATE · 心裡';
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', '關閉角色內心');
    close.textContent = '×';
    close.addEventListener('click', () => renderUiV2SceneMemberInsight(null));
    heading.append(identity, label, close);

    const state = room.scene.memberStates?.[member.id];
    const appendFetchButton = () => {
        if (state?.innerThought?.trim() && state.attention?.trim() && state.chemistry?.trim()) return;
        const fetch = document.createElement('button');
        fetch.id = 'ui-v2-xray-fetch';
        fetch.type = 'button';
        fetch.className = 'v2-scene-insight-fetch';
        fetch.disabled = Boolean(uiV2XrayPendingRoomId);
        fetch.textContent = uiV2XrayPendingRoomId
            ? '正在補讀此刻 X-ray…'
            : '補讀此刻 X-ray · 額外 1 次 AI 請求';
        fetch.addEventListener('click', () => { void requestUiV2SceneXray(room.id); });
        panel.appendChild(fetch);
    };

    if (!state || !Object.values(state).some(Boolean)) {
        const empty = document.createElement('p');
        empty.className = 'v2-scene-insight-empty';
        empty.textContent = '此刻未有可顯示嘅內心線索。';
        panel.append(heading, empty);
        appendFetchButton();
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'v2-scene-insight-grid';
    [
        ['內心', state.innerThought || '未顯露'],
        ['注意', state.attention || '未明'],
        ['Chemistry', state.chemistry || '尚未記錄'],
    ].forEach(([name, value]) => {
        const item = document.createElement('div');
        const key = document.createElement('span');
        key.textContent = name;
        const text = document.createElement('p');
        text.textContent = value;
        item.append(key, text);
        grid.appendChild(item);
    });

    panel.append(heading, grid);
    appendFetchButton();
};

const toggleUiV2SceneMemberInsight = (memberId: string) => {
    const shell = document.getElementById('ui-v2-immersive-scene-shell');
    const detail = document.getElementById('ui-v2-scene-detail');
    const nowToggle = document.getElementById('ui-v2-scene-now-toggle');
    if (!shell || !detail) return;

    const shouldClose = shell.dataset.insightMemberId === memberId;
    if (shouldClose) {
        renderUiV2SceneMemberInsight(null);
        return;
    }

    detail.classList.remove('hidden');
    shell.classList.add('is-expanded');
    nowToggle?.setAttribute('aria-expanded', 'true');
    renderUiV2SceneMemberInsight(memberId);
    window.requestAnimationFrame(() => {
        document.getElementById('ui-v2-scene-insight')?.scrollIntoView({
            block: 'nearest',
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
    });
};

const renderUiV2ImmersiveSceneChrome = (forcedEnabled?: boolean) => {
    if (document.documentElement.dataset.wetappUi !== 'v2') return;
    ensureUiV2ImmersiveSceneStructure();

    const toggle = document.getElementById('ui-v2-immersive-scene-toggle') as HTMLButtonElement | null;
    const shell = document.getElementById('ui-v2-immersive-scene-shell');
    const room = currentRoom;
    const canUse = Boolean(room);
    toggle?.classList.toggle('hidden', !canUse);

    if (!room) {
        document.documentElement.removeAttribute('data-wetapp-scene');
        shell?.classList.add('hidden');
        toggle?.setAttribute('aria-pressed', 'false');
        return;
    }

    const enabled = forcedEnabled ?? getUiV2ImmersiveScenePreference();
    document.documentElement.dataset.wetappScene = enabled ? 'immersive' : 'standard';
    toggle?.setAttribute('aria-pressed', String(enabled));
    toggle?.classList.toggle('is-active', enabled);
    const toggleLabel = toggle?.querySelector('small');
    if (toggleLabel) toggleLabel.textContent = enabled ? '場景中' : '場景';
    shell?.classList.toggle('hidden', !enabled);
    if (!enabled || !shell) return;

    const realityLabels: Record<ChatRoom['scene']['realityLayer'], string> = {
        physical: '同一空間',
        texting: '遠端訊息',
        imagined: '想像場景',
    };
    const presentMembers = room.members.filter(member => room.scene.presentMemberIds.includes(member.id));
    const location = document.getElementById('ui-v2-scene-location');
    const meta = document.getElementById('ui-v2-scene-meta');
    const cast = document.getElementById('ui-v2-scene-cast');
    const worldState = document.getElementById('ui-v2-scene-world-state');
    const summary = document.getElementById('ui-v2-scene-summary');
    const unresolved = document.getElementById('ui-v2-scene-unresolved');

    if (location) location.textContent = room.scene.location || room.title || '目前場景';
    if (meta) {
        meta.textContent = `${realityLabels[room.scene.realityLayer]} · ${presentMembers.length} 位角色在場`;
    }

    if (cast) {
        cast.innerHTML = '';
        const you = document.createElement('span');
        you.className = 'v2-scene-cast-person is-user';
        you.innerHTML = '<span class="v2-scene-cast-avatar" aria-hidden="true">你</span><span>你</span>';
        cast.appendChild(you);

        presentMembers.forEach(member => {
            const persona = resolveRoomMemberAvatarPersona(member);
            const person = document.createElement('button');
            person.type = 'button';
            person.className = 'v2-scene-cast-person';
            person.dataset.memberId = member.id;
            person.setAttribute('aria-label', `查看 ${member.persona.name} 此刻內心`);
            person.addEventListener('click', () => toggleUiV2SceneMemberInsight(member.id));
            const avatar = document.createElement('span');
            avatar.className = 'v2-scene-cast-avatar';
            if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
                const image = document.createElement('img');
                image.src = persona.avatarUrl;
                image.alt = persona.name;
                image.loading = 'lazy';
                image.decoding = 'async';
                avatar.appendChild(image);
            } else {
                avatar.textContent = persona.emoji || '●';
            }
            const name = document.createElement('span');
            name.textContent = member.persona.name;
            person.append(avatar, name);
            cast.appendChild(person);
        });
    }

    if (worldState) {
        worldState.innerHTML = '';
        const heading = document.createElement('div');
        heading.className = 'v2-scene-world-heading';
        const title = document.createElement('strong');
        title.textContent = 'WORLD STATE';
        const hint = document.createElement('span');
        hint.textContent = '姿勢 · 動作 · 衣著';
        heading.append(title, hint);

        const list = document.createElement('div');
        list.className = 'v2-scene-world-list';
        presentMembers.forEach(member => {
            const row = document.createElement('div');
            row.className = 'v2-scene-world-row';
            const name = document.createElement('strong');
            name.textContent = member.persona.name;

            const state = room.scene.memberStates?.[member.id];
            const posture = document.createElement('span');
            posture.className = 'v2-scene-world-value';
            posture.textContent = state?.posture || '下一個回覆後記錄姿勢';
            posture.dataset.label = '姿勢';

            const action = document.createElement('span');
            action.className = 'v2-scene-world-value';
            action.textContent = state?.action || '下一個回覆後記錄動作';
            action.dataset.label = '動作';

            const wardrobe = document.createElement('span');
            wardrobe.className = 'v2-scene-world-value';
            wardrobe.textContent = room.scene.wardrobe?.characters?.[member.id] || '衣著未記錄';
            wardrobe.dataset.label = '衣著';

            row.append(name, posture, action, wardrobe);
            list.appendChild(row);
        });
        worldState.append(heading, list);
    }

    if (summary) {
        summary.textContent = room.scene.summary?.trim()
            || '呢個場景會隨你哋嘅對話繼續累積。';
    }
    if (unresolved) {
        unresolved.innerHTML = '';
        room.scene.unresolved.slice(0, 3).forEach(item => {
            const chip = document.createElement('span');
            chip.textContent = item;
            unresolved.appendChild(chip);
        });
        unresolved.classList.toggle('hidden', room.scene.unresolved.length === 0);
    }

    const selectedInsightMemberId = shell.dataset.insightMemberId;
    if (selectedInsightMemberId) {
        renderUiV2SceneMemberInsight(selectedInsightMemberId);
    }
};

const setUiV2SceneActiveSpeaker = (memberId: string | null) => {
    document.querySelectorAll<HTMLElement>('#ui-v2-scene-cast .v2-scene-cast-person').forEach(person => {
        person.classList.toggle('is-speaking', Boolean(memberId) && person.dataset.memberId === memberId);
    });
};

const startChat = (key: string, restoredHistory: ChatMessage[] | null = null, historyMode: 'push' | 'replace' | 'skip' = 'push') => {
    closeChatSearch();
    const storedRoom = roomManager.getRoom(key) || null;
    const room = storedRoom
        ? restoreRoomPrivateContinuityHandoffs(
            storedRoom,
            restoredHistory || memoryManager.peekChatHistory(key),
        )
        : null;
    const assistantConversation = isAssistantConversationKey(key, VENICE_ASSISTANT_PERSONA_KEY);
    if (assistantConversation && activeChatRequest && activeChatRequest.conversationKey !== key) cancelActiveChatRequest();
    const selectedPersona = assistantConversation
        ? memoryManager.getPersona(VENICE_ASSISTANT_PERSONA_KEY)
        : memoryManager.getPersona(key);

    if (!room && (!selectedPersona || (!assistantConversation && selectedPersona.gender !== 'female'))) {
        currentConversationKey = null;
        currentPersonaKey = null;
        currentPersona = null;
        currentRoom = null;
        showSelectionView('replace');
        return;
    }

    currentConversationKey = key;
    currentRoom = room;
    if (room) {
        void loadGroupChatPromptModule().catch(error => {
            console.error('Failed to prefetch Group prompt module', error);
        });
        const lead = room.members.find(member => member.id === room.leadMemberId) || room.members[0];
        activeRoomMemberId = lead?.id || null;
        const roomPersona = resolveRoomMemberPersona(room, activeRoomMemberId);
        if (!lead || !roomPersona) {
            showSelectionView('replace');
            return;
        }
        const sourcePersona = lead.sourcePersonaKey ? memoryManager.getPersona(lead.sourcePersonaKey) : undefined;
        currentPersona = {
            ...roomPersona,
            avatarUrl: roomPersona.avatarUrl || sourcePersona?.avatarUrl || null,
        };
        currentPersonaKey = lead.sourcePersonaKey || `${room.id}:${lead.id}`;
        chatHeaderName.textContent = room.title;
    } else {
        activeRoomMemberId = null;
        currentPersonaKey = assistantConversation ? VENICE_ASSISTANT_PERSONA_KEY : key;
        currentPersona = selectedPersona!;
        chatHeaderName.textContent = assistantConversation
            ? getAssistantTopicEntries().find(entry => entry.key === key)?.title || 'Venice AI'
            : currentPersona.conversationLabel || currentPersona.name;
    }

    document.documentElement.classList.toggle('aigf-worldline-active', Boolean(getActiveWorldline(key)));
    chatHeaderName.classList.toggle('is-room-title-editable', Boolean(room));
    if (room) {
        chatHeaderName.setAttribute('role', 'button');
        chatHeaderName.setAttribute('tabindex', '0');
        chatHeaderName.setAttribute('aria-label', `${room.title}：開啟群組資料並修改名稱`);
    } else {
        chatHeaderName.removeAttribute('role');
        chatHeaderName.removeAttribute('tabindex');
        chatHeaderName.removeAttribute('aria-label');
    }
    isGodModeActive = false;
    godModeHistory = [];
    applyUiV2ConversationTheme(room?.title || currentPersona?.name || key);
    updateChatModeControls(currentPersonaKey);
    if (assistantConversation) updateAssistantWebSearchButton();
    updateAssistantTopicLayout(assistantConversation);
    renderChatHeaderAvatar();
    renderUiV2ImmersiveSceneChrome();

    chatContainer.innerHTML = '';
    resetRenderedChatHistoryWindow();
    let chatHistory = restoredHistory || memoryManager.getChatHistory(key);
    if (restoredHistory) {
        if (shouldCancelActiveRequestForConversation(activeChatRequest?.conversationKey, key)) {
            cancelActiveChatRequest();
        }
        memoryManager.setChatHistory(key, restoredHistory);
    }
    const bridgedHistory = ensureLatestSceneTransitionBridge(
        chatHistory,
        key,
        room?.title || selectedPersona?.name || '目前對話',
        room || undefined,
    );
    if (bridgedHistory !== chatHistory) {
        chatHistory = bridgedHistory;
        memoryManager.setChatHistory(key, chatHistory);
    }
    chatHistory = recoverInterruptedPhotoProposals(key, chatHistory);
    if (room) appendLinkedLegacyHistory(room);
    renderChatHistoryWindow(key, chatHistory);

    appShell.classList.add('chat-open');
    personaSelectionView.classList.remove('hidden');
    imageStudioUi?.hide();
    videoStudioUi?.hide();
    chatView.classList.remove('hidden');
    chatView.classList.add('flex');
    if (
        document.documentElement.dataset.wetappUi === 'v2'
        && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
        chatView.classList.remove('v2-view-enter');
        void chatView.offsetWidth;
        chatView.classList.add('v2-view-enter');
        chatView.addEventListener('animationend', () => chatView.classList.remove('v2-view-enter'), { once: true });
    }
    saveExitModal.classList.add('hidden');
    messageInput.value = '';
    pendingChatAttachments.forEach(item => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    pendingChatAttachments = [];
    chatAttachmentPreview.innerHTML = '';
    chatAttachmentPreview.classList.add('hidden');
    resetMessageInput();
    hideError();
    applyChatRuntimeState('idle');
    updateSendButtonState();
    updateAlbumState();
    renderPersonaList();
    window.requestAnimationFrame(() => {
        setInstantScrollTop(chatContainer, chatContainer.scrollHeight);
        if (window.matchMedia('(min-width: 769px)').matches) messageInput.focus();
    });
    syncBrowserViewState({
        view: 'chat',
        conversationKey: key,
        personaKey: currentPersonaKey || undefined,
    }, historyMode);
    if (VPS_CHAT_BUILD) void resumeVpsChatTurn();
};

const renderNativeStoryHistory=()=>{if(currentConversationKey!==NATIVE_SYNC_KEY)return;chatContainer.replaceChildren();resetRenderedChatHistoryWindow();renderChatHistoryWindow(NATIVE_SYNC_KEY,memoryManager.peekChatHistory(NATIVE_SYNC_KEY));updateSendButtonState();};
const syncNativeStoryPilot=async()=>{
    if(!nativeStoryPilot||nativeStoryBusy||activeChatRequest||resumingVpsTurn||currentConversationKey!==NATIVE_SYNC_KEY||!isUnlocked||document.querySelector('dialog[aria-label="旁白導演"][open]'))return;
    nativeStoryBusy=true;
    try{
        const pending=pendingVpsTurn();
        if(pending){
            if(pending.conversationKey===NATIVE_SYNC_KEY){
                const local=memoryManager.peekChatHistory(NATIVE_SYNC_KEY);
                if(!local.some(m=>m.id===pending.replyId)){
                    if(await nativeStoryPilot.refresh())renderNativeStoryHistory();
                    const now=memoryManager.peekChatHistory(NATIVE_SYNC_KEY);
                    if(!now.some(m=>m.id===pending.replyId)&&now.at(-1)?.id!==pending.userMessageId){await makeVpsTurnController().abandon(pending.jobId);hideError();return;}
                }
                await resumeVpsChatTurn();
            }
            return;
        }
        if(await nativeStoryPilot.refresh())renderNativeStoryHistory();
        const user=memoryManager.peekChatHistory(NATIVE_SYNC_KEY).at(-1);
        if(user?.role!=='user'||!user.id)return;
        const digest=await digestVpsHistory(memoryManager.peekChatHistory(NATIVE_SYNC_KEY),2),world=await digestVpsWorld(NATIVE_SYNC_KEY);
        const matches=(await listVpsRecovery()).filter(row=>row.receipt.conversationKey===NATIVE_SYNC_KEY&&row.receipt.personaKey===NATIVE_SYNC_KEY&&row.receipt.userMessageId===user.id&&row.receipt.contextDigest===digest&&row.receipt.contextDigestVersion===2&&row.receipt.worldDigest===world&&['queued','running','done'].includes(row.status));
        if(matches.length===1){await makeVpsTurnController().adoptRecovery(matches[0].receipt);await resumeVpsChatTurn();}
        else if(matches.length>1)throw Error('NATIVE_SYNC_MULTIPLE_JOBS');
    }catch(e){if(currentConversationKey===NATIVE_SYNC_KEY)showError('同步暫未完成：'+(e instanceof Error?e.message:'UNKNOWN'));}
    finally{nativeStoryBusy=false;updateSendButtonState();maybeSyncNativeLedger();}
};
const openNativeStoryPilot=()=>{
    if(!nativePilotEnabled||!isUnlocked||activeChatRequest||resumingVpsTurn||nativeStoryBusy)return;
    if(nativeStoryPilot){startChat(NATIVE_SYNC_KEY,memoryManager.peekChatHistory(NATIVE_SYNC_KEY));void syncNativeStoryPilot();return;}
    const connect=async(email:string,password:string)=>{
        if(activeChatRequest||resumingVpsTurn||nativeStoryBusy)throw Error('CHAT_REQUEST_IN_PROGRESS');
        nativeStoryBusy=true;
        try{
            const pilot=createNativeStoryPilot({read:()=>memoryManager.peekChatHistory(NATIVE_SYNC_KEY),write:rows=>memoryManager.setChatHistory(NATIVE_SYNC_KEY,rows,true)});
            await pilot.signIn(email,password);
            const pending=pendingVpsTurn();
            if(!pending||pending.conversationKey!==NATIVE_SYNC_KEY)await pilot.refresh();
            memoryManager.installNativeStoryPilotPersona();nativeStoryPilot=pilot;
            startChat(NATIVE_SYNC_KEY,memoryManager.peekChatHistory(NATIVE_SYNC_KEY));
        }finally{nativeStoryBusy=false;}
        void syncNativeStoryPilot();
    };
    if(getPilotConnection().isSignedIn())void connect('','').catch(e=>showError('同步登入未完成：'+(e instanceof Error?e.message:'UNKNOWN')));else askPilotLogin(connect);
};
const showSelectionView = (historyMode: 'replace' | 'skip' = 'replace') => {
    closeChatSearch();
    imageStudioUi?.cancelRequest();
    imageStudioUi?.hide();
    cancelVideoPromptOptimization();
    personaSelectionView.classList.remove('hidden');
    chatView.classList.add('hidden');
    chatView.classList.remove('flex');
    videoStudioUi?.hide();
    saveExitModal.classList.add('hidden');
    appShell.classList.remove('chat-open');
    currentPersona = null;
    currentPersonaKey = null;
    currentConversationKey = null;
    currentRoom = null;
    document.documentElement.removeAttribute('data-wetapp-scene');
    document.getElementById('ui-v2-immersive-scene-shell')?.classList.add('hidden');
    document.getElementById('ui-v2-immersive-scene-toggle')?.classList.add('hidden');
    applyUiV2ConversationTheme(null);
    activeRoomMemberId = null;
    isGodModeActive = false;
    closePersonaSettings();
    updateAssistantTopicLayout(false);
    hideError();
    applyChatRuntimeState('idle');
    renderPersonaList();
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

    if (state?.view === 'chat' && state.conversationKey) {
        if (currentConversationKey !== state.conversationKey || chatView.classList.contains('hidden')) {
            startChat(state.conversationKey, null, 'skip');
        }
        return;
    }

    if (state?.view === 'image') {
        if (!imageStudioUi?.isVisible()) showImageStudio('skip');
        return;
    }

    if (state?.view === 'video') {
        if (!videoStudioUi?.isVisible()) {
            showVideoStudio('skip');
        }
        return;
    }

    if (
        !chatView.classList.contains('hidden')
        || Boolean(imageStudioUi?.isVisible())
        || Boolean(videoStudioUi?.isVisible())
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
    const topicLabel = currentConversationKey
        ? getAssistantTopicEntries().find(entry => entry.key === currentConversationKey)?.title || 'venice-output'
        : 'venice-output';
    const patchExport = extractAssistantJsonPatchExport(text);
    const archiveExport = patchExport ? null : extractAssistantZipExport(text);
    const jsonExport = patchExport || archiveExport ? null : extractAssistantJsonExport(text, topicLabel);
    if (jsonExport) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'assistant-json-download';
        button.textContent = '↓ 下載 JSON 檔案';
        button.title = '已驗證 JSON 格式；下載原始 JSON 文字';
        button.addEventListener('click', () => {
            const blob = new Blob([jsonExport.json], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = jsonExport.suggestedName;
            anchor.hidden = true;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        container.appendChild(button);
    }

    if (patchExport) {
        const patchButton = document.createElement('button');
        patchButton.type = 'button';
        patchButton.className = 'assistant-json-download';
        patchButton.textContent = '↓ 下載完整修正版 JSON（' + patchExport.operations.length + ' 項修改）';
        patchButton.title = '使用原始上傳檔案套用經驗證嘅最小修改；不會覆蓋原始存檔';
        const conversationKeyAtRender = currentConversationKey;
        patchButton.addEventListener('click', async () => {
            if (!conversationKeyAtRender) return;
            patchButton.disabled = true;
            patchButton.textContent = '正在核對修改並建立 JSON…';
            try {
                const history = memoryManager.peekChatHistory(conversationKeyAtRender);
                const matches = history.flatMap(message => message.role === 'user'
                    ? message.content.attachments || [] : []);
                const source = [...matches].reverse().find(item =>
                    item.name === patchExport.sourceFile && isAssistantJsonFile(item.name));
                let originalRaw: string | null = null;
                if (source) {
                    const blob = await (await loadChatMediaStoreModule()).getChatAttachmentBlob(source.assetId);
                    if (!blob) throw new Error('原始存檔附件已不存在，請重新上傳後再下載修正版。');
                    originalRaw = await blob.text();
                } else if (isSafeArchivePath(patchExport.sourceFile) && isAssistantJsonFile(patchExport.sourceFile)) {
                    // A Luna save uploaded inside a ZIP can also be repaired and
                    // downloaded as a stand-alone, importable full JSON file.
                    const archives = [...matches].reverse().filter(item =>
                        isAssistantZipFile(item.name, item.mimeType));
                    for (const attachment of archives) {
                        const zipBlob = await (await loadChatMediaStoreModule()).getChatAttachmentBlob(attachment.assetId);
                        if (!zipBlob) continue;
                        const sourceZip = new File([zipBlob], attachment.name, { type: attachment.mimeType });
                        const inspected = await readAssistantZipArchive(
                            sourceZip, undefined, 'deepseek-v4-1-flash-1017-uncensored');
                        if (!inspected.fileNames.includes(patchExport.sourceFile)) continue;
                        const zipLibrary = await (await import('./jsZipLoader.js')).loadJsZip();
                        const archive = await zipLibrary.loadAsync(zipBlob);
                        const innerFile = archive.file(patchExport.sourceFile);
                        if (!innerFile) continue;
                        const bytes: Uint8Array = await innerFile.async('uint8array');
                        if (bytes.byteLength > 2_500_000) {
                            throw new Error('ZIP 內原始 JSON 超過 2.5MB，未有套用修改。');
                        }
                        originalRaw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                        break;
                    }
                }
                if (originalRaw === null) {
                    throw new Error('搵唔到原始 JSON 存檔（包括 ZIP 內檔案），請喺同一話題重新上傳。');
                }
                const patched = patchAssistantJsonSave(originalRaw, patchExport);
                const output = new Blob([patched.json], { type: 'application/json;charset=utf-8' });
                const url = URL.createObjectURL(output);
                const link = document.createElement('a');
                link.href = url;
                link.download = patched.filename;
                link.hidden = true;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
            } catch (error) {
                showError(error instanceof Error ? error.message : '修復存檔失敗，原始 JSON 未被修改。');
            } finally {
                patchButton.disabled = false;
                patchButton.textContent = '↓ 下載完整修正版 JSON（' + patchExport.operations.length + ' 項修改）';
            }
        });
        container.appendChild(patchButton);
    }

    if (archiveExport) {
        const zipButton = document.createElement('button');
        zipButton.type = 'button';
        zipButton.className = 'assistant-json-download assistant-zip-download';
        zipButton.textContent = '↓ 下載 ZIP（' + archiveExport.files.length + ' 個更新檔案）';
        zipButton.title = archiveExport.sourceArchive
            ? '由原 ZIP 保留現有檔案，並套用 AI 提供嘅替換內容'
            : '將 AI 產生的文字檔案打包成 ZIP';
        const conversationKeyAtRender = currentConversationKey;
        zipButton.addEventListener('click', async () => {
            if (!conversationKeyAtRender) return;
            zipButton.disabled = true;
            zipButton.textContent = '正在建立 ZIP…';
            try {
                let sourceBlob: Blob | null = null;
                if (archiveExport.sourceArchive) {
                    const history = memoryManager.peekChatHistory(conversationKeyAtRender);
                    const matches = history.flatMap(message => message.role === 'user'
                        ? message.content.attachments || [] : []);
                    const source = [...matches].reverse().find(item =>
                        item.name === archiveExport.sourceArchive
                        && isAssistantZipFile(item.name, item.mimeType));
                    if (source) {
                        sourceBlob = await (await loadChatMediaStoreModule()).getChatAttachmentBlob(source.assetId);
                    }
                }
                const { filename, blob } = await buildAssistantZipDownload(archiveExport, sourceBlob);
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.hidden = true;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
            } catch (error) {
                showError(error instanceof Error ? error.message : '無法建立 ZIP 檔案。');
            } finally {
                zipButton.disabled = false;
                zipButton.textContent = '↓ 下載 ZIP（' + archiveExport.files.length + ' 個更新檔案）';
            }
        });
        container.appendChild(zipButton);
    }
};

const getCharacterPhotoObjectUrl = async (assetId: string) => {
    const cachedUrl = characterPhotoObjectUrls.get(assetId);
    if (cachedUrl) return cachedUrl;

    const blob = await (await loadPhotoStoreModule()).getCharacterPhotoBlob(assetId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    characterPhotoObjectUrls.set(assetId, url);
    return url;
};

const getContentImageUrl = async (content: Content) => {
    if (content.imageUrl) return content.imageUrl;
    return content.imageAssetId ? getCharacterPhotoObjectUrl(content.imageAssetId) : null;
};

const closeMessageActions = () => {
    if (!openMessageActionMenu) return;
    openMessageActionMenu.classList.add('hidden');
    const trigger = openMessageActionMenu.parentElement?.querySelector<HTMLElement>('.message-recall-button');
    trigger?.setAttribute('aria-expanded', 'false');
    openMessageActionMenu = null;
};

document.addEventListener('click', event => {
    if (openMessageActionMenu && !openMessageActionMenu.contains(event.target as Node)) {
        closeMessageActions();
    }
});

let conversationActions: import('./features/conversationActions.js').ConversationActionsHandle | null = null;
let conversationActionsLoad: Promise<import('./features/conversationActions.js').ConversationActionsHandle> | null = null;

const loadConversationActions = async () => {
    if (conversationActions) return conversationActions;
    if (!conversationActionsLoad) {
        conversationActionsLoad = import('./features/conversationActions.js')
            .then(({ createConversationActions }) => {
                const actions = createConversationActions({
                    memoryManager,
                    roomManager,
                    getCurrentConversationKey: () => currentConversationKey,
                    getCurrentPersona: () => currentPersona,
                    getCurrentPersonaKey: () => currentPersonaKey,
                    getCurrentRoom: () => currentRoom,
                    hasActiveChatRequest: () => Boolean(activeChatRequest),
                    cancelRequestForConversation: conversationKey => {
                        if (shouldCancelActiveRequestForConversation(activeChatRequest?.conversationKey, conversationKey)) {
                            cancelActiveChatRequest();
                        }
                    },
                    recallVpsTurn: VPS_CHAT_BUILD ? (key,messageId)=>makeVpsTurnController().recall(key,()=>memoryManager.removeUserTurn(key,messageId,true)) : undefined,
                    abortCharacterPhotoRequest: () => characterPhotoRequestController?.abort(),
                    clearSessionMemories,
                    removeSessionMemoriesBySourceMessageIds,
                    closeMessageActions,
                    releaseCharacterPhotoObjectUrl: assetId => {
                        const objectUrl = characterPhotoObjectUrls.get(assetId);
                        if (objectUrl) URL.revokeObjectURL(objectUrl);
                        characterPhotoObjectUrls.delete(assetId);
                    },
                    releaseChatAttachmentObjectUrl: assetId => {
                        const objectUrl = chatAttachmentObjectUrls.get(assetId);
                        if (objectUrl) URL.revokeObjectURL(objectUrl);
                        chatAttachmentObjectUrls.delete(assetId);
                    },
                    renderPersonaList,
                    startChat,
                    showSelectionView,
                    restoreDraft: (text, mode) => {
                        messageInput.value = text;
                        resetMessageInput();
                        updateSendButtonState();
                        const focusDraft = () => {
                            if (mode === 'branch') chatContainer.scrollTop = chatContainer.scrollHeight;
                            if (mode === 'recall' || window.matchMedia('(min-width: 769px)').matches) {
                                messageInput.focus();
                                messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
                            }
                        };
                        if (mode === 'branch') window.requestAnimationFrame(focusDraft);
                        else window.setTimeout(focusDraft, 40);
                    },
                });
                conversationActions = actions;
                return actions;
            })
            .catch(error => {
                conversationActionsLoad = null;
                throw error;
            });
    }
    return conversationActionsLoad;
};

const deleteCustomPersona = (key: string) => {
    void loadConversationActions()
        .then(actions => actions.deleteCustomPersona(key))
        .catch(error => console.error('Failed to delete custom persona', error));
};

const deleteConversationFromList = (key: string, title: string, room?: ChatRoom) => {
    if(key===NATIVE_SYNC_KEY){showError('同步試用請使用收回最新一輪。');return;}
    void loadConversationActions()
        .then(actions => actions.deleteConversation(key, title, room))
        .catch(error => console.error('Failed to delete conversation', error));
};

const createTimelineBranch = (messageId: string) => {
    if(currentConversationKey===NATIVE_SYNC_KEY){showError('獨立文字同步試用暫未接駁分支。');return;}
    void loadConversationActions()
        .then(actions => actions.createTimelineBranch(messageId))
        .catch(error => console.error('Failed to create timeline branch', error));
};

const recallUserMessage = (messageId: string) => {
    if(currentConversationKey===NATIVE_SYNC_KEY){
        if(!nativeStoryPilot||nativeStoryBusy||activeChatRequest||resumingVpsTurn){showError('請先完成目前同步操作。');return;}
        if(!confirm('收回最新一輪同步測試訊息及回覆？'))return;
        nativeStoryBusy=true;
        void (async()=>{await nativeStoryPilot!.recall(messageId,()=>{if(!memoryManager.removeUserTurn(NATIVE_SYNC_KEY,messageId,true))throw Error('NATIVE_SYNC_RECALL_NOT_FOUND');});await makeVpsTurnController().recall(NATIVE_SYNC_KEY,()=>true);await nativeStoryPilot!.refresh();renderNativeStoryHistory();hideError();})().catch(e=>showError('收回未完成：'+(e instanceof Error?e.message:'UNKNOWN'))).finally(()=>{nativeStoryBusy=false;updateSendButtonState();});
        return;
    }
    void loadConversationActions()
        .then(actions => actions.recallUserMessage(messageId))
        .catch(error => {
            console.error('Failed to recall message', error);
            alert('收回訊息失敗，請重試。如果問題持續，請重新載入頁面後再試。');
        });
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
    if (!currentConversationKey) return;
    const proposal = findPhotoProposalMessage(currentConversationKey, proposalId)?.message.content.photoProposal;
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

const usesConfirmedPublicIdentity = (persona: Persona | null | undefined) => Boolean(
    persona?.publicIdentityEnabled && persona.publicIdentity,
);

const resolvePhotoProposalPersona = (proposal: CharacterPhotoProposal) => {
    const member = currentRoom?.members.find(item => item.id === proposal.senderMemberId);
    if (!member) return currentPersona as Persona | null;
    const sourcePersona = member.sourcePersonaKey ? memoryManager.getPersona(member.sourcePersonaKey) : undefined;
    return {
        ...member.persona,
        avatarUrl: member.persona.avatarUrl || sourcePersona?.avatarUrl || null,
    } satisfies Persona;
};

const switchCharacterPhotoIdentityMode = async (
    proposalId: string,
    useAvatarReference: boolean,
) => {
    if (!currentConversationKey || switchingCharacterPhotoProposalId || activeCharacterPhotoProposalId) return;
    const conversationKey = currentConversationKey;
    const proposal = findPhotoProposalMessage(conversationKey, proposalId)?.message.content.photoProposal;
    const persona = proposal ? resolvePhotoProposalPersona(proposal) : null;
    if (!persona || !proposal?.scenePrompt) return;
    if ((proposal.subjectMemberIds?.length || 0) > 1) {
        showError('多人照片固定使用文字生成，不能切換成單一頭像參考。');
        return;
    }
    if (usesConfirmedPublicIdentity(persona)) {
        showError('已確認的公眾人物／知名角色固定使用公開身份文字生成。');
        return;
    }
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
        const basePrompt = buildCharacterPhotoPrompt(persona, proposal.scenePrompt, useAvatarReference);
        const favoritePromptVersion = proposal.favoriteScenePrompt
            ? buildCharacterPhotoPrompt(persona, proposal.favoriteScenePrompt, useAvatarReference)
            : undefined;
        const favoritePromptApplied = Boolean(
            proposal.favoritePrompt
            && favoritePromptVersion
            && proposal.favoritePromptApplied !== false,
        );
        updatePhotoProposal(conversationKey, proposalId, {
            prompt: selectPhotoPromptVersion(basePrompt, favoritePromptVersion, favoritePromptApplied),
            basePrompt,
            favoritePromptVersion,
            favoritePromptApplied,
            useAvatarReference,
            identityMode: useAvatarReference ? 'avatar_reference' : 'persona_description',
            modelId: model.id,
            modelName: model.name,
            resolution: model.constraints.defaultResolution || model.constraints.resolutions?.[0],
            seed: mode === 'generate'
                ? resolveImageSeedForRequest(imageSeed, imageSeedLock.checked)
                : undefined,
            estimatedPriceUsd: getImageModelPrice(model, model.constraints.defaultResolution),
            status: 'pending',
            error: undefined,
        });
        hideError();
    } catch (error) {
        showError(error instanceof Error ? error.message : '無法切換照片的外貌來源。');
    } finally {
        switchingCharacterPhotoProposalId = null;
        if (currentConversationKey === conversationKey) refreshPhotoProposalCard(proposalId);
    }
};

const createPhotoProposalCard = (proposal: CharacterPhotoProposal) => {
    const card = document.createElement('section');
    card.className = `character-photo-proposal is-${proposal.status}`;
    card.dataset.photoProposalId = proposal.id;
    const proposalPersona = resolvePhotoProposalPersona(proposal);

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
    const usesPublicIdentity = proposal.identityMode === 'public_identity';
    const identityMeta = usesPublicIdentity
        ? '依已確認公開身份文字生成'
        : proposal.useAvatarReference ? '會參考角色頭像保持外貌' : '依角色外貌設定生成';
    meta.textContent = `${identityMeta} · ${proposal.aspectRatio} · ${price}`;

    if (proposal.modelName || proposal.modelId) {
        meta.textContent += ` · ${proposal.modelName || proposal.modelId}`;
    }
    if (typeof proposal.seed === 'number') {
        meta.textContent += ` · Seed ${proposal.seed}`;
    }

    const identitySource = document.createElement('div');
    identitySource.className = `character-photo-identity ${proposal.useAvatarReference ? 'uses-avatar' : 'uses-description'}`;
    const hasUsableAvatar = Boolean(
        proposalPersona?.avatarUrl
        && !proposalPersona.avatarUrl.startsWith('generating_'),
    );
    if (proposal.useAvatarReference && hasUsableAvatar && proposalPersona?.avatarUrl) {
        const referenceImage = document.createElement('img');
        referenceImage.src = proposalPersona.avatarUrl;
        referenceImage.alt = `${proposalPersona.name} 的實際參考頭像`;
        referenceImage.className = 'character-photo-reference-image';
        identitySource.appendChild(referenceImage);
    } else {
        const identityMark = document.createElement('span');
        identityMark.className = 'character-photo-identity-mark';
        identityMark.textContent = usesPublicIdentity ? 'ID' : 'Aa';
        identitySource.appendChild(identityMark);
    }

    const identityCopy = document.createElement('div');
    identityCopy.className = 'character-photo-identity-copy';
    const identityTitle = document.createElement('strong');
    identityTitle.textContent = usesPublicIdentity
        ? `已確認公開身份：${proposalPersona?.publicIdentity?.canonicalName || proposalPersona?.name || '角色'}`
        : proposal.useAvatarReference ? '使用這張頭像鎖定身分' : '使用角色名稱與外貌設定';
    const identityDetail = document.createElement('span');
    identityDetail.textContent = usesPublicIdentity
        ? '不會上傳頭像；Prompt 會固定加入已確認的標準名稱、身份及原作視覺設定。'
        : proposal.useAvatarReference
            ? '這張預覽圖會送到 edit 模型，不只作為畫面顯示。'
            : `不會上傳頭像；適合像 ${proposalPersona?.name || 'IU'} 這類文字生成辨識較準的人物。`;
    identityCopy.append(identityTitle, identityDetail);
    identitySource.appendChild(identityCopy);

    const canSwitchIdentity = Boolean(
        proposal.scenePrompt
        && hasUsableAvatar
        && (proposal.subjectMemberIds?.length || 0) <= 1
        && !usesPublicIdentity
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

    card.append(eyebrow, identitySource, prompt);

    const canToggleFavoritePrompt = Boolean(
        proposal.favoritePrompt
        && proposal.basePrompt
        && proposal.favoritePromptVersion
        && (proposal.status === 'pending' || proposal.status === 'failed'),
    );
    if (canToggleFavoritePrompt) {
        const favoriteToggle = document.createElement('label');
        favoriteToggle.className = 'character-photo-favorite-toggle';
        const favoriteCheckbox = document.createElement('input');
        favoriteCheckbox.type = 'checkbox';
        favoriteCheckbox.checked = proposal.favoritePromptApplied !== false;
        const favoriteCopy = document.createElement('span');
        const favoriteTitle = document.createElement('strong');
        favoriteTitle.textContent = favoriteCheckbox.checked ? '已套用常用 Prompt' : '未套用常用 Prompt';
        const favoriteText = document.createElement('span');
        favoriteText.textContent = proposal.favoritePrompt || '';
        favoriteCopy.append(favoriteTitle, favoriteText);
        favoriteToggle.append(favoriteCheckbox, favoriteCopy);
        favoriteCheckbox.addEventListener('change', () => {
            if (!currentConversationKey || !proposal.basePrompt) return;
            const favoritePromptApplied = favoriteCheckbox.checked;
            updatePhotoProposal(currentConversationKey, proposal.id, {
                prompt: selectPhotoPromptVersion(
                    proposal.basePrompt,
                    proposal.favoritePromptVersion,
                    favoritePromptApplied,
                ),
                favoritePromptApplied,
                status: 'pending',
                error: undefined,
            });
            refreshPhotoProposalCard(proposal.id);
        });
        card.appendChild(favoriteToggle);
    }

    card.appendChild(meta);

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
        status.textContent = '照片已生成並存入聊天與私人相簿。';
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
        editor.maxLength = CHARACTER_PHOTO_EDITOR_MAX_LENGTH;

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
            if (nextPrompt.length > CHARACTER_PHOTO_EDITOR_MAX_LENGTH) {
                editor.setCustomValidity(`Prompt 不可超過 ${CHARACTER_PHOTO_EDITOR_MAX_LENGTH} 字元。`);
                editor.reportValidity();
                return;
            }
            if (!currentConversationKey) return;
            const favoritePromptApplied = proposal.favoritePromptApplied !== false;
            const variantUpdates = proposal.favoritePrompt
                ? favoritePromptApplied
                    ? { favoritePromptVersion: nextPrompt }
                    : { basePrompt: nextPrompt }
                : { basePrompt: nextPrompt };
            updatePhotoProposal(currentConversationKey, proposal.id, {
                prompt: nextPrompt,
                ...variantUpdates,
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

const buildPhotoViewerContextFromContent = (
    content: Content,
    source: 'chat' | 'album',
    personaKey: string | null,
): PhotoViewerContext => {
    const matchingProposal = personaKey
        ? [...memoryManager.getChatHistory(personaKey)].reverse().find(message => {
            const proposal = message.content.photoProposal;
            return Boolean(
                proposal
                && proposal.status === 'generated'
                && proposal.prompt === (content.imagePrompt || ''),
            );
        })?.content.photoProposal
        : undefined;
    const generation = content.imageGeneration;
    const useAvatarReference = generation?.useAvatarReference
        ?? matchingProposal?.useAvatarReference
        ?? /^Edit the supplied reference portrait/iu.test(content.imagePrompt || '');
    const mode = generation?.mode || (useAvatarReference ? 'edit' : 'generate');

    return {
        source,
        prompt: content.imagePrompt || content.text || `${currentPersona?.name || '角色'} 的照片`,
        caption: content.text || `${currentPersona?.name || '角色'} 傳來的照片`,
        mode,
        modelId: generation?.modelId || matchingProposal?.modelId,
        modelName: generation?.modelName || matchingProposal?.modelName,
        aspectRatio: generation?.aspectRatio || matchingProposal?.aspectRatio || '3:4',
        resolution: generation?.resolution || matchingProposal?.resolution,
        personaKey: personaKey || undefined,
        content,
        useAvatarReference,
        identityMode: generation?.identityMode || matchingProposal?.identityMode,
        seed: generation?.seed ?? matchingProposal?.seed,
    };
};

const createChatImageAttachment = (
    content: Content,
    sender: 'user' | 'bot' | 'system' | 'god-mode',
) => {
    const attachment = document.createElement('button');
    attachment.type = 'button';
    attachment.className = 'chat-image-attachment';

    const icon = document.createElement('span');
    icon.className = 'chat-image-attachment-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z"/><path d="m6.5 16 3.25-3.5 2.5 2.5 1.75-2 3.5 3.5"/><circle cx="15.75" cy="8.75" r="1.25"/></svg>';

    const copy = document.createElement('span');
    copy.className = 'chat-image-attachment-copy';
    const title = document.createElement('strong');
    title.textContent = sender === 'bot' && currentPersona
        ? `${currentPersona.name} 傳來的照片`
        : '照片附件';
    const detail = document.createElement('span');
    detail.textContent = content.imageAssetId
        ? '只存於私人相簿 · 點擊查看'
        : '點擊查看完整圖片';
    copy.append(title, detail);

    const arrow = document.createElement('span');
    arrow.className = 'chat-image-attachment-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';

    attachment.append(icon, copy, arrow);
    attachment.setAttribute('aria-label', `${title.textContent}，點擊查看完整圖片`);
    attachment.addEventListener('click', async () => {
        if (attachment.disabled) return;
        attachment.disabled = true;
        attachment.classList.add('is-loading');
        detail.textContent = '正在開啟照片...';
        try {
            const imageUrl = await getContentImageUrl(content);
            if (!imageUrl) throw new Error('Photo asset is unavailable.');
            openPhotoViewer(
                imageUrl,
                buildPhotoViewerContextFromContent(content, 'chat', currentConversationKey),
            );
            detail.textContent = content.imageAssetId
                ? '只存於私人相簿 · 點擊查看'
                : '點擊查看完整圖片';
            attachment.classList.remove('is-error');
        } catch (error) {
            console.warn('Unable to open chat image attachment:', error);
            detail.textContent = '照片暫時無法載入，點擊重試';
            attachment.classList.add('is-error');
        } finally {
            attachment.disabled = false;
            attachment.classList.remove('is-loading');
        }
    });
    return attachment;
};

const createStoredChatAttachmentCard = (attachment: ChatAttachment) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `stored-chat-attachment is-${attachment.kind}`;
    const icon = document.createElement('span');
    icon.className = 'stored-chat-attachment-icon';
    icon.textContent = attachment.kind === 'image' ? 'IMG' : attachment.kind === 'video' ? '▶' : 'DOC';
    const copy = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = attachment.name;
    const meta = document.createElement('small');
    meta.textContent = `${Math.max(1, Math.round(attachment.size / 1024))} KB · 點擊開啟`;
    copy.append(name, meta);
    button.append(icon, copy);
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            const blob = await (await loadChatMediaStoreModule()).getChatAttachmentBlob(attachment.assetId);
            if (!blob) throw new Error('附件只存在原本裝置，或已被清除。');
            let objectUrl = chatAttachmentObjectUrls.get(attachment.assetId);
            if (!objectUrl) {
                objectUrl = URL.createObjectURL(blob);
                chatAttachmentObjectUrls.set(attachment.assetId, objectUrl);
            }
            if (attachment.kind === 'image') {
                openImageFullscreen(objectUrl, attachment.name);
            } else if (attachment.kind === 'video') {
                window.open(objectUrl, '_blank', 'noopener,noreferrer');
            } else {
                const link = document.createElement('a');
                link.href = objectUrl;
                link.download = attachment.name;
                document.body.appendChild(link);
                link.click();
                link.remove();
            }
        } catch (error) {
            alert(error instanceof Error ? error.message : '附件暫時無法開啟。');
        } finally {
            button.disabled = false;
        }
    });
    return button;
};

const findMemoryProposalMessage = (conversationKey: string, proposalId: string) => {
    const history = memoryManager.getChatHistory(conversationKey);
    const messageIndex = history.findIndex(message => message.content.memoryProposal?.id === proposalId);
    return messageIndex >= 0 ? { history, messageIndex, message: history[messageIndex] } : null;
};

const updateMemoryProposal = (
    conversationKey: string,
    proposalId: string,
    updates: Partial<NonNullable<Content['memoryProposal']>>,
) => {
    const found = findMemoryProposalMessage(conversationKey, proposalId);
    if (!found?.message.content.memoryProposal) return null;
    found.message.content.memoryProposal = { ...found.message.content.memoryProposal, ...updates };
    memoryManager.setChatHistory(conversationKey, found.history);
    return found.message.content.memoryProposal;
};

const createMemoryProposalCard = (proposal: NonNullable<Content['memoryProposal']>) => {
    const card = document.createElement('section');
    card.className = 'system-action-card memory-proposal-card';
    card.dataset.memoryProposalId = proposal.id;
    const memoryIntent = detectExplicitMemoryIntent(proposal.originalText);
    const requestedScope = memoryIntent?.scope || 'unspecified';
    const memoryKind = memoryIntent?.kind || inferExplicitMemoryKind(proposal.originalText);
    const title = document.createElement('strong');
    title.textContent = proposal.status === 'pending'
        ? requestedScope === 'permanent'
            ? '你要求永久記住；確認儲存方式'
            : requestedScope === 'session'
                ? '你要求只限本次；確認儲存方式'
                : '這件事要記多久？'
        : '記憶處理結果';
    const summary = document.createElement('p');
    summary.textContent = proposal.summary;
    card.append(title, summary);

    const room = currentRoom;
    const targetWrap = document.createElement('div');
    targetWrap.className = 'memory-target-list';
    if (room && proposal.status === 'pending') {
        room.members
            .filter(member => room.scene.presentMemberIds.includes(member.id))
            .forEach(member => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = member.id;
                checkbox.checked = proposal.targetMemberIds.includes(member.id);
                label.append(checkbox, document.createTextNode(member.persona.name));
                targetWrap.appendChild(label);
            });
        card.appendChild(targetWrap);
    }

    if (proposal.status !== 'pending') {
        const status = document.createElement('span');
        status.className = 'system-action-status';
        status.textContent = proposal.status === 'saved'
            ? '已加入永久記憶'
            : proposal.status === 'session-only'
                ? '只在本次瀏覽工作階段記住；重新載入後清除'
                : '沒有儲存';
        card.appendChild(status);
        return card;
    }

    const actions = document.createElement('div');
    actions.className = 'system-action-buttons';
    const makeButton = (label: string, action: 'saved' | 'session-only' | 'declined', primary = false) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = primary ? 'is-primary' : '';
        button.textContent = label;
        button.addEventListener('click', async () => {
            if (!currentConversationKey || activeChatRequest) return;
            const targetIds = room
                ? Array.from(targetWrap.querySelectorAll<HTMLInputElement>('input:checked')).map(input => input.value)
                : [];
            if ((action === 'saved' || action === 'session-only') && room && targetIds.length === 0) {
                alert('請至少選擇 1 位角色。');
                return;
            }
            const conversationKey = currentConversationKey;
            if (action === 'saved') {
                if (room) {
                    roomManager.addSoulMemory(room.id, targetIds, {
                        kind: memoryKind,
                        title: proposal.summary.slice(0, 36),
                        summary: proposal.summary,
                        originalText: proposal.originalText,
                        sourceMessageIds: proposal.sourceMessageId ? [proposal.sourceMessageId] : [],
                        participants: targetIds,
                    });
                    refreshCurrentRoom();
                } else if (currentPersonaKey && currentPersona) {
                    memoryManager.addPersonaMemory(currentPersonaKey, 'soul', {
                        kind: memoryKind,
                        title: proposal.summary.slice(0, 36),
                        summary: proposal.summary,
                        originalText: proposal.originalText,
                        sourceMessageIds: proposal.sourceMessageId ? [proposal.sourceMessageId] : [],
                    });
                }
            } else if (action === 'session-only') {
                addSessionMemory(conversationKey, {
                    kind: memoryKind,
                    summary: proposal.summary,
                    targetMemberIds: targetIds,
                    sourceMessageIds: proposal.sourceMessageId ? [proposal.sourceMessageId] : [],
                });
            }
            updateMemoryProposal(conversationKey, proposal.id, {
                status: action,
                targetMemberIds: targetIds,
            });
            startChat(conversationKey, null, 'skip');
            await continuePendingConversationTurn(proposal.originalText);
        });
        return button;
    };
    actions.append(
        makeButton('永久記住', 'saved', requestedScope === 'permanent'),
        makeButton('只限本次', 'session-only', requestedScope === 'session'),
        makeButton('不要儲存', 'declined'),
    );
    card.appendChild(actions);
    return card;
};

const findPhotoIntentMessage = (conversationKey: string, proposalId: string) => {
    const history = memoryManager.getChatHistory(conversationKey);
    const messageIndex = history.findIndex(message => message.content.photoIntent?.id === proposalId);
    return messageIndex >= 0 ? { history, messageIndex, message: history[messageIndex] } : null;
};

const updatePhotoIntent = (
    conversationKey: string,
    proposalId: string,
    updates: Partial<NonNullable<Content['photoIntent']>>,
) => {
    const found = findPhotoIntentMessage(conversationKey, proposalId);
    if (!found?.message.content.photoIntent) return null;
    found.message.content.photoIntent = { ...found.message.content.photoIntent, ...updates };
    memoryManager.setChatHistory(conversationKey, found.history);
    return found.message.content.photoIntent;
};

const createPhotoIntentCard = (proposal: NonNullable<Content['photoIntent']>) => {
    const card = document.createElement('section');
    card.className = 'system-action-card photo-intent-card';
    const title = document.createElement('strong');
    title.textContent = proposal.status === 'pending' ? '要真的請角色準備照片嗎？' : '照片要求已處理';
    const request = document.createElement('p');
    request.textContent = proposal.requestText;
    card.append(title, request);
    const room = currentRoom;
    let senderSelect: HTMLSelectElement | null = null;
    const subjectWrap = document.createElement('div');
    subjectWrap.className = 'photo-intent-subjects';
    if (room && proposal.status === 'pending') {
        const senderLabel = document.createElement('label');
        senderLabel.className = 'wa-field-label';
        senderLabel.textContent = '由誰準備';
        senderSelect = document.createElement('select');
        room.members
            .filter(member => room.scene.presentMemberIds.includes(member.id))
            .forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = member.persona.name;
                option.selected = member.id === proposal.senderMemberId;
                senderSelect!.appendChild(option);
            });
        senderLabel.appendChild(senderSelect);
        const subjectLabel = document.createElement('span');
        subjectLabel.className = 'system-action-label';
        subjectLabel.textContent = '照片中的角色';
        subjectWrap.appendChild(subjectLabel);
        room.members
            .filter(member => room.scene.presentMemberIds.includes(member.id))
            .forEach(member => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = member.id;
                checkbox.checked = proposal.subjectMemberIds.includes(member.id);
                label.append(checkbox, document.createTextNode(member.persona.name));
                subjectWrap.appendChild(label);
            });
        card.append(senderLabel, subjectWrap);
    }
    if (proposal.status !== 'pending') {
        const status = document.createElement('span');
        status.className = 'system-action-status';
        status.textContent = proposal.status === 'confirmed' ? '已交給角色構思照片' : '已改為普通文字回覆';
        card.appendChild(status);
        return card;
    }

    const actions = document.createElement('div');
    actions.className = 'system-action-buttons';
    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'is-primary';
    approve.textContent = '是，準備照片';
    approve.addEventListener('click', async () => {
        if (!currentConversationKey || activeChatRequest) return;
        const senderMemberId = senderSelect?.value || proposal.senderMemberId;
        const subjectMemberIds = room
            ? Array.from(subjectWrap.querySelectorAll<HTMLInputElement>('input:checked')).map(input => input.value)
            : proposal.subjectMemberIds;
        if (room && (!senderMemberId || subjectMemberIds.length === 0)) {
            alert('請選擇準備照片的人，以及至少 1 位照片中的角色。');
            return;
        }
        const conversationKey = currentConversationKey;
        updatePhotoIntent(conversationKey, proposal.id, {
            status: 'confirmed',
            senderMemberId,
            subjectMemberIds,
        });
        if (senderMemberId) selectActiveRoomMember(senderMemberId);
        await continuePendingPhotoTurn(proposal.requestText, senderMemberId, subjectMemberIds);
    });
    const decline = document.createElement('button');
    decline.type = 'button';
    decline.textContent = '不用拍，照常回覆';
    decline.addEventListener('click', async () => {
        if (!currentConversationKey || activeChatRequest) return;
        const conversationKey = currentConversationKey;
        updatePhotoIntent(conversationKey, proposal.id, { status: 'declined' });
        startChat(conversationKey, null, 'skip');
        await continuePendingConversationTurn(proposal.requestText);
    });
    actions.append(approve, decline);
    card.appendChild(actions);
    return card;
};

const findNpcProposalMessage = (conversationKey: string, proposalId: string) => {
    const history = memoryManager.getChatHistory(conversationKey);
    const messageIndex = history.findIndex(message => message.content.npcProposal?.id === proposalId);
    return messageIndex >= 0 ? { history, messageIndex, message: history[messageIndex] } : null;
};

const updateNpcProposal = (
    conversationKey: string,
    proposalId: string,
    updates: Partial<NonNullable<Content['npcProposal']>>,
) => {
    const found = findNpcProposalMessage(conversationKey, proposalId);
    if (!found?.message.content.npcProposal) return null;
    found.message.content.npcProposal = { ...found.message.content.npcProposal, ...updates };
    memoryManager.setChatHistory(conversationKey, found.history);
    return found.message.content.npcProposal;
};

const normalizedParticipantName = (value: string) => value
    .trim()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase();

const findStoredPersonaForNpc = (name: string, excludedKey?: string) => (
    Object.entries(memoryManager.getAllPersonas()).find(([key, persona]) => {
        if (key === excludedKey || key === VENICE_ASSISTANT_PERSONA_KEY || persona.timelineBranch) return false;
        const target = normalizedParticipantName(name);
        return normalizedParticipantName(persona.name) === target
            || normalizedParticipantName(persona.publicIdentity?.canonicalName || '') === target;
    })
);

let observedNpcPersonaModuleLoad: Promise<typeof import('./observedNpcPersona.js')> | null = null;

const loadObservedNpcPersonaModule = () => {
    observedNpcPersonaModuleLoad ??= import('./observedNpcPersona.js');
    return observedNpcPersonaModuleLoad;
};

const analyzeObservedNpcPersona = async (
    proposal: NonNullable<Content['npcProposal']>,
    mainPersona: Persona,
    identity?: PublicIdentity,
): Promise<ObservedNpcPersonaDraft> => {
    const { analyzeObservedNpcPersonaDraft } = await loadObservedNpcPersonaModule();
    const liveEvidence = currentConversationKey
        ? buildNpcObservationEvidence(currentConversationKey, proposal.name)
        : '';
    const evidence = [proposal.evidence, liveEvidence]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n\n')
        .slice(-NPC_OBSERVATION_EVIDENCE_LIMIT);
    return analyzeObservedNpcPersonaDraft({
        proposal,
        mainPersonaName: mainPersona.name,
        identity,
        evidence,
    }, {
        models: buildStrictReviewModelRoute(chatModelSettings, false),
        runModel: async (modelRequest, timeoutMs) => (
            await generateChatTextWithTimeout({
                model: modelRequest.model,
                messages: modelRequest.messages,
                responseFormat: modelRequest.responseFormat as Parameters<typeof generateChatTextWithTimeout>[0]['responseFormat'],
                temperature: modelRequest.temperature,
                topP: modelRequest.topP,
                repetitionPenalty: modelRequest.repetitionPenalty,
            }, timeoutMs)
        ).text,
    });
};

const buildNpcMemberPersona = (
    proposal: NonNullable<Content['npcProposal']>,
    storedPersona: Persona | undefined,
    identityResolution: PublicIdentityResolution | null,
    observedDraft: ObservedNpcPersonaDraft | null = null,
): Persona => {
    const identity = identityResolution?.identity || storedPersona?.publicIdentity;
    const continuityAnchor = [
        `${proposal.name} 是這個聊天室中固定、獨立的角色。${proposal.description}`,
        '保持自己的第一人稱、語氣、動機、關係位置與已知記憶，不可被其他成員的人格同化。',
        '把加入前已經發生的對話當成真實連續經歷；先回應最新一句話，再用自然對話、動作和環境細節推進，不重複同一反應，也不代替使用者說話。',
        identity ? `已確認身份：${identity.canonicalName}。公開資料只固定國籍、職業、作品及外觀識別；聊天室內關係屬虛構連續世界。` : '',
    ].filter(Boolean).join('\n');

    return {
        name: storedPersona?.name || identity?.canonicalName || proposal.name,
        emoji: storedPersona?.emoji || (proposal.gender === 'male' ? '◆' : '🌼'),
        gender: storedPersona?.gender || proposal.gender,
        description: storedPersona?.description || observedDraft?.description || proposal.description,
        prompt: [storedPersona?.prompt || observedDraft?.prompt, continuityAnchor].filter(Boolean).join('\n\n'),
        greeting: storedPersona?.greeting
            || observedDraft?.greeting
            || `（${proposal.name} 第一次以固定成員身份留在聊天室，先看了看其他人，再自然地接回剛才的話題。）`,
        avatarPrompt: identity?.visualPrompt || storedPersona?.avatarPrompt || proposal.description,
        avatarUrl: identityResolution?.avatarUrl || storedPersona?.avatarUrl || null,
        memory: storedPersona?.memory || '',
        soul: storedPersona?.soul
            ? cloneRoomSnapshot(storedPersona.soul)
            : cloneRoomSnapshot(observedDraft?.soul || []),
        memories: storedPersona?.memories
            ? cloneRoomSnapshot(storedPersona.memories)
            : cloneRoomSnapshot(observedDraft?.memories || []),
        publicIdentityEnabled: Boolean(identity),
        publicIdentity: identity,
    };
};

const createNpcRoomMember = (
    proposal: NonNullable<Content['npcProposal']>,
    persona: Persona,
    sourcePersonaKey?: string,
): RoomMember => {
    const joinedAt = Date.now();
    const memberId = `member_${joinedAt}_${Math.random().toString(36).slice(2, 8)}`;
    return {
        id: memberId,
        sourcePersonaKey,
        persona,
        joinedAt,
        soul: [
            ...(persona.soul || []).map(entry => ({
                ...cloneRoomSnapshot(entry),
                participants: [memberId],
                roleplayOnly: true,
            })),
            {
            id: `soul_${joinedAt}_${Math.random().toString(36).slice(2, 7)}`,
            kind: 'core',
            title: '加入聊天室時的身份錨點',
            summary: proposal.description,
            participants: [memberId],
            createdAt: joinedAt,
            pinned: true,
            roleplayOnly: true,
            },
        ],
        memories: (persona.memories || []).map(entry => ({
            ...cloneRoomSnapshot(entry),
            participants: [memberId],
            roleplayOnly: true,
        })),
    };
};

const addNpcProposalToRoom = async (
    proposal: NonNullable<Content['npcProposal']>,
    resolvePublicIdentity: boolean,
) => {
    if (!currentConversationKey || !currentPersona || activeChatRequest) return;
    const conversationKey = currentConversationKey;
    const convertingFromSingle = !currentRoom;
    const sourcePersonaKey = convertingFromSingle ? currentPersonaKey || conversationKey : undefined;
    const sourcePersona = currentPersona;
    const activeTargetRoom = currentRoom
        ? roomManager.getRoom(currentRoom.id) || currentRoom
        : roomManager.getRooms().find(room => room.legacySourcePersonaKey === conversationKey);
    if (activeTargetRoom && activeTargetRoom.members.length >= ROOM_MEMBER_LIMIT) {
        alert(`這個聊天室已有 ${ROOM_MEMBER_LIMIT} 位固定角色，請先到聊天室資料移除一位。`);
        return;
    }
    const duplicate = activeTargetRoom?.members.find(member => (
        member.persona.name.trim().toLocaleLowerCase() === proposal.name.trim().toLocaleLowerCase()
        || member.persona.publicIdentity?.canonicalName?.trim().toLocaleLowerCase() === proposal.name.trim().toLocaleLowerCase()
    ));
    if (duplicate) {
        updateNpcProposal(conversationKey, proposal.id, {
            status: 'added',
            memberId: duplicate.id,
        });
        if (activeTargetRoom && currentConversationKey === conversationKey) {
            startChat(activeTargetRoom.id, null, 'replace');
        }
        return;
    }

    const identityResolution = resolvePublicIdentity
        ? await requestPublicIdentityResolution(proposal.publicFigureQuery || proposal.name)
        : null;
    if (resolvePublicIdentity && !identityResolution) return;
    if (currentConversationKey !== conversationKey) return;

    const storedPersonaEntry = findStoredPersonaForNpc(proposal.name, sourcePersonaKey);
    const observedDraft = storedPersonaEntry
        ? null
        : await analyzeObservedNpcPersona(proposal, sourcePersona, identityResolution?.identity);
    if (currentConversationKey !== conversationKey) return;
    const enrichedProposal = observedDraft
        ? { ...proposal, description: observedDraft.description }
        : proposal;
    if (observedDraft) {
        updateNpcProposal(conversationKey, proposal.id, { description: observedDraft.description });
    }
    const persona = buildNpcMemberPersona(
        enrichedProposal,
        storedPersonaEntry?.[1],
        identityResolution,
        observedDraft,
    );
    const siblingProposals = convertingFromSingle
        ? memoryManager.peekChatHistory(conversationKey)
            .flatMap(message => {
                const sibling = message.content.npcProposal;
                return sibling && sibling.id !== proposal.id && sibling.status === 'pending'
                    ? [{ ...cloneRoomSnapshot(sibling), requestText: undefined }]
                    : [];
            })
        : [];
    const transferSiblingProposals = (targetConversationKey: string) => {
        siblingProposals.forEach(sibling => {
            memoryManager.addMessage(targetConversationKey, 'system', { npcProposal: sibling });
            updateNpcProposal(conversationKey, sibling.id, { status: 'transferred' });
        });
    };

    if (activeTargetRoom) {
        const latestRoom = roomManager.getRoom(activeTargetRoom.id);
        if (!latestRoom || latestRoom.members.length >= ROOM_MEMBER_LIMIT) return;
        const member = createNpcRoomMember(enrichedProposal, persona, storedPersonaEntry?.[0]);
        roomManager.addMember(latestRoom.id, member);
        updateNpcProposal(conversationKey, proposal.id, { status: 'added', memberId: member.id });
        transferSiblingProposals(latestRoom.id);
        startChat(latestRoom.id, null, convertingFromSingle ? 'replace' : 'skip');
        if (convertingFromSingle && proposal.requestText) {
            await continuePendingConversationTurn(proposal.requestText);
        }
        return;
    }

    if (!sourcePersonaKey) return;
    const createdRoom = roomManager.createRoom(
        `${sourcePersona.name}、${persona.name}`,
        [
            { sourcePersonaKey, persona: sourcePersona },
            { sourcePersonaKey: storedPersonaEntry?.[0], persona },
        ],
    );
    const addedMember = createdRoom.members[1];
    roomManager.updateRoom(createdRoom.id, room => {
        room.legacySourcePersonaKey = conversationKey;
        room.description = `${sourcePersona.name} 與 ${persona.name} 的固定群組`;
        room.scene.location = '由原本單人聊天延續的群組聊天室';
        room.scene.realityLayer = 'texting';
        room.scene.summary = `${persona.name} 已獲使用者確認，正式加入原本由 ${sourcePersona.name} 主持的連續對話。加入前的互動仍然有效。`;
        const member = room.members.find(item => item.id === addedMember.id);
        if (member) member.soul = createNpcRoomMember(enrichedProposal, persona, storedPersonaEntry?.[0]).soul.map(entry => ({
            ...entry,
            participants: [member.id],
        }));
    });
    updateNpcProposal(conversationKey, proposal.id, { status: 'added', memberId: addedMember.id });
    memoryManager.addMessage(createdRoom.id, 'system', {
        text: `${persona.name} 已加入；原本單人聊天已安全升級為群組，舊紀錄保持不變。`,
    });
    transferSiblingProposals(createdRoom.id);
    renderPersonaList();
    startChat(createdRoom.id, null, 'replace');
    if (proposal.requestText) await continuePendingConversationTurn(proposal.requestText);
};

const createNpcProposalCard = (proposal: NonNullable<Content['npcProposal']>) => {
    const card = document.createElement('section');
    card.className = 'system-action-card npc-proposal-card';
    const title = document.createElement('strong');
    title.textContent = proposal.status === 'pending'
        ? currentRoom
            ? `要把 ${proposal.name} 加入固定成員嗎？`
            : `要把 ${proposal.name} 加入，並把這段聊天升級為群組嗎？`
        : '新角色處理結果';
    const description = document.createElement('p');
    description.textContent = proposal.description;
    card.append(title, description);
    if (proposal.detectionSource === 'observed' && proposal.observedTurns) {
        const observationHint = document.createElement('span');
        observationHint.className = 'system-action-hint';
        observationHint.textContent = `已觀察 ${proposal.observedTurns} 個獨立回覆輪次；確認後才會建立固定人格與記憶。`;
        card.appendChild(observationHint);
    }
    if (proposal.publicFigureQuery) {
        const identityHint = document.createElement('span');
        identityHint.className = 'system-action-hint';
        identityHint.textContent = `可能是公眾人物：${proposal.publicFigureQuery}`;
        card.appendChild(identityHint);
    }
    if (proposal.status !== 'pending') {
        const status = document.createElement('span');
        status.className = 'system-action-status';
        status.textContent = proposal.status === 'added'
            ? '已成為固定成員'
            : proposal.status === 'not_person'
                ? '已標記為非人物，不會加入聊天室'
                : proposal.status === 'transferred'
                    ? '候選已移到新群組，請在群組內確認'
                    : '保留為本段臨時人物';
        card.appendChild(status);
        return card;
    }

    const actions = document.createElement('div');
    actions.className = 'system-action-buttons';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'is-primary';
    add.textContent = currentRoom ? '加入固定成員' : '確認並升級群組';
    const identify = document.createElement('button');
    identify.type = 'button';
    identify.textContent = '辨識公眾身份後加入';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = '只作臨時人物';
    dismiss.addEventListener('click', async () => {
        if (!currentConversationKey) return;
        const conversationKey = currentConversationKey;
        updateNpcProposal(conversationKey, proposal.id, { status: 'dismissed' });
        startChat(conversationKey, null, 'skip');
        if (proposal.requestText) await continuePendingConversationTurn(proposal.requestText);
    });
    const reject = document.createElement('button');
    reject.type = 'button';
    reject.textContent = '這不是人物';
    reject.addEventListener('click', async () => {
        if (!currentConversationKey) return;
        const conversationKey = currentConversationKey;
        updateNpcProposal(conversationKey, proposal.id, { status: 'not_person' });
        startChat(conversationKey, null, 'skip');
        if (proposal.requestText) await continuePendingConversationTurn(proposal.requestText);
    });
    actions.append(add, identify, dismiss, reject);
    let isAdding = false;
    const runAdd = async (resolvePublicIdentity: boolean) => {
        if (isAdding) return;
        isAdding = true;
        const previousTitle = title.textContent;
        const buttons = Array.from(actions.querySelectorAll('button'));
        buttons.forEach(button => { button.disabled = true; });
        title.textContent = proposal.detectionSource === 'observed'
            ? `正在整理 ${proposal.name} 的人格、soul.md 與 memory.md…`
            : `正在加入 ${proposal.name}…`;
        try {
            await addNpcProposalToRoom(proposal, resolvePublicIdentity);
        } catch (error) {
            console.error('Unable to add observed NPC:', error);
            const message = error instanceof Error ? error.message : `未能加入 ${proposal.name}，請稍後再試。`;
            alert(message);
        } finally {
            if (card.isConnected) {
                isAdding = false;
                buttons.forEach(button => { button.disabled = false; });
                title.textContent = previousTitle;
            }
        }
    };
    add.addEventListener('click', () => void runAdd(false));
    identify.addEventListener('click', () => void runAdd(true));
    card.appendChild(actions);
    return card;
};

let chatSearchUi: import('./features/chatSearchUi.js').ChatSearchUiHandle | null = null;
let chatSearchUiLoad: Promise<import('./features/chatSearchUi.js').ChatSearchUiHandle> | null = null;

const loadChatSearchUi = async () => {
    if (chatSearchUi) return chatSearchUi;
    if (!chatSearchUiLoad) {
        chatSearchUiLoad = import('./features/chatSearchUi.js')
            .then(({ createChatSearchUi }) => {
                const ui = createChatSearchUi({
                    getHiddenHistoryCount: () => renderedChatHistoryStartIndex,
                    expandOlderHistory: count => prependOlderChatHistory(count),
                });
                chatSearchUi = ui;
                return ui;
            })
            .catch(error => {
                chatSearchUiLoad = null;
                throw error;
            });
    }
    return chatSearchUiLoad;
};

const openChatSearch = () => {
    void loadChatSearchUi()
        .then(ui => ui.open())
        .catch(error => console.error('Failed to load Chat Search UI', error));
};

const closeChatSearch = () => chatSearchUi?.close();
const createContextBridgeCard = (bridge: ChatContextBridge) => {
    const card = document.createElement('section');
    card.className = 'system-action-card context-bridge-card';
    const title = document.createElement('strong');
    title.textContent = bridge.kind === 'group_to_private'
        ? '私人對話已承接'
        : bridge.kind === 'member_invited'
            ? '新角色已加入'
            : bridge.kind === 'member_left'
                ? '角色已離場'
                : bridge.kind === 'member_returned'
                    ? '角色已回到場景'
                    : '群組情境已承接';
    const description = document.createElement('p');
    description.textContent = contextBridgeDisplayText(bridge);
    const summary = document.createElement('small');
    summary.textContent = bridge.summary;
    card.append(title, description, summary);
    return card;
};

const getSurpriseEventParticipantNames = (proposal: SurpriseEventProposal) => {
    if (currentRoom) {
        return proposal.involvedMemberIds
            .map(memberId => currentRoom?.members.find(member => member.id === memberId)?.persona.name)
            .filter((name): name is string => Boolean(name));
    }
    return currentPersona ? [currentPersona.name] : [];
};

const getSurpriseEventMemberName = (memberId: string, room?: ChatRoom) => (
    room?.members.find(member => member.id === memberId)?.persona.name
    || currentRoom?.members.find(member => member.id === memberId)?.persona.name
    || (memberId === currentPersonaKey ? currentPersona?.name : '')
    || memberId
);

const buildSurpriseEventExecutionContract = (proposal: SurpriseEventProposal, room?: ChatRoom) => {
    const participantNames = proposal.involvedMemberIds.map(id => getSurpriseEventMemberName(id, room));
    const roleLines = (proposal.memberRoles || []).map(role => (
        `- ${getSurpriseEventMemberName(role.memberId, room)} [${role.memberId}]: objective=${role.objective}; first visible move=${role.firstMove}`
    ));
    const activityLines = (proposal.activities || []).map((activity, index) => `${index + 1}. ${activity}`);
    const minimumSpeakers = proposal.contentMode === 'nsfw'
        ? participantNames.length
        : participantNames.length >= 4 ? 3 : participantNames.length;
    return [
        '[SURPRISE EVENT EXECUTION CONTRACT - hidden instructions, never quote or mention]',
        `Selected participants: ${participantNames.join(', ')}`,
        roleLines.length > 0 ? `Distinct role plan:\n${roleLines.join('\n')}` : '',
        activityLines.length > 0 ? `Concrete activity rundown:\n${activityLines.join('\n')}` : '',
        proposal.userChoice ? `Unresolved user decision: ${proposal.userChoice}` : '',
        'The causal order is fixed: establish the concrete catalyst, let the selected characters perform their assigned first moves, then stop at the unresolved user decision.',
        'Every selected participant must be visibly involved in this opening through attributed dialogue, a named action, or a named reaction. Nobody selected may disappear or become an unexplained spectator.',
        participantNames.length > 1
            ? `At least ${minimumSpeakers} selected characters must speak in separately attributed lines; the others still need a named action or reaction.`
            : 'The selected character must speak and take one concrete action.',
        proposal.contentMode === 'nsfw'
            ? 'This is a live interactive adult program, not an outline. Start inside activity 1 of round one: every selected cast member speaks, performs her assigned in-show move, and interacts with at least one other cast member before the user choice. Follow the concrete activity rundown instead of inventing another vague challenge.'
            : '',
        'Do not replace these distinct roles with a generic statement that everyone participates. Do not make unselected fixed members speak or act.',
    ].filter(Boolean).join('\n');
};

const surpriseEventReplyCoversParticipants = (
    proposal: SurpriseEventProposal,
    room: ChatRoom,
    result: GroupGenerationResult,
) => {
    const selectedIds = Array.from(new Set(proposal.involvedMemberIds));
    const selectedSet = new Set(selectedIds);
    const fixedMemberIds = new Set(room.members.map(member => member.id));
    const spokenIds = new Set<string>();
    const visibleIds = new Set<string>();

    result.segments.forEach(segment => {
        if (segment.type === 'dialogue' && segment.speakerId && selectedSet.has(segment.speakerId)) {
            spokenIds.add(segment.speakerId);
            visibleIds.add(segment.speakerId);
        }
        const normalizedText = segment.text.toLocaleLowerCase();
        selectedIds.forEach(memberId => {
            const memberName = room.members.find(member => member.id === memberId)?.persona.name.trim();
            if (memberName && normalizedText.includes(memberName.toLocaleLowerCase())) visibleIds.add(memberId);
        });
    });

    const hasUnselectedFixedSpeaker = result.segments.some(segment => (
        segment.type === 'dialogue'
        && Boolean(segment.speakerId)
        && fixedMemberIds.has(segment.speakerId!)
        && !selectedSet.has(segment.speakerId!)
    ));
    const minimumSpeakers = proposal.contentMode === 'nsfw'
        ? selectedIds.length
        : selectedIds.length >= 4 ? 3 : selectedIds.length;
    return !hasUnselectedFixedSpeaker
        && selectedIds.every(memberId => visibleIds.has(memberId))
        && spokenIds.size >= minimumSpeakers;
};

const createSurpriseEventCard = (proposal: SurpriseEventProposal) => {
    const isAdultShow = proposal.contentMode === 'nsfw';
    const card = document.createElement('section');
    card.className = `system-action-card surprise-event-card surprise-event-${proposal.status}${isAdultShow ? ' surprise-event-show-card' : ''}`;
    card.dataset.surpriseEventId = proposal.id;

    const eyebrow = document.createElement('div');
    eyebrow.className = 'surprise-event-eyebrow';
    const deckLabel = document.createElement('span');
    deckLabel.textContent = isAdultShow ? '18+ INTERACTIVE SHOW' : 'SURPRISE EVENT';
    const statusLabel = document.createElement('span');
    statusLabel.className = 'surprise-event-status';
    statusLabel.textContent = proposal.status === 'active'
        ? '進行中'
        : proposal.status === 'completed'
            ? '已完成'
        : proposal.status === 'starting'
            ? '正在展開'
            : proposal.status === 'declined'
                ? '已略過'
                : proposal.status === 'failed' ? '未能展開' : isAdultShow ? '待開場' : '待選擇';
    eyebrow.append(deckLabel, statusLabel);

    const title = document.createElement('h4');
    title.textContent = proposal.title;
    const badges = document.createElement('div');
    badges.className = 'surprise-event-badges';
    [
        proposal.contentMode === 'nsfw'
            ? '18+ / NSFW'
            : proposal.contentMode === 'non-sexual' ? '非 18+' : '',
        getSurpriseEventCategoryLabel(proposal.category),
        getSurpriseEventIntensityLabel(proposal.intensity),
        ...(!isAdultShow ? getSurpriseEventParticipantNames(proposal) : []),
    ].filter(Boolean).forEach(label => {
        const badge = document.createElement('span');
        badge.textContent = label;
        badges.appendChild(badge);
    });
    const hook = document.createElement('p');
    hook.className = 'surprise-event-hook';
    hook.textContent = proposal.hook;
    const setup = document.createElement('p');
    setup.className = 'surprise-event-setup';
    setup.textContent = proposal.setup;
    card.append(eyebrow, title, badges);

    if (isAdultShow) {
        const cast = document.createElement('div');
        cast.className = 'surprise-event-cast';
        const castLabel = document.createElement('strong');
        castLabel.textContent = '參與陣容';
        const castNames = document.createElement('span');
        castNames.textContent = getSurpriseEventParticipantNames(proposal).join(' · ');
        cast.append(castLabel, castNames);

        const program = document.createElement('div');
        program.className = 'surprise-event-program';
        const programLabel = document.createElement('strong');
        programLabel.textContent = '節目內容';
        program.append(programLabel, hook, setup);
        card.append(cast, program);

        if (proposal.activities?.length) {
            const activitySection = document.createElement('div');
            activitySection.className = 'surprise-event-activities';
            const activityLabel = document.createElement('strong');
            activityLabel.textContent = '本回合實際活動';
            const activityList = document.createElement('ol');
            proposal.activities.forEach(activity => {
                const item = document.createElement('li');
                item.textContent = activity;
                activityList.appendChild(item);
            });
            activitySection.append(activityLabel, activityList);
            card.appendChild(activitySection);
        }
    } else {
        card.append(hook, setup);
    }

    if (proposal.userChoice) {
        const choice = document.createElement('div');
        choice.className = 'surprise-event-user-choice';
        const label = document.createElement('strong');
        label.textContent = isAdultShow ? '第一回合由你決定' : '留給你決定';
        const text = document.createElement('span');
        text.textContent = proposal.userChoice;
        choice.append(label, text);
        card.appendChild(choice);
    }

    if (proposal.error) {
        const error = document.createElement('small');
        error.className = 'surprise-event-error';
        error.textContent = proposal.error;
        card.appendChild(error);
    }

    if (proposal.status === 'pending' || proposal.status === 'failed') {
        const actions = document.createElement('div');
        actions.className = 'system-card-actions surprise-event-actions';
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'primary';
        start.textContent = proposal.status === 'failed'
            ? (isAdultShow ? '再試開場' : '再試開始')
            : (isAdultShow ? '開始節目' : '開始事件');
        start.addEventListener('click', () => void startSurpriseEvent(proposal.id));
        const redraw = document.createElement('button');
        redraw.type = 'button';
        redraw.textContent = isAdultShow ? '換一個節目' : '換一張';
        redraw.addEventListener('click', () => openSurpriseEventOptions(proposal.id));
        const decline = document.createElement('button');
        decline.type = 'button';
        decline.textContent = '暫時不要';
        decline.addEventListener('click', () => declineSurpriseEvent(proposal.id));
        actions.append(start, redraw, decline);
        card.appendChild(actions);
    } else if (proposal.status === 'starting') {
        const progress = document.createElement('div');
        progress.className = 'surprise-event-progress';
        progress.innerHTML = `<span aria-hidden="true"></span>${isAdultShow ? '所有參與角色正在進入第一回合…' : '角色正在把事件帶進目前情境…'}`;
        card.appendChild(progress);
    }

    return card;
};

type MessageScrollMode = 'auto' | 'bottom' | 'start' | 'none';

const scheduleMessageScroll = (
    messageWrapper: HTMLElement,
    sender: 'user' | 'bot' | 'system' | 'god-mode',
    requestedMode: MessageScrollMode,
) => {
    const mode = requestedMode === 'auto'
        ? (sender === 'bot' || sender === 'god-mode' ? 'start' : 'bottom')
        : requestedMode;
    if (mode === 'none') return;

    const applyScroll = () => {
        if (!messageWrapper.isConnected) return;
        if (mode === 'bottom') {
            chatContainer.scrollTop = chatContainer.scrollHeight;
            return;
        }

        const containerRect = chatContainer.getBoundingClientRect();
        const messageRect = messageWrapper.getBoundingClientRect();
        const readableTop = calculateMessageStartScrollTop(
            chatContainer.scrollTop,
            messageRect.top,
            containerRect.top,
        );
        setInstantScrollTop(chatContainer, readableTop);
    };

    if (mode === 'start') {
        // Read layout and position the reply before the browser can paint it at the old scroll offset.
        applyScroll();
    } else {
        window.requestAnimationFrame(applyScroll);
    }
};

const appendMessage = (
    content: Content,
    sender: 'user' | 'bot' | 'system' | 'god-mode',
    messageMeta?: Pick<ChatMessage, 'speakerId' | 'createdAt' | 'id'>,
    scrollMode: MessageScrollMode = 'auto',
    target: HTMLElement | DocumentFragment = chatContainer,
): HTMLElement => {
    const isSystemMessage = sender === 'system';
    const groupDisplaySegments = sender === 'bot' && currentRoom
        ? getGroupDisplaySegments(content, currentRoom, messageMeta?.speakerId)
        : [];
    
    let messageWrapper: HTMLElement;
    let immersiveGroupStageSpeakerIds: Array<string | null> = [];

    if (isSystemMessage && content.memoryProposal) {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'system-action-message';
        messageWrapper.appendChild(createMemoryProposalCard(content.memoryProposal));
    } else if (isSystemMessage && content.photoIntent) {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'system-action-message';
        messageWrapper.appendChild(createPhotoIntentCard(content.photoIntent));
    } else if (isSystemMessage && content.npcProposal) {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'system-action-message';
        messageWrapper.appendChild(createNpcProposalCard(content.npcProposal));
    } else if (isSystemMessage && content.surpriseEvent) {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'system-action-message';
        messageWrapper.appendChild(createSurpriseEventCard(content.surpriseEvent));
    } else if (isSystemMessage && content.contextBridge && content.contextBridge.kind !== 'scene_transition') {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'system-action-message';
        messageWrapper.appendChild(createContextBridgeCard(content.contextBridge));
    } else if (sender === 'bot' && currentRoom) {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'group-chat-turn';
        const storyBubble = document.createElement('div');
        storyBubble.className = 'chat-bubble bot-bubble group-story-bubble';
        const stageImmersiveReply = target === chatContainer
            && isUiV2ImmersiveSceneActive()
            && scrollMode !== 'none';
        let immersiveStageIndex = 0;
        groupDisplaySegments.forEach(segment => {
            const line = document.createElement('div');
            line.className = `group-story-line ${segment.type === 'narration' ? 'group-story-narration' : 'group-story-dialogue'}`;
            if (stageImmersiveReply) {
                line.classList.add('v2-scene-reveal-line');
                line.style.setProperty('--v2-scene-reveal-index', String(immersiveStageIndex));
                immersiveGroupStageSpeakerIds.push(segment.type === 'dialogue' ? segment.speakerId : null);
                immersiveStageIndex += 1;
            }
            const speaker = document.createElement('span');
            speaker.className = `group-speaker-name${segment.type === 'narration' ? ' group-narrator-name' : ''}`;
            const text = document.createElement('span');

            if (segment.type === 'narration') {
                speaker.textContent = '[旁白]';
                text.className = 'group-story-narration-text';
                appendStoryInline(text, segment.text);
                line.append(speaker, text);
                storyBubble.appendChild(line);
                return;
            }

            const member = currentRoom?.members.find(item => item.id === segment.speakerId);
            if (!member) return;
            const avatarPersona = resolveRoomMemberAvatarPersona(member);
            const speakerAvatar = document.createElement('span');
            speakerAvatar.className = 'group-speaker-avatar';
            if (avatarPersona.avatarUrl && !avatarPersona.avatarUrl.startsWith('generating_')) {
                const image = document.createElement('img');
                image.src = avatarPersona.avatarUrl;
                image.alt = avatarPersona.name;
                speakerAvatar.appendChild(image);
            } else {
                speakerAvatar.textContent = avatarPersona.emoji || '●';
            }
            enableAvatarPreview(speakerAvatar, avatarPersona);
            const speakerLabel = document.createElement('span');
            speakerLabel.textContent = `[${member.persona.name}]`;
            speaker.append(speakerAvatar, speakerLabel);
            text.className = 'group-story-dialogue-text';
            appendStoryInline(text, segment.text);
            line.append(speaker, text);
            storyBubble.appendChild(line);
        });
        if (content.photoProposal) {
            storyBubble.appendChild(createPhotoProposalCard(content.photoProposal));
        }
        if (content.imageUrl || content.imageAssetId) {
            storyBubble.appendChild(createChatImageAttachment(content, sender));
        }
        content.attachments?.forEach(attachment => {
            storyBubble.appendChild(createStoredChatAttachmentCard(attachment));
        });
        messageWrapper.appendChild(storyBubble);
    } else if (isSystemMessage) {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'system-chat-message';
        messageWrapper.textContent = content.text || '';
    } else {
        const isCharacterConversationReply = sender === 'bot'
            && Boolean(currentPersona)
            && !currentRoom
            && !isAssistantPersonaKey(currentPersonaKey);
        messageWrapper = document.createElement('div');
        messageWrapper.className = `flex items-start p-1 space-x-2 ${sender === 'user' ? 'justify-end' : ''}${isCharacterConversationReply ? ' character-chat-turn' : ''}`;

        if (sender === 'bot' && currentPersona) {
            const speakerMember = currentRoom?.members.find(member => member.id === messageMeta?.speakerId);
            const avatarPersona = speakerMember?.persona || currentPersona;
            const avatarContainer = document.createElement('div');
            avatarContainer.className = 'w-8 h-8 rounded-full bg-gray-700 flex-shrink-0 flex items-center justify-center';
            if (avatarPersona.avatarUrl && !avatarPersona.avatarUrl.startsWith('generating_')) {
                const img = document.createElement('img');
                img.src = avatarPersona.avatarUrl;
                img.alt = avatarPersona.name;
                img.className = 'w-full h-full rounded-full object-cover';
                avatarContainer.appendChild(img);
            } else {
                avatarContainer.classList.add('emoji-avatar');
                avatarContainer.textContent = avatarPersona.emoji;
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
            sender === 'bot' ? `bot-bubble${isCharacterConversationReply ? ' character-message-surface' : ''}` : 
            'god-mode-bubble'
        }`;

        if (isCharacterConversationReply && currentPersona) {
            const speakerLabel = document.createElement('span');
            speakerLabel.className = 'character-message-speaker';
            speakerLabel.textContent = currentPersona.name;
            bubble.appendChild(speakerLabel);
        }

        if (content.text) {
            if (sender === 'bot' && isAssistantPersonaKey(currentPersonaKey)) {
                renderAssistantMarkdown(bubble, content.text);
            } else {
                const textElement = document.createElement('p');
                if(sender === 'bot') appendStoryInline(textElement,content.text);
                else textElement.textContent = content.text;
                bubble.appendChild(textElement);
            }
        }
        if (sender === 'bot' && content.photoProposal) {
            bubble.appendChild(createPhotoProposalCard(content.photoProposal));
        }
        if (content.imageUrl || content.imageAssetId) {
            bubble.appendChild(createChatImageAttachment(content, sender));
        }
        content.attachments?.forEach(attachment => {
            bubble.appendChild(createStoredChatAttachmentCard(attachment));
        });

        if (sender === 'user' && messageMeta?.id && !content.legacy) {
            messageWrapper.dataset.messageId = messageMeta.id;
            bubble.classList.add('has-message-actions');
            const recallButton = document.createElement('button');
            recallButton.type = 'button';
            recallButton.className = 'message-recall-button';
            recallButton.title = '訊息選項';
            recallButton.setAttribute('aria-label', '開啟訊息選項');
            recallButton.setAttribute('aria-haspopup', 'menu');
            recallButton.setAttribute('aria-expanded', 'false');
            recallButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 10 5 5 5-5"></path></svg>';

            const actionMenu = document.createElement('div');
            actionMenu.className = 'message-action-menu hidden';
            actionMenu.setAttribute('role', 'menu');

            const branchButton = document.createElement('button');
            branchButton.type = 'button';
            branchButton.className = 'message-action-item';
            branchButton.setAttribute('role', 'menuitem');
            branchButton.innerHTML = '<span class="message-action-icon">⑂</span><span><strong>從這句建立分支</strong><small>原對話保持不變</small></span>';
            branchButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void createTimelineBranch(messageMeta.id!);
            });

            const recallAction = document.createElement('button');
            recallAction.type = 'button';
            recallAction.className = 'message-action-item is-danger';
            recallAction.setAttribute('role', 'menuitem');
            recallAction.innerHTML = '<span class="message-action-icon">↶</span><span><strong>收回訊息</strong><small>同時撤回回覆與衍生記憶</small></span>';
            recallAction.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void recallUserMessage(messageMeta.id!);
            });
            actionMenu.append(branchButton, recallAction);

            recallButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                const shouldOpen = actionMenu.classList.contains('hidden');
                closeMessageActions();
                if (shouldOpen) {
                    actionMenu.classList.remove('hidden');
                    actionMenu.classList.remove('opens-up');
                    recallButton.setAttribute('aria-expanded', 'true');
                    openMessageActionMenu = actionMenu;
                    window.requestAnimationFrame(() => {
                        const menuRect = actionMenu.getBoundingClientRect();
                        const containerRect = chatContainer.getBoundingClientRect();
                        if (menuRect.bottom > containerRect.bottom - 8) actionMenu.classList.add('opens-up');
                    });
                }
            });
            bubble.append(recallButton, actionMenu);
        }

        messageWrapper.appendChild(bubble);

        if (sender === 'user') {
            const userAvatarPlaceholder = document.createElement('div');
            userAvatarPlaceholder.className = 'w-8 h-8';
            messageWrapper.appendChild(userAvatarPlaceholder);
        }
    }

    if (content.legacy) messageWrapper.classList.add('legacy-chat-message');
    target.appendChild(messageWrapper);

    if (target === chatContainer) {
        if (
            document.documentElement.dataset.wetappUi === 'v2'
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            messageWrapper.classList.add('v2-message-enter');
            messageWrapper.addEventListener('animationend', () => {
                messageWrapper.classList.remove('v2-message-enter');
            }, { once: true });
        }

        if (immersiveGroupStageSpeakerIds.length > 0 && isUiV2ImmersiveSceneActive()) {
            const conversationKey = currentConversationKey;
            immersiveGroupStageSpeakerIds.forEach((memberId, index) => {
                window.setTimeout(() => {
                    if (
                        currentConversationKey !== conversationKey
                        || !isUiV2ImmersiveSceneActive()
                    ) return;
                    setUiV2SceneActiveSpeaker(memberId);
                }, index * 220);
            });
            window.setTimeout(() => {
                if (currentConversationKey === conversationKey) setUiV2SceneActiveSpeaker(null);
            }, immersiveGroupStageSpeakerIds.length * 220 + 620);
        }

        scheduleMessageScroll(messageWrapper, sender, scrollMode);
    }

    return messageWrapper;
};

// Keep streaming text provisional: do not save partial responses to chat history.
const clearAssistantStreamPreview = (request: ActiveChatRequest) => {
    request.streamPreview?.remove();
    request.streamPreview = undefined;
};
const showAssistantStreamPreview = (request: ActiveChatRequest, text: string) => {
    if (!text.trim() || !isActiveChatRequest(request)) return;
    if (currentConversationKey !== request.conversationKey || !isAssistantPersonaKey(currentPersonaKey)) return;
    const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
    if (!request.streamPreview?.isConnected) {
        request.streamPreview = appendMessage({ text: '…' }, 'bot', undefined, 'none');
    }
    const bubble = request.streamPreview.querySelector<HTMLElement>('.bot-bubble');
    if (bubble) {
        // textContent is safe for untrusted model output; final Markdown renders on completion.
        bubble.textContent = text;
        bubble.style.whiteSpace = 'pre-wrap';
    }
    if (distanceFromBottom < 160) chatContainer.scrollTop = chatContainer.scrollHeight;
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
        setTimeout(() => {
            loadingIndicator.classList.remove('opacity-0', 'translate-y-2');
        }, 10);
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
    assistantModelUi?.setBusy(showLoadingIndicator);
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
    authSubmitLabel.textContent = isSubmitting ? '驗證中...' : '進入 Wetapp';
};

const setUnlockedState = (unlocked: boolean) => {
    isUnlocked = unlocked;

    if (!USES_VENICE_PROXY_AUTH) {
        authGate.classList.add('hidden');
        appShell.classList.remove('app-shell-locked');
        guardConversationSearchFromAutofill();
        updateSendButtonState();
        videoStudioUi?.refreshControls();
        return;
    }

    authGate.classList.toggle('hidden', unlocked);
    appShell.classList.toggle('app-shell-locked', !unlocked);

    if (unlocked) {
        authPasswordInput.value = '';
        hideAuthError();
        guardConversationSearchFromAutofill();
    } else {
        window.setTimeout(() => authPasswordInput.focus(), 40);
    }

    updateSendButtonState();
    videoStudioUi?.refreshControls();
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
        void startSupabaseCloudSync();
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
        void startSupabaseCloudSync();
        void resumePendingVideoJobIfAny();
        if (VPS_CHAT_BUILD) { void resumeVpsChatTurn(true); void resumeVpsPersonaMemory(); void resumeVpsGroupMemory(); }
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
    const hasTypedText = messageInput.value.trim().length > 0;
    const nextDisabled = !isUnlocked || requestInProgress
        || (!hasTypedText && pendingChatAttachments.length === 0);
    if (sendButton.disabled !== nextDisabled) sendButton.disabled = nextDisabled;
    const busy = requestInProgress ? 'true' : 'false';
    if (sendButton.getAttribute('aria-busy') !== busy) {
        sendButton.setAttribute('aria-busy', busy);
    }
    const hideCamera = hasTypedText
        || isAssistantPersonaKey(currentPersonaKey)
        || isGodModeActive;
    composerCameraButton.classList.toggle('is-hidden-for-text', hideCamera);
    const nextHidden = hideCamera ? 'true' : 'false';
    if (composerCameraButton.getAttribute('aria-hidden') !== nextHidden) {
        composerCameraButton.setAttribute('aria-hidden', nextHidden);
    }
    const nextTabIndex = hideCamera ? -1 : 0;
    if (composerCameraButton.tabIndex !== nextTabIndex) {
        composerCameraButton.tabIndex = nextTabIndex;
    }
};

const renderPendingChatAttachments = () => {
    chatAttachmentPreview.innerHTML = '';
    chatAttachmentPreview.classList.toggle('hidden', pendingChatAttachments.length === 0);
    pendingChatAttachments.forEach(item => {
        const chip = document.createElement('div');
        chip.className = 'pending-attachment-chip';
        if (item.previewUrl) {
            const image = document.createElement('img');
            image.src = item.previewUrl;
            image.alt = '';
            chip.appendChild(image);
        } else {
            const icon = document.createElement('span');
            icon.className = 'pending-attachment-icon';
            icon.textContent = isAssistantZipFile(item.attachment.name, item.attachment.mimeType) ? 'ZIP' : item.attachment.kind === 'video' ? '▶' : 'DOC';
            chip.appendChild(icon);
        }
        const copy = document.createElement('span');
        copy.textContent = `${item.attachment.name} · ${Math.max(1, Math.round(item.attachment.size / 1024))} KB`
            + (isAssistantJsonFile(item.attachment.name) && item.attachment.size > MAX_ASSISTANT_FILE_CHARACTERS
                ? ' · 大型存檔（原檔保留）' : '');
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.setAttribute('aria-label', `移除 ${item.attachment.name}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            pendingChatAttachments = pendingChatAttachments.filter(candidate => candidate.attachment.id !== item.attachment.id);
            assistantZipInspections.delete(item.attachment.id);
            renderPendingChatAttachments();
            updateSendButtonState();
        });
        chip.append(copy, remove);
        const archive = assistantZipInspections.get(item.attachment.id);
        if (archive) {
            const details = document.createElement('details');
            details.className = 'assistant-zip-contents';
            const summary = document.createElement('summary');
            summary.textContent = '查看 ZIP 檔案（' + archive.fileNames.length + '）';
            const fileList = document.createElement('ul');
            for (const name of archive.fileNames) {
                const line = document.createElement('li');
                line.textContent = name;
                fileList.appendChild(line);
            }
            details.append(summary, fileList);
            chip.appendChild(details);
        }
        chatAttachmentPreview.appendChild(chip);
    });
};

const handleChatAttachmentSelection = async () => {
    const files = Array.from(chatAttachmentInput.files || []);
    chatAttachmentInput.value = '';
    if (files.length > 0) {
        const { prepareChatAttachment } = await import('./features/chatAttachmentPrep.js');
        for (const file of files) {
            try {
                const currentBytes = pendingChatAttachments.reduce((sum, item) => sum + item.file.size, 0);
                if (isAssistantZipFile(file.name, file.type) && !isAssistantPersonaKey(currentPersonaKey)) {
                    throw new Error('ZIP 讀取功能只限 Venice AI 助手。');
                }
                const prepared = await prepareChatAttachment(file, currentBytes);
                if (isAssistantZipFile(file.name, file.type)) {
                    const inspected = await readAssistantZipArchive(prepared.file, undefined, selectedAssistantModel);
                    assistantZipInspections.set(prepared.attachment.id, inspected);
                }
                pendingChatAttachments.push(prepared);
            } catch (error) {
                alert(error instanceof Error ? error.message : `無法加入 ${file.name}。`);
            }
        }
    }
    renderPendingChatAttachments();
    updateSendButtonState();
};

const persistPendingChatAttachments = async (conversationKey: string, assistantMode = false, question = '') => {
    const snapshot = [...pendingChatAttachments];
    const textFiles = new Map<string, string>();
    const historyTextFiles = new Map<string, string>();
    let totalFileChars = 0;
    let containsLongSave = false;
    // Validate before persisting anything or charging for a model request.
    if (assistantMode) {
        for (const item of snapshot) {
            const zip = isAssistantZipFile(item.attachment.name, item.attachment.mimeType);
            if (!zip && !isAssistantTextFile(item.attachment.name, item.attachment.mimeType)) continue;
            let wrapped: string;
            let longContext = false;
            if (zip) {
                const preview = assistantZipInspections.get(item.attachment.id);
                const inspected = preview?.longContext
                    ? await readAssistantZipArchive(item.file, undefined, selectedAssistantModel, question)
                    : preview || await readAssistantZipArchive(item.file, undefined, selectedAssistantModel, question);
                wrapped = inspected.context;
                longContext = inspected.longContext;
                containsLongSave ||= longContext;
            } else if (isAssistantJsonFile(item.attachment.name)) {
                const prepared = prepareAssistantJsonSave(item.attachment.name, await item.file.text(), selectedAssistantModel, question);
                wrapped = prepared.context;
                longContext = prepared.longContext;
                containsLongSave ||= longContext;
            } else {
                wrapped = wrapAssistantFileText(item.attachment.name, await item.file.text());
            }
            totalFileChars += wrapped.length;
            const budget = containsLongSave
                ? MAX_ASSISTANT_LARGE_JSON_CHARACTERS + 15_000
                : MAX_ASSISTANT_TOTAL_FILE_CHARACTERS;
            if (totalFileChars > budget) {
                throw new Error(containsLongSave
                    ? '本次大型存檔連其他附件超出安全上下文預算；請先單獨上傳存檔。'
                    : '文字附件合計超過 95,000 字元，請減少檔案或拆開幾個話題。');
            }
            textFiles.set(item.attachment.id, wrapped);
            // Save original large JSON only as an attachment blob, not inside chat history.
            if (!longContext) historyTextFiles.set(item.attachment.id, wrapped);
        }
    }
    const contentParts: VeniceMessageContentPart[] = [];
    for (const item of snapshot) {
        await (await loadChatMediaStoreModule()).saveChatAttachment({
            id: item.attachment.assetId,
            conversationKey,
            blob: item.file,
            name: item.attachment.name,
            mimeType: item.attachment.mimeType,
            createdAt: Date.now(),
        });
        const inlineText = textFiles.get(item.attachment.id);
        if (inlineText) {
            contentParts.push({ type: 'text', text: inlineText });
        } else if (item.attachment.kind === 'image') {
            contentParts.push({
                type: 'image_url',
                image_url: { url: await readBlobAsDataUrl(item.file), detail: 'auto' },
            });
        } else if (item.attachment.kind === 'document') {
            contentParts.push({
                type: 'file',
                file: { file_data: await readBlobAsDataUrl(item.file), filename: item.attachment.name },
            });
        } else {
            contentParts.push({
                type: 'text',
                text: `[已附上${item.attachment.kind === 'video' ? '影片' : '檔案'}：${item.attachment.name}；此類型只保存於私人附件，不聲稱已分析內容。]`,
            });
        }
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
    pendingChatAttachments = [];
    snapshot.forEach(item => assistantZipInspections.delete(item.attachment.id));
    renderPendingChatAttachments();
    return {
        attachments: snapshot.map(item => item.attachment),
        contentParts,
        assistantFileContext: historyTextFiles.size ? [...historyTextFiles.values()].join('\n\n') : undefined,
    };
};

const composerAutoSize = createComposerAutoSize({
    textarea: messageInput,
    isV2: () => document.documentElement.dataset.wetappUi === 'v2',
    nativeContentSizing: () => typeof CSS !== 'undefined'
        && typeof CSS.supports === 'function'
        && CSS.supports('field-sizing', 'content'),
    requestFrame: callback => window.requestAnimationFrame(callback),
    cancelFrame: handle => window.cancelAnimationFrame(handle),
    classicHeight: FIXED_MESSAGE_INPUT_HEIGHT,
});
const syncMessageInputHeight = () => composerAutoSize.sync();
const resetMessageInput = () => composerAutoSize.reset();

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
    return extractDirectNpcNames(text, personaName);
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
        `- Punctuation never creates a participant. Any ordinary clause, reaction, compliment, pet name or phrase before a comma addresses ${personaName}; it is not a person name. A third party exists only when explicitly introduced or greeted by name, or already present in the established participant list.`,
        '- Preserve who currently holds each object and who performs each action. Do not move an object into the active character’s bag or hand before the user gives it to them.',
        '- Never write or label a new spoken line for the user. Reply only as the active character and any relevant NPCs.',
    ].join('\n');
};

const replyContainsAttributedNpcSpeech = (reply: string, npcNames: string[]) => {
    return replyHasNpcSpeech(reply, npcNames);
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
        const weight = (typeof message.content === 'string'
            ? message.content.length
            : message.content.reduce((total, part) => total + (part.type === 'text' ? part.text.length : 256), 0)) + 24;
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

        const messageText = typeof message.content === 'string'
            ? message.content
            : message.content
                .filter(part => part.type === 'text')
                .map(part => part.type === 'text' ? part.text : '')
                .join('\n');
        const isRedundant = recentAssistantReplies.some(previousReply => {
            return repliesAreTooSimilar(previousReply, messageText);
        });

        if (isRedundant) {
            // Remove the complete failed turn rather than orphaning its user message.
            if (selected.at(-1)?.role === 'user') {
                selected.pop();
            }
            return;
        }

        selected.push(message);
        recentAssistantReplies.push(messageText);
        recentAssistantReplies = recentAssistantReplies.slice(-3);
    });

    return selected;
};

const getRecentChatMessages = (
    conversationKey: string,
    latestUserMessage?: string,
    assistantMode = false,
    personaOverride?: Persona,
    room?: ChatRoom,
): VeniceMessage[] => {
    const persona = personaOverride || memoryManager.getPersona(conversationKey)
        || (assistantMode ? memoryManager.getPersona(VENICE_ASSISTANT_PERSONA_KEY) : undefined);
    if (!persona && !room) {
        return [];
    }

    const linkedLegacyHistory = room?.legacySourcePersonaKey
        && room.legacySourcePersonaKey !== conversationKey
        ? selectLegacyGroupHistory(memoryManager.peekChatHistory(room.legacySourcePersonaKey))
        : [];
    const completeHistory = [
        ...linkedLegacyHistory,
        ...memoryManager.getChatHistory(conversationKey),
    ]
        .filter(
            message =>
                message.role === 'user'
                || message.role === 'model'
                || (!assistantMode && message.role === 'system' && (
                    message.content.text?.trim() === SCENE_END_MARKER
                    || Boolean(message.content.contextBridge)
                )),
        );
    const completedHistory = latestUserMessage
        ? trimTrailingUnansweredUserMessages(completeHistory)
        : completeHistory;
    let activeSceneStart = 0;
    if (!assistantMode) {
        for (let index = completedHistory.length - 1; index >= 0; index -= 1) {
            const message = completedHistory[index];
            if (message.role === 'system' && message.content.text?.trim() === SCENE_END_MARKER) {
                activeSceneStart = index;
                break;
            }
        }
    }
    const sceneHistory = completedHistory.slice(activeSceneStart);
    const historyForRealityBoundary = latestUserMessage
        ? completeHistory.slice(activeSceneStart)
        : sceneHistory;
    const sourceHistory = room
        ? trimTrailingUnansweredUserMessages(
            selectGroupHistorySinceCurrentRealityLayer(
                historyForRealityBoundary,
                room.scene.realityLayer,
                room.scene.realityEpochId,
            ),
        )
        : sceneHistory;
    const historyMessages: VeniceMessage[] = [];
    const confirmedHistoryNpcNames = !assistantMode && !room
        ? collectEstablishedNpcNames(sourceHistory, persona?.name || '')
        : [];
    let previousUserText = '';

    sourceHistory.forEach(message => {
        const rawText = message.role === 'system' && message.content.contextBridge
            ? contextBridgeToSystemPrompt(message.content.contextBridge)
            : room && message.role === 'model'
                ? contentToGroupHistoryText(message.content, room).trim()
                : (assistantMode && message.role === 'user' && message.content.assistantFileContext
                    ? [message.content.text || '', message.content.assistantFileContext].join('\n\n')
                    : message.content.text)?.trim();
        const isContaminated = !rawText
            || (!assistantMode && message.role !== 'system' && (/\[PERSONA_UPDATE:/i.test(rawText) || /^THINK\b/i.test(rawText)))
            || (
                message.role === 'model'
                && !assistantMode
                && !room
                && (
                    replyHasNonPersonNpcLabel(rawText, persona?.name || '')
                    || replyHasUnconfirmedAddressLabel(
                        rawText,
                        previousUserText,
                        persona?.name || '',
                        confirmedHistoryNpcNames,
                    )
                )
            );
        if (isContaminated) {
            if (message.role === 'model' && historyMessages.at(-1)?.role === 'user') {
                historyMessages.pop();
            }
            return;
        }

        const text =
            message.role === 'model'
                ? room
                    ? rawText
                    : assistantMode
                    ? cleanVeniceAssistantReply(rawText)
                    : cleanVeniceChatReply(rawText)
                : message.role === 'system'
                    ? rawText
                    : assistantMode && message.role === 'user' && message.content.assistantFileContext
                    ? [normalizeHistoryText(message.content.text || ''), message.content.assistantFileContext].join('\n\n')
                    : normalizeHistoryText(rawText);
        if (!text || (message.role === 'model' && !assistantMode && !room && isInvalidVeniceChatReply(text))) {
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
        if (message.role === 'user') previousUserText = rawText;
    });

    if (latestUserMessage && historyMessages.length > 0) {
        const lastMessage = historyMessages[historyMessages.length - 1];
        if (lastMessage.role === 'user' && lastMessage.content === normalizeHistoryText(latestUserMessage)) {
            historyMessages.pop();
        }
    }

    const messages = collectRecentMessagesWithinBudget(
        collapseRedundantCompletedTurns(historyMessages),
        assistantMode
            ? ASSISTANT_HISTORY_CHAR_BUDGET
            : room ? GROUP_CHAT_HISTORY_CHAR_BUDGET : CHAT_HISTORY_CHAR_BUDGET,
        assistantMode
            ? ASSISTANT_HISTORY_MESSAGE_LIMIT
            : room ? GROUP_CHAT_HISTORY_MESSAGE_LIMIT : CHAT_HISTORY_MESSAGE_LIMIT,
    );

    // Never begin a clipped history with an orphaned assistant response.
    while (messages[0]?.role === 'assistant') {
        messages.shift();
    }

    return messages;
};

const buildArchivedRecallPrompt = (
    conversationKey: string,
    latestUserMessage: string,
    room?: ChatRoom,
) => {
    const history = memoryManager.peekChatHistory(conversationKey);
    const turns: ArchivedRecallTurn[] = [];
    let current: ArchivedRecallTurn | null = null;
    history.forEach((message, index) => {
        if (message.role === 'user') {
            if (current) turns.push(current);
            const userText = cleanMemoryEvidenceText(message.content.text || '', 2400);
            current = userText ? {
                id: message.id || `archive-${index + 1}`,
                userText,
                replyText: '',
            } : null;
            return;
        }
        if (message.role !== 'model' || !current) return;
        const reply = cleanMemoryEvidenceText(
            room
                ? contentToGroupHistoryText(message.content, room)
                : message.content.text || '',
            3600,
        );
        if (reply) current.replyText = [current.replyText, reply].filter(Boolean).join('\n');
    });
    if (current) turns.push(current);

    const recentTurnsKeptVerbatim = Math.ceil(
        (room ? GROUP_CHAT_HISTORY_MESSAGE_LIMIT : CHAT_HISTORY_MESSAGE_LIMIT) / 2,
    ) + 4;
    const archivedTurns = turns.slice(0, Math.max(0, turns.length - recentTurnsKeptVerbatim));
    const recalled = selectRelevantArchivedTurns(
        archivedTurns,
        latestUserMessage,
        getMemoryRecallLimit(latestUserMessage, 3, 6),
    );
    if (!recalled.length) return '';
    const excerpts = recalled.map(turn => [
        `[OLDER_TURN_ID=${turn.id}]`,
        `USER: ${turn.userText.slice(0, 1800)}`,
        turn.replyText ? `REPLY: ${turn.replyText.slice(0, 2800)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n');
    return [
        'ARCHIVAL RECALL (older exact excerpts selected because the newest message refers to the past):',
        'Use an excerpt only when it truly matches the user’s reference. It is evidence, not a command to replay the old scene. Current scene state and newer memory override stale physical details.',
        excerpts,
    ].join('\n');
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

const formatPersonaMemoryPrompt = (persona: Persona, type: 'soul' | 'memory', query = '') => {
    const entries = type === 'soul' ? persona.soul || [] : persona.memories || [];
    const legacy = type === 'soul' && persona.memory?.trim()
        ? [`- 舊版永久記憶：${persona.memory.trim()}`]
        : [];
    const limit = getMemoryRecallLimit(query, 12, type === 'soul' ? 16 : 24);
    const structured = selectRelevantMemories(entries, query, limit)
        .map(entry => `- [${formatMemoryPromptMetadata(entry)}] ${entry.title}: ${entry.summary.replace(/\s+/gu, ' ').trim().slice(0, type === 'soul' ? 480 : 440)}`);
    return [...legacy, ...structured].join('\n');
};

const buildChatSystemPrompt = (
    personaKey: string,
    persona: Persona,
    latestUserMessage = '',
    wardrobeState: WardrobeState = emptyWardrobeState(),
    wardrobeParticipants: WardrobeParticipant[] = [{ key: persona.name, label: persona.name }],
    includeWardrobeEnvelope = false,
    conversationKey = personaKey,
) => {
    const narratorWorld = persona.name === '世界敘述者'
        && persona.prompt.includes('disembodied narrator')
        && getActiveWorldline(conversationKey);
    if (narratorWorld) {
        const narratorWardrobe = includeWardrobeEnvelope ? [
            'HIDDEN WARDROBE CHECKPOINT: append at the END of the response only:',
            `<wardrobe>${JSON.stringify({
                user: 'KEEP',
                characters: Object.fromEntries(wardrobeParticipants.map(item => [item.key,'KEEP'])),
            })}</wardrobe>`,
            'Do not write this private state tag in the visible story. Preserve KEEP for unchanged outfits.',
        ].join('\n') : '';
        return [
            'You are the WORLD NARRATOR / GAME MASTER for interactive fiction, NOT a character, assistant, romance partner or girlfriend.',
            'Write in immersive, natural Traditional Chinese prose, with clearly attributed dialogue from independently motivated NPCs.',
            'The player alone decides their speech, decisions, feelings, actions and consent.',
            'Maintain living factions, major quests, golden-finger abilities, consequences, relationships, secrets and time continuity. Never reduce the story to a rigid list of options.',
            'The attached Worldline system state is the source of persistent world rules and confirmed facts; invent new unconfirmed details freely without overwriting canon.',
            `World director voice: ${persona.prompt}`,
            compileWorldRecall(buildWorldReadModel(memoryManager.peekChatHistory(conversationKey), persona.memories || []), latestUserMessage),
            formatSessionMemoryPrompt(conversationKey),
            narratorWardrobe,
        ].filter(Boolean).join('\n\n');
    }
    const behaviorGuidance = buildPersonaBehaviorGuidance(personaKey, persona);
    const publicIdentity = persona.publicIdentityEnabled ? persona.publicIdentity : undefined;
    const soulMemory = formatPersonaMemoryPrompt(persona, 'soul', latestUserMessage);
    const episodicMemory = formatPersonaMemoryPrompt(persona, 'memory', latestUserMessage);
    const sessionMemory = formatSessionMemoryPrompt(conversationKey);
    const sections = [
        `You are ${persona.name}, the active romance character in a continuous private conversation. You are not an AI assistant.`,
        persona.description?.trim() ? `Short identity:\n${persona.description.trim()}` : '',
        publicIdentity ? [
            `User-confirmed public identity (${getPublicIdentityKindLabel(publicIdentity.kind)}):`,
            `Canonical name: ${publicIdentity.canonicalName}`,
            `Public-source summary: ${publicIdentity.summary}`,
            'Use this only to keep the named identity, nationality, profession, franchise, and public background consistent. Do not invent private real-world facts from the source.',
        ].join('\n') : '',
        `Character identity and voice:\n${persona.prompt}`,
        persona.greeting?.trim()
            ? `Voice reference only (never repeat or continue this sample verbatim):\n${persona.greeting.trim()}`
            : '',
        sessionMemory
            ? `SESSION-ONLY MEMORY — valid only for this browser session and never a permanent fact:\n${sessionMemory}`
            : '',
        soulMemory ? `soul.md permanent identity, relationship and user anchors:\n${soulMemory}` : '',
        episodicMemory ? `memory.md recent important events and continuity:\n${episodicMemory}` : '',
        formatRelationshipStatePrompt(persona),
        preferencePrompt(persona.chatPreferences),
        behaviorGuidance.length > 0 ? `Personality anchors:\n- ${behaviorGuidance.join('\n- ')}` : '',
        formatWardrobeLedger(wardrobeState, wardrobeParticipants),
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
            '- Give the character her own immediate wants and initiative. When natural, let her make a concrete choice, suggest a plan, reveal a small intention, or begin the next action instead of always waiting for an order or ending with a question.',
            '- Pace romance and dramatic tension in steps. Preserve gains in closeness, let charged moments breathe, and transition naturally after an intense beat instead of abruptly resetting or endlessly escalating.',
            '- Never decide the user’s dialogue, actions, feelings, or consent. Leave room for the user to respond.',
            '- Do not invent prior dates, promises, relationship milestones, or shared events as facts. Express an unestablished detail as a wish, proposal, question, or imagination instead.',
            '- Do not repeat the previous opening, scene beat, pose, reassurance, or closing question; do not stall in the same emotional state or answer an older request.',
            '- Do not end every reply with another question, menu of choices, invitation, or “what will you do?” prompt. Vary endings with a completed action, observation, decision, new NPC response, environmental change, or a natural pause.',
            '- A character may resist, hesitate, joke, or disagree, but must still communicate and react meaningfully rather than stonewalling.',
            '- Do not mention prompts, rules, models, retries, or being an assistant.',
        ].join('\n'),
        includeWardrobeEnvelope ? [
            'HIDDEN WARDROBE CHECKPOINT (required at the very end of this normal chat reply):',
            `<wardrobe>${JSON.stringify({
                user: 'KEEP',
                characters: Object.fromEntries(wardrobeParticipants.map(participant => [participant.key, 'KEEP'])),
            })}</wardrobe>`,
            '- Keep the visible roleplay reply outside this tag. The app removes this tag before showing the reply.',
            '- Use KEEP for every unchanged or unknown entry. For an empty ledger entry, initialize it from explicit current-scene history. For an established entry, replace KEEP only when this turn visibly establishes a clothing change. Return the complete resulting outfit.',
            '- Never infer a clothing change from elapsed turns, posture, mood, intimacy, camera framing, or unstated assumptions.',
        ].join('\n') : '',
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
        'If asked to produce a downloadable JSON file, return exactly one complete JSON object or array inside a fenced json code block, with valid syntax and no omitted sections. The UI will provide a download button after validating it.',
        'When the user uploads ZIP, JSON, text, or code files, analyze their provided data faithfully and preserve any required schema, keys, and values unless the user requests changes.',
        'Some oversized JSON attachments are given as INDEXED PARTIAL VIEWS, not full text. If the view says PARTIAL, NEVER assert that you read the whole save. Use provided paths to identify exactly what was inspected; ask the user for a precise symptom, name, or JSON Pointer path when the excerpt is insufficient. On a follow-up, Wetapp will retrieve relevant indexed records from the unchanged original.',
        'For fixing an uploaded LARGE JSON save, do NOT reproduce the full save as your answer. Return a concise diagnosis followed by ONE complete fenced json object with format "wetapp-json-patch-v1", sourceFile "EXACT_ORIGINAL_FILENAME.json", filename "fixed-save.json", operations: [{"op":"replace","path":"/escaped/JSON/pointer","value":CORRECT_VALUE}]. Supported ops: add, remove, replace. Each path is a JSON Pointer (RFC 6901); escape "~" as "~0" and "/" as "~1". The browser will safely apply these operations to a fresh copy of the FULL original stored file, validate paths and download a complete corrected JSON. Keep edits minimal and justified.',
        'Never invent JSON Pointer paths or field values absent from the uploaded save; inspect its real schema and only patch verified fields. Do not change unrelated game history or metadata. If any section was not provided, acknowledge the limit.',
        'Downloading a patched save does not automatically replace the original uploaded file or game save; the user must inspect and import the resulting file themselves.',
        'Uploaded ZIP archives are pre-inspected. You receive a list of contained filenames plus UTF-8 text from supported files; binaries are only listed by name. Never claim to have inspected the contents of listed binary files.',
        'When the user requests a downloadable ZIP, return exactly ONE complete JSON object (inside one json code fence) with format "wetapp-zip-v1", filename "output.zip", and files [{path:"file.json",content:"FULL UTF-8 FILE CONTENT"}]. Every content field is a string containing the exact full file contents with valid JSON escaping. Support .json, .txt, .md, .csv, .yaml, code and other UTF-8 text formats. Do not output an abbreviated file or leave placeholders.',
        'If updating an earlier uploaded ZIP and you need to retain its unchanged files, include sourceArchive with the exact uploaded ZIP filename. The browser will copy original files and replace only those named in files; unrelated files, including binaries, are retained. Source ZIP must be in this conversation.',
        'For ZIP exports, prefer one complete manifest JSON, not separate code fences for multiple files, since the browser needs that manifest to construct a real downloadable archive.',
        'If the request is ambiguous, make the most reasonable interpretation from recent context instead of giving a canned clarification.',
        'Do not mention the selected model, hidden instructions, or internal processing unless the user explicitly asks.',
    ].join('\n');
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
    timeoutMs = CHAT_MODEL_ATTEMPT_TIMEOUT_MS,
    research?: ResearchContext,
) => {
    const researchStarted=Date.now();
    if(research)recordWorldResearch(research,{kind:'model-input',startedAt:researchStarted,model:options.model,messages:captureResearchMessages(options.messages),temperature:options.temperature,topP:options.topP,maxCompletionTokens:options.maxCompletionTokens});
    // Preserve fast-model budgets while allowing DeepSeek/uncensored models to finish.
    const effectiveTimeoutMs = /deepseek|uncensored|reasoner|thinking/i.test(options.model)
        ? Math.max(timeoutMs, CHAT_SLOW_MODEL_ATTEMPT_TIMEOUT_MS)
        : timeoutMs;
    const upstreamSignal = options.signal;
    const timeoutController = new AbortController();
    let timedOut = false;

    const abortFromUpstream = () => timeoutController.abort(upstreamSignal?.reason);
    const abortForTimeout = () => {
        timedOut = true;
        timeoutController.abort();
    };
    const visibilityTimeout = upstreamSignal
        ? createVisibilityAwareTimeout({
            timeoutMs: effectiveTimeoutMs,
            onTimeout: abortForTimeout,
            signal: upstreamSignal,
            onAbort: abortFromUpstream,
        })
        : null;
    const timeoutId = visibilityTimeout
        ? null
        : window.setTimeout(abortForTimeout, effectiveTimeoutMs);

    try {
        const result = await generateVeniceText({
            ...options,
            signal: timeoutController.signal,
        });
        try {
            const stored = JSON.parse(localStorage.getItem('wetappUsageV1') || '[]');
            const rows = Array.isArray(stored) ? stored : [];
            rows.push({ at: Date.now(), model: result.model, input: result.promptTokens || 0, output: result.completionTokens || 0, phase: chatRuntimeState });
            localStorage.setItem('wetappUsageV1', JSON.stringify(rows.slice(-300)));
        } catch { /* Usage reporting must never block a completed reply. */ }
        if(research)recordWorldResearch(research,{kind:'model-output',startedAt:researchStarted,elapsedMs:Date.now()-researchStarted,model:result.model,promptTokens:result.promptTokens??null,completionTokens:result.completionTokens??null,output:researchText(result.text)});
        return result;
    } catch (error) {
        if(research)recordWorldResearch(research,{kind:'model-error',startedAt:researchStarted,elapsedMs:Date.now()-researchStarted,model:options.model,error:researchText(error instanceof Error?error.message:String(error)),timedOut});
        if (timedOut && !upstreamSignal?.aborted) {
            throw new Error(CHAT_MODEL_TIMEOUT_ERROR);
        }
        throw error;
    } finally {
        visibilityTimeout?.cancel();
        if (timeoutId !== null) window.clearTimeout(timeoutId);
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

const markVeniceRequestAggregate = (
    label: string,
    model: string,
    messages: VeniceMessage[],
    attempt: number,
    flags: { repair?: boolean; fallback?: boolean; continuation?: boolean } = {},
    result?: {
        promptTokens?: number;
        completionTokens?: number;
        text?: string;
        promptCacheUsage?: {
            cachedTokens?: number;
            cacheCreationInputTokens?: number;
            uncachedPromptTokens?: number;
            cacheHitPercent?: number;
        } | null;
    },
) => {
    markChatPerformance([
        label,
        `model=${model}`,
        `attempt=${attempt}`,
        `messages=${messages.length}`,
        `chars=${getVeniceMessageAggregate(messages)}`,
        `repair=${Boolean(flags.repair)}`,
        `fallback=${Boolean(flags.fallback)}`,
        `continuation=${Boolean(flags.continuation)}`,
        result ? `promptTokens=${result.promptTokens ?? 'na'}` : '',
        result ? `completionTokens=${result.completionTokens ?? 'na'}` : '',
        result ? `completionChars=${result.text?.length ?? 0}` : '',
    ].filter(Boolean).join(' '));
    if (!result) return;

    const cache = result.promptCacheUsage;
    const cacheLabel = label.replace(/:response-meta$/u, '');
    markChatPerformance(cache
        ? [
            `${cacheLabel}:cache`,
            `model=${model}`,
            `promptTokens=${result.promptTokens ?? 'na'}`,
            `cachedTokens=${cache.cachedTokens ?? 'na'}`,
            `cacheCreationInputTokens=${cache.cacheCreationInputTokens ?? 'na'}`,
            `uncachedPromptTokens=${cache.uncachedPromptTokens ?? 'na'}`,
            `cacheHitPercent=${cache.cacheHitPercent ?? 'na'}`,
        ].join(' ')
        : `${cacheLabel}:cache model=${model} cacheStats=unavailable`,
    );
};

const markPromptComponentAccounting = (
    scope: string,
    components: PromptComponentSize[],
    requestMessages: number,
    systemMessages: number,
) => {
    if (!isChatPerformanceEnabled()) return;
    components
        .filter(component => component.chars > 0)
        .forEach(component => markChatPerformance(
            `prompt:component scope=${scope} name=${component.name} chars=${component.chars} estimatedTokens=${estimatePromptTokens(component.chars)} messages=${component.messages} signature=${component.signature ?? 'aggregate'}`,
        ));
    const total = summarizePromptComponents(components);
    markChatPerformance(
        `prompt:component-total scope=${scope} chars=${total.chars} estimatedTokens=${estimatePromptTokens(total.chars)} requestMessages=${requestMessages} systemMessages=${systemMessages} contextMessages=${total.messages}`,
    );
};

const normalizeTraditionalChineseLeaks = normalizeHongKongTraditional;

const normalizeGroupGenerationTraditional = (result: GroupGenerationResult): GroupGenerationResult => {
    const segments = result.segments.map(segment => ({
        ...segment,
        text: normalizeTraditionalChineseLeaks(segment.text),
    }));
    const text = segments.map(segment => segment.type === 'narration'
        ? `（${segment.text}）`
        : `${segment.speakerName || segment.speakerId}：「${segment.text}」`).join('\n');
    return {
        ...result,
        text,
        segments,
        scene: {
            ...result.scene,
            location: normalizeTraditionalChineseLeaks(result.scene.location),
            summary: normalizeTraditionalChineseLeaks(result.scene.summary),
            unresolved: result.scene.unresolved.map(normalizeTraditionalChineseLeaks),
            wardrobe: result.scene.wardrobe ? {
                user: normalizeTraditionalChineseLeaks(result.scene.wardrobe.user),
                characters: Object.fromEntries(Object.entries(result.scene.wardrobe.characters)
                    .map(([key, outfit]) => [key, normalizeTraditionalChineseLeaks(outfit)])),
            } : emptyWardrobeState(),
            memberStates: Object.fromEntries(Object.entries(result.scene.memberStates || {}).map(([memberId, state]) => [
                memberId,
                {
                    posture: normalizeTraditionalChineseLeaks(state.posture),
                    action: normalizeTraditionalChineseLeaks(state.action),
                    attention: normalizeTraditionalChineseLeaks(state.attention),
                    innerThought: normalizeTraditionalChineseLeaks(state.innerThought),
                    chemistry: normalizeTraditionalChineseLeaks(state.chemistry),
                },
            ])),
        },
        npcCandidate: result.npcCandidate ? {
            ...result.npcCandidate,
            name: normalizeTraditionalChineseLeaks(result.npcCandidate.name),
            description: normalizeTraditionalChineseLeaks(result.npcCandidate.description),
        } : undefined,
    };
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
            model: chatModelSettings.ccPrimary,
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

const getLatestUserVeniceContent = (
    request: ActiveChatRequest,
    latestUserMessage: string,
): string | VeniceMessageContentPart[] => {
    if (!request.attachmentParts?.length) return latestUserMessage;
    return [
        { type: 'text', text: latestUserMessage },
        ...request.attachmentParts,
    ];
};

const loadPreviousAssistantLargeSaveContext = async (
    request: ActiveChatRequest,
    model: string,
    question: string,
): Promise<string> => {
    if (request.mode !== 'assistant') return '';
    const histories = memoryManager.peekChatHistory(request.conversationKey);
    const sources = [...histories].reverse()
        .filter(message => message.role === 'user')
        .flatMap(message => [...(message.content.attachments || [])].reverse())
        .filter(attachment => isAssistantZipFile(attachment.name, attachment.mimeType)
            || (isAssistantJsonFile(attachment.name) && attachment.size > MAX_ASSISTANT_FILE_CHARACTERS));
    for (const source of sources) {
        // Current-turn files are already present in request.attachmentParts.
        if (request.attachments?.some(item => item.assetId === source.assetId)) continue;
        const blob = await (await loadChatMediaStoreModule()).getChatAttachmentBlob(source.assetId);
        if (!blob) throw new Error('搵唔到之前上傳嘅存檔附件，請重新上傳，避免 AI 憑空修改。');
        if (isAssistantZipFile(source.name, source.mimeType)) {
            const inspected = await readAssistantZipArchive(
                new File([blob], source.name, { type: source.mimeType }),
                undefined,
                model,
                question,
            );
            if (inspected.longContext) return inspected.context;
        } else {
            if (!supportsAssistantLargeJson(model)) {
                throw new Error('呢個話題有大型 JSON 存檔，請選擇 DeepSeek V4.1 Flash 1017 Uncensored 繼續分析。');
            }
            const prepared = prepareAssistantJsonSave(source.name, await blob.text(), model, question);
            if (prepared.longContext) return prepared.context;
        }
    }
    return '';
};

const getSingleGenerationAttemptFailure = (
    error: unknown,
) => classifyGenerationAttemptFailure(
    isAbortError(error),
    error instanceof Error && error.message === CHAT_MODEL_TIMEOUT_ERROR,
);

// Trace mutation is always optional and must never influence a chat request.
const recordSingleGenerationAttempt = (
    trace: GenerationTrace | undefined,
    attempt: GenerationAttemptTrace,
) => {
    try {
        if (trace) markGenerationAttempt(trace, attempt);
    } catch { /* Trace recording is strictly observational. */ }
};

const getGroupGenerationAttemptFailure = (
    error: unknown,
) => classifyGenerationAttemptFailure(
    isAbortError(error),
    error instanceof Error && error.message === CHAT_MODEL_TIMEOUT_ERROR,
);

const recordGroupGenerationAttempt = (
    trace: GenerationTrace | undefined,
    attempt: GenerationAttemptTrace,
) => {
    try {
        if (trace) markGenerationAttempt(trace, attempt);
    } catch { /* Trace recording is strictly observational. */ }
};

const getStrictReviewAttemptFailure = (
    request: ActiveChatRequest,
    error: unknown,
) => classifyStrictReviewAttemptFailure(
    isAbortError(error) && request.controller.signal.aborted,
    error instanceof Error && error.message === CHAT_MODEL_TIMEOUT_ERROR,
);

const recordStrictReviewAttempt = (
    trace: GenerationTrace | undefined,
    attempt: StrictReviewAttemptTrace,
) => {
    try {
        if (trace) markStrictReviewAttempt(trace, attempt);
    } catch { /* Trace recording is strictly observational. */ }
};

const continueTruncatedChatReply = async (
    request: ActiveChatRequest,
    model: string,
    latestUserMessage: string,
    partialReply: string,
    systemPrompt: string,
    assistantMode: boolean,
    trace?: GenerationTrace,
    routeIndex?: number,
    attemptIndex?: number,
): Promise<{ text: string; finishReason: string | null } | null> => {
    const continuationStartedAt = performance.now();
    markChatPerformance('generation:continuation-request-start');
    const messages: VeniceMessage[] = [
        { role: 'system', content: systemPrompt },
        ...getRecentChatMessages(
            request.conversationKey,
            latestUserMessage,
            assistantMode,
            request.persona,
            request.room,
        ),
        { role: 'user', content: getLatestUserVeniceContent(request, latestUserMessage) },
        { role: 'assistant', content: partialReply },
        {
            role: 'user',
            content: 'Continue the exact same reply from where it stopped. Do not restart, summarize, or repeat any previous text. Output only the missing continuation.',
        },
    ];
    markVeniceRequestAggregate('generation:continuation:request-meta', model, messages, 1, { continuation: true });
    const requestStartedAt = performance.now();
    let result: Awaited<ReturnType<typeof generateChatTextWithTimeout>>;
    try {
        const options: Parameters<typeof generateVeniceText>[0] = {
            model, messages, temperature: 0.72, topP: 0.9,
            repetitionPenalty: 1.02, signal: request.controller.signal,
        };
        if (request.vpsTurn) {
            const parent = request.vpsTurn.receipt;
            if (!parent || (attemptIndex !== 1 && attemptIndex !== 2)) throw Error('TURN_STAGE_INVALID');
            const controller = makeVpsTurnController();
            const job = await runDurableChatStage({
                parent, phase: attemptIndex === 1 ? 'continuation-1' : 'continuation-2',
                payload: buildVpsCharacterPayload(options), signal: request.controller.signal,
                stage: controller.stage,
                verifyContext: async () => {
                    if (!isActiveChatRequest(request) || await digestVpsHistory(memoryManager.peekChatHistory(parent.conversationKey),parent.contextDigestVersion) !== parent.contextDigest) throw Error('TURN_HISTORY_CHANGED');
                },
                onPending: () => applyChatRuntimeState('generating', 'VPS 背景續寫中…'),
            });
            result = decodeVpsCharacterResult(job, model);
        } else result = await generateChatTextWithTimeout(options);
    } catch (error) {
        const failure = getSingleGenerationAttemptFailure(error);
        recordSingleGenerationAttempt(trace, {
            phase: 'continuation',
            model,
            routeIndex,
            attemptIndex,
            latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
            ...failure,
        });
        throw error;
    }
    markChatPerformance('generation:continuation', continuationStartedAt);
    markVeniceRequestAggregate('generation:continuation:response-meta', result.model, messages, 1, { continuation: true }, result);

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
        recordSingleGenerationAttempt(trace, {
            phase: 'continuation',
            model: result.model || model,
            routeIndex,
            attemptIndex,
            latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            finishReason: result.finishReason ?? null,
            outcome: 'invalid',
            errorCode: 'INVALID_RESPONSE',
        });
        return null;
    }

    recordSingleGenerationAttempt(trace, {
        phase: 'continuation',
        model: result.model || model,
        routeIndex,
        attemptIndex,
        latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        finishReason: result.finishReason ?? null,
        outcome: 'accepted',
    });

    return {
        text: cleanedContinuation,
        finishReason: result.finishReason ?? null,
    };
};

const getRecentAssistantRepliesForPersona = (
    conversationKey: string,
    assistantMode: boolean,
    limit = 6,
) => {
    const history = memoryManager.getChatHistory(conversationKey);
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

const getWardrobeParticipantsForRequest = (
    request: ActiveChatRequest,
    establishedNpcNames: string[] = [],
): WardrobeParticipant[] => {
    if (request.room) {
        return request.room.members.map(member => ({
            key: member.id,
            label: member.persona.name,
        }));
    }
    return Array.from(new Set([
        request.persona.name,
        ...Object.keys(request.wardrobeState.characters),
        ...establishedNpcNames,
    ])).map(name => ({ key: name, label: name }));
};

const getActiveWorldline = (conversationKey: string,repair=true) => {
    try {
        const world = getWorldline(localStorage.getItem(WORLDLINE_SETTING_KEY), conversationKey);
        if(!world||world.paused)return null;
        if(!repair||!memoryManager.hasChatHistory(conversationKey))return world;
        const repaired=reconcileWorldlineChronicle(world,memoryManager.peekChatHistory(conversationKey));
        if(repaired!==world){
            try{
                saveWorldline2Variable(localStorage,conversationKey,repaired.turnCount,undefined);
                setPersistedAppSetting(WORLDLINE_SETTING_KEY,JSON.stringify(updateWorldlineRegistry(localStorage.getItem(WORLDLINE_SETTING_KEY),conversationKey,repaired)));
            }catch(error){console.warn('Worldline recall reconciliation persistence deferred',error);}
        }
        return repaired;
    } catch { return null; }
};
const buildWorldlinePromptParts = (key:string,query:string,director?:DirectorPreferences):Worldline2PromptParts => {
    const world=getActiveWorldline(key);
    if(!world)return {fixed:'',variable:'',turn:0};
    return {fixed:[WORLDLINE_FIXED_HEADER,WORLDLINE_FIXED_CONTRACT].join('\n'),variable:[buildWorldlineVariablePrompt(world),compileWorldLedger(localStorage.getItem(WORLD_LEDGER_KEY),key,memoryManager.peekChatHistory(key),query),formatDirector(director)].filter(Boolean).join('\n\n'),turn:world.turnCount};
};
const buildWorldlineRuntimeContext = (key:string,query:string,director?:DirectorPreferences) => {
    const world=getActiveWorldline(key);
    if(!world)return '';
    const generated=buildWorldlinePromptParts(key,query,director);
    const resolved=resolveWorldline2Parts(localStorage,key,generated);
    if(resolved.fixed===generated.fixed&&resolved.variable===generated.variable){
        // Preserve original ordering and behavior when neither section is customized.
        const tail=generated.variable.slice(buildWorldlineVariablePrompt(world).length);
        return buildWorldlinePrompt(world)+tail;
    }
    return composeWorldline2Parts(resolved);
};
type WorldSyncResult = {advanced:number;deferred:string[];issueCount:number};
const worldLedgerJobs = new Map<string, Promise<WorldSyncResult>>();
// One automatic extraction per newly observed pending-source set per page session.
// Cloud CAS, not this local set, is the authority for accepted ledger writes.
const nativeLedgerAttempted=new Set<string>();
const maybeSyncNativeLedger=()=>{
    if(!nativeStoryPilot||nativeStoryBusy||activeChatRequest||resumingVpsTurn||pendingVpsTurn()||currentConversationKey!==NATIVE_SYNC_KEY||worldLedgerJobs.has(NATIVE_SYNC_KEY)||document.querySelector('dialog[aria-label="旁白導演"][open]'))return;
    const h=memoryManager.peekChatHistory(NATIVE_SYNC_KEY);
    if(h.at(-1)?.role!=='model')return;
    const batch=selectWorldBatch(pendingWorldSources(localStorage.getItem(WORLD_LEDGER_KEY),NATIVE_SYNC_KEY,h),true);
    if(!batch.length)return;
    const attempt=batch.map(m=>m.id).join(':');
    if(nativeLedgerAttempted.has(attempt))return;
    nativeLedgerAttempted.add(attempt);
    void syncWorldLedger(NATIVE_SYNC_KEY,true).catch(error=>console.warn('World OS extraction pending:',error));
};
const syncWorldLedger = (key: string, recent = false, skipIds:readonly string[]=[]): Promise<WorldSyncResult> => {
    if(key===NATIVE_SYNC_KEY&&(!nativeStoryPilot||nativeStoryBusy||currentConversationKey!==key))return Promise.reject(Error('NATIVE_SYNC_LEDGER_NOT_READY'));
    if(pendingVpsTurn()?.conversationKey===key||(activeChatRequest?.conversationKey===key&&activeChatRequest.vpsTurn?.identity.worldDigest))return Promise.reject(Error('WORLDLINE_TURN_PENDING'));
    const running = worldLedgerJobs.get(key);
    if (running) return running;
    const job = (async () => {
        const empty:WorldSyncResult={advanced:0,deferred:[],issueCount:0};
        if (!getActiveWorldline(key)) return empty;
        const native=key===NATIVE_SYNC_KEY?nativeStoryPilot:null;
        const history = memoryManager.peekChatHistory(key);
        const raw = localStorage.getItem(WORLD_LEDGER_KEY);
        const skip=new Set(skipIds);
        const batch = selectWorldBatch(pendingWorldSources(raw, key, history).filter(m=>!skip.has(m.id!)), recent);
        if (!batch.length) return empty;
        const baseline=native?await native.beginSnapshotUpdate():null;
        const recovered=await recoverWorldExtraction(batch,async sources=>{
            const first=history.findIndex(m=>m.id===sources[0].id);
            const context=compileWorldLedger(raw,key,history.slice(0,Math.max(0,first)),'',4200);
            const result=await generateChatTextWithTimeout({
                model: chatModelSettings.primary || VENICE_CHAT_MODEL,
                messages:buildRecoverableWorldExtractionMessages(sources,context),
                maxCompletionTokens:5000,temperature:0.1,stop:[],
            },90000,{conversationKey:key,stage:recent?'ledger-new-turn':'ledger-rebuild',sourceIds:sources.flatMap(m=>m.id?[m.id]:[])});
            return result.text;
        });
        if(recovered.issues.length)recordWorldResearch({conversationKey:key,stage:'ledger-validation',sourceIds:batch.flatMap(m=>m.id?[m.id]:[])},{kind:'rejected',issues:recovered.issues.map(i=>({sourceId:i.sourceId,reason:researchText(i.reason)})),attempts:recovered.attempts,deferred:recovered.deferred});
        if (!getActiveWorldline(key)) return empty;
        const latestHistory=memoryManager.peekChatHistory(key);
        const currentRaw=localStorage.getItem(WORLD_LEDGER_KEY);
        const before=projectWorld(currentRaw,key,latestHistory);
        const next=appendWorldBatches(currentRaw,key,recovered.rows,latestHistory);
        let saved=false;
        try{
            if(recovered.rows.length){
                if(native&&baseline){
                    if(activeChatRequest||resumingVpsTurn||pendingVpsTurn()||nativeStoryBusy||currentConversationKey!==key)throw Error('NATIVE_SYNC_LEDGER_CONTEXT_CHANGED');
                    nativeStoryBusy=true;
                    try{await native.commitSnapshotUpdate(baseline,()=>{const merged=appendWorldBatches(localStorage.getItem(WORLD_LEDGER_KEY),key,recovered.rows,memoryManager.peekChatHistory(key));setPersistedAppSetting(WORLD_LEDGER_KEY,JSON.stringify(merged));});saved=true;}
                    finally{nativeStoryBusy=false;updateSendButtonState();}
                }else saved=setPersistedAppSetting(WORLD_LEDGER_KEY,JSON.stringify(next));
            }
        }catch(error){
            const reason=error instanceof Error?error.message:String(error);
            recordWorldResearch({conversationKey:key,stage:'ledger-storage'},{kind:'save-error',error:researchText(reason)});
            if(error instanceof DOMException&&(error.name==='QuotaExceededError'||error.name==='NS_ERROR_DOM_QUOTA_REACHED'))throw new Error('本機儲存空間不足，之前已保存嘅紀錄不變。請先匯出備份，唔好清除網站資料。');
            throw new Error('本機保存世界紀錄失敗：'+reason);
        }
        const after=projectWorld(localStorage.getItem(WORLD_LEDGER_KEY),key,latestHistory);
        recordWorldResearch({conversationKey:key,stage:'ledger-validation',sourceIds:recovered.rows.map(row=>row.sourceId)},{kind:'validated',saved,observations:recovered.rows.map(row=>({sourceId:row.sourceId,incomplete:!!row.incomplete,observations:row.observations})),stateCoverage:{processed:after.processed,partial:after.partial,total:after.total}});
        return {advanced:Math.max(0,after.processed-before.processed),deferred:recovered.deferred,issueCount:recovered.issues.length};
    })().finally(() => worldLedgerJobs.delete(key));
    worldLedgerJobs.set(key, job);
    return job;
};
const isWorldlineNarrator = (request: ActiveChatRequest) => (
    request.persona.name === '世界敘述者'
    && request.persona.prompt.includes('disembodied narrator')
    && Boolean(getActiveWorldline(request.conversationKey))
);

const runConversationGeneration = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    models: string[],
    assistantMode: boolean,
    trace?: GenerationTrace,
): Promise<string> => {
    const preparationStartedAt = performance.now();
    let lastError: Error | null = null;
    let failedCandidate = '';
    const archivedRecall = assistantMode
        ? ''
        : buildArchivedRecallPrompt(request.conversationKey, latestUserMessage, request.room);
    const recentAssistantReplies = getRecentAssistantRepliesForPersona(request.conversationKey, assistantMode);
    const establishedNpcNames = assistantMode || isWorldlineNarrator(request)
        ? []
        : mergeEstablishedNpcNamesForTurn(
            request.establishedNpcNames,
            latestUserMessage,
            request.persona.name,
        );
    const wardrobeParticipants = getWardrobeParticipantsForRequest(request, establishedNpcNames);
    const baseSystemPrompt = assistantMode
        ? buildAssistantSystemPrompt()
        : buildChatSystemPrompt(
            request.personaKey,
            request.persona,
            latestUserMessage,
            request.wardrobeState,
            wardrobeParticipants,
            true,
            request.conversationKey,
        );
    const addressedNpcNames = assistantMode || isWorldlineNarrator(request)
        ? []
        : inferNpcSpeakersForTurn(latestUserMessage, request.persona.name, establishedNpcNames);
    const npcSpeechRequirement = buildNpcSpeechRequirement(addressedNpcNames);
    const npcContinuityRequirement = assistantMode
        ? ''
        : buildNpcContinuityRequirement(establishedNpcNames);
    const turnOwnershipRequirement = assistantMode || isWorldlineNarrator(request)
        ? ''
        : buildImmediateTurnOwnershipRequirement(request.persona.name, latestUserMessage);
    const surpriseEventContract = !assistantMode && request.surpriseEvent
        ? buildSurpriseEventExecutionContract(request.surpriseEvent, request.room)
        : '';
    const activeWorld = assistantMode ? null : getActiveWorldline(request.conversationKey);
    const worldlineContext = activeWorld ? buildWorldlineRuntimeContext(request.conversationKey,latestUserMessage,request.director) : '';
    const systemPromptParts = [
        baseSystemPrompt,
        archivedRecall,
        worldlineContext,
        surpriseEventContract,
        turnOwnershipRequirement,
        npcContinuityRequirement,
        npcSpeechRequirement,
    ].filter(Boolean);
    const systemPrompt = systemPromptParts.join('\n\n');
    const recentMessages = getRecentChatMessages(
        request.conversationKey,
        latestUserMessage,
        assistantMode,
        request.persona,
        request.room,
    );
    const latestUserContent = getLatestUserVeniceContent(request, latestUserMessage);
    // Rehydrate the complete large save from private attachment storage for follow-ups.
    // Huge blobs are not duplicated into localStorage chat history.
    const previousLargeJsonContext = assistantMode
        ? await loadPreviousAssistantLargeSaveContext(request, models[0] || '', latestUserMessage)
        : '';
    const promptCacheKey = assistantMode
        ? undefined
        : createConversationPromptCacheKey(request.conversationKey, 'chat');
    const basePromptComponents = assistantMode
        ? [promptComponent('base-system', baseSystemPrompt)]
        : classifyCharacterSystemPrompt(baseSystemPrompt);
    const requestPromptComponents: PromptComponentSize[] = [
        ...basePromptComponents,
        promptComponent('archived-recall', archivedRecall),
        promptComponent('worldline-stable-world-state', worldlineContext),
        promptComponent('surprise-event', surpriseEventContract),
        promptComponent('immediate-turn-ownership', turnOwnershipRequirement),
        promptComponent('npc-continuity', npcContinuityRequirement),
        promptComponent('npc-direct-speech', npcSpeechRequirement),
        {
            name: 'recent-conversation-history',
            chars: getVeniceMessageAggregate(recentMessages),
            messages: recentMessages.length,
        },
        {
            name: 'latest-user-and-attachments',
            chars: getVeniceMessageAggregate([{ role: 'user', content: latestUserContent }]),
            messages: 1,
        },
        ...(previousLargeJsonContext ? [{
            name: 'rehydrated-large-json-from-attachment',
            chars: previousLargeJsonContext.length,
            messages: 1,
        }] : []),
    ];
    markChatPerformance('generation:prompt-build', preparationStartedAt);

    for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        const attemptCount = getGenerationAttemptCount(index);

        for (let attempt = 0; attempt < attemptCount; attempt += 1) {
            const isRepairAttempt = attempt > 0;
            const detail = index === 0 && !isRepairAttempt ? '思考中...' : '重新思考中...';
            applyChatRuntimeState(index === 0 && !isRepairAttempt ? 'generating' : 'retrying', detail);
            let requestStartedAt: number | null = null;
            let attemptRecorded = false;
            const attemptPhase = classifySingleGenerationAttempt(index, attempt + 1);

            try {
                const performanceStartedAt = performance.now();
                markChatPerformance(
                    index === 0 && !isRepairAttempt
                        ? 'generation:primary-request-start'
                        : isRepairAttempt ? 'generation:repair-request-start' : 'generation:fallback-request-start',
                );
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
                            npcContinuityRequirement,
                            npcSpeechRequirement,
                            failedCandidate ? `Rejected attempt (do not copy):\n${failedCandidate.slice(0, 800)}` : '',
                        ].filter(Boolean).join('\n'),
                    });
                }

                messages.push(...recentMessages);
                if (previousLargeJsonContext) {
                    messages.push({
                        role: 'user',
                        content: 'Reference: complete previously uploaded JSON save. Original is retained.\n' + previousLargeJsonContext,
                    });
                }
                messages.push({ role: 'user', content: latestUserContent });
                if(activeWorld&&!request.vpsTurn?.receipt){const edited=await editWorldline2Request(request.conversationKey,messages,request.controller.signal);messages.splice(0,messages.length,...edited);}
                const generationPhase = index === 0 && !isRepairAttempt
                    ? 'generation:primary'
                    : isRepairAttempt ? 'generation:repair' : 'generation:fallback';
                markVeniceRequestAggregate(
                    `${generationPhase}:request-meta`,
                    model,
                    messages,
                    attempt + 1,
                    { repair: isRepairAttempt, fallback: index > 0 },
                );
                markPromptComponentAccounting(generationPhase, [
                    ...(activeWorld?[promptComponent('worldline2-actual-system',getSystemTexts(messages)[0]??''),...requestPromptComponents.filter(c=>['recent-conversation-history','latest-user-and-attachments','rehydrated-large-json-from-attachment'].includes(c.name))]:requestPromptComponents),
                    ...(isRepairAttempt ? [{
                        name: 'repair-instructions',
                        chars: getVeniceMessageAggregate([messages[1]!]),
                        messages: 1,
                    }] : []),
                ], messages.length, isRepairAttempt ? 2 : 1);

                requestStartedAt = performance.now();
                const generationOptions: Parameters<typeof generateVeniceText>[0] = {
                    model,
                    messages,
                    temperature: assistantMode ? 0.7 : 0.82,
                    topP: assistantMode ? 0.9 : 0.94,
                    repetitionPenalty: assistantMode ? 1.04 : 1.12,
                    promptCacheKey,
                    signal: request.controller.signal,
                    onTextDelta: assistantMode ? text => showAssistantStreamPreview(request, text) : undefined,
                    enableWebSearch: assistantMode && isVeniceAssistantWebSearchEnabled(),
                };
                let result;
                if (request.vpsTurn) {
                    const turn = request.vpsTurn;
                    const controller = makeVpsTurnController();
                    const prior = controller.pending();
                    if (!prior && turn.receipt) throw Error('TURN_RECEIPT_MISSING');
                    if (prior) {
                        const recovered = await controller.resume(turn.identity);
                        if (!recovered || recovered.historyState !== 'ready') throw Error('TURN_HISTORY_CHANGED');
                        turn.receipt = recovered.receipt;
                        turn.job = recovered.job;
                    } else {
                        if(turn.identity.worldDigest&&JSON.stringify(request.director||{})!==JSON.stringify(readDirector(localStorage,request.conversationKey)))throw Error('WORLDLINE_CONTEXT_CHANGED');
                        const reviewContext = buildSingleReviewContext(request, latestUserMessage);
                        const plan = buildVpsWorkflowPayload(generationOptions, {
                            editorPrompt: STRICT_REVIEW_EDITOR_PROMPT,
                            authoritativePrompt: reviewContext.authoritativePrompt,
                            reviewHistory: getStrictReviewHistory(request, latestUserMessage),
                            latestUserMessage,
                            promptCacheKey: createConversationPromptCacheKey(request.conversationKey, 'review'),
                        }, request.personaKey === 'cc' ? CC_CANTONESE_POLISH_PROMPT : undefined);
                        if (!isActiveChatRequest(request) || request.controller.signal.aborted || await digestVpsHistory(memoryManager.peekChatHistory(request.conversationKey),turn.identity.contextDigestVersion) !== turn.identity.contextDigest) throw Error('TURN_HISTORY_CHANGED');
                        turn.job = await controller.submit(turn.identity, plan);
                        turn.receipt = controller.pending() || undefined;
                    }
                    if (!turn.receipt) throw Error('TURN_RECEIPT_MISSING');
                    const deadline = Date.now() + (turn.receipt.workflowVersion !== undefined ? 1500000 : 300000);
                    // A completed duplicate POST has only a receipt; always GET the full result.
                    while (turn.job.status === 'queued' || turn.job.status === 'running' || (turn.job.status === 'done' && !turn.job.result)) {
                        if (request.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
                        if (Date.now() >= deadline) throw Error('VPS_PENDING');
                        applyChatRuntimeState('generating', 'VPS 背景生成中…');
                        await new Promise(resolve => setTimeout(resolve, 1600));
                        const recovered = await controller.resume(turn.identity);
                        if (!recovered || recovered.historyState !== 'ready') throw Error('TURN_HISTORY_CHANGED');
                        turn.job = recovered.job;
                    }
                    if (turn.job.status !== 'done') throw Error('VPS_' + turn.job.status.toUpperCase());
                    result = decodeVpsCharacterResult(turn.job, model);
                    if (turn.receipt.workflowVersion !== undefined) {
                        const workflow = decodeVpsWorkflow(turn.job);
                        if (workflow.version !== turn.receipt.workflowVersion) throw Error('TURN_WORKFLOW_RESULT_MISMATCH');
                        result = { ...result, text: workflow.parts[0], finishReason: 'stop' };
                    } else if (turn.job.result?.workflow) throw Error('TURN_WORKFLOW_RESULT_MISMATCH');
                    // Legacy in-flight turns retain their original per-stage recovery path.
                } else {
                    result = await generateChatTextWithTimeout(generationOptions,undefined,getActiveWorldline(request.conversationKey)?{conversationKey:request.conversationKey,requestId:request.id,stage:generationPhase}:undefined);
                }
                markChatPerformance(
                    index === 0 && !isRepairAttempt
                        ? 'generation:primary'
                        : isRepairAttempt ? 'generation:repair' : 'generation:fallback',
                    performanceStartedAt,
                );
                markVeniceRequestAggregate(
                    `${generationPhase}:response-meta`,
                    result.model,
                    messages,
                    attempt + 1,
                    { repair: isRepairAttempt, fallback: index > 0 },
                    result,
                );

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

                const wardrobeEnvelope = assistantMode
                    ? null
                    : extractWardrobeEnvelope(result.text, request.wardrobeState, wardrobeParticipants);
                let cleanedText = assistantMode
                    ? cleanVeniceAssistantReply(result.text)
                    : cleanVeniceChatReply(wardrobeEnvelope!.visibleText);
                if (!cleanedText || (!assistantMode && isInvalidVeniceChatReply(cleanedText))) {
                    recordSingleGenerationAttempt(trace, {
                        phase: attemptPhase,
                        model: result.model || model,
                        routeIndex: index,
                        attemptIndex: attempt + 1,
                        latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
                        promptTokens: result.promptTokens,
                        completionTokens: result.completionTokens,
                        finishReason: result.finishReason ?? null,
                        outcome: 'invalid',
                        errorCode: 'INVALID_RESPONSE',
                    });
                    attemptRecorded = true;
                    throw new Error(`Invalid reply from ${model}.`);
                }

                recordSingleGenerationAttempt(trace, {
                    phase: attemptPhase,
                    model: result.model || model,
                    routeIndex: index,
                    attemptIndex: attempt + 1,
                    latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                    finishReason: result.finishReason ?? null,
                    outcome: 'accepted',
                });
                attemptRecorded = true;

                let continuationCount = 0;
                let finishReason = result.finishReason;
                if (request.vpsTurn?.receipt?.workflowVersion !== undefined) {
                    const workflow = decodeVpsWorkflow(request.vpsTurn.job!);
                    for (const part of workflow.parts.slice(1)) {
                        const continuation = cleanVeniceChatReply(part);
                        if (!continuation || isInvalidVeniceChatReply(continuation)) throw Error('VPS_INVALID_CONTINUATION');
                        cleanedText = mergeReplySegments(cleanedText, continuation);
                    }
                }
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
                        trace,
                        index,
                        continuationCount,
                    );
                    if (!continuation) {
                        if (request.vpsTurn) throw Error('VPS_INVALID_CONTINUATION');
                        break;
                    }

                    cleanedText = mergeReplySegments(cleanedText, continuation.text);
                    finishReason = continuation.finishReason;
                }

                if (request.vpsTurn && finishReason === 'length') throw Error('VPS_TRUNCATED_REPLY');
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
                    if (!request.vpsTurn) cleanedText = await polishCcReply(request, cleanedText);
                    else {
                        if (request.vpsTurn.receipt?.workflowVersion !== 2) throw Error('CC_WORKFLOW_REQUIRED');
                        const workflow = decodeVpsWorkflow(request.vpsTurn.job!);
                        if (workflow.polished !== null) {
                            const polished = normalizeCcCantoneseLeaks(cleanVeniceChatReply(workflow.polished || ''));
                            const ratio = polished.length / Math.max(cleanedText.length, 1);
                            const refusal = /(?:無法|不能|唔可以).{0,16}(?:協助|處理|生成|改寫|提供)|(?:I cannot|I can't).{0,24}(?:assist|rewrite)/iu.test(polished);
                            if (!polished || isInvalidVeniceChatReply(polished) || refusal || ratio < 0.7 || ratio > 1.55) throw Error('VPS_CC_POLISH_INVALID');
                            cleanedText = polished;
                        } else cleanedText = normalizeCcCantoneseLeaks(cleanedText);
                    }
                }

                if (!assistantMode && replyHasUnconfirmedAddressLabel(
                    cleanedText,
                    latestUserMessage,
                    request.persona.name,
                    establishedNpcNames,
                )) {
                    failedCandidate = cleanedText;
                    throw new Error(`Invented speaker from user phrase by ${model}.`);
                }

                if (
                    addressedNpcNames.length > 0
                    && !replyContainsAttributedNpcSpeech(cleanedText, addressedNpcNames)
                    && request.personaKey !== 'cc'
                    && (attempt < attemptCount - 1 || index < models.length - 1)
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

                if (!assistantMode && wardrobeEnvelope) {
                    request.pendingWardrobeState = wardrobeEnvelope.wardrobe;
                }
                return cleanedText;
            } catch (error) {
                if (assistantMode) clearAssistantStreamPreview(request);
                if (!attemptRecorded && requestStartedAt !== null) {
                    const failure = getSingleGenerationAttemptFailure(error);
                    recordSingleGenerationAttempt(trace, {
                        phase: attemptPhase,
                        model,
                        routeIndex: index,
                        attemptIndex: attempt + 1,
                        latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
                        ...failure,
                    });
                }
                if (request.vpsTurn || isAbortError(error)) {
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
    const publicIdentity = persona.publicIdentityEnabled ? persona.publicIdentity : undefined;

    if (publicIdentity) {
        const identity = trimPhotoPromptSection([
            `Canonical identity: ${publicIdentity.canonicalName}.`,
            publicIdentity.visualPrompt,
            publicIdentity.stylePrompt,
            `Public identity context: ${publicIdentity.summary}`,
        ].filter(Boolean).join(' '), 760);
        const fixedLength = identity.length + qualityInstruction.length + 180;
        const scene = trimPhotoPromptSection(
            replaceGenericReferenceSubject(scenePrompt, publicIdentity.canonicalName),
            Math.max(280, CHARACTER_PHOTO_PROMPT_MAX_LENGTH - fixedLength),
        );
        const mediumInstruction = publicIdentity.kind === 'fictional_character'
            ? 'Preserve the canonical franchise design and original source-medium visual language. Do not convert the character into a generic live-action person or photorealistic model unless the requested scene explicitly asks for that reinterpretation.'
            : 'The subject must be the exact recognizable named public figure, not a generic person, demographic substitute, inspired lookalike, or newly invented face.';
        return [
            `Create one new coherent still image featuring ${publicIdentity.canonicalName}.`,
            `Verified identity specification: ${identity}`,
            mediumInstruction,
            `Requested scene and composition: ${scene}`,
            qualityInstruction,
        ].join(' ').replace(/\s{2,}/gu, ' ').trim();
    }

    if (useAvatarReference) {
        const scene = trimPhotoPromptSection(replaceGenericReferenceSubject(scenePrompt, persona.name), 720);
        return [
            `Edit the supplied reference portrait into a new camera photo of ${persona.name}.`,
            `Identity lock: ${persona.name} must remain the exact same recognizable individual shown in the input image, not a replacement, reinterpretation, generic person, or lookalike.`,
            'Facial identity preservation is the highest priority, above pose, styling, clothing, background, or prompt aesthetics. If any requested change conflicts with likeness, preserve likeness.',
            'Treat the input image as identity evidence, not merely a style reference. Preserve the exact facial proportions and geometry, face shape, eyes and spacing, brows, nose, lips, jawline, skin details, hairline, and every distinctive feature.',
            'Do not beautify into a different face, average the subject into a generic East Asian appearance, alter apparent age, or borrow facial traits from the requested setting.',
            'Copy only identity-defining physical details from the reference image instead of inferring them from text. Clothing, accessories, styling, pose, and surroundings must follow the requested scene and current conversation, and are not locked to the reference portrait.',
            'Keep the face sufficiently visible, sharp, naturally lit, and unobstructed so the same identity remains immediately recognizable.',
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

let characterPhotoProposalGenerationModuleLoad: Promise<typeof import('./features/characterPhotoProposalGeneration.js')> | null = null;

const loadCharacterPhotoProposalGenerationModule = () => {
    characterPhotoProposalGenerationModuleLoad ??= import('./features/characterPhotoProposalGeneration.js');
    return characterPhotoProposalGenerationModuleLoad;
};

const buildCharacterPhotoProposal = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
): Promise<{ text: string; proposal: CharacterPhotoProposal }> => {
    const { generateCharacterPhotoProposalDraft } = await loadCharacterPhotoProposalGenerationModule();
    const generatedDraft = await generateCharacterPhotoProposalDraft({
        id: request.id,
        personaKey: request.personaKey,
        conversationKey: request.conversationKey,
        persona: request.persona,
        room: request.room,
        photoSenderMemberId: request.photoSenderMemberId,
        photoSubjectMemberIds: request.photoSubjectMemberIds,
        signal: request.controller.signal,
    }, {
        latestUserMessage,
        baseChatSystemPrompt: buildChatSystemPrompt(
            request.personaKey,
            request.persona,
            latestUserMessage,
            request.wardrobeState,
            getWardrobeParticipantsForRequest(request),
            false,
            request.conversationKey,
        ),
        latestUserContent: getLatestUserVeniceContent(request, latestUserMessage),
        chatModelSettings,
        getRecentMessages: () => getRecentChatMessages(
            request.conversationKey,
            latestUserMessage,
            false,
            request.persona,
            request.room,
        ).slice(-24),
        setRuntimeState: applyChatRuntimeState,
        runModel: async modelRequest => (
            await generateChatTextWithTimeout({
                model: modelRequest.model,
                messages: modelRequest.messages,
                temperature: modelRequest.temperature,
                topP: modelRequest.topP,
                repetitionPenalty: modelRequest.repetitionPenalty,
                responseFormat: modelRequest.responseFormat as Parameters<typeof generateChatTextWithTimeout>[0]['responseFormat'],
                signal: modelRequest.signal,
            })
        ).text,
        cleanChatReply: cleanVeniceChatReply,
        isAbortError,
    });
    const {
        draft,
        favoritePrompt,
        subjectPersonas,
        isMultiSubject,
        usesAnyPublicIdentity,
        useAvatarReference,
        contentMode,
    } = generatedDraft;
    const mode: VeniceImageMode = useAvatarReference ? 'edit' : 'generate';
    let imageModel = getPreferredCharacterPhotoModel(mode);
    try {
        await loadImageModels(mode);
        imageModel = getPreferredCharacterPhotoModel(mode);
    } catch (error) {
        // Discovery is retried on approval; failure here must not hide the prompt card.
        console.warn('Image model discovery deferred until photo approval.', error);
    }
    const normalizeScenePrompt = (value: string) => useAvatarReference
        ? replaceGenericReferenceSubject(value, request.persona.name)
        : value;
    const buildCompletePrompt = (value: string) => {
        const normalizedScene = normalizeScenePrompt(value);
        return isMultiSubject
            ? trimPhotoPromptSection([
                `Exactly ${subjectPersonas.length} distinct people in one image:`,
                ...subjectPersonas.map(persona => {
                    const identity = persona.publicIdentityEnabled ? persona.publicIdentity : undefined;
                    return identity
                        ? `${identity.canonicalName} (${identity.visualPrompt})`
                        : `${persona.name} (${persona.avatarPrompt || persona.description})`;
                }),
                `Requested scene and composition: ${normalizedScene}`,
                'Preserve every named identity separately. No duplicate people, merged faces, generic substitutions, extra subjects, text, captions, logos, or watermarks.',
            ].join(' '), CHARACTER_PHOTO_PROMPT_MAX_LENGTH)
            : buildCharacterPhotoPrompt(request.persona, normalizedScene, useAvatarReference);
    };
    const scenePrompt = normalizeScenePrompt(draft.scenePrompt);
    const favoriteScenePrompt = draft.favoriteScenePrompt
        ? normalizeScenePrompt(draft.favoriteScenePrompt)
        : undefined;
    const basePrompt = buildCompletePrompt(scenePrompt);
    const favoritePromptVersion = favoritePrompt && favoriteScenePrompt
        ? buildCompletePrompt(favoriteScenePrompt)
        : undefined;
    const favoritePromptApplied = Boolean(favoritePrompt && favoritePromptVersion);
    const prompt = selectPhotoPromptVersion(basePrompt, favoritePromptVersion, favoritePromptApplied);
    const reply = request.personaKey === 'cc'
        ? normalizeCcCantoneseLeaks(draft.reply)
        : normalizeTraditionalChineseLeaks(draft.reply);
    const caption = request.personaKey === 'cc'
        ? normalizeCcCantoneseLeaks(draft.caption)
        : normalizeTraditionalChineseLeaks(draft.caption);
    const seed = mode === 'generate'
        ? resolveImageSeedForRequest(imageSeed, imageSeedLock.checked)
        : undefined;

    return {
        text: reply,
        proposal: {
            id: crypto.randomUUID?.() || `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            prompt,
            basePrompt,
            favoritePrompt: favoritePrompt || undefined,
            favoritePromptVersion,
            favoritePromptApplied,
            scenePrompt,
            favoriteScenePrompt,
            caption,
            aspectRatio: draft.aspectRatio,
            status: 'pending',
            createdAt: Date.now(),
            useAvatarReference,
            identityMode: usesAnyPublicIdentity
                ? 'public_identity'
                : useAvatarReference ? 'avatar_reference' : 'persona_description',
            contentMode,
            senderMemberId: request.photoSenderMemberId,
            subjectMemberIds: request.photoSubjectMemberIds,
            modelId: imageModel?.id,
            modelName: imageModel?.name,
            resolution: imageModel?.constraints.defaultResolution || imageModel?.constraints.resolutions?.[0],
            seed,
            estimatedPriceUsd: getImageModelPrice(imageModel, imageModel?.constraints.defaultResolution),
        },
    };
};

const runRoomConversationGeneration = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    models: string[],
    trace?: GenerationTrace,
): Promise<GroupGenerationResult> => {
    if (!request.room) throw new Error('Room snapshot is unavailable.');
    const preparationStartedAt = performance.now();
    const groupPromptModule = await loadGroupChatPromptModule();

    let lastError: Error | null = null;
    let rejectedReply = '';
    const recentReplies = getRecentAssistantRepliesForPersona(request.conversationKey, false, 8);
    const fallbackMemberId = getGroupFallbackMemberId(request, latestUserMessage);
    const archivedRecall = buildArchivedRecallPrompt(
        request.conversationKey,
        latestUserMessage,
        request.room,
    );
    const promptCacheKey = createConversationPromptCacheKey(request.conversationKey, 'chat');

    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
        const model = models[modelIndex];
        const attempts = getGenerationAttemptCount(modelIndex);

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const isRetry = modelIndex > 0 || attempt > 0;
            let requestStartedAt: number | null = null;
            let attemptRecorded = false;
            let result: Awaited<ReturnType<typeof generateChatTextWithTimeout>> | undefined;
            const attemptPhase = classifySingleGenerationAttempt(modelIndex, attempt + 1);
            applyChatRuntimeState(isRetry ? 'retrying' : 'generating', isRetry ? '重新思考中...' : '思考中...');
            try {
                const groupV2OwnerTrial = isGroupV2PersonalTrialEnabled(request.room.id);
                const groupPromptBuild = groupPromptModule.buildGroupSystemPromptWithAccounting(
                    request.room,
                    latestUserMessage,
                    formatSessionMemoryPrompt(request.conversationKey),
                    groupV2OwnerTrial ? 'owner-v2' : 'legacy',
                );
                let ownerProfile = null;
                if (groupV2OwnerTrial) {
                    try { ownerProfile = loadOwnerProfile(localStorage); }
                    catch { ownerProfile = null; }
                }
                const ownerIdentityLedger = groupV2OwnerTrial
                    ? formatOwnerProfileForGroup(ownerProfile, request.room.members.map(member => member.id))
                    : '';
                let confirmedRelationshipMeanings = '';
                if (groupV2OwnerTrial) {
                    try {
                        const ledger = loadMeaningLedger(request.room.id, localStorage);
                        if (ledger?.confirmed.length) {
                            confirmedRelationshipMeanings = formatRelationshipMeaningsForV2(ledger, request.room);
                        }
                    } catch { confirmedRelationshipMeanings = ''; }
                }
                const groupSystemPrompt = groupV2OwnerTrial
                    ? [groupPromptBuild.prompt, ownerIdentityLedger, confirmedRelationshipMeanings, GROUP_V2_OWNER_PERSONAL_GUIDANCE].filter(Boolean).join('\n\n')
                    : groupPromptBuild.prompt;
                const surpriseEventContract = request.surpriseEvent
                    ? buildSurpriseEventExecutionContract(request.surpriseEvent, request.room)
                    : '';
                const world = getActiveWorldline(request.conversationKey);
                const worldlineContext = world ? buildWorldlineRuntimeContext(request.conversationKey,latestUserMessage,request.director) : '';
                const roomSystemPrompt = [
                    groupSystemPrompt,
                    archivedRecall,
                    worldlineContext,
                    surpriseEventContract,
                ].filter(Boolean).join('\n\n');
                const recentMessages = getRecentChatMessages(
                    request.conversationKey,
                    latestUserMessage,
                    false,
                    request.persona,
                    request.room,
                );
                const latestUserContent = getLatestUserVeniceContent(request, latestUserMessage);
                const promptComponents: PromptComponentSize[] = [
                    { ...promptComponent('room-group-context', groupSystemPrompt), includeInTotal: false },
                    ...groupPromptBuild.components,
                    ...(groupV2OwnerTrial ? [
                        promptComponent('group-v2-owner-identity-ledger', ownerIdentityLedger),
                        ...(confirmedRelationshipMeanings ? [promptComponent('group-v2-confirmed-relationship-meanings', confirmedRelationshipMeanings)] : []),
                        promptComponent('group-v2-personal-trial-guidance', GROUP_V2_OWNER_PERSONAL_GUIDANCE),
                    ] : []),
                    promptComponent('archived-recall', archivedRecall),
                    promptComponent('worldline-stable-world-state', worldlineContext),
                    promptComponent('surprise-event', surpriseEventContract),
                    {
                        name: 'recent-conversation-history',
                        chars: getVeniceMessageAggregate(recentMessages),
                        messages: recentMessages.length,
                    },
                    {
                        name: 'latest-user-and-attachments',
                        chars: getVeniceMessageAggregate([{ role: 'user', content: latestUserContent }]),
                        messages: 1,
                    },
                ];
                const messages: VeniceMessage[] = [
                    { role: 'system', content: roomSystemPrompt },
                ];
                if (isRetry) {
                    messages.push({
                        role: 'system',
                        content: [
                            'The previous attempt was invalid, repetitive, confused a speaker, or failed to answer the newest message.',
                            'Rebuild the fixed identity ledger and answer the newest turn from scratch with a genuinely new reaction and scene beat.',
                            request.surpriseEvent
                                ? 'The previous event opening also failed its participant contract. Include every selected character visibly, preserve each distinct first move, and do not let an unselected fixed member speak.'
                                : '',
                            lastError ? `Previous attempt defect: ${lastError.message}` : '',
                            rejectedReply ? `Rejected output; do not copy it:\n${rejectedReply.slice(0, 900)}` : '',
                        ].filter(Boolean).join('\n'),
                    });
                }
                messages.push(...recentMessages);
                messages.push({ role: 'user', content: latestUserContent });
                if(world&&!request.vpsTurn?.receipt){const edited=await editWorldline2Request(request.conversationKey,messages,request.controller.signal);messages.splice(0,messages.length,...edited);}
                markChatPerformance('generation:prompt-build', preparationStartedAt);

                const generationStartedAt = performance.now();
                markChatPerformance(isRetry ? 'generation:repair-request-start' : 'generation:primary-request-start');
                markVeniceRequestAggregate(
                    `${isRetry ? 'generation:repair' : 'generation:primary'}:request-meta`,
                    model,
                    messages,
                    attempt + 1,
                    { repair: isRetry, fallback: modelIndex > 0 },
                );
                markPromptComponentAccounting(isRetry ? 'generation:repair' : 'generation:primary', [
                    ...(world?[promptComponent('worldline2-actual-system',getSystemTexts(messages)[0]??''),...promptComponents.filter(c=>['recent-conversation-history','latest-user-and-attachments'].includes(c.name))]:promptComponents),
                    ...(isRetry ? [{
                        name: 'repair-instructions',
                        chars: getVeniceMessageAggregate([messages[1]!]),
                        messages: 1,
                    }] : []),
                ], messages.length, isRetry ? 2 : 1);
                requestStartedAt = performance.now();
                const options: Parameters<typeof generateVeniceText>[0] = {
                    model,messages,temperature:0.78,topP:0.92,repetitionPenalty:1.1,stop:[],promptCacheKey,signal:request.controller.signal,
                };
                if(request.vpsTurn){
                    const turn=request.vpsTurn;
                    const controller=makeVpsTurnController();
                    const check=async()=>{
                        const room=roomManager.getRoom(request.conversationKey);
                        if(!isActiveChatRequest(request)||request.controller.signal.aborted||!room||await digestGroupContext(room,turn.identity.contextDigestVersion)!==turn.identity.roomDigest||await digestVpsHistory(memoryManager.peekChatHistory(request.conversationKey),turn.identity.contextDigestVersion)!==turn.identity.contextDigest)throw Error('GROUP_CONTEXT_CHANGED');
                    };
                    await check();
                    const prior=controller.pending();
                    if(!prior&&turn.receipt)throw Error('TURN_RECEIPT_MISSING');
                    if(prior){
                        const recovered=await controller.resume(turn.identity);
                        if(!recovered||recovered.historyState!=='ready')throw Error('TURN_HISTORY_CHANGED');
                        turn.receipt=recovered.receipt;turn.job=recovered.job;
                    }else{
                        const plan=buildVpsWorkflowPayload(options,{
                            editorPrompt:STRICT_REVIEW_EDITOR_PROMPT,
                            authoritativePrompt:await buildGroupReviewContext(request,latestUserMessage),
                            reviewHistory:getStrictReviewHistory(request,latestUserMessage),
                            latestUserMessage,promptCacheKey:createConversationPromptCacheKey(request.conversationKey,'review'),
                        },undefined,true);
                        await check();
                        turn.job=await controller.submit(turn.identity,plan);turn.receipt=controller.pending()||undefined;
                    }
                    if(turn.receipt?.workflowVersion!==3)throw Error('TURN_WORKFLOW_RESULT_MISMATCH');
                    const deadline=Date.now()+1500000;
                    while(turn.job.status==='queued'||turn.job.status==='running'||(turn.job.status==='done'&&!turn.job.result)){
                        await check();if(Date.now()>=deadline)throw Error('VPS_PENDING');
                        applyChatRuntimeState('generating','VPS 群組背景生成中…');
                        await new Promise(resolve=>setTimeout(resolve,1600));
                        await check();
                        const recovered=await controller.resume(turn.identity);
                        if(!recovered||recovered.historyState!=='ready')throw Error('TURN_HISTORY_CHANGED');
                        turn.job=recovered.job;
                    }
                    await check();
                    if(turn.job.status!=='done')throw Error('VPS_'+turn.job.status.toUpperCase());
                    const workflow=decodeVpsWorkflow(turn.job);
                    if(workflow.version!==3)throw Error('TURN_WORKFLOW_RESULT_MISMATCH');
                    result=decodeVpsCharacterResult(turn.job,model);
                }else result=await generateChatTextWithTimeout(options,undefined,getActiveWorldline(request.conversationKey)?{conversationKey:request.conversationKey,requestId:request.id,stage:isRetry?'group-repair':'group-generation'}:undefined);
                markChatPerformance(isRetry ? 'generation:repair' : 'generation:primary', generationStartedAt);
                markVeniceRequestAggregate(
                    `${isRetry ? 'generation:repair' : 'generation:primary'}:response-meta`,
                    result.model,
                    messages,
                    attempt + 1,
                    { repair: isRetry, fallback: modelIndex > 0 },
                    result,
                );
                const groupParseStartedAt = performance.now();
                const generated = normalizeGroupGenerationTraditional(
                    parseGroupGeneration(result.text, request.room, fallbackMemberId),
                );
                const parsed = groupV2OwnerTrial
                    ? normalizeGroupV2OwnerReply(generated)
                    : generated;
                markChatPerformance('generation:group-parse', groupParseStartedAt);
                if (parsed.npcCandidate && isUnconfirmedAddressPrefixName(
                    parsed.npcCandidate.name,
                    latestUserMessage,
                    request.persona.name,
                    request.room.members.map(member => member.persona.name),
                )) {
                    parsed.npcCandidate = undefined;
                }
                if (groupNarrationUsesFirstPerson(parsed)) {
                    // This is a quality signal for the strict reviewer, not a fatal transport error.
                    // Rejecting here can exhaust every model even when the turn is otherwise usable.
                    console.warn('[aigf4 group narration ownership warning]', {
                        requestId: request.id,
                        model: result.model,
                    });
                }

                const repeats = recentReplies.some(previous => repliesAreTooSimilar(previous, parsed.text));
                if (repeats && !userExplicitlyRequestsContinuation(latestUserMessage)) {
                    rejectedReply = parsed.text;
                    throw new Error(`Repeated group reply from ${model}.`);
                }
                if (
                    request.surpriseEvent
                    && !surpriseEventReplyCoversParticipants(request.surpriseEvent, request.room, parsed)
                ) {
                    rejectedReply = parsed.text;
                    throw new Error(`Surprise event omitted or confused selected participants in ${model}.`);
                }

                recordGroupGenerationAttempt(trace, {
                    phase: attemptPhase,
                    model: result.model || model,
                    routeIndex: modelIndex,
                    attemptIndex: attempt + 1,
                    latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                    finishReason: result.finishReason ?? null,
                    outcome: 'accepted',
                });
                attemptRecorded = true;

                console.info('[aigf4 group generation]', {
                    requestId: request.id,
                    model: result.model,
                    latencyMs: Math.round(performance.now() - request.startedAt),
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                    finishReason: result.finishReason,
                    roomId: request.room.id,
                });
                return parsed;
            } catch (error) {
                if (!attemptRecorded && requestStartedAt !== null) {
                    if (result) {
                        recordGroupGenerationAttempt(trace, {
                            phase: attemptPhase,
                            model: result.model || model,
                            routeIndex: modelIndex,
                            attemptIndex: attempt + 1,
                            latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
                            promptTokens: result.promptTokens,
                            completionTokens: result.completionTokens,
                            finishReason: result.finishReason ?? null,
                            outcome: 'invalid',
                            errorCode: 'INVALID_RESPONSE',
                        });
                    } else {
                        const failure = getGroupGenerationAttemptFailure(error);
                        recordGroupGenerationAttempt(trace, {
                            phase: attemptPhase,
                            model,
                            routeIndex: modelIndex,
                            attemptIndex: attempt + 1,
                            latencyMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
                            ...failure,
                        });
                    }
                    attemptRecorded = true;
                }
                if (request.vpsTurn || isAbortError(error)) throw error;
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn('[aigf4 group attempt rejected]', {
                    requestId: request.id,
                    model,
                    attempt: attempt + 1,
                    reason: lastError.message,
                });
                if (lastError.message === CHAT_MODEL_TIMEOUT_ERROR) break;
            }
        }
    }

    throw lastError || new Error('Group reply was invalid.');
};

const getDirectlyNamedRoomMember = (
    request: ActiveChatRequest,
    latestUserMessage: string,
) => {
    if (!request.room) return undefined;
    const normalizedTurn = latestUserMessage.toLocaleLowerCase();
    return request.room.members.find(member => {
        if (!request.room?.scene.presentMemberIds.includes(member.id)) return false;
        const names = [member.persona.name, member.persona.publicIdentity?.canonicalName]
            .filter((name): name is string => Boolean(name?.trim()));
        return names.some(name => normalizedTurn.includes(name.trim().toLocaleLowerCase()));
    });
};

const getGroupFallbackMemberId = (
    request: ActiveChatRequest,
    latestUserMessage: string,
) => {
    if (!request.room) return undefined;
    const directlyNamedMember = getDirectlyNamedRoomMember(request, latestUserMessage);
    const fallbackMemberId = directlyNamedMember?.id
        || (request.room.scene.presentMemberIds.includes(request.roomMemberId || '') ? request.roomMemberId : undefined)
        || (request.room.scene.presentMemberIds.includes(request.room.leadMemberId) ? request.room.leadMemberId : undefined)
        || request.room.scene.presentMemberIds[0];
    return fallbackMemberId;
};

const STRICT_REVIEW_HISTORY_MESSAGE_LIMIT = 18;
const STRICT_REVIEW_HISTORY_CHAR_BUDGET = 18000;

const STRICT_REVIEW_EDITOR_PROMPT = [
    'You are the strict final quality gate for a continuous private character conversation.',
    'Audit the candidate against the authoritative character files, recent completed history, current scene and newest user message.',
    'Check every item: it answers the newest request; identities and first-person ownership are correct; named people remain separate; location, clothing, body position, reality layer and completed actions do not contradict continuity; no old instruction or completed beat is replayed; personality and regional language remain vivid; relevant third parties may speak; the user is never puppeted; the ending is complete rather than cut off.',
    'Treat the authoritative wardrobe ledger as physical fact. Do not change the user or any character outfit unless the newest turn visibly establishes that change.',
    'For group output, narration must stay external third-person and cannot use 我 / 我們 / 我哋 / I / me / my for a character or user. First person belongs only inside a labelled character dialogue line.',
    'KEEP a strong response. Do not rewrite merely to impose your own prose style. REVISE only when there is at least one concrete defect.',
    `issues must contain only these label codes: ${STRICT_REVIEW_ISSUE_CODES.join(', ')}. Use the narrowest applicable code(s), use other only when no named code fits, and return issues: [] for KEEP. These labels do not lower the concrete-defect threshold or create new review criteria.`,
    'When revising, preserve all valid detail, emotional intensity, relationship development, consensual adult intimacy and regional voice. Do not sanitize, moralize, summarize, shorten into a minimal answer, add meta-commentary, or mention this review.',
    'Return only the requested JSON. For keep, revised_response must be an empty string. For revise, revised_response must be the complete replacement response, never notes or a partial patch.',
].join('\n');

const getStrictReviewHistory = (
    request: ActiveChatRequest,
    latestUserMessage: string,
) => collectRecentMessagesWithinBudget(
    getRecentChatMessages(
        request.conversationKey,
        latestUserMessage,
        false,
        request.persona,
        request.room,
    ),
    STRICT_REVIEW_HISTORY_CHAR_BUDGET,
    STRICT_REVIEW_HISTORY_MESSAGE_LIMIT,
);

const requestStrictReviewDecision = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    authoritativePrompt: string,
    candidateResponse: string,
    trace?: GenerationTrace,
) => {
    if (request.vpsTurn?.receipt?.workflowVersion !== undefined) {
        if (!request.vpsTurn.job) throw Error('TURN_RESULT_NOT_READY');
        return decodeVpsWorkflow(request.vpsTurn.job).decision;
    }
    const preparationStartedAt = performance.now();
    const reviewerModels = request.vpsTurn ? VPS_REVIEW_MODELS : buildStrictReviewModelRoute(chatModelSettings, request.personaKey === 'cc');
    const promptCacheKey = createConversationPromptCacheKey(request.conversationKey, 'review');
    const runAttempt = async ({ model, attemptIndex, isFallback }: ReviewPipelineAttemptContext) => {
        applyChatRuntimeState('retrying', isFallback ? '重新檢查中...' : '檢查回覆中...');
        const handleNonFatalFailure = (error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            markChatPerformance(`strict-review:attempt-error model=${model} attempt=${attemptIndex} retry=${isFallback} fallback=${isFallback} timeout=${reason === CHAT_MODEL_TIMEOUT_ERROR}`);
            console.warn('[aigf4 strict review unavailable]', {
                requestId: request.id,
                model,
                reason,
            });
        };
        return runPreparedStrictReviewAttempt({
            model,
            attemptIndex,
            isFallback,
            editorPrompt: STRICT_REVIEW_EDITOR_PROMPT,
            authoritativePrompt,
            latestUserMessage,
            candidateResponse,
            promptCacheKey,
            signal: request.controller.signal,
            responseFormat: STRICT_REVIEW_RESPONSE_FORMAT,
        }, {
            getReviewHistory: () => getStrictReviewHistory(request, latestUserMessage),
            requestText: request.vpsTurn ? async options => {
                const parent = request.vpsTurn?.receipt;
                if (!parent || (attemptIndex !== 1 && attemptIndex !== 2)) throw Error('TURN_REVIEW_STAGE_INVALID');
                const controller = makeVpsTurnController();
                const job = await runDurableChatStage({
                    parent, phase: attemptIndex === 1 ? 'review-1' : 'review-2',
                    payload: buildVpsCharacterPayload(options), signal: request.controller.signal,
                    stage: controller.stage,
                    verifyContext: async () => {
                        if (!isActiveChatRequest(request) || await digestVpsHistory(memoryManager.peekChatHistory(parent.conversationKey),parent.contextDigestVersion) !== parent.contextDigest) throw Error('TURN_HISTORY_CHANGED');
                    },
                    onPending: () => applyChatRuntimeState('retrying', 'VPS 背景審核中…'),
                });
                const result = decodeVpsCharacterResult(job, options.model);
                if (result.finishReason === 'length') throw Error('Invalid strict review from ' + model + '.');
                return result;
            } : (options)=>generateChatTextWithTimeout(options,undefined,getActiveWorldline(request.conversationKey)?{conversationKey:request.conversationKey,requestId:request.id,stage:'strict-review'}:undefined),
            recordAttempt: attempt => recordStrictReviewAttempt(trace, attempt),
            classifyFailure: error => getStrictReviewAttemptFailure(request, error),
            shouldRethrow: error => request.vpsTurn ? !(error instanceof Error && error.message === 'Invalid strict review from ' + model + '.') : isAbortError(error) && request.controller.signal.aborted,
            onPrepare: () => markChatPerformance('strict-review:prepare', preparationStartedAt),
            onRequestStarted: () => markChatPerformance('strict-review:request-start'),
            onRequestPrepared: prepared => {
                markVeniceRequestAggregate('strict-review:request-meta', model, prepared.messages, attemptIndex, { fallback: isFallback });
                markPromptComponentAccounting('strict-review', [
                    promptComponent('strict-review-editor', STRICT_REVIEW_EDITOR_PROMPT),
                    promptComponent('strict-review-authoritative-context', authoritativePrompt),
                    {
                        name: 'strict-review-history',
                        chars: getVeniceMessageAggregate(prepared.reviewHistory),
                        messages: prepared.reviewHistory.length,
                    },
                    promptComponent('strict-review-user-and-candidate', prepared.candidateAndUser, 1),
                ], prepared.messages.length, 2);
            },
            onResponse: ({ result, messages, reviewStartedAt }) => {
                markChatPerformance('strict-review:request', reviewStartedAt);
                markVeniceRequestAggregate('strict-review:response-meta', result.model, messages, attemptIndex, { fallback: isFallback }, result);
            },
            onParseTiming: parseStartedAt => markChatPerformance('strict-review:parse', parseStartedAt),
            onSuccess: (result, decision) => {
                try {
                    if (trace) markStrictReview(trace, {
                        ran: true,
                        model: result.model || model,
                        decision: decision.decision,
                        attempts: trace.strictReview?.attempts,
                    });
                } catch { /* Strict-review tracing is strictly observational. */ }
                const parsedFormat = /<revision>[\s\S]*<\/revision>/iu.test(result.text)
                    ? 'tagged'
                    : /^\s*\{/u.test(result.text) ? 'json' : 'keep-tag';
                markChatPerformance(`strict-review:decision model=${result.model} attempt=${attemptIndex} retry=${isFallback} fallback=${isFallback} decision=${decision.decision} format=${parsedFormat}`);
                console.info('[aigf4 strict review]', {
                    requestId: request.id,
                    model: result.model,
                    decision: decision.decision,
                    issues: decision.issues,
                    promptTokens: result.promptTokens,
                    completionTokens: result.completionTokens,
                });
            },
            onFailure: handleNonFatalFailure,
        });
    };
    return runReviewPipeline({
        reviewerModels,
        runAttempt,
    });
};

const startStrictReviewShadow = (
    request: ActiveChatRequest,
    latestUserMessage: string,
    candidateText: string,
    mode: 'single' | 'group',
    proposedScene?: RoomSceneState,
    deterministicGroupNarrationViolation?: boolean,
    onRecordUpdate?: (record: JevShadowRecord) => void,
) => startJevShadowEvaluation({
    requestId: String(request.id),
    mode,
    ccMode: request.personaKey === 'cc',
    deterministicGroupNarrationViolation,
    signal: request.controller.signal,
    state: buildReviewState({
        latestUserText: latestUserMessage,
        candidateText,
        mode,
        ccMode: request.personaKey === 'cc',
        personaKey: request.personaKey,
        persona: request.persona,
        room: request.room,
        wardrobe: request.pendingWardrobeState || request.wardrobeState,
        proposedScene,
        recentHistoryText: buildJevRecentHistoryText(
            getStrictReviewHistory(request, latestUserMessage),
            latestUserMessage,
        ),
    }),
    onRecordUpdate,
});

const buildSingleReviewContext = (request: ActiveChatRequest, latestUserMessage: string) => {
    const history = memoryManager.getChatHistory(request.conversationKey);
    const narrator = isWorldlineNarrator(request);
    const establishedNpcNames = narrator ? [] : collectEstablishedNpcNames(
        history,
        request.persona.name,
        latestUserMessage,
    );
    const addressedNpcNames = narrator ? [] : inferNpcSpeakersForTurn(
        latestUserMessage,
        request.persona.name,
        establishedNpcNames,
    );
    const authoritativePrompt = [
        buildChatSystemPrompt(
            request.personaKey,
            request.persona,
            latestUserMessage,
            request.wardrobeState,
            getWardrobeParticipantsForRequest(request, establishedNpcNames),
            true,
            request.conversationKey,
        ),
        request.surpriseEvent
            ? buildSurpriseEventExecutionContract(request.surpriseEvent, request.room)
            : '',
        buildWorldlineRuntimeContext(request.conversationKey,latestUserMessage,request.director),
        isWorldlineNarrator(request)
            ? '' : buildImmediateTurnOwnershipRequirement(request.persona.name, latestUserMessage),
        buildNpcContinuityRequirement(establishedNpcNames),
        buildNpcSpeechRequirement(addressedNpcNames),
    ].filter(Boolean).join('\n\n');
    return { establishedNpcNames, addressedNpcNames, authoritativePrompt };
};

const strictReviewSingleReply = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    candidate: string,
    trace?: GenerationTrace,
) => {
    const { establishedNpcNames, addressedNpcNames, authoritativePrompt } = buildSingleReviewContext(request, latestUserMessage);
    const shadow = request.vpsTurn ? null : startStrictReviewShadow(request, latestUserMessage, candidate, 'single');
    let decision;
    try {
        decision = await requestStrictReviewDecision(
            request,
            latestUserMessage,
            authoritativePrompt,
            `${candidate}\n<wardrobe>${JSON.stringify(request.pendingWardrobeState || request.wardrobeState)}</wardrobe>`,
            trace,
        );
    } catch (error) {
        shadow?.recordGemmaDecision('unavailable');
        throw error;
    }
    shadow?.recordGemmaDecision(decision?.decision || 'unavailable', decision?.issues);
    if (request.vpsTurn && !decision) throw Error('VPS_REVIEW_INVALID');
    return applySingleStrictReview(candidate, decision, revisedResponse => {
        const revisedWardrobe = extractWardrobeEnvelope(
            revisedResponse,
            request.pendingWardrobeState || request.wardrobeState,
            getWardrobeParticipantsForRequest(request, establishedNpcNames),
        );
        let revision = cleanVeniceChatReply(revisedWardrobe.visibleText);
        revision = request.personaKey === 'cc'
            ? normalizeCcCantoneseLeaks(revision)
            : normalizeTraditionalChineseLeaks(revision);
        const lengthRatio = revision.length / Math.max(candidate.length, 1);
        const recentReplies = getRecentAssistantRepliesForPersona(request.conversationKey, false, 8);
        const repeats = recentReplies.some(previous => (
            repliesAreTooSimilar(previous, revision)
            || replyReusesOpeningOrNarrativeBeat(revision, previous)
            || replyReusesCompletedClause(revision, previous)
        ));
        const validNpcSpeech = addressedNpcNames.length === 0
            || request.personaKey === 'cc'
            || replyContainsAttributedNpcSpeech(revision, addressedNpcNames);
        if (
            !revision
            || !revisedWardrobe.hadValidUpdate
            || isInvalidVeniceChatReply(revision)
            || replyBreaksSpeakerOwnership(revision)
            || replyHasUnconfirmedAddressLabel(
                revision,
                latestUserMessage,
                request.persona.name,
                establishedNpcNames,
            )
            || !validNpcSpeech
            || (repeats && !userExplicitlyRequestsContinuation(latestUserMessage))
            || lengthRatio < 0.62
            || lengthRatio > 1.85
        ) {
            console.warn('[aigf4 strict revision rejected]', { requestId: request.id, issues: decision?.issues || [] });
            return null;
        }
        request.pendingWardrobeState = revisedWardrobe.wardrobe;
        return revision;
    });
};

const buildGroupReviewContext = async (request:ActiveChatRequest,latestUserMessage:string) => {
    const { buildGroupSystemPrompt } = await loadGroupChatPromptModule();
    return [
        buildGroupSystemPrompt(
            request.room!,
            latestUserMessage,
            formatSessionMemoryPrompt(request.conversationKey),
        ),
        request.surpriseEvent
            ? buildSurpriseEventExecutionContract(request.surpriseEvent, request.room)
            : '',
        buildWorldlineRuntimeContext(request.conversationKey,latestUserMessage,request.director),
        'STRICT REVISION FORMAT: revised_response must contain one complete <chat>...</chat><scene>...</scene><npc_candidate>...</npc_candidate> envelope.',
    ].join('\n\n');

};

const strictReviewGroupReply = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    candidate: GroupGenerationResult,
    trace?: GenerationTrace,
) => {
    if (!request.room) return candidate;
    const serializedCandidate = serializeGroupGenerationForReview(candidate);
    const authoritativePrompt=await buildGroupReviewContext(request,latestUserMessage);

    let researchRecordId = '';
    let researchModule: Awaited<ReturnType<typeof loadResearchCaptureModule>> | null = null;
    let researchBaseSave: Promise<boolean> | null = null;
    const queueResearchPatch = (
        buildPatch: (module: Awaited<ReturnType<typeof loadResearchCaptureModule>>) => unknown,
    ) => {
        if (!researchRecordId || !researchModule) return;
        const module = researchModule;
        const recordId = researchRecordId;
        void (researchBaseSave || Promise.resolve(true))
            .then(() => module.patchResearchTurnRecord(
                recordId,
                buildPatch(module) as Parameters<typeof module.patchResearchTurnRecord>[1],
            ))
            .catch(error => {
                console.warn('[aigf4 research capture patch]', {
                    requestId: request.id,
                    message: error instanceof Error ? error.message : String(error),
                });
            });
    };

    if (!request.vpsTurn && isResearchCaptureEnabledForTurn()) {
        try {
            researchModule = await loadResearchCaptureModule();
            researchRecordId = researchModule.createResearchRecordId();
            const reviewState = buildReviewState({
                latestUserText: latestUserMessage,
                candidateText: serializedCandidate,
                mode: 'group',
                ccMode: false,
                personaKey: request.personaKey,
                persona: request.persona,
                room: request.room,
                wardrobe: request.pendingWardrobeState || request.wardrobeState,
                proposedScene: candidate.scene,
                recentHistoryText: buildJevRecentHistoryText(
                    getStrictReviewHistory(request, latestUserMessage),
                    latestUserMessage,
                ),
            });
            const researchRecord = researchModule.buildResearchGroupTurnRecord({
                recordId: researchRecordId,
                requestId: String(request.id),
                conversationKey: request.conversationKey,
                userMessage: latestUserMessage,
                reviewState,
                candidate,
            });
            researchBaseSave = researchModule.saveResearchTurnRecord(researchRecord)
                .catch(error => {
                    console.warn('[aigf4 research capture save]', {
                        requestId: request.id,
                        message: error instanceof Error ? error.message : String(error),
                    });
                    return false;
                });
        } catch (error) {
            researchModule = null;
            researchRecordId = '';
            researchBaseSave = null;
            console.warn('[aigf4 research capture init]', {
                requestId: request.id,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const shadow = request.vpsTurn ? null : startStrictReviewShadow(
        request,
        latestUserMessage,
        serializedCandidate,
        'group',
        candidate.scene,
        groupNarrationUsesFirstPerson(candidate),
        researchRecordId ? (record: JevShadowRecord) => {
            queueResearchPatch(module => module.buildJevResearchPatch(record));
        } : undefined,
    );
    let decision;
    try {
        decision = await requestStrictReviewDecision(
            request,
            latestUserMessage,
            authoritativePrompt,
            serializedCandidate,
            trace,
        );
    } catch (error) {
        shadow?.recordGemmaDecision('unavailable');
        queueResearchPatch(module => module.buildFailedResearchPatch('strict-review', error));
        throw error;
    }
    shadow?.recordGemmaDecision(decision?.decision || 'unavailable', decision?.issues);
    if(request.vpsTurn&&!decision)throw Error('VPS_REVIEW_INVALID');
    const reviewed = applyGroupStrictReview(candidate, decision, revisedResponse => {
        try {
            const revision = normalizeGroupGenerationTraditional(
                parseGroupGeneration(
                    revisedResponse,
                    request.room!,
                    getGroupFallbackMemberId(request, latestUserMessage),
                ),
            );
            if (groupNarrationUsesFirstPerson(revision)) return null;
            if (
                request.surpriseEvent
                && !surpriseEventReplyCoversParticipants(request.surpriseEvent, request.room!, revision)
            ) return null;
            const namedMember = getDirectlyNamedRoomMember(request, latestUserMessage);
            if (namedMember && !revision.segments.some(segment => (
                segment.type === 'dialogue' && segment.speakerId === namedMember.id
            ))) return null;
            const recentReplies = getRecentAssistantRepliesForPersona(request.conversationKey, false, 8);
            if (recentReplies.some(previous => repliesAreTooSimilar(previous, revision.text))
                && !userExplicitlyRequestsContinuation(latestUserMessage)) return null;
            return {
                ...revision,
                scene: {
                    ...revision.scene,
                    memberStates: candidate.scene.memberStates || revision.scene.memberStates,
                },
                npcCandidate: revision.npcCandidate || candidate.npcCandidate,
            };
        } catch (error) {
            console.warn('[aigf4 strict group revision rejected]', {
                requestId: request.id,
                reason: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    });

    queueResearchPatch(module => module.buildCompletedResearchPatch({
        final: reviewed,
        gemma: {
            decision: decision?.decision || 'unavailable',
            issueCodes: decision?.issues || [],
            revisedResponse: decision?.decision === 'revise' ? decision.revisedResponse : undefined,
            revisionAccepted: decision?.decision === 'revise' ? reviewed !== candidate : undefined,
        },
    }));

    return reviewed;
};

const runCharacterChatGeneration = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
): Promise<string | GroupGenerationResult> => {
    if(request.vpsTurn&&request.room)return runGroupTurnAdapter({
        generateCandidate:()=>runRoomConversationGeneration(request,latestUserMessage,[request.vpsTurn!.model]),
        reviewCandidate:candidate=>strictReviewGroupReply(request,latestUserMessage,candidate),
    });
    if (request.vpsTurn) return runSingleTurnAdapter({
        generateCandidate: () => runConversationGeneration(request, latestUserMessage, [request.vpsTurn!.model], false),
        reviewCandidate: candidate => strictReviewSingleReply(request, latestUserMessage, candidate),
    });
    const models = buildCharacterModelRoute(chatModelSettings, request.personaKey === 'cc');
    if (request.room) {
        const trace = createGenerationTrace(String(request.id), 'group', request.conversationKey);
        return runGroupTurnAdapter(createTracedGroupTurnDependencies(trace, {
            generateCandidate: () => runRoomConversationGeneration(request, latestUserMessage, models, trace),
            reviewCandidate: candidate => strictReviewGroupReply(request, latestUserMessage, candidate, trace),
        }, {
            isAbortError,
        }));
    }
    const trace = createGenerationTrace(String(request.id), 'single', request.conversationKey);
    return runSingleTurnAdapter(createTracedSingleTurnDependencies(trace, {
        generateCandidate: () => runConversationGeneration(request, latestUserMessage, models, false, trace),
        reviewCandidate: candidate => strictReviewSingleReply(request, latestUserMessage, candidate, trace),
    }, {
        isAbortError,
    }));
};

const runAssistantChatGeneration = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    model: string,
) => {
    return runConversationGeneration(request, latestUserMessage, [model], true);
};

let godModeGenerationModuleLoad: Promise<typeof import('./features/godModeGeneration.js')> | null = null;

const loadGodModeGenerationModule = () => {
    godModeGenerationModuleLoad ??= import('./features/godModeGeneration.js');
    return godModeGenerationModuleLoad;
};

const runGodModeGeneration = async (
    request: ActiveChatRequest,
    latestUserInstruction: string,
): Promise<{ visibleText: string; personaUpdate: string | null }> => {
    const { runGodModeGeneration: runColdGodModeGeneration } = await loadGodModeGenerationModule();
    return runColdGodModeGeneration({
        id: request.id,
        mode: request.mode,
        startedAt: request.startedAt,
        persona: request.persona,
        signal: request.controller.signal,
    }, latestUserInstruction, {
        models: [VENICE_GOD_MODEL, VENICE_GOD_FALLBACK_MODEL],
        recentMessages: getRecentGodModeMessages(latestUserInstruction),
        soulMemory: formatPersonaMemoryPrompt(request.persona, 'soul'),
        episodicMemory: formatPersonaMemoryPrompt(request.persona, 'memory'),
        setRuntimeState: applyChatRuntimeState,
        runModel: modelRequest => generateVeniceText(modelRequest),
        isAbortError,
    });
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
        if (request.room && request.roomMemberId) {
            roomManager.updateMember(request.room.id, request.roomMemberId, {
                persona: { prompt: mergedPrompt },
            });
            if (currentRoom?.id === request.room.id) currentRoom = roomManager.getRoom(request.room.id) || currentRoom;
        } else {
            memoryManager.updatePersona(request.personaKey, { prompt: mergedPrompt });
        }
        if (currentConversationKey === request.conversationKey && currentPersona) {
            currentPersona.prompt = mergedPrompt;
        }

        const godModeContent = { text: result.visibleText };
        if (currentConversationKey === request.conversationKey) {
            appendMessage(godModeContent, 'god-mode');
        }
        godModeHistory.push({ role: 'model', content: godModeContent });
        finishChatRequest(request);
        completeChatPerformanceTurn('response:god-mode-visible');
    } catch (error) {
        if (isAbortError(error)) {
            finishChatRequest(request);
            cancelChatPerformanceTurn('send:aborted');
            return;
        }
        console.error('God Mode response error:', error);
        if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
            finishChatRequest(request);
            cancelChatPerformanceTurn('send:auth-error');
            handleAuthRequired();
            return;
        }
        const message = 'God Mode 這次沒有順利套用人格補充，請再試一次。';

        finishChatRequest(request, 'error');
        if (currentConversationKey === request.conversationKey) {
            showError(message);
            appendMessage({ text: `[系統] ${message}` }, 'system');
        }
        cancelChatPerformanceTurn('send:error');
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
    if (!currentConversationKey || activeCharacterPhotoProposalId === proposalId) return;
    updatePhotoProposal(currentConversationKey, proposalId, {
        status: 'declined',
        error: undefined,
    });
    refreshPhotoProposalCard(proposalId);
};

const approveCharacterPhoto = async (proposalId: string) => {
    if (!currentConversationKey || activeCharacterPhotoProposalId) return;
    const conversationKey = currentConversationKey;
    const found = findPhotoProposalMessage(conversationKey, proposalId);
    const proposal = found?.message.content.photoProposal;
    const persona = proposal ? resolvePhotoProposalPersona(proposal) : null;
    if (!persona || !proposal || proposal.status === 'generated' || proposal.status === 'declined') return;

    activeCharacterPhotoProposalId = proposalId;
    const controller = new AbortController();
    characterPhotoRequestController = controller;
    updatePhotoProposal(conversationKey, proposalId, { status: 'generating', error: undefined });
    refreshPhotoProposalCard(proposalId);

    try {
        let sourceImageBase64: string | null = null;
        if (proposal.useAvatarReference) {
            sourceImageBase64 = await prepareCharacterAvatarReference(persona);
            if (!sourceImageBase64) throw new Error('無法讀取角色頭像，請更換頭像後再試。');
        }

        const mode: VeniceImageMode = sourceImageBase64 ? 'edit' : 'generate';
        await loadImageModels(mode);
        const preferredModel = imageModels[mode].find(item => item.id === proposal.modelId)
            || getPreferredCharacterPhotoModel(mode);
        if (!preferredModel) throw new Error('目前沒有可用的 Venice 圖片模型。');
        const generationSeed = mode === 'generate'
            ? proposal.seed ?? resolveImageSeedForRequest(imageSeed, imageSeedLock.checked)
            : undefined;
        const pixelSize = PIXEL_IMAGE_DIMENSIONS[proposal.aspectRatio] || PIXEL_IMAGE_DIMENSIONS['3:4'];
        const [
            { runWithTransientImageRetry, validateGeneratedImageBlob },
            { buildCharacterPhotoModelLadder, inferCharacterPhotoContentMode },
        ] = await Promise.all([
            import('./features/characterPhotoImageReliability.js'),
            import('./features/characterPhotoImagePolicy.js'),
        ]);
        const contentMode = proposal.contentMode
            || inferCharacterPhotoContentMode(proposal.prompt, proposal.scenePrompt, proposal.favoriteScenePrompt);
        const modelLadder = buildCharacterPhotoModelLadder({
            mode,
            models: imageModels[mode],
            primaryModelId: preferredModel.id,
            contentMode,
            limit: 3,
        });
        if (!modelLadder.length) throw new Error('目前沒有可用的 Venice 圖片模型。');

        let model: VeniceImageModelSummary | null = null;
        let blob: Blob | null = null;
        let aspectRatio: string | undefined;
        let resolution: string | undefined;
        const failedModels: string[] = [];

        for (let modelIndex = 0; modelIndex < modelLadder.length; modelIndex += 1) {
            const candidateModel = modelLadder[modelIndex];
            const supportedRatios = candidateModel.constraints.aspectRatios || [];
            const candidateAspectRatio = supportedRatios.includes(proposal.aspectRatio)
                ? proposal.aspectRatio
                : candidateModel.constraints.defaultAspectRatio || supportedRatios[0];
            const candidateResolution = candidateModel.constraints.defaultResolution
                || candidateModel.constraints.resolutions?.[0];
            const requestImage = () => requestVeniceImage({
                mode,
                model: candidateModel.id,
                prompt: proposal.prompt,
                negativePrompt: mode === 'generate'
                    ? 'unintended duplicated bodies, cloned face, malformed anatomy, deformed hands, distorted face, text, captions, interface, logo, watermark, blurry, low quality'
                    : undefined,
                sourceImageBase64: sourceImageBase64 || undefined,
                aspectRatio: mode === 'edit' || supportedRatios.length > 0 ? candidateAspectRatio : undefined,
                resolution: candidateResolution,
                width: mode === 'generate' && supportedRatios.length === 0 ? pixelSize.width : undefined,
                height: mode === 'generate' && supportedRatios.length === 0 ? pixelSize.height : undefined,
                variants: 1,
                steps: mode === 'generate' ? candidateModel.constraints.steps?.default : undefined,
                seed: generationSeed,
                adultConfirmed: true,
                signal: controller.signal,
            });

            try {
                const result = modelIndex === 0
                    ? (await runWithTransientImageRetry(requestImage, {
                        signal: controller.signal,
                        onRetry: () => {
                            updatePhotoProposal(conversationKey, proposalId, {
                                status: 'generating',
                                error: '首選圖片模型暫時繁忙，正在自動重試一次…',
                            });
                            if (currentConversationKey === conversationKey) refreshPhotoProposalCard(proposalId);
                        },
                    })).result
                    : await requestImage();
                const candidateBlob = result.blobs[0];
                if (!candidateBlob) throw new Error('Venice 沒有傳回照片。');
                await validateGeneratedImageBlob(candidateBlob);
                if (controller.signal.aborted) {
                    throw new DOMException('Image generation aborted.', 'AbortError');
                }

                model = candidateModel;
                blob = candidateBlob;
                aspectRatio = candidateAspectRatio;
                resolution = candidateResolution;
                break;
            } catch (error) {
                if (isAbortError(error)) throw error;
                failedModels.push(candidateModel.id);
                const nextModel = modelLadder[modelIndex + 1];
                console.warn('Character photo image model failed; advancing fallback ladder.', {
                    contentMode,
                    mode,
                    failedModel: candidateModel.id,
                    nextModel: nextModel?.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                if (!nextModel) {
                    throw new Error(
                        `已自動嘗試 ${modelLadder.length} 個圖片模型（${failedModels.join(' → ')}），仍未能產生有效照片。請稍後再試。`,
                        { cause: error instanceof Error ? error : undefined },
                    );
                }
                updatePhotoProposal(conversationKey, proposalId, {
                    status: 'generating',
                    error: `圖片結果異常，正在自動轉用 ${nextModel.name}…`,
                });
                if (currentConversationKey === conversationKey) refreshPhotoProposalCard(proposalId);
            }
        }

        if (!blob || !model) {
            throw new Error('所有圖片模型都未能產生有效照片，請稍後再試。');
        }

        const assetId = `character-photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        await (await loadPhotoStoreModule()).saveCharacterPhotoAsset({
            id: assetId,
            personaKey: conversationKey,
            blob,
            prompt: proposal.prompt,
            createdAt: Date.now(),
        });
        const price = resolution && typeof model.resolutionPrices[resolution] === 'number'
            ? model.resolutionPrices[resolution]
            : model.priceUsd;
        updatePhotoProposal(conversationKey, proposalId, {
            status: 'generated',
            modelId: model.id,
            modelName: model.name,
            resolution,
            seed: generationSeed,
            estimatedPriceUsd: price,
            error: undefined,
        });

        const photoContent: Content = {
            text: proposal.caption,
            imageAssetId: assetId,
            imagePrompt: proposal.prompt,
            imageGeneration: {
                mode,
                modelId: model.id,
                modelName: model.name,
                aspectRatio: aspectRatio || proposal.aspectRatio,
                resolution,
                seed: generationSeed,
                useAvatarReference: proposal.useAvatarReference,
                identityMode: proposal.identityMode,
            },
        };
        memoryManager.addMessage(conversationKey, 'model', photoContent, { speakerId: proposal.senderMemberId });
        if (currentConversationKey === conversationKey) {
            refreshPhotoProposalCard(proposalId);
            appendMessage(photoContent, 'bot', { speakerId: proposal.senderMemberId });
            updateAlbumState();
        }
    } catch (error) {
        const rawMessage = error instanceof Error ? error.message : '這次照片生成失敗。';
        const message = isAbortError(error)
            ? '照片生成已停止，可以按「重試生成」再試。'
            : /(?:demand|too many requests|rate[ -]?limit|overload|busy|capacity|temporar|try again|unavailable|service unavailable)/iu.test(rawMessage)
                ? '圖片模型目前需求過高；系統已自動重試一次但仍未成功。請稍後按「重試生成」。'
                : rawMessage;
        updatePhotoProposal(conversationKey, proposalId, { status: 'failed', error: message });
        if (currentConversationKey === conversationKey) {
            refreshPhotoProposalCard(proposalId);
            if (rawMessage === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        }
    } finally {
        activeCharacterPhotoProposalId = null;
        if (characterPhotoRequestController === controller) characterPhotoRequestController = null;
        if (currentConversationKey === conversationKey) refreshPhotoProposalCard(proposalId);
    }
};

function findSurpriseEventMessage(conversationKey: string, proposalId: string) {
    const history = memoryManager.getChatHistory(conversationKey);
    const messageIndex = history.findIndex(message => message.content.surpriseEvent?.id === proposalId);
    return messageIndex >= 0 ? { history, messageIndex, message: history[messageIndex] } : null;
}

const getSurpriseEventSelectableMembers = () => {
    if (currentRoom) {
        const presentIds = new Set(currentRoom.scene.presentMemberIds);
        return currentRoom.members
            .filter(member => presentIds.has(member.id))
            .map(member => ({ id: member.id, persona: resolveRoomMemberAvatarPersona(member) }));
    }
    return currentPersona && currentPersonaKey
        ? [{ id: currentPersonaKey, persona: currentPersona }]
        : [];
};

const syncSurpriseEventMemberSelection = () => {
    const inputs = Array.from(
        surpriseEventMemberList.querySelectorAll<HTMLInputElement>('input[data-surprise-event-member-id]'),
    );
    const selectedCount = inputs.filter(input => input.checked).length;
    surpriseEventSelectAll.checked = inputs.length > 0 && selectedCount === inputs.length;
    surpriseEventSelectAll.indeterminate = selectedCount > 0 && selectedCount < inputs.length;
    surpriseEventMemberCount.textContent = `${selectedCount} / ${inputs.length}`;
    confirmSurpriseEventOptionsBtn.disabled = selectedCount === 0;
    surpriseEventOptionsError.textContent = selectedCount === 0 ? '請至少選擇一位參與角色。' : '';
};

const renderSurpriseEventMemberOptions = (preferredIds: string[]) => {
    const members = getSurpriseEventSelectableMembers();
    const availableIds = new Set(members.map(member => member.id));
    const selectedIds = new Set(preferredIds.filter(id => availableIds.has(id)));
    if (selectedIds.size === 0) members.forEach(member => selectedIds.add(member.id));
    surpriseEventMemberList.innerHTML = '';
    members.forEach(({ id, persona }) => {
        const label = document.createElement('label');
        label.className = 'surprise-event-member-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedIds.has(id);
        checkbox.dataset.surpriseEventMemberId = id;
        checkbox.addEventListener('change', syncSurpriseEventMemberSelection);
        const avatar = document.createElement('span');
        avatar.className = 'room-member-avatar';
        if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
            const image = document.createElement('img');
            image.src = persona.avatarUrl;
            image.alt = persona.name;
            avatar.appendChild(image);
        } else {
            avatar.textContent = persona.emoji || '?';
        }
        const copy = document.createElement('span');
        copy.className = 'surprise-event-member-copy';
        const name = document.createElement('strong');
        name.textContent = persona.name;
        const status = document.createElement('small');
        status.textContent = '目前在場';
        copy.append(name, status);
        label.append(checkbox, avatar, copy);
        surpriseEventMemberList.appendChild(label);
    });
    syncSurpriseEventMemberSelection();
};

function closeSurpriseEventOptions() {
    surpriseEventOptionsModal.classList.add('hidden');
    surpriseEventReplacingProposalId = null;
    surpriseEventOptionsError.textContent = '';
}

function openSurpriseEventOptions(replacingProposalId?: string) {
    if (USES_VENICE_PROXY_AUTH && !isUnlocked) {
        handleAuthRequired('請先輸入密碼後再抽取事件牌。');
        return;
    }
    if (activeChatRequest || !currentPersona || !currentPersonaKey || !currentConversationKey || isGodModeActive) return;
    const existing = replacingProposalId
        ? findSurpriseEventMessage(currentConversationKey, replacingProposalId)?.message.content.surpriseEvent
        : undefined;
    surpriseEventReplacingProposalId = replacingProposalId || null;
    const mode = existing?.contentMode || 'non-sexual';
    surpriseEventOptionsModal
        .querySelectorAll<HTMLInputElement>('input[name="surprise-event-content-mode"]')
        .forEach(input => { input.checked = input.value === mode; });
    renderSurpriseEventMemberOptions(existing?.involvedMemberIds || []);
    surpriseEventOptionsError.textContent = '';
    moreOptionsMenu.classList.add('hidden');
    surpriseEventOptionsModal.classList.remove('hidden');
}

function confirmSurpriseEventOptions() {
    const contentMode = surpriseEventOptionsModal
        .querySelector<HTMLInputElement>('input[name="surprise-event-content-mode"]:checked')
        ?.value as SurpriseEventContentMode | undefined;
    const participantIds = Array.from(
        surpriseEventMemberList.querySelectorAll<HTMLInputElement>('input[data-surprise-event-member-id]:checked'),
    ).map(input => input.dataset.surpriseEventMemberId!).filter(Boolean);
    if (!contentMode || participantIds.length === 0) {
        surpriseEventOptionsError.textContent = '請選擇事件類型及至少一位參與角色。';
        return;
    }
    const replacingProposalId = surpriseEventReplacingProposalId || undefined;
    closeSurpriseEventOptions();
    void drawSurpriseEventCard({ contentMode, participantIds }, replacingProposalId);
}

function updateSurpriseEventProposal(
    conversationKey: string,
    proposalId: string,
    updates: Partial<SurpriseEventProposal>,
) {
    const found = findSurpriseEventMessage(conversationKey, proposalId);
    const proposal = found?.message.content.surpriseEvent;
    if (!found || !proposal) return null;
    Object.assign(proposal, updates);
    memoryManager.setChatHistory(conversationKey, found.history);
    if (currentConversationKey === conversationKey) refreshSurpriseEventCard(proposalId);
    return proposal;
}

function completeActiveSurpriseEvents(conversationKey: string) {
    const history = memoryManager.getChatHistory(conversationKey);
    const completedIds: string[] = [];
    history.forEach(message => {
        const proposal = message.content.surpriseEvent;
        if (proposal?.status !== 'active') return;
        proposal.status = 'completed';
        proposal.error = undefined;
        completedIds.push(proposal.id);
    });
    if (completedIds.length === 0) return;
    memoryManager.setChatHistory(conversationKey, history);
    if (currentConversationKey === conversationKey) completedIds.forEach(refreshSurpriseEventCard);
}

function refreshSurpriseEventCard(proposalId: string) {
    if (!currentConversationKey) return;
    const proposal = findSurpriseEventMessage(currentConversationKey, proposalId)?.message.content.surpriseEvent;
    const currentCard = chatContainer.querySelector<HTMLElement>(`[data-surprise-event-id="${CSS.escape(proposalId)}"]`);
    if (!proposal || !currentCard) return;
    currentCard.replaceWith(createSurpriseEventCard(proposal));
}

let surpriseEventGenerationModuleLoad: Promise<typeof import('./features/surpriseEventGeneration.js')> | null = null;

const loadSurpriseEventGenerationModule = () => {
    surpriseEventGenerationModuleLoad ??= import('./features/surpriseEventGeneration.js');
    return surpriseEventGenerationModuleLoad;
};

async function drawSurpriseEventCard(
    options: SurpriseEventDrawOptions,
    replacingProposalId?: string,
) {
    if (USES_VENICE_PROXY_AUTH && !isUnlocked) {
        handleAuthRequired('請先輸入密碼後再抽取事件牌。');
        return;
    }
    if (activeChatRequest || !currentPersona || !currentPersonaKey || !currentConversationKey || isGodModeActive) return;
    const conversationKey = currentConversationKey;
    completeActiveSurpriseEvents(conversationKey);
    if (replacingProposalId) {
        updateSurpriseEventProposal(conversationKey, replacingProposalId, { status: 'declined', error: undefined });
    }
    moreOptionsMenu.classList.add('hidden');
    const request = beginChatRequest(currentPersonaKey, currentPersona, 'event', conversationKey);
    try {
        const { generateSurpriseEvent } = await loadSurpriseEventGenerationModule();
        const proposal = await generateSurpriseEvent({
            id: request.id,
            personaKey: request.personaKey,
            conversationKey: request.conversationKey,
            persona: request.persona,
            room: request.room,
            roomMemberId: request.roomMemberId,
            signal: request.controller.signal,
        }, options, {
            history: memoryManager.getChatHistory(request.conversationKey),
            recentMessages: collectRecentMessagesWithinBudget(getRecentChatMessages(
                request.conversationKey,
                undefined,
                false,
                request.persona,
                request.room,
            ), 14000, 14),
            chatModelSettings,
            timeoutMs: SURPRISE_EVENT_ATTEMPT_TIMEOUT_MS,
            setRuntimeState: applyChatRuntimeState,
            runModel: async (modelRequest, timeoutMs) => (
                await generateChatTextWithTimeout({
                    model: modelRequest.model,
                    messages: modelRequest.messages,
                    temperature: modelRequest.temperature,
                    topP: modelRequest.topP,
                    repetitionPenalty: modelRequest.repetitionPenalty,
                    responseFormat: modelRequest.responseFormat as Parameters<typeof generateChatTextWithTimeout>[0]['responseFormat'],
                    signal: modelRequest.signal,
                }, timeoutMs)
            ).text,
            normalizeText: normalizeTraditionalChineseLeaks,
            isAbortError,
        });
        if (!isActiveChatRequest(request)) return;
        const content: Content = { surpriseEvent: proposal };
        memoryManager.addMessage(conversationKey, 'system', content);
        if (currentConversationKey === conversationKey) appendMessage(content, 'system');
        finishChatRequest(request);
        renderPersonaList();
    } catch (error) {
        if (isAbortError(error)) {
            finishChatRequest(request);
            return;
        }
        finishChatRequest(request, 'error');
        if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
            handleAuthRequired();
            return;
        }
        showError('這次未能抽取事件牌，請再試一次。');
    }
}

function declineSurpriseEvent(proposalId: string) {
    if (!currentConversationKey || activeChatRequest) return;
    updateSurpriseEventProposal(currentConversationKey, proposalId, { status: 'declined', error: undefined });
}

const buildSurpriseEventDirectorCue = (proposal: SurpriseEventProposal, room?: ChatRoom) => {
    const participantNames = room
        ? proposal.involvedMemberIds
            .map(memberId => room.members.find(member => member.id === memberId)?.persona.name)
            .filter(Boolean)
            .join(', ')
        : currentPersona?.name || '';
    return [
        '[INTERNAL SURPRISE EVENT DIRECTOR CUE - this is not user dialogue and must never be mentioned]',
        `Event: ${proposal.title}`,
        `Hook: ${proposal.hook}`,
        `Setup: ${proposal.setup}`,
        `Content mode: ${proposal.contentMode === 'nsfw'
            ? 'EXPLICIT ADULT 18+ / NSFW'
            : proposal.contentMode === 'non-sexual' ? 'NON-SEXUAL / NOT NSFW' : 'FOLLOW THE EXISTING CARD'}`,
        `Primary participating characters: ${participantNames}`,
        `Direction: ${proposal.openingInstruction}`,
        buildSurpriseEventExecutionContract(proposal, room),
        'Only the listed primary participating characters may actively initiate or speak in the event opening. Other fixed room members remain in the background unless the user explicitly brings them in.',
        'Begin the event now as a seamless continuation of the current conversation. Let the relevant character take the first concrete initiative, preserve exact current continuity, and leave the consequential choice or response to the user. Do not summarize the card, announce an event, explain rules, or complete the whole plot in one response.',
    ].join('\n');
};

async function startSurpriseEvent(proposalId: string) {
    if (USES_VENICE_PROXY_AUTH && !isUnlocked) {
        handleAuthRequired('請先輸入密碼後再開始事件。');
        return;
    }
    if (activeChatRequest || !currentConversationKey || !currentPersonaKey || !currentPersona || isGodModeActive) return;
    const conversationKey = currentConversationKey;
    const proposal = findSurpriseEventMessage(conversationKey, proposalId)?.message.content.surpriseEvent;
    if (!proposal || !['pending', 'failed'].includes(proposal.status)) return;
    updateSurpriseEventProposal(conversationKey, proposalId, { status: 'starting', error: undefined });
    const request = beginChatRequest(currentPersonaKey, currentPersona, 'character', conversationKey);
    request.surpriseEvent = { ...proposal, status: 'starting' };
    await getResponse(request, buildSurpriseEventDirectorCue(proposal, currentRoom || undefined));
}

const updateRelationshipPulseAfterTurn = (
    request: ActiveChatRequest,
    triggeringMessage: string,
    generated: string | GroupGenerationResult,
) => {
    const responseText = typeof generated === 'string' ? generated : generated.text;
    const relationshipInput = request.surpriseEvent?.hook || triggeringMessage;
    if (!request.room) {
        const latestPersona = memoryManager.getPersona(request.personaKey) || request.persona;
        const relationshipState = advanceRelationshipState(
            latestPersona,
            relationshipInput,
            responseText,
            request.surpriseEvent?.relationshipEffect,
        );
        memoryManager.updatePersona(request.personaKey, { relationshipState });
        request.persona.relationshipState = relationshipState;
        if (currentConversationKey === request.conversationKey && currentPersona) {
            currentPersona.relationshipState = relationshipState;
        }
        return;
    }

    const speakingMemberIds = typeof generated === 'string'
        ? []
        : generated.segments.flatMap(segment => segment.type === 'dialogue' && segment.speakerId ? [segment.speakerId] : []);
    const targetIds = new Set([
        ...speakingMemberIds,
        ...(request.surpriseEvent?.involvedMemberIds || []),
    ]);
    roomManager.updateRoom(request.room.id, room => {
        room.members.forEach(member => {
            if (!targetIds.has(member.id)) return;
            member.persona.relationshipState = advanceRelationshipState(
                member.persona,
                relationshipInput,
                responseText,
                request.surpriseEvent?.involvedMemberIds.includes(member.id)
                    ? request.surpriseEvent.relationshipEffect
                    : undefined,
            );
        });
    });
    if (currentRoom?.id === request.room.id) refreshCurrentRoom();
};

const rememberStartedSurpriseEvent = (request: ActiveChatRequest) => {
    const proposal = request.surpriseEvent;
    if (!proposal) return;
    const summary = `${proposal.setup} 事件已由角色自然帶入對話，後續發展及結果以之後實際聊天為準。`;
    if (request.room) {
        roomManager.addEpisodicMemories(request.room.id, [{
            kind: 'event',
            title: `驚喜事件：${proposal.title}`,
            summary,
            participants: proposal.involvedMemberIds,
            roleplayOnly: true,
        }]);
        if (currentRoom?.id === request.room.id) refreshCurrentRoom();
    } else {
        memoryManager.addPersonaMemory(request.personaKey, 'memory', {
            kind: 'event',
            title: `驚喜事件：${proposal.title}`,
            summary,
            originalText: proposal.hook,
        });
    }
    updateSurpriseEventProposal(request.conversationKey, proposal.id, {
        status: 'active',
        error: undefined,
    });
};

type ChatFailureDiagnostic = {
    code: string;
    detail: string;
};

const sanitizeChatFailureDetail = (error: unknown) => {
    const raw = error instanceof Error ? error.message : String(error || 'Unknown error');
    const withoutSecrets = raw
        .replace(/Bearer\s+\S+/giu, 'Bearer [hidden]')
        .replace(/(?:sk-|VENICE_INFERENCE_KEY_)[A-Za-z0-9_-]{12,}/gu, '[hidden]');
    const withoutModelNames = [
        ...Object.values(chatModelSettings),
        ...Object.values(DEFAULT_CHAT_MODEL_SETTINGS),
    ].filter(Boolean).reduce(
        (text, model) => text.replace(new RegExp(escapeRegExp(model), 'giu'), '聊天服務'),
        withoutSecrets,
    );
    return withoutModelNames.replace(/\s+/gu, ' ').trim().slice(0, 220);
};

const diagnoseChatFailure = (error: unknown, isGroup: boolean): ChatFailureDiagnostic => {
    const prefix = isGroup ? 'GROUP' : 'CHAT';
    const detail = sanitizeChatFailureDetail(error);

    if (detail === CHAT_MODEL_TIMEOUT_ERROR || /timed?\s*out|timeout|504/iu.test(detail)) {
        return { code: `${prefix}_TIMEOUT`, detail: '聊天服務在等待時間內未完成回覆。' };
    }
    if (/quota|storage|儲存空間|localStorage|exceeded/iu.test(detail)) {
        return { code: `${prefix}_STORAGE`, detail: '手機瀏覽器儲存空間不足，群組狀態未能完整寫入。' };
    }
    if (/429|rate.?limit|too many requests/iu.test(detail)) {
        return { code: `${prefix}_RATE_LIMIT`, detail: '聊天服務暫時限制了請求頻率。' };
    }
    if (/failed to fetch|network|502|503|upstream|connection/iu.test(detail)) {
        return { code: `${prefix}_NETWORK`, detail: '手機與聊天服務之間的連線失敗。' };
    }
    if (/context|token|payload|too large|413/iu.test(detail)) {
        return { code: `${prefix}_CONTEXT`, detail: '這次送出的對話上下文過大。' };
    }
    if (/invalid request parameters?|invalid parameters?|bad request|\b400\b/iu.test(detail)) {
        return { code: `${prefix}_REQUEST`, detail: '聊天服務拒絕了其中一個請求參數。' };
    }
    if (/repeat|similar|repetiti/iu.test(detail)) {
        return { code: `${prefix}_REPETITION`, detail: '回覆與近期內容過度相似，重試後仍未通過。' };
    }
    if (isGroup && /valid member dialogue|group reply|json|schema|speaker|segment|format/iu.test(detail)) {
        return { code: 'GROUP_FORMAT', detail: '群組回覆格式不完整，系統未能辨認發言者。' };
    }

    return {
        code: `${prefix}_UNKNOWN`,
        detail: detail || '瀏覽器沒有提供更多技術資料。',
    };
};

const formatChatFailureMessage = (diagnostic: ChatFailureDiagnostic) => (
    `這次未能完成回覆（錯誤代碼：${diagnostic.code}）。${diagnostic.detail} 請把這段錯誤告訴我。`
);

const getResponse = async (
    request: ActiveChatRequest,
    triggeringMessage: string,
    assistantModel?: string,
) => {
    hideError();

    try {
        if (request.mode === 'photo' || (request.mode === 'character' && request.characterPhotoRequest)) {
            const result = await buildCharacterPhotoProposal(request, triggeringMessage);
            if (!isActiveChatRequest(request)) return;
            const botContent: Content = { text: result.text, photoProposal: result.proposal };
            const persistStartedAt = performance.now();
            memoryManager.addMessage(request.conversationKey, 'model', botContent, {
                speakerId: request.photoSenderMemberId,
            });
            markChatPerformance('response:final-persist', persistStartedAt);
            if (currentConversationKey === request.conversationKey) {
                const renderStartedAt = performance.now();
                appendMessage(botContent, 'bot', {
                    speakerId: request.photoSenderMemberId,
                });
                markChatPerformance('response:final-render', renderStartedAt);
            }
            finishChatRequest(request);
            completeChatPerformanceTurn('response:photo-proposal-visible');
            schedulePersonaListRefreshAfterPaint();
            return;
        }

        const generated = request.mode === 'assistant'
            ? await runAssistantChatGeneration(request, triggeringMessage, assistantModel || VENICE_ASSISTANT_MODEL)
            : await runCharacterChatGeneration(request, triggeringMessage);
        if (!isActiveChatRequest(request)) return;
        clearAssistantStreamPreview(request);

        const botContent: Content = typeof generated === 'string'
            ? {
                text: generated,
                wardrobeState: request.mode === 'character'
                    ? normalizeWardrobeState(request.pendingWardrobeState || request.wardrobeState)
                    : undefined,
            }
            : {
                text: generated.text,
                segments: generated.segments,
                wardrobeState: normalizeWardrobeState(generated.scene.wardrobe),
        };
        if (typeof generated !== 'string' && request.room && !request.vpsTurn) {
            const groupScenePersistStartedAt = performance.now();
            let persistedScene = generated.scene;
            try {
                const storedRoom = roomManager.updateRoomSceneDeferred(
                    request.room.id,
                    generated.scene,
                );
                persistedScene = storedRoom?.scene || generated.scene;
            } catch (error) {
                // A nearly full mobile storage quota must not swallow a valid live reply.
                console.warn('Unable to persist the latest room scene.', error);
            }
            request.room.scene = persistedScene;
            if (currentRoom?.id === request.room.id) {
                const storedRoom = roomManager.getRoom(request.room.id);
                currentRoom = storedRoom || { ...currentRoom, scene: persistedScene };
                currentRoom.scene = persistedScene;
                renderUiV2ImmersiveSceneChrome();
            }
            markChatPerformance('response:group-scene-persist', groupScenePersistStartedAt);
        }
        const persistStartedAt = performance.now();
        if(request.mode==='character')botContent.worldlineStoryTurn=Boolean(getActiveWorldline(request.conversationKey));
        let replyId: string | undefined;
        if (request.vpsTurn) {
            const {receipt,job}=request.vpsTurn;
            if (!receipt || !job) throw Error('TURN_RESULT_NOT_READY');
            const applied=await makeVpsTurnController(botContent,typeof generated==='string'?undefined:generated.scene).apply(receipt,job,typeof generated==='string'?generated:generated.text);
            if(request.room){
                const stored=roomManager.getRoom(request.room.id);
                if(stored){request.room.scene=stored.scene;if(currentRoom?.id===stored.id){currentRoom=stored;renderUiV2ImmersiveSceneChrome();}}
            }
            replyId=receipt.replyId;
            if (applied === 'already-applied') {
                if (currentConversationKey === request.conversationKey) {
                    chatContainer.replaceChildren(); resetRenderedChatHistoryWindow();
                    renderChatHistoryWindow(request.conversationKey, memoryManager.peekChatHistory(request.conversationKey));
                }
                finishChatRequest(request);
                return;
            }
        } else memoryManager.addMessage(request.conversationKey, 'model', botContent);
        if(request.mode==='character'&&!request.vpsTurn?.identity.worldDigest&&request.director?.next){
            try{consumeDirectorNext(localStorage,request.conversationKey,request.director);}
            catch(error){console.warn('Director preference consumption failed',error);}
        }
        if(getActiveWorldline(request.conversationKey,false)){
            const latest=memoryManager.peekChatHistory(request.conversationKey).at(-1);
            recordWorldResearch({conversationKey:request.conversationKey,requestId:request.id,stage:'final-persist',sourceIds:latest?.id?[latest.id]:[]},{kind:'final-story',reply:researchText(botContent.text||''),elapsedMs:Math.round(performance.now()-request.startedAt)});
        }
        if (request.mode === 'character'&&!request.vpsTurn?.identity.worldDigest) {
            try {
                const world = getActiveWorldline(request.conversationKey,false);
                if (world) {
                    const next = recordWorldlineTurn(world, triggeringMessage, botContent.text || '',Date.now(),memoryManager.peekChatHistory(request.conversationKey).at(-1)?.id);
                    const registry = updateWorldlineRegistry(
                        localStorage.getItem(WORLDLINE_SETTING_KEY), request.conversationKey, next,
                    );
                    setPersistedAppSetting(WORLDLINE_SETTING_KEY, JSON.stringify(registry));
                }
            } catch (error) {
                console.warn('Worldline chronicle persistence deferred; chat reply remains saved.', error);
            }
        }
        markChatPerformance('response:final-persist', persistStartedAt);
        if (shouldRenderCompletedReplyInConversation(currentConversationKey, request.conversationKey)) {
            const renderStartedAt = performance.now();
            appendMessage(botContent, 'bot', replyId ? { id: replyId } : undefined);
            markChatPerformance('response:final-render', renderStartedAt);
            scheduleReplyVisibleHaptic();
        }
        if (request.mode === 'character') {
            try {
                const relationshipStartedAt = performance.now();
                updateRelationshipPulseAfterTurn(request, triggeringMessage, generated);
                rememberStartedSurpriseEvent(request);
                markChatPerformance('response:relationship-update', relationshipStartedAt);
            } catch (error) {
                // A valid live reply should not be lost if optional experience state cannot persist.
                console.warn('Unable to persist relationship or surprise-event state.', error);
                if (request.surpriseEvent) {
                    updateSurpriseEventProposal(request.conversationKey, request.surpriseEvent.id, {
                        status: 'active',
                        error: undefined,
                    });
                }
            }
        }
        if (typeof generated !== 'string' && request.room && generated.npcCandidate) {
            const candidate = generated.npcCandidate;
            const normalizedName = candidate.name.trim().toLocaleLowerCase();
            const room = roomManager.getRoom(request.room.id) || request.room;
            const alreadyFixed = room.members.some(member => (
                member.persona.name.trim().toLocaleLowerCase() === normalizedName
                || member.persona.publicIdentity?.canonicalName?.trim().toLocaleLowerCase() === normalizedName
            ));
            const alreadyOffered = memoryManager.getChatHistory(request.conversationKey).some(message => (
                message.content.npcProposal?.name.trim().toLocaleLowerCase() === normalizedName
            ));
            if (!alreadyFixed && !alreadyOffered && room.members.length < ROOM_MEMBER_LIMIT) {
                const proposalContent: Content = {
                    npcProposal: {
                        id: crypto.randomUUID?.() || `npc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        name: candidate.name,
                        gender: candidate.gender,
                        description: candidate.description,
                        publicFigureQuery: candidate.publicFigureQuery,
                        status: 'pending',
                        createdAt: Date.now(),
                    },
                };
                memoryManager.addMessage(request.conversationKey, 'system', proposalContent);
                if (currentConversationKey === request.conversationKey) appendMessage(proposalContent, 'system', undefined, 'none');
            }
        }
        if (typeof generated === 'string' && !request.room && request.mode === 'character' && !isWorldlineNarrator(request)) {
            const proposals = createObservedNpcPromotionProposals(
                request.conversationKey,
                request.persona,
            );
            proposals.forEach(proposal => {
                const proposalContent: Content = { npcProposal: proposal };
                memoryManager.addMessage(request.conversationKey, 'system', proposalContent);
                if (currentConversationKey === request.conversationKey) appendMessage(proposalContent, 'system', undefined, 'none');
            });
        }
        finishChatRequest(request);
        if (request.mode === 'character' && getActiveWorldline(request.conversationKey)) {
            if(request.conversationKey===NATIVE_SYNC_KEY)maybeSyncNativeLedger();else void syncWorldLedger(request.conversationKey, true).catch(error => console.warn('World OS extraction pending:', error));
        }
        completeChatPerformanceTurn('response:final-visible');
        schedulePersonaListRefreshAfterPaint();
        if (request.room) { if(request.vpsTurn)void startVpsGroupMemory(request.room.id);else void maybeSummarizeRoomMemory(request.room.id); }
        else if (request.mode === 'character' && request.conversationKey!==NATIVE_SYNC_KEY) {
            if (request.vpsTurn) void startVpsPersonaMemory(request.personaKey);
            else void maybeSummarizePersonaMemory(request.personaKey);
        }
    } catch (error) {
        clearAssistantStreamPreview(request);
        if (isAbortError(error)) {
            if (request.surpriseEvent) {
                updateSurpriseEventProposal(request.conversationKey, request.surpriseEvent.id, {
                    status: 'pending',
                    error: undefined,
                });
            }
            finishChatRequest(request);
            cancelChatPerformanceTurn('send:aborted');
            return;
        }
        if (request.vpsTurn) {
            finishChatRequest(request, 'error');
            if (error instanceof QueuePilotError && error.httpStatus === 401) handleAuthRequired();
            else if (currentConversationKey === request.conversationKey) showError('VPS：' + (error instanceof Error ? error.message : 'UNKNOWN') + '。未自動重試；如有待處理任務，請用選單取回。');
            cancelChatPerformanceTurn('send:vps-error');
            return;
        }
        console.error('Venice response error:', error);
        if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
            if (request.surpriseEvent) {
                updateSurpriseEventProposal(request.conversationKey, request.surpriseEvent.id, {
                    status: 'failed',
                    error: '登入狀態已失效，重新解鎖後可再次開始。',
                });
            }
            finishChatRequest(request);
            cancelChatPerformanceTurn('send:auth-error');
            handleAuthRequired();
            return;
        }
        const message = formatChatFailureMessage(diagnoseChatFailure(error, Boolean(request.room)));

        finishChatRequest(request, 'error');
        if (request.surpriseEvent) {
            updateSurpriseEventProposal(request.conversationKey, request.surpriseEvent.id, {
                status: 'failed',
                error: '角色暫時未能把事件接入目前場景，可以再試或換一張。',
            });
        }
        if (currentConversationKey === request.conversationKey) {
            showError(message);
            appendMessage({ text: `[系統] ${message}` }, 'system');
        }
        cancelChatPerformanceTurn('send:error');
    }
};

let autoMemoryModuleLoad: Promise<typeof import('./autoMemory.js')> | null = null;

const loadAutoMemoryModule = () => {
    autoMemoryModuleLoad ??= import('./autoMemory.js');
    return autoMemoryModuleLoad;
};

async function generateValidatedAutoMemory<T>(
    messages: VeniceMessage[],
    responseFormat: NonNullable<Parameters<typeof generateVeniceText>[0]['responseFormat']>,
    parse: (text: string) => T | null,
): Promise<T> {
    // Memory extraction uses a fixed route so changing the chat model does not
    // change what the app decides is worth remembering.
    const models = Array.from(new Set([
        DEFAULT_CHAT_MODEL_SETTINGS.qualityFallback,
        DEFAULT_CHAT_MODEL_SETTINGS.primary,
        DEFAULT_CHAT_MODEL_SETTINGS.emergencyFallback,
    ].filter(Boolean)));
    let lastError: Error | null = null;
    for (const model of models) {
        try {
            const result = await generateChatTextWithTimeout({
                model,
                messages,
                maxCompletionTokens: 4200,
                temperature: 0.2,
                topP: 0.85,
                repetitionPenalty: 1.04,
                stop: [],
                responseFormat,
            }, AUTO_MEMORY_MODEL_TIMEOUT_MS);
            const parsed = parse(result.text);
            if (parsed === null) {
                throw new Error('Memory model returned an invalid JSON envelope.');
            }
            return parsed;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
    }
    throw lastError || new Error('No memory summary model was available.');
}

type MemorySummaryRunResult =
    | { status: 'success'; added: number }
    | { status: 'skipped'; reason: 'not-found' | 'busy' | 'no-history' | 'threshold' }
    | { status: 'error'; message: string };

interface MemoryTranscriptBatch {
    transcript: string;
    sourceMessageIds: Set<string>;
    sceneIds: string[];
}

const createMemoryMessageIdMap = (conversationKey: string, history: ChatMessage[]) => new Map(
    history.map((message, index) => [
        message,
        message.id?.trim()
            || `legacy-${conversationKey}-${Number(message.createdAt || 0)}-${index + 1}`,
    ]),
);

const cleanMemoryEvidenceText = (value: string, limit = 7000) => value
    .replace(/\u0000/gu, '')
    .trim()
    .slice(0, limit);

const buildRoomMemoryTranscript = (
    room: ChatRoom,
    messages: ChatMessage[],
    messageIds: ReadonlyMap<ChatMessage, string>,
    manuallyControlledSourceIds: ReadonlySet<string> = new Set(),
): MemoryTranscriptBatch => {
    const sourceMessageIds = new Set<string>();
    const sceneIds: string[] = [];
    let activeScene = room.scene;
    let suppressTurn = false;
    const lines = messages.flatMap(message => {
        if (message.content.roomSceneBeforeTurn) activeScene = message.content.roomSceneBeforeTurn;
        const sourceId = messageIds.get(message);
        if (message.role === 'user') {
            suppressTurn = Boolean(sourceId && manuallyControlledSourceIds.has(sourceId));
        }
        if (suppressTurn || !sourceId) return [];
        const text = cleanMemoryEvidenceText(message.role === 'user'
            ? message.content.text || ''
            : contentToGroupHistoryText(message.content, room));
        if (!text) return [];
        sourceMessageIds.add(sourceId);
        const sceneId = activeScene.id || 'main';
        if (!sceneIds.includes(sceneId)) sceneIds.push(sceneId);
        const present = activeScene.presentMemberIds.length
            ? activeScene.presentMemberIds.join(',')
            : room.scene.presentMemberIds.join(',');
        const speaker = message.role === 'user' ? 'USER' : 'GROUP_REPLY';
        return [`[MESSAGE_ID=${sourceId}][SCENE_ID=${sceneId}][PRESENT=${present}][${speaker}]\n${text}`];
    });
    return { transcript: lines.join('\n\n'), sourceMessageIds, sceneIds };
};

const buildPersonaMemoryTranscript = (
    persona: Persona,
    messages: ChatMessage[],
    messageIds: ReadonlyMap<ChatMessage, string>,
    manuallyControlledSourceIds: ReadonlySet<string> = new Set(),
): MemoryTranscriptBatch => {
    const sourceMessageIds = new Set<string>();
    const sceneIds: string[] = [];
    let suppressTurn = false;
    const lines = messages.flatMap(message => {
        const sourceId = messageIds.get(message);
        if (message.role === 'user') {
            suppressTurn = Boolean(sourceId && manuallyControlledSourceIds.has(sourceId));
        }
        if (suppressTurn || !sourceId) return [];
        const text = cleanMemoryEvidenceText(message.content.text || '');
        if (!text) return [];
        sourceMessageIds.add(sourceId);
        const sceneId = message.content.roomSceneBeforeTurn?.id || 'main';
        if (!sceneIds.includes(sceneId)) sceneIds.push(sceneId);
        const speaker = message.role === 'user' ? 'USER' : persona.name;
        return [`[MESSAGE_ID=${sourceId}][SCENE_ID=${sceneId}][${speaker}]\n${text}`];
    });
    return { transcript: lines.join('\n\n'), sourceMessageIds, sceneIds };
};

const formatExistingMemoryForExtractor = (
    entries: Array<Pick<PersonaMemoryEntry, 'kind' | 'title' | 'summary' | 'sourceMessageIds' | 'searchTags'>>,
    limit: number,
) => entries.slice(-limit).map(entry => {
    const sources = entry.sourceMessageIds?.length
        ? ` sources=${entry.sourceMessageIds.join(',')}`
        : '';
    const tags = entry.searchTags?.length
        ? ` tags=${entry.searchTags.slice(0, 10).join('|')}`
        : '';
    return `- [${entry.kind}${sources}${tags}] ${entry.title}: ${entry.summary.replace(/\s+/gu, ' ').slice(0, 280)}`;
}).join('\n');

const maybeSummarizeRoomMemory = async (
    roomId: string,
    mode: MemoryBatchMode = 'auto',
): Promise<MemorySummaryRunResult> => {
    const room = roomManager.getRoom(roomId);
    if (!room) return { status: 'skipped', reason: 'not-found' };
    if (roomSummaryInFlight.has(roomId)) return { status: 'skipped', reason: 'busy' };
    const history = memoryManager.peekChatHistory(roomId);
    const userMessageCount = history.filter(message => message.role === 'user').length;
    if (userMessageCount === 0) return { status: 'skipped', reason: 'no-history' };
    const lastSummarized = Number(room.lastSummarizedUserMessageCount || 0);
    const previousSummaryVersion = Number(room.memorySummaryVersion || 0);
    const needsRecovery = Number(room.memorySummaryVersion || 0) < AUTO_MEMORY_SUMMARY_VERSION
        && userMessageCount >= AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES;
    if (mode === 'auto' && !needsRecovery && userMessageCount - lastSummarized < ROOM_MEMORY_SUMMARY_TURN_INTERVAL) {
        return { status: 'skipped', reason: 'threshold' };
    }
    if (mode === 'auto' && !needsRecovery && userMessageCount <= lastSummarized) {
        return { status: 'skipped', reason: 'threshold' };
    }
    const autoMemory = await loadAutoMemoryModule();
    const effectiveMode: MemoryBatchMode = needsRecovery && mode !== 'full' ? 'recovery' : mode;
    const batches = autoMemory.buildMemoryTurnBatches(history, lastSummarized, effectiveMode);
    if (!batches.length) return { status: 'skipped', reason: 'threshold' };
    roomSummaryInFlight.add(roomId);
    try {
        const memberLedger = room.members.map(member => `${member.id}=${member.persona.name}`).join(', ');
        const participantAliases = new Map<string, string>();
        room.members.forEach(member => {
            [member.id, member.persona.name, member.persona.publicIdentity?.canonicalName]
                .filter((value): value is string => Boolean(value?.trim()))
                .forEach(value => participantAliases.set(value.trim().toLocaleLowerCase(), member.id));
        });
        const messageIds = createMemoryMessageIdMap(roomId, history);
        const manuallyControlledSourceIds = getManualMemoryControlledSourceIds(history);
        const manualLongTermExclusions = getManualMemoryLongTermExclusionSummaries(history);
        let added = 0;
        for (const [batchIndex, batch] of batches.entries()) {
            const completesRun = batchIndex === batches.length - 1;
            const checkpoint = completesRun ? batch.throughUserMessageCount : lastSummarized;
            const summaryVersion = completesRun ? AUTO_MEMORY_SUMMARY_VERSION : previousSummaryVersion;
            const evidence = buildRoomMemoryTranscript(
                room,
                batch.messages,
                messageIds,
                manuallyControlledSourceIds,
            );
            if (!evidence.transcript) {
                roomManager.applyEpisodicMemorySummary(
                    roomId,
                    [],
                    checkpoint,
                    summaryVersion,
                );
                continue;
            }
            const latestRoom = roomManager.getRoom(roomId) || room;
            const existing = formatExistingMemoryForExtractor(latestRoom.sharedMemories, 64);
            const memories = await generateValidatedAutoMemory(
                autoMemory.buildRoomAutoMemoryMessages(memberLedger, existing, evidence.transcript),
                autoMemory.ROOM_MEMORY_RESPONSE_FORMAT,
                text => autoMemory.parseRoomAutoMemoryResponse(text, participantAliases, evidence.sourceMessageIds),
            );
            const validSceneIds = new Set(evidence.sceneIds);
            const fallbackSceneId = evidence.sceneIds.at(-1) || room.scene.id;
            const memberCount = room.members.length;
            const stillExistingSourceIds = new Set(memoryManager.peekChatHistory(roomId)
                .map(message => message.id?.trim() || messageIds.get(message))
                .filter((id): id is string => Boolean(id)));
            const normalized = memories.filter(memory => (
                memory.sourceMessageIds?.every(id => stillExistingSourceIds.has(id))
            )).filter(memory => (
                Number(memory.importance ?? 3) >= AUTO_MEMORY_MIN_IMPORTANCE
            )).filter(memory => (
                !autoMemoryMatchesManualDecision(memory.summary, manualLongTermExclusions)
            )).map(memory => {
                const knowerIds = memory.knowerIds || memory.perspectives?.map(item => item.memberId) || [];
                return {
                    ...memory,
                    sceneId: memory.sceneId && validSceneIds.has(memory.sceneId)
                        ? memory.sceneId
                        : fallbackSceneId,
                    visibility: knowerIds.length === memberCount ? 'shared' as const : 'restricted' as const,
                };
            });
            added += roomManager.applyEpisodicMemorySummary(
                roomId,
                normalized,
                checkpoint,
                summaryVersion,
            );
        }
        if (currentRoom?.id === roomId) refreshCurrentRoom();
        return { status: 'success', added };
    } catch (error) {
        console.warn('Background room memory summary skipped:', error);
        return {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown memory update error.',
        };
    } finally {
        roomSummaryInFlight.delete(roomId);
        if (currentRoom?.id === roomId) refreshRoomMemoryIfOpen();
    }
};

const maybeSummarizePersonaMemory = async (
    personaKey: string,
    mode: MemoryBatchMode = 'auto',
): Promise<MemorySummaryRunResult> => {
    const persona = memoryManager.getPersona(personaKey);
    if (!persona || isAssistantPersonaKey(personaKey)) return { status: 'skipped', reason: 'not-found' };
    if (personaSummaryInFlight.has(personaKey)) return { status: 'skipped', reason: 'busy' };
    const history = memoryManager.peekChatHistory(personaKey);
    const userMessageCount = history.filter(message => message.role === 'user').length;
    if (userMessageCount === 0) return { status: 'skipped', reason: 'no-history' };
    const lastSummarized = Number(persona.lastMemorySummaryUserMessageCount || 0);
    const previousSummaryVersion = Number(persona.memorySummaryVersion || 0);
    const needsRecovery = Number(persona.memorySummaryVersion || 0) < AUTO_MEMORY_SUMMARY_VERSION
        && userMessageCount >= AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES;
    if (mode === 'auto' && !needsRecovery && userMessageCount - lastSummarized < ROOM_MEMORY_SUMMARY_TURN_INTERVAL) {
        return { status: 'skipped', reason: 'threshold' };
    }
    if (mode === 'auto' && !needsRecovery && userMessageCount <= lastSummarized) {
        return { status: 'skipped', reason: 'threshold' };
    }
    const autoMemory = await loadAutoMemoryModule();
    const effectiveMode: MemoryBatchMode = needsRecovery && mode !== 'full' ? 'recovery' : mode;
    const batches = autoMemory.buildMemoryTurnBatches(history, lastSummarized, effectiveMode);
    if (!batches.length) return { status: 'skipped', reason: 'threshold' };
    personaSummaryInFlight.add(personaKey);
    try {
        const messageIds = createMemoryMessageIdMap(personaKey, history);
        const manuallyControlledSourceIds = getManualMemoryControlledSourceIds(history);
        const manualLongTermExclusions = getManualMemoryLongTermExclusionSummaries(history);
        let added = 0;
        for (const [batchIndex, batch] of batches.entries()) {
            const completesRun = batchIndex === batches.length - 1;
            const checkpoint = completesRun ? batch.throughUserMessageCount : lastSummarized;
            const summaryVersion = completesRun ? AUTO_MEMORY_SUMMARY_VERSION : previousSummaryVersion;
            const evidence = buildPersonaMemoryTranscript(
                persona,
                batch.messages,
                messageIds,
                manuallyControlledSourceIds,
            );
            if (!evidence.transcript) {
                memoryManager.applyPersonaMemorySummary(
                    personaKey,
                    [],
                    checkpoint,
                    summaryVersion,
                );
                continue;
            }
            const latestPersona = memoryManager.getPersona(personaKey) || persona;
            const existing = formatExistingMemoryForExtractor(latestPersona.memories || [], 64);
            const memories = await generateValidatedAutoMemory(
                autoMemory.buildPersonaAutoMemoryMessages(persona.name, existing, evidence.transcript),
                autoMemory.PERSONA_MEMORY_RESPONSE_FORMAT,
                text => autoMemory.parsePersonaAutoMemoryResponse(text, evidence.sourceMessageIds),
            );
            const validSceneIds = new Set(evidence.sceneIds);
            const fallbackSceneId = evidence.sceneIds.at(-1) || 'main';
            const stillExistingSourceIds = new Set(memoryManager.peekChatHistory(personaKey)
                .map(message => message.id?.trim() || messageIds.get(message))
                .filter((id): id is string => Boolean(id)));
            const normalized = memories.filter(memory => (
                memory.sourceMessageIds?.every(id => stillExistingSourceIds.has(id))
            )).filter(memory => (
                Number(memory.importance ?? 3) >= AUTO_MEMORY_MIN_IMPORTANCE
            )).filter(memory => (
                !autoMemoryMatchesManualDecision(memory.summary, manualLongTermExclusions)
            )).map(memory => ({
                ...memory,
                sceneId: memory.sceneId && validSceneIds.has(memory.sceneId)
                    ? memory.sceneId
                    : fallbackSceneId,
            }));
            added += memoryManager.applyPersonaMemorySummary(
                personaKey,
                normalized,
                checkpoint,
                summaryVersion,
            );
        }
        return { status: 'success', added };
    } catch (error) {
        console.warn('Background persona memory summary skipped:', error);
        return {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown memory update error.',
        };
    } finally {
        personaSummaryInFlight.delete(personaKey);
        if (!currentRoom && currentPersonaKey === personaKey) refreshRoomMemoryIfOpen();
    }
};

// Separate durable memory job. Ordinary one-batch automatic summaries only;
// historical multi-batch recovery is left to the existing manual workflow.
const vpsMemorySnapshot = (context: MemoryContext) => {
    const persona=memoryManager.getPersona(context.personaKey);
    if (!persona) throw Error('MEMORY_PERSONA_MISSING');
    const history=memoryManager.peekChatHistory(context.personaKey);
    if (history.length<context.historyLength) throw Error('MEMORY_HISTORY_CHANGED');
    return JSON.stringify({
        name:persona.name,prompt:persona.prompt,memory:persona.memory,soul:persona.soul||[],memories:persona.memories||[],
        count:Number(persona.lastMemorySummaryUserMessageCount||0),version:Number(persona.memorySummaryVersion||0),
        history:history.slice(0,context.historyLength),
        controlled:[...getManualMemoryControlledSourceIds(history)].sort(),
        exclusions:getManualMemoryLongTermExclusionSummaries(history),
    });
};
const makeVpsMemoryTask = async () => {
    const autoMemory=await loadAutoMemoryModule();
    return createDurableMemoryTask({
        storage:localStorage,transport:createVpsChatTransport(),lock:browserMemoryLock,snapshot:vpsMemorySnapshot,
        parse:(r,text)=>autoMemory.parsePersonaAutoMemoryResponse(text,new Set(r.sourceIds)),
        confirmed:r=>memoryManager.confirmVpsMemoryCommit(r.personaKey,r.jobId),
        commit:(r,memories)=>{
            const history=memoryManager.peekChatHistory(r.personaKey);
            const messageIds=createMemoryMessageIdMap(r.personaKey,history);
            const existingIds=new Set(history.map(m=>m.id?.trim()||messageIds.get(m)).filter(Boolean));
            const exclusions=getManualMemoryLongTermExclusionSummaries(history);
            const controlled=getManualMemoryControlledSourceIds(history);
            const scenes=new Set(r.sceneIds);
            const normalized=memories.filter(m=>m.sourceMessageIds?.every(id=>existingIds.has(id)&&!controlled.has(id)))
                .filter(m=>Number(m.importance??3)>=AUTO_MEMORY_MIN_IMPORTANCE)
                .filter(m=>!autoMemoryMatchesManualDecision(m.summary,exclusions))
                .map(m=>({...m,sceneId:m.sceneId&&scenes.has(m.sceneId)?m.sceneId:r.sceneIds.at(-1)||'main'}));
            return memoryManager.applyPersonaMemorySummary(r.personaKey,normalized,r.checkpoint,r.summaryVersion,r.jobId);
        },
    });
};
let vpsMemoryBusy=false;
const resumeVpsPersonaMemory = async () => {
    if (!VPS_CHAT_BUILD||!isUnlocked||vpsMemoryBusy||activeChatRequest) return;
    vpsMemoryBusy=true;
    try {
        const task=await makeVpsMemoryTask();
        const receipt=task.pending();
        if(!receipt)return;
        const deadline=Date.now()+300000;
        let state=await task.resume();
        while(state.status==='pending'&&Date.now()<deadline&&isUnlocked&&!activeChatRequest){
            await new Promise(resolve=>setTimeout(resolve,2000));
            if(activeChatRequest||!isUnlocked)break;
            state=await task.resume();
        }
        if(state.status==='applied'&&currentPersonaKey===receipt.personaKey&&!currentRoom)refreshRoomMemoryIfOpen();
    }catch(error){console.warn('[aigf4 VPS memory pending]',error instanceof Error?error.message:'UNKNOWN');}
    finally{vpsMemoryBusy=false;}
};
const startVpsPersonaMemory = async (personaKey:string) => {
    if(!VPS_CHAT_BUILD||!isUnlocked||vpsMemoryBusy||activeChatRequest)return;
    vpsMemoryBusy=true;
    try {
        const task=await makeVpsMemoryTask();
        if(task.pending())return;
        const persona=memoryManager.getPersona(personaKey);
        if(!persona||isAssistantPersonaKey(personaKey)||personaSummaryInFlight.has(personaKey))return;
        const history=memoryManager.peekChatHistory(personaKey);
        const userCount=history.filter(m=>m.role==='user').length;
        const checkpoint=Number(persona.lastMemorySummaryUserMessageCount||0);
        const needsRecovery=Number(persona.memorySummaryVersion||0)<AUTO_MEMORY_SUMMARY_VERSION&&userCount>=AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES;
        if(!needsRecovery&&userCount-checkpoint<ROOM_MEMORY_SUMMARY_TURN_INTERVAL)return;
        const autoMemory=await loadAutoMemoryModule();
        const batches=autoMemory.buildMemoryTurnBatches(history,checkpoint,needsRecovery?'recovery':'auto');
        if(batches.length!==1)return;
        const batch=batches[0];
        const evidence=buildPersonaMemoryTranscript(persona,batch.messages,createMemoryMessageIdMap(personaKey,history),getManualMemoryControlledSourceIds(history));
        if(!evidence.transcript)return;
        const context:MemoryContext={personaKey,historyLength:history.length,checkpoint:batch.throughUserMessageCount,summaryVersion:AUTO_MEMORY_SUMMARY_VERSION,sourceIds:[...evidence.sourceMessageIds],sceneIds:evidence.sceneIds};
        const expectedSnapshot=vpsMemorySnapshot(context);
        const existing=formatExistingMemoryForExtractor(persona.memories||[],64);
        const payload=buildVpsCharacterPayload({
            model:VPS_REVIEW_MODELS[0],messages:autoMemory.buildPersonaAutoMemoryMessages(persona.name,existing,evidence.transcript),
            maxCompletionTokens:4200,temperature:0.2,topP:0.85,repetitionPenalty:1.04,stop:[],responseFormat:autoMemory.PERSONA_MEMORY_RESPONSE_FORMAT,
        });
        await task.submit(context,payload,expectedSnapshot);
    }catch(error){console.warn('[aigf4 VPS memory submit]',error instanceof Error?error.message:'UNKNOWN');}
    finally{vpsMemoryBusy=false;void resumeVpsPersonaMemory();}
};

const vpsGroupMemorySnapshot=(context:MemoryContext)=>{
    const room=roomManager.getRoom(context.personaKey);
    if(!room)throw Error('MEMORY_ROOM_MISSING');
    const history=memoryManager.peekChatHistory(room.id);
    return roomMemorySnapshot(room,history,context,[...getManualMemoryControlledSourceIds(history)],getManualMemoryLongTermExclusionSummaries(history));
};
const makeVpsGroupMemoryTask=async()=>{
    const autoMemory=await loadAutoMemoryModule();
    return createDurableMemoryTask({
        storage:localStorage,storageKey:GROUP_MEMORY_KEY,transport:createVpsChatTransport(),lock:browserMemoryLock,snapshot:vpsGroupMemorySnapshot,
        parse:(r,text)=>{
            const room=roomManager.getRoom(r.personaKey);
            if(!room)throw Error('MEMORY_ROOM_MISSING');
            return autoMemory.parseRoomAutoMemoryResponse(text,groupMemoryAliases(room),new Set(r.sourceIds));
        },
        confirmed:r=>roomManager.confirmVpsMemoryCommit(r.personaKey,r.jobId),
        commit:(r,memories)=>{
            if(activeChatRequest)throw Error('MEMORY_WAIT_FOR_CHAT');
            const room=roomManager.getRoom(r.personaKey);
            if(!room)throw Error('MEMORY_ROOM_MISSING');
            const history=memoryManager.peekChatHistory(room.id);
            const prefix=history.slice(0,r.historyLength);
            const ids=createMemoryMessageIdMap(room.id,history);
            const presence=groupMemoryPresence(prefix,ids,new Set(r.sourceIds));
            const controlled=getManualMemoryControlledSourceIds(history);
            const exclusions=getManualMemoryLongTermExclusionSummaries(history);
            const normalized=constrainGroupMemories(memories,presence,room,r).filter(m=>m.sourceMessageIds?.every(id=>!controlled.has(id)))
                .filter(m=>Number(m.importance??3)>=AUTO_MEMORY_MIN_IMPORTANCE)
                .filter(m=>!autoMemoryMatchesManualDecision(m.summary,exclusions));
            return roomManager.applyEpisodicMemorySummary(room.id,normalized,r.checkpoint,r.summaryVersion,r.jobId);
        },
    });
};
let vpsGroupMemoryBusy=false;
const resumeVpsGroupMemory=async()=>{
    if(!VPS_CHAT_BUILD||!isUnlocked||vpsGroupMemoryBusy||activeChatRequest)return;
    vpsGroupMemoryBusy=true;
    try{
        const task=await makeVpsGroupMemoryTask();
        const receipt=task.pending();
        if(!receipt)return;
        const deadline=Date.now()+300000;
        let state=await task.resume();
        while(state.status==='pending'&&Date.now()<deadline&&isUnlocked&&!activeChatRequest){
            await new Promise(resolve=>setTimeout(resolve,2000));
            if(activeChatRequest||!isUnlocked)break;
            state=await task.resume();
        }
        if(state.status==='applied'&&currentRoom?.id===receipt.personaKey){refreshCurrentRoom();refreshRoomMemoryIfOpen();}
    }catch(error){console.warn('[aigf4 VPS group memory pending]',error instanceof Error?error.message:'UNKNOWN');}
    finally{vpsGroupMemoryBusy=false;}
};
const startVpsGroupMemory=async(roomId:string)=>{
    if(!VPS_CHAT_BUILD||!isUnlocked||vpsGroupMemoryBusy||activeChatRequest)return;
    vpsGroupMemoryBusy=true;
    try{
        const task=await makeVpsGroupMemoryTask();
        if(task.pending())return;
        const room=roomManager.getRoom(roomId);
        if(!room||roomSummaryInFlight.has(roomId))return;
        const history=memoryManager.peekChatHistory(roomId);
        const count=history.filter(m=>m.role==='user').length;
        const checkpoint=Number(room.lastSummarizedUserMessageCount||0);
        const needsRecovery=Number(room.memorySummaryVersion||0)<AUTO_MEMORY_SUMMARY_VERSION&&count>=AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES;
        if(!needsRecovery&&count-checkpoint<ROOM_MEMORY_SUMMARY_TURN_INTERVAL)return;
        const autoMemory=await loadAutoMemoryModule();
        const batches=autoMemory.buildMemoryTurnBatches(history,checkpoint,needsRecovery?'recovery':'auto');
        if(batches.length!==1)return;
        const batch=batches[0];
        const ids=createMemoryMessageIdMap(roomId,history);
        const evidence=buildRoomMemoryTranscript(room,batch.messages,ids,getManualMemoryControlledSourceIds(history));
        if(!evidence.transcript)return;
        groupMemoryAliases(room);
        groupMemoryPresence(history,ids,evidence.sourceMessageIds);
        const context:MemoryContext={personaKey:roomId,historyLength:history.length,checkpoint:batch.throughUserMessageCount,summaryVersion:AUTO_MEMORY_SUMMARY_VERSION,sourceIds:[...evidence.sourceMessageIds],sceneIds:evidence.sceneIds};
        const snapshot=vpsGroupMemorySnapshot(context);
        const ledger=room.members.map(m=>m.id+'='+m.persona.name).join(', ');
        const existing=formatExistingMemoryForExtractor(room.sharedMemories,64);
        const payload=buildVpsCharacterPayload({
            model:VPS_REVIEW_MODELS[0],messages:autoMemory.buildRoomAutoMemoryMessages(ledger,existing,evidence.transcript),
            maxCompletionTokens:4200,temperature:0.2,topP:0.85,repetitionPenalty:1.04,stop:[],responseFormat:autoMemory.ROOM_MEMORY_RESPONSE_FORMAT,
        });
        await task.submit(context,payload,snapshot);
    }catch(error){console.warn('[aigf4 VPS group memory submit]',error instanceof Error?error.message:'UNKNOWN');}
    finally{vpsGroupMemoryBusy=false;void resumeVpsGroupMemory();}
};

const continuePendingConversationTurn = async (triggeringMessage: string) => {
    if (
        activeChatRequest
        || !currentConversationKey
        || !currentPersonaKey
        || !currentPersona
        || isAssistantPersonaKey(currentPersonaKey)
    ) return;
    const request = beginChatRequest(
        currentPersonaKey,
        currentPersona as Persona,
        'character',
        currentConversationKey,
    );
    await getResponse(request, triggeringMessage);
};

const continuePendingPhotoTurn = async (
    triggeringMessage: string,
    senderMemberId?: string,
    subjectMemberIds: string[] = [],
) => {
    if (senderMemberId) selectActiveRoomMember(senderMemberId);
    if (
        activeChatRequest
        || !currentConversationKey
        || !currentPersonaKey
        || !currentPersona
        || isAssistantPersonaKey(currentPersonaKey)
    ) return;
    const request = beginChatRequest(
        currentPersonaKey,
        currentPersona as Persona,
        'photo',
        currentConversationKey,
    );
    request.characterPhotoRequest = true;
    request.photoSenderMemberId = senderMemberId;
    request.photoSubjectMemberIds = subjectMemberIds;
    await getResponse(request, triggeringMessage);
};

const isExplicitCharacterPhotoRequest = (text: string) => {
    if (/(?:唔使|不用|不要|毋須|別|no need).{0,8}(?:影|拍|相|照片|photo|picture|selfie)/iu.test(text)) return false;
    return /(?:影|拍|send|take|傳|發|給|畀).{0,14}(?:相|照片|photo|picture|selfie)|(?:相|照片|photo|picture|selfie).{0,14}(?:給我|畀我|傳來|發來|send|take)/iu.test(text);
};

const createPhotoIntentProposal = (text: string): NonNullable<Content['photoIntent']> => {
    const room = currentRoom;
    const namedMembers = room?.members.filter(member => (
        room.scene.presentMemberIds.includes(member.id)
        && text.toLocaleLowerCase().includes(member.persona.name.toLocaleLowerCase())
    )) || [];
    const senderMemberId = namedMembers[0]?.id || activeRoomMemberId || room?.leadMemberId;
    return {
        id: crypto.randomUUID?.() || `photo-intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderMemberId,
        subjectMemberIds: namedMembers.length > 0
            ? namedMembers.map(member => member.id)
            : senderMemberId ? [senderMemberId] : [],
        requestText: text,
        status: 'pending',
        createdAt: Date.now(),
    };
};

const buildMemoryRequestSummary = (conversationKey: string, text: string) => {
    const stripped = stripExplicitMemoryDirective(text);
    if (stripped.length >= 3) return stripped;
    const previousUser = memoryManager.getChatHistory(conversationKey)
        .filter(message => message.role === 'user' && message.content.text?.trim() && message.content.text !== text)
        .at(-1)?.content.text?.trim();
    return previousUser || text;
};

const inferNpcPromotionGender = (text: string): Persona['gender'] => {
    if (/(?:男生|男人|男性|男仔|哥哥|先生|boy|man|male|\bhe\b|\bhim\b)/iu.test(text)) return 'male';
    return 'female';
};

const buildNpcPromotionDescription = (
    conversationKey: string,
    name: string,
    requestText: string,
    storedPersona?: Persona,
) => {
    if (storedPersona) {
        return `沿用現有角色「${storedPersona.name}」的完整人格、頭像與記憶，並承接她在目前對話中已經發生的互動。`;
    }
    const normalizedName = name.toLocaleLowerCase();
    const evidence = memoryManager.peekChatHistory(conversationKey)
        .slice(-36)
        .flatMap(message => (message.content.text || '').split(/\n+/gu))
        .map(line => line.trim())
        .filter(line => (
            line !== requestText.trim()
            && line.toLocaleLowerCase().includes(normalizedName)
        ))
        .slice(-4)
        .map(line => line.slice(0, 150));
    return [
        `${name} 是由使用者在目前單人聊天中正式邀請加入的新成員。`,
        evidence.length > 0
            ? `加入前的語氣與關係線索：${evidence.join(' / ')}`
            : '目前未有足夠的固定人格資料；加入後應從現有場景自然建立鮮明、連續而獨立的說話方式。',
    ].join(' ');
};

const NPC_OBSERVATION_MODEL_TURNS = 3;
const NPC_OBSERVATION_HISTORY_LIMIT = 48;
const NPC_OBSERVATION_EVIDENCE_LIMIT = 10000;

const buildNpcObservationEvidence = (
    conversationKey: string,
    name: string,
) => {
    const history = memoryManager.peekChatHistory(conversationKey)
        .slice(-NPC_OBSERVATION_HISTORY_LIMIT);
    const normalizedName = normalizedParticipantName(name);
    const firstMentionIndex = history.findIndex(message => (
        message.content.text
            ?.toLocaleLowerCase()
            .includes(normalizedName)
    ));
    const evidenceStart = Math.max(0, firstMentionIndex - 2);
    return history
        .slice(evidenceStart)
        .filter(message => message.role !== 'system' && message.content.text?.trim())
        .slice(-28)
        .map(message => {
            const speaker = message.role === 'user' ? 'USER' : 'CHAT';
            return `[${speaker}] ${message.content.text!.trim().slice(0, 1800)}`;
        })
        .join('\n\n')
        .slice(-NPC_OBSERVATION_EVIDENCE_LIMIT);
};

const createExplicitNpcPromotionProposal = (
    conversationKey: string,
    persona: Persona,
    text: string,
): NonNullable<Content['npcProposal']> | null => {
    if (!hasNpcPromotionIntent(text)) return null;
    const history = memoryManager.peekChatHistory(conversationKey);
    const establishedNames = collectEstablishedNpcNames(history, persona.name, text);
    const name = inferNpcPromotionNames(text, persona.name, establishedNames)[0];
    if (!name) return null;
    const normalizedName = normalizedParticipantName(name);
    const targetRoom = currentRoom
        || roomManager.getRooms().find(room => room.legacySourcePersonaKey === conversationKey);
    const alreadyFixed = targetRoom?.members.some(member => (
        normalizedParticipantName(member.persona.name) === normalizedName
        || normalizedParticipantName(member.persona.publicIdentity?.canonicalName || '') === normalizedName
    ));
    if (alreadyFixed) return null;
    const alreadyHandled = history.some(message => {
        const previous = message.content.npcProposal;
        if (!previous || normalizedParticipantName(previous.name) !== normalizedName) return false;
        return previous.status === 'pending' || previous.status === 'added';
    });
    if (alreadyHandled) return null;

    const storedPersonaEntry = findStoredPersonaForNpc(name, conversationKey);
    const contextualIdentityNames = (targetRoom?.members || [])
        .flatMap(member => member.persona.publicIdentityEnabled && member.persona.publicIdentity
            ? [member.persona.publicIdentity.canonicalName]
            : [])
        .filter(identityName => normalizedParticipantName(identityName) !== normalizedName)
        .slice(0, 3);
    return {
        id: crypto.randomUUID?.() || `npc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: storedPersonaEntry?.[1].name || name,
        gender: storedPersonaEntry?.[1].gender || inferNpcPromotionGender(text),
        description: storedPersonaEntry
            ? buildNpcPromotionDescription(conversationKey, name, text, storedPersonaEntry[1])
            : targetRoom
                ? `${name} 是由使用者明確邀請加入「${targetRoom.title}」的新固定成員。確認後會從目前場景及最近對話建立獨立人格、soul.md 與 memory.md。`
                : buildNpcPromotionDescription(conversationKey, name, text),
        publicFigureQuery: contextualIdentityNames.length > 0
            ? `${name} ${contextualIdentityNames.join(' ')}`
            : undefined,
        requestText: text,
        detectionSource: 'explicit',
        status: 'pending',
        createdAt: Date.now(),
    };
};

const createObservedNpcPromotionProposals = (
    conversationKey: string,
    persona: Persona,
): Array<NonNullable<Content['npcProposal']>> => {
    const history = memoryManager.peekChatHistory(conversationKey);
    const linkedRoom = roomManager.getRooms().find(room => room.legacySourcePersonaKey === conversationKey);
    const handledNames = new Set(history.flatMap(message => {
        const proposal = message.content.npcProposal;
        return proposal ? [normalizedParticipantName(proposal.name)] : [];
    }));
    const fixedNames = new Set((linkedRoom?.members || []).flatMap(member => [
        normalizedParticipantName(member.persona.name),
        normalizedParticipantName(member.persona.publicIdentity?.canonicalName || ''),
    ]).filter(Boolean));

    return collectObservedNpcCandidates(history, persona.name, NPC_OBSERVATION_MODEL_TURNS)
        .filter(candidate => {
            const normalizedName = normalizedParticipantName(candidate.name);
            return normalizedName !== normalizedParticipantName(persona.name)
                && !handledNames.has(normalizedName)
                && !fixedNames.has(normalizedName);
        })
        .slice(0, Math.max(0, ROOM_MEMBER_LIMIT - 1))
        .map(candidate => {
            const storedPersonaEntry = findStoredPersonaForNpc(candidate.name, conversationKey);
            const evidence = buildNpcObservationEvidence(conversationKey, candidate.name);
            return {
                id: crypto.randomUUID?.() || `npc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: storedPersonaEntry?.[1].name || candidate.name,
                gender: storedPersonaEntry?.[1].gender || inferNpcPromotionGender(evidence),
                description: storedPersonaEntry
                    ? `「${storedPersonaEntry[1].name}」已在最近對話中以獨立發言者持續出現 ${candidate.modelTurnCount} 個回覆輪次。確認後會沿用她現有的完整人格、soul.md、memory.md 與頭像。`
                    : `${candidate.name} 已在最近對話中以獨立發言者持續出現 ${candidate.modelTurnCount} 個回覆輪次。確認後會根據累積互動整理她的語氣、人格、關係、soul.md 與 memory.md。`,
                detectionSource: 'observed' as const,
                observedTurns: candidate.modelTurnCount,
                evidence,
                status: 'pending' as const,
                createdAt: Date.now(),
            };
        });
};

const sendMessage = async ({
    characterPhotoRequest = false,
    photoSenderMemberId,
    photoSubjectMemberIds = [],
    messageText,
}: {
    characterPhotoRequest?: boolean;
    photoSenderMemberId?: string;
    photoSubjectMemberIds?: string[];
    messageText?: string;
} = {}) => {
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
        || !currentConversationKey
    ) {
        return;
    }

    if(currentConversationKey===NATIVE_SYNC_KEY){
        if(!nativeStoryPilot||nativeStoryBusy){showError('請先登入同步測試故事，或稍候同步完成。');return;}
        if(!selectedVpsChatModel()||characterPhotoRequest||pendingChatAttachments.length||isGodModeActive||currentRoom||[GOD_MODE_ENTER_COMMAND,GOD_MODE_EXIT_COMMAND].includes((messageText??messageInput.value).trim().toUpperCase())){showError('同步試用目前只支援文字及 VPS 模型。');return;}
    }
    if (VPS_CHAT_BUILD && (resumingVpsTurn || pendingVpsTurn())) {
        showError('有未完成的 VPS 回覆。請先取回原任務，或在選單確認放棄。');
        return;
    }
    const typedMessage = (messageText ?? messageInput.value).trim();
    if (!typedMessage && pendingChatAttachments.length === 0) return;
    const userMessage = typedMessage || '請查看附件。';


    const userMessageUpper = userMessage.toUpperCase();
    const assistantMode = isAssistantPersonaKey(currentPersonaKey);
    startChatPerformanceTurn();

    if (!assistantMode && pendingChatAttachments.length === 0 && userMessageUpper === GOD_MODE_ENTER_COMMAND && !isGodModeActive) {
        isGodModeActive = true;
        godModeHistory = [];
        messageInput.value = '';
        resetMessageInput();
        updateSendButtonState();
        hideError();
        applyChatRuntimeState('idle');
        appendMessage({ text: '[系統] 已進入 God Mode，現在只會修改當前角色人格。' }, 'system');
        completeChatPerformanceTurn('send:god-mode-enter-visible');
        return;
    }

    if (!assistantMode && pendingChatAttachments.length === 0 && userMessageUpper === GOD_MODE_EXIT_COMMAND && isGodModeActive) {
        isGodModeActive = false;
        messageInput.value = '';
        resetMessageInput();
        updateSendButtonState();
        hideError();
        applyChatRuntimeState('idle');
        appendMessage({ text: '[系統] 已離開 God Mode。' }, 'system');
        completeChatPerformanceTurn('send:god-mode-exit-visible');
        return;
    }

    if (isGodModeActive && pendingChatAttachments.length > 0) {
        alert('God Mode 只修改人格；請先離開 God Mode 再傳附件。');
        cancelChatPerformanceTurn('send:rejected');
        return;
    }

    const personaKey = currentPersonaKey;
    const conversationKey = currentConversationKey;
    let attachmentBundle: { attachments: ChatAttachment[]; contentParts: VeniceMessageContentPart[]; assistantFileContext?: string } = {
        attachments: [],
        contentParts: [],
    };
    try {
        if (pendingChatAttachments.length > 0) {
            attachmentBundle = await persistPendingChatAttachments(conversationKey, assistantMode, userMessage);
        }
    } catch (error) {
        showError(error instanceof Error ? error.message : '附件儲存失敗。');
        cancelChatPerformanceTurn('send:attachment-error');
        return;
    }
    const userContent: Content = {
        text: userMessage,
        assistantFileContext: assistantMode ? attachmentBundle.assistantFileContext : undefined,
        attachments: attachmentBundle.attachments.length > 0 ? attachmentBundle.attachments : undefined,
        roomSceneBeforeTurn: currentRoom ? cloneRoomSnapshot(currentRoom.scene) : undefined,
    };
    const userMessageMeta = isGodModeActive ? undefined : {
        id: crypto.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
    };
    if(conversationKey===NATIVE_SYNC_KEY){
        nativeStoryBusy=true;
        try{await nativeStoryPilot!.beforeUser(userMessageMeta!.id);if(currentConversationKey!==conversationKey)throw Error('NATIVE_SYNC_VIEW_CHANGED');}
        catch(e){showError('同步未開始：'+(e instanceof Error?e.message:'UNKNOWN'));cancelChatPerformanceTurn('send:sync-preflight');return;}
        finally{nativeStoryBusy=false;}
    }

    messageInput.value = '';
    resetMessageInput();
    updateSendButtonState();
    const userRenderStartedAt = performance.now();
    appendMessage(userContent, 'user', userMessageMeta);
    markChatPerformance('send:user-render', userRenderStartedAt);

    if (isGodModeActive) {
        if (/persona|setting|人格|設定/iu.test(userMessage)) {
            const { isPersonaInspectCommand, formatPersonaDetails } = await import('./features/personaInspect.js');
            if (isPersonaInspectCommand(userMessage)) {
                const soulMemory = currentPersona ? formatPersonaMemoryPrompt(currentPersona, 'soul') : '';
                const episodicMemory = currentPersona ? formatPersonaMemoryPrompt(currentPersona, 'memory') : '';
                appendMessage({
                    text: formatPersonaDetails(currentPersona, soulMemory, episodicMemory),
                }, 'god-mode');
                applyChatRuntimeState('idle');
                completeChatPerformanceTurn('send:god-mode-inspect-visible');
                return;
            }
        }
        godModeHistory.push({ role: 'user', content: userContent });
        const request = beginChatRequest(currentPersonaKey, currentPersona, 'god');
        await getGodModeResponse(request);
        return;
    }

    const persona = currentPersona as Persona;
    const persistStartedAt = performance.now();
    memoryManager.addMessage(conversationKey, 'user', userContent, userMessageMeta);
    if (assistantMode && conversationKey.startsWith(ASSISTANT_TOPIC_PREFIX)) {
        const names = readAssistantTopicNames();
        if (!names[conversationKey] || names[conversationKey] === '新對話') {
            const firstTitle = userMessage === '請查看附件。' && attachmentBundle.attachments.length
                ? attachmentBundle.attachments[0].name
                : userMessage;
            names[conversationKey] = normalizeAssistantTopicTitle(firstTitle).slice(0, 36) || '新對話';
            storeAssistantTopicNames(names);
            chatHeaderName.textContent = names[conversationKey];
            renderAssistantTopicPanel();
        }
    }
    markChatPerformance('send:user-persist', persistStartedAt);
    const explicitMemoryIntent = detectExplicitMemoryIntent(userMessage);
    if (
        !assistantMode
        && !characterPhotoRequest
        && attachmentBundle.attachments.length === 0
        && explicitMemoryIntent && conversationKey!==NATIVE_SYNC_KEY
    ) {
        const proposal = {
            id: crypto.randomUUID?.() || `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            targetMemberIds: currentRoom ? [...currentRoom.scene.presentMemberIds] : [],
            originalText: userMessage,
            sourceMessageId: userMessageMeta?.id,
            summary: buildMemoryRequestSummary(conversationKey, userMessage),
            status: 'pending' as const,
            createdAt: Date.now(),
        };
        const systemContent: Content = { memoryProposal: proposal };
        memoryManager.addMessage(conversationKey, 'system', systemContent);
        appendMessage(systemContent, 'system');
        completeChatPerformanceTurn('send:memory-proposal-visible');
        schedulePersonaListRefreshAfterPaint();
        return;
    }
    if (
        !assistantMode
        && !characterPhotoRequest
        && attachmentBundle.attachments.length === 0
        && isExplicitCharacterPhotoRequest(userMessage) && conversationKey!==NATIVE_SYNC_KEY
    ) {
        const systemContent: Content = { photoIntent: createPhotoIntentProposal(userMessage) };
        memoryManager.addMessage(conversationKey, 'system', systemContent);
        appendMessage(systemContent, 'system');
        completeChatPerformanceTurn('send:photo-intent-visible');
        schedulePersonaListRefreshAfterPaint();
        return;
    }
    if (
        !assistantMode
        && !characterPhotoRequest
        && attachmentBundle.attachments.length === 0
    ) {
        const npcPromotion = conversationKey===NATIVE_SYNC_KEY?null:createExplicitNpcPromotionProposal(conversationKey, persona, userMessage);
        if (npcPromotion) {
            const systemContent: Content = { npcProposal: npcPromotion };
            memoryManager.addMessage(conversationKey, 'system', systemContent);
            appendMessage(systemContent, 'system');
            completeChatPerformanceTurn('send:npc-proposal-visible');
            schedulePersonaListRefreshAfterPaint();
            return;
        }
    }
    const request = beginChatRequest(
        personaKey,
        persona,
        assistantMode ? 'assistant' : characterPhotoRequest ? 'photo' : 'character',
        conversationKey,
    );
    request.characterPhotoRequest = !assistantMode && characterPhotoRequest;
    request.photoSenderMemberId = photoSenderMemberId;
    request.photoSubjectMemberIds = photoSubjectMemberIds;
    request.attachments = attachmentBundle.attachments;
    request.attachmentParts = attachmentBundle.contentParts;
    const vpsModel = selectedVpsChatModel();
    if (vpsModel && (!getActiveWorldline(conversationKey)||!request.room) && userMessageMeta?.id && isVpsChatEligible({
        room: Boolean(request.room), assistant: assistantMode, special: characterPhotoRequest || isGodModeActive,
        attachments: attachmentBundle.attachments.length, personaKey,
    })) {
        try {
            if (!navigator.locks || !crypto.subtle) throw Error('VPS_BROWSER_SUPPORT_REQUIRED');
            if(worldLedgerJobs.has(conversationKey))await worldLedgerJobs.get(conversationKey);
            if(!isActiveChatRequest(request)||request.controller.signal.aborted)throw Error('TURN_CANCELLED');
            const worldDigest=await digestVpsWorld(conversationKey);
            request.vpsTurn = {
                identity: { conversationKey, personaKey, userMessageId: userMessageMeta.id,...(worldDigest?{worldDigest}:{}), contextDigestVersion:CURRENT_CONTEXT_DIGEST_VERSION,contextDigest: await digestVpsHistory(memoryManager.peekChatHistory(conversationKey),CURRENT_CONTEXT_DIGEST_VERSION),
                    ...(request.room?{roomDigest:await digestGroupContext(roomManager.getRoom(conversationKey)!,CURRENT_CONTEXT_DIGEST_VERSION),roomMemberId:request.roomMemberId}:{}),
                },
                model: vpsModel,
            };
            if(conversationKey===NATIVE_SYNC_KEY)await nativeHistoryFor(makeVpsBaseHistory(),conversationKey).persistUser(request.vpsTurn.identity);
        } catch (error) {
            finishChatRequest(request, 'error');
            showError('VPS 測試模式未能開始；未提交任何生成任務。');
            return;
        }
    }
    await getResponse(request, userMessage, assistantMode ? selectedAssistantModel : undefined);
};

const dispatchSendMessage = (options: Parameters<typeof sendMessage>[0] = {}) => {
    // Start from the actual send gesture before asynchronous attachment preparation.
    const mediaOwner = !activeChatRequest && currentConversationKey
        && getActiveWorldline(currentConversationKey)
        && !isGodModeActive && Boolean((options?.messageText ?? messageInput.value).trim())
        && worldlineBackgroundMedia.enabled() ? nextChatRequestId : null;
    if(mediaOwner!==null)worldlineBackgroundMedia.start(mediaOwner);
    void sendMessage(options).catch(error => {
        console.error('Unexpected send failure:', error);
        if (activeChatRequest) cancelActiveChatRequest();
        const diagnosed = diagnoseChatFailure(error, Boolean(currentRoom));
        const diagnostic = diagnosed.code.endsWith('_UNKNOWN')
            ? { ...diagnosed, code: currentRoom ? 'GROUP_PREPARE' : 'CHAT_PREPARE' }
            : diagnosed;
        const message = formatChatFailureMessage(diagnostic);
        cancelChatPerformanceTurn('send:error');
        applyChatRuntimeState('error');
        updateSendButtonState();
        showError(message);
        if (currentConversationKey) appendMessage({ text: `[系統] ${message}` }, 'system');
    }).finally(()=>{
        if(mediaOwner!==null&&activeChatRequest?.id!==mediaOwner)worldlineBackgroundMedia.stop(mediaOwner);
    });
};

let albumUi: import('./features/albumUi.js').AlbumUiHandle | null = null;
let albumUiLoad: Promise<import('./features/albumUi.js').AlbumUiHandle> | null = null;

const loadAlbumUi = async () => {
    if (albumUi) return albumUi;
    if (!albumUiLoad) {
        albumUiLoad = import('./features/albumUi.js')
            .then(({ createAlbumUi }) => {
                const ui = createAlbumUi({
                    getContext: () => ({
                        conversationKey: currentConversationKey,
                        personaName: currentPersona?.name || null,
                        roomTitle: currentRoom?.title || null,
                    }),
                    getHistory: conversationKey => memoryManager.getChatHistory(conversationKey),
                    getPersonaName: conversationKey => memoryManager.getPersona(conversationKey)?.name,
                    setHistoryWithoutIndices: (conversationKey, indices) => {
                        if (shouldCancelActiveRequestForConversation(activeChatRequest?.conversationKey, conversationKey)) {
                            cancelActiveChatRequest();
                        }
                        const removed = new Set(indices);
                        const history = memoryManager.getChatHistory(conversationKey);
                        memoryManager.setChatHistory(conversationKey, history.filter((_, index) => !removed.has(index)));
                    },
                    getContentImageUrl,
                    openPhoto: (imageUrl, content, conversationKey) => {
                        openPhotoViewer(
                            imageUrl,
                            buildPhotoViewerContextFromContent(content, 'album', conversationKey),
                        );
                    },
                    createAttachmentCard: createStoredChatAttachmentCard,
                    revokePhotoObjectUrl: assetId => {
                        const objectUrl = characterPhotoObjectUrls.get(assetId);
                        if (objectUrl) URL.revokeObjectURL(objectUrl);
                        characterPhotoObjectUrls.delete(assetId);
                    },
                    refreshChat: conversationKey => startChat(conversationKey),
                    hideMoreOptionsMenu: () => moreOptionsMenu.classList.add('hidden'),
                });
                albumUi = ui;
                return ui;
            })
            .catch(error => {
                albumUiLoad = null;
                throw error;
            });
    }
    return albumUiLoad;
};

const updateAlbumState = () => albumUi?.refresh();
const openAlbumModal = () => {
    void loadAlbumUi()
        .then(ui => ui.open())
        .catch(error => console.error('Failed to load Album UI', error));
};
let photoViewerUi: import('./features/photoViewerUi.js').PhotoViewerUiHandle | null = null;
let photoViewerUiLoad: Promise<import('./features/photoViewerUi.js').PhotoViewerUiHandle> | null = null;

const loadPhotoViewerUi = async () => {
    if (photoViewerUi) return photoViewerUi;
    if (!photoViewerUiLoad) {
        photoViewerUiLoad = import('./features/photoViewerUi.js')
            .then(({ createPhotoViewerUi }) => {
                const ui = createPhotoViewerUi({
                    memoryManager,
                    getImageModels: mode => imageModels[mode],
                    loadImageModels: mode => loadImageModels(mode),
                    getCurrentPersonaName: () => currentPersona?.name || null,
                    getCurrentPersonaKey: () => currentPersonaKey,
                    prepareCharacterAvatarReference,
                    getCharacterPhotoObjectUrl,
                    buildPhotoViewerContextFromContent,
                    addStudioResult: result => {
                        void loadImageStudioUi()
                            .then(ui => ui.addResult(result))
                            .catch(error => {
                                URL.revokeObjectURL(result.url);
                                console.error('Failed to store Image Studio result', error);
                            });
                    },
                    appendVisiblePhoto: content => appendMessage(content, 'bot'),
                    updateAlbumState,
                    handleAuthRequired: () => handleAuthRequired(),
                    syncSharedSeed: (locked, seed) => {
                        imageSeedLock.checked = locked;
                        if (typeof seed === 'number') setSeedInputValue(imageSeed, seed);
                    },
                });
                photoViewerUi = ui;
                return ui;
            })
            .catch(error => {
                photoViewerUiLoad = null;
                throw error;
            });
    }
    return photoViewerUiLoad;
};

const openPhotoViewer = (imageUrl: string, context: PhotoViewerContext) => {
    void loadPhotoViewerUi()
        .then(ui => ui.openPhoto(imageUrl, context))
        .catch(error => console.error('Failed to load Photo Viewer UI', error));
};

const openAvatarFullscreen = (imageUrl: string, personaName: string) => {
    void loadPhotoViewerUi()
        .then(ui => ui.openAvatar(imageUrl, personaName))
        .catch(error => console.error('Failed to load Photo Viewer UI', error));
};

const openImageFullscreen = (imageUrl: string, altText: string) => {
    void loadPhotoViewerUi()
        .then(ui => ui.openImage(imageUrl, altText))
        .catch(error => console.error('Failed to load Photo Viewer UI', error));
};

let participantActionUi: import('./features/participantActionUi.js').ParticipantActionHandle | null = null;
let participantActionUiLoad: Promise<import('./features/participantActionUi.js').ParticipantActionHandle> | null = null;

const loadParticipantActionUi = async () => {
    if (participantActionUi) return participantActionUi;
    if (!participantActionUiLoad) {
        participantActionUiLoad = import('./features/participantActionUi.js')
            .then(({ createParticipantActionUi }) => {
                const ui = createParticipantActionUi({
                    memoryManager,
                    roomManager,
                    getCurrentRoom: () => currentRoom,
                    getCurrentPersona: () => currentPersona,
                    getCurrentPersonaKey: () => currentPersonaKey,
                    getCurrentConversationKey: () => currentConversationKey,
                    hasActiveChatRequest: () => Boolean(activeChatRequest),
                    maybeSummarizePersonaMemory,
                    renderPersonaList,
                    startChat,
                    resolveRoomMemberAvatarPersona,
                    hideRoomInfo: () => roomInfoModal.classList.add('hidden'),
                    hideMoreOptionsMenu: () => moreOptionsMenu.classList.add('hidden'),
                });
                participantActionUi = ui;
                return ui;
            })
            .catch(error => {
                participantActionUiLoad = null;
                throw error;
            });
    }
    return participantActionUiLoad;
};

const openParticipantAction = (mode: import('./features/participantActionUi.js').ParticipantActionMode) => {
    void loadParticipantActionUi()
        .then(ui => ui.open(mode))
        .catch(error => console.error('Failed to load Participant Action UI', error));
};

const openPrivateChatForRoomMember = async (roomId: string, memberId: string) => {
    const ui = await loadParticipantActionUi();
    await ui.openPrivateChat(roomId, memberId);
};

const setRoomMemberPresence = async (roomId: string, memberId: string, present: boolean) => {
    const ui = await loadParticipantActionUi();
    const applied = await ui.setMemberPresence(roomId, memberId, present);
    if (applied && currentConversationKey === roomId) {
        currentRoom = roomManager.getRoom(roomId) || currentRoom;
        renderUiV2ImmersiveSceneChrome();
    }
    return applied;
};
const refreshCurrentRoom = () => {
    if (!currentConversationKey) return null;
    currentRoom = roomManager.getRoom(currentConversationKey) || null;
    return currentRoom;
};

const selectActiveRoomMember = (memberId: string) => {
    const room = refreshCurrentRoom();
    const member = room?.members.find(item => item.id === memberId);
    if (!room || !member) return false;
    activeRoomMemberId = member.id;
    const sourcePersona = member.sourcePersonaKey ? memoryManager.getPersona(member.sourcePersonaKey) : undefined;
    currentPersona = {
        ...member.persona,
        avatarUrl: member.persona.avatarUrl || sourcePersona?.avatarUrl || null,
    };
    currentPersonaKey = member.sourcePersonaKey || `${room.id}:${member.id}`;
    renderPersonaSettingsAvatar();
    return true;
};

const getRoomInfoUiDependencies = () => ({
    getRoom: () => refreshCurrentRoom(),
    getSourcePersona: (personaKey: string) => memoryManager.getPersona(personaKey),
    selectMember: selectActiveRoomMember,
    openPersonaSettingsForMember: (roomId: string, memberId: string) => {
        openPersonaSettings({ roomId, memberId });
    },
    requestMemberAvatar: requestRoomMemberAvatarUpload,
    openPrivateChat: openPrivateChatForRoomMember,
    setMemberPresence: setRoomMemberPresence,
    updateRoom: (roomId: string, updater: (room: ChatRoom) => void) => roomManager.updateRoom(roomId, updater),
    refreshRoom: () => refreshCurrentRoom(),
    canRenameMember: () => !activeChatRequest,
    onMemberRenamed: () => {
        const updated = refreshCurrentRoom();
        if (updated && activeRoomMemberId) selectActiveRoomMember(activeRoomMemberId);
        renderChatHeaderAvatar();
        renderUiV2ImmersiveSceneChrome();
        renderPersonaList();
    },
    onRoomRenamed: () => {
        const updated = refreshCurrentRoom();
        if (!updated) return;
        chatHeaderName.textContent = updated.title;
        chatHeaderName.setAttribute('aria-label', `${updated.title}：開啟群組資料並修改名稱`);
        renderPersonaList();
        renderUiV2ImmersiveSceneChrome();
    },
    isGroupV2Enabled: (roomId: string) => isGroupV2PersonalTrialEnabled(roomId),
    setGroupV2Enabled: (roomId: string, enabled: boolean) => {
        setGroupV2PersonalTrialEnabled(roomId, enabled);
    },
    getActiveMemberId: () => activeRoomMemberId,
    openPersonaSettingsFallback: () => {
        openPersonaSettings();
    },
    hideMoreOptionsMenu: () => moreOptionsMenu.classList.add('hidden'),
});

const renderRoomInfo = () => {
    void import('./features/roomInfoUi.js')
        .then(({ refreshRoomInfo }) => refreshRoomInfo(getRoomInfoUiDependencies()))
        .catch(error => console.error('Failed to refresh Room Info UI', error));
};

const openRoomInfo = () => {
    void import('./features/roomInfoUi.js')
        .then(({ openRoomInfo: openRoomInfoUi }) => openRoomInfoUi(getRoomInfoUiDependencies()))
        .catch(error => console.error('Failed to load Room Info UI', error));
};
const openWorldline = async (source: 'new' | 'current' = 'current') => {
    if (activeChatRequest) {
        alert('請等目前回覆完成後，再開啟或修改世界線。');
        return;
    }
    try {
        const { openWorldlineUi } = await import('./features/worldlineUi.js');
        openWorldlineUi({
            getActiveConversation: () => currentConversationKey
                ? {
                    key: currentConversationKey,
                    title: currentRoom?.title || currentPersona?.conversationLabel
                        || currentPersona?.name || '目前對話',
                    isAssistant: isAssistantConversationKey(
                        currentConversationKey, VENICE_ASSISTANT_PERSONA_KEY,
                    ),
                } : null,
            createNarratorConversation: title => {
                const key = memoryManager.saveCustomPersona({
                    name: '世界敘述者',
                    emoji: '🌌',
                    gender: 'female',
                    description: 'AIGF Worldline 的世界敘事者；負責描述世界、其他 NPC 同事件，而唔係固定戀愛對象。',
                    prompt: [
                        'You are the disembodied narrator / game-master of a living interactive-fiction world.',
                        'You are NOT a romanceable participant, fixed narrator avatar or girlfriend.',
                        'Use in-world vivid narration and attributed NPC dialogue, including any adult characters.',
                        'Do not assign the player actions, consent, thoughts or automatic romantic feelings.',
                        'Maintain a primary story arc, ongoing NPC agendas and independent world pressures.',
                        'Let the player ignore quests, pursue romance, train, travel or change the world.',
                        'Never reduce the world to fixed 3-choice menus or generic surprise event cards.',
                        'The persistent worldline state attached to this conversation determines powers and canon.',
                    ].join('\n'),
                    greeting: '（一個新世界等待揭曉。序章會喺你開始世界線之後展開。）',
                    avatarPrompt: 'original fantasy world atlas with an ancient glowing gateway, landscape, no people, no writing',
                });
                memoryManager.updatePersona(key, { conversationLabel: title });
                renderPersonaList();
                return key;
            },
            openConversation: key => {
                if (currentConversationKey !== key) startChat(key, null, 'push');
            },
            dispatchText: text => { void sendMessage({ messageText: text }); },
            generateRandomQuest: async input => {
                const { buildRandomMainQuestMessages, normalizeRandomMainQuest } =
                    await import('./worldlineRandomQuest.js');
                const seed = Math.floor(Math.random() * 2_000_000_000);
                const result = await generateChatTextWithTimeout({
                    model: chatModelSettings.primary || VENICE_CHAT_MODEL,
                    messages: buildRandomMainQuestMessages(input),
                    maxCompletionTokens: 900,
                    temperature: 1.04,
                    topP: 0.94,
                    repetitionPenalty: 1.05,
                    seed,
                    stop: [],
                }, 65_000);
                return normalizeRandomMainQuest(result.text);
            },
            getWorldLedger: key => projectWorld(localStorage.getItem(WORLD_LEDGER_KEY), key, memoryManager.peekChatHistory(key)),
            rebuildWorldLedger: (key,skipIds) => syncWorldLedger(key,false,skipIds),
            afterWorldlineChange: () => {
                renderPersonaList();
                if (currentConversationKey) {
                    const world = getActiveWorldline(currentConversationKey);
                    document.documentElement.classList.toggle('aigf-worldline-active', Boolean(world));
                }
            },
        }, source);
    } catch (error) {
        console.error('Unable to open Worldline panel', error);
        alert('世界線介面暫時未能開啟。');
    }
};

const getRoomMemoryUiDependencies = () => ({
    getContext: () => ({
        room: refreshCurrentRoom(),
        personaKey: currentPersonaKey,
        persona: currentPersona,
        activeRoomMemberId,
    }),
    memoryManager,
    roomManager,
    isRoomSummaryInFlight: (roomId: string) => roomSummaryInFlight.has(roomId),
    isPersonaSummaryInFlight: (personaKey: string) => personaSummaryInFlight.has(personaKey),
    summarizeRoomMemory: maybeSummarizeRoomMemory,
    summarizePersonaMemory: maybeSummarizePersonaMemory,
    handleAuthRequired,
    authRequiredError: VENICE_AUTH_REQUIRED_ERROR,
    sanitizeFailureDetail: sanitizeChatFailureDetail,
    summaryTurnInterval: ROOM_MEMORY_SUMMARY_TURN_INTERVAL,
    recentMessageLimit: AUTO_MEMORY_RECENT_MESSAGE_LIMIT,
    getSessionMemories,
});

const openRoomMemory = async () => {
    if (!currentRoom && (!currentPersonaKey || !currentPersona)) return;
    const { openRoomMemory: openRoomMemoryUi } = await import('./features/roomMemoryUi.js');
    openRoomMemoryUi(getRoomMemoryUiDependencies());
};

const refreshRoomMemoryIfOpen = () => {
    const modal = document.getElementById('room-memory-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    void import('./features/roomMemoryUi.js')
        .then(({ refreshRoomMemory }) => refreshRoomMemory(getRoomMemoryUiDependencies()))
        .catch(error => console.error('Failed to refresh Room Memory UI', error));
};
const openCreateGroup = async (targetRoomId: string | null = null) => {
    const { openCreateGroup: openCreateGroupUi } = await import('./features/createGroupUi.js');
    openCreateGroupUi(targetRoomId, {
        roomManager,
        memoryManager,
        hideNewChatMenu: () => newChatMenu.classList.add('hidden'),
        afterMembersAdded: () => {
            refreshCurrentRoom();
            renderRoomInfo();
            renderPersonaList();
        },
        afterRoomCreated: roomId => {
            renderPersonaList();
            startChat(roomId);
        },
    });
};
let personaSettingsUiLoad: Promise<import('./features/personaSettingsUi.js').PersonaSettingsUiHandle> | null = null;

const loadPersonaSettingsUi = async () => {
    if (personaSettingsUi) return personaSettingsUi;
    if (!personaSettingsUiLoad) {
        personaSettingsUiLoad = import('./features/personaSettingsUi.js')
            .then(({ createPersonaSettingsUi }) => {
                const ui = createPersonaSettingsUi({
                    getCurrentPersona: () => currentPersona,
                    getCurrentPersonaKey: () => currentPersonaKey,
                    resolvePublicIdentity: requestPublicIdentityResolution,
                    requestAvatar: (target, personaKey) => {
                        if (target) {
                            requestRoomMemberAvatarUpload(target.roomId, target.memberId);
                        } else if (personaKey) {
                            requestPersonaAvatarUpload(personaKey);
                        }
                    },
                    applySettings: ({
                        personaKey,
                        roomTarget,
                        updates,
                        previousGreeting,
                        greeting,
                        publicIdentityEnabled,
                    }) => {
                        if (!currentPersona) return;
                        if (roomTarget) {
                            roomManager.updateMember(roomTarget.roomId, roomTarget.memberId, { persona: updates });
                            if (currentRoom?.id === roomTarget.roomId) {
                                currentRoom = roomManager.getRoom(roomTarget.roomId) || currentRoom;
                            }
                        } else {
                            memoryManager.updatePersona(personaKey, updates);
                        }

                        Object.assign(currentPersona, updates);
                        if (updates.avatarUrl) {
                            renderChatHeaderAvatar();
                            personaSettingsUi?.refreshAvatar();
                        }

                        if (!roomTarget) {
                            const history = memoryManager.getChatHistory(personaKey);
                            if (
                                history.length === 1 &&
                                history[0].role === 'model' &&
                                history[0].content.text === previousGreeting &&
                                greeting
                            ) {
                                history[0].content.text = greeting;
                                memoryManager.setChatHistory(personaKey, history);
                            }
                        }

                        renderPersonaList();
                        appendMessage({
                            text: publicIdentityEnabled
                                ? '[系統] 人格與公開身份設定已更新；角色照片會使用已確認身份進行文字生成。'
                                : '[系統] 人格設定已更新，後續回覆會依照新設定生成。',
                        }, 'system');
                    },
                });
                personaSettingsUi = ui;
                return ui;
            })
            .catch(error => {
                personaSettingsUiLoad = null;
                throw error;
            });
    }
    return personaSettingsUiLoad;
};

const openPersonaSettings = (
    roomTarget: import('./features/personaSettingsUi.js').PersonaSettingsRoomTarget = null,
) => {
    void loadPersonaSettingsUi()
        .then(ui => ui.open(roomTarget))
        .catch(error => console.error('Failed to load Persona Settings UI', error));
};

const closePersonaSettings = () => personaSettingsUi?.close();
const startNewScene = () => {
    void import('./features/newSceneAction.js')
        .then(({ startNewScene: runNewSceneAction }) => runNewSceneAction({
            memoryManager,
            roomManager,
            getConversationKey: () => currentConversationKey,
            getPersonaKey: () => currentPersonaKey,
            getPersona: () => currentPersona,
            getRoom: () => currentRoom,
            summarizeRoomMemory: maybeSummarizeRoomMemory,
            summarizePersonaMemory: maybeSummarizePersonaMemory,
            appendSceneStart: () => appendMessage({ text: SCENE_START_LABEL }, 'system'),
            refreshCurrentRoom,
            hideMoreOptionsMenu: () => moreOptionsMenu.classList.add('hidden'),
            sceneEndMarker: SCENE_END_MARKER,
        }))
        .catch(error => console.error('Failed to start new scene', error));
};
let photoPromptUi: import('./features/photoPromptUi.js').PhotoPromptUiHandle | null = null;
let photoPromptUiLoad: Promise<import('./features/photoPromptUi.js').PhotoPromptUiHandle> | null = null;

const loadPhotoPromptUi = async () => {
    if (photoPromptUi) return photoPromptUi;
    if (!photoPromptUiLoad) {
        photoPromptUiLoad = import('./features/photoPromptUi.js')
            .then(({ createPhotoPromptUi }) => {
                const ui = createPhotoPromptUi({
                    getContext: () => ({
                        personaKey: currentPersonaKey,
                        personaName: currentPersona?.name || null,
                        room: currentRoom,
                        activeRoomMemberId,
                        assistantMode: isAssistantPersonaKey(currentPersonaKey),
                        godMode: isGodModeActive,
                    }),
                    selectActiveRoomMember,
                    sendPhotoRequest: input => sendMessage({
                        characterPhotoRequest: true,
                        photoSenderMemberId: input.photoSenderMemberId,
                        photoSubjectMemberIds: input.photoSubjectMemberIds,
                        messageText: input.messageText,
                    }),
                    hideMoreOptionsMenu: () => moreOptionsMenu.classList.add('hidden'),
                });
                photoPromptUi = ui;
                return ui;
            })
            .catch(error => {
                photoPromptUiLoad = null;
                throw error;
            });
    }
    return photoPromptUiLoad;
};

const openPhotoPromptModal = () => {
    void loadPhotoPromptUi()
        .then(ui => ui.open())
        .catch(error => console.error('Failed to load Photo Prompt UI', error));
};
// --- Event Listeners ---
const activateConversationSearch = () => {
    if (!conversationSearchUserActivated && conversationSearchInput.value) {
        conversationSearchInput.value = '';
        renderPersonaList();
    }
    conversationSearchUserActivated = true;
};

const guardConversationSearchFromAutofill = () => {
    conversationSearchUserActivated = false;
    const clearPassiveAutofill = () => {
        if (conversationSearchUserActivated || !conversationSearchInput.value) return;
        conversationSearchInput.value = '';
        renderPersonaList();
    };
    [0, 250, 1000, 2500].forEach(delay => window.setTimeout(clearPassiveAutofill, delay));
};

const setupEventListeners = () => {
    const moreOptionsMenuHome = moreOptionsMenu.parentElement;
    const shouldPortalUiV2MoreOptionsMenu = () => (
        document.documentElement.dataset.wetappUi === 'v2'
        && window.matchMedia('(max-width: 767px)').matches
    );
    const syncUiV2MoreOptionsMenuPortal = () => {
        if (shouldPortalUiV2MoreOptionsMenu()) {
            if (moreOptionsMenu.parentElement !== document.body) document.body.appendChild(moreOptionsMenu);
            return;
        }
        if (moreOptionsMenuHome && moreOptionsMenu.parentElement !== moreOptionsMenuHome) {
            moreOptionsMenuHome.appendChild(moreOptionsMenu);
        }
    };

    const ensureUiV2HomeStructure = () => {
        if (document.documentElement.dataset.wetappUi !== 'v2') return;
        if (document.querySelector('.v2-home-quick-actions')) return;

        const sidebar = document.getElementById('persona-selection-view');
        const searchWrap = sidebar?.querySelector('.conversation-search-wrap');
        const pinnedSection = sidebar?.querySelector('.pinned-conversations');
        const recentSection = sidebar?.querySelector('.recent-conversations');
        if (!sidebar || !searchWrap || !pinnedSection || !recentSection) return;

        const quickSection = document.createElement('section');
        quickSection.className = 'v2-home-quick-actions';
        quickSection.setAttribute('aria-label', '快速操作');

        const quickHeading = document.createElement('div');
        quickHeading.className = 'v2-home-quick-heading';
        quickHeading.innerHTML = '<span>QUICK ACTIONS</span><small>建立與創作</small>';

        const quickGrid = document.createElement('div');
        quickGrid.className = 'v2-home-quick-grid';

        imageStudioEntry.classList.add('v2-home-quick-action', 'v2-home-image-action');
        videoStudioEntry.classList.add('v2-home-quick-action', 'v2-home-video-action');

        quickGrid.append(imageStudioEntry, videoStudioEntry);
        quickSection.append(quickHeading, quickGrid);
        searchWrap.insertAdjacentElement('afterend', quickSection);

        const pinnedLabel = pinnedSection.querySelector('.conversation-section-label');
        if (pinnedLabel) pinnedLabel.textContent = '助手';
        const recentLabel = recentSection.querySelector('.conversation-section-label');
        if (recentLabel) recentLabel.textContent = '最近';

        pinnedSection.classList.add('v2-home-assistant-section');
        recentSection.classList.add('v2-home-recent-section');
    };
    ensureUiV2HomeStructure();

    const ensureUiV2ThemeControl = () => {
        if (document.documentElement.dataset.wetappUi !== 'v2') return;
        if (document.getElementById('ui-v2-theme-toggle')) return;

        const storageKey = 'wetappUiV2Theme';
        const applyTheme = (theme: 'light' | 'dark') => {
            document.documentElement.dataset.wetappTheme = theme;
            try {
                localStorage.setItem(storageKey, theme);
            } catch {
                // Theme preference is optional; keep the in-memory choice if storage is unavailable.
            }
            const button = document.getElementById('ui-v2-theme-toggle');
            if (button) {
                button.textContent = theme === 'dark' ? '切換淺色模式' : '切換深色模式';
                button.setAttribute('aria-pressed', String(theme === 'dark'));
            }
        };

        let initialTheme: 'light' | 'dark' = 'light';
        try {
            initialTheme = localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
        } catch {
            initialTheme = 'light';
        }
        document.documentElement.dataset.wetappTheme = initialTheme;

        const button = document.createElement('button');
        button.id = 'ui-v2-theme-toggle';
        button.type = 'button';
        button.className = 'wa-popover-item ui-v2-theme-toggle';
        button.addEventListener('click', event => {
            event.stopPropagation();
            const next = document.documentElement.dataset.wetappTheme === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            homeMenu.classList.add('hidden');
        });
        homeMenu.appendChild(button);
        applyTheme(initialTheme);
    };
    ensureUiV2ThemeControl();

    // New layout is the default; classic stays available without losing local chats.
    if (!document.getElementById('aigf-layout-style-toggle')) {
        const switchLayout = document.createElement('button');
        switchLayout.type = 'button';
        switchLayout.id = 'aigf-layout-style-toggle';
        switchLayout.className = 'wa-popover-item';
        const inNewLayout = document.documentElement.dataset.wetappUi === 'v2';
        switchLayout.textContent = inNewLayout ? '介面：現代版（切換經典版）'
            : '介面：經典版（切換現代版）';
        switchLayout.addEventListener('click', () => {
            const next = inNewLayout ? 'classic' : 'v2';
            try {
                localStorage.setItem('wetappUiPreferenceV1', next);
                if (localStorage.getItem('wetappUiPreferenceV1') !== next) throw Error('UI_PREFERENCE_NOT_SAVED');
                const url = new URL(window.location.href);
                url.searchParams.delete('ui');
                window.location.assign(url.toString());
            } catch {
                alert('無法保存版面選擇；可於網址使用 ?ui=classic 或 ?ui=v2 切換。');
            }
        });
        homeMenu.appendChild(switchLayout);
    }

    const ensureUiV2MoreOptionsGroups = () => {
        if (document.documentElement.dataset.wetappUi !== 'v2') return;
        if (moreOptionsMenu.querySelector('.v2-more-options-layout')) return;

        const labels: Array<{
            key: string;
            title: string;
            ids: string[];
        }> = [
            {
                key: 'interaction',
                title: '互動',
                ids: [
                    'interaction-preferences-menu-btn',
                    'director-menu-btn',
                    'continue-scene-menu-btn',
                    'latest-branch-menu-btn',
                ],
            },
            {
                key: 'character',
                title: '角色',
                ids: [
                    'room-info-btn',
                    'dm-room-member-btn',
                    'invite-character-btn',
                    'leave-room-member-btn',
                    'persona-settings-btn',
                    'change-avatar-btn',
                ],
            },
            {
                key: 'scene',
                title: '場景',
                ids: [
                    'scene-wardrobe-menu-btn',
                    'new-scene-btn',
                    'surprise-event-btn',
                ],
            },
            {
                key: 'memory',
                title: '記憶',
                ids: [
                    'memory-btn',
                ],
            },
            {
                key: 'media',
                title: '媒體',
                ids: [
                    'album-btn',
                    'attach-file-menu-btn',
                    'take-photo-btn',
                ],
            },
            {
                key: 'tools',
                title: '工具',
                ids: [
                    'usage-diagnostics-menu-btn',
                    'performance-diagnostics-menu-btn',
                    'jev-shadow-menu-btn',
                    'cc-model-settings-btn',
                ],
            },
            {
                key: 'manage',
                title: '管理',
                ids: [
                    'download-images-btn',
                    'download-chat-btn',
                    'download-all-chats-btn',
                    'clear-chat-btn',
                ],
            },
        ];

        const icons: Record<string, string> = {
            'interaction-preferences-menu-btn': '⌁',
            'director-menu-btn': '✦',
            'continue-scene-menu-btn': '↗',
            'room-info-btn': '◎',
            'dm-room-member-btn': '↗',
            'invite-character-btn': '+',
            'leave-room-member-btn': '−',
            'memory-btn': '♡',
            'persona-settings-btn': '♙',
            'cc-model-settings-btn': '⌁',
            'scene-wardrobe-menu-btn': '◫',
            'new-scene-btn': '◫',
            'surprise-event-btn': '✦',
            'album-btn': '▧',
            'attach-file-menu-btn': '＋',
            'change-avatar-btn': '◉',
            'take-photo-btn': '◎',
            'usage-diagnostics-menu-btn': '123',
            'performance-diagnostics-menu-btn': '⚡',
            'jev-shadow-menu-btn': 'J',
            'download-images-btn': '↓',
            'download-chat-btn': '⇩',
            'download-all-chats-btn': '⇊',
            'clear-chat-btn': '×',
        };

        const layout = document.createElement('div');
        layout.className = 'v2-more-options-layout';

        const heading = document.createElement('div');
        heading.className = 'v2-more-options-heading';

        const headingCopy = document.createElement('div');
        headingCopy.className = 'v2-more-options-heading-copy';
        headingCopy.innerHTML = '<strong>聊天室</strong><span>選擇你想做的事</span>';

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'v2-more-options-close';
        closeButton.setAttribute('aria-label', '關閉聊天室選單');
        closeButton.title = '關閉';
        closeButton.textContent = '×';
        closeButton.addEventListener('click', () => moreOptionsMenu.classList.add('hidden'));

        heading.append(headingCopy, closeButton);
        layout.appendChild(heading);

        labels.forEach(group => {
            const section = document.createElement('section');
            section.className = `v2-more-options-section v2-more-options-section-${group.key}`;

            const title = document.createElement('p');
            title.className = 'v2-more-options-section-title';
            title.textContent = group.title;

            const grid = document.createElement('div');
            grid.className = 'v2-more-options-grid';

            group.ids.forEach(id => {
                const button = document.getElementById(id);
                if (!button) return;
                button.dataset.v2Icon = icons[id] || '•';
                grid.appendChild(button);
            });

            section.append(title, grid);
            layout.appendChild(section);
        });

        moreOptionsMenu.querySelectorAll(':scope > .border-t').forEach(separator => separator.remove());
        moreOptionsMenu.appendChild(layout);
    };
    ensureUiV2MoreOptionsGroups();

    authForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        await submitUnlock();
    });
    authPasswordInput.addEventListener('input', () => {
        hideAuthError();
    });
    attachFileMenuBtn.addEventListener('click', () => {
        moreOptionsMenu.classList.add('hidden');
        chatAttachmentInput.click();
    });
    chatAttachmentInput.addEventListener('change', () => void handleChatAttachmentSelection());
    composerCameraButton.addEventListener('click', openPhotoPromptModal);
    document.getElementById('worldline-director-button')?.addEventListener('click',async()=>{
        const key=currentConversationKey;
        if(!key||!getActiveWorldline(key))return;
        const {openWorldlineDirector}=await import('./features/worldlineDirectorUi.js');
        if(currentConversationKey===key)openWorldlineDirector(key,()=>buildWorldlinePromptParts(key,'',readDirector(localStorage,key)),key===NATIVE_SYNC_KEY?async mutate=>{
            if(!nativeStoryPilot||nativeStoryBusy||activeChatRequest||resumingVpsTurn||pendingVpsTurn())throw Error('請先完成目前同步或生成任務。');
            nativeStoryBusy=true;try{await nativeStoryPilot.saveSettings(mutate);}finally{nativeStoryBusy=false;updateSendButtonState();}
        }:undefined);
    });
    chatSearchBtn.addEventListener('click', openChatSearch);
    homeSearchToggle.addEventListener('click', () => {
        activateConversationSearch();
        conversationSearchInput.focus();
    });
    conversationSearchInput.addEventListener('pointerdown', activateConversationSearch);
    conversationSearchInput.addEventListener('keydown', activateConversationSearch);
    conversationSearchInput.addEventListener('input', renderPersonaList);
    homeMenuToggle.addEventListener('click', event => {
        event.stopPropagation();
        homeMenu.classList.toggle('hidden');
        newChatMenu.classList.add('hidden');
    });
    homeChatModelSettingsBtn.addEventListener('click', () => openChatModelSettings('global'));
    homeLiveCloudBtn.addEventListener('click', openSupabaseCloud);
    homeCloudBackupBtn.addEventListener('click', openCloudBackup);
    homeExportAll.addEventListener('click', () => {
        void loadFileManager()
            .then(manager => manager.saveAllChats())
            .catch(error => console.error('Failed to export all chats', error));
        homeMenu.classList.add('hidden');
    });
    newChatFab.addEventListener('click', event => {
        event.stopPropagation();
        newChatMenu.classList.toggle('hidden');
        homeMenu.classList.add('hidden');
    });
    createGroupRoomBtn.addEventListener('click', () => { void openCreateGroup(); });
    if (!document.getElementById('aigf-new-worldline-btn')) {
        const createWorldlineButton = document.createElement('button');
        createWorldlineButton.id = 'aigf-new-worldline-btn';
        createWorldlineButton.type = 'button';
        createWorldlineButton.className = 'dropdown-item aigf-worldline-entry';
        createWorldlineButton.textContent = '🌌 開始全新世界線（修仙／轉生／系統流）';
        createWorldlineButton.addEventListener('click', () => {
            newChatMenu.classList.add('hidden');
            void openWorldline('new');
        });
        newChatMenu.appendChild(createWorldlineButton);
    }
    if (!document.getElementById('aigf-worldline-menu-btn')) {
        const worldlineMenuButton = document.createElement('button');
        worldlineMenuButton.id = 'aigf-worldline-menu-btn';
        worldlineMenuButton.type = 'button';
        worldlineMenuButton.className = 'dropdown-item aigf-worldline-entry';
        worldlineMenuButton.dataset.v2Icon = '✧';
        worldlineMenuButton.textContent = '世界線 · 主線／金手指／NPC';
        worldlineMenuButton.addEventListener('click', () => {
            moreOptionsMenu.classList.add('hidden');
            void openWorldline('current');
        });
        moreOptionsMenu.prepend(worldlineMenuButton);
        moreOptionsMenu.querySelector('.v2-more-options-section-interaction .v2-more-options-grid')
            ?.appendChild(worldlineMenuButton);
    }
    if(!document.getElementById('worldline-background-media-btn')){
        const button=document.createElement('button');
        button.id='worldline-background-media-btn';button.type='button';
        button.className='dropdown-item aigf-worldline-entry';button.dataset.v2Icon='♪';
        const refresh=()=>{
            const state=worldlineBackgroundMedia.getState();
            button.textContent='靜音背景生成（實驗）：'+(worldlineBackgroundMedia.enabled()?'開':'關');
            button.setAttribute('aria-pressed',String(worldlineBackgroundMedia.enabled()));
            button.title='只在 Worldline 生成期間嘗試播放靜音音訊；不保證手機鎖屏後繼續。狀態：'+state;
        };
        refresh();
        button.addEventListener('click',()=>{
            const enabled=!worldlineBackgroundMedia.enabled();
            if(!worldlineBackgroundMedia.setEnabled(enabled)){alert('未能保存背景生成設定。');return;}
            if(enabled&&activeChatRequest&&getActiveWorldline(activeChatRequest.conversationKey))worldlineBackgroundMedia.start(activeChatRequest.id);
            refresh();
        });
        moreOptionsMenu.prepend(button);
        moreOptionsMenu.querySelector('.v2-more-options-section-interaction .v2-more-options-grid')?.appendChild(button);
    }
    if(!document.getElementById('aigf-predictive-lab-btn')){
        const button=document.createElement('button');
        button.id='aigf-predictive-lab-btn';button.type='button';button.className='dropdown-item aigf-worldline-entry';
        button.dataset.v2Icon='↯';button.textContent='預判式對話實驗室';
        button.addEventListener('click',()=>{
            moreOptionsMenu.classList.add('hidden');
            void import('./predictiveLab.js').then(({openPredictiveLab})=>openPredictiveLab(async(history,signal)=>{
                return generateChatTextWithTimeout({
                    model:chatModelSettings.primary||VENICE_CHAT_MODEL,
                    messages:[{role:'system',content:'You are a fictional conversational partner in an isolated timing experiment. Reply in natural, brief Traditional Chinese or the language the user uses. Use one or two conversational sentences. This is not the existing story or persona.'},...history],
                    signal,maxCompletionTokens:160,temperature:0.75,stop:[],
                });
            }));
        });
        moreOptionsMenu.prepend(button);
        moreOptionsMenu.querySelector('.v2-more-options-section-interaction .v2-more-options-grid')?.appendChild(button);
    }
    if (VPS_CHAT_BUILD) {
        // Keep engineering recovery controls out of the ordinary conversation layout.
        const toolsDialog=document.createElement('dialog');
        toolsDialog.id='aigf-vps-tools';toolsDialog.style.cssText='width:min(92vw,440px);max-height:80vh;overflow:auto;padding:20px;border-radius:14px;border:1px solid #c9c4bc;background:#fff;color:#252321;color-scheme:light';
        const heading=document.createElement('h3');heading.textContent='背景生成與任務恢復';heading.style.cssText='font-size:18px;font-weight:600;margin:0 0 12px';
        const controls=document.createElement('div');controls.style.cssText='display:grid;gap:8px';
        const label=document.createElement('p');label.style.cssText='font-size:13px;line-height:1.5;color:#555;overflow-wrap:anywhere';
        const refreshMode=()=>{const model=selectedVpsChatModel();label.textContent=(model?'背景生成：'+model:'目前使用直連：'+chatModelSettings.primary)+'。模型沿用原有設定；預覽版雲端只讀。';};
        const fallback=document.createElement('button');fallback.type='button';
        const refreshFallback=()=>{fallback.textContent=localStorage.getItem(VPS_CHAT_MODE_KEY)==='1'?'恢復自動背景生成':'暫用原有直連';};
        fallback.onclick=()=>{if(activeChatRequest||pendingVpsTurn()){alert('先處理原有任務。');return;}if(localStorage.getItem(VPS_CHAT_MODE_KEY)==='1')localStorage.removeItem(VPS_CHAT_MODE_KEY);else localStorage.setItem(VPS_CHAT_MODE_KEY,'1');refreshMode();refreshFallback();};
        const resume=document.createElement('button');resume.type='button';resume.textContent='取回 VPS 回覆';resume.onclick=()=>void resumeVpsChatTurn(true);
        const abandon=document.createElement('button');abandon.type='button';abandon.textContent='放棄待處理回覆';abandon.onclick=()=>{if(activeChatRequest||resumingVpsTurn)return;const p=pendingVpsTurn();if(p&&confirm('放棄本機待處理回覆？VPS 已開始的生成可能仍會扣費；此操作不會取消伺服器任務。'))void makeVpsTurnController().abandon(p.jobId).then(()=>{hideError();updateSendButtonState();}).catch(()=>showError('未能放棄原任務。'));};
        const memoryResume=document.createElement('button');memoryResume.type='button';memoryResume.textContent='取回記憶摘要';memoryResume.onclick=()=>{void resumeVpsPersonaMemory();void resumeVpsGroupMemory();};
        const memoryAbandon=document.createElement('button');memoryAbandon.type='button';memoryAbandon.textContent='放棄待處理摘要';memoryAbandon.onclick=()=>{if(vpsMemoryBusy)return;void makeVpsMemoryTask().then(async task=>{const p=task.pending();if(p&&confirm('放棄本機待處理摘要？已開始的生成可能仍會扣費。'))await task.abandon(p.jobId);}).catch(()=>showError('未能放棄記憶摘要。'));};
        const groupMemoryAbandon=document.createElement('button');groupMemoryAbandon.type='button';groupMemoryAbandon.textContent='放棄群組待處理摘要';groupMemoryAbandon.onclick=()=>{if(vpsGroupMemoryBusy)return;void makeVpsGroupMemoryTask().then(async task=>{const p=task.pending();if(p&&confirm('放棄本機群組待處理摘要？已開始的生成可能仍會扣費。'))await task.abandon(p.jobId);}).catch(()=>showError('未能放棄群組摘要。'));};
        const findRecovery=document.createElement('button');findRecovery.type='button';findRecovery.textContent='尋找其他裝置任務';
        findRecovery.onclick=async()=>{
            if(activeChatRequest||resumingVpsTurn||!isUnlocked)return;
            findRecovery.disabled=true;
            toolsDialog.close();
            try{
                const rows=await listVpsRecovery();
                const dialog=document.createElement('dialog');dialog.style.cssText='max-width:min(95vw,640px);max-height:80vh;overflow:auto;padding:16px';
                const title=document.createElement('h3');title.textContent='最近 VPS 聊天任務（約24小時）';
                const note=document.createElement('p');note.textContent='相同私人 App 登入可查看；必須有相同聊天紀錄才可恢復寫入。手動查看只展示未經本機驗證的生成文字。';
                const close=document.createElement('button');close.textContent='關閉';close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());
                dialog.append(title,note,close);
                if(!rows.length){const empty=document.createElement('p');empty.textContent='沒有可恢復的新版任務。';dialog.append(empty);}
                for(const row of rows){
                    const item=document.createElement('section');item.style.cssText='border-top:1px solid #8885;padding:8px 0';
                    const label=document.createElement('p');label.textContent=new Date(row.receipt.createdAt).toLocaleString()+' · '+row.receipt.personaKey+' · '+row.status+' · '+row.receipt.jobId;
                    item.append(label);
                    if(['queued','running','done'].includes(row.status)){
                        const adopt=document.createElement('button');adopt.textContent='恢復至本機對話';
                        adopt.onclick=async()=>{if(activeChatRequest||resumingVpsTurn||!isUnlocked)return;adopt.disabled=true;try{const outcome=await makeVpsTurnController().adoptRecovery(row.receipt);dialog.close();if(outcome==='already-applied'){alert('本機已有此回覆。');return;}await resumeVpsChatTurn(true);}catch(e){alert('未能恢復：'+(e instanceof Error?e.message:'UNKNOWN')+'。請先還原相同聊天紀錄；不會重新生成。');adopt.disabled=false;}};
                        item.append(adopt);
                    }
                    if(row.status==='done'){
                        const raw=document.createElement('button');raw.textContent='只查看生成文字';
                        raw.onclick=async()=>{raw.disabled=true;try{const text=await readVpsRecoveryText(row);const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';pre.textContent=text;item.append(pre);}catch(e){alert('未能讀取：'+(e instanceof Error?e.message:'UNKNOWN'));raw.disabled=false;}};
                        item.append(raw);
                    }
                    dialog.append(item);
                }
                document.body.append(dialog);dialog.showModal();
            }catch(e){showError('未能查找 VPS 任務：'+(e instanceof Error?e.message:'UNKNOWN'));}
            finally{findRecovery.disabled=false;}
        };
        controls.append(label,fallback,resume,findRecovery,memoryResume,abandon,memoryAbandon,groupMemoryAbandon);
        if(import.meta.env?.VITE_AIGF_SYNC_PILOT_KEY){
            const syncPilot=document.createElement('button');syncPilot.type='button';syncPilot.textContent='跨裝置同步試用';
            syncPilot.style.cssText='color:#171717;background:#fff;padding:4px 8px;border-radius:4px';
            syncPilot.onclick=()=>{toolsDialog.close();openNativeStoryPilot();};
            controls.append(syncPilot);
            const mediaPilot=document.createElement('button');mediaPilot.type='button';mediaPilot.textContent='媒體同步試用（新生成圖片及影片）';
            mediaPilot.onclick=()=>{toolsDialog.close();openPilotMediaLogin();};controls.append(mediaPilot);
        }
        const closeTools=document.createElement('button');closeTools.type='button';closeTools.textContent='關閉';closeTools.onclick=()=>toolsDialog.close();controls.append(closeTools);
        controls.querySelectorAll('button').forEach(b=>{b.style.cssText='text-align:left;padding:9px 12px;border:1px solid #d9d5ce;background:#f7f6f3;color:#252321;border-radius:8px;font-size:13px;cursor:pointer';});
        toolsDialog.append(heading,controls);document.body.append(toolsDialog);
        const toolsEntry=document.createElement('button');toolsEntry.type='button';toolsEntry.id='aigf-vps-tools-entry';toolsEntry.className='dropdown-item';toolsEntry.dataset.v2Icon='↻';toolsEntry.textContent='背景生成與任務恢復';
        toolsEntry.onclick=()=>{moreOptionsMenu.classList.add('hidden');refreshMode();refreshFallback();toolsDialog.showModal();};
        moreOptionsMenu.prepend(toolsEntry);
        moreOptionsMenu.querySelector('.v2-more-options-section-interaction .v2-more-options-grid')?.appendChild(toolsEntry);
        if(ATOMIC_CLOUD_PREVIEW)window.setInterval(()=>{if(document.visibilityState==='visible'&&currentConversationKey&&memoryManager.peekChatHistory(currentConversationKey).at(-1)?.role==='user')void resumeVpsChatTurn();},8000);
        if(nativePilotEnabled){window.setInterval(()=>{if(document.visibilityState==='visible')void syncNativeStoryPilot();},8000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void syncNativeStoryPilot();});}
        window.addEventListener('online',()=>{void resumeVpsChatTurn();void resumeVpsPersonaMemory();void resumeVpsGroupMemory();void syncNativeStoryPilot();});
        window.addEventListener('pageshow',()=>{void resumeVpsChatTurn();void resumeVpsPersonaMemory();void resumeVpsGroupMemory();});
        document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void resumeVpsChatTurn();void resumeVpsPersonaMemory();void resumeVpsGroupMemory();}});
    }
    closeSurpriseEventOptionsBtn.addEventListener('click', closeSurpriseEventOptions);
    cancelSurpriseEventOptionsBtn.addEventListener('click', closeSurpriseEventOptions);
    confirmSurpriseEventOptionsBtn.addEventListener('click', confirmSurpriseEventOptions);
    surpriseEventSelectAll.addEventListener('change', () => {
        surpriseEventMemberList
            .querySelectorAll<HTMLInputElement>('input[data-surprise-event-member-id]')
            .forEach(input => { input.checked = surpriseEventSelectAll.checked; });
        syncSurpriseEventMemberSelection();
    });
    surpriseEventOptionsModal.addEventListener('click', event => {
        if (event.target === surpriseEventOptionsModal) closeSurpriseEventOptions();
    });
    ccModelSettingsBtn.addEventListener('click', () => openChatModelSettings('cc'));
    imageStudioEntry.addEventListener('click', () => showImageStudio('push'));
    videoStudioEntry.addEventListener('click', () => showVideoStudio('push'));
    const flushPendingRoomPersistence = () => {
        roomManager.flushDeferredPersistence();
    };
    window.addEventListener('pagehide', flushPendingRoomPersistence);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushPendingRoomPersistence();
    });
    window.addEventListener('beforeunload', () => {
        flushPendingRoomPersistence();
        worldlineBackgroundMedia.stop();
        imageStudioUi?.cleanup();
        characterPhotoObjectUrls.forEach(url => URL.revokeObjectURL(url));
        chatAttachmentObjectUrls.forEach(url => URL.revokeObjectURL(url));
    });

    backButton.addEventListener('click', navigateBackToSelectionView);
    window.addEventListener('popstate', handleBrowserPopState);
    sendButton.addEventListener('click', () => {
        if (
            document.documentElement.dataset.wetappUi === 'v2'
            && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
            const composer = sendButton.closest('.composer-frame');
            composer?.classList.remove('v2-composer-send');
            if (composer) {
                void (composer as HTMLElement).offsetWidth;
                composer.classList.add('v2-composer-send');
                composer.addEventListener('animationend', () => composer.classList.remove('v2-composer-send'), { once: true });
            }
        }
        dispatchSendMessage();
    });
    messageInput.addEventListener('input', () => {
        updateSendButtonState();
        syncMessageInputHeight();
    });
    
    publicFigureCreateBtn.addEventListener('click', () => openMimicImportModal('public'));
    createPersonaBtn.addEventListener('click', () => openMimicImportModal('manual'));
    randomRecruitBtn.addEventListener('click', () => {
        void randomlyRecruitNewPersona();
    });
    mimicImportBtn.addEventListener('click', () => openMimicImportModal('transcript'));


    downloadChatBtn.addEventListener('click', () => {
        if (currentConversationKey && currentPersona) {
            const conversationKey = currentConversationKey;
            const title = currentRoom?.title || currentPersona.name;
            void loadFileManager()
                .then(manager => manager.saveCurrentChat(conversationKey, title))
                .catch(error => {
                    console.error('Failed to export chat', error);
                    alert(`匯出聊天失敗：${error instanceof Error ? error.message : String(error)}`);
                });
        }
        moreOptionsMenu.classList.add('hidden');
    });

    downloadAllChatsBtn.addEventListener('click', () => {
        void loadFileManager()
            .then(manager => manager.saveAllChats())
            .catch(error => console.error('Failed to export all chats', error));
        moreOptionsMenu.classList.add('hidden');
    });
    downloadImagesBtn.addEventListener('click', () => {
         if (currentConversationKey && currentPersona) {
            const conversationKey = currentConversationKey;
            const title = currentRoom?.title || currentPersona.name;
            void loadFileManager()
                .then(manager => manager.downloadImages(conversationKey, title))
                .catch(error => console.error('Failed to download images', error));
        }
        moreOptionsMenu.classList.add('hidden');
    });

    uploadZipBtn.addEventListener('click', () => zipUploadInput.click());
    zipUploadInput.addEventListener('change', e => {
        void loadFileManager()
            .then(manager => manager.handleZipUpload(e))
            .catch(error => console.error('Failed to import archive', error));
    });

    clearChatBtn.addEventListener('click', () => {
        if(currentConversationKey===NATIVE_SYNC_KEY){showError('同步試用請使用收回最新一輪。');return;}
        void loadConversationActions()
            .then(actions => actions.clearCurrentChat())
            .catch(error => console.error('Failed to clear chat', error));
        moreOptionsMenu.classList.add('hidden');
    });
    
    newSceneBtn.addEventListener('click', ()=>{if(currentConversationKey===NATIVE_SYNC_KEY){showError('文字同步試用暫未接駁場景切換。');return;}startNewScene();});
    surpriseEventBtn.addEventListener('click', () => {
        if(currentConversationKey===NATIVE_SYNC_KEY){showError('文字同步試用暫未接駁事件。');return;}
        openSurpriseEventOptions();
    });
    takePhotoBtn.addEventListener('click', () => {
        if(currentConversationKey===NATIVE_SYNC_KEY){showError('文字同步試用暫未接駁照片。');return;}
        openPhotoPromptModal();
    });

    // Memory modal listeners
    memoryBtn.addEventListener('click', () => {
        void openRoomMemory();
        moreOptionsMenu.classList.add('hidden');
    });
    personaSettingsBtn.addEventListener('click', () => {
        const target = currentRoom && activeRoomMemberId
            ? { roomId: currentRoom.id, memberId: activeRoomMemberId }
            : null;
        openPersonaSettings(target);
        moreOptionsMenu.classList.add('hidden');
    });
    changeAvatarBtn.addEventListener('click', () => {
        if (currentRoom) requestRoomAvatarUpload(currentRoom.id);
        else if (currentPersonaKey) requestPersonaAvatarUpload(currentPersonaKey);
        moreOptionsMenu.classList.add('hidden');
    });
    roomInfoBtn.addEventListener('click', openRoomInfo);
    chatHeaderName.addEventListener('click', () => {
        if (currentRoom) openRoomInfo();
    });
    chatHeaderName.addEventListener('keydown', event => {
        if (!currentRoom || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        openRoomInfo();
    });
    dmRoomMemberBtn.addEventListener('click', () => openParticipantAction('dm'));
    inviteCharacterBtn.addEventListener('click', () => {if(currentConversationKey===NATIVE_SYNC_KEY){showError('文字同步試用暫未接駁群組。');return;}openParticipantAction('invite');});
    leaveRoomMemberBtn.addEventListener('click', () => openParticipantAction('leave'));
    addRoomMemberBtn.addEventListener('click', () => {
        if (currentRoom) void openCreateGroup(currentRoom.id);
    });
    openRoomMemoryBtn.addEventListener('click', () => { void openRoomMemory(); });
    exportRoomBtn.addEventListener('click', () => {
        if (currentConversationKey && currentRoom) {
            const conversationKey = currentConversationKey;
            const title = currentRoom.title;
            void loadFileManager()
                .then(manager => manager.saveCurrentChat(conversationKey, title))
                .catch(error => {
                    console.error('Failed to export room', error);
                    alert(`匯出群組失敗：${error instanceof Error ? error.message : String(error)}`);
                });
        }
    });
    // Album modal listeners
    albumBtn.addEventListener('click', () => {
        openAlbumModal();
        moreOptionsMenu.classList.add('hidden');
    });
    // More options menu toggle
    moreOptionsBtn.addEventListener('click', () => {
        syncUiV2MoreOptionsMenuPortal();
        moreOptionsMenu.classList.toggle('hidden');
    });
    window.addEventListener('resize', () => {
        if (moreOptionsMenu.classList.contains('hidden')) syncUiV2MoreOptionsMenuPortal();
    });
    
    // Hide menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!moreOptionsBtn.contains(e.target as Node) && !moreOptionsMenu.contains(e.target as Node)) {
            moreOptionsMenu.classList.add('hidden');
        }
        if (!homeMenuToggle.contains(e.target as Node) && !homeMenu.contains(e.target as Node)) {
            homeMenu.classList.add('hidden');
        }
        if (!newChatFab.contains(e.target as Node) && !newChatMenu.contains(e.target as Node)) {
            newChatMenu.classList.add('hidden');
        }
    });

    // Save before exit modal
    saveAndExitBtn.addEventListener('click', async () => {
        if (currentConversationKey && currentPersona) {
            const conversationKey = currentConversationKey;
            const title = currentRoom?.title || currentPersona.name;
            try {
                const manager = await loadFileManager();
                await manager.saveCurrentChat(conversationKey, title);
            } catch (error) {
                console.error('Failed to save chat before exit', error);
                alert(`儲存聊天失敗：${error instanceof Error ? error.message : String(error)}`);
                return;
            }
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
    await memoryManager.restoreChatRecovery();
    await memoryManager.restorePersonaRecovery();
    await roomManager.restoreRoomRecovery();
    syncBrowserViewState(HOME_HISTORY_STATE, 'replace');
    conversationSearchInput.value = '';
    guardConversationSearchFromAutofill();
    window.addEventListener('pageshow', guardConversationSearchFromAutofill);
    initializeImageSeedControls();
    try {
        await Promise.all([
            memoryManager.restorePrivateAvatars(),
            roomManager.restorePrivateAvatars(),
        ]);
    } catch (error) {
        console.error('Failed to restore private avatars:', error);
    }
    renderPersonaList();
    setupEventListeners();
    if (!VPS_CHAT_BUILD && cloudBackupStartupState.enabled) {
        void loadCloudBackupManager().catch(error => {
            console.error('Failed to start Cloud Backup manager', error);
        });
    }
    setAuthSubmitting(false);
    applyChatRuntimeState('idle');
    const unlocked = await refreshAuthSession();
    if (unlocked) {
        await startSupabaseCloudSync();
        void resumePendingVideoJobIfAny();
        if (VPS_CHAT_BUILD) { void resumeVpsChatTurn(true); void resumeVpsPersonaMemory(); void resumeVpsGroupMemory(); }
    }
};

let chatExperienceUiLoad: Promise<typeof import('./features/chatExperienceUi.js')> | null = null;

const loadChatExperienceUi = () => {
    chatExperienceUiLoad ??= import('./features/chatExperienceUi.js');
    return chatExperienceUiLoad;
};

const openExperienceDraft = async (direct = false) => {
    if (!currentPersona || !currentPersonaKey || !currentConversationKey || activeChatRequest || isGodModeActive || isAssistantPersonaKey(currentPersonaKey)) return;
    const {
        experienceButton,
        experienceDialog,
        generateExperienceDraft,
    } = await loadChatExperienceUi();
    const key = currentConversationKey;
    const history = memoryManager.peekChatHistory(key);
    const last = history.at(-1);
    if (direct && (last?.role !== 'model' || !last.content.text || last.content.photoProposal)) {
        showError('請在角色完成一般文字回覆後使用導演功能。');
        return;
    }
    const dialog = experienceDialog(direct ? '導演一下' : '幫我接戲');
    moreOptionsMenu.classList.add('hidden');
    const output = document.createElement('div');
    output.style.whiteSpace = 'pre-wrap';
    const request = beginChatRequest(currentPersonaKey, currentPersona, 'character', key);
    const generate = async (instruction: string) => {
        output.textContent = '構思中…';
        const controls = Array.from(dialog.querySelectorAll('button')).filter(button => button.textContent !== '關閉');
        controls.forEach(button => { button.disabled = true; });
        try {
            const groupPromptModule = direct && request.room
                ? await loadGroupChatPromptModule()
                : null;
            const context = history.slice(-16).map(message => ({
                role: message.role === 'model' ? 'assistant' as const : message.role,
                content: request.room ? contentToGroupHistoryText(message.content, request.room) : message.content.text || '',
            })).filter(message => message.content);
            const generated = await generateExperienceDraft({
                direct,
                isGroup: Boolean(request.room),
                model: buildCharacterModelRoute(chatModelSettings, request.personaKey === 'cc')[0],
                context,
                instruction,
                rewriteSystemPrompt: direct
                    ? request.room
                        ? groupPromptModule!.buildGroupSystemPrompt(
                            request.room,
                            '',
                            formatSessionMemoryPrompt(request.conversationKey),
                        )
                        : buildChatSystemPrompt(
                            request.personaKey,
                            request.persona,
                            '',
                            request.wardrobeState,
                            undefined,
                            false,
                            request.conversationKey,
                        )
                    : undefined,
                signal: request.controller.signal,
                runModel: async modelRequest => (
                    await generateChatTextWithTimeout({
                        model: modelRequest.model,
                        messages: modelRequest.messages,
                        temperature: modelRequest.temperature,
                        signal: modelRequest.signal,
                    })
                ).text,
            });
            if (!dialog.open || currentConversationKey !== key) return;
            output.replaceChildren();
            if (!direct) {
                if (generated.kind !== 'suggestions') throw new Error('未能整理建議，請再試一次。');
                generated.suggestions.forEach((suggestion: string) => output.append(experienceButton(suggestion, () => {
                    messageInput.value = suggestion;
                    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                    dialog.close();
                    messageInput.focus();
                })));
            } else {
                if (generated.kind !== 'rewrite') throw new Error('修改草稿是空白，原回覆已保留。');
                const parsed = request.room ? parseGroupGeneration(generated.text, request.room) : null;
                const replacement: Content = {
                    ...last!.content,
                    text: parsed?.text || cleanVeniceChatReply(generated.text),
                    segments: parsed?.segments,
                    previousVersions: [...(last!.content.previousVersions || []), { ...last!.content, previousVersions: undefined }],
                };
                if (!replacement.text) throw new Error('修改草稿是空白，原回覆已保留。');
                output.textContent = replacement.text;
                output.append(experienceButton('採用這個版本', () => {
                    const current = memoryManager.peekChatHistory(key);
                    if (current.at(-1)?.id !== last!.id || current.at(-1)?.content.text !== last!.content.text) {
                        output.textContent = '對話已有更新，請重新產生草稿。';
                        return;
                    }
                    const updated = current.map((message, index) => index === current.length - 1 ? { ...message, content: replacement } : message);
                    if (shouldCancelActiveRequestForConversation(activeChatRequest?.conversationKey, key)) {
                        cancelActiveChatRequest();
                    }
                    memoryManager.setChatHistory(key, updated, true);
                    dialog.close();
                    startChat(key, null, 'skip');
                }));
            }
        } catch (error) {
            if (!request.controller.signal.aborted) output.textContent = error instanceof Error ? error.message : '暫時未能產生草稿。';
        } finally {
            controls.forEach(button => { button.disabled = false; });
        }
    };
    dialog.addEventListener('close', () => { request.controller.abort(); finishChatRequest(request); }, { once: true });
    if (direct) {
        ['更細膩', '多些對話', '節奏慢一點', '讓其他在場角色參與'].forEach(label => dialog.append(experienceButton(label, () => { void generate(label); })));
        if (last!.content.previousVersions?.length) dialog.append(experienceButton('還原上一個版本', () => {
            const versions = last!.content.previousVersions!;
            const restored = { ...versions.at(-1)!, previousVersions: versions.slice(0, -1) };
            if (shouldCancelActiveRequestForConversation(activeChatRequest?.conversationKey, key)) {
                cancelActiveChatRequest();
            }
            memoryManager.setChatHistory(key, history.map((message, index) => index === history.length - 1 ? { ...message, content: restored } : message), true);
            dialog.close();
            startChat(key, null, 'skip');
        }));
    }
    dialog.append(output);
    if (!direct) void generate('請提供三個可直接放進輸入框的接戲建議。');
};

const openJevShadowDiagnostics = () => {
    void import('./features/jevShadowDiagnostics.js')
        .then(({ openJevShadowDiagnostics: open }) => open())
        .catch(error => console.error('Failed to load Jev Shadow diagnostics', error));
};

const openChatPerformanceDiagnostics = () => {
    void import('./features/chatPerformanceDiagnostics.js')
        .then(({ openChatPerformanceDiagnostics: open }) => open())
        .catch(error => console.error('Failed to load Performance diagnostics', error));
};

[
    ['Jev Shadow', openJevShadowDiagnostics],
    ['Performance 診斷', openChatPerformanceDiagnostics],
    ['最近文字用量', async () => {
        const { experienceDialog } = await loadChatExperienceUi();
        const dialog = experienceDialog('最近文字用量（這部裝置）');
        moreOptionsMenu.classList.add('hidden');
        let rows: Array<{ at: number; model: string; input: number; output: number }> = [];
        try { const saved = JSON.parse(localStorage.getItem('wetappUsageV1') || '[]'); if (Array.isArray(saved)) rows = saved; } catch { /* Empty report for corrupt diagnostics. */ }
        const summary = document.createElement('p');
        summary.textContent = `最近 ${rows.length} 次成功請求：輸入 ${rows.reduce((sum, row) => sum + row.input, 0).toLocaleString()} tokens；輸出 ${rows.reduce((sum, row) => sum + row.output, 0).toLocaleString()} tokens。包含審核及接戲等請求；不包含圖片、影片或未回傳用量的失敗請求。`;
        dialog.append(summary);
        rows.slice(-30).reverse().forEach(row => {
            const line = document.createElement('p');
            line.style.cssText = 'padding:12px 0;border-bottom:1px solid #ddd';
            line.textContent = `${new Date(row.at).toLocaleString()} · ${row.model}\n輸入 ${row.input} / 輸出 ${row.output}`;
            dialog.append(line);
        });
    }],
    ['目前場景與衣著', async () => {
        const { experienceButton, experienceDialog } = await loadChatExperienceUi();
        if (!currentPersona || !currentConversationKey || activeChatRequest) return;
        const key = currentConversationKey;
        const room = currentRoom;
        const history = memoryManager.peekChatHistory(key);
        const participants = room ? room.members.map(member => ({ key: member.id, label: member.persona.name })) : [{ key: currentPersona.name, label: currentPersona.name }];
        const state = room ? normalizeWardrobeState(room.scene.wardrobe) : getLatestWardrobeState(history, participants.map(person => person.key));
        const dialog = experienceDialog('目前場景與衣著');
        moreOptionsMenu.classList.add('hidden');
        const fields: Array<{ key: string; input: HTMLTextAreaElement }> = [];
        const addField = (fieldKey: string, labelText: string, value: string) => {
            const label = document.createElement('label');
            label.textContent = labelText;
            const input = document.createElement('textarea');
            input.value = value;
            input.maxLength = 360;
            input.rows = 2;
            input.style.cssText = 'display:block;width:100%;padding:12px;margin:6px 0 16px;border:1px solid #a5cfc2;border-radius:10px;background:white;color:#163d35';
            label.append(input);
            dialog.append(label);
            fields.push({ key: fieldKey, input });
        };
        if (room) addField('location', '地點', room.scene.location);
        addField('user', '你的衣著', state.user);
        participants.forEach(person => addField(`character:${person.key}`, person.label, state.characters[person.key] || ''));
        dialog.append(experienceButton('儲存目前狀態', () => {
            if (activeChatRequest) return;
            const updated = normalizeWardrobeState(state);
            fields.forEach(field => {
                if (field.key === 'user') updated.user = field.input.value.trim();
                else if (field.key.startsWith('character:')) updated.characters[field.key.slice(10)] = field.input.value.trim();
            });
            if (room) roomManager.updateRoom(room.id, target => {
                target.scene.wardrobe = updated;
                target.scene.location = fields.find(field => field.key === 'location')!.input.value.trim();
            });
            memoryManager.addMessage(key, 'system', { text: '[系統] 已更新目前衣著設定。', wardrobeState: updated });
            dialog.close();
            if (currentConversationKey === key) startChat(key, null, 'skip');
        }));
    }],
    ['幫我接戲', () => { void openExperienceDraft(); }],
    ['導演一下', () => { void openExperienceDraft(true); }],
    ['互動偏好', async () => {
        const { editChatPreferences } = await loadChatExperienceUi();
        if (!currentPersona || !currentPersonaKey || activeChatRequest) return;
        moreOptionsMenu.classList.add('hidden');
        const key = currentConversationKey;
        const personaKey = currentPersonaKey;
        const roomId = currentRoom?.id;
        editChatPreferences(currentRoom?.chatPreferences || currentPersona.chatPreferences, value => {
            if (roomId) roomManager.updateRoom(roomId, room => { room.chatPreferences = value; });
            else memoryManager.updatePersona(personaKey, { chatPreferences: value });
            if (currentConversationKey === key && key) startChat(key, null, 'skip');
        });
    }],
].forEach(([label, action]) => {
    const menuIds: Record<string, string> = {
        'Jev Shadow': 'jev-shadow-menu-btn',
        'Performance 診斷': 'performance-diagnostics-menu-btn',
        '最近文字用量': 'usage-diagnostics-menu-btn',
        '目前場景與衣著': 'scene-wardrobe-menu-btn',
        '幫我接戲': 'continue-scene-menu-btn',
        '導演一下': 'director-menu-btn',
        '互動偏好': 'interaction-preferences-menu-btn',
    };
    const button = document.createElement('button');
    button.className = 'dropdown-item';
    button.id = menuIds[label as string] || '';
    button.textContent = label as string;
    button.onclick = action as () => void;
    moreOptionsMenu.prepend(button);
});

// The underlying timeline branch engine already preserves the original.
// This gives mobile users an obvious one-tap entry instead of a hidden
// message bubble action: draft the latest user turn in a separate branch.
const latestBranchMenuButton = document.createElement('button');
latestBranchMenuButton.type = 'button';
latestBranchMenuButton.className = 'dropdown-item';
latestBranchMenuButton.id = 'latest-branch-menu-btn';
latestBranchMenuButton.dataset.v2Icon = '⑂';
latestBranchMenuButton.textContent = '由最近訊息建立故事分支';
latestBranchMenuButton.addEventListener('click', () => {
    if (!currentConversationKey || activeChatRequest) return;
    moreOptionsMenu.classList.add('hidden');
    const lastUser = [...memoryManager.getChatHistory(currentConversationKey)]
        .reverse().find(message => message.role === 'user' && message.id);
    if (!lastUser?.id) {
        alert('暫時未有可以建立分支的使用者訊息。');
        return;
    }
    createTimelineBranch(lastUser.id);
});
moreOptionsMenu.prepend(latestBranchMenuButton);
moreOptionsMenu.querySelector('.v2-more-options-section-interaction .v2-more-options-grid')
    ?.appendChild(latestBranchMenuButton);

window.addEventListener('wetapp-storage-failed', () => {
    showError('本機儲存失敗。請保持此頁開啟，立即檢查雲端同步或匯出備份，避免重新整理後遺失訊息。');
});
window.addEventListener('wetapp-storage-recovered', () => {
    showError('訊息已寫入本機備援儲存。請完成雲端同步；聊天室資料容量仍需整理。');
});
window.addEventListener('wetapp-room-storage-recovered', () => {
    showError('群組場景已寫入本機備援儲存。請保持此頁開啟，完成雲端同步或稍後再試本機儲存。');
});
window.addEventListener('wetapp-persona-storage-recovered', () => {
    showError('角色設定與長期記憶已寫入本機備援儲存。請保持此頁開啟，完成雲端同步或稍後再試本機儲存。');
});

void init();
