# AIGF Memory V5 Local Diagnostics — 2026-09-29

## Branch / runtime
- Branch: `perf/cleanup-send-latency-20260923`
- Runtime code HEAD: `c12b266 Add local Memory V5 diagnostics`
- Recall hardening remains `cb114cc Harden message recall rollback`
- Memory V5 core remains `1c0f51a Upgrade long-term memory retrieval to V5`

## Purpose
Memory V5 retrieval had improved indexing and deep recall, but real-user failures would still be hard to diagnose without seeing:
- checkpoint progress
- session-only memory state
- persisted search-tag coverage
- which memories the production selector would actually choose for a query

The diagnostics are deliberately inside the existing lazy Room Memory UI.
Normal chat startup and send paths do not load this UI.

## UI
Inside `soul.md / memory.md` modal, the memory.md tab now includes a collapsed:

`Memory V5 診斷（本地，不會呼叫 AI）`

It shows:
- auto-memory checkpoint: processed / total user turns
- turns remaining until next automatic extraction
- current session-only memory count
- number of memory entries with persisted V5 search tags
- current session-only summaries + known_by targets
- latest five memory.md index entries with source counts + tags

## Local recall simulator
The panel includes a text input:
`測試召回，例如：你記唔記得沖繩嗰次？`

Pressing "模擬召回":
- makes NO AI/network request
- reuses production `isDeepMemoryRecallQuery`
- reuses production `getMemoryRecallLimit`
- reuses production `selectRelevantMemories`
- reuses production `scoreMemoryForQuery`

Results show:
- whether Deep Recall is ON/OFF
- selected soul.md
- selected private memory.md
- selected room-wide memory.md for Group
- score
- importance
- source count
- stored search tags

Group quotas match production:
- present: soul 8 / private 7
- deep recall present: soul 12 / private 14
- absent private remains 0
- room-wide 8 / deep 14

Single quotas match production:
- soul 12 / deep 16
- memory 12 / deep 24

## Privacy / safety
- Diagnostics are collapsed by default.
- They appear only after the user explicitly opens the memory editor.
- No model call, fetch, OpenRouter, Venice or API route is used.
- Source message IDs are not printed directly in the visible text; they are available as title/hover metadata on relevant rows.

## Validation
- Room Memory diagnostics targeted: 3/3 PASS
- Full suite: 641/641 PASS
- build PASS
- typecheck PASS
- git diff --check PASS

Bundle:
- main JS ~359.50 kB / 125.67 kB gzip
- roomMemoryUi remains cold; grew to ~13.81 kB / 5.28 kB gzip
- normal startup does not pay for diagnostics

## How to use for future memory reports
If a character fails to remember something:
1. open 靈魂與重要記憶
2. switch to memory.md
3. expand Memory V5 診斷
4. paste the same recall phrase into 模擬召回
5. inspect whether the expected memory is selected and whether Deep Recall is ON
6. if it is selected but the character still misses it, the fault is downstream prompt/model behavior
7. if it is not selected, the fault is indexing/ranking/storage and can be fixed without guessing

## Mandatory
- GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.
