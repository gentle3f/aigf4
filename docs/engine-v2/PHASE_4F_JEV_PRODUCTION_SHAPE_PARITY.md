# Phase 4F: Jev Production-Shape Parity Audit

## Purpose and boundary

The frozen Phase 4E clean semantic controls completed with 14/14 paired
positive signals greater than their matched negatives. That establishes only
that the propositions react directionally to small, clean fictional evidence.
It does not establish that their baseline is comparable to a production review
state.

Normal production observations showed `group_narration` at .02 in single
mode, while Cc/group `persona_voice`, group `continuity`, group
`group_narration`, and `replayed_beat` remained elevated on Gemma KEEP
records. Wardrobe was the useful contrasting observation: a Gemma wardrobe
revision measured .84, while observed keeps were approximately .06-.14.
No threshold, routing change, candidate application, or Gemma bypass is added
in this phase.

This document and its fixtures are structural only. They contain fictional
people and do not read browser storage, cloud data, exports, memories, or user
chats.

## Proven production state shape

### Normal single

`startStrictReviewShadow` calls `buildReviewState` before Gemma. The candidate
is the plain generated visible reply (without the separate Gemma-only
`<wardrobe>` envelope). The state contains `mode: 'single'`, `ccMode: false`,
the newest user text, current room scene fields only when a room is attached,
a copied wardrobe ledger, empty `relevantMemories`, and one active-character
participant for a non-room single chat. `personaEvidence` is one deterministic
`NAME`, `DESCRIPTION`, `PERSONA RULES` block, capped at 4,000 characters.

The history source is strict-review history, but the Jev helper filters to
user/assistant/model roles, removes the dedicated newest user turn, retains at
most four messages and 4,000 trailing characters, and writes `USER:` /
`ASSISTANT:` labels. System prompts do not enter this field.

### Cc single

Cc takes the same single candidate and history shape, with `ccMode: true` and
`personaKey === 'cc'`. Its Jev evidence is still one block, but it is built
from Cc's own description and prompt, including their actual language and
style rules. The state has no special Cc transport wrapper.

### Group

Group candidates are not prose. The shared serializer produces one concatenated
transport envelope:

```text
<chat>（narration）\nName：「dialogue」</chat><scene>{JSON}</scene><npc_candidate>{JSON|null}</npc_candidate>
```

The `scene` JSON keys are `location`, `reality_layer`, `present_member_ids`,
`summary`, `unresolved`, and `wardrobe_updates`; the latter has `user` and a
member-ID/outfit array. The same candidate scene is separately copied into
`proposedScene`, so scene and wardrobe facts are intentionally present in both
the candidate envelope and ReviewState. Current room scene fields remain the
current state. Participants are all room members, with only `id`, `name`, and
`present`; no per-member role is supplied by this builder.

Group `personaEvidence` concatenates every room member's three labelled block.
The shared 4,000-character budget is divided equally between members. A group
candidate can contain several labelled speakers while the one
`persona_voice_violation` proposition receives all of those evidence blocks.

## Proven differences from clean controls

- Clean group fixtures used plain prose; production uses the XML-like group
  transport envelope and embedded scene JSON.
- Clean fixtures manually supplied ReviewState evidence; parity fixtures call
  `buildReviewState`, `buildJevPersonaEvidence`, and
  `buildJevRecentHistoryText`.
- Production group candidate scene facts duplicate the separate
  `proposedScene`; clean controls generally had neither duplication nor a
  proposed scene.
- Production group persona evidence is multi-persona and budget-shared; clean
  controls used one short evidence block.
- Production recent history is role-labelled, bounded, and may contain several
  prior dialogue/narration turns; clean controls were intentionally small.

## Hypotheses, not conclusions

- Embedded transport tags, repeated scene facts, and labelled first-person
  dialogue may make real group narration less semantically clean than the
  original prose-only negative.
- A scalar persona voice score may be ambiguous when a group candidate and its
  evidence contain multiple distinct voices.
- Longer role-labelled history can add lexical overlap that is not a completed
  beat or continuity defect.

These are testable explanations only. This phase does not select one as a
cause and does not alter questions.

## Production-shape parity corpus

`JEV_PRODUCTION_SHAPE_PARITY_CASES` adds 20 fictional cases while leaving the
34 clean controls unchanged. It covers group narration, persona voice (normal,
Cc, and multi-persona group), continuity, replayed beat, and wardrobe, plus a
normal single group-narration control. Each fixture has safe `suite`, `mode`,
`ccMode`, `category`, expected direction, optional pair ID, and shape notes.

The parity suite directly reuses:

- `buildReviewState`
- `buildJevPersonaEvidence`
- `buildJevRecentHistoryText`
- `serializeGroupGenerationForReview`

The group serializer was extracted as a pure helper without a formatting or
ordering change. A characterization test asserts its representative output
byte-for-byte, and production calls that same helper.

## Harness and next step

The calibration harness supports offline suite selection:

```powershell
npm.cmd run jev:calibrate -- --suite clean
npm.cmd run jev:calibrate -- --suite parity
npm.cmd run jev:calibrate -- --suite all
```

Offline commands validate structure and report only case counts, suite/mode/Cc
counts, categories, reused helpers, and zero network calls. Live use remains
an explicit later action with `--live`; it is not run by this phase. Aggregates
remain threshold-free and include positive/negative means, extrema, separation,
directional pairs, and suite/mode/Cc grouping.

Production remains shadow-only: one Jev evaluation maximum may start, Gemma
always runs and is the sole authority, and no review, memory, wardrobe, state,
or routing behavior changes.
