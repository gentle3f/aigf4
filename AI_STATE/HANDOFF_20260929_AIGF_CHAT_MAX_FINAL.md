# AIGF Chat-Max Final Handoff — 2026-09-29 13:15 HKT

## Mandatory local-work rules
- Use GEN-FUJI Local MCP for all local repo/file/shell/Git work.
- Do NOT use Remote Desktop Commander except emergency fallback.
- Do NOT use Codex quota.
- Do not blindly redo completed work; inspect actual HEAD/worktree first.

## Repo
- Path: `C:\Users\FUJITSU\Documents\My books\aigf4`
- Branch: `perf/cleanup-send-latency-20260923`
- Actual HEAD at handoff: `b8888fb5f0608c2f83b82202589d26d7a8098570`
- Commit: `b8888fb Update Memory V5 diagnostics handoff`
- Worktree: clean
- Branch is ahead of origin; do not assume remote branch is authoritative.

## Latest production
Latest production deployment:
- Deployment ID: `dpl_AAKft6QSEdGzgGxhnuVgjd2YWEst`
- Deployment URL: `https://aigf4-1ix0fulvw-gens-projects-4f99f8b9.vercel.app`
- Commit SHA: `b8888fb5f0608c2f83b82202589d26d7a8098570`
- State: READY
- Target: production

Production aliases include:
- `https://aigf4.vercel.app`
- `https://wetapp.madproduction.ai`

## Completed in this chat

### 1. Character photo continuity + reliability
Completed and deployed.
Key commits:
- `461004e Prioritize live photo continuity`
- `da03693 Add NSFW-aware photo fallback ladder`

Policy:
- recent completed dialogue/narration is PRIMARY photo continuity evidence
- room.scene is SECONDARY baseline only
- no stale emergency room-scene proposal fallback
- invalid near-black/blank images are rejected before save
- max 3-model fallback ladder
- only first model may get one same-model retry for clear transient/capacity failure
- black/blank or provider/model error advances to next model automatically

NSFW priority:
- NSFW edit: qwen-edit-uncensored first
- NSFW generate: lustify-v8 then lustify-v7
- real safe-content upstream smoke confirmed both qwen-edit-uncensored and lustify-v8 return valid non-black images

### 2. Memory V5 core
Completed and deployed.
Runtime commit:
- `1c0f51a Upgrade long-term memory retrieval to V5`

Authoritative core handoff:
- `AI_STATE/HANDOFF_20260929_AIGF_MEMORY_V5_DEEP_RECALL.md`

V5 includes:
- compact semantic `searchTags`
- no extra per-turn AI/model call
- ordinary recall quotas unchanged
- explicit past-reference cues activate deeper recall
- vague `記唔記得上次？` can retrieve nearest genuinely older turns
- specific unmatched topic returns no unrelated archive excerpts
- Group absent-member private memory remains 0
- V4 authority semantics preserved: session-only vs memory.md vs user-confirmed permanent soul.md

### 3. Message recall / 收回訊息 hardening
User reported the existing recall feature failed. Fixed and deployed.

Runtime commit:
- `cb114cc Harden message recall rollback`

Authoritative handoff:
- `AI_STATE/HANDOFF_20260929_AIGF_MESSAGE_RECALL_HARDENED.md`

Recall now:
- removes recalled user turn + same-turn reply/system content
- removes sourced persona soul.md + memory.md
- removes sourced session-only memory
- Group rollback removes sourced soul/memory and restores exact pre-turn scene/reality epoch in ONE live mutation
- Group rollback uses deferred persistence + IndexedDB recovery so localStorage quota failure does not leave the UI half-finished
- aborts active character-photo request
- media cleanup remains best-effort
- visible error instead of console-only failure
- confirmation text explicitly says derived memory/scene effects are undone

Validation at that checkpoint:
- targeted recall suite 49/49 PASS
- full suite 640/640 PASS
- build/typecheck/diff PASS

### 4. Memory V5 local diagnostics
Auto continuation completed this after recall hardening.
Runtime code commit:
- `c12b266 Add local Memory V5 diagnostics`
Handoff commit:
- `b8888fb Update Memory V5 diagnostics handoff`

Authoritative diagnostics handoff:
- `AI_STATE/HANDOFF_20260929_AIGF_MEMORY_V5_DIAGNOSTICS.md`

Inside existing soul.md / memory.md modal, memory.md now has collapsed:
- `Memory V5 診斷（本地，不會呼叫 AI）`

It shows:
- auto-memory processed/total user turns
- turns until next automatic extraction
- current session-only count
- persisted V5 search-tag coverage
- session-only summaries + known_by
- latest 5 memory.md index entries with source counts + tags

Local recall simulator:
- no AI/network call
- reuses production `isDeepMemoryRecallQuery`
- reuses production `getMemoryRecallLimit`
- reuses production `selectRelevantMemories`
- reuses production `scoreMemoryForQuery`
- shows selected memories, scores, sources and tags
- Group production privacy quotas are preserved

Validation:
- diagnostics targeted 3/3 PASS
- full suite 641/641 PASS
- build/typecheck/diff PASS
- main JS ~359.50 kB / 125.67 kB gzip
- diagnostics stay in cold/lazy roomMemoryUi chunk

## Latest production verification
Latest Vercel deployment list confirms `b8888fb` is the newest READY production deployment.

A previous post-deploy runtime scan showed one Node `url.parse()` deprecation warning on `/api/venice-image-models`, attributed to an older deployment. It was not a new recall/memory runtime error. Treat separately if it becomes worth cleaning up.

## What the user should test next
High-value real-user validation:
1. 收回訊息
   - ordinary single chat
   - Group turn that changed scene
   - a turn that had created memory
   Expected: turn + reply disappear; derived memory/scene effects are undone; draft is restored.

2. Character take-photo
   - establish a concrete action in recent dialogue, then ask character to take a photo
   - verify prompt/photo reflects latest action, not stale room summary
   - if an image model returns black/blank, app should auto-fallback instead of immediately asking for manual retry

3. Memory V5
   - open memory.md -> Memory V5 診斷
   - paste the exact recall phrase into 模擬召回
   - if expected memory is selected but character misses it: downstream prompt/model issue
   - if expected memory is not selected: indexing/ranking/storage issue

## Next engineering direction
Do NOT resume blind index.tsx decomposition.
Do NOT increase ordinary memory quotas without evidence.

Best next work depends on real-user test evidence:
- if recall fails: inspect exact production failure path
- if photo still fails: inspect actual successful/failed model ladder diagnostics
- if memory recall fails: use Memory V5 local simulator to isolate retrieval vs downstream model behavior
- if no user-facing failure is found, continue with measured product/performance work rather than architecture-for-line-count

## Jev
Jev remains shadow-only.
Do not let Jev change or skip Gemma until enough real production Group cohort exists.
Earlier plan: collect ~60 normal Group replies and export fresh Jev Shadow JSON for first V2 real-production checkpoint.

## Stop condition for this chat
No new feature work after this handoff.
New chat must start by reading:
1. `AI_STATE/LATEST_HANDOFF.md`
2. `AI_STATE/HANDOFF_20260929_AIGF_CHAT_MAX_FINAL.md`
3. the specific linked subsystem handoff needed for the next task
