# AIGF Research Capture Low-Egress Foundation — 2026-10-06

## Status

Local implementation complete and validated. **Not deployed yet.**

Production remains the Supabase egress hotfix:
- commit `7d2b21c Stop Supabase Realtime self-echo egress`
- production deployment `dpl_3zmLPykSwT5jsFq2tUe7cayWrae8`

Deployment of Research Capture is intentionally blocked until the Supabase migration creating `wetapp_research_turns` is applied.

## Purpose

Collect enough real Group-chat content to calibrate Jev and compare the current rigid Group reply structure against a future Dynamic Group Reply V2, while avoiding another Supabase quota incident.

The capture path is observational only:
- no Jev routing authority
- no Gemma bypass
- no change to Group generation/review result
- no Realtime subscription
- no credentials/tokens stored

## Local capture

Research Capture is explicit opt-in through the Jev Shadow diagnostics UI.

When enabled, each Group turn can retain locally:
- user message
- bounded recent review context
- persona/memory evidence already supplied to strict review
- raw candidate
- parsed segments
- proposed scene
- final accepted reply
- Gemma keep/revise decision and issue codes
- accepted Gemma revision when applicable
- Jev Group Gate / Wardrobe trial metadata
- structural interaction metrics

Local storage:
- IndexedDB database: `aigf4ResearchCaptureV1`
- retention: 30 days
- maximum: 1,000 records
- incomplete `captured` records are not queued to cloud until review completes/fails

Mobile fallback:
- Jev Shadow UI can share/download a full Research JSON archive
- the UI warns that this file contains actual chat content

## Structural metrics

Each candidate/final Group reply records:
- segment count
- narration/dialogue counts
- unique speakers
- speaker sequence
- narrator-first
- narrator-last
- everyone-present-speaks
- direct character-to-character transitions
- speaker re-entry count
- narration-between-every-speaker-change

These are intended as baseline metrics for Dynamic Group Reply V2.

## Low-egress cloud policy

Every completed/failed turn may upload only **compact metadata**.

The ordinary cloud row excludes:
- user message
- recent history text
- persona evidence
- candidate text
- final reply text
- scene payload

Compact metadata includes:
- record/request/conversation identifiers
- timestamps/lifecycle
- interaction metrics
- Gemma decision/issue codes
- Jev safe metadata
- sample reason(s)
- whether full content was selected

Full content is stored in nullable `sample_payload` only for selected research samples.

Sample reasons:
- Gemma REVISE
- Jev Group Gate disagreement
- Wardrobe V4 high-confidence
- deterministic-vs-Gemma narration disagreement
- rigid-structure sample
- capture failure
- background control sample

Sampling policy:
- Wardrobe high-confidence: full content always
- Jev Gate disagreement: full content always
- capture failure: full content always
- Gemma REVISE: deterministic ~50%
- narration disagreement: deterministic ~50%
- rigid-structure: only ~10% of rigid turns become candidates/full samples
- ordinary control: deterministic ~5%

Sampling uses stable hashing so retry/re-sync of one record does not randomly change its inclusion.

## Cloud retention

Cloud Research rows are automatically pruned after 90 days.

Pruning:
- at most once per 24h per local device
- delete only rows older than the retention cutoff
- no Realtime publication/subscription is used

## Supabase schema

Migration:
`supabase/migrations/20261005000000_wetapp_research_capture.sql`

Table:
`public.wetapp_research_turns`

Important fields:
- `metadata jsonb not null`
- `sample_payload jsonb null`
- per-user RLS
- owner-only policy through existing `public.is_wetapp_owner()`
- not added to Supabase Realtime publication

## Measured traffic shape

A synthetic deliberately heavy Group record was measured with:
- 18k recent-history chars
- 5k persona evidence chars
- 4.5k candidate
- 4.5k final response

Measured serialized size:
- full local record: ~52.7 KB
- ordinary compact cloud row: ~1.75 KB
- selected full-content cloud row: ~59.1 KB
- ordinary-turn reduction: ~96.7%

Using the real 200-record Jev cohort from 2026-10-05:
- Gemma revise reasons: 47
- narration disagreement: 30
- Wardrobe high-confidence: 6
- Jev Gate disagreement: 7
- simulated full-content selection: 40/200 = 20%
- this simulation could not include rigid-structure sampling because the legacy Jev export has no segment metrics

Expected cloud growth is therefore MB-scale per hundreds of turns rather than GB-scale.

## Validation

Latest local validation after low-egress changes:
- targeted Research/Cloud/Jev tests: PASS
- TypeScript typecheck: PASS
- full suite: **661/661 PASS**
- production build: PASS
- git diff --check: PASS

Latest build keeps Research Capture cold/lazy:
- `researchCapture-*.js` ~7.8 kB minified / ~3.1 kB gzip
- main bundle remains ~362 kB minified / ~126 kB gzip

## Deployment blocker

Do not deploy/enable the Research Capture cloud sync before applying the Supabase migration.

A Supabase ChatGPT connector is available and is the preferred way to apply/verify the migration without sharing service credentials in chat.

After migration:
1. verify table + RLS + no Realtime publication;
2. commit and deploy the Research Capture code;
3. smoke-test on phone with Research Capture ON;
4. confirm a normal turn uploads metadata with `sample_payload = null`;
5. confirm a selected sample can carry full content;
6. confirm Supabase Realtime egress remains near zero;
7. then begin Current Group V1 baseline collection before Dynamic Group Reply V2.
