import { JEV_QUESTIONS } from '../../api/_openrouter-decisions.js';
import type { StrictReviewIssueCode } from '../../strictReview.js';
import { JEV_EXPERIMENTAL_QUESTIONS_V4 } from './jevExperimentalQuestions.js';

export const JEV_QUESTION_KEY_BY_CATEGORY: Record<StrictReviewIssueCode, keyof typeof JEV_QUESTIONS> = {
    request_mismatch: 'request_mismatch',
    identity: 'identity_conflict',
    speaker_ownership: 'speaker_ownership_violation',
    continuity: 'continuity_violation',
    reality_layer: 'reality_layer_violation',
    wardrobe: 'wardrobe_conflict',
    state: 'state_conflict',
    replayed_beat: 'replayed_beat',
    persona_voice: 'persona_voice_violation',
    third_party_speech: 'third_party_speech_violation',
    user_agency: 'user_agency_violation',
    incomplete_ending: 'incomplete_ending',
    group_narration: 'group_narration_violation',
    other: 'other_defect',
};

/** Returns a fresh calibration-only set with exactly one frozen V4 proposition. */
export const buildSingleQuestionExperimentalSet = (category: StrictReviewIssueCode) => {
    const replacementKey = JEV_QUESTION_KEY_BY_CATEGORY[category];
    return Object.fromEntries(Object.entries(JEV_QUESTIONS).map(([key, question]) => [
        key,
        key === replacementKey ? JEV_EXPERIMENTAL_QUESTIONS_V4[key as keyof typeof JEV_EXPERIMENTAL_QUESTIONS_V4] : question,
    ]));
};
