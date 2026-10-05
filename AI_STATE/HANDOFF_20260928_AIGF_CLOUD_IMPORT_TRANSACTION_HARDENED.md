# AIGF Handoff — Cloud + Archive Restore Transactions Hardened

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Code HEAD before this handoff-doc commit: `425b478`
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
- cloud tombstone / multi-device conflict semantics
- safe archive merge/replace semantics

## Latest validated state
- `npm.cmd test`: **488 / 488 PASS**
- `npm.cmd run typecheck`: PASS
- `npm.cmd run build`: PASS
- `git diff --check`: PASS
- worktree clean after `425b478`
- main JS: **407.38 kB / 143.04 kB gzip**
- Vite >500 kB warning remains gone

The reliability code intentionally costs some bundle size. Do not remove recovery / transaction protections merely to recover a few kB.

## Reliability baseline from previous handoff
Already completed and must not be redone:
- IndexedDB recovery for failed deferred Group scene persistence
- IndexedDB recovery for failed persona persistence
- built-in relationshipState persistence fix
- atomic room + deleted-room-tombstone localStorage writes
- room avatar metadata/blob transactional updates
- generated persona avatars kept out of localStorage
- startup recovery preserved across constructor migrations

## Cloud reliability completed since previous handoff
Recent commits:
- `b5a0ed1` — Prevent deleted cloud items from reviving
- `e6035ab` — Track cloud state entity deletions
- `a5dbb68` — Safely merge pending multi-device cloud state
- `76296cd` — Guard runtime cloud pushes against device conflicts
- `c3c94fd` — Add revision CAS for cloud state writes
- `58c60da` — Reconcile realtime cloud changes after busy sync

Current intent:
- entity deletions are represented by tombstone/deletion state rather than silently resurrected by stale peers
- cloud writes use revision/conflict protection rather than blind overwrite
- pending local changes are merged/reconciled across busy realtime sync windows
- do not simplify these paths without dedicated concurrent-device tests

## Archive/import reliability completed

### `f8b7f95` — Preflight archive media before restore
Archive media entries are read before state mutation begins.
Corrupt media therefore fails before persona/history/room state is changed.

### `e247aa4` — Remap colliding imported media IDs
Safe merge import no longer reuses local photo/attachment IDs when the archive contains different media.
Imported references and blobs move together to remapped IDs, preserving existing local media.

### `075dacd` — Make archive restore transactional
Full archive restore now snapshots:
- MemoryManager personas / histories / diaries / interests / private-avatar-key state
- RoomManager rooms + deleted-room tombstones
- exported app settings
- every avatar / character-photo / attachment asset touched by the restore

On any later failure:
- overwritten avatar/photo/attachment records are restored exactly
- newly-created media records are deleted
- RoomManager metadata is restored
- MemoryManager metadata/history is restored
- app settings are restored

Important concurrency rule:
- transactional media restores use all-settled semantics before rollback begins
- a fast failure cannot start rollback while slower writes are still in flight

Completion UI callbacks are outside the durable transaction:
- UI/render callback failure does not undo a successfully committed import
- durable success is not misreported as data rollback

Legacy `history.json` avatar restore now uses private-avatar IndexedDB through `setPersonaAvatar()`, not data-URL metadata in localStorage.

### `1d5e273` — Defer room avatar cleanup until import commit
Problem:
- `RoomManager.importData()` used to schedule deletion of old room-owned avatar blobs immediately after room metadata persisted
- a later archive-media failure could roll metadata back while the old blob had already been deleted, or could be deleted after rollback

Fix:
- archive import asks RoomManager to defer unused-avatar cleanup
- cleanup runs only after the whole archive transaction commits
- failed transactions preserve old room avatar blobs

Tests cover:
- failed archive restore preserves old room avatar asset
- successful replacement import still deletes genuinely-unused old room avatar asset

### `425b478` — Clean persona avatars after import commit
Replace import can remove persona metadata.
Old private persona avatar blobs are now cleaned only after the entire archive transaction commits.

Failed imports:
- preserve old persona metadata
- preserve old persona private-avatar blobs

Successful replace imports:
- delete removed persona private-avatar blobs
- avoid leaving stale avatar assets that Supabase media enumeration could continue syncing

## Import transaction regression coverage
Current tests prove:
- Memory import succeeds then Room import fails -> Memory + Room both rollback
- overwritten photo blob is restored after later failure
- newly imported photo blob is deleted after later failure
- overwritten persona avatar is restored after app-setting failure
- app-setting partial write rolls back
- slow in-flight media write cannot leak after a faster failure
- completion UI failure does not rollback committed data
- legacy history avatar imports into private-avatar IndexedDB
- old room avatar survives failed archive transaction
- old room avatar cleans after successful replacement commit
- old persona avatar survives failed replacement transaction
- old persona avatar cleans after successful replacement commit

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
- atomic two-key transactions
- deferred scene persistence
- IndexedDB room recovery
- pagehide/hidden/beforeunload flush
- commit-gated room-avatar cleanup

### Personas
- customPersonas localStorage primary
- private-avatar blobs in IndexedDB
- IndexedDB persona recovery
- migration-safe three-way recovery replay
- commit-gated persona-avatar cleanup after replacement import

### Archive restore
- media preflight
- safe key/media-ID remapping
- metadata + settings + touched media transaction snapshot
- all concurrent writes settle before rollback
- commit-gated old-avatar cleanup

## Runtime / bundle state
Measured-runtime stop line still applies:
- do not resume speculative latency micro-optimization without deployed real timing evidence
- do not weaken strict review, history, prompt, or Group semantics for tiny gains

Current main entry remains well below 500 kB.

## Recommended next work
Continue only from concrete reliability failure modes.

Good next audits:
1. replacement-import cleanup semantics for old character-photo / attachment blobs, but **do not delete orphan photos blindly** because orphan photos can be recovery evidence
2. cloud media reconciliation under deletion/remap scenarios only if a reproducible uncovered case exists
3. backup restore rollback failure messaging / recovery only if a rollback itself can still leave an uncovered partial state
4. app-setting or media-store transaction gaps outside archive restore if a concrete mutation path exists

Avoid:
- blind orphan-media cleanup
- blind bundle micro-splitting
- weakening review/model routes
- reworking cloud CAS/tombstones without concurrent-device tests
