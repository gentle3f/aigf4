# AIGF 351 kB Cold-Split Checkpoint — 2026-09-29

## Branch / code HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- Code HEAD: `31e702e Keep Experience Draft generation cold`
- Worktree was clean immediately after the code commit.
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.
- Do not deploy the main work branch automatically.

## Jev / review authority
Previous detailed Jev handoff:
- `AI_STATE/HANDOFF_20260929_AIGF_JEV_GROUP_GATE_V2_COLLAPSED.md`

Still unchanged:
- Jev is shadow-only.
- Gemma remains 100% authoritative.
- No threshold is approved.
- No skip-Gemma behavior is approved.

## Cold-split sequence after Jev collapse

### 07b45b3 — Lazy-load Surprise Event generation
Moved heavy Surprise Event authoring prompt / validation / fallback into:
- `features/surpriseEventGeneration.ts`

Kept active-event runtime, persistence and send path in main.

### 94ea846 — Lazy-load character photo proposal generation
Moved photo-request draft generation into:
- `features/characterPhotoProposalGeneration.ts`

Kept shared synchronous photo-card prompt helpers, image model selection, seed/price and card interaction in main.

### eb1f7ac — Keep auto-memory payload cold
Moved long room/persona auto-memory schemas and extractor prompt builders into already-lazy:
- `autoMemory.ts`

Kept threshold gates, evidence/source-ID construction, checkpoints, apply/rollback and persistence in main.

### 2fcf3d3 — Lazy-load God Mode generation
New cold module:
- `features/godModeGeneration.ts`

Moved:
- God Mode system prompt
- fixed primary/fallback model loop
- PERSONA_UPDATE parsing / validation
- generation settings

Kept:
- God history ownership
- persona merge
- room/persona persistence
- render
- request lifecycle

Validation at this point:
- full suite 589/589 PASS
- main ~354.59 kB / 123.97 kB gzip
- God cold chunk ~2.10 / 1.20 gzip

### b4c9304 — Keep observed NPC analysis cold
Extended existing cold module:
- `observedNpcPersona.ts`

Moved:
- observed-NPC analysis system prompt
- JSON schema
- strict-review route model loop
- sampling settings / 20s timeout
- parser + fallback remain in the same cold module

Kept:
- live evidence assembly
- model-route choice
- transport adapter
- NPC promotion / room mutation / persistence

Validation:
- full suite 590/590 PASS
- main ~352.19 kB / 123.03 kB gzip
- observedNpcPersona cold chunk ~6.86 / 3.52 gzip

### 31e702e — Keep Experience Draft generation cold
Extended existing:
- `features/chatExperienceUi.ts`

Moved:
- “幫我接戲” system prompt
- “導演一下” rewrite instruction
- model request assembly
- suggestion JSON parsing

Kept in main:
- dialog lifecycle
- request ownership / cancellation
- Group rewrite parsing
- apply-version validation
- chat-history persistence

Validation:
- full suite 592/592 PASS
- build PASS
- typecheck PASS
- diff check PASS
- main ~351.34 kB / 122.60 kB gzip
- chatExperienceUi cold chunk ~3.45 / 1.92 gzip
- `index.tsx` 9,046 lines

## Cumulative startup result
From the Jev-collapsed checkpoint:
- main ~383.18 -> 351.34 kB
- gzip ~133.42 -> 122.60 kB
- reduction ~31.84 kB raw
- reduction ~10.82 kB gzip

The reduction is real chunk movement, not line-count-only extraction.

## Current decomposition stop condition
Latest function-size audit shows the remaining largest blocks are mainly:
- `runConversationGeneration` — hot
- `runRoomConversationGeneration` — hot
- `getResponse` / `sendMessage` — hot request lifecycle
- `appendMessage` / message-card renderers — synchronous render path
- `strictReviewSingleReply` / `strictReviewGroupReply` — hot review
- memory summarization gates / persistence
- photo approval / NPC room mutation — explicit but persistence-heavy
- `openExperienceDraft` remainder — mostly dialog/persistence orchestration after generation was moved cold

Do not continue splitting these merely to reduce `index.tsx` or main bytes.

## Recommended next direction
Before another decomposition pass, shift to one of:
1. Measure actual browser startup / interaction timings and identify a demonstrated runtime bottleneck.
2. Address a concrete product/behavior bug reported by the user.
3. If Jev production collection is explicitly requested, prepare the isolated Group V2 shadow release path without changing authority.
4. Only resume cold splitting when a clearly low-frequency, low-ownership seam is found with measurable bundle/runtime benefit.

No deployment has been performed.
