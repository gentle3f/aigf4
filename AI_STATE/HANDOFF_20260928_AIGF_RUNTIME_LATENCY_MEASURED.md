# AIGF Handoff — Measured Runtime Latency Stop Line

Date: 2026-09-28
Branch: perf/cleanup-send-latency-20260923
Code HEAD before this handoff-doc commit: 59e584c
Repo: C:\Users\FUJITSU\Documents\My books\aigf4

## Operating rule
Use GEN-FUJI Local MCP for all repo, shell, file and Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless explicitly requested.
Do not use GitHub Actions for heavy work.

## Latest validated state
- npm.cmd test: 422 / 422 PASS
- npm.cmd run typecheck: PASS
- npm.cmd run build: PASS
- git diff --check: PASS
- worktree clean after 59e584c
- main JS: 398.54 kB / 141.02 kB gzip
- perf summary cold chunk: 1.78 kB / 0.63 kB gzip
- Vite >500 kB warning remains gone

The main bundle is slightly larger than the old 395 kB stop line because this phase added runtime diagnostics and safe deferred room persistence. Do not resume blind bundle splitting just to recover a few kB.

## Runtime work completed

### 9f1e364 — Defer sidebar rebuild after reply paint
The full conversation/persona list no longer rebuilds synchronously before the new reply can paint.
It runs through double requestAnimationFrame with a stale-version guard.

### 7038b1a / dc06409 — Cold chat performance summaries
Raw timing remains minimal and hot.
Only perf mode dynamically loads chatPerformanceSummary.ts.

window.__aigf4Perf summaries now expose:
- totalMs
- localBeforeRequestMs
- requestStartElapsedMs
- promptBuildMs
- groupParseMs
- generationRequestMs
- strictReviewRequestMs
- networkObservedMs
- lastNetworkFinishElapsedMs
- groupScenePersistMs
- postNetworkToRenderMs
- requestToRenderMs
- responseCommitWorkMs
- storageObservedWorkMs
- repair/fallback/review counts

No prompt text or response text is stored in these summaries.

### c15f4ea — Fix chat performance turn lifecycle
Perf timing now starts only after basic send validation.
Rejected sends, early visible paths, aborts, auth errors, generic errors, God Mode paths and active-request cancellation all close the current timing turn.
This prevents one incomplete turn contaminating the next measurement.

### d5f77f6 — Skip NPC history scan without invite intent
Ordinary single-chat sends now run a cheap NPC-promotion intent test before reading recent history.
Explicit and pronoun invites still work.

### c470fc5 — Reuse established NPC request snapshot
beginChatRequest already scanned established NPCs for wardrobe state.
That result is now reused by single generation and merged with the newest user message instead of rescanning the same recent history.

Strict review deliberately keeps its own independent full rescan.

48-message isolated benchmark:
- full rescan: about 0.6905 ms/call
- cached merge: about 0.0168 ms/call
- saving: about 0.6736 ms/call
- about 41x faster for that operation
- output identical

### d8e0155 — Defer Group scene durability past reply paint
Measured Group problem:
accepted Group replies synchronously called RoomManager.updateRoom, which cloned/exported all rooms, LZString-compressed the full room archive, wrote localStorage and notified cloud change before the reply could render.

Before change:
- Group scene persistence critical cost: about 9 ms
- network complete to reply render: about 14–16 ms

New narrow path:
- RoomManager.updateRoomSceneDeferred updates the accepted live scene immediately in memory
- reality-epoch semantics are preserved
- durable writes coalesce
- visible browser waits through double requestAnimationFrame before compression/write
- Node/non-browser tests use timer fallback
- pagehide, hidden visibilitychange and beforeunload force a synchronous flush
- any later normal synchronous updateRoom also persists the newest pending scene
- ordinary/admin updateRoom remains synchronous and retains rollback semantics
- quota failure does not swallow the accepted live scene

After change:
- scene checkpoint synchronous work: about 1 ms
- network complete to reply render: about 6–7 ms

Tests cover immediate live-state update, deferred durability, reload, coalescing, quota failure, later synchronous mutation, double RAF, and page-exit flushing.

### 59e584c — Close photo proposal performance turns
Photo proposal success now records final persist/render timing, completes its perf turn and defers sidebar refresh.
Photo generation semantics are unchanged.

## Local measurement method
A temporary localhost harness was used outside the repo under:
C:\Users\FUJITSU\AppData\Local\Temp\aigf-perf\

It used:
- Vite dev with shell-only dummy localhost API base and dummy key
- localhost OpenAI-style mock responses
- about 180 ms generation delay
- about 120 ms strict-review delay
- Jev intentionally unavailable because shadow is observational
- isolated headless Chrome profiles
- Chrome DevTools Protocol through Node built-ins
- GEN-FUJI Local MCP only
- no RDC
- no real Venice key/password
- no external AI request

All temporary services were stopped:
- 4311 closed
- 4312 closed
- 9238 closed

## Measured single-chat results
Fresh yueji profiles with localhost mock.

Representative warm runs before the last micro-optimizations:
- total: about 363–369 ms
- local before request: 16–17 ms
- prompt build: about 4 ms
- mock network observed: 333–338 ms
- network complete to reply render: about 8 ms

One colder run:
- total 378 ms
- local before request 27 ms
- prompt build 5 ms
- mock network 338 ms
- post-network render 7 ms

After cheap NPC gate one fresh run:
- local before request 15 ms
- prompt build 3 ms

Conclusion:
single-chat local critical work is already very small. Do not rewrite prompt/history semantics for a few milliseconds.

## Measured Group results
Room: room_iu_jennie_irene_v1

Before deferred scene durability:
- local before request: 9–17 ms
- prompt build: about 4 ms
- Group parser: about 3 ms
- scene persistence: about 9 ms
- network complete to reply render: 14–16 ms

After deferred scene durability:
- local before request: 9–13 ms
- prompt build: about 3 ms
- Group parser: about 2–3 ms
- scene checkpoint synchronous work: about 1 ms
- network complete to reply render: 6–7 ms

The measured visible Group post-network critical segment improved by roughly 8–10 ms.

## Runtime stop line
Current measured local critical path is no longer a good target for speculative refactors.

Do not:
- weaken strict review based on localhost mock timings
- change model routes based on mock timings
- weaken prompt/history/memory/wardrobe semantics for tiny local gains
- restart bundle archaeology
- move Group parser/display/history behind new async boundaries

For real latency work, use the deployed app with ?perf or wetappPerfEnabled=1 and inspect window.__aigf4Perf.summaries across multiple real single and Group turns.

The next latency decision should be based on real:
- generation request time
- strict-review request time
- retries/fallbacks
- local-before-request
- post-network render

Without real production timing evidence, move to product/reliability work instead of further local latency micro-optimization.
