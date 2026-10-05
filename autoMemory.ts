import type { VeniceJsonSchemaResponseFormat, VeniceMessage } from './venice.js';

export {
    AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES,
    AUTO_MEMORY_MIN_IMPORTANCE,
    AUTO_MEMORY_SUMMARY_VERSION,
    AUTO_MEMORY_TURN_INTERVAL,
} from './autoMemoryPolicy.js';

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
    searchTags?: string[];
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
    const searchTags = readStringArray(candidate.search_tags ?? candidate.searchTags)
        .map(tag => tag.slice(0, 80))
        .slice(0, 12);
    const unresolved = typeof candidate.unresolved === 'boolean' ? candidate.unresolved : undefined;
    return {
        kind,
        title,
        summary,
        ...(importance ? { importance } : {}),
        ...(sceneId ? { sceneId } : {}),
        ...(sourceMessageIds.length ? { sourceMessageIds } : {}),
        ...(searchTags.length ? { searchTags } : {}),
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

export const ROOM_MEMORY_RESPONSE_FORMAT: VeniceJsonSchemaResponseFormat = {
    type: 'json_schema',
    json_schema: {
        name: 'room_memory_update_v3',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['memories'],
            properties: {
                memories: {
                    type: 'array',
                    maxItems: 12,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: [
                            'kind',
                            'title',
                            'shared_summary',
                            'subject_ids',
                            'importance',
                            'visibility',
                            'unresolved',
                            'scene_id',
                            'source_message_ids',
                            'search_tags',
                            'perspectives',
                        ],
                        properties: {
                            kind: { type: 'string', enum: ['relationship', 'vulnerability', 'promise', 'preference', 'event', 'boundary'] },
                            title: { type: 'string' },
                            shared_summary: { type: 'string' },
                            subject_ids: { type: 'array', minItems: 1, items: { type: 'string' } },
                            importance: { type: 'integer', minimum: 1, maximum: 5 },
                            visibility: { type: 'string', enum: ['restricted', 'shared'] },
                            unresolved: { type: 'boolean' },
                            scene_id: { type: 'string' },
                            source_message_ids: { type: 'array', minItems: 1, items: { type: 'string' } },
                            search_tags: { type: 'array', minItems: 2, maxItems: 10, items: { type: 'string' } },
                            perspectives: {
                                type: 'array',
                                minItems: 1,
                                items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['member_id', 'salience', 'knowledge', 'memory'],
                                    properties: {
                                        member_id: { type: 'string' },
                                        salience: { type: 'integer', minimum: 1, maximum: 5 },
                                        knowledge: { type: 'string', enum: ['experienced', 'witnessed', 'told'] },
                                        memory: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
};

export const PERSONA_MEMORY_RESPONSE_FORMAT: VeniceJsonSchemaResponseFormat = {
    type: 'json_schema',
    json_schema: {
        name: 'persona_memory_update_v3',
        strict: true,
        schema: {
            type: 'object',
            additionalProperties: false,
            required: ['memories'],
            properties: {
                memories: {
                    type: 'array',
                    maxItems: 12,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: [
                            'kind',
                            'title',
                            'summary',
                            'importance',
                            'unresolved',
                            'scene_id',
                            'source_message_ids',
                            'search_tags',
                        ],
                        properties: {
                            kind: { type: 'string', enum: ['relationship', 'vulnerability', 'promise', 'preference', 'event', 'boundary'] },
                            title: { type: 'string' },
                            summary: { type: 'string' },
                            importance: { type: 'integer', minimum: 1, maximum: 5 },
                            unresolved: { type: 'boolean' },
                            scene_id: { type: 'string' },
                            source_message_ids: { type: 'array', minItems: 1, items: { type: 'string' } },
                            search_tags: { type: 'array', minItems: 2, maxItems: 10, items: { type: 'string' } },
                        },
                    },
                },
            },
        },
    },
};

export const buildRoomAutoMemoryMessages = (
    memberLedger: string,
    existing: string,
    evidenceTranscript: string,
): VeniceMessage[] => [
    {
        role: 'system',
        content: [
            'You are a meticulous human-memory archivist for a continuous private group conversation.',
            'Return one JSON object matching the schema. Return an empty memories array when nothing is durable.',
            `Valid immutable member ledger: ${memberLedger}. Use only these member IDs.`,
            'Read the evidence as separate human minds, not as one shared narrator. A fact important to Rose can be a lasting Rose memory without becoming Jennie\'s memory.',
            'For each event, subject_ids identifies the fixed member(s) whose personal relationship storyline is affected. For a user disclosure, select its character recipient(s), since USER is not a member ID. perspectives lists only members who would genuinely retain it long-term.',
            'Mere presence is not enough for durable memory. Use experienced for a direct participant, witnessed for a meaningful observer, and told only when the transcript explicitly tells that member.',
            'Write each perspective from that member\'s knowledge and emotional significance. Do not give a member facts learned only in another member\'s private interaction.',
            'Prioritise user vulnerability, support needs, boundaries, promises, relationship changes, meaningful firsts, lasting preferences, unresolved tension and emotionally important romantic or adult milestones.',
            'When the user reveals vulnerability, preserve what they disclosed, what response helped or hurt, and why it matters, without diagnosing them.',
            'Preserve the relational meaning of intimate memories accurately; omit repetitive anatomy and moment-by-moment choreography unless a specific boundary or preference depends on it.',
            'Importance: 5 identity-level or explicitly permanent; 4 vulnerability, major promise/boundary/relationship milestone; 3 useful continuity; 1-2 usually omit.',
            'Use the smallest exact source_message_ids that prove each memory. Never invent an ID. scene_id must be one shown in the evidence.',
            'search_tags: add 2-10 concise retrieval aliases covering the most useful names, places, objects, topics, promises/preferences/boundaries and common Chinese/English wording. Avoid generic tags like memory, event, user or conversation.',
            'Set unresolved true only when a promise, conflict, plan, question or emotional need still needs follow-up.',
            'visibility is shared only when every fixed room member genuinely knows it; otherwise restricted.',
            'Write concise but complete Traditional Chinese. Do not merge unrelated events merely to save space.',
            existing ? `Existing memory.md entries; avoid duplicates and add only missing information:\n${existing}` : '',
        ].filter(Boolean).join('\n'),
    },
    { role: 'user', content: `Evidence transcript:\n\n${evidenceTranscript}` },
];

export const buildPersonaAutoMemoryMessages = (
    personaName: string,
    existing: string,
    evidenceTranscript: string,
): VeniceMessage[] => [
    {
        role: 'system',
        content: [
            `You are ${personaName}'s meticulous long-term human-memory archivist for a continuous private romance conversation.`,
            'Return one JSON object matching the schema. Return an empty memories array when nothing is durable.',
            `Store only what ${personaName} personally experienced, witnessed, or was explicitly told. Never import another character's private knowledge.`,
            'Prioritise user vulnerability, support needs, boundaries, promises, relationship changes, meaningful firsts, lasting preferences, unresolved tension and emotionally important romantic or adult milestones.',
            'When the user reveals vulnerability, preserve what they disclosed, the response they needed, what helped or hurt, and why it matters, without diagnosis or generic therapy language.',
            'Preserve intimate memories by their emotional, relational, preference and boundary significance. Avoid repetitive anatomy and transient choreography unless a lasting boundary or preference depends on it.',
            'Importance: 5 identity-level or explicitly permanent; 4 vulnerability, major promise/boundary/relationship milestone; 3 useful continuity; 1-2 usually omit.',
            'Use the smallest exact source_message_ids that prove each memory. Never invent an ID. scene_id must be one shown in the evidence.',
            'search_tags: add 2-10 concise retrieval aliases covering the most useful names, places, objects, topics, promises/preferences/boundaries and common Chinese/English wording. Avoid generic tags like memory, event, user or conversation.',
            'Set unresolved true only when a promise, conflict, plan, question or emotional need still needs follow-up.',
            'Write concise but complete Traditional Chinese. Keep separate events separate and skip routine small talk.',
            existing ? `Existing memory.md entries; avoid duplicates and add only missing information:\n${existing}` : '',
        ].filter(Boolean).join('\n'),
    },
    { role: 'user', content: `Evidence transcript:\n\n${evidenceTranscript}` },
];
