import { JEV_GROUP_GATE_SHADOW_QUESTIONS, JEV_QUESTIONS } from '../../api/_openrouter-decisions.js';

/**
 * Calibration-only Group routing proposition.
 * Production JEV_QUESTIONS remain unchanged.
 *
 * The group_narration_violation answer slot is intentionally reused only inside
 * this offline/live calibration so the existing response normalizer can remain
 * identical to production. Group first-person narration is checked separately
 * by the deterministic parsed-segment rule.
 */
export const JEV_GROUP_GATE_QUESTIONS_V1 = {
    ...JEV_QUESTIONS,
    group_narration_violation: {
        type: 'noul',
        instructions: 'Excluding the separately checked first-person Group narration rule, does candidateText have at least one concrete material defect supported by the supplied state that requires revision rather than KEEP—such as request mismatch, identity or speaker ownership error, continuity/reality/wardrobe/state contradiction, replay of a completed beat, persona-voice violation, third-party error, user-agency violation, incomplete ending, or another supported defect? Stylistic preference, ambiguity, harmless added detail, and unsupported possibilities are NO.',
    },
} as const;

export const JEV_GROUP_GATE_QUESTIONS_V2 = JEV_GROUP_GATE_SHADOW_QUESTIONS;
