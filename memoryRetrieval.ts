import type { PersonaMemoryEntry } from './managers.js';
import type { ChatRoom, RoomMemoryEntry } from './roomManager.js';
import {
    buildMemoryQueryTerms,
    buildMemorySearchTags,
    normalizeMemorySearchTag,
} from './memoryIndex.js';

type MemoryEntryLike = Pick<
    PersonaMemoryEntry,
    'id' | 'kind' | 'title' | 'summary' | 'createdAt' | 'pinned' | 'importance' | 'unresolved' | 'searchTags'
>;

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();

export interface ArchivedRecallTurn {
    id: string;
    userText: string;
    replyText: string;
}

const archiveRecallCue = /(?:記得|記唔記得|仲記唔記得|上次|以前|之前|當時|那次|嗰次|曾經|remember|last time|before|back then)/iu;
const archiveRecallStrip = /(?:仲記唔記得|記唔記得|記得|上次|以前|之前|當時|那次|嗰次|曾經|remember|last\s+time|before|back\s+then)/giu;
const archiveStopTerms = new Set([
    '我們', '我哋', '你們', '你哋', '這件', '呢件', '件事', '那個', '嗰個', '時候',
    'what', 'when', 'that', 'this', 'thing', 'things', 'happened',
]);

export const isDeepMemoryRecallQuery = (query: string) => archiveRecallCue.test(query);

export const getMemoryRecallLimit = (
    query: string,
    normalLimit: number,
    deepLimit: number,
) => isDeepMemoryRecallQuery(query) ? Math.max(normalLimit, deepLimit) : normalLimit;

const archiveQueryTerms = (query: string) => {
    const stripped = normalize(query)
        .replace(archiveRecallStrip, ' ')
        .replace(/[？?！!。，,：:；;]/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
    return buildMemoryQueryTerms(stripped)
        .filter(term => !archiveStopTerms.has(term) && term.length >= 2);
};

export const selectRelevantArchivedTurns = (
    turns: ArchivedRecallTurn[],
    query: string,
    limit = 3,
) => {
    if (!isDeepMemoryRecallQuery(query) || turns.length === 0 || limit <= 0) return [];
    const terms = archiveQueryTerms(query);

    // A vague but explicit cue such as "記唔記得上次？" should still retrieve
    // the nearest older evidence rather than behaving as if no recall was requested.
    if (!terms.length) {
        return turns.slice(-Math.min(limit, 3));
    }

    const ranked = turns
        .map((turn, index) => {
            const haystack = normalize(`${turn.userText}\n${turn.replyText}`);
            const matches = terms.filter(term => haystack.includes(term));
            const distinctMatches = [...new Set(matches)];
            const score = distinctMatches.reduce(
                (total, term) => total + Math.min(12, term.length * 2),
                0,
            ) + index / Math.max(1, turns.length);
            return { turn, score, matchCount: distinctMatches.length, index };
        })
        .filter(item => item.matchCount > 0)
        .sort((left, right) => right.score - left.score || right.index - left.index)
        .slice(0, Math.max(0, limit))
        .sort((left, right) => left.index - right.index)
        .map(item => item.turn);

    // When a concrete topic was supplied but no older verbatim evidence matches,
    // return nothing rather than feeding unrelated history into the model.
    return ranked;
};

export const normalizeMemoryImportance = (entry: Pick<MemoryEntryLike, 'kind' | 'pinned' | 'importance'>) => {
    if (entry.pinned) return 5;
    const explicit = Number(entry.importance);
    if (Number.isFinite(explicit)) return Math.max(1, Math.min(5, Math.round(explicit)));
    if (entry.kind === 'vulnerability' || entry.kind === 'promise' || entry.kind === 'boundary') return 4;
    if (entry.kind === 'relationship' || entry.kind === 'core') return 4;
    return 3;
};

export const scoreMemoryForQuery = (entry: MemoryEntryLike, query: string, now = Date.now()) => {
    const importance = normalizeMemoryImportance(entry);
    const terms = buildMemoryQueryTerms(query);
    const textHaystack = normalize(`${entry.title} ${entry.summary}`);
    const textMatches = new Set(terms.filter(term => textHaystack.includes(term)));

    const tags = entry.searchTags?.length
        ? entry.searchTags
        : buildMemorySearchTags(entry.title, entry.summary, entry.kind);
    const normalizedTags = tags.map(normalizeMemorySearchTag).filter(Boolean);
    const tagMatches = new Set(terms.filter(term => (
        normalizedTags.some(tag => tag === term || tag.includes(term) || term.includes(tag))
    )));

    const ageDays = Math.max(0, (now - Number(entry.createdAt || 0)) / 86_400_000);
    const recency = Math.max(0, 18 - Math.log2(ageDays + 1) * 3);
    return importance * 24
        + textMatches.size * 18
        + tagMatches.size * 30
        + (entry.pinned ? 160 : 0)
        + (entry.unresolved ? 30 : 0)
        + recency;
};

export const selectRelevantMemories = <T extends MemoryEntryLike>(
    entries: T[],
    query: string,
    limit: number,
) => {
    if (limit <= 0) return [];
    if (entries.length <= limit) return [...entries];
    const ranked = [...entries]
        .map((entry, index) => ({ entry, index, score: scoreMemoryForQuery(entry, query) }))
        .sort((left, right) => right.score - left.score || right.index - left.index);
    const mandatory = ranked.filter(item => item.entry.pinned || normalizeMemoryImportance(item.entry) >= 5);
    const selected = new Map<string, { entry: T; index: number }>();
    mandatory.slice(0, limit).forEach(item => selected.set(item.entry.id, item));
    ranked.forEach(item => {
        if (selected.size < limit) selected.set(item.entry.id, item);
    });
    return [...selected.values()]
        .sort((left, right) => left.index - right.index)
        .map(item => item.entry);
};

export const getRoomMemorySubjectIds = (entry: RoomMemoryEntry) => Array.from(new Set(
    (entry.subjectIds?.length ? entry.subjectIds : entry.participants || []).filter(Boolean),
));

export const getRoomMemoryKnowerIds = (entry: RoomMemoryEntry) => Array.from(new Set(
    (entry.knowerIds?.length
        ? entry.knowerIds
        : entry.perspectives?.length
            ? entry.perspectives.map(item => item.memberId)
            : entry.participants || []).filter(Boolean),
));

export const getRoomMemoryPerspective = (entry: RoomMemoryEntry, memberId: string) => (
    entry.perspectives?.find(item => item.memberId === memberId)
);

export const isRoomWideMemory = (entry: RoomMemoryEntry, room: ChatRoom) => {
    if (entry.visibility !== 'shared') return false;
    const knowers = new Set(getRoomMemoryKnowerIds(entry));
    return room.scene.presentMemberIds.length > 0
        && room.scene.presentMemberIds.every(memberId => knowers.has(memberId));
};

export const formatMemoryPromptMetadata = (entry: MemoryEntryLike) => {
    const labels = [`importance ${normalizeMemoryImportance(entry)}/5`];
    if (entry.unresolved) labels.push('unresolved');
    if (entry.pinned) labels.push('permanent');
    return labels.join(', ');
};
