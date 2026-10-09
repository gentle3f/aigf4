import { RESEARCH_CAPTURE_SETTING_KEY, setPersistedAppSetting } from './appSettings.js';
import type { ReviewState } from './engine/contracts.js';
import type { JevShadowRecord } from './engine/review/jevShadow.js';
import type { GroupGenerationResult } from './groupChat.js';
import type { ChatSegment } from './managers.js';

export { RESEARCH_CAPTURE_SETTING_KEY };
export const RESEARCH_CAPTURE_PENDING_EVENT = 'aigf4:research-capture-pending';
export const RESEARCH_CAPTURE_DB_NAME = 'aigf4ResearchCaptureV1';
export const RESEARCH_CAPTURE_DB_VERSION = 1;
export const RESEARCH_CAPTURE_STORE = 'turns';
export const RESEARCH_CAPTURE_MAX_LOCAL_RECORDS = 1000;
export const RESEARCH_CAPTURE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface GroupInteractionMetrics {
    segmentCount: number;
    narrationCount: number;
    dialogueCount: number;
    uniqueSpeakerCount: number;
    dialogueSpeakerIds: string[];
    narratorFirst: boolean;
    narratorLast: boolean;
    everyonePresentSpeaks: boolean;
    directCharacterToCharacterTransitions: number;
    speakerReentryCount: number;
    narrationBetweenEverySpeakerChange: boolean;
}

export interface ResearchGemmaResult {
    decision: 'keep' | 'revise' | 'unavailable';
    issueCodes: string[];
    revisedResponse?: string;
    revisionAccepted?: boolean;
}

export interface ResearchGroupTurnRecord {
    schemaVersion: 1;
    recordId: string;
    createdAtMs: number;
    updatedAtMs: number;
    syncState: 'pending' | 'synced';
    syncedAtMs?: number;
    lifecycle: 'captured' | 'completed' | 'failed';
    requestId: string;
    conversationKey: string;
    mode: 'group';
    userMessage: string;
    reviewState: ReviewState;
    candidate: {
        text: string;
        segments: ChatSegment[];
        scene: GroupGenerationResult['scene'];
        interaction: GroupInteractionMetrics;
    };
    final?: {
        text: string;
        segments: ChatSegment[];
        scene: GroupGenerationResult['scene'];
        interaction: GroupInteractionMetrics;
    };
    gemma?: ResearchGemmaResult;
    jev?: JevShadowRecord;
    failure?: {
        stage: string;
        message: string;
    };
}

type ResearchRecordPatch = Partial<Omit<ResearchGroupTurnRecord, 'schemaVersion' | 'recordId' | 'createdAtMs' | 'updatedAtMs' | 'syncState'>>;

const canUseLocalStorage = () => typeof localStorage !== 'undefined';
const canUseIndexedDb = () => typeof indexedDB !== 'undefined';

export const isResearchCaptureEnabled = () => {
    if (!canUseLocalStorage()) return false;
    try {
        return localStorage.getItem(RESEARCH_CAPTURE_SETTING_KEY) === 'true';
    } catch {
        return false;
    }
};

export const setResearchCaptureEnabled = (enabled: boolean) => {
    if (!canUseLocalStorage()) return false;
    try {
        return setPersistedAppSetting(RESEARCH_CAPTURE_SETTING_KEY, enabled ? 'true' : 'false');
    } catch {
        return false;
    }
};

const clone = <T>(value: T): T => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value)) as T;
};

export const createResearchRecordId = () => {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        // Fall through to a stable-enough local ID. It never acts as a credential.
    }
    return `research-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const isNarration = (segment: ChatSegment) => segment.type === 'narration';

export const measureGroupInteraction = (
    segments: readonly ChatSegment[],
    presentMemberIds: readonly string[] = [],
): GroupInteractionMetrics => {
    const dialogue = segments.filter(segment => !isNarration(segment));
    const dialogueSpeakerIds = dialogue
        .map(segment => ('speakerId' in segment ? String(segment.speakerId || '') : ''))
        .filter(Boolean);
    const uniqueSpeakerIds = [...new Set(dialogueSpeakerIds)];

    let directCharacterToCharacterTransitions = 0;
    for (let index = 1; index < segments.length; index += 1) {
        const previous = segments[index - 1];
        const current = segments[index];
        if (
            !isNarration(previous)
            && !isNarration(current)
            && 'speakerId' in previous
            && 'speakerId' in current
            && previous.speakerId
            && current.speakerId
            && previous.speakerId !== current.speakerId
        ) {
            directCharacterToCharacterTransitions += 1;
        }
    }

    let speakerReentryCount = 0;
    const seen = new Set<string>();
    let previousSpeaker = '';
    dialogueSpeakerIds.forEach(speakerId => {
        if (seen.has(speakerId) && speakerId !== previousSpeaker) speakerReentryCount += 1;
        seen.add(speakerId);
        previousSpeaker = speakerId;
    });

    const speakerChanges: number[] = [];
    let lastDialogueIndex = -1;
    let lastSpeaker = '';
    segments.forEach((segment, index) => {
        if (isNarration(segment) || !('speakerId' in segment) || !segment.speakerId) return;
        if (lastDialogueIndex >= 0 && lastSpeaker !== segment.speakerId) speakerChanges.push(index);
        lastDialogueIndex = index;
        lastSpeaker = segment.speakerId;
    });
    const narrationBetweenEverySpeakerChange = speakerChanges.length > 0
        ? speakerChanges.every(index => isNarration(segments[index - 1]))
        : false;

    const present = [...new Set(presentMemberIds.filter(Boolean))];

    return {
        segmentCount: segments.length,
        narrationCount: segments.filter(isNarration).length,
        dialogueCount: dialogue.length,
        uniqueSpeakerCount: uniqueSpeakerIds.length,
        dialogueSpeakerIds,
        narratorFirst: Boolean(segments.length && isNarration(segments[0])),
        narratorLast: Boolean(segments.length && isNarration(segments[segments.length - 1])),
        everyonePresentSpeaks: present.length > 0 && present.every(id => uniqueSpeakerIds.includes(id)),
        directCharacterToCharacterTransitions,
        speakerReentryCount,
        narrationBetweenEverySpeakerChange,
    };
};

export const buildResearchGroupTurnRecord = ({
    recordId = createResearchRecordId(),
    requestId,
    conversationKey,
    userMessage,
    reviewState,
    candidate,
    createdAtMs = Date.now(),
}: {
    recordId?: string;
    requestId: string;
    conversationKey: string;
    userMessage: string;
    reviewState: ReviewState;
    candidate: GroupGenerationResult;
    createdAtMs?: number;
}): ResearchGroupTurnRecord => ({
    schemaVersion: 1,
    recordId,
    createdAtMs,
    updatedAtMs: createdAtMs,
    syncState: 'pending',
    lifecycle: 'captured',
    requestId,
    conversationKey,
    mode: 'group',
    userMessage,
    reviewState: clone(reviewState),
    candidate: {
        text: candidate.text,
        segments: clone(candidate.segments),
        scene: clone(candidate.scene),
        interaction: measureGroupInteraction(candidate.segments, candidate.scene.presentMemberIds),
    },
});

const openResearchDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
        reject(new Error('IndexedDB unavailable'));
        return;
    }
    const request = indexedDB.open(RESEARCH_CAPTURE_DB_NAME, RESEARCH_CAPTURE_DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Unable to open research capture database.'));
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(RESEARCH_CAPTURE_STORE)) {
            const store = db.createObjectStore(RESEARCH_CAPTURE_STORE, { keyPath: 'recordId' });
            store.createIndex('createdAtMs', 'createdAtMs');
            store.createIndex('syncState', 'syncState');
        }
    };
    request.onsuccess = () => resolve(request.result);
});

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Research capture database request failed.'));
});

const withStore = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> => {
    const db = await openResearchDb();
    try {
        const transaction = db.transaction(RESEARCH_CAPTURE_STORE, mode);
        const store = transaction.objectStore(RESEARCH_CAPTURE_STORE);
        const result = await action(store);
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Research capture transaction failed.'));
            transaction.onabort = () => reject(transaction.error || new Error('Research capture transaction aborted.'));
        });
        return result;
    } finally {
        db.close();
    }
};

const notifyPendingResearch = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(RESEARCH_CAPTURE_PENDING_EVENT));
};

const sanitizeForStorage = (record: ResearchGroupTurnRecord): ResearchGroupTurnRecord => {
    const safe = clone(record);
    safe.schemaVersion = 1;
    safe.mode = 'group';
    safe.syncState = record.syncState === 'synced' ? 'synced' : 'pending';
    return safe;
};

export const saveResearchTurnRecord = async (record: ResearchGroupTurnRecord) => {
    if (!canUseIndexedDb()) return false;
    const next = sanitizeForStorage({
        ...record,
        syncState: 'pending',
        syncedAtMs: undefined,
        updatedAtMs: Date.now(),
    });
    await withStore('readwrite', async store => {
        await requestResult(store.put(next));
        return undefined;
    });
    notifyPendingResearch();
    void pruneResearchTurnRecords().catch(() => undefined);
    return true;
};

export const patchResearchTurnRecord = async (
    recordId: string,
    patch: ResearchRecordPatch,
) => {
    if (!canUseIndexedDb()) return false;
    let changed = false;
    await withStore('readwrite', async store => {
        const current = await requestResult(store.get(recordId)) as ResearchGroupTurnRecord | undefined;
        if (!current || current.schemaVersion !== 1) return undefined;
        const next: ResearchGroupTurnRecord = sanitizeForStorage({
            ...current,
            ...clone(patch),
            recordId: current.recordId,
            createdAtMs: current.createdAtMs,
            updatedAtMs: Math.max(Date.now(), current.updatedAtMs + 1),
            syncState: 'pending',
            syncedAtMs: undefined,
        });
        await requestResult(store.put(next));
        changed = true;
        return undefined;
    });
    if (changed) notifyPendingResearch();
    return changed;
};

export const listPendingResearchTurnRecords = async (limit = 20): Promise<ResearchGroupTurnRecord[]> => {
    if (!canUseIndexedDb()) return [];
    return withStore('readonly', async store => {
        const all = await requestResult(store.getAll()) as ResearchGroupTurnRecord[];
        return all
            .filter(record => (
                record.schemaVersion === 1
                && record.syncState === 'pending'
                && record.lifecycle !== 'captured'
            ))
            .sort((left, right) => left.createdAtMs - right.createdAtMs)
            .slice(0, Math.max(1, limit))
            .map(clone);
    });
};

export const listResearchTurnRecordsPage = async (
    offset = 0,
    limit = 50,
): Promise<ResearchGroupTurnRecord[]> => {
    if (!canUseIndexedDb()) return [];
    const skip = Math.max(0, Math.floor(offset));
    const take = Math.min(100, Math.max(1, Math.floor(limit)));
    return withStore('readonly', store => new Promise<ResearchGroupTurnRecord[]>((resolve, reject) => {
        const rows: ResearchGroupTurnRecord[] = [];
        const request = store.index('createdAtMs').openCursor(null, 'prev');
        let skipped = false;
        request.onerror = () => reject(request.error || new Error('Research archive page read failed.'));
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor || rows.length >= take) {
                resolve(rows);
                return;
            }
            if (!skipped && skip) {
                skipped = true;
                cursor.advance(skip);
                return;
            }
            skipped = true;
            const record = cursor.value as ResearchGroupTurnRecord;
            if (record.schemaVersion === 1) rows.push(record);
            if (rows.length >= take) resolve(rows);
            else cursor.continue();
        };
    }));
};

export const listRecentResearchTurnRecords = async (limit = 100): Promise<ResearchGroupTurnRecord[]> => (
    listResearchTurnRecordsPage(0, limit)
);

export const markResearchTurnsSynced = async (
    uploaded: ReadonlyArray<{ recordId: string; updatedAtMs: number }>,
    syncedAtMs = Date.now(),
) => {
    if (!canUseIndexedDb() || uploaded.length === 0) return 0;
    let marked = 0;
    const expected = new Map(uploaded.map(item => [item.recordId, item.updatedAtMs]));
    await withStore('readwrite', async store => {
        for (const [recordId, expectedUpdatedAtMs] of expected) {
            const current = await requestResult(store.get(recordId)) as ResearchGroupTurnRecord | undefined;
            if (!current || current.updatedAtMs !== expectedUpdatedAtMs || current.syncState !== 'pending') continue;
            await requestResult(store.put({
                ...current,
                syncState: 'synced',
                syncedAtMs,
            }));
            marked += 1;
        }
        return undefined;
    });
    return marked;
};

export const getResearchCaptureStats = async () => {
    if (!canUseIndexedDb()) return { total: 0, pending: 0, oldestAtMs: undefined as number | undefined };
    return withStore('readonly', async store => {
        // Count/index lookups do not materialize every full conversation in phone memory.
        const totalRequest = store.count();
        const pendingRequest = store.index('syncState').count('pending');
        const oldestRequest = store.index('createdAtMs').openCursor();
        const [total, pending, oldest] = await Promise.all([
            requestResult(totalRequest),
            requestResult(pendingRequest),
            requestResult(oldestRequest),
        ]);
        return {
            total,
            pending,
            oldestAtMs: oldest ? Number(oldest.key) : undefined,
        };
    });
};

export const pruneResearchTurnRecords = async (
    now = Date.now(),
    maxRecords = RESEARCH_CAPTURE_MAX_LOCAL_RECORDS,
    retentionMs = RESEARCH_CAPTURE_RETENTION_MS,
) => {
    if (!canUseIndexedDb()) return 0;
    let removed = 0;
    await withStore('readwrite', async store => {
        const all = (await requestResult(store.getAll()) as ResearchGroupTurnRecord[])
            .filter(record => record.schemaVersion === 1)
            .sort((left, right) => left.createdAtMs - right.createdAtMs);
        const expiredBefore = now - retentionMs;
        const expired = all.filter(record => record.createdAtMs < expiredBefore);
        const remaining = all.filter(record => record.createdAtMs >= expiredBefore);
        const excessCount = Math.max(0, remaining.length - maxRecords);
        const excess = remaining.slice(0, excessCount);
        const ids = new Set([...expired, ...excess].map(record => record.recordId));
        for (const recordId of ids) {
            await requestResult(store.delete(recordId));
            removed += 1;
        }
        return undefined;
    });
    return removed;
};

export const buildCompletedResearchPatch = ({
    final,
    gemma,
}: {
    final: GroupGenerationResult;
    gemma: ResearchGemmaResult;
}): ResearchRecordPatch => ({
    lifecycle: 'completed',
    final: {
        text: final.text,
        segments: clone(final.segments),
        scene: clone(final.scene),
        interaction: measureGroupInteraction(final.segments, final.scene.presentMemberIds),
    },
    gemma: clone(gemma),
});

export const buildFailedResearchPatch = (
    stage: string,
    error: unknown,
): ResearchRecordPatch => ({
    lifecycle: 'failed',
    failure: {
        stage,
        message: error instanceof Error ? error.message : String(error || 'Unknown error'),
    },
});

export const buildJevResearchPatch = (record: JevShadowRecord): ResearchRecordPatch => ({
    jev: clone(record),
});


export type ResearchCloudSampleReason =
    | 'gemma-revise'
    | 'jev-gate-disagreement'
    | 'wardrobe-high-confidence'
    | 'narration-disagreement'
    | 'rigid-structure'
    | 'capture-failure'
    | 'control-sample';

export interface ResearchCloudMetadata {
    schemaVersion: 1;
    recordId: string;
    requestId: string;
    conversationKey: string;
    lifecycle: ResearchGroupTurnRecord['lifecycle'];
    createdAtMs: number;
    updatedAtMs: number;
    candidateInteraction: GroupInteractionMetrics;
    finalInteraction?: GroupInteractionMetrics;
    gemma?: {
        decision: ResearchGemmaResult['decision'];
        issueCodes: string[];
        revisionAccepted?: boolean;
    };
    jev?: JevShadowRecord;
    sampleReasons: ResearchCloudSampleReason[];
    fullContentSelected: boolean;
}

export interface ResearchCloudProjection {
    metadata: ResearchCloudMetadata;
    samplePayload?: Omit<ResearchGroupTurnRecord, 'syncState' | 'syncedAtMs'>;
}

const stableResearchHash = (value: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

const isRigidGroupInteraction = (interaction: GroupInteractionMetrics | undefined) => Boolean(
    interaction
    && interaction.uniqueSpeakerCount >= 2
    && interaction.narratorFirst
    && interaction.narratorLast
    && interaction.everyonePresentSpeaks
    && interaction.narrationBetweenEverySpeakerChange
);

export const getResearchCloudSampleReasons = (
    record: ResearchGroupTurnRecord,
): ResearchCloudSampleReason[] => {
    const reasons: ResearchCloudSampleReason[] = [];
    const gemmaDecision = record.gemma?.decision;
    const gemmaIssues = new Set(record.gemma?.issueCodes || []);
    const groupGate = record.jev?.groupGateTrial?.requiresRevision;
    const wardrobeTrial = record.jev?.wardrobeTrial?.wardrobeConflict;

    if (gemmaDecision === 'revise') reasons.push('gemma-revise');

    if (
        (gemmaDecision === 'keep' && groupGate !== undefined && groupGate >= 0.8)
        || (gemmaDecision === 'revise' && groupGate !== undefined && groupGate <= 0.5)
    ) reasons.push('jev-gate-disagreement');

    if (wardrobeTrial !== undefined && wardrobeTrial >= 0.3) {
        reasons.push('wardrobe-high-confidence');
    }

    if (record.jev?.deterministicGroupNarrationViolation !== undefined) {
        const gemmaNarration = gemmaIssues.has('group_narration');
        if (record.jev.deterministicGroupNarrationViolation !== gemmaNarration) {
            reasons.push('narration-disagreement');
        }
    }

    const rigidStructure = (
        isRigidGroupInteraction(record.final?.interaction)
        || isRigidGroupInteraction(record.candidate.interaction)
    );
    // Current Group V1 can be rigid quite often; sampling every rigid turn would
    // defeat the low-volume cloud policy. Keep roughly 10% of rigid-only turns.
    if (rigidStructure && stableResearchHash(`${record.recordId}:rigid`) % 10 === 0) {
        reasons.push('rigid-structure');
    }

    if (record.lifecycle === 'failed') reasons.push('capture-failure');

    // Stable 5% background control sample for otherwise ordinary turns.
    if (stableResearchHash(`${record.recordId}:control`) % 20 === 0) {
        reasons.push('control-sample');
    }

    return [...new Set(reasons)];
};

export const shouldUploadFullResearchSample = (
    record: ResearchGroupTurnRecord,
    reasons = getResearchCloudSampleReasons(record),
) => {
    if (reasons.includes('capture-failure')) return true;
    if (reasons.includes('wardrobe-high-confidence')) return true;
    if (reasons.includes('jev-gate-disagreement')) return true;
    if (reasons.includes('rigid-structure')) return true;
    if (reasons.includes('control-sample')) return true;
    if (
        reasons.includes('gemma-revise')
        && stableResearchHash(`${record.recordId}:gemma-revise-full`) % 2 === 0
    ) return true;
    if (
        reasons.includes('narration-disagreement')
        && stableResearchHash(`${record.recordId}:narration-full`) % 2 === 0
    ) return true;
    return false;
};

export const buildResearchCloudProjection = (
    record: ResearchGroupTurnRecord,
): ResearchCloudProjection => {
    const sampleReasons = getResearchCloudSampleReasons(record);
    const fullContentSelected = shouldUploadFullResearchSample(record, sampleReasons);
    const metadata: ResearchCloudMetadata = {
        schemaVersion: 1,
        recordId: record.recordId,
        requestId: record.requestId,
        conversationKey: record.conversationKey,
        lifecycle: record.lifecycle,
        createdAtMs: record.createdAtMs,
        updatedAtMs: record.updatedAtMs,
        candidateInteraction: clone(record.candidate.interaction),
        finalInteraction: record.final ? clone(record.final.interaction) : undefined,
        gemma: record.gemma ? {
            decision: record.gemma.decision,
            issueCodes: [...record.gemma.issueCodes],
            revisionAccepted: record.gemma.revisionAccepted,
        } : undefined,
        jev: record.jev ? clone(record.jev) : undefined,
        sampleReasons,
        fullContentSelected,
    };
    if (!fullContentSelected) return { metadata };

    const {
        syncState: _syncState,
        syncedAtMs: _syncedAtMs,
        ...samplePayload
    } = clone(record);
    return { metadata, samplePayload };
};

export const createResearchCaptureExport = async (
    options: { offset?: number; limit?: number } = {},
) => {
    const offset = Math.max(0, Math.floor(options.offset || 0));
    const limit = Math.min(100, Math.max(1, Math.floor(options.limit || 50)));
    const stats = await getResearchCaptureStats();
    const records = await listResearchTurnRecordsPage(offset, limit);
    return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        batch: {
            offset,
            limit,
            total: stats.total,
            count: records.length,
            nextOffset: offset + records.length < stats.total ? offset + records.length : null,
        },
        policy: {
            localRetentionMs: RESEARCH_CAPTURE_RETENTION_MS,
            localMaxRecords: RESEARCH_CAPTURE_MAX_LOCAL_RECORDS,
            cloudPolicy: 'compact-metadata-all-turns; sampled-full-content-only',
        },
        records,
    };
};
