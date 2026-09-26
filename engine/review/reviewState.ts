import type { Persona, WardrobeState } from '../../managers.js';
import type { ChatRoom, RoomSceneState } from '../../roomManager.js';
import type { ReviewState } from '../contracts.js';

export const MAX_JEV_AUTHORITATIVE_CONTEXT_CHARS = 12_000;
export const MAX_JEV_RECENT_HISTORY_MESSAGES = 8;
export const MAX_JEV_RECENT_HISTORY_CHARS = 8_000;
export const MAX_JEV_REVIEW_STATE_CHARS = 48_000;
const AUTHORITATIVE_CONTEXT_MARKER = '\n...[bounded authoritative context]...\n';

export interface ReviewStateInput {
    mode: 'single' | 'group';
    ccMode: boolean;
    latestUserText: string;
    candidateText: string;
    personaKey: string;
    persona: Readonly<Persona>;
    room?: Readonly<ChatRoom>;
    wardrobe: Readonly<WardrobeState>;
    proposedScene?: Readonly<RoomSceneState>;
    authoritativeContext?: string;
    recentHistoryText?: string;
}

const boundAuthoritativeContext = (context: string, maxChars: number): string => {
    if (context.length <= maxChars) return context;
    if (maxChars <= AUTHORITATIVE_CONTEXT_MARKER.length) return context.slice(0, maxChars);
    const remaining = maxChars - AUTHORITATIVE_CONTEXT_MARKER.length;
    const headLength = Math.ceil(remaining / 2);
    return `${context.slice(0, headLength)}${AUTHORITATIVE_CONTEXT_MARKER}${context.slice(-(remaining - headLength))}`;
};

export const boundJevAuthoritativeContext = (context: string): string => (
    boundAuthoritativeContext(context, MAX_JEV_AUTHORITATIVE_CONTEXT_CHARS)
);

export interface ReviewHistoryMessage {
    role: string;
    content: unknown;
}

const historyRoleLabel = (role: string) => role === 'user' ? 'USER' : 'ASSISTANT';
const historyText = (content: unknown): string => typeof content === 'string' ? content : '';

export const buildJevRecentHistoryText = (
    messages: readonly ReviewHistoryMessage[],
    latestUserText: string,
): string | undefined => {
    const visible = messages.filter(message => message.role === 'user' || message.role === 'assistant' || message.role === 'model');
    const newestUserIndex = visible.map(message => (
        message.role === 'user' && historyText(message.content) === latestUserText
    )).lastIndexOf(true);
    const withoutLatest = visible.filter((_, index) => index !== newestUserIndex);
    const recent = withoutLatest.slice(-MAX_JEV_RECENT_HISTORY_MESSAGES);
    const selected: string[] = [];
    let total = 0;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
        const message = recent[index];
        const label = `${historyRoleLabel(message.role)}:\n`;
        const text = historyText(message.content);
        const separator = selected.length ? '\n\n' : '';
        const block = `${label}${text}`;
        const available = MAX_JEV_RECENT_HISTORY_CHARS - total - separator.length;
        if (available <= label.length) continue;
        const boundedBlock = block.length <= available
            ? block
            : `${label}${text.slice(-(available - label.length))}`;
        selected.unshift(boundedBlock);
        total += separator.length + boundedBlock.length;
    }
    return selected.length ? selected.join('\n\n') : undefined;
};

const fitOptionalEvidence = <T extends object>(
    state: T,
    field: 'authoritativeContext' | 'recentHistoryText',
    value: string | undefined,
    truncate: (text: string, maxChars: number) => string,
): string | undefined => {
    if (!value) return undefined;
    const fits = (text: string) => JSON.stringify({ ...state, [field]: text }).length <= MAX_JEV_REVIEW_STATE_CHARS;
    if (fits(value)) return value;
    let low = 0;
    let high = value.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(truncate(value, middle))) low = middle;
        else high = middle - 1;
    }
    return low ? truncate(value, low) : undefined;
};

const boundTail = (text: string, maxChars: number) => text.length <= maxChars ? text : text.slice(-maxChars);

const copyWardrobe = (wardrobe: Readonly<WardrobeState>): WardrobeState => ({
    user: wardrobe.user,
    characters: { ...wardrobe.characters },
});

const copyScene = (scene: Readonly<RoomSceneState>): RoomSceneState => ({
    id: scene.id,
    location: scene.location,
    realityLayer: scene.realityLayer,
    realityEpochId: scene.realityEpochId,
    presentMemberIds: [...scene.presentMemberIds],
    summary: scene.summary,
    unresolved: [...scene.unresolved],
    startedAt: scene.startedAt,
    wardrobe: scene.wardrobe ? copyWardrobe(scene.wardrobe) : undefined,
});

export const buildReviewState = (input: ReviewStateInput): ReviewState => {
    const scene = input.room?.scene;
    const base: ReviewState = {
        mode: input.mode,
        ccMode: input.ccMode,
        latestUserText: input.latestUserText,
        realityLayer: scene?.realityLayer,
        realityEpochId: scene?.realityEpochId,
        sceneSummary: scene?.summary,
        participants: input.room
            ? input.room.members.map(member => ({
                id: member.id,
                name: member.persona.name,
                present: scene?.presentMemberIds.includes(member.id),
            }))
            : [{ id: input.personaKey, name: input.persona.name, present: true, role: 'active character' }],
        wardrobe: copyWardrobe(input.wardrobe),
        // Shadow V1 deliberately does not trigger memory retrieval at review time.
        relevantMemories: [],
        candidateText: input.candidateText,
        proposedScene: input.proposedScene ? copyScene(input.proposedScene) : undefined,
    };
    const authoritativeContext = fitOptionalEvidence(
        base,
        'authoritativeContext',
        input.authoritativeContext === undefined ? undefined : boundJevAuthoritativeContext(input.authoritativeContext),
        boundAuthoritativeContext,
    );
    const withAuthoritative = authoritativeContext ? { ...base, authoritativeContext } : base;
    const recentHistoryText = fitOptionalEvidence(
        withAuthoritative,
        'recentHistoryText',
        input.recentHistoryText,
        boundTail,
    );
    return { ...withAuthoritative, ...(recentHistoryText ? { recentHistoryText } : {}) };
};
