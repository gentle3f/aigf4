# AIGF Handoff — Jev Persistence, Dead-File Cleanup, Next: index.tsx Decomposition
Date: 2026-09-27
Branch: `perf/cleanup-send-latency-20260923`
Current HEAD before this handoff commit: `d06b102c0d10f0640525849cad721d4684ecec02`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do **not** use Codex quota.
Do **not** use Remote Desktop Commander unless the user explicitly asks for it.
Do not use GitHub Actions for heavy work.
Keep production changes conservative, tested, reversible, and separated into small commits.

## What the user wants
The current roadmap is:
1. Fix Jev shadow so safe metadata survives refresh / browser restart.
2. Remove clearly old / unused files.
3. Then do the larger `index.tsx` decomposition / architecture cleanup.
4. The decomposition is not cosmetic: the user wants a genuinely lighter app, eventually using feature boundaries + lazy loading / code splitting to reduce startup JS and work done on the main screen.

The user mostly uses **Group chat**, so preserve Group behavior and continuity carefully.
Do not alter chat methodology, memory semantics, wardrobe semantics, Jev authority, Gemma strict review authority, or response quality merely to make refactoring easier.

---

# Work completed

## A. Jev wardrobe production shadow already exists
Earlier production work:
- `9deca30` — Add Jev wardrobe production shadow trial.
- It reuses the existing `/api/openrouter-decisions` endpoint with the fixed profile `wardrobe-v4`; no extra serverless function.
- Browser cannot send arbitrary model / questions / prompt.
- Gemma remains 100% authoritative.
- No Jev threshold, no Jev routing, no skip-Gemma behavior.

The wardrobe V4 shadow is observational only.

## B. Jev local report tool
Earlier local-only tooling:
- `6114e80` — Add Jev wardrobe shadow report tool.
- Command:
  `npm.cmd run jev:shadow-report -- <jev-shadow-export.json>`
- It summarizes paired production-vs-wardrobe-v4 scores, Gemma wardrobe issue / no issue groups, keep/revise, mode, latency/cost, and flags suspicious private-looking fields.
- It handles Windows UTF-8 BOM exports.

## C. Chat-room opening lag fixed and deployed
Commit:
- `01fe405631b001772011f1dfb8a5543da8f11594` — Window chat history rendering.

What changed:
- Opening a room no longer renders the whole history into the DOM.
- Initial render: newest 80 messages.
- Older history prepends in batches of 60 when scrolling upward / using the load-older control.
- Full history remains in memory/storage; AI continuity/history is not deleted.
- Search expands the history before searching, preserving search behavior.
- Group and normal chat both use the windowed rendering path.

User tested a long Group room and explicitly reported it is **much faster**.

Production deployment for this commit:
- Vercel deployment: `dpl_7n3MWzYBb7Sm8VC9G1i7SA9z7iK2`
- Aliases include `https://wetapp.madproduction.ai`
- Deployment was READY and root returned HTTP 200.
- No runtime error/warning/fatal logs were seen immediately after deploy.

## D. Jev safe metadata persistence completed locally
Commit:
- `938dff2` — Persist safe Jev shadow metadata.

Purpose:
The user lost an entire Jev shadow sample after refreshing. Group usage makes 50–80 uninterrupted turns unrealistic, so safe Jev metadata now persists locally.

Implementation:
- New file: `engine/review/jevShadowStorage.ts`
- localStorage key: `wetappJevShadowMetadataV1`
- Maximum persisted records: **200**
- Storage is best-effort only; persistence failure must never affect chat/review.
- `jevShadow.ts` hydrates persisted records once, then maintains the bounded collector.
- Updates after production Jev result / wardrobe trial result / Gemma decision are persisted.
- Existing Clear action now clears memory + local persisted metadata.

Privacy / safety boundary:
Only the existing closed Jev metadata schema is persisted:
- taxonomy version
- request ID
- mode / Cc flag
- status / safe reason/network codes
- latency / served model
- 14 numeric signals
- token/cost metadata
- fixed wardrobe-v4 trial metadata
- Gemma keep/revise/unavailable
- sanitized closed Gemma issue codes

The persistence sanitizer reconstructs records from an allowlisted schema. It does **not** retain:
- latestUserText
- candidateText
- recentHistoryText
- personaEvidence
- prompt / raw model response
- authorization / API key
- raw state
- arbitrary unknown fields

Storage tests added:
- `tests/jevShadowStorage.test.ts`
- verifies reload semantics with metadata only
- verifies private-looking fields do not survive serialization
- verifies newest-200 bound
- verifies malformed/corrupt records are rejected
- verifies Clear removes persisted storage

Jev diagnostics copy/export is still metadata-only.

Important: `938dff2` is committed locally but was **not deployed** as of this handoff.

## E. First safe dead-file cleanup completed locally
Commit:
- `d06b102` — Remove unused legacy AI files.

Deleted only files proven unreferenced:
- `aiHorde.ts` — 309 lines
- `aiTools.tsx` — 114 lines
- `interests.ts` — empty
- `story.ts` — empty

Total removed: 423 lines.

A repo search found no remaining references to those names after deletion.
Do not interpret this as a license to mass-delete anything named old/tmp/legacy. Any further cleanup must be evidence-based: reference/import search + tests + build.

Important: `d06b102` is committed locally but was **not deployed** as of this handoff.

---

# Current validation state
At HEAD `d06b102`, after the persistence + dead-file cleanup commits:

- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **330 / 330 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree — clean

Current build still warns that main chunk is too large:
- main JS about **924.96 kB minified**
- about **307.32 kB gzip**
- Vite warns about chunks over 500 kB

Current `index.tsx` is about **16,616 lines**.

This is why the next large task is still necessary.

---

# Production vs local HEAD
Production currently corresponds to:
- `01fe405` (windowed chat history rendering)

Local HEAD is ahead with:
- `938dff2` Jev persistence
- `d06b102` safe unused-file cleanup

Therefore the next chat must **not assume Jev persistence is live yet**.
Before starting the big `index.tsx` split, first deploy current HEAD once and smoke-test:
1. Open Jev Shadow and confirm existing/new records appear.
2. Reload the page.
3. Confirm records survive reload.
4. Confirm Copy JSON remains metadata-only.
5. Use Clear and confirm records remain cleared after another reload.
6. Make sure Group chat still opens quickly after the history-window fix.

Use exactly one manual Vercel production deployment after local prechecks:
`vercel.cmd --prod --yes`
Do not push extra deployments.

---

# Next major task: decompose index.tsx

## Why
The goal is not merely to split one giant file into smaller files.
A cosmetic split alone does not make the app lighter.

The desired outcome is:
- clearer feature/runtime boundaries
- safer changes
- fewer unrelated side effects when opening a screen
- eventual lazy loading / code splitting for cold features
- materially smaller initial/main JS
- preserve behavior in hot chat paths

## Objective metrics
Baseline:
- `index.tsx`: ~16,616 lines
- main JS: ~924.96 kB minified / ~307.32 kB gzip

Longer-term target discussed with user:
- get `index.tsx` below ~10,000 lines as a first meaningful milestone
- get main JS below ~500 kB minified, not just move code between files

If line count drops but bundle size/startup behavior does not improve, that is only code cleanup, not completion of the “lighter app” goal.

## Recommended decomposition order
Start with cold / low-risk UI features, not the chat generation core.

Good early candidates:
1. Jev diagnostics UI
2. Cloud backup / live cloud UI
3. Image Studio / Video Studio UI
4. Public identity search UI
5. Persona editor / memory editor
6. Room-management/admin UI

Where practical, move cold features behind `dynamic import()` so they are not in the initial bundle.

Keep these hot paths behavior-frozen until later:
- send flow
- Group generation
- Cc route
- memory / retrieval
- wardrobe
- strict review / Gemma
- Jev production shadow
- relationship / continuity state

## Process for each extraction
For every module:
1. Identify exact functions + DOM dependencies.
2. Add characterization tests first if behavior is not already covered.
3. Extract without changing behavior.
4. Run targeted tests.
5. Run typecheck.
6. Run full tests.
7. Run production build.
8. Compare bundle sizes.
9. Commit one logical extraction at a time.
10. Do not mix mass file deletion and index refactoring in one commit.

Prefer dependency injection / small explicit interfaces over importing the entire global state into each new module.

---

# Important architectural context
The chat/review engine has already been partially separated from `index.tsx`.
Existing useful modules include:
- `engine/contracts.ts`
- `engine/singleTurnAdapter.ts`
- `engine/groupTurnAdapter.ts`
- `engine/reviewApplication.ts`
- `engine/review/reviewPipeline.ts`
- `engine/review/reviewRequestBuilder.ts`
- `engine/review/reviewResultParser.ts`
- `engine/review/reviewAttemptExecutor.ts`
- `engine/review/reviewAttemptCoordinator.ts`
- `engine/review/reviewState.ts`
- `engine/review/groupCandidateSerialization.ts`
- `engine/observability/generationTrace.ts`
- Jev provider/shadow/diagnostics/storage modules

Do not undo these seams.

---

# Jev research status / do not restart
Do not restart the Jev synthetic research programme.

Current conclusion:
- wardrobe V4 wording showed a useful effect on unestablished clothing false-positive-like scores, but true-conflict signal can drop somewhat.
- production shadow is being used to gather real evidence before any routing decision.
- group-narration V4 promotion was stopped because production-shaped evidence was not good enough.
- no Jev threshold or skip-Gemma policy is approved.

Eventually, only if production evidence is strong enough, the intended architecture may be:
- confidently clean Jev -> possibly skip Gemma
- suspicious/uncertain -> Gemma
But this is **not implemented** and must not be introduced during architecture refactoring.

---

# Git / deployment discipline
- Work on `perf/cleanup-send-latency-20260923`.
- Use GEN-FUJI Local MCP only.
- No Codex.
- No Remote Desktop Commander.
- No GitHub Actions for this work.
- Do not expose secrets or `.env.local`.
- Do not change production env variables.
- One logical commit per task.
- Only one manual Vercel production deployment when explicitly moving a tested commit to prod.
- Verify deployment READY + `wetapp.madproduction.ai` HTTP 200.
- Keep rollback easy.

---

# Immediate next action for the new chat
1. Read this handoff and `AI_STATE/LATEST_HANDOFF.md`.
2. Verify branch / HEAD / clean worktree.
3. Re-run fast predeploy validation if needed.
4. Deploy current HEAD once so Jev persistence + dead-file cleanup become live.
5. Smoke-test Jev persistence across reload + Clear.
6. Then start the first low-risk `index.tsx` extraction, preferably Jev diagnostics UI or another cold feature, with tests and bundle-size measurement.
