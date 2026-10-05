# AIGF Cold Splits After Jev — 2026-09-29

## Branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- HEAD: `eb1f7ac Keep auto-memory payload cold`
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.
- Do not deploy main branch automatically.

## Jev state
Previous authoritative Jev details:
- `AI_STATE/HANDOFF_20260929_AIGF_JEV_GROUP_GATE_V2_COLLAPSED.md`

No authority change:
- Jev shadow-only
- Gemma authoritative
- no threshold
- no skip-Gemma

## Cold split sequence

### 07b45b3 Lazy-load Surprise Event generation
Moved heavy Surprise Event authoring prompt/validation/fallback into:
- `features/surpriseEventGeneration.ts`

Kept active-event runtime/persistence/send flow in main.

Validation:
- full suite 580/580 PASS
- main ~371.10 kB / 128.96 gzip
- new cold chunk ~40.35 / 17.91 gzip
- index ~9,500 lines

Compared with pre-split main ~383.18 / 133.42 gzip:
- ~12.08 kB raw startup reduction
- ~4.46 kB gzip startup reduction

### 94ea846 Lazy-load character photo proposal generation
New cold feature:
- `features/characterPhotoProposalGeneration.ts`

Moved only photo-request draft generation:
- large photo proposal system prompt
- JSON + legacy XML parser
- model route/retry
- local draft fallback

Kept shared synchronous card helpers hot:
- `buildCharacterPhotoPrompt`
- image-model selection/discovery
- prompt version switching
- seed/price
- photo card interaction/persistence

Validation:
- full suite 584/584 PASS
- main ~361.90 kB / 126.04 gzip
- photo cold chunk ~10.54 / 4.55 gzip
- index ~9,309 lines

Incremental reduction from previous:
- ~9.20 kB raw
- ~2.92 kB gzip

### eb1f7ac Keep auto-memory payload cold
Kept cheap threshold gates and manager orchestration in main.

Moved into already-lazy `autoMemory.ts`:
- room memory JSON schema
- persona memory JSON schema
- room extractor long system prompt builder
- persona extractor long system prompt builder

Evidence selection/source IDs/checkpoints/apply/rollback remain in main.

Validation:
- full suite 585/585 PASS
- main ~356.18 kB / 124.38 gzip
- autoMemory cold chunk ~9.82 / 3.38 gzip
- index ~9,166 lines

Incremental reduction:
- ~5.72 kB raw
- ~1.66 kB gzip

## Cumulative startup result
From Jev-collapsed checkpoint:
- main ~383.18 -> 356.18 kB
- gzip ~133.42 -> 124.38 kB
- cumulative reduction ~27.0 kB raw / ~9.04 kB gzip

## Guardrails
Do not extract purely for line count.
Avoid hot:
- sendMessage/getResponse
- ordinary Group/single generation
- strict review/Gemma/Jev
- memory evidence/checkpoint/persistence
- wardrobe/scene
- relationship continuity
- request lifecycle/cancellation
- synchronous message/card renderers
- initial persona-list rendering

Prefer explicit-user-action or threshold-gated large code paths with measurable main-bundle reduction.

No deployment.
