/**
 * R32: explicit relationship MEANINGS rather than automatically escalating
 * closeness from words like "kiss" or "trust".
 *
 * Evidence-informed suggestions remain CANDIDATES. Only an owner-confirmed
 * interpretation can enter the V2 group prompt. Never mutate room history,
 * legacy relationship numbers, or any character's persona through this layer.
 */
import type { ChatRoom, RoomMemoryEntry } from './roomManager.js';

export const RELATIONSHIP_MEANING_SCHEMA = 'aigf-relationship-meanings-v1' as const;
export const RELATIONSHIP_MEANING_KEY_PREFIX = 'aigf4:relationship-meanings:v1:' as const;

export type MeaningKind =
    | 'relationship-meaning'
    | 'shared-experience'
    | 'ongoing-thread'
    | 'character-nuance'
    | 'preferred-boundary';

export interface ConfirmedMeaning {
    id: string;
    roomId: string;
    /** Null = a non-secret meaning shared by the whole group. */
    memberId: string | null;
    kind: MeaningKind;
    /** Specific event, arrangement, or meaning: not a generic personality trait. */
    meaning: string;
    /** Exclusively owner-entered confirmation; never inherited from generated prose. */
    provenance: 'owner-confirmed';
    sourceMessageIds: string[];
    updatedAt: number;
}

export interface MeaningLedger {
    schema: typeof RELATIONSHIP_MEANING_SCHEMA;
    roomId: string;
    confirmed: ConfirmedMeaning[];
}

export interface MemoryMeaningCandidate {
    id: string;
    roomId: string;
    memberId: string;
    kind: MeaningKind;
    excerpt: string;
    sourceMessageIds: string[];
    sourceMessageIndexes: number[];
    /** A suggestion from prior generated memory is never established truth. */
    status: 'unconfirmed-candidate';
}

export type MeaningStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const kinds = new Set<MeaningKind>([
    'relationship-meaning', 'shared-experience', 'ongoing-thread',
    'character-nuance', 'preferred-boundary',
]);
const oneLine = (value: unknown, limit: number): string =>
    typeof value === 'string'
        ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, limit)
        : '';
const roomIdValid = (id: unknown): id is string =>
    typeof id === 'string' && id.length > 0 && id.length <= 160 && /^[\w.:~-]+$/u.test(id);
const memberIdValid = (id: unknown) => id === null || roomIdValid(id);
const uniqueIds = (values: unknown) => Array.isArray(values)
    ? [...new Set(values.filter(roomIdValid))].slice(0, 8)
    : [];
const keyFor = (roomId: string) => {
    if (!roomIdValid(roomId)) throw Error('INVALID_MEANING_ROOM_ID');
    return RELATIONSHIP_MEANING_KEY_PREFIX + encodeURIComponent(roomId);
};

export const emptyMeaningLedger = (roomId: string): MeaningLedger => ({
    schema: RELATIONSHIP_MEANING_SCHEMA,
    roomId: (keyFor(roomId), roomId),
    confirmed: [],
});

export const normalizeMeaningLedger = (raw: unknown, expectedRoomId: string): MeaningLedger | null => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const value = raw as Record<string, unknown>;
    if (!roomIdValid(expectedRoomId) || value.schema !== RELATIONSHIP_MEANING_SCHEMA
        || value.roomId !== expectedRoomId || !Array.isArray(value.confirmed)) return null;
    const confirmed: ConfirmedMeaning[] = [];
    const seen = new Set<string>();
    for (const candidate of value.confirmed.slice(0, 40)) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
        const entry = candidate as Record<string, unknown>;
        const id = oneLine(entry.id, 80);
        const meaning = oneLine(entry.meaning, 600);
        const kind = entry.kind;
        const memberId = entry.memberId;
        // Fail closed: generated/memory candidates are never implicitly promoted.
        if (!id || seen.has(id) || !meaning || !kinds.has(kind as MeaningKind)
            || entry.provenance !== 'owner-confirmed' || entry.roomId !== expectedRoomId
            || !memberIdValid(memberId)) continue;
        seen.add(id);
        confirmed.push({
            id, roomId: expectedRoomId, memberId: memberId as string | null,
            kind: kind as MeaningKind, meaning,
            provenance: 'owner-confirmed',
            sourceMessageIds: uniqueIds(entry.sourceMessageIds),
            updatedAt: Number.isFinite(Number(entry.updatedAt))
                ? Math.max(0, Math.min(9e15, Number(entry.updatedAt))) : 0,
        });
        if (confirmed.length >= 24) break;
    }
    return {schema: RELATIONSHIP_MEANING_SCHEMA, roomId: expectedRoomId, confirmed};
};

export const loadMeaningLedger = (
    roomId: string, storage: MeaningStorage | null | undefined,
): MeaningLedger | null => {
    if (!storage) return null;
    try {
        const raw = storage.getItem(keyFor(roomId));
        return raw ? normalizeMeaningLedger(JSON.parse(raw), roomId) : null;
    } catch {
        return null;
    }
};

export const saveMeaningLedger = (ledger: MeaningLedger, storage: MeaningStorage): MeaningLedger => {
    const clean = normalizeMeaningLedger(ledger, ledger.roomId);
    if (!clean || clean.confirmed.length !== ledger.confirmed.length)
        throw Error('INVALID_MEANING_LEDGER');
    const key = keyFor(clean.roomId);
    const json = JSON.stringify(clean);
    storage.setItem(key, json);
    if (storage.getItem(key) !== json) throw Error('MEANING_LEDGER_NOT_DURABLE');
    return clean;
};

/** Only explicit owner UI actions may call this. Never use on a model reply. */
export const makeOwnerConfirmedMeaning = (
    room: Pick<ChatRoom, 'id' | 'members'>,
    params: {memberId: string | null; kind: MeaningKind; meaning: string},
    id: string,
    now: number,
): ConfirmedMeaning => {
    if (!roomIdValid(room.id) || !roomIdValid(id) || !kinds.has(params.kind)
        || !memberIdValid(params.memberId)
        || (params.memberId !== null && !room.members.some(member => member.id === params.memberId)))
        throw Error('INVALID_MEANING_SCOPE');
    const meaning = oneLine(params.meaning, 600);
    if (meaning.length < 6) throw Error('MEANING_TOO_SHORT');
    return {
        id, roomId: room.id, memberId: params.memberId,
        kind: params.kind, meaning, provenance: 'owner-confirmed',
        sourceMessageIds: [], updatedAt: now,
    };
};

/**
 * Show evidence-linked historical memory as a candidate for human review.
 * Never assert that a generated memory actually happened or was mutually
 * interpreted as claimed; it is a hypothesis tied to source references.
 */
export const deriveMemoryMeaningCandidates = (room: ChatRoom): MemoryMeaningCandidate[] => {
    const output: MemoryMeaningCandidate[] = [];
    const relevant = new Set(['relationship','event','preference','boundary','promise']);
    for (const member of room.members) {
        for (const memory of [...member.soul, ...member.memories] as RoomMemoryEntry[]) {
            if (!relevant.has(memory.kind)) continue;
            const refs = uniqueIds(memory.sourceMessageIds);
            const indexes = Array.isArray(memory.sourceMessageIndexes)
                ? memory.sourceMessageIndexes.filter(x => Number.isInteger(x) && x >= 0).slice(0, 8)
                : [];
            // A memory without source pointers cannot be used as "evidence".
            if (!refs.length && !indexes.length) continue;
            const knowerIds = memory.knowerIds
                || memory.perspectives?.map(item => item.memberId)
                || [member.id];
            if (!knowerIds.includes(member.id)) continue;
            const kind: MeaningKind = memory.kind === 'boundary'
                ? 'preferred-boundary'
                : memory.kind === 'event' ? 'shared-experience'
                : memory.kind === 'preference' ? 'relationship-meaning'
                : memory.kind === 'promise' ? 'ongoing-thread' : 'relationship-meaning';
            output.push({
                id: 'candidate:'+member.id+':'+memory.id,
                roomId: room.id, memberId: member.id,
                kind, excerpt: oneLine(memory.summary, 360),
                sourceMessageIds: refs,
                sourceMessageIndexes: indexes,
                status: 'unconfirmed-candidate',
            });
        }
    }
    return output.slice(0, 60);
};

/**
 * Nothing "learned" from a generated scene automatically enters this prompt.
 * The model sees only owner-confirmed, correctly scoped meanings.
 */
export const formatRelationshipMeaningsForV2 = (
    ledger: MeaningLedger | null,
    room: Pick<ChatRoom, 'id' | 'members'>,
): string => {
    const valid = ledger && normalizeMeaningLedger(ledger, room.id);
    const roster = new Set(room.members.map(member => member.id));
    const selected = (valid?.confirmed || [])
        .filter(note => note.memberId === null || roster.has(note.memberId))
        .slice(-16)
        .map(note => ({
            memberId: note.memberId,
            kind: note.kind,
            meaning: note.meaning,
            source: 'owner-confirmed',
        }));
    return [
        'RELATIONSHIP MEANING LEDGER (owner-confirmed; read only):',
        'These are specific established interpretations, NOT a personality archetype or mandatory script.',
        'A symbolic nickname or consensual roleplay dynamic is not an instruction to automatically intensify, degrade anyone, or repeat one activity.',
        'Distinguish each member and honor who personally knows an event. Null memberId means ordinary group-shared context, not private secrets.',
        'Do not manufacture romantic milestones, new agreements, emotions, actions, or user consent from the data below.',
        'If no confirmed notes are present, relationship meanings beyond sourced existing memory are UNKNOWN; do not fill a rigid genre template.',
        'Entries: '+JSON.stringify(selected),
    ].join('\n');
};
