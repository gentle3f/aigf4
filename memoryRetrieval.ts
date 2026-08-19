import type { PersonaMemoryEntry } from './managers.js';
import type { ChatRoom, RoomMemoryEntry } from './roomManager.js';

type MemoryEntryLike = Pick<
    PersonaMemoryEntry,
    'id' | 'kind' | 'title' | 'summary' | 'createdAt' | 'pinned' | 'importance' | 'unresolved'
>;

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();

const queryTerms = (query: string) => {
    const normalized = normalize(query);
    const terms = new Set<string>();
    normalized.match(/[a-z0-9][a-z0-9'_-]{1,31}/giu)?.forEach(term => terms.add(term));
    const hanRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) || [];
    hanRuns.forEach(run => {
        if (run.length <= 4) terms.add(run);
        for (let index = 0; index < run.length - 1; index += 1) {
            terms.add(run.slice(index, index + 2));
        }
    });
    return [...terms].slice(0, 48);
};

export interface ArchivedRecallTurn {
    id: string;
    userText: string;
    replyText: string;
}

const archiveRecallCue = /(?:記得|記唔記得|仲記唔記得|上次|以前|之前|當時|那次|嗰次|曾經|remember|last time|before|back then)/iu;
const archiveStopTerms = new Set([
    '記得', '唔記', '記唔', '上次', '以前', '之前', '當時', '那次', '嗰次', '曾經',
    '我們', '我哋', '你們', '你哋', '這件', '件事', '那個', '嗰個', '時候',
    'remember', 'last', 'time', 'before', 'back', 'then',
]);

export const selectRelevantArchivedTurns = (
    turns: ArchivedRecallTurn[],
    query: string,
    limit = 3,
) => {
    if (!archiveRecallCue.test(query) || turns.length === 0) return [];
    const terms = queryTerms(query).filter(term => !archiveStopTerms.has(term) && term.length >= 2);
    if (!terms.length) return [];
    return turns
        .map((turn, index) => {
            const haystack = normalize(`${turn.userText}\n${turn.replyText}`);
            const matches = terms.filter(term => haystack.includes(term));
            const distinctLongMatches = matches.filter(term => /[a-z0-9]/iu.test(term) || term.length >= 2);
            const score = distinctLongMatches.reduce((total, term) => total + Math.min(8, term.length * 2), 0)
                + index / Math.max(1, turns.length);
            return { turn, score, matchCount: new Set(distinctLongMatches).size, index };
        })
        .filter(item => item.matchCount > 0)
        .sort((left, right) => right.score - left.score || right.index - left.index)
        .slice(0, Math.max(0, limit))
        .sort((left, right) => left.index - right.index)
        .map(item => item.turn);
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
    const haystack = normalize(`${entry.title} ${entry.summary}`);
    const matchedTerms = queryTerms(query).filter(term => haystack.includes(term));
    const ageDays = Math.max(0, (now - Number(entry.createdAt || 0)) / 86_400_000);
    const recency = Math.max(0, 18 - Math.log2(ageDays + 1) * 3);
    return importance * 24
        + matchedTerms.length * 18
        + (entry.pinned ? 160 : 0)
        + (entry.unresolved ? 30 : 0)
        + recency;
};

export const selectRelevantMemories = <T extends MemoryEntryLike>(
    entries: T[],
    query: string,
    limit: number,
) => {
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
