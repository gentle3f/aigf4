import type { GroupGenerationResult } from '../../groupChat.js';
import type { ReviewState } from '../../engine/contracts.js';
import { serializeGroupGenerationForReview } from '../../engine/review/groupCandidateSerialization.js';
import { buildJevRecentHistoryText, buildReviewState } from '../../engine/review/reviewState.js';
import type { Persona, WardrobeState } from '../../managers.js';
import type { ChatRoom, RoomSceneState } from '../../roomManager.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import type { JevSyntheticExpected } from './jevSyntheticCalibration.js';

export interface JevGroupGateBroadCase {
    id: string;
    suite: 'group-gate-broad-v1';
    sourceCategory: StrictReviewIssueCode;
    expected: JevSyntheticExpected;
    pairId: string;
    description: string;
    state: ReviewState;
}

const wardrobe: WardrobeState = {
    user: 'charcoal jumper',
    characters: { aster: 'green coat', beryl: 'blue scarf', cato: 'brown vest' },
};

const aster: Persona = {
    name: 'Aster Vale',
    emoji: 'A',
    gender: 'female',
    description: 'A careful cartographer who notices practical details.',
    prompt: 'Speak in measured formal English. Never use slang. Keep the scene grounded.',
    greeting: '',
    avatarPrompt: '',
    avatarUrl: null,
};
const beryl: Persona = {
    name: 'Beryl Quill',
    emoji: 'B',
    gender: 'female',
    description: 'A lively singer who notices other people first.',
    prompt: 'Use warm direct dialogue. Do not narrate as another participant.',
    greeting: '',
    avatarPrompt: '',
    avatarUrl: null,
};
const cato: Persona = {
    name: 'Cato Fern',
    emoji: 'C',
    gender: 'male',
    description: 'A reserved stagehand who tracks props and exits.',
    prompt: 'Speak sparingly and describe only facts he can observe.',
    greeting: '',
    avatarPrompt: '',
    avatarUrl: null,
};

const scene: RoomSceneState = {
    id: 'group-gate-broad-scene',
    location: 'Lantern workshop',
    realityLayer: 'physical',
    realityEpochId: 'group-gate-broad-physical',
    presentMemberIds: ['aster', 'beryl', 'cato'],
    summary: 'Aster, Beryl, Cato, and the user are physically together in the Lantern workshop. The north window is closed. The repaired blue lantern rests on the workbench.',
    unresolved: ['The group has not decided when to leave.'],
    startedAt: 1,
    wardrobe,
};

const room: ChatRoom = {
    id: 'group-gate-broad-room',
    type: 'group',
    title: 'Lantern workshop',
    description: 'Fictional Group gate calibration room',
    leadMemberId: 'aster',
    members: [
        { id: 'aster', persona: aster, joinedAt: 1, soul: [], memories: [] },
        { id: 'beryl', persona: beryl, joinedAt: 1, soul: [], memories: [] },
        { id: 'cato', persona: cato, joinedAt: 1, soul: [], memories: [] },
    ],
    scene,
    sharedSoul: [],
    sharedMemories: [],
    createdAt: 1,
    updatedAt: 1,
    lastSummarizedUserMessageCount: 0,
};

const history = (latestUserText: string) => buildJevRecentHistoryText([
    { role: 'user', content: 'Please check the room before we decide what to do next.' },
    { role: 'assistant', content: 'Aster confirms the repaired blue lantern is on the workbench and the north window is closed.' },
    { role: 'user', content: 'Everyone should remain together in the workshop for now.' },
    { role: 'assistant', content: 'Beryl and Cato remain beside Aster in the workshop.' },
    { role: 'user', content: latestUserText },
], latestUserText);

const groupResult = (segments: GroupGenerationResult['segments']): GroupGenerationResult => ({
    text: segments.map(segment => segment.text).join('\n'),
    segments,
    scene,
});

const state = (
    latestUserText: string,
    segments: GroupGenerationResult['segments'],
): ReviewState => buildReviewState({
    mode: 'group',
    ccMode: false,
    latestUserText,
    candidateText: serializeGroupGenerationForReview(groupResult(segments)),
    personaKey: 'aster',
    persona: aster,
    room,
    wardrobe,
    proposedScene: scene,
    recentHistoryText: history(latestUserText),
});

const narration = (text: string): GroupGenerationResult['segments'][number] => ({ type: 'narration', text });
const dialogue = (
    speakerId: string,
    speakerName: string,
    text: string,
): GroupGenerationResult['segments'][number] => ({ type: 'dialogue', speakerId, speakerName, text });

const pair = (
    category: StrictReviewIssueCode,
    id: string,
    latestUserText: string,
    positive: GroupGenerationResult['segments'],
    negative: GroupGenerationResult['segments'],
    positiveDescription: string,
    negativeDescription: string,
): JevGroupGateBroadCase[] => [
    {
        id: `group-gate-broad-${id}-positive`,
        suite: 'group-gate-broad-v1',
        sourceCategory: category,
        expected: 'positive',
        pairId: id,
        description: positiveDescription,
        state: state(latestUserText, positive),
    },
    {
        id: `group-gate-broad-${id}-negative`,
        suite: 'group-gate-broad-v1',
        sourceCategory: category,
        expected: 'negative',
        pairId: id,
        description: negativeDescription,
        state: state(latestUserText, negative),
    },
];

export const JEV_GROUP_GATE_BROAD_CASES: readonly JevGroupGateBroadCase[] = [
    ...pair(
        'request_mismatch',
        'request-mismatch',
        'Please ask Beryl to tell me whether the north window should stay closed. Do not move the lantern.',
        [
            narration('Aster carries the repaired blue lantern away from the workbench toward the door.'),
            dialogue('cato', 'Cato Fern', 'I will inspect the hinges instead.'),
        ],
        [
            dialogue('beryl', 'Beryl Quill', 'Yes. Keep the north window closed, and leave the repaired lantern on the workbench.'),
        ],
        'The candidate ignores the requested Beryl answer and directly violates the do-not-move instruction.',
        'The candidate directly follows both parts of the latest request.',
    ),
    ...pair(
        'identity',
        'identity',
        'Remind me who Beryl Quill is in this group.',
        [
            dialogue('aster', 'Aster Vale', 'Beryl Quill is Cato Fern, our reserved stagehand who tracks the props.'),
        ],
        [
            dialogue('aster', 'Aster Vale', 'Beryl Quill is our lively singer, and Cato Fern is the reserved stagehand.'),
        ],
        'The candidate merges Beryl with the separately supplied Cato identity.',
        'The candidate keeps Beryl and Cato as separate supplied identities.',
    ),
    ...pair(
        'speaker_ownership',
        'speaker-ownership',
        'Beryl, tell me what you personally noticed at the north window.',
        [
            dialogue('beryl', 'Beryl Quill', 'I am Aster Vale, and I personally inspected the latch at the north window.'),
        ],
        [
            dialogue('beryl', 'Beryl Quill', 'I personally noticed that the latch at the north window is stiff.'),
        ],
        'A Beryl-labelled first-person line explicitly claims Aster identity and ownership.',
        'Beryl owns the first-person observation in her own labelled line.',
    ),
    ...pair(
        'reality_layer',
        'reality-layer',
        'Since we are all physically together in the workshop, what does Aster do next?',
        [
            narration('Aster is in another city and sends the others a remote text message; nobody is physically together in the workshop.'),
        ],
        [
            narration('Aster remains beside Beryl and Cato in the workshop and checks the lantern on the workbench.'),
        ],
        'The candidate explicitly replaces the supplied physical co-presence with remote separation.',
        'The candidate remains in the supplied physical reality layer.',
    ),
    ...pair(
        'state',
        'state',
        'Without changing anything yet, describe the current room state.',
        [
            narration('The north window is already open, and the repaired blue lantern is already lying on the floor.'),
        ],
        [
            narration('The north window remains closed, and the repaired blue lantern still rests on the workbench.'),
        ],
        'The candidate contradicts two explicit current-state facts without performing a change.',
        'The candidate restates the supplied current-state facts.',
    ),
    ...pair(
        'third_party_speech',
        'third-party',
        'Beryl, please answer me directly: should the north window stay closed? I only want Beryl\'s answer.',
        [
            dialogue('aster', 'Aster Vale', 'Beryl would say yes, so keep the window closed.'),
        ],
        [
            dialogue('beryl', 'Beryl Quill', 'Yes. I think the north window should stay closed.'),
        ],
        'The explicitly required third party is omitted and another participant answers for her.',
        'The explicitly required third party answers directly.',
    ),
    ...pair(
        'user_agency',
        'user-agency',
        'I am still deciding. Do not decide or act for me. What do they do while they wait?',
        [
            narration('The user says, “Open it now,” picks up the repaired lantern, and walks out of the workshop.'),
            narration('Aster and Beryl follow the user toward the door.'),
        ],
        [
            narration('Aster leaves the repaired lantern on the workbench while Beryl and Cato wait for the user to decide.'),
        ],
        'The candidate invents consequential user speech, action, and a decision the user explicitly withheld.',
        'The participants wait without inventing user agency.',
    ),
    ...pair(
        'incomplete_ending',
        'incomplete-ending',
        'Beryl, give me one complete sentence about what we should do next.',
        [
            dialogue('beryl', 'Beryl Quill', 'We should keep the north window closed because'),
        ],
        [
            dialogue('beryl', 'Beryl Quill', 'We should keep the north window closed because the repaired lantern still needs to cool.'),
        ],
        'The requested sentence is materially cut off after a causal connector.',
        'The requested sentence is complete.',
    ),
    ...pair(
        'other',
        'other',
        'Give me the group\'s next complete reply.',
        [
            dialogue('aster', 'Aster Vale', '[INSERT FINAL GROUP RESPONSE HERE]'),
        ],
        [
            dialogue('aster', 'Aster Vale', 'The lantern is repaired, so we can leave it on the workbench while we decide when to go.'),
        ],
        'A visible unreplaced template placeholder is a concrete defect outside the named categories.',
        'The candidate contains a complete ordinary reply without template residue.',
    ),
];

export const JEV_GROUP_GATE_BROAD_CATEGORIES = [
    'request_mismatch',
    'identity',
    'speaker_ownership',
    'reality_layer',
    'state',
    'third_party_speech',
    'user_agency',
    'incomplete_ending',
    'other',
] as const satisfies readonly StrictReviewIssueCode[];
