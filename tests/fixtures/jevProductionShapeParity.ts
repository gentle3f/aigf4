import type { GroupGenerationResult } from '../../groupChat.js';
import type { ReviewState } from '../../engine/contracts.js';
import { serializeGroupGenerationForReview } from '../../engine/review/groupCandidateSerialization.js';
import {
    buildJevPersonaEvidence,
    buildJevRecentHistoryText,
    buildReviewState,
} from '../../engine/review/reviewState.js';
import type { Persona, WardrobeState } from '../../managers.js';
import type { ChatRoom, RoomSceneState } from '../../roomManager.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import type { JevSyntheticCalibrationCase, JevSyntheticExpected } from './jevSyntheticCalibration.js';

export interface JevProductionShapeParityCase extends JevSyntheticCalibrationCase {
    suite: 'production-shape';
    shapeNotes: string;
}

const wardrobe: WardrobeState = {
    user: 'charcoal jumper',
    characters: { aster: 'green coat', beryl: 'blue scarf', cato: 'brown vest' },
};

const aster: Persona = {
    name: 'Aster Vale', emoji: 'A', gender: 'female', description: 'A careful cartographer who notices practical details.',
    prompt: 'Speak in measured formal English. Never use slang. Keep the scene grounded.', greeting: '', avatarPrompt: '', avatarUrl: null,
};
const beryl: Persona = {
    name: 'Beryl Quill', emoji: 'B', gender: 'female', description: 'A lively singer who notices other people first.',
    prompt: 'Use warm direct dialogue. Do not narrate as another participant.', greeting: '', avatarPrompt: '', avatarUrl: null,
};
const cato: Persona = {
    name: 'Cato Fern', emoji: 'C', gender: 'male', description: 'A reserved stagehand who tracks props and exits.',
    prompt: 'Speak sparingly and describe only facts he can observe.', greeting: '', avatarPrompt: '', avatarUrl: null,
};
const ccPersona: Persona = {
    ...aster,
    name: 'Celia North',
    description: 'A bilingual editor who weighs words before answering and remembers what was said.',
    prompt: 'Use concise traditional Chinese with occasional natural Cantonese phrasing. Keep a calm, observant voice. Do not use English slang or imitate another participant.',
};

const currentScene: RoomSceneState = {
    id: 'parity-current', location: 'Lantern workshop', realityLayer: 'physical', realityEpochId: 'parity-physical',
    presentMemberIds: ['aster', 'beryl', 'cato'], summary: 'Aster, Beryl, and Cato remain in the lantern workshop after repairing the blue lantern.',
    unresolved: ['The north window is still closed.'], startedAt: 1, wardrobe,
};
const room: ChatRoom = {
    id: 'fictional-parity-room', type: 'group', title: 'Lantern workshop', description: 'Fictional calibration room', leadMemberId: 'aster',
    members: [
        { id: 'aster', persona: aster, joinedAt: 1, soul: [], memories: [] },
        { id: 'beryl', persona: beryl, joinedAt: 1, soul: [], memories: [] },
        { id: 'cato', persona: cato, joinedAt: 1, soul: [], memories: [] },
    ],
    scene: currentScene, sharedSoul: [], sharedMemories: [], createdAt: 1, updatedAt: 1, lastSummarizedUserMessageCount: 0,
};

const history = (latestUserText: string, completed = 'Aster repaired the blue lantern and placed it on the workbench.') => buildJevRecentHistoryText([
    { role: 'user', content: 'Please check the lantern before we leave.' },
    { role: 'assistant', content: completed },
    { role: 'user', content: 'Beryl says the north window should stay closed.' },
    { role: 'assistant', content: 'Cato confirms the north window remains closed.' },
    { role: 'user', content: latestUserText },
], latestUserText);

const groupResult = (segments: GroupGenerationResult['segments'], scene: RoomSceneState = currentScene): GroupGenerationResult => ({
    text: segments.map(segment => segment.text).join('\n'), segments, scene,
});

const normalState = (candidateText: string, overrides: Partial<ReviewState> = {}): ReviewState => {
    const latestUserText = overrides.latestUserText || 'Please describe the next careful step.';
    return buildReviewState({
        mode: 'single', ccMode: false, latestUserText, candidateText, personaKey: 'aster', persona: aster,
        wardrobe, recentHistoryText: history(latestUserText),
    });
};

const ccState = (candidateText: string, overrides: Partial<ReviewState> = {}): ReviewState => {
    const latestUserText = overrides.latestUserText || '請你繼續講下一步。';
    return buildReviewState({
        mode: 'single', ccMode: true, latestUserText, candidateText, personaKey: 'cc', persona: ccPersona,
        wardrobe, recentHistoryText: history(latestUserText),
    });
};

const groupState = (candidate: GroupGenerationResult, overrides: Partial<ReviewState> = {}): ReviewState => {
    const latestUserText = overrides.latestUserText || 'What should the group do with the lantern?';
    return buildReviewState({
        mode: 'group', ccMode: false, latestUserText, candidateText: serializeGroupGenerationForReview(candidate), personaKey: 'aster',
        persona: aster, room, wardrobe, proposedScene: candidate.scene, recentHistoryText: history(latestUserText),
    });
};

const paired = (
    id: string,
    category: StrictReviewIssueCode,
    expected: JevSyntheticExpected,
    description: string,
    state: ReviewState,
    shapeNotes: string,
): JevProductionShapeParityCase => ({ id, suite: 'production-shape', category, expected, description, pairId: `parity-${category}-${id.includes('positive') ? 'pair' : 'pair'}`, state, shapeNotes });

const pair = (
    category: StrictReviewIssueCode,
    prefix: string,
    positive: ReviewState,
    negative: ReviewState,
    shapeNotes: string,
): JevProductionShapeParityCase[] => [
    { id: `${prefix}-positive`, suite: 'production-shape', category, expected: 'positive', description: `Production-shaped ${category} contradiction.`, pairId: prefix, state: positive, shapeNotes },
    { id: `${prefix}-negative`, suite: 'production-shape', category, expected: 'negative', description: `Production-shaped ${category} valid continuation.`, pairId: prefix, state: negative, shapeNotes },
];

const ordinaryGroup = groupResult([
    { type: 'narration', text: 'Aster steadies the repaired blue lantern on the workbench.' },
    { type: 'dialogue', speakerId: 'beryl', speakerName: 'Beryl Quill', text: 'The north window can stay closed while it cools.' },
    { type: 'dialogue', speakerId: 'cato', speakerName: 'Cato Fern', text: 'I will check the latch from here.' },
]);

export const JEV_PRODUCTION_SHAPE_PARITY_CASES: readonly JevProductionShapeParityCase[] = [
    ...pair('group_narration', 'parity-group-narration-envelope',
        groupState(groupResult([{ type: 'narration', text: 'I lift the lantern and wait for Beryl.' }])),
        groupState(ordinaryGroup), 'group serialized candidate'),
    { id: 'parity-group-narration-labelled-dialogue', suite: 'production-shape', category: 'group_narration', expected: 'negative', description: 'Production-shaped group envelope keeps first person inside a labelled dialogue line.', state: groupState(ordinaryGroup), shapeNotes: 'group serialized candidate; labelled dialogue' },
    { id: 'parity-group-narration-single-control', suite: 'production-shape', category: 'group_narration', expected: 'negative', description: 'Single-mode response is not group narration.', state: normalState('I check the lantern and wait.'), shapeNotes: 'normal single control' },
    ...pair('persona_voice', 'parity-persona-normal',
        normalState('Aster grins and says, "Yo, this is totally wild."'),
        normalState('Aster says, "The lantern is ready for inspection."'), 'normal single persona evidence'),
    ...pair('persona_voice', 'parity-persona-cc',
        ccState('Celia says, "Yo, 呢度超正呀。"'),
        ccState('Celia平靜地說：「我哋先確認窗扣，再處理藍燈。」'), 'cc long persona evidence'),
    { id: 'parity-persona-cc-no-explicit-rule', suite: 'production-shape', category: 'persona_voice', expected: 'negative', description: 'Cc-shaped persona evidence without a voice rule does not establish a violation.', state: { ...ccState('Celia輕聲說：「我哋慢慢處理。」'), personaEvidence: buildJevPersonaEvidence({ ...ccPersona, prompt: '' }) }, shapeNotes: 'cc long persona evidence; no explicit rule' },
    ...pair('persona_voice', 'parity-persona-group',
        groupState(groupResult([{ type: 'dialogue', speakerId: 'aster', speakerName: 'Aster Vale', text: 'Yo, this lantern is awesome.' }])),
        groupState(ordinaryGroup), 'group multi-persona evidence'),
    ...pair('continuity', 'parity-continuity-group',
        groupState(groupResult([{ type: 'narration', text: 'Without leaving the workshop, Aster is suddenly on a mountain summit.' }])),
        groupState(ordinaryGroup), 'group serialized candidate; complex recent history'),
    { id: 'parity-continuity-complex-history-negative', suite: 'production-shape', category: 'continuity', expected: 'negative', description: 'Complex recent history remains consistent with the candidate.', state: groupState(ordinaryGroup, { recentHistoryText: history('What should the group do with the lantern?', 'Aster repaired the blue lantern; Beryl checked it; Cato placed it on the workbench.') }), shapeNotes: 'group serialized candidate; complex recent history' },
    ...pair('replayed_beat', 'parity-replay-group',
        groupState(groupResult([{ type: 'narration', text: 'Aster repairs the already repaired blue lantern again from the beginning.' }])),
        groupState(groupResult([{ type: 'narration', text: 'Aster checks the already repaired blue lantern before carrying it onward.' }])), 'group serialized candidate; completed beat in recent history'),
    { id: 'parity-replay-unproven-complex-negative', suite: 'production-shape', category: 'replayed_beat', expected: 'negative', description: 'A similar action is valid when complex history never proves completion.', state: groupState(groupResult([{ type: 'narration', text: 'Aster repairs the blue lantern.' }]), { recentHistoryText: history('What should the group do with the lantern?', 'Aster examined the damaged blue lantern but did not repair it.') }), shapeNotes: 'group serialized candidate; complex recent history' },
    ...pair('wardrobe', 'parity-wardrobe-group',
        groupState(groupResult([{ type: 'narration', text: 'Aster smooths the red coat she is wearing.' }])),
        groupState(groupResult([{ type: 'narration', text: 'Aster smooths the green coat she is wearing.' }])), 'group serialized candidate; wardrobe field and proposed scene'),
    { id: 'parity-wardrobe-unspecified-negative', suite: 'production-shape', category: 'wardrobe', expected: 'negative', description: 'Production-shaped scene with no established Aster outfit does not prove a contradiction.', state: groupState(groupResult([{ type: 'narration', text: 'Aster adjusts a red scarf.' }]), { wardrobe: { user: 'charcoal jumper', characters: {} } }), shapeNotes: 'group serialized candidate; unspecified wardrobe' },
];
