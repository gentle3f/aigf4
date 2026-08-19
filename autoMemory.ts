export const AUTO_MEMORY_SUMMARY_VERSION = 3;
export const AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES = 8;

export type AutoMemoryKind =
    | 'relationship'
    | 'vulnerability'
    | 'promise'
    | 'preference'
    | 'event'
    | 'boundary';

export type MemoryKnowledgeSource = 'experienced' | 'witnessed' | 'told';
export type MemoryVisibility = 'restricted' | 'shared';

export interface PersonaAutoMemoryDraft {
    kind: AutoMemoryKind;
    title: string;
    summary: string;
    importance?: number;
    sceneId?: string;
    sourceMessageIds?: string[];
    unresolved?: boolean;
}

export interface RoomMemoryPerspectiveDraft {
    memberId: string;
    salience: number;
    knowledge: MemoryKnowledgeSource;
    summary: string;
}

export interface RoomAutoMemoryDraft extends PersonaAutoMemoryDraft {
    // participants remains the backwards-compatible subject list.
    participants: string[];
    subjectIds?: string[];
    knowerIds?: string[];
    visibility?: MemoryVisibility;
    perspectives?: RoomMemoryPerspectiveDraft[];
}

export type MemoryBatchMode = 'auto' | 'recent' | 'recovery' | 'full';

export interface MemoryTurnBatch<T> {
    messages: T[];
    fromUserMessageCount: number;
    throughUserMessageCount: number;
}

interface MemoryMessageLike {
    role: string;
}

const MEMORY_BATCH_USER_TURNS = 16;
const MEMORY_AUTO_OVERLAP_USER_TURNS = 2;
const MEMORY_RECENT_USER_TURNS = 32;
const MEMORY_RECOVERY_USER_TURNS = 48;
const MEMORY_AUTO_MAX_BATCHES = 3;

/**
 * Splits completed user/model turns without mutating or pruning the source history.
 * Auto mode overlaps two turns so an event spanning a checkpoint is not lost.
 */
export const buildMemoryTurnBatches = <T extends MemoryMessageLike>(
    history: T[],
    lastSummarizedUserMessageCount: number,
    mode: MemoryBatchMode,
): MemoryTurnBatch<T>[] => {
    const turns: Array<{ ordinal: number; messages: T[] }> = [];
    let current: T[] | null = null;
    let userOrdinal = 0;

    history.forEach(message => {
        if (message.role !== 'user' && message.role !== 'model') return;
        if (message.role === 'user') {
            if (current?.length) turns.push({ ordinal: userOrdinal, messages: current });
            userOrdinal += 1;
            current = [message];
            return;
        }
        if (current) current.push(message);
    });
    if (current?.length) turns.push({ ordinal: userOrdinal, messages: current });

    const total = turns.length;
    if (total === 0) return [];
    const checkpoint = Math.max(0, Math.min(Math.floor(lastSummarizedUserMessageCount), total));
    if (mode === 'auto' && total <= checkpoint) return [];

    const startIndex = mode === 'full'
        ? 0
        : mode === 'recent'
            ? Math.max(0, total - MEMORY_RECENT_USER_TURNS)
            : mode === 'recovery'
                ? Math.max(0, total - MEMORY_RECOVERY_USER_TURNS)
                : Math.max(0, checkpoint - MEMORY_AUTO_OVERLAP_USER_TURNS);
    const batches: MemoryTurnBatch<T>[] = [];

    for (let index = startIndex; index < total; index += MEMORY_BATCH_USER_TURNS) {
        const selected = turns.slice(index, index + MEMORY_BATCH_USER_TURNS);
        if (!selected.length) break;
        batches.push({
            messages: selected.flatMap(turn => turn.messages),
            fromUserMessageCount: selected[0].ordinal,
            throughUserMessageCount: selected[selected.length - 1].ordinal,
        });
        if (mode === 'auto' && batches.length >= MEMORY_AUTO_MAX_BATCHES) break;
    }

    return batches;
};

const validKinds = new Set<AutoMemoryKind>([
    'relationship',
    'vulnerability',
    'promise',
    'preference',
    'event',
    'boundary',
]);
const validKnowledgeSources = new Set<MemoryKnowledgeSource>([
    'experienced',
    'witnessed',
    'told',
]);

const cleanJsonText = (text: string) => {
    const withoutFence = text
        .trim()
        .replace(/^```(?:json)?\s*/iu, '')
        .replace(/\s*```$/u, '')
        .trim();
    const objectStart = withoutFence.indexOf('{');
    const objectEnd = withoutFence.lastIndexOf('}');
    return objectStart >= 0 && objectEnd > objectStart
        ? withoutFence.slice(objectStart, objectEnd + 1)
        : withoutFence;
};

const parseMemoryEnvelope = (text: string): unknown[] | null => {
    try {
        const parsed = JSON.parse(cleanJsonText(text)) as { memories?: unknown };
        return parsed && Array.isArray(parsed.memories) ? parsed.memories : null;
    } catch {
        return null;
    }
};

const clampImportance = (value: unknown) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(1, Math.min(5, Math.round(numeric))) : undefined;
};

const readStringArray = (value: unknown) => Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)))
    : [];

const parseBaseMemory = (value: unknown): PersonaAutoMemoryDraft | null => {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const summaryValue = candidate.summary ?? candidate.shared_summary;
    const summary = typeof summaryValue === 'string' ? summaryValue.trim() : '';
    if (!title || !summary) return null;
    const kind = typeof candidate.kind === 'string' && validKinds.has(candidate.kind as AutoMemoryKind)
        ? candidate.kind as AutoMemoryKind
        : 'event';
    const importance = clampImportance(candidate.importance);
    const sceneValue = candidate.scene_id ?? candidate.sceneId;
    const sceneId = typeof sceneValue === 'string' ? sceneValue.trim() : '';
    const sourceMessageIds = readStringArray(candidate.source_message_ids ?? candidate.sourceMessageIds);
    const unresolved = typeof candidate.unresolved === 'boolean' ? candidate.unresolved : undefined;
    return {
        kind,
        title,
        summary,
        ...(importance ? { importance } : {}),
        ...(sceneId ? { sceneId } : {}),
        ...(sourceMessageIds.length ? { sourceMessageIds } : {}),
        ...(typeof unresolved === 'boolean' ? { unresolved } : {}),
    };
};

export const parsePersonaAutoMemoryResponse = (
    text: string,
    validSourceMessageIds?: ReadonlySet<string>,
): PersonaAutoMemoryDraft[] | null => {
    const rawMemories = parseMemoryEnvelope(text);
    if (!rawMemories) return null;
    const memories = rawMemories.flatMap(value => {
        const parsed = parseBaseMemory(value);
        if (!parsed) return [];
        const sourceMessageIds = (parsed.sourceMessageIds || []).filter(id => (
            !validSourceMessageIds || validSourceMessageIds.has(id)
        ));
        if (validSourceMessageIds && sourceMessageIds.length === 0) return [];
        return [{ ...parsed, ...(sourceMessageIds.length ? { sourceMessageIds } : {}) }];
    });
    return rawMemories.length > 0 && memories.length === 0 ? null : memories;
};

const normalizeParticipant = (value: string) => value.trim().toLocaleLowerCase();

const resolveMemberIds = (
    value: unknown,
    participantAliases: ReadonlyMap<string, string>,
) => Array.from(new Set(readStringArray(value).flatMap(participant => {
    const resolved = participantAliases.get(normalizeParticipant(participant));
    return resolved ? [resolved] : [];
})));

const parsePerspectives = (
    value: unknown,
    participantAliases: ReadonlyMap<string, string>,
): RoomMemoryPerspectiveDraft[] => {
    if (!Array.isArray(value)) return [];
    const perspectives = value.flatMap(rawPerspective => {
        if (!rawPerspective || typeof rawPerspective !== 'object') return [];
        const candidate = rawPerspective as Record<string, unknown>;
        const rawMemberId = candidate.member_id ?? candidate.memberId;
        if (typeof rawMemberId !== 'string') return [];
        const memberId = participantAliases.get(normalizeParticipant(rawMemberId));
        const summaryValue = candidate.memory ?? candidate.summary;
        const summary = typeof summaryValue === 'string' ? summaryValue.trim() : '';
        const salience = clampImportance(candidate.salience ?? candidate.importance);
        const rawKnowledge = candidate.knowledge;
        const knowledge = typeof rawKnowledge === 'string' && validKnowledgeSources.has(rawKnowledge as MemoryKnowledgeSource)
            ? rawKnowledge as MemoryKnowledgeSource
            : 'experienced';
        return memberId && summary && salience
            ? [{ memberId, salience, knowledge, summary }]
            : [];
    });
    const byMember = new Map<string, RoomMemoryPerspectiveDraft>();
    perspectives.forEach(perspective => {
        const current = byMember.get(perspective.memberId);
        if (!current || perspective.salience > current.salience) byMember.set(perspective.memberId, perspective);
    });
    return [...byMember.values()];
};

export const parseRoomAutoMemoryResponse = (
    text: string,
    participantAliases: ReadonlyMap<string, string>,
    validSourceMessageIds?: ReadonlySet<string>,
): RoomAutoMemoryDraft[] | null => {
    const rawMemories = parseMemoryEnvelope(text);
    if (!rawMemories) return null;
    const memories = rawMemories.flatMap(value => {
        const base = parseBaseMemory(value);
        if (!base || !value || typeof value !== 'object') return [];
        const candidate = value as Record<string, unknown>;
        const legacyParticipants = resolveMemberIds(candidate.participants, participantAliases);
        const subjectIds = resolveMemberIds(
            candidate.subject_ids ?? candidate.subjectIds ?? candidate.participants,
            participantAliases,
        );
        const perspectives = parsePerspectives(candidate.perspectives, participantAliases);
        const explicitKnowers = resolveMemberIds(
            candidate.knower_ids ?? candidate.knowerIds,
            participantAliases,
        );
        const knowerIds = Array.from(new Set([
            ...perspectives.filter(item => item.salience >= 2).map(item => item.memberId),
            ...explicitKnowers,
            ...(perspectives.length || explicitKnowers.length ? [] : legacyParticipants),
        ]));
        const participants = subjectIds.length ? subjectIds : knowerIds;
        if (!participants.length || !knowerIds.length) return [];

        const requestedVisibility = candidate.visibility;
        const visibility: MemoryVisibility | undefined = requestedVisibility === 'shared' || requestedVisibility === 'restricted'
            ? requestedVisibility
            : undefined;
        const sourceMessageIds = (base.sourceMessageIds || []).filter(id => (
            !validSourceMessageIds || validSourceMessageIds.has(id)
        ));
        if (validSourceMessageIds && sourceMessageIds.length === 0) return [];
        const perspectiveImportance = perspectives.reduce((highest, item) => Math.max(highest, item.salience), 0);
        const importance = base.importance || perspectiveImportance || undefined;
        return [{
            ...base,
            participants,
            ...(subjectIds.length ? { subjectIds } : {}),
            ...(knowerIds.length ? { knowerIds } : {}),
            ...(visibility ? { visibility } : {}),
            ...(perspectives.length ? { perspectives } : {}),
            ...(importance ? { importance } : {}),
            ...(sourceMessageIds.length ? { sourceMessageIds } : {}),
        }];
    });
    return rawMemories.length > 0 && memories.length === 0 ? null : memories;
};
