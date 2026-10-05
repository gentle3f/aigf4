# AIGF Jev Group Gate V2 Collapsed Shadow Handoff — 2026-09-29

## Branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- HEAD: `648a006 Collapse Group Jev shadow calls`
- Branch is intentionally far ahead of remote.
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.

## Production
Production remains on the isolated release line. Do NOT deploy this main work branch unless explicitly requested.

Jev remains shadow-only.
Gemma remains 100% authoritative.
No threshold is approved.
No skip-Gemma behavior is approved.

## Existing real-user evidence
The user's prior exported 63-record cohort was all Group / Cc=false:
- 59 Jev OK / 4 unavailable
- Gemma 49 keep / 14 revise
- Gemma issues: group_narration 9, wardrobe 2, persona_voice 2, other 2
- old Jev `groupNarrationViolation` showed essentially no useful separation.

Root insight:
- Group narration ownership is already available from parsed typed segments.
- `groupNarrationUsesFirstPerson(candidate)` is the deterministic source for illegal first-person Group narration.
- Do not ask Jev to guess that deterministic fact.

## Group deterministic cohort
`d0a6fe5 Record deterministic group narration shadow`
adds:
- `calibrationCohort: 'group-deterministic-v1'`
- `deterministicGroupNarrationViolation: boolean`

`87f1d06 Show deterministic group narration metrics`
shows parser truth vs Gemma and legacy V3 narration signal.

## Group material-revision gate
`d9e5e69 Calibrate Group material revision gate`
introduced a calibration-only global semantic proposition in the old group-narration answer slot.

V1 live was too risk-biased:
- semantic positive mean ~0.948
- negative mean ~0.785
- separation ~0.163
- deterministic-only narration control ~0.74

V2 wording asks whether revision is REQUIRED for one specific supplied-evidence-supported defect and explicitly says NO/KEEP for missing, ambiguous, stylistic, harmlessly additive, or unproven facts.

Initial three 14-case V2 runs:
- positives ~0.90–0.94
- negatives ~0.51–0.80
- minimum observed gap 0.10
- deterministic-only control ~0.51–0.57

## Broad semantic coverage
`6f252a4 Broaden Group gate semantic coverage`

Corpus now contains 32 production-shaped Group cases:
- 13 semantic positives
- 19 negatives
- all 13 semantic categories covered with Group-shaped positive/negative evidence
- plus deterministic group narration controls

One broad live V2 sweep:
- 32/32 completed
- positive mean 0.942, range 0.89–0.98
- negative mean 0.546, range 0.22–0.80
- mean separation 0.396
- deterministic-only control 0.52

Boundary repeats focused on:
- incomplete_ending positive
- persona_voice positive
- replay-unproven negative
- two wardrobe negatives
- deterministic-only narration control

Across four observations per boundary:
- positive range 0.89–0.91
- highest clean replay-unproven 0.80–0.81
- wardrobe clean ranges 0.72–0.80 / 0.72–0.78
- deterministic-only control 0.52–0.54
- minimum observed boundary gap 0.08

IMPORTANT:
- These are synthetic calibration observations only.
- Do not select a production threshold from them.
- Do not skip Gemma from them.

## Cross-question drift A/B
`88b84b2 Measure Group gate cross-question drift`

Purpose:
- determine whether changing only the old group-narration proposition into the V2 global gate materially disturbs the other thirteen unchanged semantic NOUL answers.

IMPORTANT correction:
- An earlier ad-hoc PowerShell comparison falsely reported huge drift because the first V2 JSON had been generated before `semanticSignals` were exported; missing values were coerced to zero.
- That result is INVALID and must not be reused.

Correct apples-to-apples A/B:
- 32 same production-shaped Group states
- production V3 question set vs V2 question set
- 13 unchanged semantic questions x 32 = 416 comparisons
- mean absolute delta: 0.014
- maximum absolute delta: 0.08
- > 0.05: 20
- > 0.10: 0

Therefore the other thirteen semantic answers remain descriptively stable enough to carry them inside the V2 Group shadow call for diagnostics. This is NOT a routing accuracy claim.

## Production-shadow candidate
`8864aa9 Add Group material revision shadow trial`
added the fixed server profile:
- `group-gate-v2`

Browser may request only fixed allowlisted profiles:
- production
- wardrobe-v4
- group-gate-v2

Arbitrary browser question sets remain rejected.

Safe metadata only:
- profile/status/reason/network code
- latency/model
- `requiresRevision`
- numeric semantic signals
- token/cost data

No user text, candidate text, history, persona evidence, prompt, revised response, credentials, or raw model text is stored.

## Group Jev call collapse
`648a006 Collapse Group Jev shadow calls`

Before:
- production V3 Jev call
- wardrobe-v4 trial call
- group-gate-v2 call
= 3 Jev calls per Group strict review

Now:
- group-gate-v2 primary Group shadow call
- wardrobe-v4 wording trial call
= 2 Jev calls per Group strict review

The duplicate Group production V3 call is removed.

The V2 Group call stores:
- global `requiresRevision`
- all thirteen unchanged semantic numeric signals
- usage/model/latency

Single/Cc behavior is unchanged:
- frozen production V3 shadow remains their primary Jev shadow
- wardrobe trial remains separate

Gemma remains unchanged and authoritative in every mode.

## Diagnostics after collapse
Group gate V2 diagnostics now include:
- global gate vs Gemma KEEP
- global gate vs Gemma semantic REVISE
- deterministic-only narration cohort
- Gemma narration vs parser mismatch
- thirteen Group V2 semantic signal averages
- status/latency/usage/cost

Wardrobe A/B remains paired after duplicate V3 removal:
- legacy/Single uses top-level production V3 wardrobe signal
- new Group uses the unchanged wardrobe proposition returned inside `groupGateTrial.semanticSignals`
- wardrobe-v4 remains the trial arm

Persisted gate-only Group records survive reload.
Storage remains metadata-only and bounded.

## Validation for 648a006
- targeted Jev collector/storage/diagnostics: 20/20 PASS
- full suite: 579/579 PASS
- build: PASS
- typecheck: PASS
- diff check: PASS
- main JS ~383.18 kB / 133.42 kB gzip
- Jev diagnostics remains lazy ~19.93 kB / 5.27 kB gzip

No deployment.

## Immediate next step
Do NOT deploy automatically.

The next useful choices are:
1. Prepare an isolated backport/release candidate for real production Group V2 shadow collection, but do not deploy without explicit approval; OR
2. Return to the broader AIGF startup/runtime decomposition audit on the main work branch.

If continuing Jev:
- preserve deterministic narration check
- preserve V2 fixed profile
- preserve Gemma authority
- collect real production Group V2 data before any threshold discussion
- do not infer routing authority from synthetic ranges

If returning to decomposition:
- inspect actual current `index.tsx` line count and startup dependency graph first
- prefer material cold seams, not line-count-only extraction
- avoid hot send/group/review/memory/wardrobe/relationship/request-lifecycle paths unless a clearly safe seam is found
