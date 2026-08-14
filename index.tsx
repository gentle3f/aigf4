
import {
    CharacterPhotoProposal,
    ChatAttachment,
    ChatContextBridge,
    ChatMessage,
    ChatSegment,
    Content,
    DIARY_CHECKPOINT,
    Interest,
    MemoryManager,
    Persona,
    PersonaMemoryEntry,
    POLICY_VIOLATION,
    PublicIdentity,
    SurpriseEventContentMode,
    SurpriseEventProposal,
    cleanAiResponse,
} from "./managers.js";
import { FileManager } from "./fileManager.js";
import {
    CloudBackupListItem,
    CloudBackupManager,
    CloudBackupProgress,
} from "./cloudBackup.js";
import {
    SupabaseCloudSyncManager,
    SupabaseCloudSyncState,
} from './supabaseCloudSync.js';
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
    VeniceMessageContentPart,
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
    listCharacterPhotoAssets,
    saveCharacterPhotoAsset,
} from "./photoStore.js";
import {
    loadPublicIdentityMedia,
    PublicIdentityCandidate,
    PublicIdentityMedia,
    searchPublicIdentities,
} from "./publicIdentity.js";
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
    AUTO_MEMORY_SUMMARY_VERSION,
    parsePersonaAutoMemoryResponse,
    parseRoomAutoMemoryResponse,
} from "./autoMemory.js";
import {
    deleteChatAttachment,
    getChatAttachmentBlob,
    saveChatAttachment,
} from "./chatMediaStore.js";
import {
    buildGroupSystemPrompt,
    contentToGroupHistoryText,
    getGroupDisplaySegments,
    groupNarrationUsesFirstPerson,
    GroupGenerationResult,
    parseGroupGeneration,
    resolveRoomMemberPersona,
    selectLegacyGroupHistory,
    trimTrailingUnansweredUserMessages,
} from "./groupChat.js";
import {
    buildNpcContinuityRequirement,
    collectEstablishedNpcNames,
    collectObservedNpcCandidates,
    extractDirectNpcNames,
    inferNpcPromotionNames,
    inferNpcSpeakersForTurn,
    isUnconfirmedAddressPrefixName,
    replyHasNpcSpeech,
    replyHasNonPersonNpcLabel,
    replyHasUnconfirmedAddressLabel,
} from "./npcDialogue.js";
import {
    buildFallbackObservedNpcPersonaDraft,
    ObservedNpcPersonaDraft,
    parseObservedNpcPersonaDraft,
} from "./observedNpcPersona.js";
import {
    cleanGeneratedPhotoPrompt,
    FAVORITE_PHOTO_PROMPT_MAX_LENGTH,
    normalizeFavoritePhotoPrompt,
    selectPhotoPromptVersion,
} from "./photoPromptPreference.js";
import {
    buildCharacterModelRoute,
    buildStrictReviewModelRoute,
    CHAT_MODEL_SETTINGS_STORAGE_KEY,
    normalizeChatModelSettings,
    parseChatModelSettings,
} from "./chatModelSettings.js";
import type { ChatModelSettings } from "./chatModelSettings.js";
import {
    parseStrictReviewDecision,
    STRICT_REVIEW_RESPONSE_FORMAT,
} from "./strictReview.js";
import {
    advanceRelationshipState,
    collectRecentSurpriseEvents,
    createFallbackSurpriseEvent,
    formatRelationshipStatePrompt,
    getSurpriseEventCategoryLabel,
    getSurpriseEventIntensityLabel,
    parseSurpriseEventProposal,
    surpriseEventMatchesCategory,
    surpriseEventMatchesContentMode,
    surpriseEventsAreTooSimilar,
    SURPRISE_EVENT_CATEGORY_GUIDES,
    SURPRISE_EVENT_RESPONSE_FORMAT,
} from "./experienceEngine.js";
import {
    buildContextBridge,
    contextBridgeDisplayText,
    contextBridgeToSystemPrompt,
    ensureLatestSceneTransitionBridge,
    findLatestPrivateReturnHandoff,
    roomMemberToPersona,
    selectLatestSceneHistory,
} from "./conversationTransfer.js";


declare var JSZip: any;

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

// Disabled legacy helpers still reference `ai`; keep a harmless placeholder.
const ai: any = null;
// --- DOM Elements ---
const personaSelectionView = document.getElementById('persona-selection-view')!;
const chatView = document.getElementById('chat-view')!;
const aiAssistantList = document.getElementById('ai-assistant-list')!;
const femalePersonaList = document.getElementById('female-persona-list')!;
const conversationSearchInput = document.getElementById('conversation-search-input') as HTMLInputElement;
const homeSearchToggle = document.getElementById('home-search-toggle') as HTMLButtonElement;
const homeMenuToggle = document.getElementById('home-menu-toggle') as HTMLButtonElement;
const homeMenu = document.getElementById('home-menu')!;
const homeChatModelSettingsBtn = document.getElementById('home-chat-model-settings') as HTMLButtonElement;
const homeLiveCloudBtn = document.getElementById('home-live-cloud') as HTMLButtonElement;
const homeCloudBackupBtn = document.getElementById('home-cloud-backup') as HTMLButtonElement;
const homeExportAll = document.getElementById('home-export-all') as HTMLButtonElement;
const cloudBackupModal = document.getElementById('cloud-backup-modal')!;
const closeCloudBackupBtn = document.getElementById('close-cloud-backup') as HTMLButtonElement;
const cloudBackupStatusIcon = document.getElementById('cloud-backup-status-icon')!;
const cloudBackupStatusTitle = document.getElementById('cloud-backup-status-title')!;
const cloudBackupStatusDetail = document.getElementById('cloud-backup-status-detail')!;
const cloudBackupProgress = document.getElementById('cloud-backup-progress')!;
const cloudBackupProgressText = document.getElementById('cloud-backup-progress-text')!;
const cloudBackupProgressPercent = document.getElementById('cloud-backup-progress-percent')!;
const cloudBackupProgressBar = document.getElementById('cloud-backup-progress-bar') as HTMLElement;
const scanLocalPhotoVaultBtn = document.getElementById('scan-local-photo-vault') as HTMLButtonElement;
const localPhotoVaultResult = document.getElementById('local-photo-vault-result')!;
const cloudBackupSetup = document.getElementById('cloud-backup-setup')!;
const cloudBackupPassword = document.getElementById('cloud-backup-password') as HTMLInputElement;
const cloudBackupPasswordConfirm = document.getElementById('cloud-backup-password-confirm') as HTMLInputElement;
const cloudBackupSetupError = document.getElementById('cloud-backup-setup-error')!;
const enableCloudBackupBtn = document.getElementById('enable-cloud-backup') as HTMLButtonElement;
const cloudBackupRecovery = document.getElementById('cloud-backup-recovery')!;
const cloudRestorePassword = document.getElementById('cloud-restore-password') as HTMLInputElement;
const cloudRestoreError = document.getElementById('cloud-restore-error')!;
const restoreCloudWithPasswordBtn = document.getElementById('restore-cloud-with-password') as HTMLButtonElement;
const cloudBackupControls = document.getElementById('cloud-backup-controls')!;
const cloudBackupAutoToggle = document.getElementById('cloud-backup-auto-toggle') as HTMLInputElement;
const cloudBackupNowBtn = document.getElementById('cloud-backup-now') as HTMLButtonElement;
const cloudRestoreLatestBtn = document.getElementById('cloud-restore-latest') as HTMLButtonElement;
const cloudBackupVersionsSection = document.getElementById('cloud-backup-versions-section')!;
const cloudBackupVersionList = document.getElementById('cloud-backup-version-list')!;
const refreshCloudBackupsBtn = document.getElementById('refresh-cloud-backups') as HTMLButtonElement;
const cloudBackupDanger = document.getElementById('cloud-backup-danger')!;
const deleteCloudBackupsBtn = document.getElementById('delete-cloud-backups') as HTMLButtonElement;
const supabaseCloudModal = document.getElementById('supabase-cloud-modal')!;
const closeSupabaseCloudBtn = document.getElementById('close-supabase-cloud') as HTMLButtonElement;
const supabaseCloudStatusIcon = document.getElementById('supabase-cloud-status-icon')!;
const supabaseCloudStatusTitle = document.getElementById('supabase-cloud-status-title')!;
const supabaseCloudStatusDetail = document.getElementById('supabase-cloud-status-detail')!;
const supabaseCloudProgress = document.getElementById('supabase-cloud-progress')!;
const supabaseCloudProgressText = document.getElementById('supabase-cloud-progress-text')!;
const supabaseCloudProgressPercent = document.getElementById('supabase-cloud-progress-percent')!;
const supabaseCloudProgressBar = document.getElementById('supabase-cloud-progress-bar') as HTMLElement;
const supabaseCloudLogin = document.getElementById('supabase-cloud-login')!;
const supabaseCloudEmail = document.getElementById('supabase-cloud-email') as HTMLInputElement;
const supabaseCloudError = document.getElementById('supabase-cloud-error')!;
const supabaseCloudSendLink = document.getElementById('supabase-cloud-send-link') as HTMLButtonElement;
const supabaseCloudControls = document.getElementById('supabase-cloud-controls')!;
const supabaseCloudAccount = document.getElementById('supabase-cloud-account')!;
const supabaseCloudSyncNow = document.getElementById('supabase-cloud-sync-now') as HTMLButtonElement;
const supabaseCloudReload = document.getElementById('supabase-cloud-reload') as HTMLButtonElement;
const supabaseCloudSignOut = document.getElementById('supabase-cloud-sign-out') as HTMLButtonElement;
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
const chatSearchBar = document.getElementById('chat-search-bar')!;
const chatSearchInput = document.getElementById('chat-search-input') as HTMLInputElement;
const chatSearchCount = document.getElementById('chat-search-count')!;
const chatSearchClose = document.getElementById('chat-search-close') as HTMLButtonElement;
const chatSearchPrev = document.getElementById('chat-search-prev') as HTMLButtonElement;
const chatSearchNext = document.getElementById('chat-search-next') as HTMLButtonElement;
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
const composerCameraButton = document.getElementById('composer-camera-button') as HTMLButtonElement;
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
const ccModelSettingsBtn = document.getElementById('cc-model-settings-btn') as HTMLButtonElement;
const chatModelSettingsModal = document.getElementById('chat-model-settings-modal')!;
const closeChatModelSettingsBtn = document.getElementById('close-chat-model-settings') as HTMLButtonElement;
const chatModelSettingsTitle = document.getElementById('chat-model-settings-title')!;
const globalChatModelFields = document.getElementById('global-chat-model-fields')!;
const ccChatModelFields = document.getElementById('cc-chat-model-fields')!;
const chatPrimaryModelSelect = document.getElementById('chat-primary-model-select') as HTMLSelectElement;
const chatQualityModelSelect = document.getElementById('chat-quality-model-select') as HTMLSelectElement;
const chatEmergencyModelSelect = document.getElementById('chat-emergency-model-select') as HTMLSelectElement;
const ccPrimaryModelSelect = document.getElementById('cc-primary-model-select') as HTMLSelectElement;
const globalModelRoutePreview = document.getElementById('global-model-route-preview')!;
const ccModelRoutePreview = document.getElementById('cc-model-route-preview')!;
const chatModelListStatus = document.getElementById('chat-model-list-status')!;
const refreshChatModelsBtn = document.getElementById('refresh-chat-models') as HTMLButtonElement;
const resetChatModelSettingsBtn = document.getElementById('reset-chat-model-settings') as HTMLButtonElement;
const saveChatModelSettingsBtn = document.getElementById('save-chat-model-settings') as HTMLButtonElement;

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
const photoRoomMemberControls = document.getElementById('photo-room-member-controls')!;
const photoSenderSelect = document.getElementById('photo-sender-select') as HTMLSelectElement;
const photoSubjectsContainer = document.getElementById('photo-subjects-container')!;
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
const attachFileMenuBtn = document.getElementById('attach-file-menu-btn') as HTMLButtonElement;
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
const savePersonaSettingsBtn = document.getElementById('save-persona-settings') as HTMLButtonElement;
const personaSettingsSubtitle = document.getElementById('persona-settings-subtitle')!;
const personaDescriptionEditor = document.getElementById('persona-description-editor') as HTMLInputElement;
const personaPromptEditor = document.getElementById('persona-prompt-editor') as HTMLTextAreaElement;
const personaGreetingEditor = document.getElementById('persona-greeting-editor') as HTMLTextAreaElement;
const personaFavoritePhotoPromptField = document.getElementById('persona-favorite-photo-prompt-field')!;
const personaFavoritePhotoPrompt = document.getElementById('persona-favorite-photo-prompt') as HTMLTextAreaElement;
const personaSettingsAvatarPreview = document.getElementById('persona-settings-avatar-preview')!;
const personaSettingsAvatarBtn = document.getElementById('persona-settings-avatar-btn') as HTMLButtonElement;
const personaPublicIdentityCheckbox = document.getElementById('persona-public-identity-checkbox') as HTMLInputElement;
const personaPublicIdentityPanel = document.getElementById('persona-public-identity-panel')!;
const personaPublicIdentityStatus = document.getElementById('persona-public-identity-status')!;
const personaPublicIdentitySummary = document.getElementById('persona-public-identity-summary') as HTMLTextAreaElement;
const personaPublicIdentityVisual = document.getElementById('persona-public-identity-visual') as HTMLTextAreaElement;
const personaPublicIdentitySource = document.getElementById('persona-public-identity-source') as HTMLAnchorElement;
const recheckPublicIdentityBtn = document.getElementById('recheck-public-identity-btn') as HTMLButtonElement;
const publicFigureCreateBtn = document.getElementById('public-figure-create-btn') as HTMLButtonElement;
const mimicImportBtn = document.getElementById('mimic-import-btn') as HTMLButtonElement;
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
const publicIdentityModal = document.getElementById('public-identity-modal')!;
const closePublicIdentityModalBtn = document.getElementById('close-public-identity-modal') as HTMLButtonElement;
const publicIdentityQuery = document.getElementById('public-identity-query') as HTMLInputElement;
const searchPublicIdentityBtn = document.getElementById('search-public-identity-btn') as HTMLButtonElement;
const publicIdentityStatus = document.getElementById('public-identity-status')!;
const publicIdentityCandidatesContainer = document.getElementById('public-identity-candidates')!;
const publicIdentityMediaSection = document.getElementById('public-identity-media-section')!;
const publicIdentityMediaContainer = document.getElementById('public-identity-media')!;
const cancelPublicIdentityBtn = document.getElementById('cancel-public-identity') as HTMLButtonElement;
const confirmPublicIdentityBtn = document.getElementById('confirm-public-identity') as HTMLButtonElement;
const avatarSourceModal = document.getElementById('avatar-source-modal')!;
const avatarSourceTitle = document.getElementById('avatar-source-title')!;
const avatarSourceMembers = document.getElementById('avatar-source-members')!;
const avatarSourceOptions = document.getElementById('avatar-source-options')!;
const closeAvatarSourceModalBtn = document.getElementById('close-avatar-source-modal') as HTMLButtonElement;
const avatarSourceLocalBtn = document.getElementById('avatar-source-local') as HTMLButtonElement;
const avatarSourceSearchBtn = document.getElementById('avatar-source-search') as HTMLButtonElement;
const roomInfoModal = document.getElementById('room-info-modal')!;
const closeRoomInfoBtn = document.getElementById('close-room-info') as HTMLButtonElement;
const roomInfoTitle = document.getElementById('room-info-title')!;
const roomInfoSummary = document.getElementById('room-info-summary')!;
const roomMemberList = document.getElementById('room-member-list')!;
const roomSceneEditor = document.getElementById('room-scene-editor')!;
const roomPhotoPromptEditor = document.getElementById('room-photo-prompt-editor')!;
const addRoomMemberBtn = document.getElementById('add-room-member-btn') as HTMLButtonElement;
const openRoomMemoryBtn = document.getElementById('open-room-memory-btn') as HTMLButtonElement;
const exportRoomBtn = document.getElementById('export-room-btn') as HTMLButtonElement;
const roomMemoryModal = document.getElementById('room-memory-modal')!;
const closeRoomMemoryBtn = document.getElementById('close-room-memory') as HTMLButtonElement;
const roomMemoryTitle = document.getElementById('room-memory-title')!;
const memoryMemberTabs = document.getElementById('memory-member-tabs')!;
const memorySoulTab = document.getElementById('memory-soul-tab') as HTMLButtonElement;
const memoryEventTab = document.getElementById('memory-event-tab') as HTMLButtonElement;
const roomMemoryList = document.getElementById('room-memory-list')!;
const createGroupModal = document.getElementById('create-group-modal')!;
const closeCreateGroupBtn = document.getElementById('close-create-group') as HTMLButtonElement;
const createGroupName = document.getElementById('create-group-name') as HTMLInputElement;
const createGroupMemberList = document.getElementById('create-group-member-list')!;
const confirmCreateGroupBtn = document.getElementById('confirm-create-group') as HTMLButtonElement;
const participantActionModal = document.getElementById('participant-action-modal')!;
const closeParticipantActionBtn = document.getElementById('close-participant-action') as HTMLButtonElement;
const participantActionTitle = document.getElementById('participant-action-title')!;
const participantActionSummary = document.getElementById('participant-action-summary')!;
const participantActionList = document.getElementById('participant-action-list')!;


// --- Managers ---
let diaryModule: any;

const memoryManager = new MemoryManager();
const roomManager = new RoomManager();
roomManager.ensureIuGroupRoom(memoryManager);

const fileManager = new FileManager(memoryManager, {
    downloadAllChatsBtn,
    downloadImagesBtn,
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
    }
}, roomManager);

let cloudBackupList: CloudBackupListItem[] = [];
let cloudBackupHasLocalKey = false;
let cloudBackupBusy = false;
let cloudBackupLastProgress: CloudBackupProgress = {
    stage: 'idle',
    message: '尚未開始雲端備份。',
};
const cloudBackupManager = new CloudBackupManager(fileManager, {
    onProgress: progress => renderCloudBackupProgress(progress),
    onStateChange: () => {
        if (!cloudBackupModal.classList.contains('hidden')) void refreshCloudBackupView(false);
    },
});

const supabaseCloudSyncManager = new SupabaseCloudSyncManager(memoryManager, roomManager, {
    onStateChange: state => renderSupabaseCloudState(state),
    onRemoteApplied: () => {
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
});

const readPreferredVideoModel = (storageKey: string, preferredModel: string, legacyDefault: string) => {
    const stored = localStorage.getItem(storageKey);
    if (!stored || stored === legacyDefault) {
        localStorage.setItem(storageKey, preferredModel);
        return preferredModel;
    }
    return stored;
};

const readPreferredImageGenerateModel = () => {
    const storageKey = 'veniceImageGenerateModel';
    const stored = localStorage.getItem(storageKey);
    if (!stored || stored === 'lustify-v8') {
        localStorage.setItem(storageKey, VENICE_IMAGE_GENERATE_MODEL);
        return VENICE_IMAGE_GENERATE_MODEL;
    }
    return stored;
};

const readPreferredImageEditModel = () => {
    const storageKey = 'veniceImageEditModel';
    const stored = localStorage.getItem(storageKey);
    if (!stored || stored === 'qwen-edit-uncensored') {
        localStorage.setItem(storageKey, VENICE_IMAGE_EDIT_MODEL);
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
let currentPersonaKeyForUpload: string | null = null;
let avatarUploadRoomTarget: { roomId: string; memberId: string } | null = null;
let avatarSourceTarget: { personaKey: string } | { roomId: string; memberId: string } | null = null;
let expandedLegacyHistoryConversationKey: string | null = null;
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
    historyIndex: number | null;
    createdAt: number;
    recoveredFromStore?: boolean;
    content: Content;
}[] = [];
let albumAttachments: ChatAttachment[] = [];
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
let mimicPublicIdentityResolution: PublicIdentityResolution | null = null;
let mimicPublicIdentityQuery = '';
let publicIdentityCandidates: PublicIdentityCandidate[] = [];
let selectedPublicIdentityCandidate: PublicIdentityCandidate | null = null;
let publicIdentityMedia: PublicIdentityMedia[] = [];
let selectedPublicIdentityMedia: PublicIdentityMedia | null = null;
let publicIdentityLookupController: AbortController | null = null;
let publicIdentityResolver: ((value: PublicIdentityResolution | null) => void) | null = null;
let isPublicIdentityBusy = false;
let personaSettingsResolvedIdentity: PublicIdentity | null = null;
let personaSettingsResolvedAvatarUrl: string | null = null;
let activeChatRequest: ActiveChatRequest | null = null;
let nextChatRequestId = 1;
let assistantModels: VeniceModelSummary[] = [];
let assistantModelsPromise: Promise<void> | null = null;
let selectedAssistantModel = localStorage.getItem('veniceAssistantModel') || VENICE_ASSISTANT_MODEL;
let chatModelSettings = parseChatModelSettings(
    localStorage.getItem(CHAT_MODEL_SETTINGS_STORAGE_KEY),
    DEFAULT_CHAT_MODEL_SETTINGS,
);
let chatModelSettingsDraft: ChatModelSettings = { ...chatModelSettings };
let chatModelSettingsScope: 'global' | 'cc' = 'global';
let assistantModelListUsesFallback = false;
let assistantModelListUpdatedAt: number | null = null;
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
    generate: readPreferredImageGenerateModel(),
    edit: readPreferredImageEditModel(),
};
let imageSource: ImageStudioSource | null = null;
let imageResults: ImageStudioResult[] = [];
let imageRequestController: AbortController | null = null;
let isImageRequestRunning = false;
let activePhotoViewerContext: PhotoViewerContext | null = null;
let isPhotoViewerRegenerating = false;
let photoViewerRequestController: AbortController | null = null;
let isPhotoViewerEditorCollapsed = false;
let photoFullscreenScale = 1;
let photoFullscreenPan = { x: 0, y: 0 };
let photoFullscreenDrag: { pointerId: number; x: number; y: number; panX: number; panY: number } | null = null;
let photoFullscreenPinch: { distance: number; scale: number } | null = null;
const photoFullscreenPointers = new Map<number, { x: number; y: number }>();
let characterPhotoRequestController: AbortController | null = null;
let activeCharacterPhotoProposalId: string | null = null;
let switchingCharacterPhotoProposalId: string | null = null;
let pendingChatAttachments: Array<{ attachment: ChatAttachment; file: File; previewUrl?: string }> = [];
const chatAttachmentObjectUrls = new Map<string, string>();
let openMessageActionMenu: HTMLElement | null = null;
let selectedMemoryMemberId: string | null = null;
let selectedMemoryType: 'soul' | 'memory' = 'soul';
let personaSettingsRoomTarget: { roomId: string; memberId: string } | null = null;
let groupModalTargetRoomId: string | null = null;
let pendingPhotoSenderMemberId: string | null = null;
let pendingPhotoSubjectMemberIds: string[] = [];
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
let surpriseEventReplacingProposalId: string | null = null;
const roomSummaryInFlight = new Set<string>();
const personaSummaryInFlight = new Set<string>();
let manualMemoryUpdateNotice: {
    conversationKey: string;
    tone: 'running' | 'success' | 'error';
    text: string;
} | null = null;
let chatSearchMatches: HTMLElement[] = [];
let chatSearchMatchIndex = -1;

const USES_VENICE_PROXY_AUTH = VENICE_API_BASE.startsWith('/');

const DISABLED_FEATURE_MESSAGE = '此功能在目前版本暫時停用。';
const GOD_MODE_ENTER_COMMAND = 'GOD MODE';
const GOD_MODE_EXIT_COMMAND = 'BYE GOD MODE';
const CHAT_HISTORY_MESSAGE_LIMIT = 120;
const CHAT_HISTORY_CHAR_BUDGET = 100000;
const ASSISTANT_HISTORY_MESSAGE_LIMIT = 60;
const ASSISTANT_HISTORY_CHAR_BUDGET = 36000;
const GOD_MODE_HISTORY_LIMIT = 10;
const ROOM_MEMORY_SUMMARY_TURN_INTERVAL = 24;
const AUTO_MEMORY_RECENT_MESSAGE_LIMIT = 48;
const AUTO_MEMORY_MODEL_TIMEOUT_MS = 30_000;
const MAX_CHAT_ATTACHMENT_TOTAL_BYTES = 2_500_000;
const MAX_CHAT_IMAGE_EDGE = 1600;
const CHAT_MAX_AUTO_CONTINUES = 2;
const CHAT_MODEL_ATTEMPT_TIMEOUT_MS = 45_000;
const SURPRISE_EVENT_ATTEMPT_TIMEOUT_MS = 15_000;
const NSFW_SURPRISE_EVENT_DIRECTIONS = [
    {
        prompt: 'a private adult seduction challenge with a concrete dare, clear roles and immediate sexual tension',
        fallbackPremise: '一張寫明成人規則的私密挑戰卡被放到你面前，第一個挑戰要求其中一人主動提出清楚的性邀請。',
    },
    {
        prompt: 'a consensual adult role-play premise with specific identities, a private setting and a clear first move',
        fallbackPremise: '她們準備了一個只限成年人的角色扮演設定，身份、場地與第一個性挑戰都已寫好，只等待你決定是否開始。',
    },
    {
        prompt: 'an after-work or after-performance private release where one selected character initiates a clearly sexual proposition',
        fallbackPremise: '工作或演出結束後的私人空檔裡，其中一人不再掩飾慾望，向你提出一個具體的成人邀請。',
    },
    {
        prompt: 'a playful adult power-exchange game with an explicit rule, a concrete reward or consequence, and room for the user to choose',
        fallbackPremise: '一場成人主導權遊戲訂下了清楚規則、獎勵與後果，但由你決定接受、拒絕或改寫第一條規則。',
    },
    {
        prompt: 'a multi-character adult attention or jealousy game in which every selected character has a distinct active role',
        fallbackPremise: '幾位參與者把原本的爭寵變成明確的成人遊戲，每人提出不同的性挑戰，等你選擇先回應誰。',
    },
    {
        prompt: 'a risky-but-private adult encounter with a concrete interruption risk, time limit or need for secrecy',
        fallbackPremise: '一段有限時或可能被打斷的私人空檔，令她們直接提出一個必須立刻決定是否開始的成人性冒險。',
    },
    {
        prompt: 'the discovery or gifting of a clearly adult intimate item that creates a specific sexual challenge',
        fallbackPremise: '一件明確的成人情趣用品意外出現，附帶的使用規則把它變成一個尚未開始的具體性挑戰。',
    },
] as const;
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
const VIDEO_IMAGE_MODEL_STORAGE_KEY = 'veniceVideoImageModel';
const VIDEO_TEXT_MODEL_STORAGE_KEY = 'veniceVideoTextModel';
const VIDEO_ADULT_CONFIRM_STORAGE_KEY = 'veniceVideoAdultConfirmed';
const VIDEO_PENDING_JOB_STORAGE_KEY = 'veniceVideoPendingJobV1';
const RANDOM_PERSONA_VARIATION_HISTORY_KEY = 'aigf4RandomPersonaVariationsV2';
const CHARACTER_PHOTO_PROMPT_MAX_LENGTH = 1500;
const CHARACTER_PHOTO_EDITOR_MAX_LENGTH = 7500;
const VIDEO_PROMPT_OPTIMIZER_TIMEOUT_MS = 45_000;
const VIDEO_PROMPT_OPTIMIZER_ATTEMPT_TIMEOUT_MS = 15_000;
const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_TIMEOUT_MS = 15 * 60_000;

type AppHistoryState =
    | { view: 'home' }
    | { view: 'chat'; conversationKey: string; personaKey?: string }
    | { view: 'image' }
    | { view: 'video' };
type MimicBuildMode = 'transcript' | 'public' | 'manual';
type ChatMode = 'character' | 'assistant' | 'god' | 'photo' | 'event';
type SurpriseEventDrawOptions = {
    contentMode: SurpriseEventContentMode;
    participantIds: string[];
};
type ActiveChatRequest = {
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
    modelId: string;
    mode: VeniceImageMode;
    aspectRatio: string;
    resolution?: string;
    negativePrompt?: string;
    sourceImageBase64?: string;
    seed?: number;
    createdAt: Date;
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

type PublicPersonaSeed = {
    displayName: string;
    notes: string;
    resolution: PublicIdentityResolution;
};

type PublicIdentityResolution = {
    identity: PublicIdentity;
    avatarUrl?: string;
    candidate?: PublicIdentityCandidate;
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

const fillRandomManualFields = () => {
    const persona = createFreshRandomPersona();
    mimicPublicIdentityCheckbox.checked = false;
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
    const avatarUrl = mimicAvatarDataUrl || mimicPublicIdentityResolution?.avatarUrl;
    if (avatarUrl) {
        mimicAvatarPreview.innerHTML = `<img src="${avatarUrl}" alt="角色頭像" class="h-full w-full object-cover">`;
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

const setPublicIdentityStatus = (text: string, tone: 'idle' | 'error' | 'success' = 'idle') => {
    publicIdentityStatus.textContent = text;
    publicIdentityStatus.classList.remove(
        'border-cyan-500/20',
        'bg-cyan-500/5',
        'text-cyan-100',
        'border-red-500/25',
        'bg-red-500/10',
        'text-red-200',
        'border-emerald-500/25',
        'bg-emerald-500/10',
        'text-emerald-100',
    );
    if (tone === 'error') {
        publicIdentityStatus.classList.add('border-red-500/25', 'bg-red-500/10', 'text-red-200');
    } else if (tone === 'success') {
        publicIdentityStatus.classList.add('border-emerald-500/25', 'bg-emerald-500/10', 'text-emerald-100');
    } else {
        publicIdentityStatus.classList.add('border-cyan-500/20', 'bg-cyan-500/5', 'text-cyan-100');
    }
};

const setPublicIdentityBusy = (busy: boolean) => {
    isPublicIdentityBusy = busy;
    searchPublicIdentityBtn.disabled = busy;
    publicIdentityQuery.disabled = busy;
    confirmPublicIdentityBtn.disabled = busy || !selectedPublicIdentityCandidate;
    publicIdentityCandidatesContainer.querySelectorAll('button').forEach(button => {
        (button as HTMLButtonElement).disabled = busy;
    });
};

const renderPublicIdentityCandidates = () => {
    publicIdentityCandidatesContainer.innerHTML = '';
    publicIdentityCandidates.forEach(candidate => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `public-identity-candidate${selectedPublicIdentityCandidate?.id === candidate.id ? ' is-selected' : ''}`;
        button.disabled = isPublicIdentityBusy;

        if (candidate.thumbnailUrl) {
            const image = document.createElement('img');
            image.className = 'public-identity-candidate-image';
            image.src = candidate.thumbnailUrl;
            image.alt = `${candidate.title} 代表圖片`;
            image.loading = 'lazy';
            image.referrerPolicy = 'no-referrer';
            button.appendChild(image);
        } else {
            const placeholder = document.createElement('span');
            placeholder.className = 'public-identity-candidate-placeholder';
            placeholder.textContent = candidate.title.slice(0, 1).toUpperCase() || '?';
            button.appendChild(placeholder);
        }

        const copy = document.createElement('span');
        copy.className = 'public-identity-candidate-copy';
        const title = document.createElement('strong');
        title.textContent = candidate.title;
        const description = document.createElement('span');
        description.textContent = candidate.description || `${candidate.language.toUpperCase()} Wikipedia`;
        const extract = document.createElement('p');
        extract.textContent = candidate.extract || '請開啟來源頁面查看更多資料。';
        copy.append(title, description, extract);
        button.appendChild(copy);
        button.addEventListener('click', () => {
            void selectPublicIdentityCandidate(candidate);
        });
        publicIdentityCandidatesContainer.appendChild(button);
    });
};

const renderPublicIdentityMedia = () => {
    publicIdentityMediaContainer.innerHTML = '';
    if (publicIdentityMedia.length === 0) {
        publicIdentityMediaSection.classList.add('hidden');
        return;
    }

    publicIdentityMediaSection.classList.remove('hidden');
    const keepButton = document.createElement('button');
    keepButton.type = 'button';
    keepButton.className = `public-identity-media-choice is-keep${selectedPublicIdentityMedia ? '' : ' is-selected'}`;
    keepButton.innerHTML = '<span><strong class="block text-cyan-100">保留目前頭像</strong><span class="mt-2 block text-xs text-gray-400">只保存身份與圖片 Prompt</span></span>';
    keepButton.addEventListener('click', () => {
        selectedPublicIdentityMedia = null;
        renderPublicIdentityMedia();
    });
    publicIdentityMediaContainer.appendChild(keepButton);

    publicIdentityMedia.forEach(media => {
        const wrapper = document.createElement('div');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `public-identity-media-choice w-full${selectedPublicIdentityMedia?.thumbnailUrl === media.thumbnailUrl ? ' is-selected' : ''}`;
        const image = document.createElement('img');
        image.src = media.thumbnailUrl;
        image.alt = media.title;
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        const copy = document.createElement('span');
        copy.className = 'public-identity-media-choice-copy';
        copy.textContent = media.title.replace(/^File:/u, '');
        button.append(image, copy);
        button.addEventListener('click', () => {
            selectedPublicIdentityMedia = media;
            renderPublicIdentityMedia();
        });
        const source = document.createElement('a');
        source.className = 'mt-1 block truncate px-1 text-[0.65rem] text-cyan-300 underline underline-offset-2';
        source.href = media.sourceUrl;
        source.target = '_blank';
        source.rel = 'noopener noreferrer';
        source.textContent = `來源 · ${media.license}`;
        wrapper.append(button, source);
        publicIdentityMediaContainer.appendChild(wrapper);
    });
};

const selectPublicIdentityCandidate = async (candidate: PublicIdentityCandidate) => {
    publicIdentityLookupController?.abort();
    selectedPublicIdentityCandidate = candidate;
    selectedPublicIdentityMedia = null;
    publicIdentityMedia = [];
    renderPublicIdentityCandidates();
    renderPublicIdentityMedia();
    setPublicIdentityStatus(`已選擇「${candidate.title}」，正在尋找可用的代表圖片...`);
    setPublicIdentityBusy(true);

    const controller = new AbortController();
    publicIdentityLookupController = controller;
    try {
        const loadedMedia = await loadPublicIdentityMedia(candidate, controller.signal);
        const leadMedia: PublicIdentityMedia[] = candidate.thumbnailUrl ? [{
            title: `${candidate.title}（Wikipedia 代表圖片）`,
            thumbnailUrl: candidate.thumbnailUrl,
            originalUrl: candidate.originalImageUrl || candidate.thumbnailUrl,
            sourceUrl: candidate.pageUrl,
            license: '請查看來源頁面',
        }] : [];
        const seen = new Set<string>();
        publicIdentityMedia = [...leadMedia, ...loadedMedia].filter(media => {
            const key = media.thumbnailUrl.replace(/\?.*$/u, '');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 7);
        renderPublicIdentityMedia();
        setPublicIdentityStatus(
            `你要建立的是「${candidate.title}」嗎？確認後會整理身份與圖片畫風。`,
            'success',
        );
    } catch (error) {
        if (isAbortError(error)) return;
        const message = error instanceof Error ? error.message : '代表圖片讀取失敗。';
        if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        setPublicIdentityStatus(`已選擇「${candidate.title}」。代表圖片暫時讀取不到，但仍可確認身份。`, 'success');
    } finally {
        if (publicIdentityLookupController === controller) publicIdentityLookupController = null;
        setPublicIdentityBusy(false);
        renderPublicIdentityCandidates();
    }
};

const searchForPublicIdentity = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query) {
        setPublicIdentityStatus('請輸入名字，或補充作品、職業、國家再搜尋。', 'error');
        return;
    }

    publicIdentityLookupController?.abort();
    publicIdentityCandidates = [];
    selectedPublicIdentityCandidate = null;
    selectedPublicIdentityMedia = null;
    publicIdentityMedia = [];
    publicIdentityCandidatesContainer.innerHTML = '';
    renderPublicIdentityMedia();
    setPublicIdentityStatus(`正在 Wikipedia 搜尋「${query}」...`);
    setPublicIdentityBusy(true);

    const controller = new AbortController();
    publicIdentityLookupController = controller;
    try {
        publicIdentityCandidates = await searchPublicIdentities(query, controller.signal);
        if (publicIdentityCandidates.length === 0) {
            setPublicIdentityStatus('找不到合適條目。請加入作品名、團體、國家或職業再搜尋。', 'error');
            return;
        }
        selectedPublicIdentityCandidate = publicIdentityCandidates[0];
        renderPublicIdentityCandidates();
    } catch (error) {
        if (isAbortError(error)) return;
        const message = error instanceof Error ? error.message : '公開資料搜尋失敗。';
        if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        setPublicIdentityStatus(`搜尋失敗：${message}`, 'error');
        return;
    } finally {
        if (publicIdentityLookupController === controller) publicIdentityLookupController = null;
        setPublicIdentityBusy(false);
    }

    if (selectedPublicIdentityCandidate) {
        await selectPublicIdentityCandidate(selectedPublicIdentityCandidate);
    }
};

const buildConfirmedPublicIdentity = async (
    candidate: PublicIdentityCandidate,
): Promise<PublicIdentity> => {
    const candidateText = `${candidate.description} ${candidate.extract}`;
    const fallbackKind: PublicIdentity['kind'] = /(?:fictional|character|video game|manga|anime|novel|comic)/iu.test(candidateText)
        ? 'fictional_character'
        : /(?:born|person|singer|actor|actress|model|athlete|politician|artist|performer|musician)/iu.test(candidateText)
            ? 'real_person'
            : 'other';
    const response = await runMimicModelCall(
        [
            {
                role: 'system',
                content: [
                    'You convert one user-confirmed Wikipedia result into factual identity metadata for character consistency and text-to-image prompting.',
                    'Use only the supplied public encyclopedia text. Do not invent private facts, facial measurements, scenes, poses, clothes, or relationships.',
                    'For a real person, make the English visual prompt lead with the best-known public name, legal name if supplied, nationality, and public profession so an image model identifies the exact person rather than a generic demographic.',
                    'For a fictional character, name the franchise and original medium. Describe the canonical design and broad original visual language without naming or imitating a living artist. Keep it illustrated/game-like when the source is not live action.',
                    'Write summary_zh in concise Traditional Chinese. Return only these XML tags:',
                    '<kind>real_person|fictional_character|other</kind>',
                    '<canonical_name>best-known canonical name</canonical_name>',
                    '<summary_zh>one or two factual Traditional Chinese sentences</summary_zh>',
                    '<visual_prompt_en>identity-only English image prompt</visual_prompt_en>',
                    '<style_prompt_en>fictional source-medium style guidance, or empty for a real person</style_prompt_en>',
                ].join('\n'),
            },
            {
                role: 'user',
                content: [
                    `Wikipedia title: ${candidate.title}`,
                    `Wikipedia language: ${candidate.language}`,
                    `Wikidata description: ${candidate.description || 'not supplied'}`,
                    `Article introduction: ${candidate.extract || 'not supplied'}`,
                    `Source: ${candidate.pageUrl}`,
                ].join('\n'),
            },
        ],
        700,
    );

    const rawKind = extractXmlTag(response, 'kind');
    const kind: PublicIdentity['kind'] = rawKind === 'fictional_character' || rawKind === 'other' || rawKind === 'real_person'
        ? rawKind
        : fallbackKind;
    const canonicalName = extractXmlTag(response, 'canonical_name') || candidate.title;
    const summary = extractXmlTag(response, 'summary_zh')
        || `${candidate.title}：${candidate.description || candidate.extract}`.slice(0, 900);
    const visualPrompt = extractXmlTag(response, 'visual_prompt_en') || (
        kind === 'fictional_character'
            ? `${candidate.title}, the canonical fictional character described as ${candidate.description}. Preserve the recognizable franchise identity and canonical character design.`
            : `${candidate.title}, ${candidate.description}, the recognizable real public figure; preserve her exact well-known identity rather than generating a generic lookalike.`
    );
    const stylePrompt = extractXmlTag(response, 'style_prompt_en');

    return {
        canonicalName: canonicalName.slice(0, 180),
        kind,
        summary: summary.slice(0, 1200),
        visualPrompt: visualPrompt.slice(0, 1400),
        stylePrompt: stylePrompt.slice(0, 800) || undefined,
        sourceTitle: candidate.title,
        sourceUrl: candidate.pageUrl,
        sourceLanguage: candidate.language,
        referenceImageUrl: selectedPublicIdentityMedia?.thumbnailUrl,
        referenceImageSourceUrl: selectedPublicIdentityMedia?.sourceUrl,
        verifiedAt: Date.now(),
    };
};

const closePublicIdentityResolution = (result: PublicIdentityResolution | null = null) => {
    publicIdentityLookupController?.abort();
    publicIdentityLookupController = null;
    publicIdentityModal.classList.add('hidden');
    const resolver = publicIdentityResolver;
    publicIdentityResolver = null;
    resolver?.(result);
};

const requestPublicIdentityResolution = (
    initialQuery: string,
): Promise<PublicIdentityResolution | null> => {
    if (publicIdentityResolver) {
        publicIdentityResolver(null);
        publicIdentityResolver = null;
    }
    publicIdentityCandidates = [];
    selectedPublicIdentityCandidate = null;
    publicIdentityMedia = [];
    selectedPublicIdentityMedia = null;
    publicIdentityCandidatesContainer.innerHTML = '';
    publicIdentityMediaContainer.innerHTML = '';
    publicIdentityMediaSection.classList.add('hidden');
    publicIdentityQuery.value = initialQuery.trim();
    publicIdentityModal.classList.remove('hidden');
    setPublicIdentityStatus('正在搜尋公開資料...');
    confirmPublicIdentityBtn.disabled = true;

    const result = new Promise<PublicIdentityResolution | null>(resolve => {
        publicIdentityResolver = resolve;
    });
    void searchForPublicIdentity(initialQuery);
    return result;
};

const confirmSelectedPublicIdentity = async () => {
    if (!selectedPublicIdentityCandidate || isPublicIdentityBusy) return;
    const candidate = selectedPublicIdentityCandidate;
    setPublicIdentityBusy(true);
    setPublicIdentityStatus(`正在整理「${candidate.title}」的標準身份與圖片描述...`);
    try {
        const identity = await buildConfirmedPublicIdentity(candidate);
        closePublicIdentityResolution({
            identity,
            avatarUrl: selectedPublicIdentityMedia?.thumbnailUrl,
            candidate,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : '身份資料整理失敗。';
        if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        setPublicIdentityStatus(`整理失敗：${message}`, 'error');
    } finally {
        setPublicIdentityBusy(false);
    }
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

    const key = memoryManager.saveCustomPersona({
        name,
        emoji: '🫧',
        description,
        prompt,
        greeting,
        avatarPrompt: publicIdentityResolution
            ? [
                publicIdentityResolution.identity.visualPrompt,
                publicIdentityResolution.identity.stylePrompt,
                'single-character portrait',
            ].filter(Boolean).join(' ')
            : `romance portrait of ${name}`,
        gender: getSelectedMimicGender(),
        publicIdentityEnabled: Boolean(publicIdentityResolution),
        publicIdentity: publicIdentityResolution?.identity,
    });

    memoryManager.updatePersona(key, {
        description,
        prompt,
        greeting,
        memory,
        avatarUrl: mimicAvatarDataUrl || publicIdentityResolution?.avatarUrl,
        publicIdentityEnabled: Boolean(publicIdentityResolution),
        publicIdentity: publicIdentityResolution?.identity,
    });

    renderPersonaList();
    hideMimicImportModalView();
    startChat(key, null, 'push');
    return true;
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
        await Promise.all([
            deleteCharacterPhotoAssetsForHistory(history, key),
            deleteChatAttachmentAssetsForHistory(history, key),
        ]);
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

const renderLegacyPersonaList = () => {
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

const renderPersonaList = () => {
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
        if (message.content.imageAssetId || message.content.imageUrl) return `照片 · ${message.content.text || ''}`;
        if (message.content.attachments?.length) return `附件 · ${message.content.text || message.content.attachments[0].name}`;
        return (message.content.text || fallback).replace(/\s+/gu, ' ').trim();
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
    }) => {
        const shell = document.createElement('div');
        shell.className = 'conversation-row-shell';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `conversation-row${currentConversationKey === options.key ? ' is-active' : ''}`;
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
            deleteButton.title = options.room ? `刪除群組 ${options.title}` : `刪除與 ${options.title} 的聊天`;
            deleteButton.setAttribute('aria-label', deleteButton.title);
            deleteButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"></path></svg>';
            deleteButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void deleteConversationFromList(options.key, options.title, options.room);
            });
            shell.appendChild(deleteButton);
        }
        return shell;
    };

    const assistant = personas[VENICE_ASSISTANT_PERSONA_KEY];
    if (assistant) {
        aiAssistantList.appendChild(createRow({
            key: VENICE_ASSISTANT_PERSONA_KEY,
            title: 'Venice AI',
            preview: previewText(VENICE_ASSISTANT_PERSONA_KEY, '可選模型的私人 AI 助手'),
            timestamp: latestTimestamp(VENICE_ASSISTANT_PERSONA_KEY),
            persona: assistant,
            pinned: true,
        }));
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
        .forEach(item => femalePersonaList.appendChild(createRow(item)));

    if (!femalePersonaList.childElementCount) {
        const empty = document.createElement('p');
        empty.className = 'conversation-empty-state';
        empty.textContent = query ? '找不到相符的對話。' : '按右下角按鈕開始新對話。';
        femalePersonaList.appendChild(empty);
    }
};

const requestPersonaAvatarUpload = (key: string) => {
    const persona = memoryManager.getPersona(key);
    if (!persona || key === VENICE_ASSISTANT_PERSONA_KEY) return;
    avatarSourceTarget = { personaKey: key };
    avatarSourceTitle.textContent = `更換 ${persona.name} 的頭像`;
    avatarSourceMembers.classList.add('hidden');
    avatarSourceOptions.classList.remove('hidden');
    avatarSourceModal.classList.remove('hidden');
};

const requestRoomMemberAvatarUpload = (roomId: string, memberId: string) => {
    const member = roomManager.getMember(roomId, memberId);
    if (!member) return;
    avatarSourceTarget = { roomId, memberId };
    avatarSourceTitle.textContent = `更換 ${member.persona.name} 的頭像`;
    avatarSourceMembers.classList.add('hidden');
    avatarSourceOptions.classList.remove('hidden');
    avatarSourceModal.classList.remove('hidden');
};

const requestRoomAvatarUpload = (roomId: string) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    avatarSourceTarget = null;
    avatarSourceTitle.textContent = '選擇要更換頭像的成員';
    avatarSourceOptions.classList.add('hidden');
    avatarSourceMembers.innerHTML = '';
    room.members.forEach(member => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'avatar-source-member';

        const avatar = document.createElement('span');
        avatar.className = 'avatar-source-member-avatar';
        const sourcePersona = member.persona.avatarUrl
            ? member.persona
            : member.sourcePersonaKey
                ? memoryManager.getPersona(member.sourcePersonaKey) || member.persona
                : member.persona;
        if (sourcePersona.avatarUrl && !sourcePersona.avatarUrl.startsWith('generating_')) {
            const image = document.createElement('img');
            image.src = sourcePersona.avatarUrl;
            image.alt = member.persona.name;
            avatar.appendChild(image);
        } else {
            avatar.textContent = sourcePersona.emoji || '●';
        }

        const copy = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = member.persona.name;
        const detail = document.createElement('small');
        detail.textContent = '按此選擇本機圖片或搜尋網上公開圖片';
        copy.append(name, detail);
        button.append(avatar, copy);
        button.addEventListener('click', () => requestRoomMemberAvatarUpload(room.id, member.id));
        avatarSourceMembers.appendChild(button);
    });
    avatarSourceMembers.classList.remove('hidden');
    avatarSourceModal.classList.remove('hidden');
};

const closeAvatarSourceModal = () => {
    avatarSourceModal.classList.add('hidden');
    avatarSourceTarget = null;
    avatarSourceMembers.classList.add('hidden');
    avatarSourceOptions.classList.remove('hidden');
};

const chooseLocalAvatarSource = () => {
    const target = avatarSourceTarget;
    if (!target) return;
    avatarSourceModal.classList.add('hidden');
    if ('personaKey' in target) {
        avatarUploadRoomTarget = null;
        currentPersonaKeyForUpload = target.personaKey;
    } else {
        currentPersonaKeyForUpload = null;
        avatarUploadRoomTarget = { roomId: target.roomId, memberId: target.memberId };
    }
    avatarSourceTarget = null;
    avatarUploadInput.click();
};

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

const chooseSearchedAvatarSource = async () => {
    const target = avatarSourceTarget;
    if (!target) return;
    const restoreRoomInfo = !roomInfoModal.classList.contains('hidden');
    avatarSourceModal.classList.add('hidden');
    if (restoreRoomInfo) roomInfoModal.classList.add('hidden');
    avatarSourceTarget = null;

    const persona = 'personaKey' in target
        ? memoryManager.getPersona(target.personaKey)
        : roomManager.getMember(target.roomId, target.memberId)?.persona;
    if (!persona) {
        if (restoreRoomInfo) roomInfoModal.classList.remove('hidden');
        return;
    }
    const query = persona.publicIdentity
        ? [persona.publicIdentity.canonicalName, persona.publicIdentity.sourceTitle].filter(Boolean).join(' ')
        : [persona.name, persona.description].filter(Boolean).join(' ');
    const result = await requestPublicIdentityResolution(query);
    if (!result) {
        if (restoreRoomInfo) {
            renderRoomInfo();
            roomInfoModal.classList.remove('hidden');
        }
        return;
    }

    const personaUpdate: Partial<Persona> = {
        publicIdentityEnabled: true,
        publicIdentity: result.identity,
        avatarPrompt: result.identity.visualPrompt,
    };
    if (result.avatarUrl) personaUpdate.avatarUrl = result.avatarUrl;

    if ('personaKey' in target) {
        memoryManager.updatePersona(target.personaKey, personaUpdate);
    } else {
        roomManager.updateMember(target.roomId, target.memberId, { persona: personaUpdate });
    }
    refreshAvatarUi();
    if (restoreRoomInfo) {
        renderRoomInfo();
        roomInfoModal.classList.remove('hidden');
    }
    if (!result.avatarUrl) {
        alert('身份資料已更新，但你在搜尋畫面選擇了「保留目前頭像」，所以圖片沒有改動。');
    }
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
    const roomTarget = avatarUploadRoomTarget;
    try {
        if (file && (targetKey || roomTarget)) {
            const dataUrl = await createOptimizedAvatarDataUrl(file);
            if (roomTarget) {
                roomManager.updateMember(roomTarget.roomId, roomTarget.memberId, {
                    persona: { avatarUrl: dataUrl },
                });
                if (currentRoom?.id === roomTarget.roomId) {
                    currentRoom = roomManager.getRoom(roomTarget.roomId) || currentRoom;
                    if (activeRoomMemberId === roomTarget.memberId && currentPersona) {
                        currentPersona.avatarUrl = dataUrl;
                    }
                }
            } else if (targetKey) {
                await memoryManager.setPersonaAvatar(targetKey, dataUrl);
            }
            if (targetKey && targetKey === currentPersonaKey) {
                currentPersona = memoryManager.getPersona(targetKey) || currentPersona;
            }
            refreshAvatarUi();
        }
    } catch (error) {
        alert(error instanceof Error ? error.message : '頭像更新失敗。');
    } finally {
        currentPersonaKeyForUpload = null;
        avatarUploadRoomTarget = null;
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
        ...Object.values(chatModelSettings),
        ...Object.values(DEFAULT_CHAT_MODEL_SETTINGS),
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

const chatModelSelects = [
    chatPrimaryModelSelect,
    chatQualityModelSelect,
    chatEmergencyModelSelect,
    ccPrimaryModelSelect,
];

const getChatModelOptionLabel = (model: VeniceModelSummary) => {
    const context = formatContextSize(model.contextTokens);
    const identity = model.name === model.id ? model.id : `${model.name} · ${model.id}`;
    return `${identity}${context ? ` · ${context}` : ''}`;
};

const populateChatModelSelect = (select: HTMLSelectElement, selectedId: string) => {
    select.innerHTML = '';
    const sorted = [...assistantModels].sort((left, right) => {
        if (left.uncensored !== right.uncensored) return left.uncensored ? -1 : 1;
        return left.name.localeCompare(right.name, 'zh-Hant');
    });
    if (selectedId && !sorted.some(model => model.id === selectedId)) {
        const current = document.createElement('option');
        current.value = selectedId;
        current.textContent = `${selectedId} · 目前設定（Venice 清單未找到）`;
        select.appendChild(current);
    }
    sorted.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = getChatModelOptionLabel(model);
        select.appendChild(option);
    });
    select.value = selectedId;
    if (!select.value && select.options.length > 0) select.selectedIndex = 0;
};

const readChatModelSettingsDraftFromControls = () => normalizeChatModelSettings({
    primary: chatPrimaryModelSelect.value,
    qualityFallback: chatQualityModelSelect.value,
    emergencyFallback: chatEmergencyModelSelect.value,
    ccPrimary: ccPrimaryModelSelect.value,
}, chatModelSettingsDraft);

const updateChatModelRoutePreviews = () => {
    chatModelSettingsDraft = readChatModelSettingsDraftFromControls();
    globalModelRoutePreview.textContent = `實際次序：${buildCharacterModelRoute(chatModelSettingsDraft, false).join(' → ')}。嚴格審查：${buildStrictReviewModelRoute(chatModelSettingsDraft, false).join(' → ')}。`;
    ccModelRoutePreview.textContent = `Cc 實際次序：${buildCharacterModelRoute(chatModelSettingsDraft, true).join(' → ')}。Cc 的生成及審查均先使用專用模型。`;
};

const renderChatModelSettingsOptions = () => {
    populateChatModelSelect(chatPrimaryModelSelect, chatModelSettingsDraft.primary);
    populateChatModelSelect(chatQualityModelSelect, chatModelSettingsDraft.qualityFallback);
    populateChatModelSelect(chatEmergencyModelSelect, chatModelSettingsDraft.emergencyFallback);
    populateChatModelSelect(ccPrimaryModelSelect, chatModelSettingsDraft.ccPrimary);
    chatModelSelects.forEach(select => { select.disabled = assistantModelsPromise !== null; });
    refreshChatModelsBtn.disabled = assistantModelsPromise !== null;
    updateChatModelRoutePreviews();
    if (assistantModelListUsesFallback) {
        chatModelListStatus.textContent = '未能連接 Venice；目前顯示已保存及程式預設模型。';
    } else if (assistantModelListUpdatedAt) {
        chatModelListStatus.textContent = `已從 Venice 取得 ${assistantModels.length} 個模型 · ${new Date(assistantModelListUpdatedAt).toLocaleTimeString('zh-Hant', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        chatModelListStatus.textContent = '正在讀取 Venice 模型清單...';
    }
};

const closeChatModelSettings = () => chatModelSettingsModal.classList.add('hidden');

const openChatModelSettings = (scope: 'global' | 'cc' = 'global') => {
    chatModelSettingsScope = scope;
    chatModelSettingsDraft = { ...chatModelSettings };
    chatModelSettingsTitle.textContent = scope === 'cc' ? 'Cc 專用模型設定' : '聊天模型設定';
    globalChatModelFields.classList.toggle('hidden', scope === 'cc');
    ccChatModelFields.classList.remove('hidden');
    renderChatModelSettingsOptions();
    chatModelSettingsModal.classList.remove('hidden');
    homeMenu.classList.add('hidden');
    moreOptionsMenu.classList.add('hidden');
    void loadAssistantModels().then(renderChatModelSettingsOptions);
};

const saveChatModelSettings = () => {
    chatModelSettingsDraft = readChatModelSettingsDraftFromControls();
    chatModelSettings = normalizeChatModelSettings(chatModelSettingsDraft, DEFAULT_CHAT_MODEL_SETTINGS);
    localStorage.setItem(CHAT_MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(chatModelSettings));
    closeChatModelSettings();
};

const formatCloudBackupBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
};

const formatCloudBackupTime = (value: number | string) => new Date(value).toLocaleString('zh-HK', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});

const setCloudBackupBusy = (busy: boolean) => {
    cloudBackupBusy = busy;
    [
        enableCloudBackupBtn,
        restoreCloudWithPasswordBtn,
        cloudBackupNowBtn,
        cloudRestoreLatestBtn,
        refreshCloudBackupsBtn,
        deleteCloudBackupsBtn,
        scanLocalPhotoVaultBtn,
    ].forEach(button => { button.disabled = busy; });
    cloudBackupAutoToggle.disabled = busy;
};

function renderCloudBackupProgress(progress: CloudBackupProgress) {
    cloudBackupLastProgress = progress;
    const active = ['packing', 'encrypting', 'uploading', 'restoring'].includes(progress.stage);
    setCloudBackupBusy(active);
    cloudBackupProgress.classList.toggle('hidden', progress.stage === 'idle');
    cloudBackupProgressText.textContent = progress.message;
    cloudBackupProgressPercent.textContent = typeof progress.percent === 'number' ? `${progress.percent}%` : '';
    cloudBackupProgressBar.style.width = `${progress.percent ?? (active ? 8 : progress.stage === 'success' ? 100 : 0)}%`;
    if (progress.stage === 'success') {
        window.setTimeout(() => {
            if (cloudBackupLastProgress.stage === 'success') {
                cloudBackupProgress.classList.add('hidden');
                cloudBackupLastProgress = { stage: 'idle', message: '尚未開始雲端備份。' };
            }
        }, 3500);
        void refreshCloudBackupView(true);
    }
}

const renderCloudBackupVersions = () => {
    cloudBackupVersionList.innerHTML = '';
    if (cloudBackupList.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'cloud-backup-empty';
        empty.textContent = '雲端尚未有備份。';
        cloudBackupVersionList.appendChild(empty);
        return;
    }

    cloudBackupList.forEach((backup, index) => {
        const row = document.createElement('div');
        row.className = 'cloud-backup-version-row';
        const copy = document.createElement('span');
        const title = document.createElement('strong');
        title.textContent = `${index === 0 ? '最新 · ' : ''}${formatCloudBackupTime(backup.uploadedAt)}`;
        const details = document.createElement('small');
        details.textContent = `${formatCloudBackupBytes(backup.size)} · 已加密`;
        copy.append(title, details);
        const restore = document.createElement('button');
        restore.type = 'button';
        restore.textContent = '還原';
        restore.disabled = cloudBackupBusy;
        restore.addEventListener('click', () => {
            if (!cloudBackupHasLocalKey) {
                cloudBackupRecovery.classList.remove('hidden');
                cloudRestorePassword.focus();
                return;
            }
            void restoreCloudBackupVersion(backup);
        });
        row.append(copy, restore);
        cloudBackupVersionList.appendChild(row);
    });
};

const renderCloudBackupState = () => {
    const state = cloudBackupManager.getState();
    const hasRemoteBackup = cloudBackupList.length > 0;
    cloudBackupSetup.classList.toggle('hidden', cloudBackupHasLocalKey);
    cloudBackupRecovery.classList.toggle('hidden', cloudBackupHasLocalKey);
    cloudBackupControls.classList.toggle('hidden', !cloudBackupHasLocalKey);
    cloudBackupVersionsSection.classList.toggle('hidden', !hasRemoteBackup && !cloudBackupHasLocalKey);
    cloudBackupDanger.classList.toggle('hidden', !hasRemoteBackup && !cloudBackupHasLocalKey);
    cloudBackupAutoToggle.checked = state.enabled && cloudBackupHasLocalKey;

    cloudBackupStatusIcon.className = 'cloud-backup-status-icon';
    if (state.lastError) {
        cloudBackupStatusIcon.textContent = '!';
        cloudBackupStatusIcon.classList.add('is-error');
        cloudBackupStatusTitle.textContent = '上次雲端操作失敗';
        cloudBackupStatusDetail.textContent = state.lastError;
    } else if (!cloudBackupHasLocalKey) {
        cloudBackupStatusIcon.textContent = hasRemoteBackup ? '↧' : '＋';
        cloudBackupStatusIcon.classList.add('is-warning');
        cloudBackupStatusTitle.textContent = hasRemoteBackup ? '找到可復原的加密備份' : '這部裝置尚未連接雲端';
        cloudBackupStatusDetail.textContent = hasRemoteBackup
            ? '已找到這個復原密碼的私人備份，可以立即還原。'
            : '可建立新的私人備份，或輸入原有復原密碼找回資料。';
    } else if (state.lastBackupAt && hasRemoteBackup) {
        cloudBackupStatusIcon.textContent = '✓';
        cloudBackupStatusTitle.textContent = state.enabled ? '自動備份已開啟' : '雲端備份已暫停';
        cloudBackupStatusDetail.textContent = [
            `最近備份：${formatCloudBackupTime(state.lastBackupAt)}`,
            formatCloudBackupBytes(state.lastBackupSize),
            typeof state.lastBackupPhotoCount === 'number' ? `聊天相片 ${state.lastBackupPhotoCount} 張` : '',
        ].filter(Boolean).join(' · ');
    } else if (cloudBackupHasLocalKey) {
        cloudBackupStatusIcon.textContent = '↑';
        cloudBackupStatusIcon.classList.add('is-warning');
        cloudBackupStatusTitle.textContent = '金鑰已準備，尚未完成上傳';
        cloudBackupStatusDetail.textContent = '按「立即備份」建立第一個加密雲端版本。';
    }
    renderCloudBackupVersions();
};

async function refreshCloudBackupView(fetchRemote = true) {
    try {
        cloudBackupHasLocalKey = await cloudBackupManager.hasLocalRecoveryKey();
        if (fetchRemote) cloudBackupList = await cloudBackupManager.listBackups();
    } catch (error) {
        cloudBackupStatusIcon.textContent = '!';
        cloudBackupStatusIcon.className = 'cloud-backup-status-icon is-error';
        cloudBackupStatusTitle.textContent = '無法讀取雲端備份';
        cloudBackupStatusDetail.textContent = error instanceof Error ? error.message : '請稍後再試。';
    }
    renderCloudBackupState();
}

async function scanLocalPhotoVault(showWorking = true) {
    if (showWorking) localPhotoVaultResult.textContent = '正在掃描本機照片庫…';
    scanLocalPhotoVaultBtn.disabled = true;
    try {
        const assets = await listCharacterPhotoAssets();
        const referencedIds = new Set(
            Object.values(memoryManager.getAllChatHistories())
                .flatMap(history => history.map(message => message.content.imageAssetId))
                .filter((assetId): assetId is string => Boolean(assetId)),
        );
        const orphanAssets = assets.filter(asset => !referencedIds.has(asset.id));
        const ccKeys = new Set([
            'cc',
            'custom_seed_cc',
            ...Object.entries(memoryManager.getAllPersonas())
                .filter(([, persona]) => persona.name.trim().toLocaleLowerCase() === 'cc')
                .map(([key]) => key),
        ]);
        const ccAssets = assets.filter(asset => ccKeys.has(asset.personaKey));
        const ccOrphans = ccAssets.filter(asset => !referencedIds.has(asset.id));
        localPhotoVaultResult.textContent = [
            `找到 ${assets.length} 張實體照片`,
            `${orphanAssets.length} 張失去聊天索引`,
            `Cc 共 ${ccAssets.length} 張（其中 ${ccOrphans.length} 張待救回）`,
            '待救回照片現在會直接顯示在所屬聊天室的「媒體」相簿，下一次備份亦會完整打包。',
        ].join('；');
    } catch (error) {
        localPhotoVaultResult.textContent = `掃描失敗：${error instanceof Error ? error.message : '無法讀取本機照片資料庫'}`;
    } finally {
        scanLocalPhotoVaultBtn.disabled = cloudBackupBusy;
    }
}

const openCloudBackup = () => {
    cloudBackupSetupError.textContent = '';
    cloudRestoreError.textContent = '';
    cloudBackupModal.classList.remove('hidden');
    homeMenu.classList.add('hidden');
    void refreshCloudBackupView(true);
    void scanLocalPhotoVault(false);
};

const closeCloudBackup = () => cloudBackupModal.classList.add('hidden');

const formatLiveCloudTime = (timestamp?: number) => timestamp
    ? new Intl.DateTimeFormat('zh-HK', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp))
    : '';

function renderSupabaseCloudState(state: SupabaseCloudSyncState) {
    const busy = ['sending_link', 'connecting', 'pulling', 'pushing'].includes(state.phase);
    const signedIn = Boolean(state.email);
    const titles: Record<SupabaseCloudSyncState['phase'], string> = {
        unconfigured: '即時雲端尚未設定',
        signed_out: '尚未登入即時雲端',
        sending_link: '正在傳送登入連結',
        connecting: '正在連接私人雲端',
        pulling: '正在下載最新資料',
        pushing: '正在上傳本機變更',
        synced: '即時雲端已同步',
        offline: '目前使用離線快取',
        error: '即時雲端需要處理',
    };
    supabaseCloudStatusTitle.textContent = titles[state.phase];
    supabaseCloudStatusDetail.textContent = state.lastSyncAt && state.phase === 'synced'
        ? `${state.detail} 最近同步：${formatLiveCloudTime(state.lastSyncAt)}`
        : state.detail;
    supabaseCloudStatusIcon.className = 'cloud-backup-status-icon';
    if (state.phase === 'error') {
        supabaseCloudStatusIcon.textContent = '!';
        supabaseCloudStatusIcon.classList.add('is-error');
    } else if (state.phase === 'synced') {
        supabaseCloudStatusIcon.textContent = '✓';
    } else if (state.phase === 'pulling') {
        supabaseCloudStatusIcon.textContent = '↓';
        supabaseCloudStatusIcon.classList.add('is-warning');
    } else if (state.phase === 'pushing') {
        supabaseCloudStatusIcon.textContent = '↑';
        supabaseCloudStatusIcon.classList.add('is-warning');
    } else {
        supabaseCloudStatusIcon.textContent = '↥';
        supabaseCloudStatusIcon.classList.add('is-warning');
    }

    supabaseCloudLogin.classList.toggle('hidden', signedIn);
    supabaseCloudControls.classList.toggle('hidden', !signedIn);
    supabaseCloudAccount.textContent = state.email || '';
    supabaseCloudError.textContent = state.phase === 'error' ? state.detail : '';
    supabaseCloudSendLink.disabled = busy || !state.configured;
    supabaseCloudSyncNow.disabled = busy;
    supabaseCloudReload.disabled = busy;
    supabaseCloudSignOut.disabled = busy;
    supabaseCloudProgress.classList.toggle('hidden', !busy);
    supabaseCloudProgressText.textContent = state.detail;
    supabaseCloudProgressPercent.textContent = typeof state.progress === 'number' ? `${state.progress}%` : '';
    supabaseCloudProgressBar.style.width = `${state.progress ?? (busy ? 12 : 0)}%`;
}

const openSupabaseCloud = () => {
    homeMenu.classList.add('hidden');
    supabaseCloudEmail.value = supabaseCloudSyncManager.getOwnerEmail();
    renderSupabaseCloudState(supabaseCloudSyncManager.getState());
    supabaseCloudModal.classList.remove('hidden');
};

const closeSupabaseCloud = () => supabaseCloudModal.classList.add('hidden');

const sendSupabaseMagicLink = async () => {
    supabaseCloudError.textContent = '';
    try {
        await supabaseCloudSyncManager.sendMagicLink(supabaseCloudEmail.value);
    } catch (error) {
        supabaseCloudError.textContent = error instanceof Error ? error.message : '未能傳送登入連結。';
    }
};

const syncSupabaseCloudNow = async () => {
    try {
        await supabaseCloudSyncManager.syncNow();
    } catch (error) {
        supabaseCloudError.textContent = error instanceof Error ? error.message : '同步失敗。';
    }
};

const reloadSupabaseCloud = async () => {
    if (!confirm('會先上傳尚未同步的本機變更，再重新載入雲端最新資料。繼續嗎？')) return;
    try {
        await supabaseCloudSyncManager.reloadFromCloud();
    } catch (error) {
        supabaseCloudError.textContent = error instanceof Error ? error.message : '重新載入失敗。';
    }
};

const setupCloudBackup = async () => {
    cloudBackupSetupError.textContent = '';
    const password = cloudBackupPassword.value;
    if (password.normalize('NFKC').trim().length < 12) {
        cloudBackupSetupError.textContent = '復原密碼至少需要 12 個字元。';
        cloudBackupPassword.focus();
        return;
    }
    if (password !== cloudBackupPasswordConfirm.value) {
        cloudBackupSetupError.textContent = '兩次輸入的復原密碼不同。';
        cloudBackupPasswordConfirm.focus();
        return;
    }

    setCloudBackupBusy(true);
    try {
        await cloudBackupManager.setup(password);
        cloudBackupPassword.value = '';
        cloudBackupPasswordConfirm.value = '';
        cloudBackupHasLocalKey = true;
        await refreshCloudBackupView(true);
    } catch (error) {
        const message = error instanceof Error ? error.message : '首次備份失敗。';
        if (message === 'CLOUD_BACKUP_EXISTS') {
            cloudBackupSetupError.textContent = '這個復原密碼已有雲端備份，請在下方使用「從雲端復原」，避免覆蓋原資料。';
            cloudRestorePassword.focus();
        } else {
            cloudBackupSetupError.textContent = message;
        }
    } finally {
        setCloudBackupBusy(false);
    }
};

async function restoreCloudBackupVersion(backup: CloudBackupListItem, password?: string) {
    if (!confirm(
        `以 ${formatCloudBackupTime(backup.uploadedAt)} 的完整雲端備份取代這部裝置的本機副本？\n\n雲端版本不會被修改；自動備份會維持目前的開關狀態。`,
    )) return;
    cloudRestoreError.textContent = '';
    setCloudBackupBusy(true);
    try {
        await cloudBackupManager.restoreBackup(backup, password);
        cloudRestorePassword.value = '';
        cloudBackupHasLocalKey = true;
        await refreshCloudBackupView(true);
    } catch (error) {
        const message = error instanceof Error ? error.message : '雲端還原失敗。';
        cloudRestoreError.textContent = message === 'NEEDS_RECOVERY_PASSWORD'
            ? '請先輸入原本的復原密碼。'
            : message;
        cloudBackupRecovery.classList.remove('hidden');
        cloudRestorePassword.focus();
    } finally {
        setCloudBackupBusy(false);
    }
};

const restoreLatestCloudBackupWithPassword = async () => {
    const password = cloudRestorePassword.value;
    if (!password) {
        cloudRestoreError.textContent = '請輸入復原密碼。';
        cloudRestorePassword.focus();
        return;
    }
    cloudRestoreError.textContent = '';
    setCloudBackupBusy(true);
    try {
        cloudBackupList = await cloudBackupManager.listBackups(password);
        const latest = cloudBackupList[0];
        if (!latest) {
            cloudRestoreError.textContent = '找不到這個復原密碼所屬的備份，請檢查密碼是否正確。';
            renderCloudBackupState();
            return;
        }
        renderCloudBackupState();
        await restoreCloudBackupVersion(latest, password);
    } catch (error) {
        cloudRestoreError.textContent = error instanceof Error ? error.message : '無法讀取雲端備份。';
    } finally {
        setCloudBackupBusy(false);
    }
};

const backupCloudNow = async () => {
    setCloudBackupBusy(true);
    try {
        await cloudBackupManager.backupNow();
        await refreshCloudBackupView(true);
    } catch (error) {
        cloudBackupStatusDetail.textContent = error instanceof Error ? error.message : '雲端備份失敗。';
    } finally {
        setCloudBackupBusy(false);
    }
};

const deleteAllCloudBackups = async () => {
    if (!confirm('確定刪除所有雲端備份及這部裝置的備份金鑰？\n\n本機聊天不會刪除，但之後無法從這些雲端版本復原。')) return;
    if (!confirm('這個動作不能復原。確定繼續？')) return;
    setCloudBackupBusy(true);
    try {
        await cloudBackupManager.deleteAllCloudData();
        cloudBackupList = [];
        cloudBackupHasLocalKey = false;
        renderCloudBackupState();
    } catch (error) {
        cloudBackupStatusDetail.textContent = error instanceof Error ? error.message : '刪除雲端備份失敗。';
    } finally {
        setCloudBackupBusy(false);
    }
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
    refreshChatModelsBtn.disabled = true;
    assistantModelMeta.textContent = '正在讀取 Venice 可用模型...';

    assistantModelsPromise = (async () => {
        try {
            assistantModels = await listVeniceTextModels(force);
            if (assistantModels.length === 0) {
                throw new Error('沒有可用的文字模型。');
            }
            assistantModelListUsesFallback = false;
            assistantModelListUpdatedAt = Date.now();
        } catch (error) {
            console.warn('Unable to load Venice models; using configured fallback list.', error);
            assistantModels = buildFallbackAssistantModels();
            assistantModelListUsesFallback = true;
            if (error instanceof Error && error.message === VENICE_AUTH_REQUIRED_ERROR) {
                handleAuthRequired();
            }
        } finally {
            renderAssistantModelOptions();
            refreshAssistantModelsBtn.disabled = false;
            assistantModelsPromise = null;
            renderChatModelSettingsOptions();
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

const getSelectedImageModel = () => {
    return imageModels[imageStudioMode].find(model => model.id === selectedImageModels[imageStudioMode]);
};

const getImageModelPrice = (model?: VeniceImageModelSummary, requestedResolution?: string) => {
    if (!model) return undefined;
    const resolution = requestedResolution
        || imageResolution.value
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
        return (getImageModelPrice(left, left.constraints.defaultResolution) ?? Number.MAX_SAFE_INTEGER)
            - (getImageModelPrice(right, right.constraints.defaultResolution) ?? Number.MAX_SAFE_INTEGER);
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
            const modelPrice = getImageModelPrice(model, model.constraints.defaultResolution);
            const price = typeof modelPrice === 'number' ? ` · $${formatModelPrice(modelPrice)}` : '';
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
    localStorage.setItem(IMAGE_SEED_STORAGE_KEY, String(seed));
    return seed;
};

const initializeImageSeedControls = () => {
    imageSeedLock.checked = localStorage.getItem(IMAGE_SEED_LOCK_STORAGE_KEY) === 'true';
    const stored = normalizeImageSeed(localStorage.getItem(IMAGE_SEED_STORAGE_KEY) || undefined);
    setSeedInputValue(imageSeed, stored ?? createRandomImageSeed());
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
        image.addEventListener('click', () => openPhotoViewer(result.url, {
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
    imageStudioStatus.textContent = imageStudioMode === 'generate' ? '正在生成畫面...' : '正在分析並修改來源圖片...';
    const startedAt = performance.now();

    try {
        const hasAspectRatioApi = Boolean(model.constraints.aspectRatios?.length);
        const pixelSize = PIXEL_IMAGE_DIMENSIONS[imageAspectRatio.value] || PIXEL_IMAGE_DIMENSIONS['1:1'];
        const seedValue = imageStudioMode === 'generate'
            ? resolveImageSeedForRequest(imageSeed, imageSeedLock.checked)
            : undefined;
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

    [memoryBtn, personaSettingsBtn, changeAvatarBtn, albumBtn, takePhotoBtn, surpriseEventBtn, newSceneBtn, downloadImagesBtn].forEach(element => {
        element.classList.toggle('hidden', assistantMode);
    });
    inviteCharacterBtn.classList.toggle('hidden', assistantMode);
    dmRoomMemberBtn.classList.toggle('hidden', assistantMode || !currentRoom);
    leaveRoomMemberBtn.classList.toggle('hidden', assistantMode || !currentRoom);
    ccModelSettingsBtn.classList.toggle('hidden', assistantMode || key !== 'cc');

    if (assistantMode) {
        void loadAssistantModels();
    }
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

    const request: ActiveChatRequest = {
        id: nextChatRequestId,
        personaKey,
        conversationKey,
        persona: { ...persona },
        room: currentRoom ? cloneRoomSnapshot(currentRoom) : undefined,
        roomMemberId: currentRoom ? activeRoomMemberId || currentRoom.leadMemberId : undefined,
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
    if (request.surpriseEvent) {
        updateSurpriseEventProposal(request.conversationKey, request.surpriseEvent.id, {
            status: 'pending',
            error: undefined,
        });
    }
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
        }, sender, message);
    });
    appendHistoryDivider('新群組由這裡開始');
};

const startLegacyChat = (key: string, restoredHistory: any[] | null = null, historyMode: 'push' | 'replace' | 'skip' = 'push') => {
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
            appendMessage(message.content, 'user', message);
        } else if (message.role === 'model') {
            appendMessage(message.content, 'bot', message);
        } else if (message.role === 'system') {
            appendMessage(
                message.content.text?.trim() === SCENE_END_MARKER
                    ? { ...message.content, text: SCENE_START_LABEL }
                    : message.content,
                'system',
                message,
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
    syncBrowserViewState({ view: 'chat', conversationKey: key, personaKey: key }, historyMode);
};

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

const startChat = (key: string, restoredHistory: ChatMessage[] | null = null, historyMode: 'push' | 'replace' | 'skip' = 'push') => {
    cancelActiveChatRequest();
    closeChatSearch();
    const storedRoom = roomManager.getRoom(key) || null;
    const room = storedRoom
        ? restoreRoomPrivateContinuityHandoffs(
            storedRoom,
            restoredHistory || memoryManager.peekChatHistory(key),
        )
        : null;
    const selectedPersona = memoryManager.getPersona(key);

    if (!room && (!selectedPersona || (key !== VENICE_ASSISTANT_PERSONA_KEY && selectedPersona.gender !== 'female'))) {
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
        currentPersonaKey = key;
        currentPersona = selectedPersona!;
        chatHeaderName.textContent = currentPersona.conversationLabel || currentPersona.name;
    }

    isGodModeActive = false;
    godModeHistory = [];
    updateChatModeControls(currentPersonaKey);
    renderChatHeaderAvatar();

    chatContainer.innerHTML = '';
    let chatHistory = restoredHistory || memoryManager.getChatHistory(key);
    if (restoredHistory) memoryManager.setChatHistory(key, restoredHistory);
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
    chatHistory.forEach(message => {
        const sender = message.role === 'user' ? 'user' : message.role === 'model' ? 'bot' : 'system';
        const content = message.role === 'system' && message.content.text?.trim() === SCENE_END_MARKER
            ? { ...message.content, text: SCENE_START_LABEL }
            : message.content;
        appendMessage(content, sender, message);
    });

    appShell.classList.add('chat-open');
    personaSelectionView.classList.remove('hidden');
    imageStudioView.classList.add('hidden');
    imageStudioView.classList.remove('flex');
    videoStudioView.classList.add('hidden');
    videoStudioView.classList.remove('flex');
    chatView.classList.remove('hidden');
    chatView.classList.add('flex');
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
        chatContainer.scrollTop = chatContainer.scrollHeight;
        if (window.matchMedia('(min-width: 769px)').matches) messageInput.focus();
    });
    syncBrowserViewState({
        view: 'chat',
        conversationKey: key,
        personaKey: currentPersonaKey || undefined,
    }, historyMode);
};

const showSelectionView = (historyMode: 'replace' | 'skip' = 'replace') => {
    cancelActiveChatRequest();
    closeChatSearch();
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
    appShell.classList.remove('chat-open');
    currentPersona = null;
    currentPersonaKey = null;
    currentConversationKey = null;
    currentRoom = null;
    activeRoomMemberId = null;
    isGodModeActive = false;
    closePersonaSettings();
    hideError();
    applyChatRuntimeState('idle');
    removeGift();
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

const collectReferencedPhotoAssetIds = (excludingConversationKey?: string) => new Set(
    Object.entries(memoryManager.getAllChatHistories())
        .filter(([key]) => key !== excludingConversationKey)
        .flatMap(([, messages]) => messages
            .map(message => message.content.imageAssetId)
            .filter((assetId): assetId is string => Boolean(assetId))),
);

const collectReferencedAttachmentAssetIds = (excludingConversationKey?: string) => new Set(
    Object.entries(memoryManager.getAllChatHistories())
        .filter(([key]) => key !== excludingConversationKey)
        .flatMap(([, messages]) => messages.flatMap(message => (
            message.content.attachments?.map(attachment => attachment.assetId) || []
        ))),
);

const deleteCharacterPhotoAssetsForHistory = async (
    history: ChatMessage[],
    excludingConversationKey?: string,
) => {
    const stillReferenced = collectReferencedPhotoAssetIds(excludingConversationKey);
    const assetIds = Array.from(new Set(history
        .map(message => message.content.imageAssetId)
        .filter((assetId): assetId is string => Boolean(assetId))));
    await Promise.all(assetIds.map(async assetId => {
        if (stillReferenced.has(assetId)) return;
        const objectUrl = characterPhotoObjectUrls.get(assetId);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        characterPhotoObjectUrls.delete(assetId);
        await deleteCharacterPhotoAsset(assetId);
    }));
};

const deleteConversationFromList = async (key: string, title: string, room?: ChatRoom) => {
    const persona = room ? null : memoryManager.getPersona(key);
    const isTimelineBranch = Boolean(room?.timelineBranch || persona?.timelineBranch);
    const prompt = isTimelineBranch
        ? `確定要刪除時間線「${title}」嗎？原本的對話不會受影響。此動作無法復原。`
        : room
            ? `確定要刪除群組「${title}」及其全部聊天記錄嗎？群組成員原本的一對一聊天不會受影響。此動作無法復原。`
            : `確定要刪除與「${title}」的聊天記錄嗎？角色人格、頭像、soul.md 與 memory.md 會保留。`;
    if (!confirm(prompt)) return;

    if (currentConversationKey === key) {
        cancelActiveChatRequest();
        if (characterPhotoRequestController) characterPhotoRequestController.abort();
    }
    const history = memoryManager.peekChatHistory(key);
    await Promise.all([
        deleteCharacterPhotoAssetsForHistory(history, key),
        deleteChatAttachmentAssetsForHistory(history, key),
    ]);

    if (room) {
        memoryManager.deleteChatHistory(key);
        roomManager.deleteRoom(key);
        if (currentConversationKey === key) showSelectionView('replace');
    } else if (isTimelineBranch && key.startsWith('custom_')) {
        memoryManager.deleteCustomPersona(key);
        if (currentConversationKey === key) showSelectionView('replace');
    } else {
        memoryManager.clearChatHistory(key);
        if (currentConversationKey === key) startChat(key, null, 'replace');
    }
    renderPersonaList();
};

const deleteChatAttachmentAssetsForHistory = async (
    history: ChatMessage[],
    excludingConversationKey?: string,
) => {
    const stillReferenced = collectReferencedAttachmentAssetIds(excludingConversationKey);
    const assetIds = Array.from(new Set(history.flatMap(message => (
        message.content.attachments?.map(attachment => attachment.assetId) || []
    ))));
    await Promise.all(assetIds.map(async assetId => {
        if (stillReferenced.has(assetId)) return;
        const objectUrl = chatAttachmentObjectUrls.get(assetId);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        chatAttachmentObjectUrls.delete(assetId);
        await deleteChatAttachment(assetId);
    }));
};

const branchMemoryEntriesAt = <T extends { sourceMessageIds?: string[] }>(
    entries: T[] | undefined,
    includedMessageIds: Set<string>,
) => (entries || [])
    .filter(entry => !entry.sourceMessageIds?.length
        || entry.sourceMessageIds.every(messageId => includedMessageIds.has(messageId)))
    .map(entry => cloneRoomSnapshot(entry));

const formatTimelineBranchTitle = (sourceTitle: string, createdAt: number) => {
    const stamp = new Intl.DateTimeFormat('zh-HK', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(createdAt));
    return `${sourceTitle} · 分支 ${stamp}`;
};

const TIMELINE_BRANCH_HISTORY_LIMIT = 160;

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

const createTimelineBranch = async (messageId: string) => {
    closeMessageActions();
    if (!currentConversationKey || !currentPersona) return;
    if (activeChatRequest) {
        alert('請先等待目前回覆完成，再建立時間線分支。');
        return;
    }

    const sourceConversationKey = currentConversationKey;
    const sourceRoom = roomManager.getRoom(sourceConversationKey) || null;
    const sourcePersona = sourceRoom ? null : memoryManager.getPersona(sourceConversationKey) || currentPersona;
    const history = memoryManager.getChatHistory(sourceConversationKey);
    const branchPointIndex = history.findIndex(message => message.id === messageId && message.role === 'user');
    if (branchPointIndex < 0) {
        alert('找不到這則訊息，可能已經被移除。');
        return;
    }

    const branchPoint = history[branchPointIndex];
    const branchPointText = branchPoint.content.text || '';
    const fullPrefix = history.slice(0, branchPointIndex);
    const prefix = cloneRoomSnapshot(fullPrefix.slice(-TIMELINE_BRANCH_HISTORY_LIMIT));
    const omittedMessageCount = Math.max(0, fullPrefix.length - prefix.length);
    const includedMessageIds = new Set(fullPrefix
        .map(message => message.id)
        .filter((id): id is string => Boolean(id)));
    const now = Date.now();
    const sourceTitle = sourceRoom?.title
        || sourcePersona?.conversationLabel
        || sourcePersona?.name
        || currentPersona.name;
    const branchTitle = formatTimelineBranchTitle(sourceTitle, now);
    const branchInfo = {
        sourceConversationKey,
        sourceMessageId: messageId,
        sourceTitle,
        createdAt: now,
        omittedMessageCount: omittedMessageCount || undefined,
    };
    const marker: ChatMessage = {
        id: crypto.randomUUID?.() || `branch-${now}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        role: 'system',
        content: {
            text: [
                `[時間線分支] 已從「${branchPointText.replace(/\s+/gu, ' ').trim().slice(0, 80) || '這則訊息'}」之前建立獨立分支；原對話保持不變。`,
                omittedMessageCount > 0
                    ? `為避免長對話重複佔用儲存空間，這裡顯示分支點前最近 ${prefix.length} 則訊息；更早內容仍在原對話，已整理的 soul.md 與 memory.md 亦已承接。`
                    : '',
            ].filter(Boolean).join('\n'),
        },
    };

    let branchConversationKey: string | null = null;
    let createdRoom = false;
    try {
        if (sourceRoom) {
            const roomCopy = cloneRoomSnapshot(sourceRoom);
            branchConversationKey = `room_branch_${now}_${Math.random().toString(36).slice(2, 9)}`;
            roomCopy.id = branchConversationKey;
            roomCopy.title = branchTitle;
            roomCopy.description = `由「${sourceTitle}」建立的獨立時間線`;
            roomCopy.timelineBranch = branchInfo;
            roomCopy.createdAt = now;
            roomCopy.updatedAt = now;
            roomCopy.lastSummarizedUserMessageCount = prefix.filter(message => message.role === 'user').length;
            roomCopy.scene = cloneRoomSnapshot(branchPoint.content.roomSceneBeforeTurn || sourceRoom.scene);
            const validMemberIds = new Set(roomCopy.members.map(member => member.id));
            roomCopy.scene.presentMemberIds = roomCopy.scene.presentMemberIds.filter(id => validMemberIds.has(id));
            if (!roomCopy.scene.presentMemberIds.length) roomCopy.scene.presentMemberIds = [roomCopy.leadMemberId];
            roomCopy.members.forEach(member => {
                member.soul = branchMemoryEntriesAt(member.soul, includedMessageIds);
                member.memories = branchMemoryEntriesAt(member.memories, includedMessageIds);
                member.persona.soul = branchMemoryEntriesAt(member.persona.soul, includedMessageIds);
                member.persona.memories = branchMemoryEntriesAt(member.persona.memories, includedMessageIds);
            });
            roomCopy.sharedSoul = branchMemoryEntriesAt(roomCopy.sharedSoul, includedMessageIds);
            roomCopy.sharedMemories = branchMemoryEntriesAt(roomCopy.sharedMemories, includedMessageIds);
            roomManager.saveRoom(roomCopy);
            createdRoom = true;
        } else if (sourcePersona) {
            const personaCopy = cloneRoomSnapshot(sourcePersona);
            personaCopy.conversationLabel = branchTitle;
            personaCopy.timelineBranch = branchInfo;
            personaCopy.soul = branchMemoryEntriesAt(personaCopy.soul, includedMessageIds);
            personaCopy.memories = branchMemoryEntriesAt(personaCopy.memories, includedMessageIds);
            personaCopy.lastMemorySummaryUserMessageCount = prefix.filter(message => message.role === 'user').length;
            branchConversationKey = await memoryManager.saveCustomPersonaCopy(personaCopy);
        }

        if (!branchConversationKey) throw new Error('無法建立分支對話。');
        memoryManager.setChatHistory(branchConversationKey, [...prefix, marker], true);
        renderPersonaList();
        startChat(branchConversationKey, null, 'push');
        messageInput.value = branchPoint.content.attachments?.length
            && branchPointText.trim() === '請查看附件。'
            ? ''
            : branchPointText;
        resetMessageInput();
        updateSendButtonState();
        window.requestAnimationFrame(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
            if (window.matchMedia('(min-width: 769px)').matches) {
                messageInput.focus();
                messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
            }
        });
    } catch (error) {
        if (branchConversationKey) {
            memoryManager.deleteChatHistory(branchConversationKey);
            if (createdRoom) roomManager.deleteRoom(branchConversationKey);
            else memoryManager.deleteCustomPersona(branchConversationKey);
        }
        console.error('Unable to create timeline branch:', error);
        alert(error instanceof Error ? `建立時間線分支失敗：${error.message}` : '建立時間線分支失敗。');
    }
};

const recallUserMessage = async (messageId: string) => {
    closeMessageActions();
    if (!currentConversationKey) return;
    const conversationKey = currentConversationKey;
    const history = memoryManager.getChatHistory(conversationKey);
    const startIndex = history.findIndex(message => message.id === messageId && message.role === 'user');
    if (startIndex < 0) {
        alert('找不到這則訊息，可能已經被移除。');
        return;
    }
    let endIndex = startIndex + 1;
    while (endIndex < history.length && history[endIndex].role !== 'user') endIndex += 1;
    const turn = history.slice(startIndex, endIndex);
    const replyCount = turn.filter(message => message.role === 'model').length;
    const confirmed = confirm(replyCount > 0
        ? '收回這則訊息，並刪除角色對這一回合的回覆？'
        : '收回這則訊息？');
    if (!confirmed) return;

    if (activeChatRequest?.conversationKey === conversationKey) cancelActiveChatRequest();
    const result = memoryManager.removeUserTurn(conversationKey, messageId);
    if (!result) return;
    const recalledMessage = result.removed[0];
    const sceneBeforeTurn = recalledMessage.content.roomSceneBeforeTurn;
    if (sceneBeforeTurn && roomManager.getRoom(conversationKey)) {
        roomManager.updateRoom(conversationKey, room => {
            room.scene = cloneRoomSnapshot(sceneBeforeTurn);
        });
    }
    await Promise.all([
        deleteCharacterPhotoAssetsForHistory(result.removed).catch(error => {
            console.warn('Unable to remove recalled photo assets:', error);
        }),
        deleteChatAttachmentAssetsForHistory(result.removed).catch(error => {
            console.warn('Unable to remove recalled attachment assets:', error);
        }),
    ]);

    const recalledText = recalledMessage.content.attachments?.length
        && recalledMessage.content.text?.trim() === '請查看附件。'
        ? ''
        : recalledMessage.content.text || '';
    startChat(conversationKey, null, 'skip');
    messageInput.value = recalledText;
    resetMessageInput();
    updateSendButtonState();
    renderPersonaList();
    window.setTimeout(() => {
        messageInput.focus();
        messageInput.setSelectionRange(messageInput.value.length, messageInput.value.length);
    }, 40);
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
            const blob = await getChatAttachmentBlob(attachment.assetId);
            if (!blob) throw new Error('附件只存在原本裝置，或已被清除。');
            let objectUrl = chatAttachmentObjectUrls.get(attachment.assetId);
            if (!objectUrl) {
                objectUrl = URL.createObjectURL(blob);
                chatAttachmentObjectUrls.set(attachment.assetId, objectUrl);
            }
            if (attachment.kind === 'image') {
                photoFullscreenImage.src = objectUrl;
                photoFullscreenModal.classList.remove('hidden');
                resetPhotoFullscreenTransform();
                window.setTimeout(() => closePhotoFullscreen.focus(), 0);
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
    const title = document.createElement('strong');
    title.textContent = proposal.status === 'pending' ? '要把這件事記住很久嗎？' : '記憶處理結果';
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
            : proposal.status === 'session-only' ? '只在目前對話使用' : '沒有儲存';
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
            if (action === 'saved' && room && targetIds.length === 0) {
                alert('請至少選擇 1 位角色。');
                return;
            }
            if (action === 'saved') {
                if (room) {
                    roomManager.addSoulMemory(room.id, targetIds, {
                        kind: 'vulnerability',
                        title: proposal.summary.slice(0, 36),
                        summary: proposal.summary,
                        originalText: proposal.originalText,
                        participants: targetIds,
                    });
                    refreshCurrentRoom();
                } else if (currentPersonaKey && currentPersona) {
                    memoryManager.addPersonaMemory(currentPersonaKey, 'soul', {
                        kind: 'vulnerability',
                        title: proposal.summary.slice(0, 36),
                        summary: proposal.summary,
                        originalText: proposal.originalText,
                    });
                }
            }
            const conversationKey = currentConversationKey;
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
        makeButton('永久記住', 'saved', true),
        makeButton('只限本次', 'session-only'),
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

const analyzeObservedNpcPersona = async (
    proposal: NonNullable<Content['npcProposal']>,
    mainPersona: Persona,
    identity?: PublicIdentity,
): Promise<ObservedNpcPersonaDraft> => {
    const liveEvidence = currentConversationKey
        ? buildNpcObservationEvidence(currentConversationKey, proposal.name)
        : '';
    const evidence = [proposal.evidence, liveEvidence]
        .filter((value): value is string => Boolean(value?.trim()))
        .join('\n\n')
        .slice(-NPC_OBSERVATION_EVIDENCE_LIMIT);
    const fallback = buildFallbackObservedNpcPersonaDraft({
        proposal,
        mainPersonaName: mainPersona.name,
        identity,
        evidence,
    });
    if (proposal.detectionSource !== 'observed' || evidence.length < 20) return fallback;

    const models = buildStrictReviewModelRoute(chatModelSettings, false);
    for (const model of models) {
        try {
            const result = await generateChatTextWithTimeout({
                model,
                messages: [
                    {
                        role: 'system',
                        content: [
                            `Analyze the recurring adult character "${proposal.name}" from a private fictional romance conversation.`,
                            `The original main character is "${mainPersona.name}" and the user is a separate person. Never merge either of them into ${proposal.name}.`,
                            identity ? `Confirmed public identity: ${identity.canonicalName}. ${identity.summary}` : '',
                            'Infer only patterns supported by the transcript: personality, initiative, resistance, humour, emotional rhythm, regional language, relationship position, established knowledge and recurring behaviour.',
                            'Create a vivid independent persona that can keep developing naturally and respond to user direction without becoming generic, instantly obedient or trapped replaying the sampled lines.',
                            'soul entries hold durable identity, voice, relationship anchors, values and boundaries. memory entries hold concrete events, promises, preferences and emotional moments already experienced.',
                            'Do not copy long dialogue verbatim. Write concise Traditional Chinese, while preserving Hong Kong Cantonese, Taiwan Mandarin or another established regional voice accurately when evidence supports it.',
                            'Return only one valid JSON object that matches the requested response schema.',
                        ].filter(Boolean).join('\n'),
                    },
                    {
                        role: 'user',
                        content: `Observed conversation evidence for ${proposal.name}:\n\n${evidence}`,
                    },
                ],
                responseFormat: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'observed_npc_persona',
                        strict: true,
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['description', 'persona_prompt', 'greeting', 'soul', 'memories'],
                            properties: {
                                description: { type: 'string' },
                                persona_prompt: { type: 'string' },
                                greeting: { type: 'string' },
                                soul: {
                                    type: 'array', minItems: 2, maxItems: 6,
                                    items: {
                                        type: 'object', additionalProperties: false,
                                        required: ['kind', 'title', 'summary'],
                                        properties: {
                                            kind: { type: 'string', enum: ['core', 'relationship', 'vulnerability', 'promise', 'preference', 'boundary'] },
                                            title: { type: 'string' }, summary: { type: 'string' },
                                        },
                                    },
                                },
                                memories: {
                                    type: 'array', minItems: 1, maxItems: 8,
                                    items: {
                                        type: 'object', additionalProperties: false,
                                        required: ['kind', 'title', 'summary'],
                                        properties: {
                                            kind: { type: 'string', enum: ['relationship', 'vulnerability', 'promise', 'preference', 'event', 'boundary'] },
                                            title: { type: 'string' }, summary: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                temperature: 0.25,
                topP: 0.85,
                repetitionPenalty: 1.04,
            }, 20_000);
            const parsed = parseObservedNpcPersonaDraft(result.text, fallback);
            if (parsed) return parsed;
        } catch (error) {
            console.warn('[aigf4 observed NPC analysis retry]', {
                name: proposal.name,
                model,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }
    console.warn('[aigf4 observed NPC analysis fallback]', { name: proposal.name });
    return fallback;
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

const clearChatSearchMatches = () => {
    chatSearchMatches.forEach(element => element.classList.remove('chat-search-match', 'is-current'));
    chatSearchMatches = [];
    chatSearchMatchIndex = -1;
    chatSearchCount.textContent = '0 / 0';
    chatSearchPrev.disabled = true;
    chatSearchNext.disabled = true;
};

const focusChatSearchMatch = (index: number) => {
    if (chatSearchMatches.length === 0) return;
    chatSearchMatches.forEach(element => element.classList.remove('is-current'));
    chatSearchMatchIndex = (index + chatSearchMatches.length) % chatSearchMatches.length;
    const current = chatSearchMatches[chatSearchMatchIndex];
    current.classList.add('is-current');
    chatSearchCount.textContent = `${chatSearchMatchIndex + 1} / ${chatSearchMatches.length}`;
    current.scrollIntoView({ block: 'center', behavior: 'smooth' });
};

const runChatSearch = () => {
    clearChatSearchMatches();
    const query = chatSearchInput.value.trim().toLocaleLowerCase();
    if (!query) return;
    chatSearchMatches = Array.from(chatContainer.children)
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .filter(element => element.textContent?.toLocaleLowerCase().includes(query));
    chatSearchMatches.forEach(element => element.classList.add('chat-search-match'));
    const hasMatches = chatSearchMatches.length > 0;
    chatSearchPrev.disabled = !hasMatches;
    chatSearchNext.disabled = !hasMatches;
    if (hasMatches) focusChatSearchMatch(chatSearchMatches.length - 1);
};

const openChatSearch = () => {
    chatSearchBar.classList.remove('hidden');
    chatSearchInput.focus();
    chatSearchInput.select();
    runChatSearch();
};

const closeChatSearch = () => {
    clearChatSearchMatches();
    chatSearchInput.value = '';
    chatSearchBar.classList.add('hidden');
};

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

const createSurpriseEventCard = (proposal: SurpriseEventProposal) => {
    const card = document.createElement('section');
    card.className = `system-action-card surprise-event-card surprise-event-${proposal.status}`;
    card.dataset.surpriseEventId = proposal.id;

    const eyebrow = document.createElement('div');
    eyebrow.className = 'surprise-event-eyebrow';
    const deckLabel = document.createElement('span');
    deckLabel.textContent = 'SURPRISE EVENT';
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
                : proposal.status === 'failed' ? '未能展開' : '待選擇';
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
        ...getSurpriseEventParticipantNames(proposal),
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
    card.append(eyebrow, title, badges, hook, setup);

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
        start.textContent = proposal.status === 'failed' ? '再試開始' : '開始事件';
        start.addEventListener('click', () => void startSurpriseEvent(proposal.id));
        const redraw = document.createElement('button');
        redraw.type = 'button';
        redraw.textContent = '換一張';
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
        progress.innerHTML = '<span aria-hidden="true"></span>角色正在把事件帶進目前情境…';
        card.appendChild(progress);
    }

    return card;
};

const appendMessage = (
    content: Content,
    sender: 'user' | 'bot' | 'system' | 'god-mode',
    messageMeta?: Pick<ChatMessage, 'speakerId' | 'createdAt' | 'id'>,
): HTMLElement => {
    const isSystemMessage = sender === 'system';
    const groupDisplaySegments = sender === 'bot' && currentRoom
        ? getGroupDisplaySegments(content, currentRoom, messageMeta?.speakerId)
        : [];
    
    let messageWrapper: HTMLElement;

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
    } else if (sender === 'bot' && currentRoom && groupDisplaySegments.length) {
        messageWrapper = document.createElement('div');
        messageWrapper.className = 'group-chat-turn';
        const storyBubble = document.createElement('div');
        storyBubble.className = 'chat-bubble bot-bubble group-story-bubble';
        groupDisplaySegments.forEach(segment => {
            const line = document.createElement('div');
            line.className = `group-story-line ${segment.type === 'narration' ? 'group-story-narration' : 'group-story-dialogue'}`;
            const speaker = document.createElement('span');
            speaker.className = `group-speaker-name${segment.type === 'narration' ? ' group-narrator-name' : ''}`;
            const text = document.createElement('span');

            if (segment.type === 'narration') {
                speaker.textContent = '[旁白]';
                text.className = 'group-story-narration-text';
                text.textContent = segment.text;
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
            text.textContent = segment.text;
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
        messageWrapper = document.createElement('div');
        messageWrapper.className = `flex items-start p-1 space-x-2 ${sender === 'user' ? 'justify-end' : ''}`;

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
            recallAction.innerHTML = '<span class="message-action-icon">↶</span><span><strong>收回訊息</strong><small>同時刪除這回合回覆</small></span>';
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
        setTimeout(() => {
            loadingIndicator.classList.remove('opacity-0', 'translate-y-2');
            chatContainer.scrollTop = chatContainer.scrollHeight;
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
    authSubmitLabel.textContent = isSubmitting ? '驗證中...' : '進入 Wetapp';
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
        void supabaseCloudSyncManager.start();
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
        void supabaseCloudSyncManager.start();
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
    sendButton.disabled = !isUnlocked
        || requestInProgress
        || (messageInput.value.trim() === '' && pendingChatAttachments.length === 0);
    sendButton.setAttribute('aria-busy', requestInProgress ? 'true' : 'false');
    const hideCamera = messageInput.value.trim().length > 0
        || isAssistantPersonaKey(currentPersonaKey)
        || isGodModeActive;
    composerCameraButton.classList.toggle('is-hidden-for-text', hideCamera);
    composerCameraButton.setAttribute('aria-hidden', hideCamera ? 'true' : 'false');
    composerCameraButton.tabIndex = hideCamera ? -1 : 0;
};

const removeGift = () => {
    attachedGift = null;
    giftPreviewContainer.classList.add('hidden');
    giftPreviewImage.src = '';
};

const getAttachmentKind = (mimeType: string): ChatAttachment['kind'] => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (/pdf|text|json|xml|csv|word|excel|sheet|presentation|markdown|javascript|typescript|yaml|sql/iu.test(mimeType)) {
        return 'document';
    }
    return 'other';
};

const prepareChatAttachment = async (sourceFile: File) => {
    let file = sourceFile;
    let width: number | undefined;
    let height: number | undefined;
    if (sourceFile.type.startsWith('image/')) {
        const sourceUrl = URL.createObjectURL(sourceFile);
        const image = new Image();
        image.src = sourceUrl;
        try {
            await image.decode();
            const scale = Math.min(1, MAX_CHAT_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
            width = Math.max(1, Math.round(image.naturalWidth * scale));
            height = Math.max(1, Math.round(image.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('瀏覽器無法處理這張附件圖片。');
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(image, 0, 0, width, height);
            let blob = await canvasToBlob(canvas, 0.86);
            if (blob.size > 1_500_000) blob = await canvasToBlob(canvas, 0.68);
            const name = sourceFile.name.replace(/\.[^.]+$/u, '') || 'image';
            file = new File([blob], `${name}.webp`, { type: blob.type, lastModified: Date.now() });
        } finally {
            URL.revokeObjectURL(sourceUrl);
        }
    }
    const currentBytes = pendingChatAttachments.reduce((sum, item) => sum + item.file.size, 0);
    if (currentBytes + file.size > MAX_CHAT_ATTACHMENT_TOTAL_BYTES) {
        throw new Error('本次要交給 AI 分析的附件合計不可超過 2.5MB。圖片已先自動壓縮。');
    }
    const id = crypto.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const attachment: ChatAttachment = {
        id,
        assetId: id,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        kind: getAttachmentKind(file.type || ''),
        width,
        height,
    };
    return {
        attachment,
        file,
        previewUrl: attachment.kind === 'image' ? URL.createObjectURL(file) : undefined,
    };
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
            icon.textContent = item.attachment.kind === 'video' ? '▶' : 'DOC';
            chip.appendChild(icon);
        }
        const copy = document.createElement('span');
        copy.textContent = `${item.attachment.name} · ${Math.max(1, Math.round(item.attachment.size / 1024))} KB`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.setAttribute('aria-label', `移除 ${item.attachment.name}`);
        remove.textContent = '×';
        remove.addEventListener('click', () => {
            if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            pendingChatAttachments = pendingChatAttachments.filter(candidate => candidate.attachment.id !== item.attachment.id);
            renderPendingChatAttachments();
            updateSendButtonState();
        });
        chip.append(copy, remove);
        chatAttachmentPreview.appendChild(chip);
    });
};

const handleChatAttachmentSelection = async () => {
    const files = Array.from(chatAttachmentInput.files || []);
    chatAttachmentInput.value = '';
    for (const file of files) {
        try {
            pendingChatAttachments.push(await prepareChatAttachment(file));
        } catch (error) {
            alert(error instanceof Error ? error.message : `無法加入 ${file.name}。`);
        }
    }
    renderPendingChatAttachments();
    updateSendButtonState();
};

const persistPendingChatAttachments = async (conversationKey: string) => {
    const snapshot = [...pendingChatAttachments];
    const contentParts: VeniceMessageContentPart[] = [];
    for (const item of snapshot) {
        await saveChatAttachment({
            id: item.attachment.assetId,
            conversationKey,
            blob: item.file,
            name: item.attachment.name,
            mimeType: item.attachment.mimeType,
            createdAt: Date.now(),
        });
        if (item.attachment.kind === 'image') {
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
    renderPendingChatAttachments();
    return { attachments: snapshot.map(item => item.attachment), contentParts };
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

    const soulMemory = formatPersonaMemoryPrompt(currentPersona, 'soul');
    const episodicMemory = formatPersonaMemoryPrompt(currentPersona, 'memory');
    if (soulMemory) sections.push(`soul.md：\n${soulMemory}`);
    if (episodicMemory) sections.push(`memory.md：\n${episodicMemory}`);

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
    const persona = personaOverride || memoryManager.getPersona(conversationKey);
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
    const sourceHistory = completedHistory.slice(activeSceneStart);
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
                : message.content.text?.trim();
        const isContaminated = !rawText
            || (message.role !== 'system' && (/\[PERSONA_UPDATE:/i.test(rawText) || /^THINK\b/i.test(rawText)))
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

const formatPersonaMemoryPrompt = (persona: Persona, type: 'soul' | 'memory') => {
    const entries = type === 'soul' ? persona.soul || [] : persona.memories || [];
    const legacy = type === 'soul' && persona.memory?.trim()
        ? [`- 舊版永久記憶：${persona.memory.trim()}`]
        : [];
    const structured = entries
        .slice(type === 'soul' ? -12 : -18)
        .map(entry => `- ${entry.title}: ${entry.summary.replace(/\s+/gu, ' ').trim().slice(0, type === 'soul' ? 480 : 420)}`);
    return [...legacy, ...structured].join('\n');
};

const buildChatSystemPrompt = (personaKey: string, persona: Persona) => {
    const behaviorGuidance = buildPersonaBehaviorGuidance(personaKey, persona);
    const publicIdentity = persona.publicIdentityEnabled ? persona.publicIdentity : undefined;
    const soulMemory = formatPersonaMemoryPrompt(persona, 'soul');
    const episodicMemory = formatPersonaMemoryPrompt(persona, 'memory');
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
        soulMemory ? `soul.md permanent identity, relationship and user anchors:\n${soulMemory}` : '',
        episodicMemory ? `memory.md recent important events and continuity:\n${episodicMemory}` : '',
        formatRelationshipStatePrompt(persona),
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
            '- Give the character her own immediate wants and initiative. When natural, let her make a concrete choice, suggest a plan, reveal a small intention, or begin the next action instead of always waiting for an order or ending with a question.',
            '- Pace romance and dramatic tension in steps. Preserve gains in closeness, let charged moments breathe, and transition naturally after an intense beat instead of abruptly resetting or endlessly escalating.',
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
    const soulMemory = formatPersonaMemoryPrompt(persona, 'soul');
    const episodicMemory = formatPersonaMemoryPrompt(persona, 'memory');
    const sections = [
        'You are editing the CURRENT active character persona for a romance chat app.',
        `Current character name: ${persona.name}`,
        `Current full persona prompt:\n${persona.prompt}`,
        soulMemory ? `Current soul.md:\n${soulMemory}` : '',
        episodicMemory ? `Current memory.md:\n${episodicMemory}` : '',
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
    timeoutMs = CHAT_MODEL_ATTEMPT_TIMEOUT_MS,
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
    }, timeoutMs);

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
    规: '規', 划: '劃', 静: '靜', 里: '裡', 梦: '夢', 视: '視', 传: '傳',
    递: '遞', 触: '觸', 览: '覽', 录: '錄', 乐: '樂', 舞: '舞', 台: '台',
    历: '歷', 际: '際', 场: '場', 华: '華', 后: '後', 复: '復', 众: '眾',
    组: '組', 织: '織', 别: '別', 顾: '顧', 议: '議', 决: '決', 随: '隨',
    机: '機', 紧: '緊', 统: '統', 调: '調', 达: '達', 险: '險',
    惊: '驚', 秘: '祕', 故: '故', 计: '計', 临: '臨',
    满: '滿', 带: '帶', 诚: '誠', 语: '語', 词: '詞', 丽: '麗', 艺: '藝',
    单: '單', 啧: '嘖', 几: '幾', 粘: '黏', 没: '沒', 扰: '擾', 显: '顯',
    颤: '顫', 习: '習', 顿: '頓', 绝: '絕', 刚: '剛', 无: '無',
};

const normalizeTraditionalChineseLeaks = (text: string) => {
    return text.replace(
        new RegExp(`[${Object.keys(TRADITIONAL_CHARACTER_REPLACEMENTS).join('')}]`, 'gu'),
        character => TRADITIONAL_CHARACTER_REPLACEMENTS[character] || character,
    );
};

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
    const recentAssistantReplies = getRecentAssistantRepliesForPersona(request.conversationKey, assistantMode);
    const establishedNpcNames = assistantMode
        ? []
        : collectEstablishedNpcNames(
            memoryManager.getChatHistory(request.conversationKey),
            request.persona.name,
            latestUserMessage,
        );
    const addressedNpcNames = assistantMode
        ? []
        : inferNpcSpeakersForTurn(latestUserMessage, request.persona.name, establishedNpcNames);
    const npcSpeechRequirement = buildNpcSpeechRequirement(addressedNpcNames);
    const npcContinuityRequirement = assistantMode
        ? ''
        : buildNpcContinuityRequirement(establishedNpcNames);
    const turnOwnershipRequirement = assistantMode
        ? ''
        : buildImmediateTurnOwnershipRequirement(request.persona.name, latestUserMessage);
    const systemPrompt = [
        baseSystemPrompt,
        turnOwnershipRequirement,
        npcContinuityRequirement,
        npcSpeechRequirement,
    ]
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
                            npcContinuityRequirement,
                            npcSpeechRequirement,
                            failedCandidate ? `Rejected attempt (do not copy):\n${failedCandidate.slice(0, 800)}` : '',
                        ].filter(Boolean).join('\n'),
                    });
                }

                messages.push(...getRecentChatMessages(
                    request.conversationKey,
                    latestUserMessage,
                    assistantMode,
                    request.persona,
                    request.room,
                ));
                messages.push({ role: 'user', content: getLatestUserVeniceContent(request, latestUserMessage) });

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
    favoriteScenePrompt?: string;
    caption: string;
    aspectRatio: CharacterPhotoProposal['aspectRatio'];
};

const extractPhotoProposalSection = (text: string, tag: string) => {
    const escapedTag = escapeRegExp(tag);
    return text.match(new RegExp(`<${escapedTag}>\\s*([\\s\\S]*?)\\s*</${escapedTag}>`, 'iu'))?.[1]?.trim() || '';
};

const parseCharacterPhotoProposalDraft = (
    text: string,
    personaKey?: string,
): CharacterPhotoProposalDraft | null => {
    const unfenced = text
        .replace(/^\s*```(?:json|text)?\s*/iu, '')
        .replace(/\s*```\s*$/iu, '')
        .trim();
    let jsonDraft: Record<string, unknown> | null = null;
    try {
        const parsed = JSON.parse(unfenced) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            jsonDraft = parsed as Record<string, unknown>;
        }
    } catch {
        // Older or fallback models may still return the legacy XML envelope.
    }
    const readJsonString = (key: string) => typeof jsonDraft?.[key] === 'string'
        ? (jsonDraft[key] as string).trim()
        : '';
    const fallbackReply = personaKey === 'cc'
        ? '好呀，我按住而家嘅情境諗好咗點影。你睇吓下面個 Prompt 啱唔啱，確認後我先影。'
        : '好，我已經按照現在的情境構思好照片了。你看看下面的 Prompt 是否正確，確認後我才拍。';
    const fallbackCaption = personaKey === 'cc' ? '影好喇，畀你。' : '拍好了，給你。';
    const reply = cleanVeniceChatReply(
        readJsonString('reply') || extractPhotoProposalSection(text, 'reply') || fallbackReply,
    );
    const scenePrompt = cleanGeneratedPhotoPrompt((readJsonString('prompt') || extractPhotoProposalSection(text, 'prompt'))
        .replace(/^```(?:text)?\s*|\s*```$/giu, '')
        .trim());
    const favoriteScenePrompt = cleanGeneratedPhotoPrompt((readJsonString('favorite_prompt') || extractPhotoProposalSection(text, 'favorite_prompt'))
        .replace(/^```(?:text)?\s*|\s*```$/giu, '')
        .trim());
    const caption = cleanVeniceChatReply(
        readJsonString('caption') || extractPhotoProposalSection(text, 'caption') || fallbackCaption,
    );
    const rawRatio = readJsonString('ratio')
        || readJsonString('aspect_ratio')
        || extractPhotoProposalSection(text, 'ratio');
    const allowedRatios: CharacterPhotoProposal['aspectRatio'][] = ['1:1', '3:4', '4:5', '16:9', '9:16'];
    const aspectRatio = allowedRatios.includes(rawRatio as CharacterPhotoProposal['aspectRatio'])
        ? rawRatio as CharacterPhotoProposal['aspectRatio']
        : '3:4';

    if (!reply || !scenePrompt || !caption || scenePrompt.length < 20) return null;
    return {
        reply,
        scenePrompt,
        favoriteScenePrompt: favoriteScenePrompt || undefined,
        caption,
        aspectRatio,
    };
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

const buildCharacterPhotoProposal = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
): Promise<{ text: string; proposal: CharacterPhotoProposal }> => {
    const favoritePrompt = normalizeFavoritePhotoPrompt(
        request.room ? request.room.favoritePhotoPrompt : request.persona.favoritePhotoPrompt,
    );
    const subjectMembers = request.room
        ? request.room.members.filter(member => request.photoSubjectMemberIds?.includes(member.id))
        : [];
    const subjectPersonas = subjectMembers.length > 0
        ? subjectMembers.map(member => member.persona)
        : [request.persona];
    const isMultiSubject = subjectPersonas.length > 1;
    const usesPublicIdentity = usesConfirmedPublicIdentity(request.persona);
    const usesAnyPublicIdentity = subjectPersonas.some(usesConfirmedPublicIdentity);
    const useAvatarReference = Boolean(
        !isMultiSubject
        &&
        !usesPublicIdentity
        && request.persona.avatarUrl
        && !request.persona.avatarUrl.startsWith('generating_'),
    );
    const publicIdentity = request.persona.publicIdentity;
    const imagePromptIdentityRules = isMultiSubject
        ? [
            `This is one group photo with exactly ${subjectPersonas.length} distinct people: ${subjectPersonas.map(persona => persona.publicIdentity?.canonicalName || persona.name).join(', ')}.`,
            'No reference image will be supplied. Begin <prompt> by listing every person by exact name. Keep each face, body, clothing, pose and action separate; do not merge, clone, omit or add people.',
            ...subjectPersonas.map(persona => {
                const identity = persona.publicIdentityEnabled ? persona.publicIdentity : undefined;
                return identity
                    ? `${persona.name}: canonical identity ${identity.canonicalName}; ${identity.visualPrompt}; ${identity.summary}`
                    : `${persona.name}: ${persona.avatarPrompt || persona.description}`;
            }),
        ]
        : usesPublicIdentity && publicIdentity
        ? [
            'No reference image will be supplied. The app will add a user-confirmed public identity block separately.',
            `Inside the prompt field, begin exactly with "${publicIdentity.canonicalName}" and thereafter refer to the subject consistently. Describe the requested scene, pose, action, expression, clothing or requested state, setting, lighting, framing, viewpoint, and relevant objects.`,
            publicIdentity.kind === 'fictional_character'
                ? 'Keep the scene compatible with the character’s canonical franchise design and original source-medium visual language; do not turn the character into a generic photorealistic person.'
                : 'Do not replace the named public figure with a generic nationality, ethnicity, age group, or lookalike description.',
        ]
        : useAvatarReference
        ? [
            'A reference portrait will be attached later and is the only source of visual identity.',
            `Inside the prompt field, begin exactly with "${request.persona.name}" and thereafter refer to the subject only as "she". Describe only the requested scene, pose, action, expression, clothing or requested state, setting, lighting, camera framing, viewpoint, and relevant objects.`,
            'Do not infer or state her age, ethnicity, nationality, facial features, skin tone, eye appearance, hair identity, or body type unless the newest user message explicitly requests that exact visible change.',
            'Never replace her identity with a generic demographic description. The app will add the identity-lock instruction separately.',
        ]
        : [
            `No reference image will be supplied. Inside the prompt field, identify ${request.persona.name} by name and use the established character appearance where useful.`,
            'Describe the subject count and identity, visible pose or action, expression, clothing or requested state, setting, lighting, camera framing, viewpoint, and relevant objects.',
        ];
    const systemPrompt = [
        buildChatSystemPrompt(request.personaKey, request.persona),
        request.room ? [
            `This request belongs to fixed room "${request.room.title}".`,
            `The character preparing the photo is ${request.persona.name} (${request.photoSenderMemberId || request.room.leadMemberId}).`,
            `The requested visible character subjects are: ${subjectPersonas.map(persona => persona.name).join(', ')}.`,
            'Do not make an absent or unselected room member visible in the image.',
        ].join('\n') : '',
        'The newest user message is a request for the character to take or send a photo.',
        'Do not generate an image and do not claim the photo has already been taken or sent. Stay fully in character and propose exactly what the character intends to photograph.',
        [
            'CURRENT-MOMENT CONTINUITY LOCK:',
            '- Reconstruct the exact current moment from the latest completed conversation: who is present, each person\'s clothing and colors, location, time, lighting, body position, held objects, ongoing action, and physical relationships.',
            '- That established visible continuity is authoritative. Never change a white shirt to black, add or remove a held object, move to another location, swap people, or contradict the current action unless the newest user photo request explicitly asks for that exact change.',
            '- Resolve pronouns against the fixed character identities. Do not confuse the user, photographer, visible subjects, or third persons.',
            '- Produce one internally coherent image instruction. Never include mutually exclusive colors, clothes, poses, actions, objects, camera views, or both a positive and negative version of the same detail.',
        ].join('\n'),
        'The proposal may be ordinary, romantic, fantasy, or explicitly adult according to the user request and established context. Preserve direct wording and intent; do not make an ordinary request sexual, and do not sanitize an explicit adult request.',
        favoritePrompt ? [
            `SAVED FAVORITE PHOTO INSTRUCTION: ${favoritePrompt}`,
            '- The prompt field must be the clean baseline based only on the newest request and current-moment continuity; do not apply the saved favorite instruction there.',
            '- The favorite_prompt field must be a second complete image prompt that integrates every compatible part of the saved favorite instruction into the same current moment.',
            '- Current visible continuity and the newest explicit request outrank the saved favorite instruction. Silently adapt or omit only the conflicting favorite detail instead of writing both alternatives.',
            '- The two prompts must each stand alone. Do not mention merging, conflicts, defaults, options, checkboxes, omitted details, or these rules inside either prompt.',
            '- Never describe a discarded alternative negatively. If all favorite details conflict, make <favorite_prompt> identical to <prompt>. The final image prompt must contain only the one positive visual truth the image model should draw.',
        ].join('\n') : '',
        ...imagePromptIdentityRules,
        'The English image prompt must describe one still image. Do not invent a new major event or a user action.',
        'Do not merely translate, quote, or paraphrase the user request. Turn it into a production-ready visual prompt by resolving the current environment, clothing, facial expression, body pose, movement, camera angle, framing, lighting, and relevant objects from the latest conversation.',
        'When a visible detail is not established and the user leaves it to the character, choose one specific detail that fits the character and current moment. Never leave placeholders such as "as requested", "appropriate clothing", "same environment", or unresolved options.',
        'Choose one definite composition yourself. Do not offer multiple unresolved clothing, pose, expression, or scene options; the visible reply and English prompt must describe the same single choice.',
        'The reply and later caption must use the character’s established Traditional Chinese regional voice. The reply must briefly describe that one chosen photo and naturally ask the user to approve it without mentioning AI, models, policy, generation, or internal prompts.',
        'Return only one JSON object with these fields: reply, prompt, favorite_prompt, caption, ratio.',
        `prompt must be a complete English still-image ${useAvatarReference ? 'edit instruction of 25 to 70 words' : 'scene prompt of 45 to 100 words'}.`,
        favoritePrompt
            ? 'favorite_prompt must be a second complete English prompt with the compatible saved favorite instruction already reconciled.'
            : 'favorite_prompt must be an empty string.',
        'ratio must be exactly one of 1:1, 3:4, 4:5, 16:9, 9:16.',
    ].join('\n\n');
    const models = buildCharacterModelRoute(chatModelSettings, request.personaKey === 'cc');
    let draft: CharacterPhotoProposalDraft | null = null;
    let lastError: Error | null = null;

    for (let modelIndex = 0; modelIndex < models.length && !draft; modelIndex += 1) {
        const model = models[modelIndex];
        applyChatRuntimeState(modelIndex === 0 ? 'generating' : 'retrying', '構思照片中...');
        try {
            const recentMessages = getRecentChatMessages(
                request.conversationKey,
                latestUserMessage,
                false,
                request.persona,
                request.room,
            ).slice(-24);
            while (recentMessages[0]?.role === 'assistant') recentMessages.shift();
            const result = await generateChatTextWithTimeout({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...recentMessages,
                    { role: 'user', content: getLatestUserVeniceContent(request, latestUserMessage) },
                ],
                temperature: 0.76,
                topP: 0.92,
                repetitionPenalty: 1.06,
                responseFormat: {
                    type: 'json_schema',
                    json_schema: {
                        name: 'character_photo_proposal',
                        strict: true,
                        schema: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['reply', 'prompt', 'favorite_prompt', 'caption', 'ratio'],
                            properties: {
                                reply: { type: 'string' },
                                prompt: { type: 'string' },
                                favorite_prompt: { type: 'string' },
                                caption: { type: 'string' },
                                ratio: { type: 'string', enum: ['1:1', '3:4', '4:5', '16:9', '9:16'] },
                            },
                        },
                    },
                },
                signal: request.controller.signal,
            });
            const candidate = parseCharacterPhotoProposalDraft(result.text, request.personaKey);
            if (!candidate) {
                throw new Error(`Invalid photo proposal from ${model}.`);
            }
            draft = candidate;
        } catch (error) {
            if (isAbortError(error)) throw error;
            lastError = error instanceof Error ? error : new Error(String(error));
            if (modelIndex === models.length - 1) {
                console.warn('Using a local photo proposal because the model proposal was unavailable.', lastError);
                const subjectNames = subjectPersonas
                    .map(persona => persona.publicIdentity?.canonicalName || persona.name)
                    .join(', ');
                const currentScene = request.room
                    ? [
                        request.room.scene.location ? `Current location: ${request.room.scene.location}.` : '',
                        request.room.scene.summary ? `Current moment: ${request.room.scene.summary}.` : '',
                    ].filter(Boolean).join(' ')
                    : '';
                draft = {
                    reply: request.personaKey === 'cc'
                        ? '好呀，我照你講嘅內容構思咗張相。你睇吓下面個 Prompt 啱唔啱，確認後我先影。'
                        : '好，我已經按照現在的情境構思好照片了。你看看下面的 Prompt 是否正確，確認後我才拍。',
                    scenePrompt: [
                        `One coherent still image featuring exactly: ${subjectNames}.`,
                        currentScene,
                        `Follow this exact user request: ${latestUserMessage}`,
                        'Preserve the established current location, clothing, visible objects, actions, and relationships unless the user explicitly asks to change them.',
                    ].filter(Boolean).join(' '),
                    caption: request.personaKey === 'cc' ? '影好喇，畀你。' : '拍好了，給你。',
                    aspectRatio: '3:4',
                };
            }
        }
    }

    if (!draft) throw lastError || new Error('角色未能整理照片草稿。');
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

const buildEmergencyCharacterPhotoProposal = (
    request: ActiveChatRequest,
    latestUserMessage: string,
): { text: string; proposal: CharacterPhotoProposal } => {
    const subjectMembers = request.room
        ? request.room.members.filter(member => request.photoSubjectMemberIds?.includes(member.id))
        : [];
    const subjectPersonas = subjectMembers.length > 0
        ? subjectMembers.map(member => member.persona)
        : [request.persona];
    const isMultiSubject = subjectPersonas.length > 1;
    const usesAnyPublicIdentity = subjectPersonas.some(usesConfirmedPublicIdentity);
    const useAvatarReference = Boolean(
        !isMultiSubject
        && !usesConfirmedPublicIdentity(request.persona)
        && request.persona.avatarUrl
        && !request.persona.avatarUrl.startsWith('generating_'),
    );
    const currentScene = request.room
        ? [
            request.room.scene.location ? `Current location: ${request.room.scene.location}.` : '',
            request.room.scene.summary ? `Current moment: ${request.room.scene.summary}.` : '',
        ].filter(Boolean).join(' ')
        : '';
    const scenePrompt = trimPhotoPromptSection([
        currentScene,
        `Follow this exact user request: ${latestUserMessage}`,
        'Keep the image internally coherent and preserve established current-moment continuity unless the request explicitly changes it.',
    ].filter(Boolean).join(' '), 760);
    const basePrompt = isMultiSubject
        ? trimPhotoPromptSection([
            `Create one coherent still image with exactly ${subjectPersonas.length} distinct people:`,
            ...subjectPersonas.map(persona => {
                const identity = persona.publicIdentityEnabled ? persona.publicIdentity : undefined;
                return identity
                    ? `${identity.canonicalName} (${identity.visualPrompt})`
                    : `${persona.name} (${persona.avatarPrompt || persona.description})`;
            }),
            scenePrompt,
            'Keep every named identity, face, body, clothing, pose, and action separate. No extra or omitted people, merged faces, captions, logos, or watermarks.',
        ].join(' '), CHARACTER_PHOTO_PROMPT_MAX_LENGTH)
        : buildCharacterPhotoPrompt(request.persona, scenePrompt, useAvatarReference);

    return {
        text: request.personaKey === 'cc'
            ? '好呀，我照你講嘅內容整好咗個照片 Prompt。你睇吓啱唔啱，確認後我先影。'
            : '好，我已經按照現在的情境整理好照片 Prompt。你看看是否正確，確認後我才拍。',
        proposal: {
            id: crypto.randomUUID?.() || `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            prompt: basePrompt,
            basePrompt,
            scenePrompt,
            caption: request.personaKey === 'cc' ? '影好喇，畀你。' : '拍好了，給你。',
            aspectRatio: '3:4',
            status: 'pending',
            createdAt: Date.now(),
            useAvatarReference,
            identityMode: usesAnyPublicIdentity
                ? 'public_identity'
                : useAvatarReference ? 'avatar_reference' : 'persona_description',
            senderMemberId: request.photoSenderMemberId,
            subjectMemberIds: request.photoSubjectMemberIds,
        },
    };
};

const runRoomConversationGeneration = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    models: string[],
): Promise<GroupGenerationResult> => {
    if (!request.room) throw new Error('Room snapshot is unavailable.');

    let lastError: Error | null = null;
    let rejectedReply = '';
    const recentReplies = getRecentAssistantRepliesForPersona(request.conversationKey, false, 8);
    const fallbackMemberId = getGroupFallbackMemberId(request, latestUserMessage);

    for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
        const model = models[modelIndex];
        const attempts = modelIndex === 0 ? 2 : 1;

        for (let attempt = 0; attempt < attempts; attempt += 1) {
            const isRetry = modelIndex > 0 || attempt > 0;
            applyChatRuntimeState(isRetry ? 'retrying' : 'generating', isRetry ? '重新思考中...' : '思考中...');
            try {
                const messages: VeniceMessage[] = [
                    { role: 'system', content: buildGroupSystemPrompt(request.room) },
                ];
                if (isRetry) {
                    messages.push({
                        role: 'system',
                        content: [
                            'The previous attempt was invalid, repetitive, confused a speaker, or failed to answer the newest message.',
                            'Rebuild the fixed identity ledger and answer the newest turn from scratch with a genuinely new reaction and scene beat.',
                            rejectedReply ? `Rejected output; do not copy it:\n${rejectedReply.slice(0, 900)}` : '',
                        ].filter(Boolean).join('\n'),
                    });
                }
                messages.push(...getRecentChatMessages(
                    request.conversationKey,
                    latestUserMessage,
                    false,
                    request.persona,
                    request.room,
                ));
                messages.push({ role: 'user', content: getLatestUserVeniceContent(request, latestUserMessage) });

                const result = await generateChatTextWithTimeout({
                    model,
                    messages,
                    temperature: 0.78,
                    topP: 0.92,
                    repetitionPenalty: 1.1,
                    stop: [],
                    signal: request.controller.signal,
                });
                const parsed = normalizeGroupGenerationTraditional(
                    parseGroupGeneration(result.text, request.room, fallbackMemberId),
                );
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
                if (isAbortError(error)) throw error;
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

const STRICT_REVIEW_HISTORY_MESSAGE_LIMIT = 28;
const STRICT_REVIEW_HISTORY_CHAR_BUDGET = 28000;

const STRICT_REVIEW_EDITOR_PROMPT = [
    'You are the strict final quality gate for a continuous private character conversation.',
    'Audit the candidate against the authoritative character files, recent completed history, current scene and newest user message.',
    'Check every item: it answers the newest request; identities and first-person ownership are correct; named people remain separate; location, clothing, body position, reality layer and completed actions do not contradict continuity; no old instruction or completed beat is replayed; personality and regional language remain vivid; relevant third parties may speak; the user is never puppeted; the ending is complete rather than cut off.',
    'For group output, narration must stay external third-person and cannot use 我 / 我們 / 我哋 / I / me / my for a character or user. First person belongs only inside a labelled character dialogue line.',
    'KEEP a strong response. Do not rewrite merely to impose your own prose style. REVISE only when there is at least one concrete defect.',
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
) => {
    const reviewerModels = buildStrictReviewModelRoute(chatModelSettings, request.personaKey === 'cc');
    for (let index = 0; index < reviewerModels.length; index += 1) {
        const model = reviewerModels[index];
        applyChatRuntimeState('retrying', index === 0 ? '檢查回覆中...' : '重新檢查中...');
        try {
            const result = await generateChatTextWithTimeout({
                model,
                messages: [
                    { role: 'system', content: STRICT_REVIEW_EDITOR_PROMPT },
                    { role: 'system', content: `AUTHORITATIVE CHARACTER AND CONTINUITY RULES:\n${authoritativePrompt}` },
                    ...getStrictReviewHistory(request, latestUserMessage),
                    {
                        role: 'user',
                        content: [
                            `NEWEST USER MESSAGE:\n${latestUserMessage}`,
                            `CANDIDATE RESPONSE TO AUDIT:\n${candidateResponse}`,
                            'Return the strict review JSON now.',
                        ].join('\n\n'),
                    },
                ],
                temperature: 0.18,
                topP: 0.82,
                repetitionPenalty: 1.02,
                stop: [],
                responseFormat: STRICT_REVIEW_RESPONSE_FORMAT,
                signal: request.controller.signal,
            });
            const decision = parseStrictReviewDecision(result.text);
            if (!decision) throw new Error(`Invalid strict review from ${model}.`);
            console.info('[aigf4 strict review]', {
                requestId: request.id,
                model: result.model,
                decision: decision.decision,
                issues: decision.issues,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
            });
            return decision;
        } catch (error) {
            if (isAbortError(error) && request.controller.signal.aborted) throw error;
            console.warn('[aigf4 strict review unavailable]', {
                requestId: request.id,
                model,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return null;
};

const strictReviewSingleReply = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    candidate: string,
) => {
    const history = memoryManager.getChatHistory(request.conversationKey);
    const establishedNpcNames = collectEstablishedNpcNames(
        history,
        request.persona.name,
        latestUserMessage,
    );
    const addressedNpcNames = inferNpcSpeakersForTurn(
        latestUserMessage,
        request.persona.name,
        establishedNpcNames,
    );
    const authoritativePrompt = [
        buildChatSystemPrompt(request.personaKey, request.persona),
        buildImmediateTurnOwnershipRequirement(request.persona.name, latestUserMessage),
        buildNpcContinuityRequirement(establishedNpcNames),
        buildNpcSpeechRequirement(addressedNpcNames),
    ].filter(Boolean).join('\n\n');
    const decision = await requestStrictReviewDecision(
        request,
        latestUserMessage,
        authoritativePrompt,
        candidate,
    );
    if (!decision || decision.decision === 'keep') return candidate;

    let revision = cleanVeniceChatReply(decision.revisedResponse);
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
        console.warn('[aigf4 strict revision rejected]', { requestId: request.id, issues: decision.issues });
        return candidate;
    }
    return revision;
};

const serializeGroupGenerationForReview = (result: GroupGenerationResult) => {
    const chat = result.segments.map(segment => segment.type === 'narration'
        ? `（${segment.text}）`
        : `${segment.speakerName || segment.speakerId}：「${segment.text}」`).join('\n');
    const scene = JSON.stringify({
        location: result.scene.location,
        reality_layer: result.scene.realityLayer,
        present_member_ids: result.scene.presentMemberIds,
        summary: result.scene.summary,
        unresolved: result.scene.unresolved,
    });
    return [
        `<chat>${chat}</chat>`,
        `<scene>${scene}</scene>`,
        `<npc_candidate>${JSON.stringify(result.npcCandidate || null)}</npc_candidate>`,
    ].join('');
};

const strictReviewGroupReply = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
    candidate: GroupGenerationResult,
) => {
    if (!request.room) return candidate;
    const serializedCandidate = serializeGroupGenerationForReview(candidate);
    const decision = await requestStrictReviewDecision(
        request,
        latestUserMessage,
        [
            buildGroupSystemPrompt(request.room),
            'STRICT REVISION FORMAT: revised_response must contain one complete <chat>...</chat><scene>...</scene><npc_candidate>...</npc_candidate> envelope.',
        ].join('\n\n'),
        serializedCandidate,
    );
    if (!decision || decision.decision === 'keep') return candidate;
    if (!/<chat>[\s\S]*<\/chat>/iu.test(decision.revisedResponse)
        || !/<scene>[\s\S]*<\/scene>/iu.test(decision.revisedResponse)
        || !/<npc_candidate>[\s\S]*<\/npc_candidate>/iu.test(decision.revisedResponse)) {
        return candidate;
    }
    try {
        const revision = normalizeGroupGenerationTraditional(
            parseGroupGeneration(
                decision.revisedResponse,
                request.room,
                getGroupFallbackMemberId(request, latestUserMessage),
            ),
        );
        if (groupNarrationUsesFirstPerson(revision)) return candidate;
        const namedMember = getDirectlyNamedRoomMember(request, latestUserMessage);
        if (namedMember && !revision.segments.some(segment => (
            segment.type === 'dialogue' && segment.speakerId === namedMember.id
        ))) return candidate;
        const recentReplies = getRecentAssistantRepliesForPersona(request.conversationKey, false, 8);
        if (recentReplies.some(previous => repliesAreTooSimilar(previous, revision.text))
            && !userExplicitlyRequestsContinuation(latestUserMessage)) return candidate;
        return {
            ...revision,
            npcCandidate: revision.npcCandidate || candidate.npcCandidate,
        };
    } catch (error) {
        console.warn('[aigf4 strict group revision rejected]', {
            requestId: request.id,
            reason: error instanceof Error ? error.message : String(error),
        });
        return candidate;
    }
};

const runCharacterChatGeneration = async (
    request: ActiveChatRequest,
    latestUserMessage: string,
): Promise<string | GroupGenerationResult> => {
    const models = buildCharacterModelRoute(chatModelSettings, request.personaKey === 'cc');
    if (request.room) {
        const candidate = await runRoomConversationGeneration(request, latestUserMessage, models);
        return strictReviewGroupReply(request, latestUserMessage, candidate);
    }
    const candidate = await runConversationGeneration(request, latestUserMessage, models, false);
    return strictReviewSingleReply(request, latestUserMessage, candidate);
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
        if (currentConversationKey === request.conversationKey) {
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
    characterPhotoRequestController = new AbortController();
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
        const model = imageModels[mode].find(item => item.id === proposal.modelId)
            || getPreferredCharacterPhotoModel(mode);
        if (!model) throw new Error('目前沒有可用的 Venice 圖片模型。');
        const generationSeed = mode === 'generate'
            ? proposal.seed ?? resolveImageSeedForRequest(imageSeed, imageSeedLock.checked)
            : undefined;

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
            seed: generationSeed,
            adultConfirmed: true,
            signal: characterPhotoRequestController.signal,
        });
        const blob = result.blobs[0];
        if (!blob) throw new Error('Venice 沒有傳回照片。');

        const assetId = `character-photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        await saveCharacterPhotoAsset({
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
        const message = isAbortError(error)
            ? '照片生成已停止，可以按「重試生成」再試。'
            : error instanceof Error ? error.message : '這次照片生成失敗。';
        updatePhotoProposal(conversationKey, proposalId, { status: 'failed', error: message });
        if (currentConversationKey === conversationKey) {
            refreshPhotoProposalCard(proposalId);
            if (message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
        }
    } finally {
        activeCharacterPhotoProposalId = null;
        characterPhotoRequestController = null;
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

const buildSurpriseEventMemberContext = (request: ActiveChatRequest, selectedMemberIds: string[]) => {
    const compactEventText = (value: string | undefined, limit: number) => (
        value?.replace(/\s+/gu, ' ').trim().slice(0, limit) || ''
    );
    if (!request.room) {
        const identity = request.persona.publicIdentityEnabled ? request.persona.publicIdentity : undefined;
        return [
            `MEMBER ID: ${request.personaKey}`,
            `Name: ${request.persona.name}`,
            `Identity / occupation: ${compactEventText(request.persona.description, 600)}`,
            identity ? `Confirmed public identity: ${identity.canonicalName}. ${compactEventText(identity.summary, 700)}` : '',
            `Personality and voice: ${compactEventText(request.persona.prompt, 2200)}`,
            formatRelationshipStatePrompt(request.persona),
        ].filter(Boolean).join('\n');
    }

    const selected = new Set(selectedMemberIds);
    return request.room.members.filter(member => selected.has(member.id)).map(member => {
        const identity = member.persona.publicIdentityEnabled ? member.persona.publicIdentity : undefined;
        return [
            `MEMBER ID: ${member.id}`,
            `Name: ${member.persona.name}`,
            'Participation: SELECTED FOR THIS EVENT',
            `Identity / occupation: ${compactEventText(member.persona.description, 500)}`,
            identity ? `Confirmed public identity: ${identity.canonicalName}. ${compactEventText(identity.summary, 650)}` : '',
            `Personality and voice: ${compactEventText(member.persona.prompt, 1800)}`,
            formatRelationshipStatePrompt(member.persona),
        ].filter(Boolean).join('\n');
    }).join('\n\n---\n\n');
};

const generateSurpriseEvent = async (
    request: ActiveChatRequest,
    options: SurpriseEventDrawOptions,
): Promise<SurpriseEventProposal> => {
    const history = memoryManager.getChatHistory(request.conversationKey);
    const recentEvents = collectRecentSurpriseEvents(history, 8);
    const availableMemberIds = request.room
        ? request.room.scene.presentMemberIds
        : [request.personaKey];
    const availableMemberIdSet = new Set(availableMemberIds);
    const validMemberIds = Array.from(new Set(options.participantIds))
        .filter(id => availableMemberIdSet.has(id));
    if (validMemberIds.length === 0) throw new Error('No selected surprise-event participant is still present.');
    const fallbackMemberId = request.room
        ? validMemberIds.includes(request.roomMemberId || '')
            ? request.roomMemberId!
            : validMemberIds[0]
        : request.personaKey;
    const recentEventLedger = recentEvents.length > 0
        ? recentEvents.map(event => `- ${event.category} | ${event.title} | ${event.hook}`).join('\n')
        : '- none';
    const identityLedger = buildSurpriseEventMemberContext(request, validMemberIds);
    const idolLike = /歌手|偶像|藝人|演員|舞台|音樂|團體|idol|singer|actress|performer|k-pop/iu.test(identityLedger);
    const categoryPool = (idolLike
        ? ['backstage', 'idol_schedule', 'public_spotlight', 'secret_escape', 'unexpected_guest', 'celebration', 'travel', 'emotional_turn', 'rivalry', 'mystery']
        : ['secret_escape', 'unexpected_guest', 'celebration', 'travel', 'domestic', 'emotional_turn', 'rivalry', 'mystery', 'fantasy']) as SurpriseEventProposal['category'][];
    const recentlyUsedCategories = new Set(recentEvents.slice(-6).map(event => event.category));
    const freshCategoryPool = categoryPool.filter(category => !recentlyUsedCategories.has(category));
    const selectableCategories = freshCategoryPool.length > 0 ? freshCategoryPool : categoryPool;
    const targetCategory = selectableCategories[Math.floor(Math.random() * selectableCategories.length)];
    const nsfwDirection = NSFW_SURPRISE_EVENT_DIRECTIONS[
        Math.floor(Math.random() * NSFW_SURPRISE_EVENT_DIRECTIONS.length)
    ];
    const contentModeRules = options.contentMode === 'nsfw'
        ? [
            'CONTENT MODE: EXPLICIT ADULT 18+ / NSFW.',
            'Create an unmistakably sexual adult event, not merely romance, flirting, kissing, cuddling or vague "intimacy".',
            `MANDATORY RANDOM NSFW DIRECTION: ${nsfwDirection.prompt}. Turn this direction into one specific, coherent premise that fits the live context and selected characters.`,
            'State the exact adult situation, location or opportunity, each selected character’s distinct initiative, and the unresolved first sexual beat. Do not jump to completion.',
            'Treat every selected participant and the user as an adult in this fictional conversation. Keep the event consensual and leave the user free to accept, refuse or redirect it.',
            'Do not censor, euphemize or silently downgrade the card into a non-sexual event.',
        ]
        : [
            'CONTENT MODE: NON-SEXUAL / NOT NSFW.',
            'The event may be romantic, funny, dramatic, mysterious or emotionally charged, but it must contain no nudity, sexual act, erotic role-play, sexual toy or explicit sexual proposition.',
            'Do not drift into an adult sexual event even if the recent conversation contains sexual material.',
        ];
    const sceneContext = request.room
        ? `Location: ${request.room.scene.location}\nReality layer: ${request.room.scene.realityLayer}\nPresent member IDs: ${request.room.scene.presentMemberIds.join(', ')}\nCurrent summary: ${request.room.scene.summary}\nUnresolved: ${request.room.scene.unresolved.join('; ') || 'none'}`
        : 'Infer the live location, reality layer, participants and unfinished beat from the recent completed conversation. Do not contradict it.';
    const eventSystemPrompt = [
        'You design one fresh surprise-event card for a continuous private romance conversation.',
        'The card is a playable opening, not a complete short story: create an immediate hook, concrete situation and unresolved tension that can develop naturally over several chat turns.',
        'The active characters must remain recognizable and retain their established voice, nationality, occupation, public identity, memories and current relationship progress.',
        'For a singer, idol, actor or other public performer, strongly prefer identity-specific inspiration when fresh: backstage timing, rehearsal, recording, award events, travel schedules, members or staff, public-versus-private tension, secret rest time, or a performance-related surprise. Keep all private developments explicitly inside this fictional conversation and never present invented claims as real news.',
        'Vary scale and mood. Events may be tender, funny, awkward, dramatic, mysterious, romantically charged or adult according to established context, but must not sanitize the current relationship or force an intensity unsupported by it.',
        'A surprise must contain one specific catalyst that changes the current moment: an interruption, deadline, discovery, secret, mistake, invitation, public/private conflict, unexpected person, or emotionally risky choice.',
        'Reject routine waking up, ordinary meals, generic dates, generic rain, merely discussing an existing plan, or “they spend time together” unless a genuinely new concrete twist transforms it.',
        'Never puppet the user, decide the user agrees, resolve the central tension, skip directly to the ending, reset the current relationship, or replay a completed scene.',
        'Only use IDs from the valid present-member list. An event may include a clearly attributed staff member, friend, fan, manager or other NPC when useful, but do not silently turn an NPC into a fixed room member.',
        'The opening_instruction is hidden from the user. It must tell the chat model exactly how to begin the event in character while preserving current location, clothing, positions and reality layer unless the event itself naturally initiates a transition.',
        'Write title, hook and setup in natural Traditional Chinese. Return only the requested JSON.',
        ...contentModeRules,
        `SELECTED PARTICIPANT IDS: ${validMemberIds.join(', ')}`,
        'The involved_member_ids array must contain every selected participant ID exactly once and no other fixed member. Every selected character must have a meaningful role in the event.',
        'Unselected fixed room members must not speak, act, or become part of this event card.',
        `MANDATORY FRESH CATEGORY: ${targetCategory}. The returned category must equal this exactly.`,
        `MANDATORY CATEGORY PROOF: ${SURPRISE_EVENT_CATEGORY_GUIDES[targetCategory]} If the setup does not visibly contain this proof, discard it and invent another event.`,
        `CURRENT SCENE:\n${sceneContext}`,
        `FIXED CHARACTER FILES:\n${identityLedger}`,
        `RECENT EVENT CARDS THAT MUST NOT BE REPEATED OR MERELY RENAMED:\n${recentEventLedger}`,
    ].join('\n\n');

    const models = Array.from(new Set([
        chatModelSettings.qualityFallback,
        chatModelSettings.emergencyFallback,
        chatModelSettings.primary,
    ].filter(Boolean)));
    for (let index = 0; index < models.length; index += 1) {
        const model = models[index];
        applyChatRuntimeState(index === 0 ? 'generating' : 'retrying', index === 0 ? '正在抽取驚喜事件...' : '正在換一種靈感...');
        try {
            const result = await generateChatTextWithTimeout({
                model,
                messages: [
                    { role: 'system', content: eventSystemPrompt },
                    ...collectRecentMessagesWithinBudget(getRecentChatMessages(
                        request.conversationKey,
                        undefined,
                        false,
                        request.persona,
                        request.room,
                    ), 14000, 14),
                    {
                        role: 'user',
                        content: `Create exactly one ${options.contentMode === 'nsfw' ? 'explicit 18+ / NSFW' : 'non-sexual'} event card now for all selected participants. Do not continue the conversation itself.`,
                    },
                ],
                temperature: 0.96,
                topP: 0.97,
                repetitionPenalty: 1.12,
                responseFormat: SURPRISE_EVENT_RESPONSE_FORMAT,
                signal: request.controller.signal,
            }, SURPRISE_EVENT_ATTEMPT_TIMEOUT_MS);
            const draft = parseSurpriseEventProposal(result.text, validMemberIds, fallbackMemberId);
            const draftParticipantIds = new Set(draft?.involvedMemberIds || []);
            const hasExactParticipants = draftParticipantIds.size === validMemberIds.length
                && validMemberIds.every(id => draftParticipantIds.has(id));
            if (
                !draft
                || !hasExactParticipants
                || draft.category !== targetCategory
                || !surpriseEventMatchesCategory(draft)
                || !surpriseEventMatchesContentMode(draft, options.contentMode)
                || recentEvents.some(previous => surpriseEventsAreTooSimilar(previous, draft))
            ) {
                throw new Error(`Repeated or invalid surprise event from ${model}.`);
            }
            draft.title = normalizeTraditionalChineseLeaks(draft.title);
            draft.hook = normalizeTraditionalChineseLeaks(draft.hook);
            draft.setup = normalizeTraditionalChineseLeaks(draft.setup);
            draft.openingInstruction = normalizeTraditionalChineseLeaks(draft.openingInstruction);
            return {
                ...draft,
                contentMode: options.contentMode,
                id: crypto.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                status: 'pending',
                createdAt: Date.now(),
            };
        } catch (error) {
            if (isAbortError(error)) throw error;
            console.warn('[aigf4 surprise event attempt rejected]', {
                requestId: request.id,
                model,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const fallback = createFallbackSurpriseEvent(
        request.persona,
        fallbackMemberId,
        recentEvents.map(event => event.category),
        targetCategory,
        validMemberIds,
    );
    const participantNames = request.room
        ? validMemberIds
            .map(id => request.room?.members.find(member => member.id === id)?.persona.name)
            .filter((name): name is string => Boolean(name))
        : [request.persona.name];
    const participantLabel = participantNames.join('、');
    const modeAwareFallback = options.contentMode === 'nsfw'
        ? {
            ...fallback,
            title: `成人限定：${fallback.title}`,
            hook: nsfwDirection.fallbackPremise,
            setup: `${fallback.setup} 這次由 ${participantLabel} 共同把它變成明確的 18+／NSFW 成人事件；每位參與者都有不同的主動角色，而第一個性行動仍等待你的選擇。`,
            openingInstruction: `${fallback.openingInstruction} 必須按以下成人方向具體展開：${nsfwDirection.fallbackPremise} 保持明確的 18+／NSFW 性情境，不要降級成普通曖昧，也不要替使用者同意或完成整個事件。`,
            intensity: 'heated' as const,
            involvedMemberIds: validMemberIds,
            relationshipEffect: {
                ...fallback.relationshipEffect,
                romanticTension: Math.max(5, fallback.relationshipEffect.romanticTension),
                initiative: Math.max(3, fallback.relationshipEffect.initiative),
            },
        }
        : {
            ...fallback,
            involvedMemberIds: validMemberIds,
            openingInstruction: `${fallback.openingInstruction} 本事件必須保持非 18+，不要加入裸體、性行為、情趣用品或露骨性邀請。`,
        };
    return {
        ...modeAwareFallback,
        contentMode: options.contentMode,
        id: crypto.randomUUID?.() || `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'pending',
        createdAt: Date.now(),
    };
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
        const proposal = await generateSurpriseEvent(request, options);
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
            let result: { text: string; proposal: CharacterPhotoProposal };
            try {
                result = await buildCharacterPhotoProposal(request, triggeringMessage);
            } catch (error) {
                if (isAbortError(error)) throw error;
                console.warn('Photo proposal generation failed; showing an editable local proposal.', error);
                result = buildEmergencyCharacterPhotoProposal(request, triggeringMessage);
            }
            if (!isActiveChatRequest(request)) return;
            const botContent: Content = { text: result.text, photoProposal: result.proposal };
            memoryManager.addMessage(request.conversationKey, 'model', botContent, {
                speakerId: request.photoSenderMemberId,
            });
            if (currentConversationKey === request.conversationKey) appendMessage(botContent, 'bot', {
                speakerId: request.photoSenderMemberId,
            });
            finishChatRequest(request);
            return;
        }

        const generated = request.mode === 'assistant'
            ? await runAssistantChatGeneration(request, triggeringMessage, assistantModel || VENICE_ASSISTANT_MODEL)
            : await runCharacterChatGeneration(request, triggeringMessage);
        if (!isActiveChatRequest(request)) return;

        const botContent: Content = typeof generated === 'string'
            ? { text: generated }
            : { text: generated.text, segments: generated.segments };
        if (typeof generated !== 'string' && request.room) {
            try {
                roomManager.updateRoom(request.room.id, room => {
                    room.scene = generated.scene;
                });
            } catch (error) {
                // A nearly full mobile storage quota must not swallow a valid live reply.
                console.warn('Unable to persist the latest room scene.', error);
            }
            request.room.scene = generated.scene;
            if (currentRoom?.id === request.room.id) {
                const storedRoom = roomManager.getRoom(request.room.id);
                currentRoom = storedRoom || { ...currentRoom, scene: generated.scene };
                currentRoom.scene = generated.scene;
            }
        }
        memoryManager.addMessage(request.conversationKey, 'model', botContent);
        if (currentConversationKey === request.conversationKey) {
            appendMessage(botContent, 'bot');
        }
        if (request.mode === 'character') {
            try {
                updateRelationshipPulseAfterTurn(request, triggeringMessage, generated);
                rememberStartedSurpriseEvent(request);
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
                if (currentConversationKey === request.conversationKey) appendMessage(proposalContent, 'system');
            }
        }
        if (typeof generated === 'string' && !request.room && request.mode === 'character') {
            const proposals = createObservedNpcPromotionProposals(
                request.conversationKey,
                request.persona,
            );
            proposals.forEach(proposal => {
                const proposalContent: Content = { npcProposal: proposal };
                memoryManager.addMessage(request.conversationKey, 'system', proposalContent);
                if (currentConversationKey === request.conversationKey) appendMessage(proposalContent, 'system');
            });
        }
        renderPersonaList();
        finishChatRequest(request);
        if (request.room) void maybeSummarizeRoomMemory(request.room.id);
        else if (request.mode === 'character') void maybeSummarizePersonaMemory(request.personaKey);
    } catch (error) {
        if (isAbortError(error)) {
            if (request.surpriseEvent) {
                updateSurpriseEventProposal(request.conversationKey, request.surpriseEvent.id, {
                    status: 'pending',
                    error: undefined,
                });
            }
            finishChatRequest(request);
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
    }
};

async function generateValidatedAutoMemory<T>(
    messages: VeniceMessage[],
    responseFormat: NonNullable<Parameters<typeof generateVeniceText>[0]['responseFormat']>,
    parse: (text: string) => T | null,
): Promise<T> {
    const models = Array.from(new Set([
        chatModelSettings.qualityFallback,
        chatModelSettings.emergencyFallback,
        chatModelSettings.primary,
        DEFAULT_CHAT_MODEL_SETTINGS.qualityFallback,
        DEFAULT_CHAT_MODEL_SETTINGS.emergencyFallback,
        DEFAULT_CHAT_MODEL_SETTINGS.primary,
    ].filter(Boolean)));
    let lastError: Error | null = null;
    for (const model of models) {
        try {
            const result = await generateChatTextWithTimeout({
                model,
                messages,
                maxCompletionTokens: 900,
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

const maybeSummarizeRoomMemory = async (
    roomId: string,
    force = false,
): Promise<MemorySummaryRunResult> => {
    const room = roomManager.getRoom(roomId);
    if (!room) return { status: 'skipped', reason: 'not-found' };
    if (roomSummaryInFlight.has(roomId)) return { status: 'skipped', reason: 'busy' };
    const history = memoryManager.peekChatHistory(roomId);
    const userMessageCount = history.filter(message => message.role === 'user').length;
    if (userMessageCount === 0) return { status: 'skipped', reason: 'no-history' };
    const lastSummarized = Number(room.lastSummarizedUserMessageCount || 0);
    const needsRecovery = Number(room.memorySummaryVersion || 0) < AUTO_MEMORY_SUMMARY_VERSION
        && userMessageCount >= AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES;
    if (!force && !needsRecovery && userMessageCount - lastSummarized < ROOM_MEMORY_SUMMARY_TURN_INTERVAL) {
        return { status: 'skipped', reason: 'threshold' };
    }
    if (!force && !needsRecovery && userMessageCount <= lastSummarized) {
        return { status: 'skipped', reason: 'threshold' };
    }
    roomSummaryInFlight.add(roomId);
    try {
        const transcript = history
            .filter(message => message.role === 'user' || message.role === 'model')
            .slice(-AUTO_MEMORY_RECENT_MESSAGE_LIMIT)
            .map(message => message.role === 'user'
                ? `[USER] ${message.content.text || ''}`
                : contentToGroupHistoryText(message.content, room))
            .filter(Boolean)
            .join('\n\n');
        const memberLedger = room.members.map(member => `${member.id}=${member.persona.name}`).join(', ');
        const existing = room.sharedMemories
            .slice(-36)
            .map(entry => `- ${entry.title}: ${entry.summary}`)
            .join('\n');
        const participantAliases = new Map<string, string>();
        room.members.forEach(member => {
            [member.id, member.persona.name, member.persona.publicIdentity?.canonicalName]
                .filter((value): value is string => Boolean(value?.trim()))
                .forEach(value => participantAliases.set(value.trim().toLocaleLowerCase(), member.id));
        });
        const memories = await generateValidatedAutoMemory(
            [
                {
                    role: 'system',
                    content: [
                        'Extract durable memory from a private fictional group conversation.',
                        `Valid member ledger: ${memberLedger}.`,
                        'Keep only events, promises, boundaries, preferences, relationship changes and user vulnerability that will improve future continuity.',
                        'Do not copy graphic wording or transient physical choreography. Preserve emotional meaning, trust and boundaries accurately.',
                        'Only include members who were present or directly involved. Return 1 to 6 concise memories in Traditional Chinese.',
                        existing ? `Already stored memory.md entries; do not repeat or paraphrase them:\n${existing}` : '',
                    ].filter(Boolean).join('\n'),
                },
                { role: 'user', content: transcript },
            ],
            {
                type: 'json_schema',
                json_schema: {
                    name: 'room_memory_update',
                    strict: true,
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['memories'],
                        properties: {
                            memories: {
                                type: 'array',
                                maxItems: 6,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['kind', 'title', 'summary', 'participants'],
                                    properties: {
                                        kind: { type: 'string', enum: ['relationship', 'vulnerability', 'promise', 'preference', 'event', 'boundary'] },
                                        title: { type: 'string' },
                                        summary: { type: 'string' },
                                        participants: { type: 'array', minItems: 1, items: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            text => parseRoomAutoMemoryResponse(text, participantAliases),
        );
        const added = roomManager.applyEpisodicMemorySummary(
            roomId,
            memories,
            userMessageCount,
            AUTO_MEMORY_SUMMARY_VERSION,
        );
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
        if (!roomMemoryModal.classList.contains('hidden') && currentRoom?.id === roomId) {
            renderRoomMemory();
        }
    }
};

const maybeSummarizePersonaMemory = async (
    personaKey: string,
    force = false,
): Promise<MemorySummaryRunResult> => {
    const persona = memoryManager.getPersona(personaKey);
    if (!persona || isAssistantPersonaKey(personaKey)) return { status: 'skipped', reason: 'not-found' };
    if (personaSummaryInFlight.has(personaKey)) return { status: 'skipped', reason: 'busy' };
    const history = memoryManager.peekChatHistory(personaKey);
    const userMessageCount = history.filter(message => message.role === 'user').length;
    if (userMessageCount === 0) return { status: 'skipped', reason: 'no-history' };
    const lastSummarized = Number(persona.lastMemorySummaryUserMessageCount || 0);
    const needsRecovery = Number(persona.memorySummaryVersion || 0) < AUTO_MEMORY_SUMMARY_VERSION
        && userMessageCount >= AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES;
    if (!force && !needsRecovery && userMessageCount - lastSummarized < ROOM_MEMORY_SUMMARY_TURN_INTERVAL) {
        return { status: 'skipped', reason: 'threshold' };
    }
    if (!force && !needsRecovery && userMessageCount <= lastSummarized) {
        return { status: 'skipped', reason: 'threshold' };
    }
    personaSummaryInFlight.add(personaKey);
    try {
        const transcript = history
            .filter(message => message.role === 'user' || message.role === 'model')
            .slice(-AUTO_MEMORY_RECENT_MESSAGE_LIMIT)
            .map(message => `${message.role === 'user' ? '[USER]' : `[${persona.name}]`} ${message.content.text || ''}`)
            .filter(Boolean)
            .join('\n\n');
        const existing = (persona.memories || [])
            .slice(-24)
            .map(entry => `- ${entry.title}: ${entry.summary}`)
            .join('\n');
        const memories = await generateValidatedAutoMemory(
            [
                {
                    role: 'system',
                    content: [
                        `Extract durable episodic memory for ${persona.name} from a continuous private romance conversation.`,
                        'Keep only events, promises, boundaries, preferences, relationship changes and user vulnerability that will improve future continuity.',
                        'Do not copy transient choreography or summarize routine small talk. Preserve emotional meaning, trust and boundaries accurately.',
                        'Return 1 to 6 concise, non-duplicate memories in Traditional Chinese.',
                        existing ? `Already stored memory.md entries; do not repeat or paraphrase them:\n${existing}` : '',
                    ].filter(Boolean).join('\n'),
                },
                { role: 'user', content: transcript },
            ],
            {
                type: 'json_schema',
                json_schema: {
                    name: 'persona_memory_update',
                    strict: true,
                    schema: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['memories'],
                        properties: {
                            memories: {
                                type: 'array',
                                maxItems: 6,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['kind', 'title', 'summary'],
                                    properties: {
                                        kind: { type: 'string', enum: ['relationship', 'vulnerability', 'promise', 'preference', 'event', 'boundary'] },
                                        title: { type: 'string' },
                                        summary: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
            parsePersonaAutoMemoryResponse,
        );
        const added = memoryManager.applyPersonaMemorySummary(
            personaKey,
            memories,
            userMessageCount,
            AUTO_MEMORY_SUMMARY_VERSION,
        );
        return { status: 'success', added };
    } catch (error) {
        console.warn('Background persona memory summary skipped:', error);
        return {
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown memory update error.',
        };
    } finally {
        personaSummaryInFlight.delete(personaKey);
        if (!roomMemoryModal.classList.contains('hidden') && !currentRoom && currentPersonaKey === personaKey) {
            renderRoomMemory();
        }
    }
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

const isPermanentMemoryRequest = (text: string) => {
    return /(?:永遠|一世|一直|以後都).{0,10}(?:記住|唔好忘記|不要忘記)|(?:記住|唔好忘記|不要忘記).{0,10}(?:永遠|一世|forever)|remember\s+(?:this|that|it).{0,8}forever|never\s+forget\s+(?:this|that|it)/iu.test(text);
};

const buildPermanentMemorySummary = (conversationKey: string, text: string) => {
    const stripped = text
        .replace(/(?:請|麻煩|我要|我想|希望)?(?:你|你們|大家)?(?:永遠|一世|一直|以後都)?(?:記住|唔好忘記|不要忘記)(?:這件事|呢件事|這個|呢個|this|that|it)?/giu, '')
        .replace(/remember\s+(?:this|that|it).{0,8}forever|never\s+forget\s+(?:this|that|it)/giu, '')
        .replace(/[：:，,。.!！?？\s]+$/gu, '')
        .trim();
    if (stripped.length >= 8) return stripped;
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

    const typedMessage = (messageText ?? messageInput.value).trim();
    if (!typedMessage && pendingChatAttachments.length === 0) return;
    const userMessage = typedMessage || '請查看附件。';

    hideSuggestionContainer();

    const userMessageUpper = userMessage.toUpperCase();
    const assistantMode = isAssistantPersonaKey(currentPersonaKey);

    if (!assistantMode && pendingChatAttachments.length === 0 && userMessageUpper === GOD_MODE_ENTER_COMMAND && !isGodModeActive) {
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

    if (!assistantMode && pendingChatAttachments.length === 0 && userMessageUpper === GOD_MODE_EXIT_COMMAND && isGodModeActive) {
        isGodModeActive = false;
        messageInput.value = '';
        resetMessageInput();
        updateSendButtonState();
        hideError();
        applyChatRuntimeState('idle');
        appendMessage({ text: '[系統] 已離開 God Mode。' }, 'system');
        return;
    }

    if (isGodModeActive && pendingChatAttachments.length > 0) {
        alert('God Mode 只修改人格；請先離開 God Mode 再傳附件。');
        return;
    }

    const personaKey = currentPersonaKey;
    const conversationKey = currentConversationKey;
    let attachmentBundle: { attachments: ChatAttachment[]; contentParts: VeniceMessageContentPart[] } = {
        attachments: [],
        contentParts: [],
    };
    try {
        if (pendingChatAttachments.length > 0) {
            attachmentBundle = await persistPendingChatAttachments(conversationKey);
        }
    } catch (error) {
        showError(error instanceof Error ? error.message : '附件儲存失敗。');
        return;
    }
    const userContent: Content = {
        text: userMessage,
        attachments: attachmentBundle.attachments.length > 0 ? attachmentBundle.attachments : undefined,
        roomSceneBeforeTurn: currentRoom ? cloneRoomSnapshot(currentRoom.scene) : undefined,
    };
    const userMessageMeta = isGodModeActive ? undefined : {
        id: crypto.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
    };

    messageInput.value = '';
    resetMessageInput();
    updateSendButtonState();
    appendMessage(userContent, 'user', userMessageMeta);

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

    const persona = currentPersona as Persona;
    memoryManager.addMessage(conversationKey, 'user', userContent, userMessageMeta);
    if (
        !assistantMode
        && !characterPhotoRequest
        && attachmentBundle.attachments.length === 0
        && isPermanentMemoryRequest(userMessage)
    ) {
        const proposal = {
            id: crypto.randomUUID?.() || `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            targetMemberIds: currentRoom ? [...currentRoom.scene.presentMemberIds] : [],
            originalText: userMessage,
            summary: buildPermanentMemorySummary(conversationKey, userMessage),
            status: 'pending' as const,
            createdAt: Date.now(),
        };
        const systemContent: Content = { memoryProposal: proposal };
        memoryManager.addMessage(conversationKey, 'system', systemContent);
        appendMessage(systemContent, 'system');
        renderPersonaList();
        return;
    }
    if (
        !assistantMode
        && !characterPhotoRequest
        && attachmentBundle.attachments.length === 0
        && isExplicitCharacterPhotoRequest(userMessage)
    ) {
        const systemContent: Content = { photoIntent: createPhotoIntentProposal(userMessage) };
        memoryManager.addMessage(conversationKey, 'system', systemContent);
        appendMessage(systemContent, 'system');
        renderPersonaList();
        return;
    }
    if (
        !assistantMode
        && !characterPhotoRequest
        && attachmentBundle.attachments.length === 0
    ) {
        const npcPromotion = createExplicitNpcPromotionProposal(conversationKey, persona, userMessage);
        if (npcPromotion) {
            const systemContent: Content = { npcProposal: npcPromotion };
            memoryManager.addMessage(conversationKey, 'system', systemContent);
            appendMessage(systemContent, 'system');
            renderPersonaList();
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
    await getResponse(request, userMessage, assistantMode ? selectedAssistantModel : undefined);
};

const dispatchSendMessage = (options: Parameters<typeof sendMessage>[0] = {}) => {
    void sendMessage(options).catch(error => {
        console.error('Unexpected send failure:', error);
        if (activeChatRequest) cancelActiveChatRequest();
        const diagnosed = diagnoseChatFailure(error, Boolean(currentRoom));
        const diagnostic = diagnosed.code.endsWith('_UNKNOWN')
            ? { ...diagnosed, code: currentRoom ? 'GROUP_PREPARE' : 'CHAT_PREPARE' }
            : diagnosed;
        const message = formatChatFailureMessage(diagnostic);
        applyChatRuntimeState('error');
        updateSendButtonState();
        showError(message);
        if (currentConversationKey) appendMessage({ text: `[系統] ${message}` }, 'system');
    });
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
    if (!currentConversationKey) return;
    const history = memoryManager.getChatHistory(currentConversationKey);
    albumPhotos = history
        .map((msg, index) => ({ ...msg, historyIndex: index })) // Add original index
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
}

async function mergeStoredPhotosIntoAlbum(conversationKey: string) {
    const persona = memoryManager.getPersona(conversationKey);
    const isCcConversation = persona?.name.trim().toLocaleLowerCase() === 'cc';
    const storedAssets = isCcConversation
        ? (await listCharacterPhotoAssets()).filter(asset => (
            asset.personaKey === conversationKey
            || asset.personaKey === 'cc'
            || asset.personaKey === 'custom_seed_cc'
        ))
        : await listCharacterPhotoAssets(conversationKey);
    if (currentConversationKey !== conversationKey) return;

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
}

function renderAlbum() {
    if (!currentPersona) return;
    albumModalTitle.textContent = `${currentRoom?.title || currentPersona.name} 的媒體`;
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
                if (imageUrl) {
                    openPhotoViewer(
                        imageUrl,
                        buildPhotoViewerContextFromContent(photo.content, 'album', currentConversationKey),
                    );
                }
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

    if (albumAttachments.length > 0) {
        const attachmentSection = document.createElement('section');
        attachmentSection.className = 'album-attachment-section';
        const heading = document.createElement('h3');
        heading.textContent = `文件與附件 (${albumAttachments.length})`;
        attachmentSection.appendChild(heading);
        albumAttachments.forEach(attachment => {
            attachmentSection.appendChild(createStoredChatAttachmentCard(attachment));
        });
        albumGridContainer.appendChild(attachmentSection);
    }
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
        albumDownloadBtn.textContent = '匯出所選 ZIP';
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
    if (selectedPhotoIndices.size === 0 || !currentConversationKey) return;
    
    // Get the history indices of the photos to be deleted
    const historyIndicesToDelete = new Set<number>(
        Array.from(selectedPhotoIndices)
            .map(photoIndex => albumPhotos[photoIndex].historyIndex)
            .filter((historyIndex): historyIndex is number => historyIndex !== null)
    );
    const assetIdsToDelete = Array.from(selectedPhotoIndices)
        .map(photoIndex => albumPhotos[photoIndex].imageAssetId)
        .filter((assetId): assetId is string => Boolean(assetId));

    // Filter the chat history, keeping only messages whose index is NOT in the deletion set
    if (historyIndicesToDelete.size > 0) {
        const currentHistory = memoryManager.getChatHistory(currentConversationKey);
        const newHistory = currentHistory.filter((_, index) => !historyIndicesToDelete.has(index));
        memoryManager.setChatHistory(currentConversationKey, newHistory);
    }
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
    startChat(currentConversationKey);
    
    showMainAlbumButtons();
}



async function openAlbumModal() {
    updateAlbumState();
    albumModal.classList.remove('hidden');
    renderAlbum();
    if (!currentConversationKey) return;
    const conversationKey = currentConversationKey;
    try {
        await mergeStoredPhotosIntoAlbum(conversationKey);
        if (currentConversationKey === conversationKey && !albumModal.classList.contains('hidden')) renderAlbum();
    } catch (error) {
        console.warn('Unable to scan the local character photo vault:', error);
    }
}
function closeAlbumModal() {
    albumModal.classList.add('hidden');
}

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

function openAvatarFullscreen(imageUrl: string, personaName: string) {
    photoFullscreenImage.src = imageUrl;
    photoFullscreenImage.alt = `${personaName} 的完整頭像`;
    photoFullscreenModal.classList.remove('hidden');
    resetPhotoFullscreenTransform();
    window.setTimeout(() => closePhotoFullscreen.focus(), 0);
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
        : `${persona?.name || currentPersona?.name || '角色'} 的照片`;
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
            const studioResult: ImageStudioResult = {
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
            imageResults = [studioResult, ...imageResults];
            renderImageResults();
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
            if (currentPersonaKey === context.personaKey) {
                appendMessage(photoContent, 'bot');
                updateAlbumState();
                if (!albumModal.classList.contains('hidden')) renderAlbum();
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

function hideSuggestionContainer() {
    suggestionContainer.innerHTML = '';
    suggestionContainer.classList.add('hidden');
}

async function getSuggestions() {
    showDisabledFeatureNotice('建議功能');
}

interface ParticipantTransferCandidate {
    id: string;
    persona: Persona;
    sourcePersonaKey?: string;
    sourceLabel: string;
    originRoomId?: string;
    originMemberId?: string;
    targetRoomId?: string;
    replaceMemberId?: string;
    privateUserTurnCount?: number;
}

const participantIdentityFingerprint = (persona: Persona) => (
    persona.publicIdentity?.canonicalName || persona.name
).replace(/\s+/gu, ' ').trim().toLocaleLowerCase();

const participantContinuityFingerprint = (persona: Persona) => JSON.stringify({
    name: persona.name,
    description: persona.description,
    prompt: persona.prompt,
    soul: (persona.soul || []).map(entry => `${entry.kind}:${entry.summary}`),
    memories: (persona.memories || []).map(entry => `${entry.kind}:${entry.summary}`),
});

const roomMemberMatchesCandidate = (member: RoomMember, candidate: ParticipantTransferCandidate) => {
    if (candidate.sourcePersonaKey && (
        member.sourcePersonaKey === candidate.sourcePersonaKey
        || member.privatePersonaKey === candidate.sourcePersonaKey
    )) return true;
    return participantIdentityFingerprint(member.persona) === participantIdentityFingerprint(candidate.persona);
};

const collectParticipantTransferCandidates = () => {
    const candidates = new Map<string, ParticipantTransferCandidate>();
    const excludedKeys = new Set<string>();
    const excludedIdentities = new Set<string>();

    if (currentRoom) {
        currentRoom.members.forEach(member => {
            if (member.sourcePersonaKey) excludedKeys.add(member.sourcePersonaKey);
            if (member.privatePersonaKey) excludedKeys.add(member.privatePersonaKey);
            excludedIdentities.add(participantIdentityFingerprint(member.persona));
        });
    } else if (currentPersona && currentPersonaKey) {
        excludedKeys.add(currentPersonaKey);
        excludedIdentities.add(participantIdentityFingerprint(currentPersona));
        roomManager.getRooms().filter(room => !room.timelineBranch).forEach(room => {
            const linkedMember = room.members.find(member => member.privatePersonaKey === currentPersonaKey);
            if (!linkedMember) return;
            const privateUserTurnCount = memoryManager.peekChatHistory(currentPersonaKey!)
                .filter(message => message.role === 'user').length;
            if (privateUserTurnCount <= Number(linkedMember.privateContinuityImportedUserMessageCount || 0)) return;
            const candidateId = `return:${room.id}:${linkedMember.id}:${currentPersonaKey}`;
            candidates.set(candidateId, {
                id: candidateId,
                persona: cloneRoomSnapshot(currentPersona!),
                sourcePersonaKey: currentPersonaKey!,
                sourceLabel: `帶著目前私訊記憶回到「${room.title}」並取代舊版本`,
                targetRoomId: room.id,
                replaceMemberId: linkedMember.id,
                privateUserTurnCount,
            });
        });
    }

    Object.entries(memoryManager.getAllPersonas()).forEach(([key, persona]) => {
        const identity = participantIdentityFingerprint(persona);
        const replaceableMember = currentRoom?.members.find(member => (
            member.privatePersonaKey === key
            && participantIdentityFingerprint(member.persona) === identity
        ));
        const privateUserTurnCount = replaceableMember
            ? memoryManager.peekChatHistory(key).filter(message => message.role === 'user').length
            : 0;
        const importedUserTurnCount = Number(
            replaceableMember?.privateContinuityImportedUserMessageCount || 0,
        );
        if (
            replaceableMember
            && privateUserTurnCount > importedUserTurnCount
            && key !== VENICE_ASSISTANT_PERSONA_KEY
            && persona.gender === 'female'
            && !persona.timelineBranch
        ) {
            const candidateId = `replace:${currentRoom!.id}:${replaceableMember.id}:${key}`;
            candidates.set(candidateId, {
                id: candidateId,
                persona: cloneRoomSnapshot(persona),
                sourcePersonaKey: key,
                sourceLabel: `私訊版本 · ${privateUserTurnCount} 個對話回合 · 將取代群組舊版本`,
                replaceMemberId: replaceableMember.id,
                privateUserTurnCount,
            });
            return;
        }
        if (
            key === VENICE_ASSISTANT_PERSONA_KEY
            || persona.gender !== 'female'
            || Boolean(persona.timelineBranch)
            || excludedKeys.has(key)
            || excludedIdentities.has(identity)
        ) return;
        const candidateId = `persona:${key}`;
        candidates.set(candidateId, {
            id: candidateId,
            persona: cloneRoomSnapshot(persona),
            sourcePersonaKey: key,
            sourceLabel: memoryManager.peekChatHistory(key).length > 0 ? '來自私人聊天' : '現有角色',
            privateUserTurnCount: memoryManager.peekChatHistory(key)
                .filter(message => message.role === 'user').length,
        });
    });

    roomManager.getRooms().filter(room => !room.timelineBranch).forEach(room => {
        room.members.forEach(member => {
            const sourcePersonaKey = member.privatePersonaKey || member.sourcePersonaKey;
            const sourcePersona = sourcePersonaKey ? memoryManager.getPersona(sourcePersonaKey) : undefined;
            const persona = roomMemberToPersona(member, sourcePersona);
            const identity = participantIdentityFingerprint(persona);
            const candidateId = `room:${room.id}:${member.id}`;
            const matchesUnchangedSource = sourcePersonaKey
                && candidates.has(`persona:${sourcePersonaKey}`)
                && sourcePersona
                && participantContinuityFingerprint(persona) === participantContinuityFingerprint(sourcePersona);
            if (
                persona.gender !== 'female'
                || excludedIdentities.has(identity)
                || (sourcePersonaKey && excludedKeys.has(sourcePersonaKey))
                || matchesUnchangedSource
            ) return;
            candidates.set(candidateId, {
                id: candidateId,
                persona,
                sourcePersonaKey,
                sourceLabel: `來自群組「${room.title}」`,
                originRoomId: room.id,
                originMemberId: member.id,
            });
        });
    });

    return [...candidates.values()].sort((left, right) => (
        left.persona.name.localeCompare(right.persona.name, 'zh-Hant')
        || left.sourceLabel.localeCompare(right.sourceLabel, 'zh-Hant')
    ));
};

const createTransferredRoomMember = (
    candidate: ParticipantTransferCandidate,
    fixedMemberId?: string,
): RoomMember => {
    const joinedAt = Date.now();
    const memberId = fixedMemberId || `member_${joinedAt}_${Math.random().toString(36).slice(2, 8)}`;
    const persona = cloneRoomSnapshot(candidate.persona);
    const toRoomMemory = (entry: PersonaMemoryEntry, pinned: boolean): RoomMemoryEntry => ({
        ...cloneRoomSnapshot(entry),
        participants: [memberId],
        pinned,
        roleplayOnly: true,
    });
    return {
        id: memberId,
        sourcePersonaKey: candidate.sourcePersonaKey,
        privatePersonaKey: candidate.sourcePersonaKey,
        privateContinuityImportedUserMessageCount: candidate.privateUserTurnCount,
        persona,
        joinedAt,
        soul: (persona.soul || []).map(entry => toRoomMemory(entry, true)),
        memories: (persona.memories || []).map(entry => toRoomMemory(entry, false)),
    };
};

const appendContextBridge = (conversationKey: string, bridge: ChatContextBridge) => {
    memoryManager.addMessage(conversationKey, 'system', {
        text: contextBridgeDisplayText(bridge),
        contextBridge: bridge,
    });
};

const saveBridgeAsPersonaMemory = (personaKey: string, bridge: ChatContextBridge) => {
    memoryManager.addPersonaMemory(personaKey, 'memory', {
        kind: 'event',
        title: `從 ${bridge.sourceTitle} 承接的情境`,
        summary: bridge.summary,
    });
};

const resolveRoomMemberPrivatePersonaKey = async (room: ChatRoom, member: RoomMember) => {
    const protectedIuArchive = room.id === IU_GROUP_ROOM_ID
        && member.id === 'iu'
        && member.sourcePersonaKey === room.legacySourcePersonaKey;
    const existingKey = member.privatePersonaKey
        || (!protectedIuArchive ? member.sourcePersonaKey : undefined);
    if (existingKey && memoryManager.getPersona(existingKey)) {
        if (member.privatePersonaKey !== existingKey) {
            const existingUserTurns = memoryManager.peekChatHistory(existingKey)
                .filter(message => message.role === 'user').length;
            roomManager.updateMember(room.id, member.id, {
                privatePersonaKey: existingKey,
                privateContinuityImportedUserMessageCount: existingUserTurns,
            });
        }
        return existingKey;
    }

    const sourcePersona = member.sourcePersonaKey
        ? memoryManager.getPersona(member.sourcePersonaKey)
        : undefined;
    const personaKey = await memoryManager.saveCustomPersonaCopy(roomMemberToPersona(member, sourcePersona));
    roomManager.updateMember(room.id, member.id, {
        privatePersonaKey: personaKey,
        privateContinuityImportedUserMessageCount: 0,
    });
    return personaKey;
};

const openPrivateChatForRoomMember = async (roomId: string, memberId: string) => {
    if (activeChatRequest) {
        alert('請先等待目前回覆完成，再切換到私訊。');
        return;
    }
    const room = roomManager.getRoom(roomId);
    const member = room?.members.find(item => item.id === memberId);
    if (!room || !member) throw new Error('找不到這位群組成員。');

    const personaKey = await resolveRoomMemberPrivatePersonaKey(room, member);
    const bridge = buildContextBridge({
        kind: 'group_to_private',
        sourceConversationKey: room.id,
        sourceTitle: room.title,
        history: memoryManager.getChatHistory(room.id),
        room,
        targetMemberName: member.persona.name,
    });
    const transferredPersona = roomMemberToPersona(member, memoryManager.getPersona(personaKey));
    (transferredPersona.soul || []).forEach(entry => {
        memoryManager.addPersonaMemory(personaKey, 'soul', {
            kind: entry.kind,
            title: entry.title,
            summary: entry.summary,
            originalText: entry.originalText,
            sourceMessageIds: entry.sourceMessageIds,
            sourceMessageIndexes: entry.sourceMessageIndexes,
        });
    });
    (transferredPersona.memories || []).forEach(entry => {
        memoryManager.addPersonaMemory(personaKey, 'memory', {
            kind: entry.kind,
            title: entry.title,
            summary: entry.summary,
            originalText: entry.originalText,
            sourceMessageIds: entry.sourceMessageIds,
            sourceMessageIndexes: entry.sourceMessageIndexes,
        });
    });
    saveBridgeAsPersonaMemory(personaKey, bridge);
    if (!memoryManager.hasChatHistory(personaKey)) memoryManager.setChatHistory(personaKey, []);
    appendContextBridge(personaKey, bridge);

    participantActionModal.classList.add('hidden');
    roomInfoModal.classList.add('hidden');
    renderPersonaList();
    startChat(personaKey);
};

const replaceRoomMemberWithPrivateCandidate = async (
    room: ChatRoom,
    candidate: ParticipantTransferCandidate,
) => {
    if (!candidate.replaceMemberId || !candidate.sourcePersonaKey) return;
    const oldMember = room.members.find(member => member.id === candidate.replaceMemberId);
    if (!oldMember) throw new Error('群組中的舊角色版本已不存在。');
    const wasPresent = room.scene.presentMemberIds.includes(oldMember.id);
    if (!wasPresent && room.scene.presentMemberIds.length >= ROOM_PRESENT_MEMBER_LIMIT) {
        alert(`目前已有 ${ROOM_PRESENT_MEMBER_LIMIT} 位角色在場，請先請一位角色離場。`);
        return;
    }
    if (!confirm(
        `以私訊中的 ${candidate.persona.name} 取代群組內的舊版本？\n\n`
        + '私訊聊天會完整保留；群組舊訊息也不會刪除，但往後會使用私訊版的人格、soul.md 與 memory.md。',
    )) return;

    const privatePersonaKey = candidate.sourcePersonaKey;
    const memoryUpdate = await maybeSummarizePersonaMemory(privatePersonaKey, true);
    const privatePersona = memoryManager.getPersona(privatePersonaKey);
    if (!privatePersona) throw new Error('找不到要帶回群組的私訊角色。');
    const privateHistory = memoryManager.peekChatHistory(privatePersonaKey);
    const replacement = createTransferredRoomMember({
        ...candidate,
        persona: cloneRoomSnapshot(privatePersona),
    }, oldMember.id);
    const bridge = buildContextBridge({
        kind: 'member_returned',
        sourceConversationKey: privatePersonaKey,
        sourceTitle: `${privatePersona.name} 的私訊`,
        history: privateHistory,
        targetMemberName: privatePersona.name,
        summaryOverride: [
            `${privatePersona.name} 的獨立私訊版本已取代群組中的舊版本並回到聊天室。`,
            '她保留私訊中建立的關係、承諾、經歷與情感發展；群組其他成員只會從現在開始接觸這個版本。',
            memoryUpdate.status === 'error'
                ? '自動記憶整理暫時失敗，因此先以現有 memory.md 與近期私訊內容承接。'
                : '',
        ].filter(Boolean).join(' '),
    });
    replacement.privateContinuityHandoff = cloneRoomSnapshot(bridge);

    roomManager.replaceMember(room.id, oldMember.id, replacement);
    if (!wasPresent) {
        roomManager.setPresentMembers(room.id, [...room.scene.presentMemberIds, oldMember.id]);
    }
    roomManager.addSoulMemory(room.id, [oldMember.id], {
        kind: 'core',
        title: '私訊分支回歸界線',
        summary: [
            `${privatePersona.name} 是從獨立私訊回歸的版本。`,
            '她保留建立私訊時承接的群組背景，以及其後在私訊中親自經歷的事情。',
            '她不會自動繼承舊群組版本在兩條對話分開後新增的個人經歷；其他成員可在回歸後把需要知道的事情告訴她。',
        ].join(''),
        participants: [oldMember.id],
        roleplayOnly: true,
    });
    roomManager.updateRoom(room.id, editableRoom => {
        editableRoom.scene.summary = (
            `${editableRoom.scene.summary} 群組中的舊 ${oldMember.persona.name} 已離開，`
            + `承接獨立私訊經歷的 ${privatePersona.name} 現已回到聊天室。`
        ).slice(-1500);
    });
    roomManager.addEpisodicMemories(room.id, [{
        kind: 'event',
        title: `${privatePersona.name} 帶著私訊經歷回到群組`,
        summary: bridge.summary,
        participants: [oldMember.id],
    }]);
    appendContextBridge(room.id, bridge);

    participantActionModal.classList.add('hidden');
    roomInfoModal.classList.add('hidden');
    renderPersonaList();
    startChat(room.id, null, currentConversationKey === room.id ? 'skip' : 'push');
};

const inviteParticipantCandidate = async (candidate: ParticipantTransferCandidate) => {
    if (!currentConversationKey || !currentPersona || activeChatRequest) return;
    const sourceConversationKey = currentConversationKey;
    const sourceRoom = currentRoom ? roomManager.getRoom(currentRoom.id) || currentRoom : null;
    const sourceTitle = sourceRoom?.title || currentPersona.name;
    const sourceHistory = memoryManager.getChatHistory(sourceConversationKey);

    if (candidate.targetRoomId && candidate.replaceMemberId) {
        const targetRoom = roomManager.getRoom(candidate.targetRoomId);
        if (!targetRoom) throw new Error('原本的群組已不存在。');
        await replaceRoomMemberWithPrivateCandidate(targetRoom, candidate);
        return;
    }

    if (sourceRoom) {
        if (candidate.replaceMemberId) {
            await replaceRoomMemberWithPrivateCandidate(sourceRoom, candidate);
            return;
        }
        if (sourceRoom.members.length >= ROOM_MEMBER_LIMIT) {
            alert(`每個群組最多 ${ROOM_MEMBER_LIMIT} 位角色。`);
            return;
        }
        if (sourceRoom.scene.presentMemberIds.length >= ROOM_PRESENT_MEMBER_LIMIT) {
            alert(`目前已有 ${ROOM_PRESENT_MEMBER_LIMIT} 位角色在場，請先請一位角色離場。`);
            return;
        }
        if (sourceRoom.members.some(member => roomMemberMatchesCandidate(member, candidate))) {
            alert(`${candidate.persona.name} 已經是這個聊天室的成員。`);
            return;
        }

        const member = createTransferredRoomMember(candidate);
        roomManager.addMember(sourceRoom.id, member);
        roomManager.updateRoom(sourceRoom.id, room => {
            room.scene.summary = `${room.scene.summary} ${member.persona.name} 剛獲邀加入，已閱讀必要的近期情境。`.slice(-1500);
        });
        const updatedRoom = roomManager.getRoom(sourceRoom.id)!;
        const bridge = buildContextBridge({
            kind: 'member_invited',
            sourceConversationKey,
            sourceTitle,
            history: sourceHistory,
            room: updatedRoom,
            targetMemberName: member.persona.name,
        });
        roomManager.addEpisodicMemories(sourceRoom.id, [{
            kind: 'event',
            title: `${member.persona.name} 加入聊天室`,
            summary: bridge.summary,
            participants: [member.id],
        }]);
        appendContextBridge(sourceRoom.id, bridge);
        participantActionModal.classList.add('hidden');
        renderPersonaList();
        startChat(sourceRoom.id, null, 'skip');
        return;
    }

    if (!currentPersonaKey || roomManager.getRooms().some(room => room.id === sourceConversationKey)) return;
    if (participantIdentityFingerprint(currentPersona) === participantIdentityFingerprint(candidate.persona)) {
        alert('不能邀請目前正在私訊的同一位角色。');
        return;
    }

    const room = roomManager.createRoom(
        `${currentPersona.name}、${candidate.persona.name}`,
        [
            { sourcePersonaKey: currentPersonaKey, persona: cloneRoomSnapshot(currentPersona) },
            { sourcePersonaKey: candidate.sourcePersonaKey, persona: cloneRoomSnapshot(candidate.persona) },
        ],
    );
    const bridge = buildContextBridge({
        kind: 'private_to_group',
        sourceConversationKey,
        sourceTitle,
        history: sourceHistory,
        targetMemberName: candidate.persona.name,
    });
    roomManager.updateRoom(room.id, editableRoom => {
        editableRoom.legacySourcePersonaKey = sourceConversationKey;
        editableRoom.description = `${currentPersona.name} 與 ${candidate.persona.name} 的群組`;
        editableRoom.scene.location = '由私人聊天延續的群組聊天室';
        editableRoom.scene.realityLayer = 'texting';
        editableRoom.scene.summary = `${bridge.summary} ${candidate.persona.name} 已加入並讀取必要的近期情境。`.slice(-1500);
        editableRoom.scene.unresolved = ['讓新加入的角色自然接上目前話題'];
    });
    const createdRoom = roomManager.getRoom(room.id)!;
    roomManager.addEpisodicMemories(createdRoom.id, [{
        kind: 'event',
        title: `${candidate.persona.name} 加入對話`,
        summary: bridge.summary,
        participants: createdRoom.members.map(member => member.id),
    }]);
    appendContextBridge(createdRoom.id, bridge);
    participantActionModal.classList.add('hidden');
    renderPersonaList();
    startChat(createdRoom.id, null, 'replace');
};

const setRoomMemberPresence = (roomId: string, memberId: string, present: boolean) => {
    if (activeChatRequest) {
        alert('請先等待目前回覆完成，再變更在場角色。');
        return;
    }
    const room = roomManager.getRoom(roomId);
    const member = room?.members.find(item => item.id === memberId);
    if (!room || !member) return;
    const currentIds = [...room.scene.presentMemberIds];
    if (!present && currentIds.length <= 1) {
        alert('場景中至少需要 1 位角色在場。');
        return;
    }
    if (present && currentIds.length >= ROOM_PRESENT_MEMBER_LIMIT) {
        alert(`同一場景最多 ${ROOM_PRESENT_MEMBER_LIMIT} 位角色在場。`);
        return;
    }
    const nextIds = present
        ? Array.from(new Set([...currentIds, member.id]))
        : currentIds.filter(id => id !== member.id);
    roomManager.setPresentMembers(room.id, nextIds);
    roomManager.updateRoom(room.id, editableRoom => {
        const event = present
            ? `${member.persona.name} 已回到目前場景。`
            : `${member.persona.name} 已離開目前場景，但仍保留為固定成員。`;
        editableRoom.scene.summary = `${editableRoom.scene.summary} ${event}`.slice(-1500);
    });
    const updatedRoom = roomManager.getRoom(room.id)!;
    const bridge = buildContextBridge({
        kind: present ? 'member_returned' : 'member_left',
        sourceConversationKey: room.id,
        sourceTitle: room.title,
        history: memoryManager.getChatHistory(room.id),
        room: updatedRoom,
        targetMemberName: member.persona.name,
    });
    appendContextBridge(room.id, bridge);
    participantActionModal.classList.add('hidden');
    if (currentConversationKey === room.id) startChat(room.id, null, 'skip');
    renderPersonaList();
};

const closeParticipantAction = () => {
    participantActionModal.classList.add('hidden');
    participantActionList.innerHTML = '';
};

const appendParticipantActionRow = (
    persona: Persona,
    detail: string,
    actionLabel: string,
    action: () => void | Promise<void>,
) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'participant-action-row';
    const avatar = document.createElement('span');
    avatar.className = 'room-member-avatar';
    if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
        const image = document.createElement('img');
        image.src = persona.avatarUrl;
        image.alt = persona.name;
        avatar.appendChild(image);
    } else avatar.textContent = persona.emoji || '●';
    const copy = document.createElement('span');
    copy.className = 'participant-action-copy';
    const name = document.createElement('strong');
    name.textContent = persona.name;
    const description = document.createElement('small');
    description.textContent = `${detail} · ${persona.description}`;
    copy.append(name, description);
    const actionText = document.createElement('span');
    actionText.className = 'participant-action-label';
    actionText.textContent = actionLabel;
    button.append(avatar, copy, actionText);
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            await action();
        } catch (error) {
            alert(error instanceof Error ? error.message : '未能完成角色操作。');
        } finally {
            if (!participantActionModal.classList.contains('hidden')) button.disabled = false;
        }
    });
    participantActionList.appendChild(button);
};

const openParticipantAction = (mode: 'dm' | 'invite' | 'leave') => {
    if (activeChatRequest) {
        alert('請先等待目前回覆完成。');
        return;
    }
    participantActionList.innerHTML = '';
    moreOptionsMenu.classList.add('hidden');

    if (mode === 'invite') {
        participantActionTitle.textContent = '邀請角色加入';
        participantActionSummary.textContent = currentRoom
            ? '可邀請其他角色；若群組成員已有獨立私訊版本，也可用私訊版安全取代舊版本。'
            : '可邀請另一位角色建立新群組；若這是由群組分出的私訊，也可帶著新記憶回到原群組。';
        collectParticipantTransferCandidates().forEach(candidate => {
            appendParticipantActionRow(
                candidate.persona,
                candidate.sourceLabel,
                candidate.targetRoomId
                    ? '回到群組'
                    : candidate.replaceMemberId ? '取代舊版本' : '邀請',
                () => inviteParticipantCandidate(candidate),
            );
        });
    } else {
        const room = currentRoom ? roomManager.getRoom(currentRoom.id) || currentRoom : null;
        if (!room) return;
        participantActionTitle.textContent = mode === 'dm' ? '私訊群組成員' : '請角色離場';
        participantActionSummary.textContent = mode === 'dm'
            ? '私訊會成為獨立聊天，並只承接必要的近期群組情境；原群組保持不變。'
            : '角色只會離開目前場景，不會刪除人格、soul.md、memory.md 或群組身份。';
        room.members
            .filter(member => mode === 'dm' || room.scene.presentMemberIds.includes(member.id))
            .forEach(member => {
                appendParticipantActionRow(
                    resolveRoomMemberAvatarPersona(member),
                    mode === 'dm'
                        ? room.scene.presentMemberIds.includes(member.id) ? '目前在場' : '目前不在場'
                        : '目前在場',
                    mode === 'dm' ? '私訊' : '離場',
                    mode === 'dm'
                        ? () => openPrivateChatForRoomMember(room.id, member.id)
                        : () => {
                            if (confirm(`請 ${member.persona.name} 離開目前場景？`)) {
                                setRoomMemberPresence(room.id, member.id, false);
                            }
                        },
                );
            });
    }

    if (!participantActionList.children.length) {
        const empty = document.createElement('p');
        empty.className = 'participant-action-empty';
        empty.textContent = mode === 'invite'
            ? '暫時沒有其他可邀請的角色。'
            : mode === 'leave' ? '目前沒有可請離場的角色。' : '這個群組沒有可私訊的角色。';
        participantActionList.appendChild(empty);
    }
    participantActionModal.classList.remove('hidden');
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

const renderRoomInfo = () => {
    const room = refreshCurrentRoom();
    if (!room) return;
    roomInfoTitle.textContent = room.title;
    roomInfoSummary.textContent = `${room.members.length} 位固定成員 · ${room.scene.presentMemberIds.length} 位目前在場 · 最多 ${ROOM_MEMBER_LIMIT} 位`;
    roomMemberList.innerHTML = '';

    room.members.forEach(member => {
        const row = document.createElement('div');
        row.className = `room-member-row${member.id === activeRoomMemberId ? ' is-active' : ''}`;
        const avatar = document.createElement('span');
        avatar.className = 'room-member-avatar';
        const sourcePersona = member.persona.avatarUrl
            ? member.persona
            : member.sourcePersonaKey
                ? memoryManager.getPersona(member.sourcePersonaKey) || member.persona
                : member.persona;
        if (sourcePersona.avatarUrl && !sourcePersona.avatarUrl.startsWith('generating_')) {
            const image = document.createElement('img');
            image.src = sourcePersona.avatarUrl;
            image.alt = sourcePersona.name;
            avatar.appendChild(image);
        } else {
            avatar.textContent = sourcePersona.emoji || '●';
        }

        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'room-member-copy';
        const name = document.createElement('strong');
        name.textContent = member.persona.name;
        const detail = document.createElement('span');
        detail.textContent = member.persona.publicIdentityEnabled
            ? `已確認身份 · ${member.persona.description}`
            : member.persona.description;
        copy.append(name, detail);
        copy.addEventListener('click', () => {
            selectActiveRoomMember(member.id);
            personaSettingsRoomTarget = { roomId: room.id, memberId: member.id };
            openPersonaSettings();
            renderRoomInfo();
        });

        const avatarButton = document.createElement('button');
        avatarButton.type = 'button';
        avatarButton.className = 'room-member-mini-action';
        avatarButton.textContent = '頭像';
        avatarButton.addEventListener('click', () => requestRoomMemberAvatarUpload(room.id, member.id));

        const dmButton = document.createElement('button');
        dmButton.type = 'button';
        dmButton.className = 'room-member-mini-action';
        dmButton.textContent = '私訊';
        dmButton.addEventListener('click', async () => {
            dmButton.disabled = true;
            try {
                await openPrivateChatForRoomMember(room.id, member.id);
            } catch (error) {
                alert(error instanceof Error ? error.message : '未能開啟私人聊天。');
                dmButton.disabled = false;
            }
        });

        const presence = document.createElement('label');
        presence.className = 'room-presence-toggle';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = room.scene.presentMemberIds.includes(member.id);
        const label = document.createElement('span');
        label.textContent = '在場';
        presence.append(checkbox, label);
        checkbox.addEventListener('change', () => {
            setRoomMemberPresence(room.id, member.id, checkbox.checked);
            renderRoomInfo();
        });
        const actions = document.createElement('div');
        actions.className = 'room-member-actions';
        actions.append(dmButton, avatarButton, presence);
        row.append(avatar, copy, actions);
        roomMemberList.appendChild(row);
    });

    roomSceneEditor.innerHTML = '';
    const locationLabel = document.createElement('label');
    locationLabel.className = 'wa-field-label';
    locationLabel.textContent = '位置';
    const locationInput = document.createElement('input');
    locationInput.value = room.scene.location;
    locationLabel.appendChild(locationInput);
    const realityLabel = document.createElement('label');
    realityLabel.className = 'wa-field-label';
    realityLabel.textContent = '對話層';
    const realitySelect = document.createElement('select');
    [
        ['physical', '同一實體場景'],
        ['texting', '遠端訊息'],
        ['imagined', '想像／故事中'],
    ].forEach(([value, labelText]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = labelText;
        option.selected = room.scene.realityLayer === value;
        realitySelect.appendChild(option);
    });
    realityLabel.appendChild(realitySelect);
    const summaryLabel = document.createElement('label');
    summaryLabel.className = 'wa-field-label';
    summaryLabel.textContent = '場景摘要';
    const summaryInput = document.createElement('textarea');
    summaryInput.rows = 4;
    summaryInput.value = room.scene.summary;
    summaryLabel.appendChild(summaryInput);
    const saveScene = document.createElement('button');
    saveScene.type = 'button';
    saveScene.className = 'wa-secondary-button';
    saveScene.textContent = '儲存場景狀態';
    saveScene.addEventListener('click', () => {
        roomManager.updateRoom(room.id, editableRoom => {
            editableRoom.scene.location = locationInput.value.trim() || editableRoom.scene.location;
            editableRoom.scene.realityLayer = realitySelect.value as RoomSceneState['realityLayer'];
            editableRoom.scene.summary = summaryInput.value.trim() || editableRoom.scene.summary;
        });
        refreshCurrentRoom();
        saveScene.textContent = '已儲存';
        window.setTimeout(() => { saveScene.textContent = '儲存場景狀態'; }, 1200);
    });
    roomSceneEditor.append(locationLabel, realityLabel, summaryLabel, saveScene);

    roomPhotoPromptEditor.innerHTML = '';
    const favoritePromptInput = document.createElement('textarea');
    favoritePromptInput.rows = 4;
    favoritePromptInput.maxLength = FAVORITE_PHOTO_PROMPT_MAX_LENGTH;
    favoritePromptInput.value = room.favoritePhotoPrompt || '';
    favoritePromptInput.placeholder = '例如：自然手機攝影、柔和窗光、保留真實皮膚質感，不要文字或浮水印。';
    const favoritePromptHint = document.createElement('p');
    favoritePromptHint.textContent = '角色會先把這段設定與當下衣著、位置、動作及最新拍照要求整合成不矛盾的版本；每次照片草稿仍可取消勾選。';
    const saveFavoritePrompt = document.createElement('button');
    saveFavoritePrompt.type = 'button';
    saveFavoritePrompt.className = 'wa-secondary-button';
    saveFavoritePrompt.textContent = '儲存常用拍照 Prompt';
    saveFavoritePrompt.addEventListener('click', () => {
        roomManager.updateRoom(room.id, editableRoom => {
            editableRoom.favoritePhotoPrompt = normalizeFavoritePhotoPrompt(favoritePromptInput.value);
        });
        refreshCurrentRoom();
        favoritePromptInput.value = currentRoom?.favoritePhotoPrompt || '';
        saveFavoritePrompt.textContent = '已儲存';
        window.setTimeout(() => { saveFavoritePrompt.textContent = '儲存常用拍照 Prompt'; }, 1200);
    });
    roomPhotoPromptEditor.append(favoritePromptInput, favoritePromptHint, saveFavoritePrompt);
};

const openRoomInfo = () => {
    if (!currentRoom) {
        personaSettingsRoomTarget = null;
        openPersonaSettings();
        return;
    }
    renderRoomInfo();
    roomInfoModal.classList.remove('hidden');
    moreOptionsMenu.classList.add('hidden');
};

const closeRoomInfo = () => roomInfoModal.classList.add('hidden');

const renderRoomMemory = () => {
    const room = refreshCurrentRoom();
    const personaKey = room ? null : currentPersonaKey;
    const persona = room ? null : currentPersona;
    if (!room && (!personaKey || !persona)) return;
    roomMemoryTitle.textContent = `${room?.title || persona?.name || '角色'}的靈魂與記憶`;
    memoryMemberTabs.innerHTML = '';
    memoryMemberTabs.classList.toggle('hidden', !room);
    if (room) {
        if (!selectedMemoryMemberId || !room.members.some(member => member.id === selectedMemoryMemberId)) {
            selectedMemoryMemberId = activeRoomMemberId || room.leadMemberId;
        }
        room.members.forEach(member => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = member.id === selectedMemoryMemberId ? 'is-active' : '';
            button.textContent = member.persona.name;
            button.addEventListener('click', () => {
                selectedMemoryMemberId = member.id;
                renderRoomMemory();
            });
            memoryMemberTabs.appendChild(button);
        });
    }
    memorySoulTab.classList.toggle('is-active', selectedMemoryType === 'soul');
    memoryEventTab.classList.toggle('is-active', selectedMemoryType === 'memory');
    roomMemoryList.innerHTML = '';
    const member = room?.members.find(item => item.id === selectedMemoryMemberId);
    if (room && !member) return;

    if (selectedMemoryType === 'memory') {
        const conversationKey = room?.id || personaKey || '';
        const totalUserMessages = memoryManager.peekChatHistory(conversationKey)
            .filter(message => message.role === 'user').length;
        const lastSummarized = room
            ? Number(room.lastSummarizedUserMessageCount || 0)
            : Number(persona?.lastMemorySummaryUserMessageCount || 0);
        const summaryVersion = room
            ? Number(room.memorySummaryVersion || 0)
            : Number(persona?.memorySummaryVersion || 0);
        const inFlight = room ? roomSummaryInFlight.has(room.id) : Boolean(personaKey && personaSummaryInFlight.has(personaKey));
        const needsRecovery = summaryVersion < AUTO_MEMORY_SUMMARY_VERSION
            && totalUserMessages >= AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES;
        const remaining = Math.max(0, ROOM_MEMORY_SUMMARY_TURN_INTERVAL - (totalUserMessages - lastSummarized));
        const status = document.createElement('div');
        status.className = 'auto-memory-status';
        const title = document.createElement('strong');
        title.textContent = inFlight ? '正在自動整理記憶' : '自動記憶運作中';
        const detail = document.createElement('span');
        detail.textContent = inFlight
            ? '完成後會直接寫入 memory.md。'
            : needsRecovery
                ? '偵測到舊版漏存的 checkpoint；下一次角色成功回覆後會自動補抓最近重要內容。'
                : remaining === 0 && totalUserMessages > lastSummarized
                    ? '已到整理門檻，下一次角色成功回覆後會更新。'
                    : `已處理至第 ${Math.min(lastSummarized, totalUserMessages)} / ${totalUserMessages} 則使用者訊息；再 ${remaining} 則自動整理。`;
        const manualButton = document.createElement('button');
        manualButton.type = 'button';
        manualButton.className = 'manual-memory-update-button';
        manualButton.disabled = inFlight || totalUserMessages === 0;
        manualButton.textContent = inFlight
            ? '正在整理…'
            : `立即整理最近 ${AUTO_MEMORY_RECENT_MESSAGE_LIMIT} 則`;
        manualButton.addEventListener('click', async () => {
            manualMemoryUpdateNotice = {
                conversationKey,
                tone: 'running',
                text: `正在讀取最近 ${AUTO_MEMORY_RECENT_MESSAGE_LIMIT} 則有效對話並更新 memory.md…`,
            };
            renderRoomMemory();
            const result = room
                ? await maybeSummarizeRoomMemory(room.id, true)
                : personaKey
                    ? await maybeSummarizePersonaMemory(personaKey, true)
                    : { status: 'skipped', reason: 'not-found' } as const;
            if (result.status === 'success') {
                manualMemoryUpdateNotice = {
                    conversationKey,
                    tone: 'success',
                    text: result.added > 0
                        ? `整理完成，已新增 ${result.added} 項重要記憶。`
                        : '整理完成；最近對話沒有新的重要內容需要加入，現有記憶未被重複寫入。',
                };
            } else if (result.status === 'error') {
                if (result.message === VENICE_AUTH_REQUIRED_ERROR) handleAuthRequired();
                manualMemoryUpdateNotice = {
                    conversationKey,
                    tone: 'error',
                    text: `整理失敗：${sanitizeChatFailureDetail(result.message).slice(0, 180)}`,
                };
            } else {
                const skippedReason = result.reason === 'busy'
                    ? '另一個記憶整理工作仍在進行。'
                    : result.reason === 'no-history'
                        ? '目前沒有足夠對話可以整理。'
                        : result.reason === 'threshold'
                            ? '尚未到自動整理門檻。'
                            : '目前聊天室已不存在。';
                manualMemoryUpdateNotice = { conversationKey, tone: 'error', text: skippedReason };
            }
            renderRoomMemory();
        });
        status.append(title, detail, manualButton);
        if (manualMemoryUpdateNotice?.conversationKey === conversationKey) {
            const notice = document.createElement('span');
            notice.className = `manual-memory-update-notice is-${manualMemoryUpdateNotice.tone}`;
            notice.textContent = manualMemoryUpdateNotice.text;
            status.appendChild(notice);
        }
        roomMemoryList.appendChild(status);
    }

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.className = 'memory-add-button';
    addButton.textContent = selectedMemoryType === 'soul' ? '＋ 新增永久記憶' : '＋ 新增重要事件';
    addButton.addEventListener('click', () => {
        const title = window.prompt('記憶標題');
        if (!title?.trim()) return;
        const summary = window.prompt(selectedMemoryType === 'soul'
            ? '要讓角色永久記住甚麼？'
            : '這件重要事件發生了甚麼？');
        if (!summary?.trim()) return;
        if (room && member) {
            if (selectedMemoryType === 'soul') {
                roomManager.addSoulMemory(room.id, [member.id], {
                    kind: 'preference',
                    title: title.trim(),
                    summary: summary.trim(),
                    participants: [member.id],
                });
            } else {
                roomManager.addEpisodicMemories(room.id, [{
                    kind: 'event',
                    title: title.trim(),
                    summary: summary.trim(),
                    participants: [member.id],
                }]);
            }
        } else if (personaKey) {
            memoryManager.addPersonaMemory(personaKey, selectedMemoryType, {
                kind: selectedMemoryType === 'soul' ? 'preference' : 'event',
                title: title.trim(),
                summary: summary.trim(),
            });
        }
        renderRoomMemory();
    });
    roomMemoryList.appendChild(addButton);

    let entries: Array<RoomMemoryEntry | PersonaMemoryEntry> = [];
    if (room && member) {
        entries = selectedMemoryType === 'soul' ? member.soul : member.memories;
    } else if (personaKey && persona) {
        entries = [...memoryManager.getPersonaMemoryEntries(personaKey, selectedMemoryType)];
        if (selectedMemoryType === 'soul' && persona.memory?.trim()) {
            entries.unshift({
                id: 'legacy-persona-memory',
                kind: 'core',
                title: '舊版永久記憶',
                summary: persona.memory.trim(),
                createdAt: 0,
                pinned: true,
            });
        }
    }
    if (entries.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'room-memory-empty';
        empty.textContent = selectedMemoryType === 'soul'
            ? '尚未加入永久核心記憶。'
            : '尚未整理重要事件；系統會每 24 個使用者回合自動更新。';
        roomMemoryList.appendChild(empty);
    }
    entries.forEach(entry => {
        const isLegacyPersonaMemory = !room && entry.id === 'legacy-persona-memory';
        const card = document.createElement('article');
        card.className = 'room-memory-card';
        const title = document.createElement('input');
        title.value = entry.title;
        title.disabled = isLegacyPersonaMemory;
        title.setAttribute('aria-label', '記憶標題');
        const summary = document.createElement('textarea');
        summary.rows = 4;
        summary.value = entry.summary;
        summary.setAttribute('aria-label', '記憶內容');
        const meta = document.createElement('p');
        meta.textContent = [
            entry.pinned ? '永久' : '事件',
            entry.sourceMessageIndexes?.length ? `來源訊息 ${entry.sourceMessageIndexes.join(', ')}` : '',
        ].filter(Boolean).join(' · ');
        const actions = document.createElement('div');
        actions.className = 'room-memory-actions';
        const save = document.createElement('button');
        save.type = 'button';
        save.textContent = '儲存';
        save.addEventListener('click', () => {
            if (room && member) {
                roomManager.updateMemory(room.id, member.id, entry.id, selectedMemoryType, {
                    title: title.value,
                    summary: summary.value,
                });
            } else if (personaKey) {
                if (isLegacyPersonaMemory) {
                    memoryManager.updatePersona(personaKey, { memory: summary.value.trim() });
                    if (currentPersona) currentPersona.memory = summary.value.trim();
                } else {
                    memoryManager.updatePersonaMemory(personaKey, selectedMemoryType, entry.id, {
                        title: title.value,
                        summary: summary.value,
                    });
                }
            }
            save.textContent = '已儲存';
            window.setTimeout(() => { save.textContent = '儲存'; }, 1000);
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'is-danger';
        remove.textContent = '刪除';
        remove.addEventListener('click', () => {
            if (!confirm(`刪除「${entry.title}」？`)) return;
            if (room && member) {
                roomManager.deleteMemory(room.id, member.id, entry.id, selectedMemoryType);
            } else if (personaKey) {
                if (isLegacyPersonaMemory) {
                    memoryManager.updatePersona(personaKey, { memory: '' });
                    if (currentPersona) currentPersona.memory = '';
                } else {
                    memoryManager.deletePersonaMemory(personaKey, selectedMemoryType, entry.id);
                }
            }
            renderRoomMemory();
        });
        actions.append(save, remove);
        card.append(title, summary, meta, actions);
        roomMemoryList.appendChild(card);
    });
};

const openRoomMemory = () => {
    if (!currentRoom && (!currentPersonaKey || !currentPersona)) return;
    selectedMemoryMemberId = currentRoom ? activeRoomMemberId || currentRoom.leadMemberId : null;
    renderRoomMemory();
    roomInfoModal.classList.add('hidden');
    roomMemoryModal.classList.remove('hidden');
};

const closeRoomMemory = () => roomMemoryModal.classList.add('hidden');

const renderCreateGroupMembers = () => {
    createGroupMemberList.innerHTML = '';
    const targetRoom = groupModalTargetRoomId ? roomManager.getRoom(groupModalTargetRoomId) : null;
    const existingKeys = new Set(targetRoom?.members.map(member => member.sourcePersonaKey).filter(Boolean));
    Object.entries(memoryManager.getAllPersonas()).forEach(([key, persona]) => {
        if (
            key === VENICE_ASSISTANT_PERSONA_KEY
            || persona.gender !== 'female'
            || persona.timelineBranch
            || existingKeys.has(key)
        ) return;
        const label = document.createElement('label');
        label.className = 'create-group-member-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = key;
        const avatar = document.createElement('span');
        avatar.className = 'room-member-avatar';
        if (persona.avatarUrl && !persona.avatarUrl.startsWith('generating_')) {
            const image = document.createElement('img');
            image.src = persona.avatarUrl;
            image.alt = persona.name;
            avatar.appendChild(image);
        } else avatar.textContent = persona.emoji || '●';
        const copy = document.createElement('span');
        copy.innerHTML = `<strong></strong><small></small>`;
        copy.querySelector('strong')!.textContent = persona.name;
        copy.querySelector('small')!.textContent = persona.description;
        label.append(checkbox, avatar, copy);
        createGroupMemberList.appendChild(label);
    });
};

const openCreateGroup = (targetRoomId: string | null = null) => {
    groupModalTargetRoomId = targetRoomId;
    createGroupName.closest('label')?.classList.toggle('hidden', Boolean(targetRoomId));
    createGroupName.value = '';
    confirmCreateGroupBtn.textContent = targetRoomId ? '加入所選角色' : '建立群組';
    renderCreateGroupMembers();
    createGroupModal.classList.remove('hidden');
    newChatMenu.classList.add('hidden');
};

const closeCreateGroup = () => {
    createGroupModal.classList.add('hidden');
    groupModalTargetRoomId = null;
};

const confirmCreateGroup = () => {
    const selectedKeys = Array.from(createGroupMemberList.querySelectorAll<HTMLInputElement>('input:checked'))
        .map(input => input.value);
    if (groupModalTargetRoomId) {
        const room = roomManager.getRoom(groupModalTargetRoomId);
        if (!room || selectedKeys.length === 0) {
            alert('請至少選擇 1 位角色。');
            return;
        }
        if (room.members.length + selectedKeys.length > ROOM_MEMBER_LIMIT) {
            alert(`每個群組最多 ${ROOM_MEMBER_LIMIT} 位角色。`);
            return;
        }
        selectedKeys.forEach((key, index) => {
            const persona = memoryManager.getPersona(key);
            if (!persona) return;
            roomManager.addMember(room.id, {
                id: `member_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
                sourcePersonaKey: key,
                persona: cloneRoomSnapshot(persona),
                joinedAt: Date.now(),
                soul: [],
                memories: [],
            });
        });
        closeCreateGroup();
        refreshCurrentRoom();
        renderRoomInfo();
        renderPersonaList();
        return;
    }

    if (selectedKeys.length < 2) {
        alert('群組至少需要 2 位角色。');
        return;
    }
    const selected = selectedKeys.flatMap(key => {
        const persona = memoryManager.getPersona(key);
        return persona ? [{ sourcePersonaKey: key, persona }] : [];
    });
    const room = roomManager.createRoom(createGroupName.value, selected);
    memoryManager.addMessage(room.id, 'system', { text: `${room.title} 已建立。` });
    closeCreateGroup();
    renderPersonaList();
    startChat(room.id);
};

const openMemoryEditor = () => {
    if (currentPersona) {
        memoryEditor.value = currentPersona.memory || '';
        memoryModal.classList.remove('hidden');
    }
};

const renderPersonaPublicIdentitySettings = () => {
    const enabled = Boolean(personaPublicIdentityCheckbox.checked);
    const identity = personaSettingsResolvedIdentity;
    personaPublicIdentityPanel.classList.toggle('hidden', !enabled);
    personaPublicIdentitySummary.value = identity?.summary || '';
    personaPublicIdentityVisual.value = identity
        ? [identity.visualPrompt, identity.stylePrompt].filter(Boolean).join('\n\n')
        : '';
    personaPublicIdentityStatus.textContent = identity
        ? `${getPublicIdentityKindLabel(identity.kind)} · 已確認 ${identity.canonicalName}`
        : '尚未辨識；按儲存後開始搜尋。';
    personaPublicIdentitySource.classList.toggle('hidden', !identity?.sourceUrl);
    if (identity?.sourceUrl) {
        personaPublicIdentitySource.href = identity.sourceUrl;
        personaPublicIdentitySource.textContent = `查看來源：${identity.sourceTitle}`;
    } else {
        personaPublicIdentitySource.removeAttribute('href');
    }
};

const openPersonaSettings = () => {
    if (!currentPersona) return;

    personaSettingsSubtitle.textContent = `正在編輯：${currentPersona.name}`;
    renderPersonaSettingsAvatar();
    personaDescriptionEditor.value = currentPersona.description || '';
    personaPromptEditor.value = currentPersona.prompt || '';
    personaGreetingEditor.value = currentPersona.greeting || '';
    personaFavoritePhotoPromptField.classList.toggle('hidden', Boolean(personaSettingsRoomTarget));
    personaFavoritePhotoPrompt.value = currentPersona.favoritePhotoPrompt || '';
    personaSettingsResolvedIdentity = currentPersona.publicIdentity
        ? { ...currentPersona.publicIdentity }
        : null;
    personaSettingsResolvedAvatarUrl = null;
    personaPublicIdentityCheckbox.checked = Boolean(currentPersona.publicIdentityEnabled);
    renderPersonaPublicIdentitySettings();
    personaSettingsModal.classList.remove('hidden');
};

const closePersonaSettings = () => {
    personaSettingsModal.classList.add('hidden');
    personaSettingsResolvedIdentity = null;
    personaSettingsResolvedAvatarUrl = null;
    personaSettingsRoomTarget = null;
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

const resolvePublicIdentityForPersonaSettings = async () => {
    if (!currentPersona) return false;
    const query = [currentPersona.name, personaDescriptionEditor.value.trim()].filter(Boolean).join(' ');
    const result = await requestPublicIdentityResolution(query);
    if (!result) return false;
    personaSettingsResolvedIdentity = result.identity;
    personaSettingsResolvedAvatarUrl = result.avatarUrl || null;
    renderPersonaPublicIdentitySettings();
    return true;
};

const savePersonaSettings = async () => {
    if (!currentPersonaKey || !currentPersona) return;

    const description = personaDescriptionEditor.value.trim();
    const prompt = personaPromptEditor.value.trim();
    const greeting = personaGreetingEditor.value.trim();

    if (!prompt) {
        alert('人格主設定不能留空。');
        return;
    }

    const publicIdentityEnabled = personaPublicIdentityCheckbox.checked;
    savePersonaSettingsBtn.disabled = true;
    const originalButtonText = savePersonaSettingsBtn.textContent;
    savePersonaSettingsBtn.textContent = publicIdentityEnabled && !personaSettingsResolvedIdentity
        ? '正在辨識身份...'
        : '正在儲存...';

    try {
        if (publicIdentityEnabled && !personaSettingsResolvedIdentity) {
            const confirmed = await resolvePublicIdentityForPersonaSettings();
            if (!confirmed) return;
        }

        const publicIdentity = publicIdentityEnabled && personaSettingsResolvedIdentity
            ? {
                ...personaSettingsResolvedIdentity,
                summary: personaPublicIdentitySummary.value.trim() || personaSettingsResolvedIdentity.summary,
                visualPrompt: personaPublicIdentityVisual.value.trim() || personaSettingsResolvedIdentity.visualPrompt,
                stylePrompt: undefined,
            }
            : currentPersona.publicIdentity;

        const previousGreeting = currentPersona.greeting || '';
        const roomTarget = personaSettingsRoomTarget;
        const updates: Partial<Persona> = {
            description,
            prompt,
            greeting: greeting || previousGreeting,
            publicIdentityEnabled,
            publicIdentity,
        };
        if (!roomTarget) {
            updates.favoritePhotoPrompt = normalizeFavoritePhotoPrompt(personaFavoritePhotoPrompt.value);
        }
        if (publicIdentityEnabled && publicIdentity) {
            updates.avatarPrompt = [
                publicIdentity.visualPrompt,
                publicIdentity.stylePrompt,
                'single-character portrait',
            ].filter(Boolean).join(' ');
        }
        if (publicIdentityEnabled && personaSettingsResolvedAvatarUrl) {
            updates.avatarUrl = personaSettingsResolvedAvatarUrl;
        }
        if (roomTarget) {
            roomManager.updateMember(roomTarget.roomId, roomTarget.memberId, { persona: updates });
            if (currentRoom?.id === roomTarget.roomId) currentRoom = roomManager.getRoom(roomTarget.roomId) || currentRoom;
        } else {
            memoryManager.updatePersona(currentPersonaKey, updates);
        }

        Object.assign(currentPersona, updates);
        if (updates.avatarUrl) {
            renderChatHeaderAvatar();
            renderPersonaSettingsAvatar();
        }

        if (!roomTarget) {
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
        }

        renderPersonaList();
        closePersonaSettings();
        appendMessage({
            text: publicIdentityEnabled
                ? '[系統] 人格與公開身份設定已更新；角色照片會使用已確認身份進行文字生成。'
                : '[系統] 人格設定已更新，後續回覆會依照新設定生成。',
        }, 'system');
    } finally {
        savePersonaSettingsBtn.disabled = false;
        savePersonaSettingsBtn.textContent = originalButtonText || '儲存人格';
    }
};

const startNewScene = () => {
    if (!currentConversationKey) return;
    const completedSceneHistory = selectLatestSceneHistory(
        memoryManager.peekChatHistory(currentConversationKey),
    );
    const transitionBridge = completedSceneHistory.length > 0
        ? buildContextBridge({
            kind: 'scene_transition',
            sourceConversationKey: currentConversationKey,
            sourceTitle: currentRoom?.title || currentPersona?.name || '目前對話',
            history: completedSceneHistory,
            room: currentRoom || undefined,
            summaryOverride: currentRoom
                ? [
                    `已完成位置：${currentRoom.scene.location}`,
                    `已完成情節：${currentRoom.scene.summary}`,
                    currentRoom.scene.unresolved.length
                        ? `結束時尚未處理：${currentRoom.scene.unresolved.join('；')}`
                        : '',
                ].filter(Boolean).join('。')
                : '上一場景已完結；保留已發生的事件、關係變化、承諾與情感發展，新的即時狀態由下一則訊息建立。',
        })
        : undefined;

    if (currentRoom) void maybeSummarizeRoomMemory(currentRoom.id, true);
    else if (currentPersonaKey) void maybeSummarizePersonaMemory(currentPersonaKey, true);
    appendMessage({ text: SCENE_START_LABEL }, 'system');
    memoryManager.addMessage(currentConversationKey, 'system', {
        text: SCENE_END_MARKER,
        contextBridge: transitionBridge,
    });
    if (currentRoom) {
        const previousScene = cloneRoomSnapshot(currentRoom.scene);
        if (completedSceneHistory.length > 0 && previousScene.presentMemberIds.length > 0) {
            roomManager.addEpisodicMemories(currentRoom.id, [{
                kind: 'event',
                title: `已完成場景：${previousScene.location || '上一幕'}`,
                summary: previousScene.summary,
                participants: [...previousScene.presentMemberIds],
                roleplayOnly: true,
            }]);
        }
        roomManager.updateRoom(currentRoom.id, room => {
            room.scene.id = crypto.randomUUID?.() || `scene-${Date.now()}`;
            room.scene.startedAt = Date.now();
            room.scene.summary = '使用者剛開始一個新場景，等待建立位置、在場人物與事件。';
            room.scene.unresolved = [];
        });
        refreshCurrentRoom();
    }
    moreOptionsMenu.classList.add('hidden');
};

const openPhotoPromptModal = () => {
    if (!currentPersonaKey || !currentPersona || isAssistantPersonaKey(currentPersonaKey) || isGodModeActive) return;
    photoPromptInput.value = '';
    photoSenderSelect.innerHTML = '';
    photoSubjectsContainer.innerHTML = '';
    pendingPhotoSenderMemberId = null;
    pendingPhotoSubjectMemberIds = [];
    if (currentRoom) {
        photoRoomMemberControls.classList.remove('hidden');
        currentRoom.members
            .filter(member => currentRoom!.scene.presentMemberIds.includes(member.id))
            .forEach(member => {
                const option = document.createElement('option');
                option.value = member.id;
                option.textContent = member.persona.name;
                option.selected = member.id === (activeRoomMemberId || currentRoom!.leadMemberId);
                photoSenderSelect.appendChild(option);
                const label = document.createElement('label');
                label.className = 'photo-subject-option';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = member.id;
                checkbox.checked = option.selected;
                label.append(checkbox, document.createTextNode(member.persona.name));
                photoSubjectsContainer.appendChild(label);
            });
    } else {
        photoRoomMemberControls.classList.add('hidden');
    }
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
    const senderMemberId = currentRoom ? photoSenderSelect.value : undefined;
    const subjectMemberIds = currentRoom
        ? Array.from(photoSubjectsContainer.querySelectorAll<HTMLInputElement>('input:checked')).map(input => input.value)
        : [];
    if (currentRoom && (!senderMemberId || subjectMemberIds.length === 0)) {
        alert('請選擇準備照片的人，以及至少 1 位照片中的角色。');
        return;
    }
    if (senderMemberId) selectActiveRoomMember(senderMemberId);
    closePhotoPromptModal();
    await sendMessage({
        characterPhotoRequest: true,
        photoSenderMemberId: senderMemberId,
        photoSubjectMemberIds: subjectMemberIds,
        messageText: requestText,
    });
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
    attachFileMenuBtn.addEventListener('click', () => {
        moreOptionsMenu.classList.add('hidden');
        chatAttachmentInput.click();
    });
    chatAttachmentInput.addEventListener('change', () => void handleChatAttachmentSelection());
    composerCameraButton.addEventListener('click', openPhotoPromptModal);
    chatSearchBtn.addEventListener('click', openChatSearch);
    chatSearchClose.addEventListener('click', closeChatSearch);
    chatSearchInput.addEventListener('input', runChatSearch);
    chatSearchInput.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            closeChatSearch();
            return;
        }
        if (event.key === 'Enter' && chatSearchMatches.length > 0) {
            event.preventDefault();
            focusChatSearchMatch(chatSearchMatchIndex + (event.shiftKey ? -1 : 1));
        }
    });
    chatSearchPrev.addEventListener('click', () => focusChatSearchMatch(chatSearchMatchIndex - 1));
    chatSearchNext.addEventListener('click', () => focusChatSearchMatch(chatSearchMatchIndex + 1));
    homeSearchToggle.addEventListener('click', () => conversationSearchInput.focus());
    conversationSearchInput.addEventListener('input', renderPersonaList);
    homeMenuToggle.addEventListener('click', event => {
        event.stopPropagation();
        homeMenu.classList.toggle('hidden');
        newChatMenu.classList.add('hidden');
    });
    homeChatModelSettingsBtn.addEventListener('click', () => openChatModelSettings('global'));
    homeLiveCloudBtn.addEventListener('click', openSupabaseCloud);
    closeSupabaseCloudBtn.addEventListener('click', closeSupabaseCloud);
    supabaseCloudModal.addEventListener('click', event => {
        if (event.target === supabaseCloudModal) closeSupabaseCloud();
    });
    supabaseCloudSendLink.addEventListener('click', () => void sendSupabaseMagicLink());
    supabaseCloudSyncNow.addEventListener('click', () => void syncSupabaseCloudNow());
    supabaseCloudReload.addEventListener('click', () => void reloadSupabaseCloud());
    supabaseCloudSignOut.addEventListener('click', () => void supabaseCloudSyncManager.signOut());
    homeCloudBackupBtn.addEventListener('click', openCloudBackup);
    closeCloudBackupBtn.addEventListener('click', closeCloudBackup);
    cloudBackupModal.addEventListener('click', event => {
        if (event.target === cloudBackupModal && !cloudBackupBusy) closeCloudBackup();
    });
    enableCloudBackupBtn.addEventListener('click', () => void setupCloudBackup());
    restoreCloudWithPasswordBtn.addEventListener('click', restoreLatestCloudBackupWithPassword);
    cloudBackupNowBtn.addEventListener('click', () => void backupCloudNow());
    cloudRestoreLatestBtn.addEventListener('click', () => {
        const latest = cloudBackupList[0];
        if (latest) void restoreCloudBackupVersion(latest);
    });
    refreshCloudBackupsBtn.addEventListener('click', () => void refreshCloudBackupView(true));
    scanLocalPhotoVaultBtn.addEventListener('click', () => void scanLocalPhotoVault());
    cloudBackupAutoToggle.addEventListener('change', () => {
        cloudBackupManager.setEnabled(cloudBackupAutoToggle.checked);
        renderCloudBackupState();
    });
    deleteCloudBackupsBtn.addEventListener('click', () => void deleteAllCloudBackups());
    cloudBackupPasswordConfirm.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            void setupCloudBackup();
        }
    });
    cloudRestorePassword.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            restoreLatestCloudBackupWithPassword();
        }
    });
    homeExportAll.addEventListener('click', () => {
        void fileManager.saveAllChats();
        homeMenu.classList.add('hidden');
    });
    newChatFab.addEventListener('click', event => {
        event.stopPropagation();
        newChatMenu.classList.toggle('hidden');
        homeMenu.classList.add('hidden');
    });
    createGroupRoomBtn.addEventListener('click', () => openCreateGroup());
    closeCreateGroupBtn.addEventListener('click', closeCreateGroup);
    confirmCreateGroupBtn.addEventListener('click', confirmCreateGroup);
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
    closeParticipantActionBtn.addEventListener('click', closeParticipantAction);
    participantActionModal.addEventListener('click', event => {
        if (event.target === participantActionModal) closeParticipantAction();
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
    ccModelSettingsBtn.addEventListener('click', () => openChatModelSettings('cc'));
    closeChatModelSettingsBtn.addEventListener('click', closeChatModelSettings);
    chatModelSettingsModal.addEventListener('click', event => {
        if (event.target === chatModelSettingsModal) closeChatModelSettings();
    });
    chatModelSelects.forEach(select => select.addEventListener('change', updateChatModelRoutePreviews));
    refreshChatModelsBtn.addEventListener('click', () => {
        chatModelSettingsDraft = readChatModelSettingsDraftFromControls();
        chatModelListStatus.textContent = '正在直接向 Venice 重新抓取模型清單...';
        void loadAssistantModels(true).then(renderChatModelSettingsOptions);
    });
    resetChatModelSettingsBtn.addEventListener('click', () => {
        chatModelSettingsDraft = chatModelSettingsScope === 'cc'
            ? { ...chatModelSettingsDraft, ccPrimary: DEFAULT_CHAT_MODEL_SETTINGS.ccPrimary }
            : { ...DEFAULT_CHAT_MODEL_SETTINGS };
        renderChatModelSettingsOptions();
    });
    saveChatModelSettingsBtn.addEventListener('click', saveChatModelSettings);
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
    imageSeedLock.addEventListener('change', () => {
        localStorage.setItem(IMAGE_SEED_LOCK_STORAGE_KEY, String(imageSeedLock.checked));
        if (imageSeedLock.checked) {
            const seed = normalizeImageSeed(imageSeed.value) ?? setSeedInputValue(imageSeed, createRandomImageSeed());
            localStorage.setItem(IMAGE_SEED_STORAGE_KEY, String(seed));
        }
    });
    imageSeedRandom.addEventListener('click', () => {
        const seed = setSeedInputValue(imageSeed, createRandomImageSeed());
        localStorage.setItem(IMAGE_SEED_STORAGE_KEY, String(seed));
    });
    imageSeed.addEventListener('change', () => {
        const seed = normalizeImageSeed(imageSeed.value);
        if (seed === undefined) return;
        setSeedInputValue(imageSeed, seed);
        localStorage.setItem(IMAGE_SEED_STORAGE_KEY, String(seed));
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
        chatAttachmentObjectUrls.forEach(url => URL.revokeObjectURL(url));
    });

    backButton.addEventListener('click', navigateBackToSelectionView);
    window.addEventListener('popstate', handleBrowserPopState);
    sendButton.addEventListener('click', () => {
        dispatchSendMessage();
    });
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            dispatchSendMessage();
        }
    });

    messageInput.addEventListener('input', () => {
        updateSendButtonState();
        if (messageInput.scrollHeight > messageInput.clientHeight) {
            messageInput.scrollTop = messageInput.scrollHeight;
        }
    });
    
    publicFigureCreateBtn.addEventListener('click', () => openMimicImportModal('public'));
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
    closeAvatarSourceModalBtn.addEventListener('click', closeAvatarSourceModal);
    avatarSourceModal.addEventListener('click', event => {
        if (event.target === avatarSourceModal) closeAvatarSourceModal();
    });
    avatarSourceLocalBtn.addEventListener('click', chooseLocalAvatarSource);
    avatarSourceSearchBtn.addEventListener('click', () => {
        void chooseSearchedAvatarSource();
    });
    closePromptModal.addEventListener('click', closeAvatarPromptEditor);
    cancelPromptEdit.addEventListener('click', closeAvatarPromptEditor);
    savePromptEdit.addEventListener('click', saveAvatarPrompt);

    downloadChatBtn.addEventListener('click', () => {
        if (currentConversationKey && currentPersona) {
            fileManager.saveCurrentChat(currentConversationKey, currentRoom?.title || currentPersona.name);
        }
        moreOptionsMenu.classList.add('hidden');
    });

    downloadAllChatsBtn.addEventListener('click', () => {
        fileManager.saveAllChats();
        moreOptionsMenu.classList.add('hidden');
    });
    downloadImagesBtn.addEventListener('click', () => {
         if (currentConversationKey && currentPersona) {
            fileManager.downloadImages(currentConversationKey, currentRoom?.title || currentPersona.name);
        }
        moreOptionsMenu.classList.add('hidden');
    });

    uploadZipBtn.addEventListener('click', () => zipUploadInput.click());
    zipUploadInput.addEventListener('change', (e) => fileManager.handleZipUpload(e));
    mimicModeTranscriptBtn.addEventListener('click', () => setMimicBuildMode('transcript'));
    mimicModePublicBtn.addEventListener('click', () => setMimicBuildMode('public'));
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
    
    giftButton.addEventListener('click', () => showDisabledFeatureNotice('送禮功能'));
    giftUploadInput.addEventListener('change', handleGiftSelection);
    removeGiftBtn.addEventListener('click', removeGift);

    clearChatBtn.addEventListener('click', async () => {
        if (currentConversationKey && currentPersona) {
            const conversationKey = currentConversationKey;
            if (confirm(`確定要清除 ${currentRoom?.title || currentPersona.name} 的對話記錄嗎？`)) {
                if (characterPhotoRequestController) characterPhotoRequestController.abort();
                const history = memoryManager.getChatHistory(conversationKey);
                await Promise.all([
                    deleteCharacterPhotoAssetsForHistory(history, conversationKey),
                    deleteChatAttachmentAssetsForHistory(history, conversationKey),
                ]);
                memoryManager.clearChatHistory(conversationKey);
                startChat(conversationKey);
            }
        }
        moreOptionsMenu.classList.add('hidden');
    });
    
    suggestionButton.addEventListener('click', () => showDisabledFeatureNotice('建議功能'));
    newSceneBtn.addEventListener('click', startNewScene);
    surpriseEventBtn.addEventListener('click', () => {
        openSurpriseEventOptions();
    });
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
        openRoomMemory();
        moreOptionsMenu.classList.add('hidden');
    });
    personaSettingsBtn.addEventListener('click', () => {
        personaSettingsRoomTarget = currentRoom && activeRoomMemberId
            ? { roomId: currentRoom.id, memberId: activeRoomMemberId }
            : null;
        openPersonaSettings();
        moreOptionsMenu.classList.add('hidden');
    });
    changeAvatarBtn.addEventListener('click', () => {
        if (currentRoom) requestRoomAvatarUpload(currentRoom.id);
        else if (currentPersonaKey) requestPersonaAvatarUpload(currentPersonaKey);
        moreOptionsMenu.classList.add('hidden');
    });
    personaSettingsAvatarBtn.addEventListener('click', () => {
        if (personaSettingsRoomTarget) {
            requestRoomMemberAvatarUpload(personaSettingsRoomTarget.roomId, personaSettingsRoomTarget.memberId);
        } else if (currentPersonaKey) requestPersonaAvatarUpload(currentPersonaKey);
    });
    roomInfoBtn.addEventListener('click', openRoomInfo);
    dmRoomMemberBtn.addEventListener('click', () => openParticipantAction('dm'));
    inviteCharacterBtn.addEventListener('click', () => openParticipantAction('invite'));
    leaveRoomMemberBtn.addEventListener('click', () => openParticipantAction('leave'));
    closeRoomInfoBtn.addEventListener('click', closeRoomInfo);
    addRoomMemberBtn.addEventListener('click', () => {
        if (currentRoom) openCreateGroup(currentRoom.id);
    });
    openRoomMemoryBtn.addEventListener('click', openRoomMemory);
    exportRoomBtn.addEventListener('click', () => {
        if (currentConversationKey && currentRoom) {
            void fileManager.saveCurrentChat(currentConversationKey, currentRoom.title);
        }
    });
    closeRoomMemoryBtn.addEventListener('click', closeRoomMemory);
    memorySoulTab.addEventListener('click', () => {
        selectedMemoryType = 'soul';
        renderRoomMemory();
    });
    memoryEventTab.addEventListener('click', () => {
        selectedMemoryType = 'memory';
        renderRoomMemory();
    });
    personaPublicIdentityCheckbox.addEventListener('change', renderPersonaPublicIdentitySettings);
    recheckPublicIdentityBtn.addEventListener('click', () => {
        if (!currentPersona || !personaPublicIdentityCheckbox.checked) return;
        recheckPublicIdentityBtn.disabled = true;
        void resolvePublicIdentityForPersonaSettings().finally(() => {
            recheckPublicIdentityBtn.disabled = false;
        });
    });
    closePublicIdentityModalBtn.addEventListener('click', () => closePublicIdentityResolution());
    cancelPublicIdentityBtn.addEventListener('click', () => closePublicIdentityResolution());
    searchPublicIdentityBtn.addEventListener('click', () => {
        void searchForPublicIdentity(publicIdentityQuery.value);
    });
    publicIdentityQuery.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        void searchForPublicIdentity(publicIdentityQuery.value);
    });
    confirmPublicIdentityBtn.addEventListener('click', () => {
        void confirmSelectedPublicIdentity();
    });
    closeMemoryModal.addEventListener('click', closeMemoryEditor);
    cancelMemoryEdit.addEventListener('click', closeMemoryEditor);
    saveMemoryEdit.addEventListener('click', saveMemory);
    closePersonaSettingsModal.addEventListener('click', closePersonaSettings);
    cancelPersonaSettingsBtn.addEventListener('click', closePersonaSettings);
    savePersonaSettingsBtn.addEventListener('click', () => {
        void savePersonaSettings();
    });

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
        localStorage.setItem(IMAGE_SEED_LOCK_STORAGE_KEY, String(photoViewerSeedLock.checked));
        imageSeedLock.checked = photoViewerSeedLock.checked;
        if (photoViewerSeedLock.checked) {
            const seed = normalizeImageSeed(photoViewerSeed.value)
                ?? setSeedInputValue(photoViewerSeed, createRandomImageSeed());
            localStorage.setItem(IMAGE_SEED_STORAGE_KEY, String(seed));
            setSeedInputValue(imageSeed, seed);
        }
    });
    photoViewerSeed.addEventListener('change', () => {
        const seed = normalizeImageSeed(photoViewerSeed.value);
        if (seed === undefined) return;
        setSeedInputValue(photoViewerSeed, seed);
        localStorage.setItem(IMAGE_SEED_STORAGE_KEY, String(seed));
        if (photoViewerSeedLock.checked) setSeedInputValue(imageSeed, seed);
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

    // More options menu toggle
    moreOptionsBtn.addEventListener('click', () => {
        moreOptionsMenu.classList.toggle('hidden');
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
        if (!suggestionButton.contains(e.target as Node) && !suggestionContainer.contains(e.target as Node)) {
            hideSuggestionContainer();
        }
    });

    // Save before exit modal
    saveAndExitBtn.addEventListener('click', () => {
        if (currentConversationKey && currentPersona) {
            fileManager.saveCurrentChat(currentConversationKey, currentRoom?.title || currentPersona.name);
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
    conversationSearchInput.value = '';
    window.addEventListener('pageshow', () => {
        if (/^-\d{7,}$/u.test(conversationSearchInput.value.trim())) {
            conversationSearchInput.value = '';
            renderPersonaList();
        }
    });
    initializeImageSeedControls();
    try {
        await memoryManager.restorePrivateAvatars();
    } catch (error) {
        console.error('Failed to restore private avatars:', error);
    }
    renderPersonaList();
    setupEventListeners();
    cloudBackupManager.startAutoBackup();
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
    if (unlocked) {
        await supabaseCloudSyncManager.start();
        if (pendingVideoJob) void resumePendingVideoJob('auto');
    }
};

void init();


