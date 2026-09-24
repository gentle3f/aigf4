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
    proposedScene: RoomSceneState;
    proposedWardrobe: WardrobeState;
}

export interface ReviewAssessment {
    outcome: 'accept' | 'strict-review' | 'unavailable';
    reasons: string[];
    provider?: string;
    confidence?: number;
}

export interface ReviewState {
    latestUserText: string;
    realityLayer?: RoomSceneState['realityLayer'];
    realityEpochId?: string;
    sceneSummary?: string;
    participantIds: string[];
    wardrobe?: WardrobeState;
    relevantMemoryIds: string[];
    candidateText: string;
    proposedScene?: RoomSceneState;
}

export interface DecisionAssessment extends ReviewAssessment {
    wouldRoute?: 'accept' | 'strict-review';
}

export interface DecisionProvider {
    evaluate(state: Readonly<ReviewState>, signal?: AbortSignal): Promise<DecisionAssessment>;
}
