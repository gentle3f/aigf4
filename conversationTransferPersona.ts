import type { Persona, PersonaMemoryEntry } from './managers.js';
import type { RoomMember } from './roomManager.js';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const roomMemoryToPersonaMemory = (member: RoomMember, type: 'soul' | 'memory'): PersonaMemoryEntry[] => {
    const entries = type === 'soul' ? member.soul : member.memories;
    return entries.map(entry => ({
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        summary: entry.summary,
        originalText: entry.originalText,
        sourceMessageIds: entry.sourceMessageIds,
        sourceMessageIndexes: entry.sourceMessageIndexes,
        createdAt: entry.createdAt,
        pinned: type === 'soul' || entry.pinned,
    }));
};

const mergeMemoryEntries = (entries: PersonaMemoryEntry[]) => {
    const seen = new Set<string>();
    return entries.filter(entry => {
        const fingerprint = `${entry.kind}:${entry.summary}`.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
        if (!fingerprint || seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
    });
};

export const roomMemberToPersona = (member: RoomMember, sourcePersona?: Persona): Persona => {
    const base = clone(sourcePersona || member.persona);
    const roomPersona = clone(member.persona);
    return {
        ...base,
        ...roomPersona,
        avatarUrl: roomPersona.avatarUrl || base.avatarUrl || null,
        soul: mergeMemoryEntries([
            ...(base.soul || []),
            ...roomMemoryToPersonaMemory(member, 'soul'),
        ]),
        memories: mergeMemoryEntries([
            ...(base.memories || []),
            ...roomMemoryToPersonaMemory(member, 'memory'),
        ]),
    };
};
