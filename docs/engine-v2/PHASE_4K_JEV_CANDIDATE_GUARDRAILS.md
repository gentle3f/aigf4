# Phase 4K: Jev Candidate Promotion Guardrails

## Status

Phase 4K creates a fictional, offline-only A/B guardrail suite. It does not change production questions, production routing, Gemma, thresholds, or deployment behavior. Jev remains shadow-only and Gemma remains the sole production authority.

## Frozen Evidence

Phase 4I tested the full V4 question set. Phase 4J then isolated one V4 proposition per source. The wardrobe proposition repeatedly lowered signals for clothing that was absent or unspecified while retaining a high clear-conflict signal. The group-narration proposition improved its clear positive signal, but one production-envelope negative was less stable. Replay, continuity, persona voice, and other remain frozen experimental evidence rather than promotion candidates.

## Candidate Scope

Only two category-only hybrids are exercised:

- `wardrobe`
- `group_narration`

Each source creates one production request and one `category-v4` request. Both requests share the exact same immutable `ReviewState` object. `buildSingleQuestionExperimentalSet()` changes exactly one proposition; the other thirteen production questions remain byte-identical.

## Fixture Coverage

The suite has 40 fictional source states and 80 future A/B requests:

- Wardrobe: 22 sources covering clear conflicts, exact matches, unestablished clothing, additive accessories, legitimate clothing changes, wrong-person conflicts, ambiguous references, and group serializer shapes.
- Group narration: 18 sources covering unlabelled first-person narration, labelled dialogue/action formats, third-person narration, attributed quotations, mixed positives, and serializer-envelope positives/negatives.

Group envelope cases are built with `serializeGroupGenerationForReview()`. Review states use `buildReviewState()` and `buildJevRecentHistoryText()` with fictional Aster, Beryl, and Cato workshop scenarios only.

## Future Reporting

The safe future JSON contains only identifiers, category/family metadata, question set, signal, model, timing, token/cost metrics, and reason code. It excludes state, candidate text, history, persona evidence, question text, headers, environment values, and credentials.

Future reports can aggregate by category, guardrail family, and expected direction, then compare production/category-V4 positive-minus-negative separation. This is observational calibration evidence, not an automatic promotion rule.

## Optional Repeat Sentinels

No repeats are run in Phase 4K. If an explicit future repeat run is approved, use only these sentinels first:

- wardrobe strongest positive: `guardrail-wardrobe-conflict-coat`
- wardrobe representative unestablished negative: `guardrail-wardrobe-unestablished-none`
- group representative unlabelled positive: `guardrail-group-envelope-positive-one`
- group representative serializer-envelope negative: `guardrail-group-envelope-negative-two`

## Next Step

Audit the fixture and harness, then perform one separately authorized live `candidate-guardrail` A/B run. Do not promote wording, introduce thresholds, route Jev decisions, skip Gemma, or deploy before that audit.
