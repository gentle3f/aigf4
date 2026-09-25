import type { Persona, WardrobeState } from '../../managers.js';
import type { ChatRoom, RoomSceneState } from '../../roomManager.js';
import type { ReviewState } from '../contracts.js';

export interface ReviewStateInput {
    latestUserText: string;
    candidateText: string;
    personaKey: string;
    persona: Readonly<Persona>;
    room?: Readonly<ChatRoom>;
    wardrobe: Readonly<WardrobeState>;
    proposedScene?: Readonly<RoomSceneState>;
}

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
    return {
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
};
