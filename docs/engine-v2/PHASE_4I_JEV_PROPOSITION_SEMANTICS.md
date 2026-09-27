# Phase 4I: Jev Proposition Semantics Sandbox

## Status

Experimental calibration support only. This phase does not change production
questions, production request behavior, Gemma authority, routing, thresholds,
or deployment state.

## Why this exists

Phase 4H repeated sixteen frozen fictional states five times each. Most
within-state ranges were `.01-.05`; `wardrobe-unspecified` was the notable
wider state at `.10`. Consequently, small Phase 4G transport-shape movements
around `.02-.05` overlap observed run-to-run variation and are not a reason to
continue transport tuning. The larger replay movements (`-.15`, `-.23`, and
`-.24`) were materially larger than those observed replay ranges.

The more useful question is semantic: earlier frozen runs gave mid-range
signals when a state did not establish a prerequisite fact. Examples include
unestablished wardrobe evidence (approximately `.49-.55`) and ordinary
uncompleted replay controls (approximately `.34-.35`), while an explicit
non-completion control was much lower (approximately `.11`).

The experimental principle is therefore: **absence, unknown, or an
unestablished prerequisite is not a contradiction.**

## Production freeze

`api/_openrouter-decisions.js` continues to export and use the exact frozen
fourteen `JEV_QUESTIONS` strings for normal requests. The production route
accepts only `{ state }`; browser input cannot select question sets. Gemma
remains the sole production strict-review authority and Jev remains shadow
only.

## Experimental V4 wording

`tests/fixtures/jevExperimentalQuestions.ts` contains a separate fourteen-key
NOUL set. It is available only to the explicit calibration harness option.

| Category | Experimental clarification |
|---|---|
| request mismatch, identity, speaker ownership, reality layer, state, third-party speech, user agency, incomplete ending | Require a concrete violation supported by supplied evidence; missing or uncertain prerequisites are NO. |
| continuity | A concrete contradiction with an established fact is required; compatible added detail and uncertainty are NO. |
| wardrobe | Clothing must be explicitly established and contradicted; new or unestablished clothing is NO. |
| replayed beat | The same material beat must be clearly completed; planning, attempts, examination, partial action, and ambiguity are NO. |
| persona voice | A clear explicit persona rule must be materially violated; unspecified traits and compatible variation are NO. |
| group narration | Both group mode and unlabelled participant first-person narration are required; labelled dialogue is NO. |
| other defect | One concrete supported material defect, not covered by another category, is required; possible problems are NO. |

No wording uses scores, thresholds, or routing instructions.

## Semantic A/B corpus and ordering

`tests/fixtures/jevSemanticAb.ts` selects 28 existing frozen fictional states
from the clean, production-shape parity, and factor-isolation corpora. It does
not create or mutate ReviewStates. Coverage is wardrobe, replayed beat,
continuity, persona voice, group narration, and other defect, including clear
positives plus unestablished, explicit-valid, labelled-dialogue, and
completion-status controls.

Each source receives one production-question request and one experimental
question request (56 future requests). The first pass alternates production
and experimental by source; the second pass uses the complementary assignment.
This is deterministic, balanced, and avoids adjacent A/B requests for a source.

Future live output aggregates each source's production signal, experimental
signal, and delta. It also aggregates positive/negative means, positive minima,
negative maxima, and mean separation by category and expected label. It is a
descriptive sandbox, not a threshold, accuracy, or authority exercise.

## Safety and next step

The semantic suite's future JSON results contain only `id`, `sourceCaseId`,
`category`, `expected`, `questionSet`, `signal`, `model`, latency, token, cost,
and `reasonCode`. It never writes a ReviewState, candidate, history, persona
evidence, questions, headers, credentials, or environment value.

The next step, after audit, is one explicit live semantic A/B calibration run.
No live run is part of Phase 4I implementation.
