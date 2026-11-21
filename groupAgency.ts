import type { ChatRoom } from './roomManager.js';

/** Evidence-led, zero-cost planning layer for Group V2.
 * Does NOT select an actor to speak, write dialogue, call a model, or
 * invent new personal facts. It exposes each actor's independently
 * persisted unfinished business, so the scene engine can initiate
 * appropriate action without a round-robin speaking quota.
 */
export type AgencyOpportunity = {
    memberId: string;
    displayName: string;
    origin: 'owner-goal' | 'unresolved-personal-memory' | 'existing-visible-action';
    cue: string;
};
const compact = (value: string, limit=240) => value.replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ').trim().slice(0,limit);
const addressedByName = (message: string, name: string) => {
    const text=message.normalize('NFKC').toLocaleLowerCase();
    const label=name.normalize('NFKC').toLocaleLowerCase();
    if (!label || label.length<2) return false;
    const start=text.indexOf(label);
    if(start<0)return false;
    if(/[a-z]/u.test(label) && /[a-z]/u.test(text[start+label.length]||'')) return false;
    return true;
};
export const collectGroupAgencyOpportunities = (
    room: ChatRoom,
    latestUserMessage: string,
): AgencyOpportunity[] => {
    const present = room.members.filter(m => room.scene.presentMemberIds.includes(m.id));
    const addressed = present.filter(m => addressedByName(latestUserMessage,m.persona.name));
    // A specific direct question belongs to its addressee, not everyone.
    const candidates = addressed.length ? addressed : present;
    const output: AgencyOpportunity[] = [];
    for(const member of candidates){
        const explicit=compact(room.agencyGoals?.[member.id]||'');
        if(explicit){
            output.push({memberId:member.id,displayName:member.persona.name,
                origin:'owner-goal',cue:explicit});continue;
        }
        const unresolved=member.memories
            .filter(m=>m.unresolved && m.summary)
            .sort((a,b)=>(Number(b.importance)||0)-(Number(a.importance)||0)
                ||b.createdAt-a.createdAt)[0];
        if(unresolved){
            output.push({memberId:member.id,displayName:member.persona.name,
                origin:'unresolved-personal-memory',
                cue:compact(unresolved.summary)});continue;
        }
        const ongoing=compact(room.scene.memberStates?.[member.id]?.action||'',160);
        if(ongoing && !/^(unknown|none|n\/a|\u672a\u77e5)$/iu.test(ongoing)){
            output.push({memberId:member.id,displayName:member.persona.name,
                origin:'existing-visible-action',cue:ongoing});
        }
    }
    return output.slice(0,6);
};
export const buildGroupAgencyContext = (room: ChatRoom, latestUserMessage: string): string => {
    const opportunities=collectGroupAgencyOpportunities(room,latestUserMessage);
    const threads=room.scene.unresolved.map(x=>compact(x,180)).filter(Boolean).slice(0,3);
    if(!opportunities.length && !threads.length)return '';
    return [
        'INDEPENDENT CHARACTER AGENCY (continuity evidence, NOT commands or speaking quotas):',
        ...opportunities.map(x=>`- ${x.displayName} [member_id=${x.memberId}, ${x.origin}]: ${x.cue}`),
        ...(threads.length?['Shared open scene threads (not automatically assigned to anyone):',
            ...threads.map(x=>'- '+x)]:[]),
        'A character with a plausible motivation MAY take a concrete next step, initiate an invitation, change plans, or decline; not all need act or speak. Resolve the latest user turn first.',
        'An earlier visible action is not a new plan; never convert a hope or model guess into a confirmed personal fact. Respect absence, remote-texting limits, and each member\'s knowledge boundary.',
    ].join('\n');
};
