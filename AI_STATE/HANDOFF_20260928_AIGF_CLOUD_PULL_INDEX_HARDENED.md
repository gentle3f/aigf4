# AIGF Handoff — Cloud Pull Transaction + Post-CAS Index Commit Hardened

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current code HEAD before this handoff-doc commit: `6a79f95`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless explicitly requested.
Do not use GitHub Actions for heavy work.

## Current validation
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **503 / 503 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree clean after latest code commit
- main JS: about **408.19 kB / 143.44 kB gzip**

## Latest reliability commits
- `a25a0e3` — Make cloud pull locally transactional
- `3e783ad` — Verify replacement media cleanup sync scope
- `6a79f95` — Commit cloud indexes only after state CAS

Previous archive/import hardening remains in place:
- `075dacd` — Make archive restore transactional
- `1d5e273` — Defer room avatar cleanup until import commit
- `425b478` — Clean persona avatars after import commit
- `f8b7f95` — Preflight archive media before restore
- `e247aa4` — Remap colliding imported media IDs
- `9558f2e` — Pause cloud sync during archive transactions
- `7bee9f5` — Clean replaced history media after import commit
- `469fc25` — Discard cloud events from rolled-back imports
- `2b0474a` — Sync persisted app settings consistently

## Cloud pull is now locally transactional

Before applying a fetched cloud snapshot, Supabase sync captures:
- MemoryManager import snapshot
  - personas
  - chat histories
  - diaries
  - interests
  - private-avatar ownership
  - custom persona counter
- RoomManager import snapshot
  - rooms
  - durable deleted-room tombstones
- every persisted app setting
- current cloud sync indexes
  - messages
  - conversations
  - media
  - state entities

Media is snapshotted lazily only when a cloud row will actually overwrite/create a local asset:
- persona / room avatar
- character photo
- chat attachment

If any later stage fails:
- touched media is restored or removed
- rooms are restored
- MemoryManager is restored
- persisted app settings are restored
- all 4 sync indexes are restored

If rollback itself is incomplete:
- storage failure is surfaced
- an AggregateError reports that local recovery was incomplete

### Functional evidence
`tests/cloudPullTransaction.test.ts` performs an offline end-to-end rollback using real fake-IndexedDB stores and verifies:
- persona state restored
- chat history restored
- room scene restored
- app setting restored
- overwritten avatar restored
- newly created photo removed
- overwritten attachment restored
- message index restored
- conversation index restored
- media index restored
- state-entity index restored

No Supabase account/network is used by this test.

## Local sync indexes now commit only after state CAS succeeds

Previously normal cloud push did:
1. upload/update media
2. update local media index
3. upload/update messages
4. update local message/conversation indexes
5. attempt `wetapp_save_state_if_revision`

If step 5 hit a multi-device revision conflict, local indexes had already advanced and could falsely claim that remote media/messages were synced.

Now:
1. `pushMedia()` returns the candidate media index only
2. `pushMessages()` returns candidate message/conversation indexes only
3. state revision CAS runs
4. **only after CAS succeeds**, the client commits:
   - media index
   - message index
   - conversation index
   - state-entity index
5. pending/recovery flags are then cleared

### Functional evidence
A revision-conflict test mocks the CAS RPC and verifies:
- push returns failure
- pending remains true
- pull recovery remains required
- all 4 local indexes remain at their previous committed baseline

This protects safe-merge recovery from using a false “already synced” baseline.

## Replacement media cleanup cloud scope audit closed

Successful replacement imports already:
- delete only old photo/attachment assets referenced before import but no longer referenced after import
- preserve unrelated orphan media as possible recovery evidence

The deletion stores emit `media` local-cloud-change events.
Because cleanup occurs inside the outer import commit batch:
- the media scope is withheld during the transaction
- one deduplicated `media` scope flushes after successful durable commit

A regression test now verifies exactly one committed media scope is emitted.

## Important unresolved distributed-system risk

**Do not claim cloud push is fully remote-atomic.**

Normal push still spans:
- Supabase Storage blobs
- `wetapp_media`
- `wetapp_messages`
- `wetapp_conversations`
- `wetapp_state` revision CAS

These cannot currently be committed as one database/storage transaction.

Current hardening guarantees:
- state CAS detects concurrent state writers
- local indexes do not advance before CAS
- safe merge/pull recovery protects local state
- cloud pull local application is transactional

But a device can still mutate some remote media/message rows before a later state CAS conflict or transport failure.

A **real** fix for this remaining risk requires a deliberate server protocol, for example:
- revisioned/staged remote rows, or
- a cloud write lease + staged immutable media + revision-bound finalize, or
- another protocol that prevents other clients from consuming partial writes

Do not implement a “smaller race window” patch and call it atomic.

## Next reliability direction

Prefer a failure mode that can be completely closed and proven offline.

Good candidates:
1. audit transient cloud failure retry scheduling — make sure a failed recovery pull/push cannot remain stuck indefinitely without another browser event;
2. audit any remaining persisted metadata that can report “synced” before all durable writes complete;
3. audit cloud-safe merge behaviour after a transport failure at each stage, using fake client methods where possible;
4. continue import/backup reliability only from concrete reproducible failure modes.

Avoid:
- speculative bundle work
- chat latency micro-optimization without production evidence
- half-fixes for distributed remote atomicity
