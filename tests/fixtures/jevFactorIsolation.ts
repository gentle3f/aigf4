import type { Persona, WardrobeState } from '../../managers.js';
import type { ChatRoom, RoomSceneState } from '../../roomManager.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import type { ReviewState } from '../../engine/contracts.js';
import { serializeGroupGenerationForReview } from '../../engine/review/groupCandidateSerialization.js';
import { buildJevPersonaEvidence, buildJevRecentHistoryText, buildReviewState } from '../../engine/review/reviewState.js';
import type { JevSyntheticCalibrationCase, JevSyntheticExpected } from './jevSyntheticCalibration.js';

export type JevFactorFamily = 'group_narration' | 'persona_voice' | 'replayed_beat' | 'continuity' | 'wardrobe';

export interface JevFactorIsolationCase extends JevSyntheticCalibrationCase {
    suite: 'factor-isolation';
    factorFamily: JevFactorFamily;
    factor: string;
    variant: 'baseline' | 'variant' | 'positive-control' | 'anchor';
    baselineId?: string;
    mode: 'single' | 'group';
    ccMode: boolean;
    shapeNotes: string;
    // This is a safe, fixture-only semantic marker used to protect comparisons.
    semanticCandidate: string;
}

const wardrobe: WardrobeState = { user: 'grey sweater', characters: { aster: 'green coat', beryl: 'blue scarf', cato: 'brown vest' } };
const aster: Persona = { name: 'Aster Vale', emoji: 'A', gender: 'female', description: 'A careful cartographer who notices practical details.', prompt: 'Speak in measured formal English. Never use slang. Keep the scene grounded.', greeting: '', avatarPrompt: '', avatarUrl: null };
const beryl: Persona = { name: 'Beryl Quill', emoji: 'B', gender: 'female', description: 'A warm singer who notices people before objects.', prompt: 'Use warm direct dialogue. Do not narrate as another participant.', greeting: '', avatarPrompt: '', avatarUrl: null };
const cato: Persona = { name: 'Cato Fern', emoji: 'C', gender: 'male', description: 'A reserved stagehand who tracks props and exits.', prompt: 'Speak sparingly and describe only observed facts.', greeting: '', avatarPrompt: '', avatarUrl: null };
const ccAster: Persona = { ...aster, name: 'Celia North', description: 'A bilingual editor who weighs words before answering.', prompt: 'Use concise Traditional Chinese with occasional natural Cantonese phrasing. Keep a calm, observant voice. Do not use English slang.' };

const scene = (summary = 'Aster, Beryl, and Cato remain in the Lantern workshop beside a blue lantern.'): RoomSceneState => ({
    id: 'isolation-scene', location: 'Lantern workshop', realityLayer: 'physical', realityEpochId: 'isolation-physical',
    presentMemberIds: ['aster', 'beryl', 'cato'], summary, unresolved: ['The north window remains closed.'], startedAt: 1, wardrobe,
});
const room = (members = [aster, beryl, cato], currentScene = scene()): ChatRoom => ({
    id: 'fictional-isolation-room', type: 'group', title: 'Lantern workshop', description: 'Fictional calibration room', leadMemberId: 'aster',
    members: members.map((persona, index) => ({ id: ['aster', 'beryl', 'cato'][index] || `member-${index}`, persona, joinedAt: 1, soul: [], memories: [] })),
    scene: currentScene, sharedSoul: [], sharedMemories: [], createdAt: 1, updatedAt: 1, lastSummarizedUserMessageCount: 0,
});
const latest = 'Please describe the next careful step.';
const history = (messages: readonly string[]) => buildJevRecentHistoryText([
    ...messages.map((content, index) => ({ role: index % 2 ? 'assistant' : 'user', content })),
    { role: 'user', content: latest },
], latest);
const normalState = (candidateText: string, options: Partial<{ persona: Persona; ccMode: boolean; room: ChatRoom; recentHistoryText: string; proposedScene: RoomSceneState; wardrobe: WardrobeState }> = {}): ReviewState => buildReviewState({
    mode: options.room ? 'group' : 'single', ccMode: options.ccMode ?? false, latestUserText: latest, candidateText,
    personaKey: 'aster', persona: options.persona ?? aster, room: options.room, wardrobe: options.wardrobe ?? wardrobe,
    recentHistoryText: options.recentHistoryText ?? history(['Please inspect the lantern.', 'Aster examines the blue lantern.']), proposedScene: options.proposedScene,
});
const groupCandidate = (chat: string, currentScene = scene()) => serializeGroupGenerationForReview({
    text: chat, segments: [{ type: 'narration', text: chat }], scene: currentScene,
});
const withCandidate = (state: ReviewState, candidateText: string): ReviewState => ({ ...state, candidateText });

const cases: JevFactorIsolationCase[] = [];
const add = (id: string, factorFamily: JevFactorFamily, factor: string, variant: JevFactorIsolationCase['variant'], category: StrictReviewIssueCode, expected: JevSyntheticExpected, state: ReviewState, semanticCandidate: string, shapeNotes: string, baselineId?: string) => {
    cases.push({ id, suite: 'factor-isolation', factorFamily, factor, variant, baselineId, mode: state.mode, ccMode: state.ccMode, category, expected, description: `Fictional ${factorFamily} ${factor} ${variant}.`, state, semanticCandidate, shapeNotes });
};

// A. Group narration: all negatives retain the same third-person action.
const groupSemantic = 'Aster checks the blue lantern while Beryl watches.';
const soloGroupScene = scene('Aster remains in the Lantern workshop beside the blue lantern.');
soloGroupScene.presentMemberIds = ['aster'];
const soloGroupRoom = room([aster], soloGroupScene);
const groupBase = normalState(groupSemantic, { room: soloGroupRoom, proposedScene: soloGroupScene });
add('isolation-group-baseline', 'group_narration', 'plain-group-prose', 'baseline', 'group_narration', 'negative', groupBase, groupSemantic, 'plain prose candidate in group mode');
add('isolation-group-chat-wrapper', 'group_narration', 'chat-wrapper', 'variant', 'group_narration', 'negative', withCandidate(groupBase, `<chat>${groupSemantic}</chat>`), groupSemantic, 'only the chat wrapper changes', 'isolation-group-baseline');
add('isolation-group-labelled-dialogue', 'group_narration', 'labelled-multi-speaker-dialogue', 'variant', 'group_narration', 'negative', withCandidate(groupBase, 'Aster Vale: "I will check the blue lantern."\nBeryl Quill: "I will watch."'), groupSemantic, 'first person appears only inside labelled dialogue', 'isolation-group-baseline');
add('isolation-group-first-person-labelled', 'group_narration', 'first-person-labelled-dialogue', 'variant', 'group_narration', 'negative', withCandidate(groupBase, 'Aster Vale: "I check the blue lantern."\nBeryl Quill watches.'), groupSemantic, 'first person occurs only inside the Aster label', 'isolation-group-baseline');
add('isolation-group-scene-json', 'group_narration', 'scene-json', 'variant', 'group_narration', 'negative', withCandidate(groupBase, `${groupSemantic}<scene>{"location":"Lantern workshop"}</scene>`), groupSemantic, 'only a scene JSON tag is appended', 'isolation-group-baseline');
add('isolation-group-npc-tag', 'group_narration', 'npc-candidate-tag', 'variant', 'group_narration', 'negative', withCandidate(groupBase, `${groupSemantic}<npc_candidate>null</npc_candidate>`), groupSemantic, 'only npc candidate tag is appended', 'isolation-group-baseline');
add('isolation-group-full-envelope', 'group_narration', 'full-production-envelope', 'variant', 'group_narration', 'negative', withCandidate(groupBase, groupCandidate(groupSemantic)), groupSemantic, 'exact production serializer envelope', 'isolation-group-baseline');
add('isolation-group-multi-persona', 'group_narration', 'multi-persona-evidence', 'variant', 'group_narration', 'negative', normalState(groupSemantic, { room: room([aster, beryl, cato]), proposedScene: scene() }), groupSemantic, 'group persona evidence is present', 'isolation-group-baseline');
add('isolation-group-scene-duplication', 'group_narration', 'scene-duplication', 'variant', 'group_narration', 'negative', normalState(`${groupSemantic} The Lantern workshop remains quiet.`, { room: soloGroupRoom, proposedScene: scene('The Lantern workshop remains quiet while Aster checks the blue lantern.') }), groupSemantic, 'candidate and proposed scene repeat the same location', 'isolation-group-baseline');
add('isolation-group-role-history', 'group_narration', 'role-labelled-complex-history', 'variant', 'group_narration', 'negative', normalState(groupSemantic, { room: soloGroupRoom, proposedScene: soloGroupScene, recentHistoryText: history(['Aster checks the lamp casing.', 'Beryl watches the north window.', 'Cato counts the tools.', 'No one leaves the Lantern workshop.']) }), groupSemantic, 'four role-labelled messages', 'isolation-group-baseline');
add('isolation-group-positive', 'group_narration', 'unlabelled-first-person', 'positive-control', 'group_narration', 'positive', normalState('I check the blue lantern while Beryl watches.', { room: room(), proposedScene: scene() }), 'I check the blue lantern while Beryl watches.', 'clear unlabelled first person in group narration');

// B. Persona voice: variants are deliberately compatible with the stated rules.
const voiceSemantic = 'Aster says, "The blue lantern is ready for inspection."';
const voiceBase = normalState(voiceSemantic);
add('isolation-persona-baseline', 'persona_voice', 'short-explicit-rule', 'baseline', 'persona_voice', 'negative', voiceBase, voiceSemantic, 'short measured-English rule; candidate follows it');
const personaVariants: readonly [string, Persona, string, boolean, ChatRoom?][] = [
    ['long-description', { ...aster, description: 'A careful cartographer who records measurements, checks lantern glass, remembers names, and prefers evidence before conclusions.' }, 'long description; candidate remains formal', false],
    ['long-prompt', { ...aster, prompt: `${aster.prompt} Use complete sentences. Address evidence before conclusions. Maintain a quiet professional cadence.` }, 'long prompt; candidate remains formal', false],
    ['multiple-style-rules', { ...aster, prompt: 'Speak in measured formal English. Never use slang. Use complete sentences. Avoid exclamation marks. Refer to objects precisely.' }, 'multiple explicit rules; candidate follows all', false],
    ['bilingual-evidence', { ...aster, description: 'A careful cartographer. 她做事細心。', prompt: 'Speak in measured formal English. Never use slang. 語氣冷靜。' }, 'bilingual evidence; English candidate remains formal', false],
    ['cantonese-rule', { ...ccAster }, 'Traditional Chinese/Cantonese rule; candidate is calm', true],
    ['traditional-chinese-candidate', { ...ccAster }, 'Traditional Chinese candidate obeys calm concise rule', true],
    ['code-switch-candidate', { ...ccAster }, 'natural code-switch remains calm and not slang', true],
    ['mixed-language-evidence', { ...ccAster, description: 'A bilingual editor. 她說話前會先衡量用字。', prompt: 'Use concise Traditional Chinese. Keep a calm, observant voice. Do not use English slang.' }, 'description and rule use different languages', true],
    ['group-multi-persona', aster, 'multi-persona evidence; Aster keeps own formal rule', false, room()],
    ['group-distinct-rules', aster, 'three distinct member rules; Aster remains formal', false, room([aster, beryl, cato])],
];
personaVariants.forEach(([factor, persona, notes, ccMode, currentRoom], index) => {
    const candidate = factor === 'traditional-chinese-candidate' ? 'Celia 說：「藍色提燈已準備好檢查。」'
        : factor === 'code-switch-candidate' ? 'Celia 說：「藍色提燈已準備好，we can inspect it now。」' : voiceSemantic;
    add(`isolation-persona-${factor}`, 'persona_voice', factor, 'variant', 'persona_voice', 'negative', normalState(candidate, { persona, ccMode, room: currentRoom, proposedScene: currentRoom ? scene() : undefined }), voiceSemantic, notes, 'isolation-persona-baseline');
});
add('isolation-persona-positive-normal', 'persona_voice', 'normal-slang-violation', 'positive-control', 'persona_voice', 'positive', normalState('Aster says, "Yo, this lantern is awesome."'), 'Aster says, "Yo, this lantern is awesome."', 'normal single clear slang violation');
add('isolation-persona-positive-cc', 'persona_voice', 'cc-slang-violation', 'positive-control', 'persona_voice', 'positive', normalState('Celia says, "Yo, 呢盞燈超 wild。"', { persona: ccAster, ccMode: true }), 'Celia says, "Yo, 呢盞燈超 wild。"', 'Cc clear English slang violation');
add('isolation-persona-positive-group', 'persona_voice', 'group-slang-violation', 'positive-control', 'persona_voice', 'positive', normalState('Aster says, "Yo, this lantern is awesome."', { room: room(), proposedScene: scene() }), 'Aster says, "Yo, this lantern is awesome."', 'group multi-persona clear Aster violation');

// C. Replayed beat: every negative keeps repair uncompleted in history.
const replaySemantic = 'Aster repairs the blue lantern.';
const replayHistory = (entries: readonly string[]) => history(entries);
const replayBase = normalState(replaySemantic, { recentHistoryText: replayHistory(['Aster examines the damaged blue lantern but does not repair it.']) });
add('isolation-replay-baseline', 'replayed_beat', 'minimal-uncompleted-history', 'baseline', 'replayed_beat', 'negative', replayBase, replaySemantic, 'one message explicitly says repair was not completed');
const replayVariants: readonly [string, string[], Partial<{ room: ChatRoom; proposedScene: RoomSceneState; candidate: string }>][] = [
    ['role-labelled-history', ['Please inspect the lantern.', 'Aster examines the damaged blue lantern but does not repair it.'], []],
    ['four-message-history', ['Please inspect the lantern.', 'Aster examines it but does not repair it.', 'Beryl checks the window.', 'Cato counts the tools.'], []],
    ['repeated-object-nouns', ['The blue lantern is on the bench.', 'Aster measures the blue lantern but does not repair the blue lantern.'], []],
    ['repeated-action-verb', ['Aster plans to repair the blue lantern later.', 'Aster does not repair the blue lantern yet.'], []],
    ['explicit-not-completed', ['Aster did not complete the repair of the blue lantern.'], []],
    ['different-object', ['Aster repairs a brass lantern but does not repair the blue lantern.'], []],
    ['different-participant', ['Beryl repairs a paper lantern; Aster does not repair the blue lantern.'], []],
    ['scene-summary-object', ['Aster examines the blue lantern but does not repair it.'], [{ proposedScene: scene('The blue lantern remains damaged in the Lantern workshop.') }]],
    ['candidate-scene-duplication', ['Aster examines the blue lantern but does not repair it.'], [{ proposedScene: scene('The blue lantern remains damaged in the Lantern workshop.'), candidate: `${replaySemantic} The blue lantern is in the Lantern workshop.` }]],
    ['full-group-envelope', ['Aster examines the blue lantern but does not repair it.'], [{ room: room(), proposedScene: scene(), candidate: groupCandidate(replaySemantic) }]],
];
replayVariants.forEach(([factor, entries, [options = {}]], index) => add(`isolation-replay-${factor}`, 'replayed_beat', factor, 'variant', 'replayed_beat', 'negative', normalState(options.candidate ?? replaySemantic, { room: options.room, proposedScene: options.proposedScene, recentHistoryText: replayHistory(entries) }), replaySemantic, 'target repair is explicitly uncompleted in history', 'isolation-replay-baseline'));
add('isolation-replay-positive', 'replayed_beat', 'completed-beat', 'positive-control', 'replayed_beat', 'positive', normalState('Aster repairs the blue lantern again from the beginning.', { recentHistoryText: replayHistory(['Aster repaired the blue lantern completely and placed it on the workbench.']) }), 'Aster repairs the blue lantern again from the beginning.', 'completed repair is explicitly established');

// D. Continuity: all negative variants remain at the Lantern workshop.
const continuitySemantic = 'Aster remains in the Lantern workshop and checks the blue lantern.';
const continuityBase = normalState(continuitySemantic, { recentHistoryText: history(['Aster is in the Lantern workshop.']) });
add('isolation-continuity-baseline', 'continuity', 'minimal-history', 'baseline', 'continuity', 'negative', continuityBase, continuitySemantic, 'candidate and history agree on the Lantern workshop');
const continuityVariants: readonly [string, Partial<{ room: ChatRoom; proposedScene: RoomSceneState; recentHistoryText: string; candidate: string }>][] = [
    ['four-role-history', { recentHistoryText: history(['Aster is in the Lantern workshop.', 'Beryl watches the north window.', 'Cato counts the tools.', 'Everyone remains in the Lantern workshop.']) }],
    ['several-participants', { room: room(), proposedScene: scene() }],
    ['repeated-location', { recentHistoryText: history(['The Lantern workshop is quiet.', 'Aster remains in the Lantern workshop near the blue lantern.']) }],
    ['scene-summary', { room: room(), proposedScene: undefined }],
    ['unresolved-items', { room: room(), proposedScene: scene() }],
    ['proposed-scene', { room: room(), proposedScene: scene('Aster remains in the Lantern workshop beside the blue lantern.') }],
    ['embedded-scene', { candidate: `${continuitySemantic}<scene>{"location":"Lantern workshop"}</scene>` }],
    ['scene-duplication', { room: room(), proposedScene: scene('The Lantern workshop remains quiet while Aster checks the blue lantern.'), candidate: `${continuitySemantic} The Lantern workshop remains quiet.` }],
    ['full-group-envelope', { room: room(), proposedScene: scene(), candidate: groupCandidate(continuitySemantic) }],
];
continuityVariants.forEach(([factor, options]) => add(`isolation-continuity-${factor}`, 'continuity', factor, 'variant', 'continuity', 'negative', normalState(options.candidate ?? continuitySemantic, options), continuitySemantic, 'all supplied location evidence remains Lantern workshop', 'isolation-continuity-baseline'));
add('isolation-continuity-positive', 'continuity', 'obvious-location-contradiction', 'positive-control', 'continuity', 'positive', normalState('Without leaving, Aster is suddenly at a mountain summit.', { recentHistoryText: history(['Aster remains in the Lantern workshop.']) }), 'Without leaving, Aster is suddenly at a mountain summit.', 'candidate contradicts established location');

// E. Small wardrobe anchors; negative cases deliberately supply no contradiction.
add('isolation-wardrobe-conflict', 'wardrobe', 'established-outfit-conflict', 'anchor', 'wardrobe', 'positive', normalState('Aster smooths the red coat she is wearing.'), 'Aster smooths the red coat she is wearing.', 'green coat is established');
add('isolation-wardrobe-unspecified', 'wardrobe', 'unestablished-outfit', 'anchor', 'wardrobe', 'negative', normalState('Aster adjusts a red scarf.', { wardrobe: { user: 'grey sweater', characters: {} } }), 'Aster adjusts a red scarf.', 'no Aster outfit is supplied');

export const JEV_FACTOR_ISOLATION_CASES: readonly JevFactorIsolationCase[] = cases;

// Exported only for deterministic fixture assertions; no runtime or production use.
export const FACTOR_ISOLATION_HELPERS = ['buildReviewState', 'buildJevPersonaEvidence', 'buildJevRecentHistoryText', 'serializeGroupGenerationForReview'] as const;
export const factorIsolationPersonaEvidence = (fixture: JevFactorIsolationCase) => fixture.state.personaEvidence || '';
