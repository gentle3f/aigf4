# Phase 4J: Jev Single-Proposition Isolation

## Status

This is calibration-only infrastructure. It does not alter production
`JEV_QUESTIONS`, production review behavior, model selection, routing,
thresholds, Gemma authority, or deployment state.

## Why isolate one proposition

Phase 4I compared production questions with all fourteen V4 questions changed
together. The result had clear wardrobe movement: unestablished controls moved
from `.48` to `.21` and `.47` to `.24`, while the wardrobe positive moved from
`.97` to `.90`. Group narration separation also rose from `.520` to `.638`.

Other categories were mixed: replay and continuity separation declined,
persona valid negatives did not consistently fall, and `other_defect` became
less separated. Because all fourteen question strings changed together, a
target signal could have been influenced by the surrounding propositions. No
causal claim about any one wording change follows from Phase 4I.

## Isolation method

`buildSingleQuestionExperimentalSet(category)` starts with the exact frozen
production `JEV_QUESTIONS`, returns a new object, and replaces only the mapped
question instruction with the frozen Phase 4I V4 instruction. The other
thirteen production instructions remain byte-for-byte identical. Neither
production nor V4 objects is mutated.

The new `single-proposition-ab` suite reuses exactly the same 28 frozen
fictional Phase 4I source ReviewStates. Each source has:

- one production-question request;
- one `category-v4` request, where only that source's category proposition is
  V4.

This makes 56 future requests: 28 production and 28 category-V4. The two
passes alternate question set assignment by source, then use the complementary
assignment on the second pass. No pair is adjacent, and no randomization is
used.

Coverage remains wardrobe (4), replayed beat (7), continuity (4), persona
voice (6), group narration (5), and other defect (2): seven positives and
twenty-one negatives.

## Production and data safety

Only the explicit local calibration harness can pass a hybrid through the
existing calibration opt-in. The browser route continues to accept only
`{ state }`, so it cannot choose any alternate question set. Gemma remains the
sole production strict-review authority; Jev remains shadow-only.

Future `single-proposition-ab` JSON contains only `id`, `sourceCaseId`,
`category`, `expected`, `questionSet`, `signal`, `model`, latency, tokens,
cost, and `reasonCode`. It does not contain a ReviewState, candidate, history,
persona evidence, questions, credentials, headers, or environment values.

## Future comparison

The harness aggregates production versus category-V4 signals by source and by
category/expected label, including positive and negative means, extrema, and
descriptive separation. This permits a later comparison of Phase 4I full-V4
delta with Phase 4J single-question delta without hardcoding live measurements
into application code.

No threshold, accuracy metric, p-value, routing decision, or production
promotion is introduced. The next step is one explicit live Phase 4J run after
audit.
