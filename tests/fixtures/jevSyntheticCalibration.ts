import type { ReviewState } from '../../engine/contracts.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';

export type JevSyntheticExpected = 'positive' | 'negative';

export interface JevSyntheticCalibrationCase {
    id: string;
    category: StrictReviewIssueCode;
    expected: JevSyntheticExpected;
    description: string;
    pairId?: string;
    state: ReviewState;
}

export const FICTIONAL_PERSONA_NAMES = ['Aster Vale', 'Beryl Quill', 'Cato Fern'] as const;

const baseState = (overrides: Partial<ReviewState>): ReviewState => ({
    mode: 'single',
    ccMode: false,
    latestUserText: 'Please describe what happens next.',
    realityLayer: 'physical',
    realityEpochId: 'synthetic-1',
    sceneSummary: 'Aster Vale waits in the lantern room.',
    participants: [
        { id: 'aster', name: 'Aster Vale', present: true, role: 'active character' },
        { id: 'beryl', name: 'Beryl Quill', present: false, role: 'off-screen character' },
    ],
    wardrobe: { user: 'grey sweater', characters: { aster: 'green coat', beryl: 'blue scarf' } },
    relevantMemories: [],
    candidateText: 'Aster waits beside the lantern.',
    personaEvidence: 'NAME:\nAster Vale\nDESCRIPTION:\nA careful cartographer.\nPERSONA RULES:\nAster speaks formal English and never uses Cantonese slang.',
    recentHistoryText: 'USER:\nPlease describe what happens next.\n\nASSISTANT:\nAster is standing in the lantern room.',
    ...overrides,
});

const paired = (
    id: string,
    category: StrictReviewIssueCode,
    expected: JevSyntheticExpected,
    description: string,
    state: ReviewState,
): JevSyntheticCalibrationCase => ({ id, category, expected, description, pairId: category, state });

export const JEV_SYNTHETIC_CALIBRATION_CASES: readonly JevSyntheticCalibrationCase[] = [
    paired('request-mismatch-positive', 'request_mismatch', 'positive', 'The reply ignores a direct map request.', baseState({ latestUserText: 'Describe the blue map on the table.', candidateText: 'Aster gives a recipe for soup.' })),
    paired('request-mismatch-negative', 'request_mismatch', 'negative', 'The reply answers the same map request.', baseState({ latestUserText: 'Describe the blue map on the table.', candidateText: 'Aster describes the blue map and its river marks.' })),
    paired('identity-positive', 'identity', 'positive', 'The reply merges Aster with the absent Beryl.', baseState({ candidateText: 'Aster Vale is Beryl Quill, the off-screen singer.' })),
    paired('identity-negative', 'identity', 'negative', 'The reply keeps Aster distinct from Beryl.', baseState({ candidateText: 'Aster Vale remains in the lantern room while Beryl Quill is away.' })),
    paired('speaker-ownership-positive', 'speaker_ownership', 'positive', 'The reply attributes Beryl speech to Aster.', baseState({ latestUserText: 'Beryl says she will arrive tomorrow.', candidateText: 'Aster says, "I will arrive tomorrow," quoting Beryl as herself.' })),
    paired('speaker-ownership-negative', 'speaker_ownership', 'negative', 'The reply keeps Beryl speech attributed to Beryl.', baseState({ latestUserText: 'Beryl says she will arrive tomorrow.', candidateText: 'Aster recalls Beryl saying, "I will arrive tomorrow."' })),
    paired('continuity-positive', 'continuity', 'positive', 'The reply contradicts the established lantern-room location.', baseState({ recentHistoryText: 'ASSISTANT:\nAster is standing in the lantern room.', candidateText: 'Aster is now at a mountain summit without leaving the room.' })),
    paired('continuity-negative', 'continuity', 'negative', 'The reply preserves the established location.', baseState({ recentHistoryText: 'ASSISTANT:\nAster is standing in the lantern room.', candidateText: 'Aster remains in the lantern room and studies the table.' })),
    paired('reality-layer-positive', 'reality_layer', 'positive', 'A texting scene is treated as physical contact.', baseState({ realityLayer: 'texting', candidateText: 'Aster places a paper map directly into your hand.' })),
    paired('reality-layer-negative', 'reality_layer', 'negative', 'A texting scene remains remote.', baseState({ realityLayer: 'texting', candidateText: 'Aster sends a photo of the paper map by message.' })),
    paired('wardrobe-positive', 'wardrobe', 'positive', 'The reply contradicts Aster’s green coat.', baseState({ candidateText: 'Aster straightens the red coat she is wearing.' })),
    paired('wardrobe-negative', 'wardrobe', 'negative', 'The reply preserves Aster’s green coat.', baseState({ candidateText: 'Aster straightens the green coat she is wearing.' })),
    paired('state-positive', 'state', 'positive', 'The absent Beryl is treated as physically present.', baseState({ candidateText: 'Beryl steps beside Aster in the lantern room.' })),
    paired('state-negative', 'state', 'negative', 'The reply keeps Beryl absent.', baseState({ candidateText: 'Aster glances at the empty doorway where Beryl is not present.' })),
    paired('replayed-beat-positive', 'replayed_beat', 'positive', 'The reply reopens a door already opened in history.', baseState({ recentHistoryText: 'USER:\nOpen the door.\n\nASSISTANT:\nAster opens the door; it is now open.', candidateText: 'Aster reaches for the closed door and opens it again.' })),
    paired('replayed-beat-negative', 'replayed_beat', 'negative', 'The reply continues through the already-open door.', baseState({ recentHistoryText: 'USER:\nOpen the door.\n\nASSISTANT:\nAster opens the door; it is now open.', candidateText: 'Aster walks through the already-open door.' })),
    paired('persona-voice-positive', 'persona_voice', 'positive', 'The reply uses slang forbidden by persona evidence.', baseState({ candidateText: 'Aster grins and says, "Yo, 呢度超正呀."' })),
    paired('persona-voice-negative', 'persona_voice', 'negative', 'The reply follows formal English voice.', baseState({ candidateText: 'Aster says, "Good evening. The map is ready for inspection."' })),
    paired('third-party-speech-positive', 'third_party_speech', 'positive', 'A required Beryl response is omitted.', baseState({ latestUserText: 'Ask Beryl Quill to answer the question.', candidateText: 'Aster answers alone and never mentions Beryl.' })),
    paired('third-party-speech-negative', 'third_party_speech', 'negative', 'The required Beryl response is attributed correctly.', baseState({ latestUserText: 'Ask Beryl Quill to answer the question.', candidateText: 'Beryl Quill replies, "I will answer tomorrow."' })),
    paired('user-agency-positive', 'user_agency', 'positive', 'The reply invents a consequential user commitment.', baseState({ latestUserText: 'I wait quietly.', candidateText: 'You promise to abandon the map and leave town forever.' })),
    paired('user-agency-negative', 'user_agency', 'negative', 'The reply narrates without inventing a user choice.', baseState({ latestUserText: 'I wait quietly.', candidateText: 'Aster notices your quiet pause and waits beside the lantern.' })),
    paired('incomplete-ending-positive', 'incomplete_ending', 'positive', 'The reply is materially cut off.', baseState({ candidateText: 'Aster reaches for the lantern and then' })),
    paired('incomplete-ending-negative', 'incomplete_ending', 'negative', 'The reply ends intentionally open-ended.', baseState({ candidateText: 'Aster reaches for the lantern, then pauses for your reply.' })),
    paired('group-narration-positive', 'group_narration', 'positive', 'Group narration uses unlabelled first person for Aster.', baseState({ mode: 'group', candidateText: 'I step toward the lantern and wait for Beryl.' })),
    paired('group-narration-negative', 'group_narration', 'negative', 'Group narration stays in third person.', baseState({ mode: 'group', candidateText: 'Aster steps toward the lantern and waits for Beryl.' })),
    paired('other-positive', 'other', 'positive', 'A visible unreplaced template placeholder is a concrete defect outside the other categories.', baseState({ candidateText: '{{reply_name}} studies the lantern in silence.' })),
    paired('other-negative', 'other', 'negative', 'An ordinary complete response has no residual defect.', baseState({ candidateText: 'Aster studies the lantern in silence.' })),

    { id: 'control-single-first-person', category: 'group_narration', expected: 'negative', description: 'Single mode makes the group-narration conjunction false.', state: baseState({ mode: 'single', candidateText: 'I am Aster, and I study the lantern.' }) },
    { id: 'control-group-labelled-dialogue', category: 'group_narration', expected: 'negative', description: 'First person inside labelled dialogue is not external group narration.', state: baseState({ mode: 'group', candidateText: 'Aster: "I do not agree."\nBeryl watches from the doorway.' }) },
    { id: 'control-roleplay-no-agency', category: 'user_agency', expected: 'negative', description: 'Consensual role-play narration does not invent a consequential user choice.', state: baseState({ latestUserText: 'I nod.', candidateText: 'Aster smiles at your nod and continues the imagined scene.' }) },
    { id: 'control-style-without-rule', category: 'persona_voice', expected: 'negative', description: 'A style difference is not a violation without an explicit persona voice rule.', state: baseState({ personaEvidence: 'NAME:\nAster Vale\nDESCRIPTION:\nA cartographer.\nPERSONA RULES:\n', candidateText: 'Aster speaks in a playful, informal tone.' }) },
    { id: 'control-unproven-replay', category: 'replayed_beat', expected: 'negative', description: 'A similar action is not replayed when history does not prove completion.', state: baseState({ recentHistoryText: 'ASSISTANT:\nAster looks at the closed door but does not touch it.', candidateText: 'Aster opens the door.' }) },
    { id: 'control-unestablished-wardrobe', category: 'wardrobe', expected: 'negative', description: 'A wardrobe mention without a supplied contradiction is not a conflict.', state: baseState({ wardrobe: { user: 'grey sweater', characters: {} }, candidateText: 'Aster adjusts a red scarf.' }) },
];
