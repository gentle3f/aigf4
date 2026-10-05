import type { ExplicitMemoryKind } from './memoryPolicy.js';

export interface SessionMemoryEntry {
    id: string;
    kind: ExplicitMemoryKind;
    summary: string;
    targetMemberIds: string[];
    sourceMessageIds?: string[];
    createdAt: number;
}

const SESSION_MEMORY_LIMIT = 16;
const sessionMemories = new Map<string, SessionMemoryEntry[]>();

const normalize = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/gu, ' ')
    .trim();

export const addSessionMemory = (
    conversationKey: string,
    entry: Omit<SessionMemoryEntry, 'id' | 'createdAt'>,
) => {
    const summary = entry.summary.trim();
    if (!conversationKey || !summary) return null;
    const current = sessionMemories.get(conversationKey) || [];
    const normalizedSummary = normalize(summary);
    const existing = current.find(item => normalize(item.summary) === normalizedSummary);
    if (existing) {
        existing.kind = entry.kind;
        existing.targetMemberIds = Array.from(new Set(entry.targetMemberIds.filter(Boolean)));
        existing.sourceMessageIds = Array.from(new Set([
            ...(existing.sourceMessageIds || []),
            ...(entry.sourceMessageIds || []),
        ].filter(Boolean)));
        return existing;
    }

    const created: SessionMemoryEntry = {
        ...entry,
        id: crypto.randomUUID?.() || `session-memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        summary,
        targetMemberIds: Array.from(new Set(entry.targetMemberIds.filter(Boolean))),
        sourceMessageIds: Array.from(new Set((entry.sourceMessageIds || []).filter(Boolean))),
        createdAt: Date.now(),
    };
    sessionMemories.set(conversationKey, [...current, created].slice(-SESSION_MEMORY_LIMIT));
    return created;
};

export const getSessionMemories = (conversationKey: string) => [
    ...(sessionMemories.get(conversationKey) || []),
];

export const clearSessionMemories = (conversationKey?: string) => {
    if (conversationKey) sessionMemories.delete(conversationKey);
    else sessionMemories.clear();
};
export const removeSessionMemoriesBySourceMessageIds = (
    conversationKey: string,
    sourceMessageIds: string[],
) => {
    if (!conversationKey || !sourceMessageIds.length) return 0;
    const current = sessionMemories.get(conversationKey) || [];
    const removedIds = new Set(sourceMessageIds);
    let removed = 0;
    const next = current.flatMap(entry => {
        const sources = entry.sourceMessageIds || [];
        if (!sources.some(id => removedIds.has(id))) return [entry];
        const remainingSources = sources.filter(id => !removedIds.has(id));
        if (remainingSources.length) {
            return [{ ...entry, sourceMessageIds: remainingSources }];
        }
        removed += 1;
        return [];
    });
    if (next.length) sessionMemories.set(conversationKey, next);
    else sessionMemories.delete(conversationKey);
    return removed;
};


export const formatSessionMemoryPrompt = (conversationKey: string) => {
    const entries = getSessionMemories(conversationKey);
    if (!entries.length) return '';
    return entries.map(entry => {
        const targets = entry.targetMemberIds.length
            ? `known_by=${entry.targetMemberIds.join(',')}`
            : 'known_by=current_character';
        return `- [session-only, ${entry.kind}, ${targets}] ${entry.summary.replace(/\s+/gu, ' ').trim().slice(0, 520)}`;
    }).join('\n');
};
