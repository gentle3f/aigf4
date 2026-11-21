import type { ChatRoom, RoomMemoryEntry } from './roomManager.js';
import { getRoomMemoryKnowerIds, getRoomMemorySubjectIds } from './memoryRetrieval.js';

/** A causal index over the existing durable memory store, not a second DB.
 * Owner corrections outrank model-generated interpretations. Actor and knower
 * sets are independent: being involved is NOT the same as knowing.
 */
export interface StoryFact {
    id: string;
    kind: string;
    summary: string;
    actorIds: string[];
    knowerIds: string[];
    provenance: 'owner-confirmed' | 'source-referenced';
    sourceMessages: number;
}
const factualKinds = new Set(['event','relationship','promise','core','boundary']);
export const collectStoryFacts = (room: ChatRoom, limit=10): StoryFact[] => {
    const members = new Set(room.members.map(m=>m.id));
    const facts = room.sharedMemories
        .filter(e=>factualKinds.has(e.kind) && (e.ownerConfirmed || e.sourceMessageIds?.length))
        .sort((a,b)=> Number(Boolean(b.ownerConfirmed))-Number(Boolean(a.ownerConfirmed))
            || b.createdAt-a.createdAt)
        .slice(0,Math.max(0,Math.min(limit,24)));
    return facts.map((entry: RoomMemoryEntry)=>({
        id:entry.id,
        kind:entry.kind,
        summary:entry.summary.replace(/\s+/gu,' ').slice(0,360),
        actorIds:getRoomMemorySubjectIds(entry).filter(x=>members.has(x)),
        knowerIds:getRoomMemoryKnowerIds(entry).filter(x=>members.has(x)),
        provenance:entry.ownerConfirmed?'owner-confirmed':'source-referenced',
        sourceMessages:entry.sourceMessageIds?.length||0,
    }));
};
export const buildStoryCausalityLedger = (room: ChatRoom): string => {
    // Do not put private events into a room-wide causal index. They are
    // already carried separately in the relevant member's memory file.
    const facts=collectStoryFacts(room,24)
        .filter(fact=>room.scene.presentMemberIds.length>0 &&
            room.scene.presentMemberIds.every(id=>fact.knowerIds.includes(id)))
        .slice(0,9);
    if(!facts.length)return '';
    const names=new Map(room.members.map(member=>[member.id,member.persona.name]));
    const describe=(ids:string[])=>ids.map(id=>names.get(id)||id).join(', ')||'unknown';
    return [
        'SCENE CAUSALITY / PERSON-KNOWLEDGE INDEX (grounded in existing room memories):',
        ...facts.map(e=>
            `- [${e.provenance}; ${e.kind}; ${e.sourceMessages} linked messages] ${e.summary} | ACTORS: ${describe(e.actorIds)} | KNOWS: ${describe(e.knowerIds)}`),
        'ACTORS means involved in the event, NOT necessarily its narrator or current speaker. KNOWS lists only members with explicit memory access.',
        'A referenced memory without owner confirmation may reflect an imperfect model interpretation. A later owner correction or current explicit user correction overrides it.',
        'An absent member or a member not in KNOWS may not learn a fact by the scene engine merely reading this index; visible disclosure is required.',
    ].join('\n');
};
