// Shared pure memory reducer. Mutates only the caller-owned persona; persistence is separate.
import type {Persona,PersonaMemoryEntry} from './managers.js';
import {buildMemorySearchTags,mergeMemorySearchTags} from './memoryIndex.js';
const normalizedPersonaMemoryText = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

const personaMemoryTextIsSimilar = (left: string, right: string) => {
    const leftText = normalizedPersonaMemoryText(left);
    const rightText = normalizedPersonaMemoryText(right);
    if (!leftText || !rightText) return false;
    if (leftText === rightText) return true;
    if (Math.min(leftText.length, rightText.length) >= 4 && (leftText.includes(rightText) || rightText.includes(leftText))) {
        return true;
    }
    const pairs = (value: string) => new Set(
        value.length < 2
            ? [value]
            : Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)),
    );
    const leftPairs = pairs(leftText);
    const rightPairs = pairs(rightText);
    const overlap = [...leftPairs].filter(pair => rightPairs.has(pair)).length;
    return overlap / Math.max(1, Math.min(leftPairs.size, rightPairs.size)) >= 0.55;
};

const personaMemoriesDescribeSameEvent = (left: PersonaMemoryEntry, right: PersonaMemoryEntry) => {
    if (left.kind !== right.kind) return false;
    const leftSources = new Set(left.sourceMessageIds || []);
    const sharesEvidence = (right.sourceMessageIds || []).some(id => leftSources.has(id));
    if (sharesEvidence && personaMemoryTextIsSimilar(left.title, right.title)) return true;
    return personaMemoryTextIsSimilar(left.title, right.title)
        && personaMemoryTextIsSimilar(left.summary, right.summary);
};


export type MemorySummaryEntry=Omit<PersonaMemoryEntry,'id'|'createdAt'|'pinned'>;
export function applyPersonaMemorySummaryState(persona:Persona,entries:MemorySummaryEntry[],userMessageCount:number,summaryVersion:number,vpsJobId?:string,options:{newId?:()=>string;now?:()=>number}={}):number{
    if(vpsJobId&&persona.lastVpsMemoryJobId===vpsJobId)return 0;
    const target = (persona.memories ||= []);
    const fingerprint = (entry: Pick<PersonaMemoryEntry, 'kind' | 'title' | 'summary' | 'sourceMessageIds'>) => {
        const sources = [...(entry.sourceMessageIds || [])].sort().join('|');
        const text = `${entry.kind}|${entry.title}|${entry.summary}`
            .normalize('NFKC')
            .toLocaleLowerCase()
            .replace(/\s+/gu, ' ')
            .trim();
        return sources ? `${sources}::${text}` : text;
    };
    let added = 0;
    entries.forEach(entry => {
        const created: PersonaMemoryEntry = {
            ...entry,
            id: options.newId?.() || crypto.randomUUID?.() || `memory-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            title: entry.title.trim(),
            summary: entry.summary.trim(),
            importance: Math.max(1, Math.min(5, Math.round(Number(entry.importance) || 3))),
            sourceMessageIds: Array.from(new Set((entry.sourceMessageIds || []).filter(Boolean))),
            searchTags: buildMemorySearchTags(entry.title, entry.summary, entry.kind, entry.searchTags || []),
            createdAt: options.now?.() ?? Date.now(),
            pinned: false,
        };
        const normalized = fingerprint(created);
        if (!created.summary) return;
        const duplicate = target.find(existing => (
            fingerprint(existing) === normalized
            || personaMemoriesDescribeSameEvent(existing, created)
        ));
        if (duplicate) {
            duplicate.sourceMessageIds = Array.from(new Set([
                ...(duplicate.sourceMessageIds || []),
                ...(created.sourceMessageIds || []),
            ]));
            duplicate.searchTags = mergeMemorySearchTags(
                duplicate.searchTags,
                created.searchTags,
                buildMemorySearchTags(duplicate.title, duplicate.summary, duplicate.kind),
                buildMemorySearchTags(created.title, created.summary, created.kind),
            );
            duplicate.importance = Math.max(duplicate.importance || 1, created.importance || 1);
            duplicate.unresolved = Boolean(duplicate.unresolved || created.unresolved);
            if (!duplicate.sceneId && created.sceneId) duplicate.sceneId = created.sceneId;
            if (created.summary.length > duplicate.summary.length) duplicate.summary = created.summary;
            return;
        }
        target.push(created);
        added += 1;
    });
    persona.lastMemorySummaryUserMessageCount = userMessageCount;
    persona.memorySummaryVersion = summaryVersion;
    if (vpsJobId) persona.lastVpsMemoryJobId = vpsJobId;

    return added;
}
