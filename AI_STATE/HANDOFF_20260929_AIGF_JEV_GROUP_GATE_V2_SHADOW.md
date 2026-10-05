# AIGF Jev Group Gate V2 Shadow Handoff — 2026-09-29

## Branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- HEAD: `8864aa9 Add Group material revision shadow trial`
- Branch is intentionally far ahead of remote. Do not blindly push/deploy the whole branch.
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.

## Production
Production is still the isolated release based on `19fc7d5`, with only:
- `1316979 Open chat history at latest message`
- `c192386 Add mobile Jev JSON export`

Production deployment:
- `dpl_BsSRQZRqPaCcqggpe8hcGwpxPHGo`

Do not deploy the main work branch. Any future production collection must use an isolated release/backport.

## Existing real-user evidence
The user's exported 63-record Jev cohort is all Group, Cc=false:
- 59 Jev OK / 4 unavailable
- Gemma 49 keep / 14 revise
- Gemma issues: group_narration 9, wardrobe 2, persona_voice 2, other 2
- Existing Jev groupNarrationViolation had essentially no separation against Gemma group_narration.

Root-cause insight:
- Group output is already parsed into typed segments.
- `groupNarrationUsesFirstPerson(candidate)` deterministically detects illegal first-person narration.
- Therefore Group narration ownership should not be delegated to Jev semantic guessing.

## Group deterministic cohort
`d0a6fe5 Record deterministic group narration shadow`
adds safe metadata:
- `calibrationCohort: 'group-deterministic-v1'`
- `deterministicGroupNarrationViolation: boolean`

`87f1d06 Show deterministic group narration metrics`
adds lazy diagnostics UI for parser truth vs Jev vs Gemma.

No routing authority was added.

## Group material-revision gate research
`d9e5e69 Calibrate Group material revision gate`
adds:
- `npm run jev:group-gate`
- 14 existing production-shaped Group parity cases
- a calibration-only global Group gate proposition
- safe live JSON reporting
- no production behavior change

The gate reuses the old `group_narration_violation` answer slot only inside calibration so the transport/normalizer stays identical. Pure Group narration violations are treated as deterministic-only controls and expected NO from the semantic gate.

### V1 live
14/14 completed:
- semantic positives mean 0.948, range 0.93–0.96
- negatives mean 0.785, range 0.67–0.90
- mean separation 0.163
- deterministic-only narration control 0.74

Conclusion: directional but too risk-biased.

### V2 wording
V2 explicitly asks whether revision is REQUIRED for a specific, supplied-evidence-supported defect and says KEEP/NO for missing, ambiguous, stylistic, harmlessly additive, or unproven facts.

Three live synthetic runs, same 14 production-shaped Group states:

Run 1:
- positives mean 0.918, range 0.90–0.93
- negatives mean 0.633, range 0.55–0.79
- separation 0.285
- deterministic-only control 0.57

Run 2:
- positives mean 0.922, range 0.91–0.93
- negatives mean 0.633, range 0.54–0.80
- separation 0.289
- deterministic-only control 0.55

Run 3:
- positives mean 0.920, range 0.90–0.94
- negatives mean 0.634, range 0.51–0.80
- separation 0.286
- deterministic-only control 0.51

Across all 42 observations:
- true semantic defects: 0.90–0.94
- expected KEEP: 0.51–0.80
- observed minimum gap: 0.10
- largest per-case three-run range: 0.06
- cost was very low

IMPORTANT:
- This is promising calibration evidence, NOT an approved threshold.
- Do not infer production routing authority from the 0.10 observed gap.
- No Jev skip-Gemma behavior is approved.

## Production-shadow candidate implementation
`8864aa9 Add Group material revision shadow trial`

Adds fixed server-side profile:
- `group-gate-v2`

Security / transport:
- browser may request only allowlisted fixed profiles: production, wardrobe-v4, group-gate-v2
- arbitrary browser-supplied question sets remain rejected
- production Group gate V2 wording and calibration V2 wording share the same constant

Behavior:
- Group only: starts one extra V2 Jev shadow request in parallel
- Single does NOT start the Group gate trial
- Gemma still runs every strict review and remains the only authority
- no response mutation
- no state mutation
- no routing decision
- no threshold
- no Gemma skip

Safe persisted metadata only:
- profile/status/reason/network code
- latency
- served model
- `requiresRevision` probability
- token/cost metadata

No candidate text, user text, history, persona evidence, prompt, revised response, or credentials are stored.

Diagnostics compare:
- Gemma KEEP
- Gemma semantic REVISE (any non-group_narration issue)
- deterministic-only group narration
- Gemma group_narration while deterministic parser is clear
- status/latency/token/cost

Validation for `8864aa9`:
- targeted Jev stack: 47/47 PASS
- full suite: 575/575 PASS
- typecheck: PASS
- build: PASS
- diff check: PASS
- main JS about 382.51 kB / 133.23 kB gzip
- Jev diagnostics remains lazy, about 17.63 kB / 4.96 kB gzip

No deployment.

## Immediate next task
Do NOT deploy yet.

Current calibration coverage is too narrow for a global semantic gate:
- the 14 production-shaped Group parity cases provide semantic positives only for:
  - continuity
  - replayed_beat
  - wardrobe
  - persona_voice
- plus group narration deterministic controls

Next:
1. Build production-shaped Group gate guardrails for the remaining semantic categories:
   - request_mismatch
   - identity
   - speaker_ownership
   - reality_layer
   - state
   - third_party_speech
   - user_agency
   - incomplete_ending
   - other
2. Include clean paired negatives for every category.
3. Reuse actual Group serializer / ReviewState builders.
4. Run offline validation first.
5. Then one live V2 sweep; repeat only unstable or boundary sentinels.
6. Do not choose a threshold or routing rule.
7. Only after broad taxonomy evidence should a production shadow deployment be considered, via isolated release/backport.

## Architectural rule
Deterministic defects stay deterministic.
Jev should answer semantic questions only.
Gemma remains authoritative until real production evidence supports a later explicit routing decision.
