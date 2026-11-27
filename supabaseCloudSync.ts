import { createClient, RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import { createCloudRecoveryFetch } from './cloudRecoveryFetch.js';
import {
    deletePersonaAvatar,
    getPersonaAvatarAsset,
    listPersonaAvatarAssets,
    savePersonaAvatarBlob,
} from './avatarStore.js';
import type { StoredPersonaAvatar } from './avatarStore.js';
import {
    deleteChatAttachment,
    getChatAttachment,
    listChatAttachments,
    saveChatAttachment,
} from './chatMediaStore.js';
import type { StoredChatAttachment } from './chatMediaStore.js';
import { filterRemoteStateEntities, findLocallyDeletedIndexedKeys, mergeChatHistoryMaps } from './cloudMessageMerge.js';
import { readCloudSyncIndex, writeCloudSyncIndex, writeCloudSyncIndexesAtomically } from './cloudSyncIndexStore.js';
import {mergeAtomicSnapshots,mergeBaseIndex,readMergeBase,normalizeMergeSnapshot,equalMergeSnapshot,preserveForeignCloudSettings,type CloudMergeSnapshot} from './atomicCloudMerge.js';
import {stageAtomicMedia} from './atomicCloudMedia.js';
import {planAtomicDelta,readAtomicBaseline,saveAtomicBaseline,pendingAtomicJournal,prepareAtomicJournal,completeAtomicJournal,retireStaleAtomicJournal,type AtomicJournal,type MergeInstallation} from './atomicCloudDelta.js';
import { isLocalCloudChangeBatchActive, LOCAL_CLOUD_CHANGE_EVENT, LocalCloudChangeScope } from './cloudSyncEvents.js';
import { isPersistedAppSettingKey, PERSISTED_APP_SETTING_KEYS, mergeStructuredAppSetting } from './appSettings.js';
import {
    buildResearchCloudProjection,
    listPendingResearchTurnRecords,
    markResearchTurnsSynced,
    RESEARCH_CAPTURE_PENDING_EVENT,
} from './researchCapture.js';
import { shouldRecoverPendingCloudConflict, shouldSkipRedundantCloudPull } from './cloudSyncPullPolicy.js';
import { isCloudStateRevisionConflict, normalizeCloudStateRevision } from './cloudStateRevision.js';
import { ChatMessage, MemoryManager, Persona } from './managers.js';
import type { MemoryImportSnapshot } from './managers.js';
import {
    deleteCharacterPhotoAsset,
    getCharacterPhotoAsset,
    listCharacterPhotoAssets,
    saveCharacterPhotoAsset,
} from './photoStore.js';
import type { CharacterPhotoAsset } from './photoStore.js';
import { readStudioImageMetadata,readStudioVideoMetadata } from './studioMediaStore.js';
import { ChatRoom, resolveRoomAvatarStorageKey, RoomManager } from './roomManager.js';
import type { RoomImportSnapshot } from './roomManager.js';

const OWNER_EMAIL = 'gentle3f@gmail.com';
const STORAGE_BUCKET = 'wetapp-private';
const DEVICE_ID_KEY = 'wetappCloudDeviceIdV1';
const MESSAGE_INDEX_KEY = 'wetappCloudMessageIndexV1';
const CONVERSATION_INDEX_KEY = 'wetappCloudConversationIndexV1';
const MEDIA_INDEX_KEY = 'wetappCloudMediaIndexV1';
const STATE_ENTITY_INDEX_KEY = 'wetappCloudStateEntityIndexV1';
const PENDING_KEY = 'wetappCloudPendingV1';
const LAST_SYNC_KEY = 'wetappCloudLastSyncAtV1';
const SYNCED_USER_ID_KEY = 'wetappCloudSyncedUserIdV1';
const PULL_RECOVERY_KEY = 'wetappCloudPullRecoveryV1';
const SAFE_MERGE_VERSION_KEY = 'wetappCloudSafeMergeV1';
const CLOUD_RETRY_BASE_DELAY_MS = 1_500;
const CLOUD_RETRY_MAX_DELAY_MS = 30_000;
const RESEARCH_CLOUD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const RESEARCH_CLOUD_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RESEARCH_CLOUD_LAST_PRUNE_KEY = 'aigf4ResearchCloudLastPruneAtV1';
import {ATOMIC_CLOUD_PREVIEW,ATOMIC_CLOUD_PREVIEW_URL,ATOMIC_CLOUD_PREVIEW_KEY} from './atomicCloudPreview.js';
const SUPABASE_URL = ATOMIC_CLOUD_PREVIEW?ATOMIC_CLOUD_PREVIEW_URL:String(import.meta.env?.VITE_SUPABASE_URL || '').trim();
const SUPABASE_KEY = ATOMIC_CLOUD_PREVIEW?ATOMIC_CLOUD_PREVIEW_KEY:String(
    import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env?.VITE_SUPABASE_ANON_KEY
    || '',
).trim();

class CloudSessionSupersededError extends Error {
    constructor() {
        super('Cloud session changed while an operation was in flight.');
        this.name = 'CloudSessionSupersededError';
    }
}

const isMissingResearchTableError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const code = 'code' in error && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : '';
    const message = 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';
    return code === '42P01'
        || code === 'PGRST205'
        || /wetapp_research_turns/iu.test(message) && /does not exist|schema cache|could not find/iu.test(message);
};

const authErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) return error.message;
    if (
        error
        && typeof error === 'object'
        && 'message' in error
        && typeof (error as { message?: unknown }).message === 'string'
    ) {
        return (error as { message: string }).message;
    }
    return String(error || fallback);
};

export type SupabaseCloudSyncPhase =
    | 'unconfigured'
    | 'signed_out'
    | 'sending_link'
    | 'connecting'
    | 'pulling'
    | 'pushing'
    | 'synced'
    | 'offline'
    | 'error';

export interface SupabaseCloudSyncState {
    phase: SupabaseCloudSyncPhase;
    configured: boolean;
    email?: string;
    detail: string;
    lastSyncAt?: number;
    progress?: number;
}

interface CloudSyncCallbacks {
    onStateChange: (state: SupabaseCloudSyncState) => void;
    onRemoteApplied: () => void;
}

interface CloudMessageRow {
    user_id: string;
    conversation_key: string;
    message_id: string;
    position: number;
    role: ChatMessage['role'];
    speaker_id: string | null;
    content: ChatMessage['content'];
    created_at_ms: number;
    source_device_id: string;
}

interface CloudConversationRow {
    user_id: string;
    conversation_key: string;
    title: string;
    kind: 'persona' | 'room' | 'assistant' | 'unknown';
    message_count: number;
    last_message_at_ms: number | null;
    source_device_id: string;
}

interface CloudMediaRow {
    user_id: string;
    asset_id: string;
    conversation_key: string | null;
    kind: 'persona_avatar' | 'room_avatar' | 'character_photo' | 'attachment';
    storage_path: string;
    mime_type: string;
    byte_size: number;
    signature: string;
    metadata: Record<string, unknown>;
    source_device_id: string;
    created_at_ms: number;
}

interface LocalCloudMedia extends CloudMediaRow {
    blob: Blob;
}

interface CloudMessagePushPlan {
    hashes: Record<string, string>;
    conversationIndex: Record<string, string>;
    removedByConversation: Array<[string, string[]]>;
    removedConversations: string[];
}

interface CloudMediaPushPlan {
    nextIndex: Record<string, string>;
    removedIds: string[];
}

interface CloudStatePayload {
    schemaVersion: 1;
    customPersonas: Record<string, Persona>;
    diaries: ReturnType<MemoryManager['getAllDiaryEntries']>;
    interests: ReturnType<MemoryManager['getAllInterests']>;
    rooms: ReturnType<RoomManager['exportData']>;
    appSettings: Record<string, string>;
}

interface CloudPullTransactionSnapshot {
    memory: MemoryImportSnapshot;
    rooms: RoomImportSnapshot;
    appSettings: Record<string, string | null>;
    avatarAssets: Map<string, StoredPersonaAvatar | null>;
    photoAssets: Map<string, CharacterPhotoAsset | null>;
    attachmentAssets: Map<string, StoredChatAttachment | null>;
    indexes: {
        messages: Record<string, string>;
        conversations: Record<string, string>;
        media: Record<string, string>;
        stateEntities: Record<string, string>;
    };
}

const clone = <T>(value: T): T => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

const hashText = (value: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
};

const safeAssetPath = (assetId: string) => {
    const readable = assetId.replace(/[^a-z0-9._-]+/giu, '_').slice(0, 72) || 'asset';
    return `${readable}-${hashText(assetId)}`;
};

const blobToDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('無法還原雲端頭像。'));
    reader.readAsDataURL(blob);
});

const blobsMatch = async (left: Blob, right: Blob) => {
    if (left.size !== right.size || left.type !== right.type) return false;
    if (!crypto.subtle) return false;
    const [leftHash, rightHash] = await Promise.all([
        crypto.subtle.digest('SHA-256', await left.arrayBuffer()),
        crypto.subtle.digest('SHA-256', await right.arrayBuffer()),
    ]);
    const leftBytes = new Uint8Array(leftHash);
    const rightBytes = new Uint8Array(rightHash);
    return leftBytes.every((value, index) => value === rightBytes[index]);
};

const batches = <T>(items: T[], size: number) => {
    const result: T[][] = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
};

const isLocalImageUrl = (value: string | null | undefined) => (
    Boolean(value && (value.startsWith('data:image/') || value.startsWith('blob:')))
);

export class SupabaseCloudSyncManager {
    private readonly memoryManager: MemoryManager;
    private readonly roomManager: RoomManager;
    private readonly callbacks: CloudSyncCallbacks;
    private readonly client: SupabaseClient | null;
    private readonly deviceId: string;
    private session: Session | null = null;
    private channel: RealtimeChannel | null = null;
    private state: SupabaseCloudSyncState;
    private initializedUserId = '';
    private applyingRemote = false;
    private pushing = false;
    private pulling = false;
    private pullRecoveryRequired = localStorage.getItem(PULL_RECOVERY_KEY) === 'true';
    private pushTimer: number | null = null;
    private pullTimer: number | null = null;
    private researchPushTimer: number | null = null;
    private researchPushing = false;
    private researchCloudUnavailable = false;
    private cloudRetryAttempt = 0;
    private authRetryAttempt = 0;
    private authRetryTimer: number | null = null;
    private authStateChangeEpoch = 0;
    private authRefreshEpoch = 0;
    private sessionGeneration = 0;
    private realtimeRetryAttempt = 0;
    private realtimeRetryTimer: number | null = null;
    private lastObservedCloudStateRevision: number | null = null;
    private remoteStateChangeEpoch = 0;
    private reconciledRemoteStateChangeEpoch = 0;
    private started = false;
    private atomicLocalEpoch=0;

    constructor(memoryManager: MemoryManager, roomManager: RoomManager, callbacks: CloudSyncCallbacks, private readonly recoveryOnly=false, private readonly canRestore=()=>true, private readonly atomicDeltaMode=false) {
        this.memoryManager = memoryManager;
        this.roomManager = roomManager;
        this.callbacks = callbacks;
        this.deviceId = this.getOrCreateDeviceId();
        this.client = SUPABASE_URL && SUPABASE_KEY
            ? createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: !this.recoveryOnly,
                    ...(this.recoveryOnly?{storageKey:'aigf-preview-cloud-recovery-auth-v1'}:{}),
                },
                realtime: { params: { eventsPerSecond: 4 } },
                ...(this.recoveryOnly?{global:{fetch:createCloudRecoveryFetch(SUPABASE_URL)}}:{}),
            })
            : null;
        this.state = {
            phase: this.client ? 'signed_out' : 'unconfigured',
            configured: Boolean(this.client),
            detail: this.client ? (ATOMIC_CLOUD_PREVIEW?'V3 獨立測試雲端：請使用測試帳戶密碼。':'登入後會自動同步所有對話與私人媒體。') : 'Supabase 尚未設定。',
            lastSyncAt: Number(localStorage.getItem(LAST_SYNC_KEY) || 0) || undefined,
        };
    }

    getState() {
        return { ...this.state };
    }

    getOwnerEmail() {
        return OWNER_EMAIL;
    }

    async start() {
        if (this.started || !this.client) {
            this.emitState();
            return;
        }
        this.started = true;
        window.addEventListener(LOCAL_CLOUD_CHANGE_EVENT, this.handleLocalChange as EventListener);
        window.addEventListener(RESEARCH_CAPTURE_PENDING_EVENT, this.handleResearchPending as EventListener);
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        this.client.auth.onAuthStateChange((_event, session) => {
            const authStateChangeEpoch = ++this.authStateChangeEpoch;
            this.clearAuthRetryState();
            window.setTimeout(() => {
                if (this.authStateChangeEpoch !== authStateChangeEpoch) return;
                void this.applySession(session).catch(error => {
                    if (this.authStateChangeEpoch !== authStateChangeEpoch) return;
                    this.handleSyncError(error, '雲端登入狀態更新失敗');
                    this.scheduleAuthSessionRetry();
                });
            }, 0);
        });

        this.setState('connecting', '正在檢查雲端登入…');
        await this.refreshAuthSession();
    }

    isRecoveryOnly(){return this.recoveryOnly;}
    async sendMagicLink(email: string) {
        if(this.recoveryOnly)throw Error('只讀還原模式只接受現有雲端密碼登入。');
        if (!this.client) throw new Error('Supabase 尚未設定。');
        const normalized = email.trim().toLocaleLowerCase();
        if (normalized !== OWNER_EMAIL) throw new Error('這個雲端空間只接受已設定的擁有人帳戶。');
        const authStateChangeEpoch = this.authStateChangeEpoch;
        const sessionGeneration = this.sessionGeneration;
        const magicLinkTargetIsCurrent = () => (
            this.authStateChangeEpoch === authStateChangeEpoch
            && this.sessionGeneration === sessionGeneration
        );
        this.setState('sending_link', '正在寄出安全登入連結…');
        try {
            const { error } = await this.client.auth.signInWithOtp({
                email: normalized,
                options: {
                    emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
                    shouldCreateUser: true,
                },
            });
            if (error) {
                const message = authErrorMessage(error, '未能傳送登入連結。');
                if (!magicLinkTargetIsCurrent()) throw new Error(message);
                this.setState('error', message);
                throw new Error(message);
            }
            if (!magicLinkTargetIsCurrent()) return;
            this.setState('signed_out', `登入連結已寄到 ${OWNER_EMAIL}，請在同一裝置開啟。`);
        } catch (error) {
            if (!magicLinkTargetIsCurrent()) throw error;
            if (this.state.phase === 'error') throw error;
            const message = authErrorMessage(error, '未能傳送登入連結。');
            this.setState('error', message);
            throw new Error(message);
        }
    }

    async signInWithPassword(email: string, password: string) {
        if (!this.client) throw new Error('Supabase 尚未設定。');
        const normalized = email.trim().toLocaleLowerCase();
        if (normalized !== OWNER_EMAIL) throw new Error('這個雲端空間只接受已設定的擁有人帳戶。');
        if (!password) throw new Error('請輸入雲端密碼。');
        const authStateChangeEpoch = this.authStateChangeEpoch;
        const sessionGeneration = this.sessionGeneration;
        const loginTargetIsCurrent = () => (
            this.authStateChangeEpoch === authStateChangeEpoch
            && this.sessionGeneration === sessionGeneration
        );
        this.setState('connecting', '正在以密碼登入…');
        try {
            const { data, error } = await this.client.auth.signInWithPassword({
                email: normalized,
                password,
            });
            if (error) {
                const rawMessage = authErrorMessage(error, '密碼登入失敗。');
                const message = /invalid login credentials/iu.test(rawMessage)
                    ? '電郵或雲端密碼不正確。'
                    : rawMessage;
                if (!loginTargetIsCurrent()) throw new Error(message);
                this.setState('signed_out', message);
                throw new Error(message);
            }
            if (!loginTargetIsCurrent()) return;
            await this.applySession(data.session);
        } catch (error) {
            if (!loginTargetIsCurrent()) throw error;
            if (this.state.phase === 'signed_out') throw error;
            const message = authErrorMessage(error, '密碼登入失敗。');
            this.setState('error', message);
            throw new Error(message);
        }
    }

    async setPassword(password: string) {
        if(this.recoveryOnly)throw Error('CLOUD_RECOVERY_READ_ONLY');
        if (!this.client || !this.session) throw new Error('請先登入 Supabase 雲端。');
        if (password.length < 8) throw new Error('雲端密碼至少需要 8 個字元。');
        const sessionUserId = this.session.user.id;
        const sessionGeneration = this.sessionGeneration;
        this.setState('connecting', '正在設定雲端密碼…');
        try {
            const { error } = await this.client.auth.updateUser({ password });
            if (!this.isCurrentSession(sessionUserId, sessionGeneration)) {
                if (error) throw new Error(authErrorMessage(error, '未能設定雲端密碼。'));
                return;
            }
            if (error) {
                const message = authErrorMessage(error, '未能設定雲端密碼。');
                this.setState('error', message);
                throw new Error(message);
            }
            this.setState('synced', '雲端密碼已設定；新裝置可直接用密碼登入。', {
                lastSyncAt: this.state.lastSyncAt,
                progress: 100,
            });
        } catch (error) {
            if (!this.isCurrentSession(sessionUserId, sessionGeneration)) throw error;
            if (this.state.phase === 'error') throw error;
            const message = authErrorMessage(error, '未能設定雲端密碼。');
            this.setState('error', message);
            throw new Error(message);
        }
    }

    async signOut() {
        if(this.recoveryOnly)throw Error('只讀預覽請關閉並清除該預覽網站資料；不會登出正式裝置。');
        if (!this.client) return;
        const sessionUserId = this.session?.user.id || '';
        const sessionGeneration = this.sessionGeneration;
        const signOutTargetIsCurrent = () => (
            this.sessionGeneration === sessionGeneration
            && (sessionUserId ? this.session?.user.id === sessionUserId : this.session === null)
        );
        try {
            const { error } = await this.client.auth.signOut();
            if (!signOutTargetIsCurrent()) {
                if (error) throw new Error(authErrorMessage(error, '登出失敗。'));
                return;
            }
            if (error) {
                const message = authErrorMessage(error, '登出失敗。');
                this.setState('error', message);
                throw new Error(message);
            }
        } catch (error) {
            if (!signOutTargetIsCurrent()) throw error;
            if (this.state.phase === 'error') throw error;
            const message = authErrorMessage(error, '登出失敗。');
            this.setState('error', message);
            throw new Error(message);
        }
        this.clearScheduledCloudWork();
        await this.stopRealtime();
        if (!signOutTargetIsCurrent()) return;
        this.replaceSession(null);
        this.initializedUserId = '';
        this.setState('signed_out', '已登出；本機資料仍完整保留。');
    }

    async syncNow() {
        if(this.recoveryOnly)throw Error('CLOUD_RECOVERY_READ_ONLY');
        if (!this.session) throw new Error('請先登入 Supabase 雲端。');
        localStorage.setItem(PENDING_KEY, 'true');
        const completed = await this.pushPendingChangesSafely();
        if (!completed) {
            throw new Error(
                this.state.phase === 'error' || this.state.phase === 'offline'
                    ? this.state.detail
                    : '同步尚未完成；本機變更已保留，系統會自動重試。',
            );
        }
    }

    // getChatHistory seeds an opening greeting even on a fresh device.
    // Only allow exact greeting-only histories, never actual chat or attachments.
    private hasRecoveryLocalChat(){
        return Object.entries(this.memoryManager.getAllChatHistories()).some(([key,rows])=>{
            if(!rows.length)return false;
            const persona=this.memoryManager.getPersona(key);
            const row=rows[0];
            return rows.length!==1||!persona||row.role!=='model'||!!row.speakerId||
                typeof row.content?.text!=='string'||row.content.text!==persona.greeting||
                Object.keys(row.content).some(k=>k!=='text');
        });
    }

    private recoveryConsentHistory:string|null=null;
    private recoveryHistoryAllowed(){
        return this.recoveryConsentHistory!==null
            ?this.recoveryConsentHistory===JSON.stringify(this.memoryManager.getAllChatHistories())
            :!this.hasRecoveryLocalChat();
    }

    async reloadFromCloud(allowReplaceSinglePreviewMessage=false) {
        if(this.recoveryOnly){
            if(!this.session)throw Error('請先登入私人雲端。');
            if(!this.canRestore())throw Error('CLOUD_RESTORE_BUSY：有未完成聊天任務，不能還原。');
            const localCount=Object.values(this.memoryManager.getAllChatHistories()).reduce((n,rows)=>n+rows.length,0);
            if(this.hasRecoveryLocalChat()&&!(allowReplaceSinglePreviewMessage&&localCount===1))throw Error('CLOUD_RESTORE_LOCAL_NOT_EMPTY：本機已有 '+localCount+' 則訊息；只限未有聊天紀錄的測試裝置。');
            if(this.pulling||this.pushing)throw Error('CLOUD_RESTORE_BUSY：已有同步操作。');
            if(isLocalCloudChangeBatchActive())throw Error('CLOUD_RESTORE_LOCAL_BATCH_ACTIVE：本機資料正在更新。');
            this.recoveryConsentHistory=JSON.stringify(this.memoryManager.getAllChatHistories());
            try{
                const completed=await this.pullCloudToLocal(true,false);
                if(!completed)throw Error(this.state.detail);
            }finally{this.recoveryConsentHistory=null;}
            return;
        }
        if (!this.session) throw new Error('請先登入 Supabase 雲端。');
        const completed = await this.recoverCloudSafely();
        if (!completed) {
            throw new Error(
                this.state.phase === 'error' || this.state.phase === 'offline'
                    ? this.state.detail
                    : '重新載入尚未完成；本機資料仍保留，系統會自動重試。',
            );
        }
    }

    private clearAuthRetryState() {
        if (this.authRetryTimer !== null) {
            window.clearTimeout(this.authRetryTimer);
            this.authRetryTimer = null;
        }
        this.authRetryAttempt = 0;
    }

    private scheduleAuthSessionRetry(delayOverride?: number) {
        if (
            !this.started
            || !this.client
            || !navigator.onLine
            || this.authRetryTimer !== null
        ) return;

        const delay = delayOverride ?? Math.min(
            CLOUD_RETRY_MAX_DELAY_MS,
            CLOUD_RETRY_BASE_DELAY_MS * (2 ** Math.min(this.authRetryAttempt, 5)),
        );
        if (delayOverride === undefined) this.authRetryAttempt += 1;

        this.authRetryTimer = window.setTimeout(() => {
            this.authRetryTimer = null;
            void this.refreshAuthSession();
        }, delay);
    }

    private async refreshAuthSession() {
        if (!this.client) return false;
        const observedAuthStateChangeEpoch = this.authStateChangeEpoch;
        const refreshEpoch = ++this.authRefreshEpoch;
        const isSuperseded = () => (
            this.authStateChangeEpoch !== observedAuthStateChangeEpoch
            || this.authRefreshEpoch !== refreshEpoch
        );
        try {
            const { data, error } = await this.client.auth.getSession();
            if (isSuperseded()) return true;
            if (error) {
                const message = authErrorMessage(error, '檢查雲端登入失敗。');
                this.setState(
                    navigator.onLine ? 'error' : 'offline',
                    `檢查雲端登入失敗：${message}`,
                );
                this.scheduleAuthSessionRetry();
                return false;
            }

            this.clearAuthRetryState();
            await this.applySession(data.session);
            return true;
        } catch (error) {
            if (isSuperseded()) return true;
            const message = authErrorMessage(error, '檢查雲端登入失敗。');
            this.setState(
                navigator.onLine ? 'error' : 'offline',
                `檢查雲端登入失敗：${message}`,
            );
            this.scheduleAuthSessionRetry();
            return false;
        }
    }

    private clearScheduledCloudWork() {
        this.clearAuthRetryState();
        if (this.pushTimer !== null) {
            window.clearTimeout(this.pushTimer);
            this.pushTimer = null;
        }
        if (this.pullTimer !== null) {
            window.clearTimeout(this.pullTimer);
            this.pullTimer = null;
        }
        if (this.researchPushTimer !== null) {
            window.clearTimeout(this.researchPushTimer);
            this.researchPushTimer = null;
        }
        this.cloudRetryAttempt = 0;
    }

    private readonly handleLocalChange = (event: CustomEvent<{ scope?: LocalCloudChangeScope }>) => {
        if (this.applyingRemote) return;
        if(this.atomicDeltaMode)this.atomicLocalEpoch++;
        if(this.pushing&&!this.atomicDeltaMode)return;
        localStorage.setItem(PENDING_KEY, 'true');
        if (!this.session || !this.initializedUserId || this.pullRecoveryRequired) return;
        this.schedulePush(event.detail?.scope === 'media' ? 400 : 1200);
    };

    private readonly handleResearchPending = () => {
        if (!this.session || !this.initializedUserId || !navigator.onLine) return;
        this.scheduleResearchPush(500);
    };

    private readonly handleOnline = () => {
        if (!this.session) {
            this.scheduleAuthSessionRetry(0);
            return;
        }
        if (this.pullTimer !== null) {
            window.clearTimeout(this.pullTimer);
            this.pullTimer = null;
        }
        this.cloudRetryAttempt = 0;
        this.realtimeRetryAttempt = 0;
        this.scheduleRealtimeRestart();
        this.scheduleResearchPush(250);
        if (localStorage.getItem(PENDING_KEY) === 'true') {
            this.setPullRecoveryRequired(true);
            this.schedulePull(250);
        } else if (this.pullRecoveryRequired) {
            this.schedulePull(250);
        } else {
            this.schedulePull(500);
        }
    };

    private readonly handleOffline = () => {
        if (this.authRetryTimer !== null) {
            window.clearTimeout(this.authRetryTimer);
            this.authRetryTimer = null;
        }
        if (this.pullTimer !== null) {
            window.clearTimeout(this.pullTimer);
            this.pullTimer = null;
        }
        if (this.realtimeRetryTimer !== null) {
            window.clearTimeout(this.realtimeRetryTimer);
            this.realtimeRetryTimer = null;
        }
        if (this.session) this.setState('offline', '目前離線；變更會保留在本機，連線後自動補傳。');
    };

    private readonly handleVisibilityChange = () => {
        if (!this.session) {
            if (document.visibilityState === 'visible') this.scheduleAuthSessionRetry(0);
            return;
        }
        if (document.visibilityState === 'hidden') {
            if (localStorage.getItem(PENDING_KEY) === 'true') this.schedulePush(0);
            this.scheduleResearchPush(0);
        } else if (document.visibilityState === 'visible') {
            this.scheduleResearchPush(250);
            this.schedulePull(500);
        }
    };

    private getOrCreateDeviceId() {
        const existing = localStorage.getItem(DEVICE_ID_KEY);
        if (existing) return existing;
        const created = crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(DEVICE_ID_KEY, created);
        return created;
    }

    private setState(
        phase: SupabaseCloudSyncPhase,
        detail: string,
        extras: Partial<SupabaseCloudSyncState> = {},
    ) {
        this.state = {
            ...this.state,
            ...extras,
            phase,
            detail,
            configured: Boolean(this.client),
            email: this.session?.user.email,
        };
        this.emitState();
    }

    private emitState() {
        this.callbacks.onStateChange({ ...this.state });
    }

    private replaceSession(session: Session | null) {
        const previousUserId = this.session?.user.id || '';
        const nextUserId = session?.user.id || '';
        if (previousUserId !== nextUserId) this.sessionGeneration += 1;
        this.session = session;
        return this.sessionGeneration;
    }

    private isCurrentSession(userId: string, generation: number) {
        return this.session?.user.id === userId
            && this.sessionGeneration === generation;
    }

    private async applySession(session: Session | null) {
        const sessionGeneration = this.replaceSession(session);
        if (!session) {
            this.clearScheduledCloudWork();
            this.initializedUserId = '';
            await this.stopRealtime();
            if (this.session !== null || this.sessionGeneration !== sessionGeneration) return;
            this.setState('signed_out', '登入後會自動同步所有對話與私人媒體。');
            return;
        }
        if (session.user.email?.toLocaleLowerCase() !== OWNER_EMAIL) {
            const sessionUserId = session.user.id;
            this.clearScheduledCloudWork();
            await this.stopRealtime();
            if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
            let signOutError: unknown = null;
            try {
                const result = await this.client?.auth.signOut();
                signOutError = result?.error || null;
            } catch (error) {
                signOutError = error;
            }
            if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
            this.replaceSession(null);
            this.initializedUserId = '';
            this.setState(
                'error',
                signOutError
                    ? `此帳戶沒有 Wetapp 雲端資料權限，而且自動登出失敗：${authErrorMessage(signOutError, '未知錯誤')}`
                    : '此帳戶沒有 Wetapp 雲端資料權限。',
            );
            return;
        }
        const sessionUserId = session.user.id;
        if (this.initializedUserId === sessionUserId) return;
        this.clearScheduledCloudWork();
        await this.stopRealtime();
        if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
        this.initializedUserId = sessionUserId;
        if(this.recoveryOnly){this.setState('synced','已登入只讀雲端；請手動還原至空白測試裝置。不會上傳。');return;}
        this.setState('connecting', '正在連接私人雲端空間…');
        await this.initialSync(sessionUserId, sessionGeneration);
        if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
        this.scheduleResearchPush(0);
        try {
            await this.startRealtime();
        } catch (error) {
            if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
            this.handleSyncError(error, '即時更新連線失敗');
            this.scheduleRealtimeRestart();
        }
    }

    private async initialSync(
        sessionUserId: string,
        sessionGeneration = this.sessionGeneration,
    ) {
        if (!this.client || !this.isCurrentSession(sessionUserId, sessionGeneration)) return;
        if(this.atomicDeltaMode){
            if(await pendingAtomicJournal(sessionUserId))await this.pushAtomicDelta();
            else if(!await readAtomicBaseline(sessionUserId))await this.bootstrapAtomicBaseline();
            else if(localStorage.getItem(PENDING_KEY)==='true')await this.pushAtomicDelta();
            else await this.pullCloudToLocal(true,false);
            return;
        }
        try {
            const [{ data: remoteState, error: stateError }, { count, error: countError }] = await Promise.all([
                this.client.from('wetapp_state').select('revision,updated_at,source_device_id').maybeSingle(),
                this.client.from('wetapp_messages').select('message_id', { count: 'exact', head: true }),
            ]);
            if (stateError) throw stateError;
            if (countError) throw countError;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            this.lastObservedCloudStateRevision = normalizeCloudStateRevision(remoteState?.revision);
            const cloudIsEmpty = !remoteState && !count;
            const deviceHasSynced = localStorage.getItem(SYNCED_USER_ID_KEY) === sessionUserId
                || remoteState?.source_device_id === this.deviceId;
            const hasPendingChanges = localStorage.getItem(PENDING_KEY) === 'true';
            const safeMergeRequired = localStorage.getItem(SAFE_MERGE_VERSION_KEY) !== '2';
            const pendingCloudConflict = shouldRecoverPendingCloudConflict({
                deviceHasSynced,
                hasPendingChanges,
                cloudStateExists: Boolean(remoteState),
                cloudSourceDeviceId: remoteState?.source_device_id,
                localDeviceId: this.deviceId,
            });
            if (deviceHasSynced && !hasPendingChanges) {
                await this.ensureStateEntityIndexBaseline();
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            }
            if (deviceHasSynced && (this.pullRecoveryRequired || safeMergeRequired || pendingCloudConflict)) {
                await this.recoverCloudSafely();
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            } else if (cloudIsEmpty || (deviceHasSynced && hasPendingChanges)) {
                localStorage.setItem(PENDING_KEY, 'true');
                await this.pushLocalToCloud(true, false, this.lastObservedCloudStateRevision ?? 0);
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            } else if (shouldSkipRedundantCloudPull({
                force: false,
                cloudSourceDeviceId: remoteState?.source_device_id,
                localDeviceId: this.deviceId,
                syncedUserId: localStorage.getItem(SYNCED_USER_ID_KEY),
                sessionUserId,
                hasPendingChanges,
            })) {
                this.setPullRecoveryRequired(false);
                this.markSynced('本機已是雲端最新版本，毋須重複下載。');
            } else {
                // An unknown device must accept the established cloud copy before it can upload.
                localStorage.removeItem(PENDING_KEY);
                await this.pullCloudToLocal();
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            }
        } catch (error) {
            if (error instanceof CloudSessionSupersededError) return;
            this.handleSyncError(error, '首次雲端同步失敗');
        }
    }

    private schedulePush(delay: number) {
        if(this.recoveryOnly)return;
        const sessionUserId = this.session?.user.id;
        const sessionGeneration = this.sessionGeneration;
        if (!sessionUserId) return;
        if (this.pushTimer !== null) window.clearTimeout(this.pushTimer);
        this.pushTimer = window.setTimeout(() => {
            this.pushTimer = null;
            if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
            void this.pushPendingChangesSafely();
        }, delay);
    }

    private scheduleResearchPush(delay: number) {
        if(this.recoveryOnly)return;
        const sessionUserId = this.session?.user.id;
        const sessionGeneration = this.sessionGeneration;
        if (!sessionUserId || this.researchCloudUnavailable) return;
        if (this.researchPushTimer !== null) window.clearTimeout(this.researchPushTimer);
        this.researchPushTimer = window.setTimeout(() => {
            this.researchPushTimer = null;
            if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
            void this.pushPendingResearchTurns();
        }, delay);
    }

    private async pruneResearchCloudRowsIfDue(
        sessionUserId: string,
        sessionGeneration: number,
    ) {
        if (!this.client) return;
        const now = Date.now();
        const lastPrunedAt = Number(localStorage.getItem(RESEARCH_CLOUD_LAST_PRUNE_KEY) || 0) || 0;
        if (now - lastPrunedAt < RESEARCH_CLOUD_PRUNE_INTERVAL_MS) return;
        try {
            const cutoff = now - RESEARCH_CLOUD_RETENTION_MS;
            const { error } = await this.client
                .from('wetapp_research_turns')
                .delete()
                .eq('user_id', sessionUserId)
                .lt('created_at_ms', cutoff);
            if (error) throw error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            localStorage.setItem(RESEARCH_CLOUD_LAST_PRUNE_KEY, String(now));
        } catch (error) {
            if (error instanceof CloudSessionSupersededError) return;
            console.warn('[aigf4 research retention]', {
                message: authErrorMessage(error, 'Research archive retention cleanup failed'),
            });
        }
    }

    private async pushPendingResearchTurns(): Promise<boolean> {
        if(this.recoveryOnly)return false;
        if (!this.client || !this.session || this.researchPushing || !navigator.onLine) return false;
        const sessionUserId = this.session.user.id;
        const sessionGeneration = this.sessionGeneration;
        this.researchPushing = true;
        try {
            await this.pruneResearchCloudRowsIfDue(sessionUserId, sessionGeneration);
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            for (let batchIndex = 0; batchIndex < 20; batchIndex += 1) {
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                const pending = await listPendingResearchTurnRecords(20);
                if (!pending.length) return true;
                const rows = pending.map(record => {
                    const projection = buildResearchCloudProjection(record);
                    return {
                        user_id: sessionUserId,
                        record_id: record.recordId,
                        schema_version: record.schemaVersion,
                        conversation_key: record.conversationKey,
                        request_id: record.requestId,
                        mode: record.mode,
                        created_at_ms: record.createdAtMs,
                        metadata: projection.metadata,
                        sample_payload: projection.samplePayload || null,
                        source_device_id: this.deviceId,
                    };
                });
                const { error } = await this.client
                    .from('wetapp_research_turns')
                    .upsert(rows, { onConflict: 'user_id,record_id' });
                if (error) throw error;
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                await markResearchTurnsSynced(
                    pending.map(record => ({
                        recordId: record.recordId,
                        updatedAtMs: record.updatedAtMs,
                    })),
                );
                if (pending.length < 20) return true;
            }
            this.scheduleResearchPush(100);
            return true;
        } catch (error) {
            if (error instanceof CloudSessionSupersededError) return false;
            if (isMissingResearchTableError(error)) {
                this.researchCloudUnavailable = true;
                console.info('[aigf4 research sync] cloud archive table unavailable; keeping research records local until the next app session.');
                return false;
            }
            console.warn('[aigf4 research sync]', {
                message: authErrorMessage(error, 'Research capture sync failed'),
            });
            if (this.isCurrentSession(sessionUserId, sessionGeneration) && navigator.onLine) {
                this.scheduleResearchPush(15_000);
            }
            return false;
        } finally {
            this.researchPushing = false;
        }
    }

    private schedulePull(delay: number) {
        if(this.recoveryOnly)return;
        const sessionUserId = this.session?.user.id;
        const sessionGeneration = this.sessionGeneration;
        if (!sessionUserId || this.pullTimer !== null) return;
        this.pullTimer = window.setTimeout(() => {
            this.pullTimer = null;
            if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
            if (this.pushing || this.pulling) {
                this.schedulePull(100);
                return;
            }
            if (this.pullRecoveryRequired) void this.recoverCloudSafely();
            else if (localStorage.getItem(PENDING_KEY) === 'true') void this.pushPendingChangesSafely();
            else void this.pullCloudToLocal();
        }, delay);
    }

    private scheduleCloudRetry() {
        if (!this.session || !navigator.onLine || this.pullTimer !== null) return;
        const exponent = Math.min(this.cloudRetryAttempt, 5);
        const delay = Math.min(
            CLOUD_RETRY_MAX_DELAY_MS,
            CLOUD_RETRY_BASE_DELAY_MS * (2 ** exponent),
        );
        this.cloudRetryAttempt += 1;
        this.schedulePull(delay);
    }

    private clearRealtimeRetryState() {
        if (this.realtimeRetryTimer !== null) {
            window.clearTimeout(this.realtimeRetryTimer);
            this.realtimeRetryTimer = null;
        }
        this.realtimeRetryAttempt = 0;
    }

    private scheduleRealtimeRestart() {
        if(this.recoveryOnly)return;
        const sessionUserId = this.session?.user.id;
        const sessionGeneration = this.sessionGeneration;
        if (
            !sessionUserId
            || !navigator.onLine
            || this.realtimeRetryTimer !== null
        ) return;

        const exponent = Math.min(this.realtimeRetryAttempt, 5);
        const delay = Math.min(
            CLOUD_RETRY_MAX_DELAY_MS,
            CLOUD_RETRY_BASE_DELAY_MS * (2 ** exponent),
        );
        this.realtimeRetryAttempt += 1;
        this.realtimeRetryTimer = window.setTimeout(() => {
            this.realtimeRetryTimer = null;
            if (!this.isCurrentSession(sessionUserId, sessionGeneration) || !navigator.onLine) return;
            void this.startRealtime().catch(error => {
                if (!this.isCurrentSession(sessionUserId, sessionGeneration)) return;
                this.handleSyncError(error, '即時更新重新連線失敗');
                this.scheduleRealtimeRestart();
            });
        }, delay);
    }

    private async readCloudStateHead(
        sessionUserId = this.session?.user.id || '',
        sessionGeneration = this.sessionGeneration,
    ) {
        if (!this.client) return { revision: 0, sourceDeviceId: '' };
        if (!sessionUserId || !this.isCurrentSession(sessionUserId, sessionGeneration)) {
            throw new CloudSessionSupersededError();
        }
        const { data, error } = await this.client
            .from('wetapp_state')
            .select('revision,source_device_id')
            .maybeSingle();
        if (error) throw error;
        this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        const revision = normalizeCloudStateRevision(data?.revision);
        this.lastObservedCloudStateRevision = revision;
        return {
            revision,
            sourceDeviceId: String(data?.source_device_id || ''),
        };
    }

    private async pushPendingChangesSafely(): Promise<boolean> {
        if(this.recoveryOnly)return false;
        if(this.atomicDeltaMode)return this.pushAtomicDelta();
        if (!this.client || !this.session || this.pushing || this.pulling) return false;
        const sessionUserId = this.session.user.id;
        const sessionGeneration = this.sessionGeneration;
        if (isLocalCloudChangeBatchActive()) {
            this.schedulePush(250);
            return false;
        }
        if (this.pullRecoveryRequired || localStorage.getItem(SAFE_MERGE_VERSION_KEY) !== '2') {
            return this.recoverCloudSafely();
        }
        if (localStorage.getItem(PENDING_KEY) !== 'true') return true;
        if (!navigator.onLine) {
            this.setState('offline', '目前離線；變更會保留在本機，連線後自動補傳。');
            return false;
        }

        try {
            const remoteState = await this.readCloudStateHead(sessionUserId, sessionGeneration);
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            const pendingCloudConflict = shouldRecoverPendingCloudConflict({
                deviceHasSynced: localStorage.getItem(SYNCED_USER_ID_KEY) === sessionUserId
                    || remoteState.sourceDeviceId === this.deviceId,
                hasPendingChanges: true,
                cloudStateExists: remoteState.revision > 0,
                cloudSourceDeviceId: remoteState.sourceDeviceId,
                localDeviceId: this.deviceId,
            });
            if (pendingCloudConflict) {
                return this.recoverCloudSafely();
            }
            return this.pushLocalToCloud(false, false, remoteState.revision);
        } catch (error) {
            if (error instanceof CloudSessionSupersededError) return false;
            this.setPullRecoveryRequired(true);
            this.handleSyncError(error, '檢查雲端衝突失敗');
            return false;
        }
    }

    private async recoverCloudSafely() {
        if(this.recoveryOnly)return false;
        if(this.atomicDeltaMode){
            if(!this.session)return false;
            if(await pendingAtomicJournal(this.session.user.id))return this.pushAtomicDelta();
            if(!await readAtomicBaseline(this.session.user.id))return this.bootstrapAtomicBaseline();
            if(localStorage.getItem(PENDING_KEY)==='true')return this.pushAtomicDelta();
            return this.pullCloudToLocal(true,false);
        }
        if (!this.client || !this.session || this.pushing || this.pulling) return false;
        const sessionUserId = this.session.user.id;
        const sessionGeneration = this.sessionGeneration;
        localStorage.setItem(PENDING_KEY, 'true');
        const pushed = await this.pushLocalToCloud(false, true, undefined, true);
        if (!pushed || !this.isCurrentSession(sessionUserId, sessionGeneration)) return false;
        const pulled = await this.pullCloudToLocal(true, true);
        if (!pulled || !this.isCurrentSession(sessionUserId, sessionGeneration)) return false;
        localStorage.setItem(SAFE_MERGE_VERSION_KEY, '2');
        localStorage.setItem(PENDING_KEY, 'true');
        return this.pushLocalToCloud(
            false,
            false,
            this.lastObservedCloudStateRevision ?? 0,
        );
    }

    private atomicMessageHashes(rows:CloudMergeSnapshot['messages']){
        return Object.fromEntries(rows.map(row=>[this.messageIndexKey(row),hashText(JSON.stringify({
            position:row.position,role:row.role,speaker_id:row.speaker_id,content:row.content,created_at_ms:Number(row.created_at_ms)
        }))]));
    }
    private async captureAtomicLocal(uid:string,reference?:object):Promise<CloudMergeSnapshot>{
        const captured=await this.buildStatePayload();
        const payload=reference?preserveForeignCloudSettings(captured,reference,isPersistedAppSettingKey):captured;
        const {conversations,messages}=this.collectLocalMessages(uid);
        return normalizeMergeSnapshot({conversations,messages,payload});
    }
    private async verifyAtomicMergeMedia(uid:string){
        const local=await this.collectLocalMedia(this.roomManager.exportData().rooms,uid),old=await readCloudSyncIndex(MEDIA_INDEX_KEY);
        if(JSON.stringify(Object.entries(Object.fromEntries(local.map(a=>[a.asset_id,a.signature]))).sort())!==JSON.stringify(Object.entries(old).sort()))throw Error('ATOMIC_MEDIA_CHANGE_PENDING');
    }
    private async installAtomicMerge(uid:string,generation:number,installation:MergeInstallation){
        if(!this.canRestore()||isLocalCloudChangeBatchActive())throw Error('ATOMIC_MERGE_INSTALL_BUSY');
        const epoch=this.atomicLocalEpoch,body=typeof document!=='undefined'?document.body:null,wasInert=body?.inert??false;
        if(body)body.inert=true;
        try{
            const current=await this.captureAtomicLocal(uid,installation.local.payload);
            await this.verifyAtomicMergeMedia(uid);
            this.assertCurrentSessionUser(uid,generation);
            if(this.atomicLocalEpoch!==epoch||!this.canRestore())throw Error('ATOMIC_MERGE_INSTALL_BUSY');
            if(equalMergeSnapshot(await this.captureAtomicLocal(uid,installation.merged.payload),installation.merged))return;
            if(!equalMergeSnapshot(current,installation.local))throw Error('ATOMIC_MERGE_INSTALL_LOCAL_CHANGED：本機新增變更已保留，合併尚未套用。');
            const snapshot=await this.createCloudPullTransactionSnapshot();
            this.assertCurrentSessionUser(uid,generation);
            if(this.atomicLocalEpoch!==epoch||!this.canRestore())throw Error('ATOMIC_MERGE_INSTALL_BUSY');
            this.applyingRemote=true;
            try{
                const rows=installation.merged.messages.map(r=>({...r,user_id:uid,source_device_id:this.deviceId})) as CloudMessageRow[];
                await this.applyRemoteData(installation.merged.payload as CloudStatePayload,rows,false,installation.merged.conversations);
                this.assertCurrentSessionUser(uid,generation);
                const installed=await this.captureAtomicLocal(uid,installation.merged.payload);
                await this.verifyAtomicMergeMedia(uid);
                if(!equalMergeSnapshot(installed,installation.merged))throw Error('ATOMIC_MERGE_INSTALL_VERIFY_FAILED');
            }catch(error){
                await this.rollbackCloudPullTransaction(snapshot);
                throw error;
            }finally{this.applyingRemote=false;}
        }finally{if(body)body.inert=wasInert;}
    }

    private async prepareAtomicConflict(uid:string,generation:number,baseRevision:number,remoteRevision:number,epoch:number):Promise<AtomicJournal|null>{
        if(!this.client||!this.canRestore())return null;
        const base=await readMergeBase(uid,baseRevision);if(!base)return null;
        const client=this.client;
        const [state,conversations,messages,mediaRows]=await Promise.all([
            client.from('wetapp_state').select('revision,payload').maybeSingle(),
            this.fetchAllRows<CloudConversationRow>('wetapp_conversations',[['conversation_key',true]]),
            this.fetchAllRows<CloudMessageRow>('wetapp_messages',[['conversation_key',true],['position',true],['message_id',true]]),
            this.fetchAllRows<CloudMediaRow>('wetapp_media',[['asset_id',true]]),
        ]);
        if(state.error||normalizeCloudStateRevision(state.data?.revision)!==remoteRevision||!state.data?.payload)throw Error('ATOMIC_CONFLICT_REVIEW_REQUIRED：雲端版本已改變。');
        const payload=await this.buildStatePayload(),localRows=this.collectLocalMessages(uid),localMedia=await this.collectLocalMedia(payload.rooms.rooms,uid);
        const oldMedia=await readCloudSyncIndex(MEDIA_INDEX_KEY);
        const signature=(rows:{asset_id:string;signature:string}[])=>JSON.stringify(Object.entries(Object.fromEntries(rows.map(r=>[r.asset_id,r.signature]))).sort());
        const baselineMedia=JSON.stringify(Object.entries(oldMedia).sort());
        if(signature(mediaRows)!==baselineMedia||signature(localMedia)!==baselineMedia)throw Error('ATOMIC_MEDIA_CHANGE_PENDING：媒體有變更，未合併。');
        const local=normalizeMergeSnapshot({conversations:localRows.conversations,messages:localRows.messages,payload:preserveForeignCloudSettings(payload,base.payload,isPersistedAppSettingKey)});
        const remote=normalizeMergeSnapshot({conversations,messages,payload:state.data.payload});
        const merged=normalizeMergeSnapshot(mergeAtomicSnapshots(base,local,remote));
        const head=await this.readCloudStateHead(uid,generation);
        this.assertCurrentSessionUser(uid,generation);
        if(head.revision!==remoteRevision||this.atomicLocalEpoch!==epoch||!this.canRestore())throw Error('ATOMIC_CONFLICT_REVIEW_REQUIRED：合併期間資料已改變。');
        const mergedPayload=merged.payload as CloudStatePayload;
        const hashes=this.atomicMessageHashes(merged.messages),remoteHashes=this.atomicMessageHashes(remote.messages);
        const delta=planAtomicDelta(merged.conversations,merged.messages,hashes,remoteHashes,Object.fromEntries(remote.conversations.map(c=>[c.conversation_key,'1'])));
        await writeCloudSyncIndexesAtomically({['wetappAtomicMergePlanV3:'+uid]:{baseRevision:String(baseRevision),remoteRevision:String(remoteRevision),local:JSON.stringify(local),remote:JSON.stringify(remote),merged:JSON.stringify(merged)}});
        return prepareAtomicJournal(uid,{expected_revision:remoteRevision,new_payload:mergedPayload,delta,device:this.deviceId},{
            [MESSAGE_INDEX_KEY]:hashes,[CONVERSATION_INDEX_KEY]:Object.fromEntries(merged.conversations.map(c=>[c.conversation_key,'1'])),[MEDIA_INDEX_KEY]:oldMedia,[STATE_ENTITY_INDEX_KEY]:this.stateEntityIndex(mergedPayload),...mergeBaseIndex(uid,remoteRevision+1,merged)
        },{local,merged});
    }

    // A fresh preview can have a pending flag from startup defaults before login.
    // Establish an actual remote baseline first, never upload against an unknown revision.
    private async bootstrapAtomicBaseline():Promise<boolean>{
        if(!this.client||!this.session||this.pulling||this.pushing||!this.canRestore())return false;
        const uid=this.session.user.id,generation=this.sessionGeneration;
        if(await pendingAtomicJournal(uid)||await readAtomicBaseline(uid))return false;
        const body=typeof document!=='undefined'?document.body:null,wasInert=body?.inert??false;
        if(body)body.inert=true;
        try{
            const epoch=this.atomicLocalEpoch;
            const hasRealChat=Object.entries(this.memoryManager.getAllChatHistories()).some(([key,rows])=>{
                if(!rows.length)return false;
                const row=rows[0];
                if(rows.length!==1||row.role!=='model'||row.speakerId)return true;
                if(key==='room_iu_jennie_irene_v1'){
                    const room=this.roomManager.exportData().rooms.find(r=>r.id===key);
                    // Exact startup greeting, not a user's generated or edited turn.
                    const segments=row.content?.segments;
                    return !(room&&row.content?.text===room.members[0]?.persona.greeting
                        &&Array.isArray(segments)&&segments.length===4
                        &&segments[0]?.type==='narration'&&segments[0]?.text==='晨光剛落進房間，三個人仍在昨晚相擁入睡的位置慢慢醒來。'
                        &&segments[1]?.type==='dialogue'&&segments[1]?.speakerId==='iu'&&segments[1]?.text==='早晨……我們三個都在。你今日想先和誰說話，還是想就這樣再抱一會？'
                        &&segments[2]?.type==='dialogue'&&segments[2]?.speakerId==='jennie'&&segments[2]?.text==='哼，我不是捨不得起床，只是這個位置剛好很舒服。'
                        &&segments[3]?.type==='dialogue'&&segments[3]?.speakerId==='irene'&&segments[3]?.text==='不用急著安排所有事情。先慢慢醒來，我們會一起把今天過好。'
                        &&Object.keys(row.content).every(k=>k==='text'||k==='segments'));
                }
                const persona=this.memoryManager.getPersona(key);
                return !(persona&&row.content?.text===persona.greeting&&Object.keys(row.content).every(k=>k==='text'));
            });
            const hasLocalData=hasRealChat
                ||Object.keys(this.memoryManager.getModifiedAndCustomPersonas()).length>0
                ||Object.values(this.memoryManager.getAllDiaryEntries()).some(rows=>rows.length>0)
                ||Object.values(this.memoryManager.getAllInterests()).some(rows=>rows.length>0)
                ||this.roomManager.exportData().rooms.some(room=>room.id!=='room_iu_jennie_irene_v1');
            const [avatars,photos,attachments]=await Promise.all([listPersonaAvatarAssets(),listCharacterPhotoAssets(),listChatAttachments()]);
            this.assertCurrentSessionUser(uid,generation);
            if(hasLocalData||avatars.length||photos.length||attachments.length){
                this.setState('error','本機已有未建立基準的私人資料；已保留，請先匯出備份，再以空白測試裝置登入。');
                return false;
            }
            if(epoch!==this.atomicLocalEpoch||!this.canRestore())return false;
            const ok=await this.pullCloudToLocal(true,false,true);
            if(ok&&this.isCurrentSession(uid,generation))this.markSynced('首次雲端基準已建立；可以正常聊天及同步。');
            return ok;
        }finally{if(body)body.inert=wasInert;}
    }

    // Deliberately opt-in. The original production writer is not switched by this implementation.
    private async pushAtomicDelta():Promise<boolean>{
        if(this.recoveryOnly||!this.client||!this.session||this.pushing||this.pulling)return false;
        if(!await pendingAtomicJournal(this.session.user.id)&&!await readAtomicBaseline(this.session.user.id))return this.bootstrapAtomicBaseline();
        if(!navigator.onLine){this.setState('offline','本機變更已保留，連線後補傳。');return false;}
        if(!navigator.locks){this.setState('error','ATOMIC_SYNC_BROWSER_LOCK_REQUIRED');return false;}
        const uid=this.session.user.id,generation=this.sessionGeneration,client=this.client;
        if(isLocalCloudChangeBatchActive()){this.schedulePush(250);return false;}
        return navigator.locks.request('wetapp-atomic-cloud-delta:'+uid,async()=>{
            if(this.pushing||this.pulling||!this.isCurrentSession(uid,generation))return false;
            this.pushing=true;
            const assertCurrent=()=>this.assertCurrentSessionUser(uid,generation);
            const epoch=this.atomicLocalEpoch;
            let followup=false;
            try{
                let journal=await pendingAtomicJournal(uid);
                assertCurrent();
                const recovering=!!journal;
                if(!journal){
                    if(localStorage.getItem(PENDING_KEY)!=='true')return true;
                    const baseline=await readAtomicBaseline(uid);
                    if(!baseline)throw Error('ATOMIC_BASELINE_REQUIRED：請先確認本機與雲端基準；未上載任何資料。');
                    const head=await this.readCloudStateHead(uid,generation);
                    if(head.revision!==baseline){
                        journal=await this.prepareAtomicConflict(uid,generation,baseline,head.revision,epoch);
                        if(!journal)throw Error('ATOMIC_CONFLICT_REVIEW_REQUIRED：另一裝置已更新雲端；本機變更已保留。');
                    }else{
                    const base=await readMergeBase(uid,baseline);
                    if(!base)throw Error('ATOMIC_BASELINE_REQUIRED');
                    const payload=preserveForeignCloudSettings(await this.buildStatePayload(),base.payload,isPersistedAppSettingKey);assertCurrent();
                    const media=await this.collectLocalMedia(payload.rooms.rooms,uid);
                    const mediaIndex=Object.fromEntries(media.map(a=>[a.asset_id,a.signature]));
                    const [oldMedia,oldMessages,oldConversations]=await Promise.all([readCloudSyncIndex(MEDIA_INDEX_KEY),readCloudSyncIndex(MESSAGE_INDEX_KEY),readCloudSyncIndex(CONVERSATION_INDEX_KEY)]);
                    assertCurrent();
                    const mediaDelta=await stageAtomicMedia(uid,media,oldMedia,{
                        upload:async(path,blob,mime)=>{const r=await client.storage.from(STORAGE_BUCKET).upload(path,blob,{contentType:mime,upsert:false,cacheControl:'3600'});if(r.error)throw r.error;},
                        download:async path=>{const r=await client.storage.from(STORAGE_BUCKET).download(path);if(r.error||!r.data)throw r.error||Error('ATOMIC_MEDIA_DOWNLOAD_FAILED');return r.data;}
                    },assertCurrent);
                    const {conversations,messages,hashes}=this.collectLocalMessages(uid);
                    const delta=planAtomicDelta(conversations,messages,hashes,oldMessages,oldConversations);
                    if(mediaDelta.upsert.length||mediaDelta.remove.length)delta.media=mediaDelta;
                    if(this.atomicLocalEpoch!==epoch)throw Error('ATOMIC_LOCAL_SNAPSHOT_CHANGED');
                    journal=await prepareAtomicJournal(uid,{expected_revision:baseline,new_payload:payload,delta,device:this.deviceId},{
                        [MESSAGE_INDEX_KEY]:hashes,
                        [CONVERSATION_INDEX_KEY]:Object.fromEntries(conversations.map(c=>[c.conversation_key,'1'])),
                        [MEDIA_INDEX_KEY]:mediaIndex,
                        [STATE_ENTITY_INDEX_KEY]:this.stateEntityIndex(payload),
                        ...mergeBaseIndex(uid,baseline+1,{conversations,messages,payload}),
                    });
                    }
                }
                assertCurrent();
                this.setState('pushing','正在一次提交聊天、角色及群組設定…',{progress:88});
                const revision=await completeAtomicJournal(uid,journal,{
                    read:async operationId=>{
                        const r=await client.from('wetapp_chat_delta_receipts_v3').select('revision').eq('user_id',uid).eq('operation_id',operationId).maybeSingle();
                        if(r.error)throw r.error;
                        return r.data?normalizeCloudStateRevision(r.data.revision):null;
                    },
                    commit:async request=>{
                        if(journal.mergeInstall){
                            const current=await this.captureAtomicLocal(uid,journal.mergeInstall.local.payload);
                            await this.verifyAtomicMergeMedia(uid);assertCurrent();
                            if(!this.canRestore()||!equalMergeSnapshot(current,journal.mergeInstall.local))throw Error('ATOMIC_MERGE_INSTALL_LOCAL_CHANGED');
                        }
                        const r=await client.rpc('wetapp_commit_chat_delta_receipted_v3',request);
                        if(r.error)throw r.error;
                        return normalizeCloudStateRevision(r.data);
                    }
                },assertCurrent,merge=>this.installAtomicMerge(uid,generation,merge));
                assertCurrent();
                this.lastObservedCloudStateRevision=revision;
                this.setPullRecoveryRequired(false);
                followup=recovering||epoch!==this.atomicLocalEpoch;
                if(followup)localStorage.setItem(PENDING_KEY,'true');
                else localStorage.removeItem(PENDING_KEY);
                this.markSynced(followup?'已確認先前同步；新變更仍待補傳。':'聊天及設定已同步。');
                if(journal.mergeInstall)this.callbacks.onRemoteApplied();
                return true;
            }catch(error){
                if(!this.isCurrentSession(uid,generation))return false;
                localStorage.setItem(PENDING_KEY,'true');
                const message=authErrorMessage(error,'原子同步失敗');
                if(isCloudStateRevisionConflict(error)){
                    try{
                        const head=await this.readCloudStateHead(uid,generation);
                        if(await retireStaleAtomicJournal(uid,head.revision,async id=>{
                            const r=await client.from('wetapp_chat_delta_receipts_v3').select('revision').eq('user_id',uid).eq('operation_id',id).maybeSingle();
                            if(r.error)throw r.error;return r.data?normalizeCloudStateRevision(r.data.revision):null;
                        },assertCurrent))followup=true;
                    }catch{/* retain the journal on uncertain outcome */}
                }
                if(isCloudStateRevisionConflict(error)||/ATOMIC_(BASELINE_REQUIRED|CONFLICT_REVIEW_REQUIRED|MEDIA_CHANGE_PENDING|MERGE_CONFLICT|MERGE_INSTALL)/.test(message)){
                    this.setPullRecoveryRequired(true);
                    this.setState('error',message);
                }else this.handleSyncError(error,'同步未確認，本機變更已保留');
                return false;
            }finally{
                this.pushing=false;
                if(followup&&this.isCurrentSession(uid,generation))this.schedulePush(0);
            }
        });
    }

    private async pushLocalToCloud(initial = false, preserveRemote = false, expectedStateRevision?: number, forceFullSnapshot = false): Promise<boolean> {
        if(this.recoveryOnly)return false;
        if(this.atomicDeltaMode){if(preserveRemote)throw Error('ATOMIC_UNVERSIONED_WRITE_DISABLED');return this.pushAtomicDelta();}
        if (!this.client || !this.session || this.pushing || this.pulling) return false;
        const sessionUserId = this.session.user.id;
        const sessionGeneration = this.sessionGeneration;
        if (isLocalCloudChangeBatchActive()) {
            localStorage.setItem(PENDING_KEY, 'true');
            this.schedulePush(250);
            return false;
        }
        if (!navigator.onLine) {
            this.setState('offline', '目前離線；變更會保留在本機，連線後自動補傳。');
            return false;
        }
        this.pushing = true;
        let revisionConflict = false;
        try {
            if (!preserveRemote && typeof expectedStateRevision !== 'number') {
                throw new Error('Missing expected cloud state revision.');
            }
            const stateRevision = preserveRemote ? undefined : expectedStateRevision;
            this.setState('pushing', initial ? '正在建立第一份完整雲端資料…' : '正在同步本機變更…', { progress: 5 });
            const payload = await this.buildStatePayload();
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            const media = await this.collectLocalMedia(payload.rooms.rooms, sessionUserId);
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            const mediaPlan = await this.pushMedia(media, preserveRemote, sessionUserId, sessionGeneration, forceFullSnapshot);
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            this.setState('pushing', '正在同步對話訊息…', { progress: 55 });
            const messagePlan = await this.pushMessages(preserveRemote, sessionUserId, sessionGeneration, forceFullSnapshot);
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            if (preserveRemote) {
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                this.setState('connecting', '本機訊息已安全保留，正在合併雲端資料…', { progress: 94 });
            } else {
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                this.setState('pushing', '正在提交角色、記憶與聊天室設定…', { progress: 88 });
                const { data: savedRevision, error } = await this.client.rpc('wetapp_save_state_if_revision', {
                    new_payload: payload,
                    new_device_id: this.deviceId,
                    expected_revision: stateRevision ?? 0,
                });
                if (error) throw error;
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                this.lastObservedCloudStateRevision = normalizeCloudStateRevision(savedRevision);
                await this.applyRemoteDeletionPlan(mediaPlan, messagePlan, sessionUserId, sessionGeneration);
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                await Promise.all([
                    writeCloudSyncIndex(MEDIA_INDEX_KEY, mediaPlan.nextIndex),
                    writeCloudSyncIndex(MESSAGE_INDEX_KEY, messagePlan.hashes),
                    writeCloudSyncIndex(CONVERSATION_INDEX_KEY, messagePlan.conversationIndex),
                    writeCloudSyncIndex(STATE_ENTITY_INDEX_KEY, this.stateEntityIndex(payload)),
                ]);
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                localStorage.removeItem(PENDING_KEY);
                this.setPullRecoveryRequired(false);
                this.markSynced(initial ? '第一份完整雲端資料已建立。' : '所有變更已同步。');
            }
            return true;
        } catch (error) {
            if (
                error instanceof CloudSessionSupersededError
                || !this.isCurrentSession(sessionUserId, sessionGeneration)
            ) return false;
            localStorage.setItem(PENDING_KEY, 'true');
            if (isCloudStateRevisionConflict(error)) {
                revisionConflict = true;
                this.setPullRecoveryRequired(true);
                this.setState('connecting', '偵測到另一部裝置剛更新雲端，正在安全合併…', { progress: 94 });
            } else {
                this.handleSyncError(error, '上傳雲端失敗');
            }
            return false;
        } finally {
            this.pushing = false;
            const supersededByActiveSession = Boolean(
                this.session
                && !this.isCurrentSession(sessionUserId, sessionGeneration)
            );
            if (revisionConflict || supersededByActiveSession) this.schedulePull(0);
        }
    }

    private assertCurrentSessionUser(
        userId: string,
        generation = this.sessionGeneration,
    ) {
        if (!this.isCurrentSession(userId, generation)) {
            throw new CloudSessionSupersededError();
        }
    }

    private async pullCloudToLocal(force = false, mergeLocal = false, atomicBootstrap=false): Promise<boolean> {
        if(this.atomicDeltaMode&&!this.recoveryOnly&&(mergeLocal||(!atomicBootstrap&&localStorage.getItem(PENDING_KEY)==='true')||!this.canRestore()||(this.session&&await pendingAtomicJournal(this.session.user.id))))return false;
        if(this.recoveryOnly&&(!force||mergeLocal||!this.canRestore()||!this.recoveryHistoryAllowed()))return false;
        if (!this.client || !this.session || this.pulling || this.pushing) return false;
        const sessionUserId = this.session.user.id;
        const sessionGeneration = this.sessionGeneration;
        if (isLocalCloudChangeBatchActive()) {
            this.setPullRecoveryRequired(true);
            this.schedulePull(250);
            return false;
        }
        if (!navigator.onLine) {
            this.setState('offline', '目前離線；正在使用這部裝置的最近資料。');
            return false;
        }
        this.pulling = true;
        this.applyingRemote = true;
        const reconcileEpoch = this.remoteStateChangeEpoch;
        let pullCompleted = false;
        try {
            this.setState('pulling', '正在檢查雲端變更…', { progress: 8 });
            const previouslyObservedRevision = this.lastObservedCloudStateRevision;
            const headResponse = await this.client
                .from('wetapp_state')
                .select('revision,updated_at,source_device_id')
                .maybeSingle();
            if (headResponse.error) throw headResponse.error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            const currentRevision = normalizeCloudStateRevision(headResponse.data?.revision);
            const hasOutstandingRemoteChange = (
                this.remoteStateChangeEpoch > this.reconciledRemoteStateChangeEpoch
            );
            const hasPendingChanges = localStorage.getItem(PENDING_KEY) === 'true';
            const sameKnownRevision = (
                previouslyObservedRevision !== null
                && currentRevision === previouslyObservedRevision
            );
            this.lastObservedCloudStateRevision = currentRevision;

            // Mobile foreground/online checks are intentionally cheap. If the cloud
            // revision is unchanged since the last successful observation, do not
            // download the large state payload or re-enumerate every message/media row.
            if (
                !force
                && !hasOutstandingRemoteChange
                && !hasPendingChanges
                && localStorage.getItem(SYNCED_USER_ID_KEY) === sessionUserId
                && sameKnownRevision
            ) {
                pullCompleted = true;
                this.setPullRecoveryRequired(false);
                this.markSynced('雲端版本沒有變更，毋須重複下載。');
                return true;
            }
            if (!hasOutstandingRemoteChange && shouldSkipRedundantCloudPull({
                force,
                cloudSourceDeviceId: headResponse.data?.source_device_id,
                localDeviceId: this.deviceId,
                syncedUserId: localStorage.getItem(SYNCED_USER_ID_KEY),
                sessionUserId,
                hasPendingChanges,
            })) {
                pullCompleted = true;
                this.setPullRecoveryRequired(false);
                this.markSynced('本機已是雲端最新版本，毋須重複下載。');
                return true;
            }

            this.setState('pulling', '正在下載雲端變更…', { progress: 16 });
            const stateResponse = await this.client
                .from('wetapp_state')
                .select('payload,revision,updated_at,source_device_id')
                .maybeSingle();
            if (stateResponse.error) throw stateResponse.error;
            if(this.recoveryOnly&&(!stateResponse.data||!stateResponse.data.payload))throw Error('CLOUD_RECOVERY_EMPTY');
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            this.lastObservedCloudStateRevision = normalizeCloudStateRevision(stateResponse.data?.revision);
            const [messageRows, mediaRows] = await Promise.all([
                this.fetchAllRows<CloudMessageRow>('wetapp_messages', [
                    ['conversation_key', true],
                    ['position', true],
                ]),
                this.fetchAllRows<CloudMediaRow>('wetapp_media', [['created_at_ms', true]]),
            ]);
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            if(this.recoveryOnly||this.atomicDeltaMode){
                if(!this.canRestore()||(this.recoveryOnly&&!this.recoveryHistoryAllowed()))throw Error('CLOUD_RECOVERY_LOCAL_CHANGED');
                const head=await this.client.from('wetapp_state').select('revision').maybeSingle();
                if(head.error||normalizeCloudStateRevision(head.data?.revision)!==this.lastObservedCloudStateRevision)throw Error('CLOUD_RECOVERY_REVISION_CHANGED');
            }
            const localTransaction = await this.createCloudPullTransactionSnapshot();
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            try {
                this.setState('pulling', `正在還原 ${mediaRows.length} 個私人媒體檔案…`, { progress: 35 });
                await this.pullMedia(mediaRows, mergeLocal, localTransaction);
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                this.setState('pulling', `正在整理 ${messageRows.length.toLocaleString('zh-HK')} 則訊息…`, { progress: 72 });
                if(this.recoveryOnly||this.atomicDeltaMode){
                    if(!this.canRestore()||(this.recoveryOnly&&!this.recoveryHistoryAllowed()))throw Error('CLOUD_RECOVERY_LOCAL_CHANGED');
                    const head=await this.client.from('wetapp_state').select('revision').maybeSingle();
                    if(head.error||normalizeCloudStateRevision(head.data?.revision)!==this.lastObservedCloudStateRevision)throw Error('CLOUD_RECOVERY_REVISION_CHANGED');
                }
                await this.applyRemoteData(
                    (stateResponse.data?.payload || {}) as Partial<CloudStatePayload>,
                    messageRows,
                    mergeLocal,
                );
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                if(this.recoveryOnly){
                    const histories=this.memoryManager.getAllChatHistories();
                    const expectedByKey=new Map<string,CloudMessageRow[]>();
                    for(const row of messageRows){const rows=expectedByKey.get(row.conversation_key)||[];rows.push(row);expectedByKey.set(row.conversation_key,rows);}
                    if(Object.values(histories).reduce((n,rows)=>n+rows.length,0)!==messageRows.length)throw Error('CLOUD_RECOVERY_MESSAGE_COUNT_MISMATCH');
                    for(const [key,rows] of expectedByKey){
                        const restored=histories[key]||[];
                        if(restored.length!==rows.length||rows.some((row,i)=>restored[i].id!==row.message_id||restored[i].role!==row.role||Number(restored[i].createdAt)!==Number(row.created_at_ms)))throw Error('CLOUD_RECOVERY_MESSAGE_ID_MISMATCH');
                    }
                    for(const row of mediaRows){
                        const metadata=row.metadata||{};
                        const asset=row.kind==='persona_avatar'||row.kind==='room_avatar'
                            ?await getPersonaAvatarAsset(String(metadata.localKey||''))
                            :row.kind==='character_photo'
                                ?await getCharacterPhotoAsset(String(metadata.id||row.asset_id.replace(/^character-photo:/u,'')))
                                :await getChatAttachment(String(metadata.id||row.asset_id.replace(/^attachment:/u,'')));
                        if(!asset||asset.blob.size!==Number(row.byte_size))throw Error('CLOUD_RECOVERY_MEDIA_SIZE_MISMATCH');
                    }
                }
                await this.refreshLocalIndexes(
                    messageRows,
                    mediaRows,
                    (stateResponse.data?.payload || {}) as Partial<CloudStatePayload>,
                );
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
                if(this.atomicDeltaMode&&!this.recoveryOnly){
                    const revision=this.lastObservedCloudStateRevision??0;
                    const conversations=await this.fetchAllRows<CloudConversationRow>('wetapp_conversations',[['conversation_key',true]]);
                    const head=await this.client.from('wetapp_state').select('revision').maybeSingle();
                    this.assertCurrentSessionUser(sessionUserId,sessionGeneration);
                    if(head.error||normalizeCloudStateRevision(head.data?.revision)!==revision)throw Error('CLOUD_RECOVERY_REVISION_CHANGED');
                    await saveAtomicBaseline(sessionUserId,revision,mergeBaseIndex(sessionUserId,revision,{conversations,messages:messageRows,payload:stateResponse.data?.payload||{}}));
                }
            } catch (error) {
                try {
                    await this.rollbackCloudPullTransaction(localTransaction);
                } catch (rollbackError) {
                    throw new AggregateError(
                        [error, rollbackError],
                        '下載雲端資料失敗，而且本機狀態無法完整回復。',
                    );
                }
                throw error;
            }
            this.reconciledRemoteStateChangeEpoch = Math.max(
                this.reconciledRemoteStateChangeEpoch,
                reconcileEpoch,
            );
            pullCompleted = true;
            localStorage.removeItem(PENDING_KEY);
            this.setPullRecoveryRequired(false);
            localStorage.setItem(SAFE_MERGE_VERSION_KEY, '2');
            this.callbacks.onRemoteApplied();
            this.markSynced(this.recoveryOnly?`CLOUD RESTORE PASS：已核對 ${messageRows.length} 則訊息 ID／角色／時間及 ${mediaRows.length} 個媒體檔案大小；雲端版本 ${this.lastObservedCloudStateRevision}。沒有上傳。`:'已載入雲端最新資料。');
            return true;
        } catch (error) {
            if (
                error instanceof CloudSessionSupersededError
                || !this.isCurrentSession(sessionUserId, sessionGeneration)
            ) return false;
            localStorage.setItem(PENDING_KEY, 'true');
            this.setPullRecoveryRequired(true);
            this.handleSyncError(error, '下載雲端資料失敗');
            return false;
        } finally {
            this.applyingRemote = false;
            this.pulling = false;
            const supersededByActiveSession = Boolean(
                this.session
                && !this.isCurrentSession(sessionUserId, sessionGeneration)
            );
            if (
                supersededByActiveSession
                || (
                    pullCompleted
                    && this.remoteStateChangeEpoch > this.reconciledRemoteStateChangeEpoch
                )
            ) {
                this.schedulePull(0);
            }
        }
    }

    private async buildStatePayload(): Promise<CloudStatePayload> {
        const customPersonas = clone(this.memoryManager.getModifiedAndCustomPersonas());
        Object.entries(customPersonas).forEach(([key, persona]) => {
            if (isLocalImageUrl(persona.avatarUrl)) persona.avatarUrl = `private-avatar:${key}`;
        });

        const rooms = clone(this.roomManager.exportData());
        const existingAvatarAssets = new Map(
            (await listPersonaAvatarAssets()).map(asset => [asset.personaKey, asset]),
        );
        for (const room of rooms.rooms) {
            for (const member of room.members) {
                const localKey = resolveRoomAvatarStorageKey(room.id, member);
                if (isLocalImageUrl(member.persona.avatarUrl)) {
                    try {
                        const blob = await fetch(member.persona.avatarUrl!).then(response => response.blob());
                        const existing = existingAvatarAssets.get(localKey);
                        if (!existing || !await blobsMatch(existing.blob, blob)) {
                            await savePersonaAvatarBlob(localKey, blob, Date.now());
                        }
                        member.avatarAssetKey = localKey;
                        member.persona.avatarUrl = `private-avatar:${localKey}`;
                    } catch (error) {
                        console.warn(`Unable to stage the room avatar for ${member.persona.name}.`, error);
                    }
                }
            }
        }

        const appSettings = Object.fromEntries(
            PERSISTED_APP_SETTING_KEYS.flatMap(key => {
                const value = localStorage.getItem(key);
                return value === null ? [] : [[key, value]];
            }),
        );
        return {
            schemaVersion: 1,
            customPersonas,
            diaries: clone(this.memoryManager.getAllDiaryEntries()),
            interests: clone(this.memoryManager.getAllInterests()),
            rooms,
            appSettings,
        };
    }

    private async pushMessages(
        preserveRemote = false,
        sessionUserId = this.session?.user.id || '',
        sessionGeneration = this.sessionGeneration,
        forceAll = false,
    ): Promise<CloudMessagePushPlan> {
        if (!this.client || !sessionUserId) throw new Error('Cloud sync session unavailable.');
        this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        const { conversations, messages, hashes } = this.collectLocalMessages(sessionUserId);
        const previousHashes = await readCloudSyncIndex(MESSAGE_INDEX_KEY);
        this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        const changed = forceAll
            ? messages
            : messages.filter(row => previousHashes[this.messageIndexKey(row)] !== hashes[this.messageIndexKey(row)]);
        const removedKeys = Object.keys(previousHashes).filter(key => !hashes[key]);

        for (const batch of batches(conversations, 100)) {
            const { error } = await this.client.from('wetapp_conversations').upsert(batch, {
                onConflict: 'user_id,conversation_key',
            });
            if (error) throw error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        }
        for (const [index, batch] of batches(changed, 100).entries()) {
            const { error } = await this.client.from('wetapp_messages').upsert(batch, {
                onConflict: 'user_id,conversation_key,message_id',
            });
            if (error) throw error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            const denominator = Math.max(1, Math.ceil(changed.length / 100));
            this.setState('pushing', `正在同步對話訊息 ${index + 1}/${denominator}…`, {
                progress: 55 + Math.round(((index + 1) / denominator) * 27),
            });
        }
        const removedByConversation = new Map<string, string[]>();
        if (!preserveRemote) {
            removedKeys.forEach(key => {
                const splitAt = key.indexOf('\u0000');
                if (splitAt < 0) return;
                const conversationKey = key.slice(0, splitAt);
                const messageId = key.slice(splitAt + 1);
                const ids = removedByConversation.get(conversationKey) || [];
                ids.push(messageId);
                removedByConversation.set(conversationKey, ids);
            });
        }

        const previousConversations = await readCloudSyncIndex(CONVERSATION_INDEX_KEY);
        this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        const conversationIndex = Object.fromEntries(conversations.map(row => [row.conversation_key, '1']));
        const removedConversations = preserveRemote
            ? []
            : Object.keys(previousConversations).filter(key => !conversationIndex[key]);
        return {
            hashes,
            conversationIndex,
            removedByConversation: Array.from(removedByConversation.entries()),
            removedConversations,
        } satisfies CloudMessagePushPlan;
    }

    private async applyRemoteDeletionPlan(
        mediaPlan: CloudMediaPushPlan,
        messagePlan: CloudMessagePushPlan,
        sessionUserId: string,
        sessionGeneration = this.sessionGeneration,
    ) {
        if (!this.client) throw new Error('Cloud sync client unavailable.');
        this.assertCurrentSessionUser(sessionUserId, sessionGeneration);

        for (const [conversationKey, ids] of messagePlan.removedByConversation) {
            for (const batch of batches(ids, 50)) {
                const { error } = await this.client.from('wetapp_messages')
                    .delete()
                    .eq('conversation_key', conversationKey)
                    .in('message_id', batch);
                if (error) throw error;
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            }
        }

        for (const batch of batches(messagePlan.removedConversations, 50)) {
            const { error } = await this.client.from('wetapp_conversations')
                .delete()
                .in('conversation_key', batch);
            if (error) throw error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        }

        for (const batch of batches(mediaPlan.removedIds, 50)) {
            const existing = await this.client.from('wetapp_media')
                .select('asset_id,storage_path')
                .in('asset_id', batch);
            if (existing.error) throw existing.error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            const paths = (existing.data || []).map(row => row.storage_path);
            if (paths.length) {
                const removal = await this.client.storage.from(STORAGE_BUCKET).remove(paths);
                if (removal.error) throw removal.error;
                this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            }
            const deletion = await this.client.from('wetapp_media').delete().in('asset_id', batch);
            if (deletion.error) throw deletion.error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        }
    }

    private collectLocalMessages(sessionUserId = this.session?.user.id || '') {
        if (!sessionUserId) return { conversations: [], messages: [], hashes: {} } as {
            conversations: CloudConversationRow[];
            messages: CloudMessageRow[];
            hashes: Record<string, string>;
        };
        const conversations: CloudConversationRow[] = [];
        const messages: CloudMessageRow[] = [];
        const hashes: Record<string, string> = {};
        const rooms = new Map(this.roomManager.getRooms().map(room => [room.id, room]));
        const personas = this.memoryManager.getAllPersonas();

        Object.entries(this.memoryManager.getAllChatHistories()).forEach(([conversationKey, history]) => {
            const room = rooms.get(conversationKey);
            const persona = personas[conversationKey];
            const kind: CloudConversationRow['kind'] = room
                ? 'room'
                : persona
                    ? 'persona'
                    : conversationKey.startsWith('assistant')
                        ? 'assistant'
                        : 'unknown';
            const title = room?.title || persona?.name || conversationKey;
            const lastMessageAt = history.reduce((latest, message) => Math.max(latest, Number(message.createdAt || 0)), 0);
            conversations.push({
                user_id: sessionUserId,
                conversation_key: conversationKey,
                title,
                kind,
                message_count: history.length,
                last_message_at_ms: lastMessageAt || null,
                source_device_id: this.deviceId,
            });
            history.forEach((message, position) => {
                const stableContent = clone(message.content || {});
                if (stableContent.imageUrl?.startsWith('blob:') || stableContent.imageUrl?.startsWith('data:')) {
                    delete stableContent.imageUrl;
                }
                const fallbackId = `legacy-${position}-${hashText(JSON.stringify({
                    role: message.role,
                    speakerId: message.speakerId,
                    content: stableContent,
                }))}`;
                const row: CloudMessageRow = {
                    user_id: sessionUserId,
                    conversation_key: conversationKey,
                    message_id: message.id || fallbackId,
                    position,
                    role: message.role,
                    speaker_id: message.speakerId || null,
                    content: stableContent,
                    created_at_ms: Number(message.createdAt || position + 1),
                    source_device_id: this.deviceId,
                };
                const indexKey = this.messageIndexKey(row);
                hashes[indexKey] = hashText(JSON.stringify({
                    position: row.position,
                    role: row.role,
                    speaker_id: row.speaker_id,
                    content: row.content,
                    created_at_ms: row.created_at_ms,
                }));
                messages.push(row);
            });
        });
        return { conversations, messages, hashes };
    }

    private async collectLocalMedia(
        rooms: ChatRoom[],
        sessionUserId = this.session?.user.id || '',
    ): Promise<LocalCloudMedia[]> {
        if (!sessionUserId) return [];
        const [avatarAssets, photoAssets, attachmentAssets] = await Promise.all([
            listPersonaAvatarAssets(),
            listCharacterPhotoAssets(),
            listChatAttachments(),
        ]);
        const activePersonaKeys = new Set(Object.keys(this.memoryManager.getAllPersonas()));
        const roomAvatarTargets = new Map<string, { roomId: string; memberId: string }>();
        rooms.forEach(room => room.members.forEach(member => {
            roomAvatarTargets.set(resolveRoomAvatarStorageKey(room.id, member), {
                roomId: room.id,
                memberId: member.id,
            });
        }));
        const userId = sessionUserId;
        const result: LocalCloudMedia[] = [];

        avatarAssets.forEach(asset => {
            const roomTarget = roomAvatarTargets.get(asset.personaKey);
            if (!roomTarget && !activePersonaKeys.has(asset.personaKey)) return;
            const kind: CloudMediaRow['kind'] = roomTarget ? 'room_avatar' : 'persona_avatar';
            const assetId = `${kind}:${asset.personaKey}`;
            result.push({
                user_id: userId,
                asset_id: assetId,
                conversation_key: roomTarget?.roomId || asset.personaKey,
                kind,
                storage_path: `${userId}/${kind}/${safeAssetPath(assetId)}`,
                mime_type: asset.blob.type || 'image/jpeg',
                byte_size: asset.blob.size,
                signature: `${asset.blob.size}:${asset.blob.type}:${asset.updatedAt}`,
                metadata: {
                    localKey: asset.personaKey,
                    roomId: roomTarget?.roomId,
                    memberId: roomTarget?.memberId,
                },
                source_device_id: this.deviceId,
                created_at_ms: asset.updatedAt,
                blob: asset.blob,
            });
        });
        photoAssets.forEach(asset => {
            const studio=readStudioImageMetadata(asset.personaKey,asset.id,asset.studio);
            const assetId = `character-photo:${asset.id}`;
            result.push({
                user_id: userId,
                asset_id: assetId,
                conversation_key: asset.personaKey,
                kind: 'character_photo',
                storage_path: `${userId}/character_photo/${safeAssetPath(assetId)}`,
                mime_type: asset.blob.type || 'image/jpeg',
                byte_size: asset.blob.size,
                signature: `${asset.blob.size}:${asset.blob.type}:${asset.createdAt}:${hashText(asset.prompt || '')}${studio?':'+hashText(JSON.stringify(studio)):''}`,
                metadata: { id: asset.id, personaKey: asset.personaKey, prompt: asset.prompt,...(studio?{studio}:{}) },
                source_device_id: this.deviceId,
                created_at_ms: asset.createdAt,
                blob: asset.blob,
            });
        });
        attachmentAssets.forEach(asset => {
            const studio=readStudioVideoMetadata(asset.conversationKey,asset.id,asset.studio);
            const assetId = `attachment:${asset.id}`;
            result.push({
                user_id: userId,
                asset_id: assetId,
                conversation_key: asset.conversationKey,
                kind: 'attachment',
                storage_path: `${userId}/attachment/${safeAssetPath(assetId)}`,
                mime_type: asset.mimeType || asset.blob.type || 'application/octet-stream',
                byte_size: asset.blob.size,
                signature: `${asset.blob.size}:${asset.mimeType}:${asset.createdAt}:${asset.name}${studio?':'+hashText(JSON.stringify(studio)):''}`,
                metadata: {
                    id: asset.id,
                    conversationKey: asset.conversationKey,
                    name: asset.name,
                    ...(studio?{studio}:{}),
                },
                source_device_id: this.deviceId,
                created_at_ms: asset.createdAt,
                blob: asset.blob,
            });
        });
        return result;
    }

    private async pushMedia(
        media: LocalCloudMedia[],
        preserveRemote = false,
        sessionUserId = this.session?.user.id || '',
        sessionGeneration = this.sessionGeneration,
        forceAll = false,
    ): Promise<CloudMediaPushPlan> {
        if (!this.client || !sessionUserId) throw new Error('Cloud sync client unavailable.');
        this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        const previousIndex = await readCloudSyncIndex(MEDIA_INDEX_KEY);
        this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
        const nextIndex = Object.fromEntries(media.map(asset => [asset.asset_id, asset.signature]));
        const changed = forceAll
            ? media
            : media.filter(asset => previousIndex[asset.asset_id] !== asset.signature);
        for (const [index, asset] of changed.entries()) {
            const upload = await this.client.storage.from(STORAGE_BUCKET).upload(asset.storage_path, asset.blob, {
                contentType: asset.mime_type,
                upsert: true,
                cacheControl: '3600',
            });
            if (upload.error) throw upload.error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            const { blob: _blob, ...row } = asset;
            const metadata = await this.client.from('wetapp_media').upsert(row, {
                onConflict: 'user_id,asset_id',
            });
            if (metadata.error) throw metadata.error;
            this.assertCurrentSessionUser(sessionUserId, sessionGeneration);
            this.setState('pushing', `正在同步私人媒體 ${index + 1}/${changed.length}…`, {
                progress: 8 + Math.round(((index + 1) / Math.max(1, changed.length)) * 42),
            });
        }

        const removedIds = preserveRemote
            ? []
            : Object.keys(previousIndex).filter(assetId => !nextIndex[assetId]);
        return { nextIndex, removedIds } satisfies CloudMediaPushPlan;
    }

    private async createCloudPullTransactionSnapshot(): Promise<CloudPullTransactionSnapshot> {
        const [messages, conversations, media, stateEntities] = await Promise.all([
            readCloudSyncIndex(MESSAGE_INDEX_KEY),
            readCloudSyncIndex(CONVERSATION_INDEX_KEY),
            readCloudSyncIndex(MEDIA_INDEX_KEY),
            readCloudSyncIndex(STATE_ENTITY_INDEX_KEY),
        ]);
        return {
            memory: this.memoryManager.createImportSnapshot(),
            rooms: this.roomManager.createImportSnapshot(),
            appSettings: Object.fromEntries(
                PERSISTED_APP_SETTING_KEYS.map(key => [key, localStorage.getItem(key)]),
            ),
            avatarAssets: new Map(),
            photoAssets: new Map(),
            attachmentAssets: new Map(),
            indexes: { messages, conversations, media, stateEntities },
        };
    }

    private async rememberCloudPullAvatar(
        snapshot: CloudPullTransactionSnapshot,
        key: string,
    ) {
        if (snapshot.avatarAssets.has(key)) return;
        snapshot.avatarAssets.set(key, await getPersonaAvatarAsset(key) || null);
    }

    private async rememberCloudPullPhoto(
        snapshot: CloudPullTransactionSnapshot,
        id: string,
    ) {
        if (snapshot.photoAssets.has(id)) return;
        snapshot.photoAssets.set(id, await getCharacterPhotoAsset(id) || null);
    }

    private async rememberCloudPullAttachment(
        snapshot: CloudPullTransactionSnapshot,
        id: string,
    ) {
        if (snapshot.attachmentAssets.has(id)) return;
        snapshot.attachmentAssets.set(id, await getChatAttachment(id) || null);
    }

    private async rollbackCloudPullTransaction(snapshot: CloudPullTransactionSnapshot) {
        const rollbackErrors: unknown[] = [];
        const attempt = async (operation: () => Promise<void> | void) => {
            try {
                await operation();
            } catch (error) {
                rollbackErrors.push(error);
            }
        };

        for (const [key, asset] of snapshot.avatarAssets) {
            await attempt(async () => {
                if (asset) await savePersonaAvatarBlob(key, asset.blob, asset.updatedAt);
                else await deletePersonaAvatar(key);
            });
        }
        for (const [id, asset] of snapshot.photoAssets) {
            await attempt(async () => {
                if (asset) await saveCharacterPhotoAsset(asset);
                else await deleteCharacterPhotoAsset(id);
            });
        }
        for (const [id, asset] of snapshot.attachmentAssets) {
            await attempt(async () => {
                if (asset) await saveChatAttachment(asset);
                else await deleteChatAttachment(id);
            });
        }

        await attempt(() => this.roomManager.restoreImportSnapshot(snapshot.rooms));
        await attempt(() => this.memoryManager.restoreImportSnapshot(snapshot.memory));
        await attempt(() => {
            PERSISTED_APP_SETTING_KEYS.forEach(key => {
                const value = snapshot.appSettings[key];
                if (value === null || value === undefined) localStorage.removeItem(key);
                else localStorage.setItem(key, value);
            });
        });
        await attempt(() => writeCloudSyncIndex(MESSAGE_INDEX_KEY, snapshot.indexes.messages));
        await attempt(() => writeCloudSyncIndex(CONVERSATION_INDEX_KEY, snapshot.indexes.conversations));
        await attempt(() => writeCloudSyncIndex(MEDIA_INDEX_KEY, snapshot.indexes.media));
        await attempt(() => writeCloudSyncIndex(STATE_ENTITY_INDEX_KEY, snapshot.indexes.stateEntities));

        if (rollbackErrors.length) {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('wetapp-storage-failed'));
            }
            throw new AggregateError(
                rollbackErrors,
                'Cloud pull rollback was incomplete.',
            );
        }
    }

    private async pullMedia(
        rows: CloudMediaRow[],
        mergeLocal = false,
        transaction?: CloudPullTransactionSnapshot,
    ) {
        if (!this.client) return;
        const previousIndex = await readCloudSyncIndex(MEDIA_INDEX_KEY);
        if (mergeLocal) {
            const localMedia = await this.collectLocalMedia(this.roomManager.exportData().rooms);
            const currentIds = localMedia.map(asset => asset.asset_id);
            const locallyDeletedIds = findLocallyDeletedIndexedKeys(previousIndex, currentIds);
            rows = rows.filter(row => !locallyDeletedIds.has(row.asset_id));
        }
        if(this.atomicDeltaMode&&!this.recoveryOnly){
            if(mergeLocal||!transaction)throw Error('ATOMIC_MEDIA_PULL_TRANSACTION_REQUIRED');
            const remoteIds=new Set(rows.map(r=>r.asset_id));
            const local=await this.collectLocalMedia(this.roomManager.exportData().rooms);
            for(const asset of local){
                if(!Object.hasOwn(previousIndex,asset.asset_id)||remoteIds.has(asset.asset_id))continue;
                if(previousIndex[asset.asset_id]!==asset.signature)throw Error('ATOMIC_MEDIA_CHANGE_PENDING');
                const m=asset.metadata||{};
                if(asset.kind==='persona_avatar'||asset.kind==='room_avatar'){
                    const key=String(m.localKey||'');if(!key)throw Error('ATOMIC_MEDIA_ID_INVALID');
                    await this.rememberCloudPullAvatar(transaction,key);await deletePersonaAvatar(key);
                }else if(asset.kind==='character_photo'){
                    const id=String(m.id||'');if(!id)throw Error('ATOMIC_MEDIA_ID_INVALID');
                    await this.rememberCloudPullPhoto(transaction,id);await deleteCharacterPhotoAsset(id);
                }else{
                    const id=String(m.id||'');if(!id)throw Error('ATOMIC_MEDIA_ID_INVALID');
                    await this.rememberCloudPullAttachment(transaction,id);await deleteChatAttachment(id);
                }
            }
        }
        const [avatarAssets, photoAssets, attachmentAssets] = await Promise.all([
            listPersonaAvatarAssets(),
            listCharacterPhotoAssets(),
            listChatAttachments(),
        ]);
        const avatarKeys = new Set(avatarAssets.map(asset => asset.personaKey));
        const photoIds = new Set(photoAssets.map(asset => asset.id));
        const attachmentIds = new Set(attachmentAssets.map(asset => asset.id));

        const needsDownload = rows.filter(row => {
            const metadata = row.metadata || {};
            const exists = row.kind === 'persona_avatar' || row.kind === 'room_avatar'
                ? avatarKeys.has(String(metadata.localKey || ''))
                : row.kind === 'character_photo'
                    ? photoIds.has(String(metadata.id || ''))
                    : attachmentIds.has(String(metadata.id || ''));
            return !exists || previousIndex[row.asset_id] !== row.signature;
        });

        for (const [index, row] of needsDownload.entries()) {
            const download = await this.client.storage.from(STORAGE_BUCKET).download(row.storage_path);
            if (download.error || !download.data) throw download.error || new Error(`無法下載 ${row.asset_id}`);
            if(this.atomicDeltaMode&&row.storage_path.includes('/atomic-v3/')){
                const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await download.data.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
                if(download.data.size!==Number(row.byte_size)||row.storage_path.split('/').at(-1)!==hash)throw Error('ATOMIC_MEDIA_BYTES_MISMATCH');
            }
            const metadata = row.metadata || {};
            if (row.kind === 'persona_avatar' || row.kind === 'room_avatar') {
                const localKey = String(metadata.localKey || '');
                if (transaction) await this.rememberCloudPullAvatar(transaction, localKey);
                await savePersonaAvatarBlob(localKey, download.data, row.created_at_ms);
            } else if (row.kind === 'character_photo') {
                const id = String(metadata.id || row.asset_id.replace(/^character-photo:/u, ''));
                if (transaction) await this.rememberCloudPullPhoto(transaction, id);
                await saveCharacterPhotoAsset({
                    id,
                    personaKey: String(metadata.personaKey || row.conversation_key || ''),
                    studio:readStudioImageMetadata(String(metadata.personaKey || row.conversation_key || ''),id,metadata.studio),
                    prompt: String(metadata.prompt || ''),
                    createdAt: row.created_at_ms,
                    blob: download.data,
                });
            } else {
                const id = String(metadata.id || row.asset_id.replace(/^attachment:/u, ''));
                if (transaction) await this.rememberCloudPullAttachment(transaction, id);
                await saveChatAttachment({
                    id,
                    conversationKey: String(metadata.conversationKey || row.conversation_key || ''),
                    studio:readStudioVideoMetadata(String(metadata.conversationKey || row.conversation_key || ''),id,metadata.studio),
                    name: String(metadata.name || 'attachment'),
                    mimeType: row.mime_type,
                    createdAt: row.created_at_ms,
                    blob: download.data,
                });
            }
            this.setState('pulling', `正在還原私人媒體 ${index + 1}/${needsDownload.length}…`, {
                progress: 35 + Math.round(((index + 1) / Math.max(1, needsDownload.length)) * 30),
            });
        }
    }

    private async applyRemoteData(
        payload: Partial<CloudStatePayload>,
        rows: CloudMessageRow[],
        mergeLocal = false,
        exactMergeConversations?: readonly {conversation_key:string}[],
    ) {
        const cloudChatHistories: Record<string, ChatMessage[]> = {};
        if(exactMergeConversations)for(const c of exactMergeConversations)cloudChatHistories[c.conversation_key]=[];
        rows.forEach(row => {
            (cloudChatHistories[row.conversation_key] ||= []).push({
                id: row.message_id,
                createdAt: Number(row.created_at_ms),
                speakerId: row.speaker_id || undefined,
                role: row.role,
                content: clone(row.content || {}),
            });
        });
        const localChatHistories = clone(this.memoryManager.getAllChatHistories());
        const [previousMessageIndex, previousConversationIndex, previousStateEntityIndex] = mergeLocal
            ? await Promise.all([
                readCloudSyncIndex(MESSAGE_INDEX_KEY),
                readCloudSyncIndex(CONVERSATION_INDEX_KEY),
                readCloudSyncIndex(STATE_ENTITY_INDEX_KEY),
            ])
            : [{}, {}, {}];
        const locallyDeletedConversations = mergeLocal
            ? findLocallyDeletedIndexedKeys(previousConversationIndex, Object.keys(localChatHistories))
            : new Set<string>();
        const currentStateEntityKeys = mergeLocal
            ? [
                ...Object.keys(this.memoryManager.getModifiedAndCustomPersonas()).map(key => `persona:${key}`),
                ...this.roomManager.exportData().rooms.map(room => `room:${room.id}`),
            ]
            : [];
        const locallyDeletedStateEntities = mergeLocal
            ? findLocallyDeletedIndexedKeys(previousStateEntityIndex, currentStateEntityKeys)
            : new Set<string>();
        const chatHistories = mergeLocal
            ? mergeChatHistoryMaps(localChatHistories, cloudChatHistories, {
                previousMessageIndex,
                previousConversationIndex,
            })
            : cloudChatHistories;

        const remoteState = mergeLocal
            ? filterRemoteStateEntities(
                clone(payload.customPersonas || {}),
                clone(payload.rooms?.rooms || []),
                {
                    locallyDeletedStateEntities,
                    locallyDeletedConversations,
                    localPersonas: this.memoryManager.getAllPersonas(),
                    deletedRoomIds: this.roomManager.getDeletedRoomIds(),
                },
            )
            : {
                customPersonas: clone(payload.customPersonas || {}),
                rooms: clone(payload.rooms?.rooms || []),
            };
        const customPersonas = mergeLocal
            ? { ...remoteState.customPersonas, ...clone(this.memoryManager.getModifiedAndCustomPersonas()) }
            : remoteState.customPersonas;
        const diaries = mergeLocal
            ? { ...clone(payload.diaries || {}), ...clone(this.memoryManager.getAllDiaryEntries()) }
            : clone(payload.diaries || {});
        const interests = mergeLocal
            ? { ...clone(payload.interests || {}), ...clone(this.memoryManager.getAllInterests()) }
            : clone(payload.interests || {});
        this.memoryManager.loadAllData({
            customPersonas,
            diaries,
            interests,
            chatHistories,
        }, true);

        const rooms = mergeLocal
            ? {
                version: 2 as const,
                rooms: [...new Map([
                    ...remoteState.rooms.map(room => [room.id, room] as const),
                    ...this.roomManager.exportData().rooms.map(room => [room.id, room] as const),
                ]).values()],
            }
            : {
                version: 2 as const,
                rooms: remoteState.rooms,
            };
        const avatarAssets = await listPersonaAvatarAssets();
        const avatarUrls = new Map<string, string>();
        for (const asset of avatarAssets) avatarUrls.set(asset.personaKey, await blobToDataUrl(asset.blob));
        rooms.rooms.forEach(room => room.members.forEach(member => {
            const localKey = resolveRoomAvatarStorageKey(room.id, member);
            const restored = avatarUrls.get(localKey);
            if (restored) {
                member.avatarAssetKey = localKey;
                member.persona.avatarUrl = restored;
            }
            else if (member.persona.avatarUrl?.startsWith('private-avatar:')) member.persona.avatarUrl = null;
        }));
        this.roomManager.importData(rooms, true, mergeLocal,!!exactMergeConversations);
        await Promise.all([
            this.memoryManager.restorePrivateAvatars(),
            this.roomManager.restorePrivateAvatars(),
        ]);
        if(exactMergeConversations){
            for(const key of PERSISTED_APP_SETTING_KEYS){const value=payload.appSettings?.[key];if(typeof value==='string')localStorage.setItem(key,value);else localStorage.removeItem(key);}
            return;
        }
        Object.entries(payload.appSettings || {}).forEach(([key, value]) => {
            if (!isPersistedAppSettingKey(key) || typeof value !== 'string') return;
            const local=localStorage.getItem(key);
            const merged=mergeStructuredAppSetting(key,local,value);
            if(merged!==null){
                if(merged!==local)localStorage.setItem(key,merged);
            }else if(!mergeLocal||local===null)localStorage.setItem(key,value);
        });
    }

    private async refreshLocalIndexes(messageRows: CloudMessageRow[], mediaRows: CloudMediaRow[], payload: Partial<CloudStatePayload>) {
        const messageIndex: Record<string, string> = {};
        const conversationIndex: Record<string, string> = {};
        messageRows.forEach(row => {
            conversationIndex[row.conversation_key] = '1';
            messageIndex[this.messageIndexKey(row)] = hashText(JSON.stringify({
                position: row.position,
                role: row.role,
                speaker_id: row.speaker_id,
                content: row.content,
                created_at_ms: Number(row.created_at_ms),
            }));
        });
        await Promise.all([
            writeCloudSyncIndex(MESSAGE_INDEX_KEY, messageIndex),
            writeCloudSyncIndex(CONVERSATION_INDEX_KEY, conversationIndex),
            writeCloudSyncIndex(MEDIA_INDEX_KEY, Object.fromEntries(mediaRows.map(row => [row.asset_id, row.signature]))),
            writeCloudSyncIndex(STATE_ENTITY_INDEX_KEY, this.stateEntityIndex({
                customPersonas: payload.customPersonas || {},
                rooms: payload.rooms || { version: 2, rooms: [] },
            })),
        ]);
    }

    private async fetchAllRows<T>(table: string, order: Array<[string, boolean]>): Promise<T[]> {
        if (!this.client) return [];
        const rows: T[] = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
            let query = this.client.from(table).select('*');
            order.forEach(([column, ascending]) => {
                query = query.order(column, { ascending });
            });
            const response = await query.range(from, from + pageSize - 1);
            if (response.error) throw response.error;
            const page = (response.data || []) as T[];
            rows.push(...page);
            if (page.length < pageSize) break;
        }
        return rows;
    }

    private async startRealtime() {
        if (!this.client || !this.session) return;
        // Postgres Changes previously subscribed to state/conversation/message/media rows.
        // Supabase charges egress before the client can discard same-device events, so a
        // single device could echo its own large message/state payloads back through
        // Realtime. Keep Realtime disabled and use lightweight revision-head checks on
        // startup, reconnect, visibility changes and manual sync instead.
        await this.stopRealtime(false);
        this.clearRealtimeRetryState();
    }

    private async stopRealtime(resetRetryState = true) {
        if (resetRetryState) this.clearRealtimeRetryState();
        const channel = this.channel;
        this.channel = null;
        if (!this.client || !channel) return;
        try {
            await this.client.removeChannel(channel);
        } catch (error) {
            console.warn('Failed to remove stale realtime channel:', error);
        }
    }

    private markSynced(detail: string) {
        this.cloudRetryAttempt = 0;
        const lastSyncAt = Date.now();
        localStorage.setItem(LAST_SYNC_KEY, String(lastSyncAt));
        if (this.session) localStorage.setItem(SYNCED_USER_ID_KEY, this.session.user.id);
        this.setState('synced', detail, { lastSyncAt, progress: 100 });
    }

    private setPullRecoveryRequired(required: boolean) {
        this.pullRecoveryRequired = required;
        if (required) localStorage.setItem(PULL_RECOVERY_KEY, 'true');
        else localStorage.removeItem(PULL_RECOVERY_KEY);
    }

    private handleSyncError(error: unknown, prefix: string) {
        const detail = error instanceof Error ? error.message : String(error || '未知錯誤');
        console.error(prefix, error);
        this.setState(navigator.onLine ? 'error' : 'offline', `${prefix}：${detail}`, { progress: undefined });
        this.scheduleCloudRetry();
    }

    private stateEntityIndex(payload: Pick<CloudStatePayload, 'customPersonas' | 'rooms'>) {
        return Object.fromEntries([
            ...Object.keys(payload.customPersonas || {}).map(key => [`persona:${key}`, '1'] as const),
            ...(payload.rooms?.rooms || []).map(room => [`room:${room.id}`, '1'] as const),
        ]);
    }

    private localStateEntityIndex() {
        return this.stateEntityIndex({
            customPersonas: this.memoryManager.getModifiedAndCustomPersonas(),
            rooms: this.roomManager.exportData(),
        });
    }

    private async ensureStateEntityIndexBaseline() {
        const existing = await readCloudSyncIndex(STATE_ENTITY_INDEX_KEY);
        if (Object.keys(existing).length > 0) return;
        const local = this.localStateEntityIndex();
        if (Object.keys(local).length === 0) return;
        await writeCloudSyncIndex(STATE_ENTITY_INDEX_KEY, local);
    }

    private messageIndexKey(row: Pick<CloudMessageRow, 'conversation_key' | 'message_id'>) {
        return `${row.conversation_key}\u0000${row.message_id}`;
    }

}
