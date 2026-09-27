/**
 * Calibration-only propositions. Production requests always retain JEV_QUESTIONS.
 * Absence, ambiguity, and an unestablished prerequisite are not contradictions.
 */
export const JEV_EXPERIMENTAL_QUESTIONS_V4 = {
    request_mismatch: { type: 'noul', instructions: 'Does candidateText materially fail to answer, follow, or respect latestUserText as supplied? If no concrete mismatch is established, answer NO.' },
    identity_conflict: { type: 'noul', instructions: 'Does candidateText assign a participant a wrong identity, name, or role that concretely contradicts supplied participant or persona evidence? Unknown identity facts are NO.' },
    speaker_ownership_violation: { type: 'noul', instructions: 'Does candidateText attribute speech, action, thought, or first-person ownership to the wrong supplied participant? If ownership is not established, answer NO.' },
    continuity_violation: { type: 'noul', instructions: 'Does candidateText concretely contradict an established fact in recentHistoryText or the current scene? Missing information, compatible added detail, and uncertainty are NO.' },
    reality_layer_violation: { type: 'noul', instructions: 'Does candidateText concretely behave in a reality layer that contradicts supplied realityLayer? If the layer is absent or compatible, answer NO.' },
    wardrobe_conflict: { type: 'noul', instructions: 'Does candidateText explicitly contradict supplied established clothing? If relevant clothing is unestablished, or it merely mentions new clothing, answer NO.' },
    state_conflict: { type: 'noul', instructions: 'Does candidateText concretely contradict supplied current location, participant presence, body position, or explicit scene state? If the prerequisite fact is not established, answer NO.' },
    replayed_beat: { type: 'noul', instructions: 'Does candidateText repeat a material action, instruction, or beat that recentHistoryText clearly shows was completed? Planning, attempts, examination, partial action, and completion ambiguity are NO.' },
    persona_voice_violation: { type: 'noul', instructions: 'Does candidateText materially violate a clear explicit personality, language, or style rule in personaEvidence? Unspecified traits, compatible variation, and stylistic ambiguity are NO.' },
    third_party_speech_violation: { type: 'noul', instructions: 'Does candidateText concretely omit, invent, or misattribute required third-party participation or speech established by supplied evidence? If participation is not established, answer NO.' },
    user_agency_violation: { type: 'noul', instructions: 'Does candidateText invent a consequential user speech, action, choice, or commitment that latestUserText did not make? If the user action is not concretely invented, answer NO.' },
    incomplete_ending: { type: 'noul', instructions: 'Is candidateText materially truncated, cut off, or unfinished rather than intentionally open-ended? If it is complete or uncertain, answer NO.' },
    group_narration_violation: { type: 'noul', instructions: "Are BOTH true: (1) state.mode === 'group'; and (2) candidateText has participant first-person narration outside labelled character dialogue? First-person text inside labelled dialogue is NO." },
    other_defect: { type: 'noul', instructions: 'Does candidateText have one concrete material defect supported by supplied state that none of the other thirteen questions covers? A possible or unsupported problem is NO.' },
} as const;
