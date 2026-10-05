# AIGF Handoff — Cloud Destructive Writes Post-CAS + Retry Hardened

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current code HEAD before this handoff-doc commit: `6fbaf2c`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless explicitly requested.
Do not use GitHub Actions for heavy work.

## Current validation
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **506 / 506 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree clean after latest code commit
- main JS: about **408.19 kB / 143.44 kB gzip**

## Latest reliability commits
- `a25a0e3` — Make cloud pull locally transactional
- `3e783ad` — Verify replacement media cleanup sync scope
- `6a79f95` — Commit cloud indexes only after state CAS
- `6fbaf2c` — Defer cloud deletes until state CAS

## What changed in 6fbaf2c

### Destructive remote deletes now wait for state CAS

Before:
1. upload/upsert media
2. delete remote media no longer present locally
3. upload/upsert messages/conversations
4. delete remote messages/conversations no longer present locally
5. run `wetapp_save_state_if_revision`
6. commit local sync indexes

If another device changed cloud state during steps 1–4, step 5 could correctly raise a revision conflict **after destructive deletes had already happened**.

Now:
1. `pushMedia()` performs only non-destructive upload/upsert and returns:
   - candidate media index
   - planned media deletions
2. `pushMessages()` performs only non-destructive upsert and returns:
   - candidate message index
   - candidate conversation index
   - planned message deletions grouped by conversation
   - planned conversation deletions
3. state revision CAS runs
4. **only after CAS succeeds**, `applyRemoteDeletionPlan()` performs:
   - message deletions
   - conversation deletions
   - storage blob deletion + media-row deletion
5. only after those deletes succeed are all local sync indexes advanced
6. only then are pending/recovery flags cleared and sync marked complete

### Important effect

On a state revision conflict:
- no destructive remote delete runs
- all local sync indexes remain at their previous committed baseline
- `PENDING=true`
- pull recovery remains required
- safe recovery is scheduled immediately

On a post-CAS remote-delete failure:
- cloud state revision may already have advanced
- local sync indexes **do not** advance
- `PENDING=true`
- the same delete plan can be reconstructed from the old committed indexes and retried idempotently

Functional test coverage verifies both cases.

## Bounded transient cloud retry

Generic cloud sync failures now schedule bounded retry rather than waiting indefinitely for another browser event.

Retry:
- 1.5 s
- 3 s
- 6 s
- 12 s
- 24 s
- capped at 30 s

Rules:
- no retry while offline
- no duplicate retry if a pull timer already exists
- successful sync resets retry attempt counter
- coming back online clears an old timer/counter and resumes normal reconciliation
- offline transition clears pending pull timer

This directly covers failures such as:
- post-CAS remote delete failure
- transient pull transport failure
- transient push transport failure

## Tests added/extended

`tests/cloudPullTransaction.test.ts`
- revision conflict leaves all 4 local indexes unchanged
- revision conflict calls destructive deletion plan **0 times**
- post-CAS delete failure leaves all 4 local indexes unchanged and pending=true

`tests/cloudStateRevisionCas.test.ts`
- local indexes commit only after state CAS
- destructive remote deletes occur only after state CAS
- `pushMedia()` and `pushMessages()` contain no direct delete calls

`tests/cloudSafeMergeFeature.test.ts`
- push helpers only calculate candidate indexes/deletion plans
- push helpers do not commit indexes or perform destructive deletes

`tests/cloudRetryBackoff.test.ts`
- bounded exponential retry
- reset after successful sync
- no retry offline
- no duplicate timer

## Still not fully remote-atomic

Do **not** claim cloud push is one atomic distributed transaction.

CAS-before-delete now prevents the worst destructive conflict case, but normal push still spans:
- Supabase Storage
- `wetapp_media`
- `wetapp_messages`
- `wetapp_conversations`
- `wetapp_state`

Non-destructive upserts can still occur before the state CAS.

Why this is intentionally left:
- message IDs / asset IDs are intended to be immutable identities
- pre-CAS upserts are much less dangerous than pre-CAS deletes
- moving the state CAS entirely before media/message writes would expose a different partial-state window to other devices
- a full fix requires a deliberate remote protocol, not more client-side ordering tricks

A true remote-atomic design would need something like:
- staged revision-bound rows + finalize
- cloud write lease
- server-side sync transaction/finalization protocol

Do not implement a cosmetic race-window patch and call it atomic.

## Existing hardening that remains active
- cloud pull local application is transactional
- archive restore is transactional
- cloud sync pauses during archive transactions
- rolled-back imports leak no transient cloud events
- replacement import cleans only old media no longer referenced by final histories
- deleted-room tombstones are durable
- Room and Persona storage have recovery stores for local quota/write failure
- cloud sync indexes only advance after state CAS + destructive delete success

## Next reliability direction

Continue only from concrete failure modes that can be completely tested.

Good candidates:
1. audit cloud "synced" metadata / last-sync timestamps for any path that can mark success before all required durable writes are finished;
2. audit realtime channel failure handling — ensure losing realtime cannot leave a signed-in device stale indefinitely when there are no local changes;
3. audit cloud retry timer lifecycle around sign-out / auth account changes to ensure old retries cannot fire against a new/cleared session;
4. audit any remaining local persistence mutation where memory can diverge from durable storage after failure.

Avoid:
- speculative bundle work
- latency micro-tuning without real evidence
- claiming remote atomicity without a server protocol
