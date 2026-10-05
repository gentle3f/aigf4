# AIGF Performance Diagnostics Export Handoff — 2026-09-29 13:53 HKT

## Mandatory local-work rules
- Use GEN-FUJI Local MCP for all local repo/file/shell/Git work.
- Do NOT use Remote Desktop Commander.
- Do NOT use Codex quota.
- Inspect actual HEAD/worktree before any new work because auto mode may advance.

## Repo
- Path: `C:\Users\FUJITSU\Documents\My books\aigf4`
- Branch: `perf/cleanup-send-latency-20260923`
- Runtime code commit: `977bd7b58aa073246229da5bf7fed79c05d87b2e`
- Commit: `977bd7b Add mobile performance diagnostics export`
- Worktree was clean immediately after the code commit and deployment.
- Branch remains intentionally ahead of origin; do not assume remote is authoritative.

## Why this change
The previous measured-latency handoff explicitly stopped local micro-optimization because the remaining local critical path was already small. The next latency decision requires real production timing across multiple Single and Group turns.

Before this change, timing was only practical through:
- `?perf` / `wetappPerfEnabled=1`
- DevTools `window.__aigf4Perf`

That is awkward on mobile and makes production evidence collection unnecessarily difficult.

## New user-facing diagnostics
A new lazy-loaded More Options item now exists:
- `Performance 診斷`

It can:
- start/stop timing capture without DevTools
- show completed vs actual generated turns
- show generated-turn averages for:
  - total
  - observed network
  - local-before-request
  - post-network-to-render
- show per-turn mode and timing table
- copy JSON
- use mobile Web Share when supported
- otherwise download JSON
- clear timing records

Privacy / scope:
- timing and event labels only
- no prompt text
- no user message text
- no assistant reply text
- no room/persona/history reads
- at most the existing 24 completed in-memory turns
- timing data still clears on page reload
- if URL contains `?perf`, the URL continues to force timing on even after pressing Stop; the UI explains this

Important averaging fix:
- headline averages count only turns with a real generation request
- early terminal flows such as memory proposal/photo intent do not dilute network averages with artificial zeroes

## Architecture
Hot recorder:
- `chatPerformance.ts`
- added only narrow snapshot / enable-disable / clear APIs
- existing production instrumentation and summary lazy import remain unchanged

Cold UI:
- `features/chatPerformanceDiagnostics.ts`
- loaded only from explicit More Options action
- directly imports `chatPerformanceSummary.ts` inside the cold chunk
- does not own chat generation, persistence, memory, Group scene, review, Jev, or photo logic

Menu seam:
- `index.tsx` dynamically imports the diagnostics feature
- no static diagnostics import was added

Tests:
- `tests/chatPerformanceDiagnosticsFeature.test.ts`

## Validation
Targeted diagnostics + summary:
- 7 / 7 PASS

Full suite:
- 644 / 644 PASS

Also:
- typecheck PASS
- production build PASS
- `git diff --check` PASS

Final local build:
- main JS: ~360.31 kB / 125.89 kB gzip
- Performance diagnostics cold chunk: ~5.17 kB / 2.32 kB gzip
- summary chunk remains cold: ~1.78 kB / 0.63 kB gzip

The main increase is small and comes from the narrow diagnostics state-control seam; the UI/export implementation itself is cold.

## Production
Deployed exactly once after validation.

Deployment:
- ID: `dpl_AKBNK6A7RneiKy1TAp4SBTwv5pkD`
- URL: `https://aigf4-fkiugkywm-gens-projects-4f99f8b9.vercel.app`
- target: production
- status: READY
- runtime code commit deployed: `977bd7b58aa073246229da5bf7fed79c05d87b2e`

Aliases confirmed:
- `https://aigf4.vercel.app`
- `https://wetapp.madproduction.ai`

Production smoke:
- `https://wetapp.madproduction.ai` -> HTTP 200
- current main bundle fetched successfully
- bundle contains `Performance 診斷`
- bundle contains lazy `chatPerformanceDiagnostics` chunk reference

## What to do with real evidence
High-value real test now:
1. More Options -> Performance 診斷
2. press 開始記錄
3. use normal Single chat for several generated replies
4. use Group chat for several generated replies
5. reopen Performance 診斷
6. 分享 / 下載 JSON

Use that JSON before deciding any new latency optimization. In particular compare:
- generationRequestMs
- strictReviewRequestMs
- repair/fallback counts
- localBeforeRequestMs
- postNetworkToRenderMs

Do not change model routes, strict review, prompt/history semantics, Group parser, or persistence architecture merely from localhost timings.

## Existing completed areas — do not redo
Still completed and authoritative from the previous handoff:
- Memory V5 core
- Memory V5 local diagnostics
- message-recall hardening
- character-photo live continuity
- NSFW-aware photo fallback ladder
- Group transport leak cleanup
- mobile Jev JSON export
- reply scroll fix

## Next engineering rule
Prioritize a real user-reported failure immediately if one is reported.

If there is no user-facing failure:
- use exported production timing evidence for the next performance decision
- otherwise prefer a concrete reliability/product seam
- do not resume blind `index.tsx` decomposition
- do not increase ordinary memory quotas without evidence
- Jev remains shadow-only; Gemma remains authoritative
