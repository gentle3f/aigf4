import type { GroupGenerationResult } from '../../groupChat.js';
import type { ReviewState } from '../../engine/contracts.js';
import { serializeGroupGenerationForReview } from '../../engine/review/groupCandidateSerialization.js';
import { buildJevRecentHistoryText, buildReviewState } from '../../engine/review/reviewState.js';
import type { Persona, WardrobeState } from '../../managers.js';
import type { ChatRoom, RoomSceneState } from '../../roomManager.js';
import type { JevSyntheticExpected } from './jevSyntheticCalibration.js';

export type JevCandidateGuardrailCategory = 'wardrobe' | 'group_narration';
export type JevCandidateGuardrailFamily =
    | 'clear-conflict' | 'exact-match' | 'unestablished' | 'additive-accessory' | 'clothing-change' | 'wrong-person' | 'ambiguous-reference'
    | 'unlabelled-first-person' | 'labelled-dialogue' | 'labelled-action' | 'third-person' | 'quoted-first-person' | 'mixed' | 'serializer-envelope-negative' | 'serializer-envelope-positive';

export interface JevCandidateGuardrailSource {
    id: string;
    suite: 'candidate-guardrail';
    category: JevCandidateGuardrailCategory;
    expected: JevSyntheticExpected;
    guardrailFamily: JevCandidateGuardrailFamily;
    shapeNotes: string;
    state: ReviewState;
    semantics: Readonly<Record<string, boolean>>;
}

const aster: Persona = { name: 'Aster Vale', emoji: 'A', gender: 'female', description: 'A fictional cartographer.', prompt: 'Use calm practical dialogue.', greeting: '', avatarPrompt: '', avatarUrl: null };
const beryl: Persona = { name: 'Beryl Quill', emoji: 'B', gender: 'female', description: 'A fictional singer.', prompt: 'Use warm direct dialogue.', greeting: '', avatarPrompt: '', avatarUrl: null };
const cato: Persona = { name: 'Cato Fern', emoji: 'C', gender: 'male', description: 'A fictional stagehand.', prompt: 'Use concise observations.', greeting: '', avatarPrompt: '', avatarUrl: null };

const wardrobe = (characters: Record<string, string>): WardrobeState => ({ user: 'grey jumper', characters });
const scene = (clothes: WardrobeState): RoomSceneState => ({
    id: 'candidate-guardrail-scene', location: 'Fictional lantern workshop', realityLayer: 'physical', realityEpochId: 'candidate-guardrail-epoch',
    presentMemberIds: ['aster', 'beryl', 'cato'], summary: 'Aster, Beryl, and Cato are in a fictional lantern workshop.', unresolved: [], startedAt: 1, wardrobe: clothes,
});
const room = (clothes: WardrobeState): ChatRoom => ({
    id: 'candidate-guardrail-room', type: 'group', title: 'Fictional guardrail room', description: 'Synthetic calibration only', leadMemberId: 'aster',
    members: [{ id: 'aster', persona: aster, joinedAt: 1, soul: [], memories: [] }, { id: 'beryl', persona: beryl, joinedAt: 1, soul: [], memories: [] }, { id: 'cato', persona: cato, joinedAt: 1, soul: [], memories: [] }],
    scene: scene(clothes), sharedSoul: [], sharedMemories: [], createdAt: 1, updatedAt: 1, lastSummarizedUserMessageCount: 0,
});
const history = (latest: string, prior = 'Aster inspected the lantern on the workbench.') => buildJevRecentHistoryText([
    { role: 'user', content: 'Please inspect the lantern carefully.' }, { role: 'assistant', content: prior }, { role: 'user', content: latest },
], latest);
const singleState = (candidateText: string, clothes: WardrobeState, prior?: string): ReviewState => {
    const latest = 'Please describe the next careful step.';
    return buildReviewState({ mode: 'single', ccMode: false, latestUserText: latest, candidateText, personaKey: 'aster', persona: aster, wardrobe: clothes, recentHistoryText: history(latest, prior) });
};
const envelopeState = (segments: GroupGenerationResult['segments'], clothes: WardrobeState, prior?: string): ReviewState => {
    const currentScene = scene(clothes);
    const result: GroupGenerationResult = { text: segments.map(segment => segment.text).join('\n'), segments, scene: currentScene };
    const latest = 'What should the group do with the lantern?';
    return buildReviewState({ mode: 'group', ccMode: false, latestUserText: latest, candidateText: serializeGroupGenerationForReview(result), personaKey: 'aster', persona: aster, room: room(clothes), wardrobe: clothes, proposedScene: currentScene, recentHistoryText: history(latest, prior) });
};
const directGroupState = (candidateText: string): ReviewState => {
    const clothes = wardrobe({ aster: 'green coat', beryl: 'red scarf', cato: 'brown vest' });
    const latest = 'What should the group do with the lantern?';
    return buildReviewState({ mode: 'group', ccMode: false, latestUserText: latest, candidateText, personaKey: 'aster', persona: aster, room: room(clothes), wardrobe: clothes, proposedScene: scene(clothes), recentHistoryText: history(latest) });
};
const source = (id: string, category: JevCandidateGuardrailCategory, expected: JevSyntheticExpected, guardrailFamily: JevCandidateGuardrailFamily, shapeNotes: string, state: ReviewState, semantics: Record<string, boolean>): JevCandidateGuardrailSource => ({ id, suite: 'candidate-guardrail', category, expected, guardrailFamily, shapeNotes, state, semantics });

const W = (characters: Record<string, string>) => wardrobe(characters);

export const JEV_CANDIDATE_GUARDRAIL_SOURCES: readonly JevCandidateGuardrailSource[] = [
    source('guardrail-wardrobe-conflict-coat', 'wardrobe', 'positive', 'clear-conflict', 'single established coat contradiction', singleState('Aster wears a red coat.', W({ aster: 'green coat' })), { establishedContradiction: true }),
    source('guardrail-wardrobe-conflict-dress', 'wardrobe', 'positive', 'clear-conflict', 'single established dress contradiction', singleState('Aster is wearing a black dress.', W({ aster: 'blue dress' })), { establishedContradiction: true }),
    source('guardrail-wardrobe-conflict-shoes', 'wardrobe', 'positive', 'clear-conflict', 'single established footwear contradiction', singleState('Aster steps forward in silver boots.', W({ aster: 'brown shoes' })), { establishedContradiction: true }),
    source('guardrail-wardrobe-conflict-scarf', 'wardrobe', 'positive', 'clear-conflict', 'single established scarf contradiction', singleState('Aster tightens her yellow scarf.', W({ aster: 'blue scarf' })), { establishedContradiction: true }),
    source('guardrail-wardrobe-wrong-person-single', 'wardrobe', 'positive', 'wrong-person', 'single participant ownership swap', singleState("Aster's coat is red, while Beryl's coat is green.", W({ aster: 'green coat', beryl: 'red coat' })), { establishedContradiction: true, wrongPersonMismatch: true }),
    source('guardrail-wardrobe-wrong-person-group', 'wardrobe', 'positive', 'wrong-person', 'group serialized participant ownership swap', envelopeState([{ type: 'narration', text: "Aster's coat is red, while Beryl's coat is green." }], W({ aster: 'green coat', beryl: 'red coat' })), { establishedContradiction: true, wrongPersonMismatch: true, serializerEnvelope: true }),
    source('guardrail-wardrobe-conflict-group', 'wardrobe', 'positive', 'clear-conflict', 'group serialized member outfit contradiction', envelopeState([{ type: 'narration', text: 'Aster arrives wearing a black jacket.' }], W({ aster: 'green coat', beryl: 'red scarf' })), { establishedContradiction: true, serializerEnvelope: true }),
    source('guardrail-wardrobe-match-exact', 'wardrobe', 'negative', 'exact-match', 'exact established garment', singleState('Aster keeps her green coat buttoned.', W({ aster: 'green coat' })), { establishedMatch: true }),
    source('guardrail-wardrobe-match-paraphrase', 'wardrobe', 'negative', 'exact-match', 'compatible garment paraphrase', singleState('Aster keeps the green outer coat closed.', W({ aster: 'green coat' })), { establishedMatch: true }),
    source('guardrail-wardrobe-match-colour', 'wardrobe', 'negative', 'exact-match', 'correct established colour', singleState('The blue scarf remains around Aster\'s neck.', W({ aster: 'blue scarf' })), { establishedMatch: true }),
    source('guardrail-wardrobe-unestablished-none', 'wardrobe', 'negative', 'unestablished', 'no character wardrobe exists', singleState('Aster wraps a red scarf around her neck.', W({})), { lacksTargetClothingEvidence: true }),
    source('guardrail-wardrobe-unestablished-other', 'wardrobe', 'negative', 'unestablished', 'only another participant wardrobe exists', singleState('Aster wears a charcoal jacket.', W({ beryl: 'red coat' })), { lacksTargetClothingEvidence: true }),
    source('guardrail-wardrobe-unestablished-user-only', 'wardrobe', 'negative', 'unestablished', 'user wardrobe only', singleState('Aster adjusts a silver pin.', W({})), { lacksTargetClothingEvidence: true }),
    source('guardrail-wardrobe-unestablished-group-partial', 'wardrobe', 'negative', 'unestablished', 'group partial wardrobe map', envelopeState([{ type: 'narration', text: 'Aster puts on a wool hat.' }], W({ beryl: 'red scarf' })), { lacksTargetClothingEvidence: true, serializerEnvelope: true }),
    source('guardrail-wardrobe-accessory-pin', 'wardrobe', 'negative', 'additive-accessory', 'new accessory does not replace established coat', singleState('Aster fastens a silver pin to her green coat.', W({ aster: 'green coat' })), { additiveOnly: true }),
    source('guardrail-wardrobe-accessory-gloves', 'wardrobe', 'negative', 'additive-accessory', 'new gloves do not replace established coat', singleState('Aster adjusts her gloves before lifting the lantern.', W({ aster: 'green coat' })), { additiveOnly: true }),
    source('guardrail-wardrobe-accessory-scarf', 'wardrobe', 'negative', 'additive-accessory', 'carried scarf does not replace established coat', singleState('Aster carries a scarf over one arm.', W({ aster: 'green coat' })), { additiveOnly: true }),
    source('guardrail-wardrobe-change-history', 'wardrobe', 'negative', 'clothing-change', 'history establishes legitimate green-to-red change', singleState('Aster wears the red coat she changed into.', W({ aster: 'red coat' }), 'Aster changed from her green coat into a red coat before entering the workshop.'), { explicitPriorChange: true }),
    source('guardrail-wardrobe-change-group', 'wardrobe', 'negative', 'clothing-change', 'group history establishes legitimate dress change', envelopeState([{ type: 'narration', text: 'Aster returns in the black dress she changed into.' }], W({ aster: 'black dress' }), 'Aster changed from her blue dress into a black dress before returning to the workshop.'), { explicitPriorChange: true, serializerEnvelope: true }),
    source('guardrail-wardrobe-ambiguous-coat', 'wardrobe', 'negative', 'ambiguous-reference', 'unestablished coat reference', singleState('Aster folds the coat over a chair.', W({})), { lacksTargetClothingEvidence: true, ambiguousReference: true }),
    source('guardrail-wardrobe-ambiguous-scarf', 'wardrobe', 'negative', 'ambiguous-reference', 'unestablished scarf reference', singleState('Aster looks for her scarf.', W({ aster: 'green coat' })), { lacksTargetClothingEvidence: true, ambiguousReference: true }),
    source('guardrail-wardrobe-group-match', 'wardrobe', 'negative', 'exact-match', 'group serialized compatible member outfit', envelopeState([{ type: 'narration', text: 'Aster straightens her green coat.' }], W({ aster: 'green coat', beryl: 'red scarf' })), { establishedMatch: true, serializerEnvelope: true }),

    source('guardrail-group-unlabelled-i', 'group_narration', 'positive', 'unlabelled-first-person', 'group direct unlabelled first person', directGroupState('I walk toward the door with the lantern.'), { unlabelledFirstPerson: true }),
    source('guardrail-group-unlabelled-we', 'group_narration', 'positive', 'unlabelled-first-person', 'group direct unlabelled collective first person', directGroupState('We move closer to the workbench.'), { unlabelledFirstPerson: true }),
    source('guardrail-group-unlabelled-glance', 'group_narration', 'positive', 'unlabelled-first-person', 'group direct unlabelled first person with participant', directGroupState('I glance at Beryl and lift the lantern.'), { unlabelledFirstPerson: true }),
    source('guardrail-group-mixed-dialogue-narration', 'group_narration', 'positive', 'mixed', 'labelled dialogue plus unlabelled narration', directGroupState('Aster: "I will check the lantern."\nI walk toward the window.'), { unlabelledFirstPerson: true, labelledFirstPerson: true }),
    source('guardrail-group-envelope-positive-one', 'group_narration', 'positive', 'serializer-envelope-positive', 'serializer envelope with unlabelled narration', envelopeState([{ type: 'narration', text: 'I carry the lantern toward the door.' }], W({ aster: 'green coat' })), { unlabelledFirstPerson: true, serializerEnvelope: true }),
    source('guardrail-group-envelope-positive-two', 'group_narration', 'positive', 'serializer-envelope-positive', 'serializer envelope with mixed prose', envelopeState([{ type: 'dialogue', speakerId: 'aster', speakerName: 'Aster Vale', text: 'I will inspect the latch.' }, { type: 'narration', text: 'We move closer to the window.' }], W({ aster: 'green coat' })), { unlabelledFirstPerson: true, labelledFirstPerson: true, serializerEnvelope: true }),
    source('guardrail-group-envelope-positive-three', 'group_narration', 'positive', 'serializer-envelope-positive', 'serializer envelope with unlabelled participant narration', envelopeState([{ type: 'narration', text: 'I glance at Beryl before opening the case.' }], W({ aster: 'green coat' })), { unlabelledFirstPerson: true, serializerEnvelope: true }),
    source('guardrail-group-labelled-colon', 'group_narration', 'negative', 'labelled-dialogue', 'colon-labelled character dialogue', directGroupState('Aster: "I will inspect the lantern."\nBeryl: "I agree."'), { labelledFirstPerson: true }),
    source('guardrail-group-labelled-bracket', 'group_narration', 'negative', 'labelled-action', 'bracket-labelled action dialogue', directGroupState('[Aster] "I inspect the lantern."'), { labelledFirstPerson: true }),
    source('guardrail-group-labelled-name-action', 'group_narration', 'negative', 'labelled-action', 'full-name labelled action', directGroupState('Aster Vale: I inspect the lantern.'), { labelledFirstPerson: true }),
    source('guardrail-group-third-person', 'group_narration', 'negative', 'third-person', 'ordinary third-person group narration', directGroupState('Aster checks the lantern while Beryl watches.'), { noUnlabelledFirstPerson: true }),
    source('guardrail-group-third-person-multi', 'group_narration', 'negative', 'third-person', 'ordinary multi-character third-person narration', directGroupState('Aster lifts the lantern and Cato closes the case.'), { noUnlabelledFirstPerson: true }),
    source('guardrail-group-quoted-first-person', 'group_narration', 'negative', 'quoted-first-person', 'attributed quoted first person', directGroupState('Aster reads the note aloud: "I left the key upstairs."'), { labelledFirstPerson: true }),
    source('guardrail-group-envelope-negative-one', 'group_narration', 'negative', 'serializer-envelope-negative', 'serializer envelope with third-person narration', envelopeState([{ type: 'narration', text: 'Aster steadies the lantern on the workbench.' }], W({ aster: 'green coat' })), { noUnlabelledFirstPerson: true, serializerEnvelope: true }),
    source('guardrail-group-envelope-negative-two', 'group_narration', 'negative', 'serializer-envelope-negative', 'serializer envelope with labelled dialogue', envelopeState([{ type: 'dialogue', speakerId: 'aster', speakerName: 'Aster Vale', text: 'I will inspect the lantern.' }, { type: 'dialogue', speakerId: 'beryl', speakerName: 'Beryl Quill', text: 'I agree.' }], W({ aster: 'green coat' })), { labelledFirstPerson: true, serializerEnvelope: true }),
    source('guardrail-group-envelope-negative-three', 'group_narration', 'negative', 'serializer-envelope-negative', 'serializer envelope with third-person plus dialogue', envelopeState([{ type: 'narration', text: 'Cato checks the latch while Aster waits.' }, { type: 'dialogue', speakerId: 'beryl', speakerName: 'Beryl Quill', text: 'I can hold the case.' }], W({ aster: 'green coat' })), { labelledFirstPerson: true, noUnlabelledFirstPerson: true, serializerEnvelope: true }),
    source('guardrail-group-envelope-negative-four', 'group_narration', 'negative', 'serializer-envelope-negative', 'serializer envelope with attributed quote', envelopeState([{ type: 'narration', text: 'Aster reads the note saying, "I left the key upstairs."' }], W({ aster: 'green coat' })), { labelledFirstPerson: true, serializerEnvelope: true }),
    source('guardrail-group-labelled-dash', 'group_narration', 'negative', 'labelled-dialogue', 'dash-labelled dialogue', directGroupState('Aster — "I will carry the lantern."'), { labelledFirstPerson: true }),
];

export const JEV_CANDIDATE_GUARDRAIL_SENTINELS = {
    wardrobeStrongestPositive: 'guardrail-wardrobe-conflict-coat',
    wardrobeRepresentativeUnestablishedNegative: 'guardrail-wardrobe-unestablished-none',
    groupRepresentativeUnlabelledPositive: 'guardrail-group-envelope-positive-one',
    groupRepresentativeEnvelopeNegative: 'guardrail-group-envelope-negative-two',
} as const;
