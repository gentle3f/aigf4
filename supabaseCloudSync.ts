import { createClient, RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import { listPersonaAvatarAssets, savePersonaAvatarBlob } from './avatarStore.js';
import { listChatAttachments, saveChatAttachment } from './chatMediaStore.js';
import { mergeChatHistoryMaps } from './cloudMessageMerge.js';
import { readCloudSyncIndex, writeCloudSyncIndex } from './cloudSyncIndexStore.js';
import { LOCAL_CLOUD_CHANGE_EVENT, LocalCloudChangeScope } from './cloudSyncEvents.js';
import { shouldSkipRedundantCloudPull } from './cloudSyncPullPolicy.js';
import { ChatMessage, MemoryManager, Persona } from './managers.js';
import { listCharacterPhotoAssets, saveCharacterPhotoAsset } from './photoStore.js';
import { ChatRoom, RoomManager } from './roomManager.js';

const OWNER_EMAIL = 'gentle3f@gmail.com';
const STORAGE_BUCKET = 'wetapp-private';
const DEVICE_ID_KEY = 'wetappCloudDeviceIdV1';
const MESSAGE_INDEX_KEY = 'wetappCloudMessageIndexV1';
const CONVERSATION_INDEX_KEY = 'wetappCloudConversationIndexV1';
const MEDIA_INDEX_KEY = 'wetappCloudMediaIndexV1';
const PENDING_KEY = 'wetappCloudPendingV1';
const LAST_SYNC_KEY = 'wetappCloudLastSyncAtV1';
const SYNCED_USER_ID_KEY = 'wetappCloudSyncedUserIdV1';
const PULL_RECOVERY_KEY = 'wetappCloudPullRecoveryV1';
const SAFE_MERGE_VERSION_KEY = 'wetappCloudSafeMergeV1';
const APP_SETTING_KEYS = [
    'veniceAssistantModel',
    'aigf4ChatModelSettingsV1',
    'veniceImageGenerateModel',
    'veniceImageEditModel',
    'veniceImageAdultConfirmed',
    'veniceImageSeed',
    'veniceImageSeedLocked',
    'veniceVideoImageModel',
    'veniceVideoTextModel',
    'veniceVideoAdultConfirmed',
    'aigf4RandomPersonaVariationsV2',
];

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_KEY = String(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || '',
).trim();

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

interface CloudStatePayload {
    schemaVersion: 1;
    customPersonas: Record<string, Persona>;
    diaries: ReturnType<MemoryManager['getAllDiaryEntries']>;
    interests: ReturnType<MemoryManager['getAllInterests']>;
    rooms: ReturnType<RoomManager['exportData']>;
    appSettings: Record<string, string>;
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
    private started = false;

    constructor(memoryManager: MemoryManager, roomManager: RoomManager, callbacks: CloudSyncCallbacks) {
        this.memoryManager = memoryManager;
        this.roomManager = roomManager;
        this.callbacks = callbacks;
        this.deviceId = this.getOrCreateDeviceId();
        this.client = SUPABASE_URL && SUPABASE_KEY
            ? createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                },
                realtime: { params: { eventsPerSecond: 4 } },
            })
            : null;
        this.state = {
            phase: this.client ? 'signed_out' : 'unconfigured',
            configured: Boolean(this.client),
            detail: this.client ? '登入後會自動同步所有對話與私人媒體。' : 'Supabase 尚未設定。',
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
        window.addEventListener('online', this.handleOnline);
        window.addEventListener('offline', this.handleOffline);
        document.addEventListener('visibilitychange', this.handleVisibilityChange);

        this.client.auth.onAuthStateChange((_event, session) => {
            window.setTimeout(() => void this.applySession(session), 0);
        });

        this.setState('connecting', '正在檢查雲端登入…');
        const { data, error } = await this.client.auth.getSession();
        if (error) {
            this.setState('error', error.message);
            return;
        }
        await this.applySession(data.session);
    }

    async sendMagicLink(email: string) {
        if (!this.client) throw new Error('Supabase 尚未設定。');
        const normalized = email.trim().toLocaleLowerCase();
        if (normalized !== OWNER_EMAIL) throw new Error('這個雲端空間只接受已設定的擁有人帳戶。');
        this.setState('sending_link', '正在寄出安全登入連結…');
        const { error } = await this.client.auth.signInWithOtp({
            email: normalized,
            options: {
                emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
                shouldCreateUser: true,
            },
        });
        if (error) {
            this.setState('error', error.message);
            throw error;
        }
        this.setState('signed_out', `登入連結已寄到 ${OWNER_EMAIL}，請在同一裝置開啟。`);
    }

    async signInWithPassword(email: string, password: string) {
        if (!this.client) throw new Error('Supabase 尚未設定。');
        const normalized = email.trim().toLocaleLowerCase();
        if (normalized !== OWNER_EMAIL) throw new Error('這個雲端空間只接受已設定的擁有人帳戶。');
        if (!password) throw new Error('請輸入雲端密碼。');
        this.setState('connecting', '正在以密碼登入…');
        const { data, error } = await this.client.auth.signInWithPassword({
            email: normalized,
            password,
        });
        if (error) {
            const message = /invalid login credentials/iu.test(error.message)
                ? '電郵或雲端密碼不正確。'
                : error.message;
            this.setState('signed_out', message);
            throw new Error(message);
        }
        await this.applySession(data.session);
    }

    async setPassword(password: string) {
        if (!this.client || !this.session) throw new Error('請先登入 Supabase 雲端。');
        if (password.length < 8) throw new Error('雲端密碼至少需要 8 個字元。');
        this.setState('connecting', '正在設定雲端密碼…');
        const { error } = await this.client.auth.updateUser({ password });
        if (error) {
            this.setState('error', error.message);
            throw error;
        }
        this.setState('synced', '雲端密碼已設定；新裝置可直接用密碼登入。', {
            lastSyncAt: this.state.lastSyncAt,
            progress: 100,
        });
    }

    async signOut() {
        if (!this.client) return;
        await this.client.auth.signOut();
        await this.stopRealtime();
        this.session = null;
        this.initializedUserId = '';
        this.setState('signed_out', '已登出；本機資料仍完整保留。');
    }

    async syncNow() {
        if (!this.session) throw new Error('請先登入 Supabase 雲端。');
        if (this.pullRecoveryRequired || localStorage.getItem(SAFE_MERGE_VERSION_KEY) !== '1') {
            await this.recoverCloudSafely();
            return;
        }
        localStorage.setItem(PENDING_KEY, 'true');
        await this.pushLocalToCloud();
    }

    async reloadFromCloud() {
        if (!this.session) throw new Error('請先登入 Supabase 雲端。');
        await this.recoverCloudSafely();
    }

    private readonly handleLocalChange = (event: CustomEvent<{ scope?: LocalCloudChangeScope }>) => {
        if (this.applyingRemote || this.pushing) return;
        localStorage.setItem(PENDING_KEY, 'true');
        if (!this.session || !this.initializedUserId || this.pullRecoveryRequired) return;
        this.schedulePush(event.detail?.scope === 'media' ? 400 : 1200);
    };

    private readonly handleOnline = () => {
        if (!this.session) return;
        if (this.pullRecoveryRequired) this.schedulePull(250);
        else if (localStorage.getItem(PENDING_KEY) === 'true') this.schedulePush(250);
        else this.schedulePull(500);
    };

    private readonly handleOffline = () => {
        if (this.session) this.setState('offline', '目前離線；變更會保留在本機，連線後自動補傳。');
    };

    private readonly handleVisibilityChange = () => {
        if (!this.session) return;
        if (document.visibilityState === 'hidden' && localStorage.getItem(PENDING_KEY) === 'true') {
            this.schedulePush(0);
        } else if (document.visibilityState === 'visible') {
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

    private async applySession(session: Session | null) {
        this.session = session;
        if (!session) {
            this.initializedUserId = '';
            await this.stopRealtime();
            this.setState('signed_out', '登入後會自動同步所有對話與私人媒體。');
            return;
        }
        if (session.user.email?.toLocaleLowerCase() !== OWNER_EMAIL) {
            await this.client?.auth.signOut();
            this.session = null;
            this.setState('error', '此帳戶沒有 Wetapp 雲端資料權限。');
            return;
        }
        if (this.initializedUserId === session.user.id) return;
        this.initializedUserId = session.user.id;
        this.setState('connecting', '正在連接私人雲端空間…');
        await this.initialSync();
        await this.startRealtime();
    }

    private async initialSync() {
        if (!this.client || !this.session) return;
        try {
            const [{ data: remoteState, error: stateError }, { count, error: countError }] = await Promise.all([
                this.client.from('wetapp_state').select('revision,updated_at,source_device_id').maybeSingle(),
                this.client.from('wetapp_messages').select('message_id', { count: 'exact', head: true }),
            ]);
            if (stateError) throw stateError;
            if (countError) throw countError;
            const cloudIsEmpty = !remoteState && !count;
            const deviceHasSynced = localStorage.getItem(SYNCED_USER_ID_KEY) === this.session.user.id
                || remoteState?.source_device_id === this.deviceId;
            const hasPendingChanges = localStorage.getItem(PENDING_KEY) === 'true';
            const safeMergeRequired = localStorage.getItem(SAFE_MERGE_VERSION_KEY) !== '1';
            if (deviceHasSynced && (this.pullRecoveryRequired || safeMergeRequired)) {
                await this.recoverCloudSafely();
            } else if (cloudIsEmpty || (deviceHasSynced && hasPendingChanges)) {
                localStorage.setItem(PENDING_KEY, 'true');
                await this.pushLocalToCloud(true);
            } else if (shouldSkipRedundantCloudPull({
                force: false,
                cloudSourceDeviceId: remoteState?.source_device_id,
                localDeviceId: this.deviceId,
                syncedUserId: localStorage.getItem(SYNCED_USER_ID_KEY),
                sessionUserId: this.session.user.id,
                hasPendingChanges,
            })) {
                this.setPullRecoveryRequired(false);
                this.markSynced('本機已是雲端最新版本，毋須重複下載。');
            } else {
                // An unknown device must accept the established cloud copy before it can upload.
                localStorage.removeItem(PENDING_KEY);
                await this.pullCloudToLocal();
            }
        } catch (error) {
            this.handleSyncError(error, '首次雲端同步失敗');
        }
    }

    private schedulePush(delay: number) {
        if (this.pushTimer !== null) window.clearTimeout(this.pushTimer);
        this.pushTimer = window.setTimeout(() => {
            this.pushTimer = null;
            void this.pushLocalToCloud();
        }, delay);
    }

    private schedulePull(delay: number) {
        if (this.pullTimer !== null || this.pushing || this.pulling) return;
        this.pullTimer = window.setTimeout(() => {
            this.pullTimer = null;
            if (this.pullRecoveryRequired) void this.recoverCloudSafely();
            else if (localStorage.getItem(PENDING_KEY) === 'true') void this.pushLocalToCloud();
            else void this.pullCloudToLocal();
        }, delay);
    }

    private async recoverCloudSafely() {
        if (!this.client || !this.session || this.pushing || this.pulling) return false;
        localStorage.setItem(PENDING_KEY, 'true');
        const pushed = await this.pushLocalToCloud(false, true);
        if (!pushed) return false;
        const pulled = await this.pullCloudToLocal(true, true);
        if (!pulled) return false;
        localStorage.setItem(SAFE_MERGE_VERSION_KEY, '1');
        localStorage.setItem(PENDING_KEY, 'true');
        return this.pushLocalToCloud();
    }

    private async pushLocalToCloud(initial = false, preserveRemote = false): Promise<boolean> {
        if (!this.client || !this.session || this.pushing || this.pulling) return false;
        if (!navigator.onLine) {
            this.setState('offline', '目前離線；變更會保留在本機，連線後自動補傳。');
            return false;
        }
        this.pushing = true;
        try {
            this.setState('pushing', initial ? '正在建立第一份完整雲端資料…' : '正在同步本機變更…', { progress: 5 });
            const payload = await this.buildStatePayload();
            const media = await this.collectLocalMedia(payload.rooms.rooms);
            await this.pushMedia(media, preserveRemote);
            this.setState('pushing', '正在同步對話訊息…', { progress: 55 });
            await this.pushMessages(preserveRemote);
            if (preserveRemote) {
                this.setState('connecting', '本機訊息已安全保留，正在合併雲端資料…', { progress: 94 });
            } else {
                this.setState('pushing', '正在提交角色、記憶與聊天室設定…', { progress: 88 });
                const { error } = await this.client.rpc('wetapp_save_state', {
                    new_payload: payload,
                    new_device_id: this.deviceId,
                });
                if (error) throw error;
                localStorage.removeItem(PENDING_KEY);
                this.setPullRecoveryRequired(false);
                this.markSynced(initial ? '第一份完整雲端資料已建立。' : '所有變更已同步。');
            }
            return true;
        } catch (error) {
            localStorage.setItem(PENDING_KEY, 'true');
            this.handleSyncError(error, '上傳雲端失敗');
            return false;
        } finally {
            this.pushing = false;
        }
    }

    private async pullCloudToLocal(force = false, mergeLocal = false): Promise<boolean> {
        if (!this.client || !this.session || this.pulling || this.pushing) return false;
        if (!navigator.onLine) {
            this.setState('offline', '目前離線；正在使用這部裝置的最近資料。');
            return false;
        }
        this.pulling = true;
        this.applyingRemote = true;
        try {
            this.setState('pulling', '正在下載雲端變更…', { progress: 8 });
            const stateResponse = await this.client.from('wetapp_state').select('payload,revision,updated_at,source_device_id').maybeSingle();
            if (stateResponse.error) throw stateResponse.error;
            if (shouldSkipRedundantCloudPull({
                force,
                cloudSourceDeviceId: stateResponse.data?.source_device_id,
                localDeviceId: this.deviceId,
                syncedUserId: localStorage.getItem(SYNCED_USER_ID_KEY),
                sessionUserId: this.session.user.id,
                hasPendingChanges: localStorage.getItem(PENDING_KEY) === 'true',
            })) {
                this.setPullRecoveryRequired(false);
                this.markSynced('本機已是雲端最新版本，毋須重複下載。');
                return true;
            }
            const [messageRows, mediaRows] = await Promise.all([
                this.fetchAllRows<CloudMessageRow>('wetapp_messages', [
                    ['conversation_key', true],
                    ['position', true],
                ]),
                this.fetchAllRows<CloudMediaRow>('wetapp_media', [['created_at_ms', true]]),
            ]);
            this.setState('pulling', `正在還原 ${mediaRows.length} 個私人媒體檔案…`, { progress: 35 });
            await this.pullMedia(mediaRows);
            this.setState('pulling', `正在整理 ${messageRows.length.toLocaleString('zh-HK')} 則訊息…`, { progress: 72 });
            await this.applyRemoteData(
                (stateResponse.data?.payload || {}) as Partial<CloudStatePayload>,
                messageRows,
                mergeLocal,
            );
            await this.refreshLocalIndexes(messageRows, mediaRows);
            localStorage.removeItem(PENDING_KEY);
            this.setPullRecoveryRequired(false);
            localStorage.setItem(SAFE_MERGE_VERSION_KEY, '1');
            this.callbacks.onRemoteApplied();
            this.markSynced('已載入雲端最新資料。');
            return true;
        } catch (error) {
            localStorage.setItem(PENDING_KEY, 'true');
            this.setPullRecoveryRequired(true);
            this.handleSyncError(error, '下載雲端資料失敗');
            return false;
        } finally {
            this.applyingRemote = false;
            this.pulling = false;
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
                const localKey = this.roomAvatarKey(room.id, member.id);
                if (isLocalImageUrl(member.persona.avatarUrl)) {
                    try {
                        const blob = await fetch(member.persona.avatarUrl!).then(response => response.blob());
                        const existing = existingAvatarAssets.get(localKey);
                        if (!existing || !await blobsMatch(existing.blob, blob)) {
                            await savePersonaAvatarBlob(localKey, blob, Date.now());
                        }
                        member.persona.avatarUrl = `private-avatar:${localKey}`;
                    } catch (error) {
                        console.warn(`Unable to stage the room avatar for ${member.persona.name}.`, error);
                    }
                }
            }
        }

        const appSettings = Object.fromEntries(
            APP_SETTING_KEYS.flatMap(key => {
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

    private async pushMessages(preserveRemote = false) {
        if (!this.client || !this.session) return;
        const { conversations, messages, hashes } = this.collectLocalMessages();
        const previousHashes = await readCloudSyncIndex(MESSAGE_INDEX_KEY);
        const changed = messages.filter(row => previousHashes[this.messageIndexKey(row)] !== hashes[this.messageIndexKey(row)]);
        const removedKeys = Object.keys(previousHashes).filter(key => !hashes[key]);

        for (const batch of batches(conversations, 100)) {
            const { error } = await this.client.from('wetapp_conversations').upsert(batch, {
                onConflict: 'user_id,conversation_key',
            });
            if (error) throw error;
        }
        for (const [index, batch] of batches(changed, 100).entries()) {
            const { error } = await this.client.from('wetapp_messages').upsert(batch, {
                onConflict: 'user_id,conversation_key,message_id',
            });
            if (error) throw error;
            const denominator = Math.max(1, Math.ceil(changed.length / 100));
            this.setState('pushing', `正在同步對話訊息 ${index + 1}/${denominator}…`, {
                progress: 55 + Math.round(((index + 1) / denominator) * 27),
            });
        }
        if (!preserveRemote) {
            const removedByConversation = new Map<string, string[]>();
            removedKeys.forEach(key => {
                const splitAt = key.indexOf('\u0000');
                if (splitAt < 0) return;
                const conversationKey = key.slice(0, splitAt);
                const messageId = key.slice(splitAt + 1);
                const ids = removedByConversation.get(conversationKey) || [];
                ids.push(messageId);
                removedByConversation.set(conversationKey, ids);
            });
            for (const [conversationKey, ids] of removedByConversation) {
                for (const batch of batches(ids, 50)) {
                    const { error } = await this.client.from('wetapp_messages')
                        .delete()
                        .eq('conversation_key', conversationKey)
                        .in('message_id', batch);
                    if (error) throw error;
                }
            }
        }

        const previousConversations = await readCloudSyncIndex(CONVERSATION_INDEX_KEY);
        const conversationIndex = Object.fromEntries(conversations.map(row => [row.conversation_key, '1']));
        if (!preserveRemote) {
            const removedConversations = Object.keys(previousConversations).filter(key => !conversationIndex[key]);
            for (const batch of batches(removedConversations, 50)) {
                const { error } = await this.client.from('wetapp_conversations').delete().in('conversation_key', batch);
                if (error) throw error;
            }
        }
        await writeCloudSyncIndex(MESSAGE_INDEX_KEY, hashes);
        await writeCloudSyncIndex(CONVERSATION_INDEX_KEY, conversationIndex);
    }

    private collectLocalMessages() {
        if (!this.session) return { conversations: [], messages: [], hashes: {} } as {
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
                user_id: this.session!.user.id,
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
                    user_id: this.session!.user.id,
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

    private async collectLocalMedia(rooms: ChatRoom[]): Promise<LocalCloudMedia[]> {
        if (!this.session) return [];
        const [avatarAssets, photoAssets, attachmentAssets] = await Promise.all([
            listPersonaAvatarAssets(),
            listCharacterPhotoAssets(),
            listChatAttachments(),
        ]);
        const activePersonaKeys = new Set(Object.keys(this.memoryManager.getAllPersonas()));
        const roomAvatarTargets = new Map<string, { roomId: string; memberId: string }>();
        rooms.forEach(room => room.members.forEach(member => {
            roomAvatarTargets.set(this.roomAvatarKey(room.id, member.id), { roomId: room.id, memberId: member.id });
        }));
        const userId = this.session.user.id;
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
            const assetId = `character-photo:${asset.id}`;
            result.push({
                user_id: userId,
                asset_id: assetId,
                conversation_key: asset.personaKey,
                kind: 'character_photo',
                storage_path: `${userId}/character_photo/${safeAssetPath(assetId)}`,
                mime_type: asset.blob.type || 'image/jpeg',
                byte_size: asset.blob.size,
                signature: `${asset.blob.size}:${asset.blob.type}:${asset.createdAt}:${hashText(asset.prompt || '')}`,
                metadata: { id: asset.id, personaKey: asset.personaKey, prompt: asset.prompt },
                source_device_id: this.deviceId,
                created_at_ms: asset.createdAt,
                blob: asset.blob,
            });
        });
        attachmentAssets.forEach(asset => {
            const assetId = `attachment:${asset.id}`;
            result.push({
                user_id: userId,
                asset_id: assetId,
                conversation_key: asset.conversationKey,
                kind: 'attachment',
                storage_path: `${userId}/attachment/${safeAssetPath(assetId)}`,
                mime_type: asset.mimeType || asset.blob.type || 'application/octet-stream',
                byte_size: asset.blob.size,
                signature: `${asset.blob.size}:${asset.mimeType}:${asset.createdAt}:${asset.name}`,
                metadata: {
                    id: asset.id,
                    conversationKey: asset.conversationKey,
                    name: asset.name,
                },
                source_device_id: this.deviceId,
                created_at_ms: asset.createdAt,
                blob: asset.blob,
            });
        });
        return result;
    }

    private async pushMedia(media: LocalCloudMedia[], preserveRemote = false) {
        if (!this.client) return;
        const previousIndex = await readCloudSyncIndex(MEDIA_INDEX_KEY);
        const nextIndex = Object.fromEntries(media.map(asset => [asset.asset_id, asset.signature]));
        const changed = media.filter(asset => previousIndex[asset.asset_id] !== asset.signature);
        for (const [index, asset] of changed.entries()) {
            const upload = await this.client.storage.from(STORAGE_BUCKET).upload(asset.storage_path, asset.blob, {
                contentType: asset.mime_type,
                upsert: true,
                cacheControl: '3600',
            });
            if (upload.error) throw upload.error;
            const { blob: _blob, ...row } = asset;
            const metadata = await this.client.from('wetapp_media').upsert(row, {
                onConflict: 'user_id,asset_id',
            });
            if (metadata.error) throw metadata.error;
            this.setState('pushing', `正在同步私人媒體 ${index + 1}/${changed.length}…`, {
                progress: 8 + Math.round(((index + 1) / Math.max(1, changed.length)) * 42),
            });
        }

        if (!preserveRemote) {
            const removedIds = Object.keys(previousIndex).filter(assetId => !nextIndex[assetId]);
            for (const batch of batches(removedIds, 50)) {
                const existing = await this.client.from('wetapp_media').select('asset_id,storage_path').in('asset_id', batch);
                if (existing.error) throw existing.error;
                const paths = (existing.data || []).map(row => row.storage_path);
                if (paths.length) {
                    const removal = await this.client.storage.from(STORAGE_BUCKET).remove(paths);
                    if (removal.error) throw removal.error;
                }
                const deletion = await this.client.from('wetapp_media').delete().in('asset_id', batch);
                if (deletion.error) throw deletion.error;
            }
        }
        await writeCloudSyncIndex(MEDIA_INDEX_KEY, nextIndex);
    }

    private async pullMedia(rows: CloudMediaRow[]) {
        if (!this.client) return;
        const previousIndex = await readCloudSyncIndex(MEDIA_INDEX_KEY);
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
            const metadata = row.metadata || {};
            if (row.kind === 'persona_avatar' || row.kind === 'room_avatar') {
                await savePersonaAvatarBlob(String(metadata.localKey || ''), download.data, row.created_at_ms);
            } else if (row.kind === 'character_photo') {
                await saveCharacterPhotoAsset({
                    id: String(metadata.id || row.asset_id.replace(/^character-photo:/u, '')),
                    personaKey: String(metadata.personaKey || row.conversation_key || ''),
                    prompt: String(metadata.prompt || ''),
                    createdAt: row.created_at_ms,
                    blob: download.data,
                });
            } else {
                await saveChatAttachment({
                    id: String(metadata.id || row.asset_id.replace(/^attachment:/u, '')),
                    conversationKey: String(metadata.conversationKey || row.conversation_key || ''),
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
    ) {
        const cloudChatHistories: Record<string, ChatMessage[]> = {};
        rows.forEach(row => {
            (cloudChatHistories[row.conversation_key] ||= []).push({
                id: row.message_id,
                createdAt: Number(row.created_at_ms),
                speakerId: row.speaker_id || undefined,
                role: row.role,
                content: clone(row.content || {}),
            });
        });
        const chatHistories = mergeLocal
            ? mergeChatHistoryMaps(clone(this.memoryManager.getAllChatHistories()), cloudChatHistories)
            : cloudChatHistories;
        const customPersonas = mergeLocal
            ? { ...clone(payload.customPersonas || {}), ...clone(this.memoryManager.getModifiedAndCustomPersonas()) }
            : clone(payload.customPersonas || {});
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

        const remoteRooms = clone(payload.rooms || { version: 2, rooms: [] });
        const rooms = mergeLocal
            ? {
                version: 2 as const,
                rooms: [...new Map([
                    ...remoteRooms.rooms.map(room => [room.id, room] as const),
                    ...this.roomManager.exportData().rooms.map(room => [room.id, room] as const),
                ]).values()],
            }
            : remoteRooms;
        const avatarAssets = await listPersonaAvatarAssets();
        const avatarUrls = new Map<string, string>();
        for (const asset of avatarAssets) avatarUrls.set(asset.personaKey, await blobToDataUrl(asset.blob));
        rooms.rooms.forEach(room => room.members.forEach(member => {
            const localKey = this.roomAvatarKey(room.id, member.id);
            const restored = avatarUrls.get(localKey);
            if (restored) member.persona.avatarUrl = restored;
            else if (member.persona.avatarUrl?.startsWith('private-avatar:')) member.persona.avatarUrl = null;
        }));
        this.roomManager.importData(rooms, true);
        await this.memoryManager.restorePrivateAvatars();
        Object.entries(payload.appSettings || {}).forEach(([key, value]) => {
            if (
                APP_SETTING_KEYS.includes(key)
                && typeof value === 'string'
                && (!mergeLocal || localStorage.getItem(key) === null)
            ) localStorage.setItem(key, value);
        });
    }

    private async refreshLocalIndexes(messageRows: CloudMessageRow[], mediaRows: CloudMediaRow[]) {
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
        await this.stopRealtime();
        const userId = this.session.user.id;
        this.channel = this.client.channel(`wetapp-sync-${userId}`);
        ['wetapp_state', 'wetapp_conversations', 'wetapp_messages', 'wetapp_media'].forEach(table => {
            this.channel!.on('postgres_changes', {
                event: '*',
                schema: 'public',
                table,
                filter: `user_id=eq.${userId}`,
            }, payload => {
                const sourceDeviceId = String(
                    (payload.new as Record<string, unknown>)?.source_device_id
                    || (payload.old as Record<string, unknown>)?.source_device_id
                    || '',
                );
                if (sourceDeviceId === this.deviceId || this.applyingRemote || this.pushing) return;
                this.schedulePull(900);
            });
        });
        this.channel.subscribe(status => {
            if (status === 'CHANNEL_ERROR') this.setState('error', '即時更新連線暫時中斷，稍後會自動重試。');
        });
    }

    private async stopRealtime() {
        if (!this.client || !this.channel) return;
        await this.client.removeChannel(this.channel);
        this.channel = null;
    }

    private markSynced(detail: string) {
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
    }

    private messageIndexKey(row: Pick<CloudMessageRow, 'conversation_key' | 'message_id'>) {
        return `${row.conversation_key}\u0000${row.message_id}`;
    }

    private roomAvatarKey(roomId: string, memberId: string) {
        return `room-avatar:${roomId}:${memberId}`;
    }
}
