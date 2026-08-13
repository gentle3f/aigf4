export const AUTO_MEMORY_SUMMARY_VERSION = 2;
export const AUTO_MEMORY_BACKFILL_MIN_USER_MESSAGES = 8;

export type AutoMemoryKind =
    | 'relationship'
    | 'vulnerability'
    | 'promise'
    | 'preference'
    | 'event'
    | 'boundary';

export interface PersonaAutoMemoryDraft {
    kind: AutoMemoryKind;
    title: string;
    summary: string;
}

export interface RoomAutoMemoryDraft extends PersonaAutoMemoryDraft {
    participants: string[];
}

const validKinds = new Set<AutoMemoryKind>([
    'relationship',
    'vulnerability',
    'promise',
    'preference',
    'event',
    'boundary',
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

const parseBaseMemory = (value: unknown): PersonaAutoMemoryDraft | null => {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Record<string, unknown>;
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const summary = typeof candidate.summary === 'string' ? candidate.summary.trim() : '';
    if (!title || !summary) return null;
    const kind = typeof candidate.kind === 'string' && validKinds.has(candidate.kind as AutoMemoryKind)
        ? candidate.kind as AutoMemoryKind
        : 'event';
    return { kind, title, summary };
};

export const parsePersonaAutoMemoryResponse = (text: string): PersonaAutoMemoryDraft[] | null => {
    const rawMemories = parseMemoryEnvelope(text);
    if (!rawMemories) return null;
    const memories = rawMemories.flatMap(value => {
        const parsed = parseBaseMemory(value);
        return parsed ? [parsed] : [];
    });
    return rawMemories.length > 0 && memories.length === 0 ? null : memories;
};

const normalizeParticipant = (value: string) => value.trim().toLocaleLowerCase();

export const parseRoomAutoMemoryResponse = (
    text: string,
    participantAliases: ReadonlyMap<string, string>,
): RoomAutoMemoryDraft[] | null => {
    const rawMemories = parseMemoryEnvelope(text);
    if (!rawMemories) return null;
    const memories = rawMemories.flatMap(value => {
        const base = parseBaseMemory(value);
        if (!base || !value || typeof value !== 'object') return [];
        const candidate = value as Record<string, unknown>;
        const rawParticipants = Array.isArray(candidate.participants) ? candidate.participants : [];
        const participants = Array.from(new Set(rawParticipants.flatMap(participant => {
            if (typeof participant !== 'string') return [];
            const resolved = participantAliases.get(normalizeParticipant(participant));
            return resolved ? [resolved] : [];
        })));
        return participants.length > 0 ? [{ ...base, participants }] : [];
    });
    return rawMemories.length > 0 && memories.length === 0 ? null : memories;
};
