# AIGF Handoff — Reliability Recovery Hardened

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Code HEAD before this handoff-doc commit: `0410cea`
Repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless explicitly requested.
Do not use GitHub Actions for heavy work.

## Core behaviour that must not regress
Preserve:
- normal single-chat send / first reply latency
- Group generation/parser/display
- Cc independent route
- memory retrieval + auto-memory
- wardrobe / reality epoch
- strict review / Gemma / Jev shadow
- room/private continuity
- local/cloud backup
- private avatar persistence
- timeline branch / recall / conversation actions

## Latest validated state
- `npm.cmd test`: **444 / 444 PASS**
- `npm.cmd run typecheck`: PASS
- `npm.cmd run build`: PASS
- `git diff --check`: PASS
- worktree clean after `0410cea`
- main JS: **406.44 kB / 142.79 kB gzip**
- Vite >500 kB warning remains gone

The main bundle is intentionally larger than the old 395 kB stop line because reliability recovery logic now protects accepted data across quota/storage failures. Do not remove these protections merely to recover a few kB.

## Reliability work since measured-runtime handoff

### 44dd0fa — Recover deferred Group scenes after storage failure
Problem:
- accepted Group reply updated live scene in memory
- deferred localStorage write could fail (quota etc.)
- reload would otherwise restore the old scene

Fix:
- `roomRecoveryStore.ts` uses IndexedDB backup storage
- deferred Group scene failure saves encoded room snapshot + primary baseline
- startup `restoreRoomRecovery()` restores only when baseline is still valid
- successful primary persistence clears pending recovery
- visible warning tells user Group scene is on local backup
- newer durable primary data always wins over stale recovery

Tests cover:
- failure -> recovery snapshot
- reload -> latest accepted scene restored
- baseline mismatch -> stale recovery rejected
- startup restore order

### bec00b4 — Recover persona state after storage failure
Problems:
- persona/God Mode/preferences/memory/relationship updates changed memory first
- `customPersonas` localStorage failure could make UI look successful but reload lose changes
- built-in `relationshipState` was not included in modified-persona comparison, so it could disappear after reload even without a quota error

Fix:
- `personaRecoveryStore.ts` IndexedDB recovery
- failed persona persistence saves complete modified/custom overlay + baseline
- startup `restorePersonaRecovery()`
- built-in modified comparison now includes all durable Persona fields, notably:
  - relationshipState
  - conversationLabel
  - timelineBranch
  - name / emoji / gender
- custom persona deletion state is recoverable
- newer primary baseline always wins

### 8d5730e — Rollback partial room storage transactions
Problem:
- room data and deleted-room tombstones are two localStorage keys
- save/delete/import wrote rooms first, tombstones second
- second write failure could leave durable state half-committed while memory rolled back

Fix:
- room + deleted IDs use `persistRoomAndDeletedIdsAtomically()`
- previous durable room storage is restored if tombstone write fails
- cloud notification / successful-persist side effects happen only after both writes succeed

Tests cover:
- saveRoom tombstone failure
- deleteRoom tombstone failure
- importData tombstone failure

### 61097b6 — Make room avatar updates transactional
Fixes:
- room avatar blob update rolls back when room metadata persistence fails
- clearing/removing members/rooms cleans only room-owned blobs
- shared persona avatar assets are never deleted by room cleanup
- import/save/update/delete room paths clean stale owned avatar blobs only after successful metadata persistence

### e29d8cf — Keep generated persona avatars out of localStorage
Problem:
- Random Recruit generated a data:image avatar then called `updatePersona({ avatarUrl })`
- Mimic Creator could do the same
- this bypassed IndexedDB private-avatar storage and put base64 image data into `customPersonas`, increasing localStorage quota pressure

Fix:
- Random Recruit now `await memoryManager.setPersonaAvatar()`
- Mimic Creator supports async `savePersona`
- data:image avatars use private avatar IndexedDB
- remote/public avatar URLs remain metadata URLs
- test proves `customPersonas` stores only `private-avatar:<key>`, never base64

### 0410cea — Preserve recoveries across startup migrations
Problem:
- constructors can migrate/normalize primary storage before async recovery runs
- restore code previously compared recovery baseline to the already-migrated primary value
- valid recovery could be misclassified stale and discarded
- whole-persona recovery could also overwrite newer migration fields

Fix:
- RoomManager captures room primary baseline before constructor migrations
- MemoryManager captures persona primary baseline before constructor migrations
- recovery freshness compares against those captured baselines
- Persona recovery uses three-way replay:
  1. old baseline
  2. failed-write recovery overlay
  3. current migrated in-memory persona
- only fields actually changed by the failed write are replayed
- unrelated/newer migration fields remain intact

Tests prove:
- old room missing realityEpoch causes constructor migration, but valid room recovery still restores
- persona recovery replays chatPreferences delta while preserving a newer description migration

## Runtime latency state remains valid
Earlier measured stop line still applies:
- local single-chat pre-request critical work is small
- Group post-network visible work was already reduced via deferred scene durability
- do not weaken review/prompt/history semantics for tiny latency gains
- use real deployed `?perf` evidence before further latency optimization

## Current persistence architecture
### Chat histories
- compressed localStorage primary
- worker persistence
- pagehide/hidden synchronous fallback
- IndexedDB chat recovery
- latest-version guard

### Rooms
- compressed localStorage primary
- deleted-room tombstone key
- atomic two-key transaction for save/delete/import
- deferred scene persistence after reply paint
- IndexedDB room recovery for failed deferred durability
- pagehide/hidden/beforeunload flush
- room-owned avatar cleanup

### Personas
- `customPersonas` localStorage primary
- private avatar blobs in IndexedDB
- IndexedDB persona recovery on primary write failure
- baseline-safe startup restore
- three-way recovery replay across constructor migrations

## Recommended next work
Continue reliability audit, not speculative bundle/latency work.

Good next targets:
1. Supabase cloud merge / deletion tombstone correctness under concurrent local+cloud changes
2. import/restore transactional consistency across personas + histories + rooms + media
3. orphan-media cleanup only if a concrete uncovered path exists
4. deployment only when explicitly needed; do not redeploy repeatedly during local hardening

Avoid:
- blind bundle micro-splitting
- weakening strict review
- changing model routes from localhost mock timings
- async boundaries in core prompt/parser paths without measured reason
