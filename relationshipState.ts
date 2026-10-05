import type {
    Persona,
    RelationshipStage,
    RelationshipState,
    SurpriseEventProposal,
} from './managers.js';

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, Math.round(value)));

export const relationshipStageFor = (closeness: number, trust: number): RelationshipStage => {
    const foundation = Math.min(closeness, trust);
    if (foundation >= 84) return 'devoted';
    if (foundation >= 68) return 'romantic';
    if (foundation >= 50) return 'close';
    if (foundation >= 30) return 'familiar';
    return 'new';
};

export const normalizeRelationshipState = (
    value?: Partial<RelationshipState> | null,
    memoryCount = 0,
): RelationshipState => {
    const inferredBase = clamp(28 + Math.min(memoryCount, 18) * 2, 28, 64);
    const closeness = clamp(Number(value?.closeness ?? inferredBase));
    const trust = clamp(Number(value?.trust ?? inferredBase + 4));
    const romanticTension = clamp(Number(value?.romanticTension ?? Math.max(24, inferredBase - 6)));
    const initiative = clamp(Number(value?.initiative ?? 42));
    return {
        closeness,
        trust,
        romanticTension,
        initiative,
        stage: relationshipStageFor(closeness, trust),
        updatedAt: Number(value?.updatedAt || Date.now()),
    };
};

export const formatRelationshipStatePrompt = (persona: Persona) => {
    const state = normalizeRelationshipState(
        persona.relationshipState,
        (persona.soul?.length || 0) + (persona.memories?.length || 0),
    );
    return [
        'PRIVATE RELATIONSHIP PULSE (internal guidance; never reveal scores or labels):',
        `Stage: ${state.stage}. Closeness ${state.closeness}/100; trust ${state.trust}/100; romantic tension ${state.romanticTension}/100; initiative ${state.initiative}/100.`,
        'Treat this as soft emotional continuity, never as a restriction on the newest user request.',
    ].join('\n');
};

const countMatches = (text: string, pattern: RegExp) => (text.match(pattern) || []).length;

export const advanceRelationshipState = (
    persona: Persona,
    userText: string,
    responseText: string,
    effect?: SurpriseEventProposal['relationshipEffect'],
): RelationshipState => {
    const current = normalizeRelationshipState(
        persona.relationshipState,
        (persona.soul?.length || 0) + (persona.memories?.length || 0),
    );
    const combined = `${userText}\n${responseText}`;
    const careSignals = countMatches(combined, /信任|相信|照顧|陪伴|辛苦|放心|脆弱|真心|承諾|記得|支持|抱住|擁抱|掛住|想念|鍾意|喜歡|愛你/giu);
    const playfulSignals = countMatches(combined, /曖昧|心跳|臉紅|吃醋|呷醋|調情|約會|親吻|吻|撒嬌|黏|引誘|誘惑/giu);
    const initiativeSignals = countMatches(responseText, /我帶你|我想帶你|跟我來|陪我去|我已經決定|我安排|讓我來|交給我|我有個主意|不如我哋|不如我們/giu);
    const conflictSignals = countMatches(combined, /不信|失望|欺騙|背叛|冷落|討厭|唔信|嬲|生氣/giu);
    const closeness = clamp(current.closeness + Math.min(careSignals, 2) + (effect?.closeness || 0));
    const trust = clamp(current.trust + Math.min(careSignals, 2) - Math.min(conflictSignals, 2) + (effect?.trust || 0));
    const romanticTension = clamp(current.romanticTension + Math.min(playfulSignals, 3) + (effect?.romanticTension || 0));
    const initiative = clamp(current.initiative + Math.min(initiativeSignals, 2) + (effect?.initiative || 0));
    return {
        closeness,
        trust,
        romanticTension,
        initiative,
        stage: relationshipStageFor(closeness, trust),
        updatedAt: Date.now(),
    };
};
