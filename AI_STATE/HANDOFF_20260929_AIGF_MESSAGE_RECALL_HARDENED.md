# AIGF Message Recall Hardened — 2026-09-29

## Branch / runtime
- Branch: `perf/cleanup-send-latency-20260923`
- Runtime code HEAD: `cb114cc Harden message recall rollback`
- Memory V5 remains `1c0f51a Upgrade long-term memory retrieval to V5`
- Photo fallback remains `da03693 Add NSFW-aware photo fallback ladder`

## User report
The user tried the existing "收回訊息" action and it failed.

## Root reliability problems found
The old recall path could enter a half-success state:
1. chat history turn was removed first
2. Group derived-memory cleanup used synchronous `updateRoom()`
3. scene rollback used a second independent synchronous `updateRoom()`
4. any room/localStorage failure could throw after history removal but before UI rerender
5. the outer wrapper only logged the failure to console, so the UI could appear to do nothing

Additional consistency gaps:
- sourced permanent `soul.md` entries were not removed, only episodic memory.md
- session-only memories did not retain source message IDs, so recalled facts could remain in temporary memory
- character-photo work was not explicitly aborted by recall
- confirmation text did not explain that derived memory/scene effects would be undone

## Fix in cb114cc

### 1. Group recall is one atomic live rollback
`RoomManager.removeMemoriesBySourceMessageIds()` now:
- removes sourced shared soul/memory
- removes sourced per-member soul/memory
- removes sourced embedded persona soul/memory
- restores exact `roomSceneBeforeTurn`, including the original reality epoch
- rewinds memory summary checkpoint
- updates live room state immediately
- schedules deferred persistence instead of doing two synchronous `updateRoom()` writes

Existing deferred persistence recovery protects quota/storage failure:
- if localStorage flush fails, live rollback remains visible
- IndexedDB room recovery stores the recalled state
- reload can restore the recalled scene/memory state

### 2. Persona recall removes all sourced long-term memory
`removePersonaMemoriesBySourceMessageIds()` now removes both:
- `soul.md`
- `memory.md`

The summary checkpoint is rewound as before.

### 3. Session-only memory is source-aware
Session memory entries now optionally store:
- `sourceMessageIds`

Manual "只限本次" memory records the source user-message ID.

Recall removes the source from session memory.
If an identical session-memory fact was supported by multiple source turns, recalling only one source preserves the remaining source.

### 4. Active media work is cancelled
Recall now aborts an in-flight character-photo request before removing the turn.

### 5. UI always reports true action failure
The top-level recall wrapper now surfaces a visible retry message if the lazy action itself throws.
A missing message also produces a visible alert instead of silently returning.

### 6. Confirmation is explicit
The confirmation now states that recall also removes:
- the turn reply
- derived memories
- derived scene changes

The message menu subtitle now says:
`同時撤回回覆與衍生記憶`

## Validation
Targeted recall/storage/session/persona suite:
- 49 / 49 PASS

Full suite:
- 640 / 640 PASS

Also:
- production build PASS
- typecheck PASS
- git diff --check PASS
- main JS ~359.45 kB raw / 125.66 kB gzip
- conversationActions remains cold (~7.56 kB / 3.06 kB gzip)

New tests prove:
- only the recalled turn is removed
- sourced permanent and episodic persona memories are removed
- sourced session-only memory is removed
- duplicate session-only memory survives if another source still supports it
- Group sourced soul/memory is removed
- exact pre-turn scene and reality epoch are restored
- quota failure keeps live recall state and stores it in IndexedDB recovery
- reload restores recalled room state after primary storage failure

## Mandatory
- GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.
