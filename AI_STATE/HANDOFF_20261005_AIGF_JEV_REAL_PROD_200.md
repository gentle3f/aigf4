# AIGF Jev Real-Production 200-Record Calibration — 2026-10-05

## Scope

Source export:
`aigf-jev-shadow-2026-10-05T09-13-20-090Z.json`

A preserved copy is stored outside the repo at:
`C:\Workspaces\PROJECTS\AIGF_JEV_DATA\aigf-jev-shadow-2026-10-05T09-13-20-090Z.json`

This is safe metadata only. The export contains no prompt, user text, assistant candidate text, persona evidence, revised response, credentials, or raw model response.

This analysis is observational only. It does **not** authorize Jev routing, thresholding, or Gemma bypass.

## Cohort shape

- total records: 200
- mode: Group only
- Cc mode: false for all 200
- taxonomy: v3
- calibration cohort: `group-deterministic-v1`
- Group Gate profile: `group-gate-v2`
- Wardrobe profile: `wardrobe-v4`
- Jev/Group Gate status: 199 OK, 1 unavailable, 0 aborted
- Gemma: 153 KEEP, 47 REVISE
- no Gemma unavailable records

Gemma issue counts:
- request_mismatch: 1
- identity: 1
- continuity: 19
- wardrobe: 10
- persona_voice: 1
- group_narration: 17
- all other current taxonomy issue counts: 0

The previous 63-record export used the older production-V3 Group signal shape and did not contain Group Gate V2 records. No exact duplicate record was found between the two exports when compared on the common safe metadata signature. Treat this 200-record export as a new real-production V2 cohort.

## Group Gate V2: primary finding

Among the 199 successful Group Gate calls:

Gemma KEEP:
- n = 152
- Jev `requiresRevision` mean = 0.624
- range = 0.40–0.84
- median = 0.60

Gemma semantic REVISE (at least one non-`group_narration` comparable issue):
- n = 31
- Jev mean = 0.694
- range = 0.42–0.87
- median = 0.72

All Gemma REVISE:
- n = 47
- Jev mean = 0.709
- range = 0.42–0.87
- median = 0.74

Ranking discrimination:
- semantic-REVISE vs KEEP AUC ≈ 0.695
- all-REVISE vs KEEP AUC ≈ 0.739

Interpretation:
- V2 carries real directional information.
- The production distributions overlap heavily.
- This is materially weaker separation than the synthetic calibration cohort.
- There is no useful observed low-score region that is both large and free of Gemma semantic revisions.

### Why this is not ready to skip Gemma

If "score below threshold" were treated as an automatic KEEP / skip-Gemma rule:

| Threshold | Auto-KEEP records | Gemma KEEP inside | Gemma semantic REVISE missed |
| --- | ---: | ---: | ---: |
| < 0.42 | 1 | 1 | 0 |
| < 0.45 | 2 | 1 | 1 |
| < 0.50 | 6 | 4 | 2 |
| < 0.55 | 31 | 27 | 4 |
| < 0.60 | 78 | 72 | 6 |
| < 0.65 | 111 | 99 | 12 |
| < 0.70 | 132 | 117 | 15 |

The only observed zero-miss threshold (<0.42) would skip Gemma for just one successful record. The moment the threshold becomes operationally useful, semantic misses appear.

Therefore:
- **no production skip-Gemma threshold is approved**
- **no automatic KEEP rule is approved**
- Gemma remains authoritative

Also note: Gemma is being used here as the comparison label, not assumed to be objective ground truth. Agreement metrics measure Jev-vs-Gemma behavior, not absolute correctness.

## Semantic signal detail

Current issue-specific evidence is uneven.

### Continuity
- Gemma continuity positives: 19
- Jev continuity signal positive mean ≈ 0.449
- non-positive mean ≈ 0.311
- AUC ≈ 0.749

Directional, but not clean enough for standalone authority.

### Wardrobe
Using the Group Gate V2 embedded production wardrobe proposition:
- Gemma wardrobe positives: 10
- positive mean = 0.575
- negative mean ≈ 0.134
- AUC ≈ 0.947

This is a strong signal.

### Persona voice
- only 1 positive
- signal = 0.78 for that positive
- insufficient positive count for a production decision

### Identity
- only 1 positive
- signal = 0.81
- insufficient positive count

### Request mismatch
- only 1 positive
- signal = 0.25
- no useful conclusion from one case

Categories with zero positive examples in this export cannot be calibrated from this cohort.

## Wardrobe V4 A/B

Current V2 cohort:
- paired Group records: 199
- Gemma wardrobe issue: 10
- no Gemma wardrobe issue: 189

Embedded production wardrobe signal:
- positive mean = 0.575
- negative mean ≈ 0.134
- separation ≈ 0.441
- AUC ≈ 0.947

Wardrobe-v4 trial:
- positive mean = 0.409
- negative mean ≈ 0.081
- separation ≈ 0.328
- AUC ≈ 0.972

Although the trial's raw mean gap is smaller because its scores are generally compressed downward, its rank discrimination is better: negatives are much more tightly suppressed.

Combining the older 63-record export's paired wardrobe observations with this export:
- total paired records = 257
- Gemma wardrobe positives = 12
- production wardrobe AUC ≈ 0.945
- wardrobe-v4 AUC ≈ 0.973

A paired bootstrap on the combined cohort estimated the AUC improvement for wardrobe-v4 at roughly +0.028, with an approximate 95% interval of +0.008 to +0.054.

Interpretation:
- wardrobe-v4 is currently the strongest Jev research result
- but there are still only 12 positive wardrobe cases across both real-user exports
- do not promote it to routing authority yet
- continue shadow collection
- any future threshold would need to be calibrated specifically for wardrobe-v4 because its score scale is lower than the production proposition's scale

## Deterministic Group narration mismatch

Across all 200 records:
- deterministic parser violation: 17
- Gemma `group_narration` issue: 17
- both: 2
- Gemma issue but parser clear: 15
- parser violation but Gemma no issue: 15
- neither: 168

Agreement beyond chance is essentially absent (Cohen's kappa ≈ 0.036).

This does **not** prove the parser is wrong or Gemma is wrong. It proves the two mechanisms are labeling materially different things in real usage.

Because the safe export intentionally contains no candidate text, this metadata cannot adjudicate which side is correct on those 30 disagreements.

Therefore:
- do not let deterministic narration silently replace Gemma narration review based on this cohort alone
- do not let Gemma override deterministic parser truth without inspecting the definition mismatch
- if we want to resolve this, the next instrumentation should add a safe categorical deterministic reason/count rather than raw user/candidate text

## Reliability / cost

Group Gate V2:
- 199/200 OK = 99.5%
- 1 timeout/unavailable
- average successful latency ≈ 1,048 ms
- max successful latency ≈ 3,086 ms
- cost ≈ $0.05755 across the cohort

Wardrobe V4:
- 200/200 OK
- average latency ≈ 1,064 ms
- max latency ≈ 4,475 ms
- cost ≈ $0.05699

Combined Jev shadow cost for the two trial calls:
- ≈ $0.11454 across 200 Group turns
- ≈ $0.000573 per Group turn

These are shadow calls; this figure is cost overhead, not necessarily user-visible latency overhead because they run alongside the authoritative path.

## Storage / export warning

The export contains exactly 200 records, matching the bounded Jev shadow storage design.

Treat the local browser store as a rolling window, not a durable dataset. Older records will be displaced as new ones arrive.

Recommended operating rule:
- export before clearing
- while actively collecting, export every ~100–150 new Group records rather than waiting until the 200-record window is full
- preserve raw exports outside the repo
- analyze merged cohorts using schema/profile boundaries; do not silently pool old production-V3 and new Group-Gate-V2 scores as if they were the same signal

## Recommended next step

1. Keep Gemma authoritative.
2. Keep Group Gate V2 shadow-only.
3. Keep wardrobe-v4 shadow-only, but prioritize its evidence because it currently has the strongest real-user discrimination.
4. Continue real production collection until wardrobe and the other semantic categories have materially larger positive counts.
5. Do not choose a global Group Gate threshold from this 200-record cohort.
6. Resolve deterministic narration definition mismatch separately before using it as an authoritative replacement.
7. For future exports, add a safe stable record identifier/timestamp if possible so overlapping rolling-window exports can be deduplicated exactly without storing content.
