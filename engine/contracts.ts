import type { GroupGenerationResult } from '../groupChat.js';
import type { Persona, WardrobeState } from '../managers.js';
import type { ChatRoom, RoomSceneState } from '../roomManager.js';
import type { VeniceMessage } from '../venice.js';

export type EngineTurnMode = 'single' | 'group' | 'assistant';

export interface ResolvedModelRoute {
    primary: string;
    fallbacks: string[];
    strictReview: string[];
    source: 'env' | 'saved-setting' | 'default' | 'unknown';
    ccMode: boolean;
}

export interface TurnSnapshot {
    requestId: string;
    conversationKey: string;
    mode: EngineTurnMode;
    latestUserText: string;
    personaSnapshot: Readonly<Persona>;
    roomSnapshot?: Readonly<ChatRoom>;
    wardrobeSnapshot: Readonly<WardrobeState>;
    modelRoute: Readonly<ResolvedModelRoute>;
    startedAt: number;
    signal: AbortSignal;
}

export interface TurnContext {
    systemPrompt: string;
    recentMessages: VeniceMessage[];
    latestUserContent: VeniceMessage['content'];
    evidence: {
        historyMessageIds: string[];
        retrievedMemoryIds: string[];
        realityLayer?: RoomSceneState['realityLayer'];
        realityEpochId?: string;
    };
    accounting: {
        systemChars: number;
        recentHistoryChars: number;
        componentChars?: Record<string, number>;
    };
}

export interface SingleCandidate {
    visibleText: string;
    proposedWardrobe: WardrobeState;
}

export interface GroupCandidate {
    result: GroupGenerationResult;
}

export interface ReviewAssessment {
    outcome: 'accept' | 'strict-review' | 'unavailable';
    reasons: string[];
    provider?: string;
    confidence?: number;
}

export interface ReviewState {
    mode: 'single' | 'group';
    ccMode: boolean;
    latestUserText: string;
    realityLayer?: RoomSceneState['realityLayer'];
    realityEpochId?: string;
    sceneSummary?: string;
    participants: Array<{
        id: string;
        name: string;
        present?: boolean;
        role?: string;
    }>;
    wardrobe?: WardrobeState;
    relevantMemories: Array<{
        id: string;
        summary: string;
        kind?: string;
    }>;
    candidateText: string;
    proposedScene?: RoomSceneState;
    authoritativeContext?: string;
    recentHistoryText?: string;
}

export interface DecisionAssessment extends ReviewAssessment {
    wouldRoute?: 'accept' | 'strict-review';
}

export interface DecisionProvider {
    evaluate(state: Readonly<ReviewState>, signal?: AbortSignal): Promise<DecisionAssessment>;
}
