// Pure group memory reducer shared by browser and VPS.
import type {ChatRoom,RoomMemoryEntry,RoomMemoryKnowledgeSource} from './roomManager.js';
import {buildMemorySearchTags,mergeMemorySearchTags} from './memoryIndex.js';
const cloneRoom=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const uniqueMemberIds = (values: unknown, validMemberIds: ReadonlySet<string>) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
        .filter((value): value is string => typeof value === 'string' && validMemberIds.has(value)),
));

const defaultMemoryImportance = (entry: Pick<RoomMemoryEntry, 'kind' | 'pinned'>) => {
    if (entry.pinned || entry.kind === 'core') return 5;
    if (entry.kind === 'vulnerability' || entry.kind === 'promise' || entry.kind === 'boundary') return 4;
    if (entry.kind === 'relationship') return 4;
    return 3;
};

export const normalizeRoomMemoryEntry = (
    entry: RoomMemoryEntry,
    validMemberIds: ReadonlySet<string>,
    forcedKnowerId?: string,
): RoomMemoryEntry => {
    const participants = uniqueMemberIds(entry.participants, validMemberIds);
    const subjectIds = uniqueMemberIds(entry.subjectIds?.length ? entry.subjectIds : participants, validMemberIds);
    const explicitPerspectives = (Array.isArray(entry.perspectives) ? entry.perspectives : []).flatMap(perspective => {
        if (!perspective || !validMemberIds.has(perspective.memberId) || !perspective.summary?.trim()) return [];
        const salience = Math.max(1, Math.min(5, Math.round(Number(perspective.salience) || 3)));
        const knowledge: RoomMemoryKnowledgeSource = ['experienced', 'witnessed', 'told'].includes(perspective.knowledge)
            ? perspective.knowledge
            : 'experienced';
        return [{
            memberId: perspective.memberId,
            salience,
            knowledge,
            summary: perspective.summary.trim(),
        }];
    });
    const perspectiveIds = explicitPerspectives.map(perspective => perspective.memberId);
    const knowerIds = forcedKnowerId
        ? [forcedKnowerId]
        : uniqueMemberIds(
            entry.knowerIds?.length ? entry.knowerIds : perspectiveIds.length ? perspectiveIds : participants,
            validMemberIds,
        );
    const importance = Math.max(1, Math.min(5, Math.round(Number(entry.importance) || defaultMemoryImportance(entry))));
    const perspectives = explicitPerspectives.length
        ? explicitPerspectives.filter(perspective => knowerIds.includes(perspective.memberId))
        : knowerIds.map(memberId => ({
            memberId,
            salience: importance,
            knowledge: 'experienced' as const,
            summary: entry.summary,
        }));
    const visibility = entry.visibility === 'shared' || entry.visibility === 'restricted'
        ? entry.visibility
        : knowerIds.length > 1 && knowerIds.length === validMemberIds.size
            ? 'shared'
            : 'restricted';
    return {
        ...entry,
        participants: subjectIds.length ? subjectIds : knowerIds,
        subjectIds: subjectIds.length ? subjectIds : knowerIds,
        knowerIds,
        perspectives,
        importance,
        visibility,
        sceneId: entry.sceneId?.trim() || undefined,
        sourceMessageIds: Array.from(new Set((entry.sourceMessageIds || []).filter(Boolean))),
        ownerConfirmed: entry.ownerConfirmed === true,
        correctionHistory: (Array.isArray(entry.correctionHistory) ? entry.correctionHistory : [])
            .filter(item => item && Number.isFinite(item.at))
            .slice(-8).map(item => ({
                at: Math.max(0, item.at),
                previousTitle: String(item.previousTitle || '').slice(0, 180),
                previousSummary: String(item.previousSummary || '').slice(0, 2000),
            })),
        searchTags: buildMemorySearchTags(entry.title, entry.summary, entry.kind, entry.searchTags || []),
        unresolved: Boolean(entry.unresolved),
    };
};

export const roomMemoryForMember = (entry: RoomMemoryEntry, memberId: string): RoomMemoryEntry => {
    const perspective = entry.perspectives?.find(item => item.memberId === memberId);
    return {
        ...cloneRoom(entry),
        summary: perspective?.summary || entry.summary,
        importance: perspective?.salience || entry.importance,
        knowerIds: [memberId],
        perspectives: perspective ? [cloneRoom(perspective)] : [],
    };
};

const roomMemoryFingerprint = (entry: Pick<RoomMemoryEntry, 'kind' | 'title' | 'summary' | 'sourceMessageIds'>) => {
    const sources = [...(entry.sourceMessageIds || [])].sort().join('|');
    const text = `${entry.kind}|${entry.title}|${entry.summary}`.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
    return sources ? `${sources}::${text}` : text;
};

const normalizedMemoryWords = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

const memoryBigrams = (value: string) => {
    const normalized = normalizedMemoryWords(value);
    if (normalized.length < 2) return new Set([normalized]);
    return new Set(Array.from({ length: normalized.length - 1 }, (_, index) => normalized.slice(index, index + 2)));
};

const memoryTextIsSimilar = (left: string, right: string) => {
    const leftText = normalizedMemoryWords(left);
    const rightText = normalizedMemoryWords(right);
    if (!leftText || !rightText) return false;
    if (leftText === rightText) return true;
    if (Math.min(leftText.length, rightText.length) >= 4 && (leftText.includes(rightText) || rightText.includes(leftText))) {
        return true;
    }
    const leftPairs = memoryBigrams(leftText);
    const rightPairs = memoryBigrams(rightText);
    const overlap = [...leftPairs].filter(pair => rightPairs.has(pair)).length;
    return overlap / Math.max(1, Math.min(leftPairs.size, rightPairs.size)) >= 0.55;
};

const roomMemoriesDescribeSameEvent = (left: RoomMemoryEntry, right: RoomMemoryEntry) => {
    if (left.kind !== right.kind) return false;
    const leftSources = new Set(left.sourceMessageIds || []);
    const sharesEvidence = (right.sourceMessageIds || []).some(id => leftSources.has(id));
    if (sharesEvidence && memoryTextIsSimilar(left.title, right.title)) return true;
    return memoryTextIsSimilar(left.title, right.title)
        && memoryTextIsSimilar(left.summary, right.summary);
};

const mergeRoomMemory = (target: RoomMemoryEntry, incoming: RoomMemoryEntry, memberCount: number) => {
    target.sourceMessageIds = Array.from(new Set([
        ...(target.sourceMessageIds || []),
        ...(incoming.sourceMessageIds || []),
    ]));
    target.searchTags = mergeMemorySearchTags(
        target.searchTags,
        incoming.searchTags,
        buildMemorySearchTags(target.title, target.summary, target.kind),
        buildMemorySearchTags(incoming.title, incoming.summary, incoming.kind),
    );
    target.subjectIds = Array.from(new Set([
        ...(target.subjectIds || target.participants),
        ...(incoming.subjectIds || incoming.participants),
    ]));
    target.participants = [...target.subjectIds];
    target.knowerIds = Array.from(new Set([
        ...(target.knowerIds || target.participants),
        ...(incoming.knowerIds || incoming.participants),
    ]));
    target.importance = Math.max(target.importance || 1, incoming.importance || 1);
    target.unresolved = Boolean(target.unresolved || incoming.unresolved);
    if (!target.sceneId && incoming.sceneId) target.sceneId = incoming.sceneId;
    if (incoming.summary.length > target.summary.length) target.summary = incoming.summary;
    const perspectives = new Map((target.perspectives || []).map(item => [item.memberId, item]));
    (incoming.perspectives || []).forEach(item => {
        const existing = perspectives.get(item.memberId);
        if (!existing) {
            perspectives.set(item.memberId, cloneRoom(item));
            return;
        }
        existing.salience = Math.max(existing.salience, item.salience);
        if (item.summary.length > existing.summary.length) existing.summary = item.summary;
        if (existing.knowledge === 'told' && item.knowledge !== 'told') existing.knowledge = item.knowledge;
    });
    target.perspectives = [...perspectives.values()];
    target.visibility = target.knowerIds.length === memberCount ? 'shared' : 'restricted';
};


export function applyRoomMemorySummaryState(room:ChatRoom,entries:Array<Omit<RoomMemoryEntry,'id'|'createdAt'|'pinned'>>,userMessageCount:number,summaryVersion:number,vpsJobId?:string,options:{newId?:()=>string;now?:()=>number}={}){
 if(vpsJobId&&room.lastVpsMemoryJobId===vpsJobId)return 0;
        const validMemberIds = new Set(room.members.map(member => member.id));
        let added = 0;
        entries.forEach(entry => {
            const created = normalizeRoomMemoryEntry({
                ...entry,
                id: options.newId?.() || crypto.randomUUID(),
                createdAt: (options.now?.() ?? Date.now()),
                pinned: false,
            }, validMemberIds);
            if (!created.summary.trim()) return;
            const duplicate = room.sharedMemories.find(existing => (
                roomMemoryFingerprint(existing) === roomMemoryFingerprint(created)
                || roomMemoriesDescribeSameEvent(existing, created)
            ));
            if (duplicate) {
                mergeRoomMemory(duplicate, created, room.members.length);
                room.members.forEach(member => {
                    const existingIndex = member.memories.findIndex(item => item.id === duplicate.id);
                    const shouldKnow = (duplicate.knowerIds || []).includes(member.id);
                    if (!shouldKnow && existingIndex >= 0) member.memories.splice(existingIndex, 1);
                    if (shouldKnow) {
                        const memberCopy = roomMemoryForMember(duplicate, member.id);
                        if (existingIndex >= 0) member.memories[existingIndex] = memberCopy;
                        else member.memories.push(memberCopy);
                    }
                });
                return;
            }
            (created.knowerIds || created.participants).forEach(memberId => {
                const member = room.members.find(item => item.id === memberId);
                if (member) member.memories.push(roomMemoryForMember(created, memberId));
            });
            room.sharedMemories.push(created);
            added += 1;
        });
        room.lastSummarizedUserMessageCount = userMessageCount;
        room.memorySummaryVersion = summaryVersion;
        if(vpsJobId)room.lastVpsMemoryJobId=vpsJobId;
        room.updatedAt = (options.now?.() ?? Date.now());

 return added;
}
