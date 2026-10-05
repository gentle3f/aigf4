# AIGF Memory V5 — Deep Recall + Search Index — 2026-09-29

## Branch / runtime code
- Branch: `perf/cleanup-send-latency-20260923`
- Runtime code HEAD: `1c0f51a Upgrade long-term memory retrieval to V5`
- Photo reliability code remains `da03693 Add NSFW-aware photo fallback ladder`
- Memory V4 base remains `63f1d68 Stabilize explicit and auto memory policy`

## V4 semantics preserved
V5 does NOT change user authority over memory scope:
1. Recent chat history = working memory
2. Session-only ledger = explicit temporary memory for current loaded browser session only
3. `memory.md` = auto-extracted durable episodic memory
4. `soul.md` = permanent/pinned only after explicit user confirmation

Manual session-only / declined memory turns remain firewalled from later auto-promotion.
Auto-memory still runs every 8 user turns and accepts only importance >=3.
Auto-memory still never promotes entries into `soul.md`.

## Why V5
V4 storage/consolidation was already stronger than it first appeared:
- persona auto memory merges duplicate/same-event entries across the full target list
- room auto memory similarly merges canonical memories and per-member perspectives
- duplicate merge already unions source IDs, raises importance, preserves unresolved state and keeps stronger/longer summaries

The remaining weak points were retrieval:
- matching relied mainly on literal title+summary terms
- explicit recall such as “記唔記得上次？” could return zero evidence when no topic keyword was present
- memory quotas were fixed even when the user explicitly asked to recall older history
- old verbatim recall was capped at 3 turns

## V5 search index
New module: `memoryIndex.ts`.

Every memory can now carry optional:
- `searchTags: string[]`

New auto-memory extraction asks the existing extractor call for 2–10 concise retrieval aliases covering:
- names
- places
- objects
- topics
- promises / preferences / boundaries
- useful Chinese / English wording

No additional model call is added.

Manual memories and legacy memories remain compatible:
- manual writes generate compact local tags automatically
- old entries with no persisted tags generate fallback tags at retrieval time
- no forced backfill or schema migration is required

Storage guard:
- normal persisted local index is capped around 12 tags per memory
- merged alias set capped around 14
- each tag capped at 60 chars

## Consolidation improvements
Existing same-event consolidation remains authoritative.

When duplicate/same-event memories merge:
- source IDs union
- search tags union
- importance takes max
- unresolved state is preserved
- scene continuity is preserved
- longer/better summary can replace shorter summary

Edited memories regenerate their local search index.

## Retrieval scoring
Memory ranking now considers:
- importance
- literal query match in title/summary
- search-tag alias match (higher retrieval weight)
- pinned/permanent status
- unresolved status
- recency

This lets a memory be found through an alias not literally present in its visible summary, e.g. a stored “旅行約定” can still be found via `Okinawa` if that alias was indexed.

## Deep recall
Explicit past-reference cues such as:
- 記得 / 記唔記得 / 仲記唔記得
- 上次 / 以前 / 之前 / 當時 / 那次 / 嗰次 / 曾經
- remember / last time / before / back then

activate deeper recall.

### One-to-one
Normal:
- soul: 12
- episodic memory: 12

Explicit deep recall:
- soul: up to 16
- episodic memory: up to 24

### Group
Normal present member:
- soul: 8
- private episodic: 7

Deep recall present member:
- soul: up to 12
- private episodic: up to 14

Absent member:
- normal soul 3 / deep soul 5
- private episodic remains 0 in BOTH modes

Room-wide episodic:
- normal 8
- deep 14

Therefore deep recall expands relevant memory without weakening the group memory firewall.

## Older verbatim evidence
Archived exact-turn retrieval still excludes the recent verbatim window already supplied to the model.

Normal explicit recall:
- up to 3 older exact turns

Deep recall budget:
- up to 6 older exact turns when matching a concrete topic

New vague-cue behavior:
- “你仲記唔記得上次？” with no meaningful topic terms retrieves the nearest 3 genuinely older turns instead of returning zero recall

Safety behavior:
- if the user names a concrete topic, e.g. “巴黎嗰次”, but no older evidence matches, V5 returns no unrelated archival excerpt instead of substituting random old history.

## Existing-memory context for extractor
The existing-memory excerpt passed into auto-memory now includes persisted search tags when available, improving semantic duplicate avoidance without increasing model-call count.

## Validation
Targeted memory/index/group/persistence:
- 77/77 PASS at the expanded targeted checkpoint
- additional retrieval-specific safety tests PASS

Full suite:
- 635/635 PASS

Also:
- production build PASS
- typecheck PASS
- git diff --check PASS

Build:
- main JS ~358.50 kB raw / 125.30 kB gzip
- autoMemory cold chunk ~10.64 kB / 3.57 kB gzip
- V5 adds no extra per-turn model request

## Photo reliability still in force
Production photo design remains:
- newest completed dialogue/narration is PRIMARY continuity evidence
- room.scene is SECONDARY
- no stale emergency room-scene proposal
- black/blank result automatically advances a bounded model ladder
- NSFW generation prioritizes lustify-v8 / lustify-v7
- NSFW edit prioritizes qwen-edit-uncensored
- validated result only is persisted

## Next recommended validation
Use real conversations to test:
1. ordinary recall where title/summary wording differs from the user’s later wording
2. “記唔記得上次？” after enough old history exists
3. very old named topic recall
4. Group recall where one absent member has private memories; those must remain unavailable

Do NOT increase ordinary per-turn quotas further without evidence. Storage can grow; prompt recall should stay selective.
