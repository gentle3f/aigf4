# AIGF Handoff — Realtime + Auth Timer Recovery Hardened

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current code HEAD before this handoff-doc commit: `6f69c30`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless explicitly requested.
Do not use GitHub Actions for heavy work.

## Current validation
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **512 / 512 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree clean after latest code commit
- main JS: about **408.19 kB / 143.44 kB gzip**

## Latest reliability commits
- `6a79f95` — Commit cloud indexes only after state CAS
- `6fbaf2c` — Defer cloud deletes until state CAS
- `bc3c9b0` — Recover Supabase realtime after channel failure
- `6f69c30` — Clear cloud timers across auth transitions

## Destructive cloud push ordering

Normal cloud push now does:
1. non-destructive media upload/upsert only
2. non-destructive message/conversation upsert only
3. state revision CAS
4. destructive message/conversation/media delete
5. local sync-index commit
6. clear pending/recovery flags
7. mark synced

On revision conflict:
- destructive delete plan is never executed
- local indexes stay at the previous committed baseline
- pending remains true
- safe pull/merge recovery is scheduled

On post-CAS destructive delete failure:
- local indexes stay at previous baseline
- pending remains true
- bounded retry reconstructs and retries the deletion plan

Cloud push is **still not fully remote-atomic** because non-destructive upserts happen before the state CAS. Do not claim otherwise.

## Transient cloud retry

Generic cloud failures now use bounded retry:
- 1.5 s
- 3 s
- 6 s
- 12 s
- 24 s
- 30 s cap

Rules:
- no retry offline
- no duplicate retry if a pull timer already exists
- successful sync resets counter
- online transition resets and resumes reconciliation
- offline transition clears pending pull timer

## Realtime channel recovery

Previously `CHANNEL_ERROR` only changed UI state.

Now `CHANNEL_ERROR`, `TIMED_OUT`, and unexpected `CLOSED`:
- schedule a catch-up cloud pull
- schedule bounded realtime re-subscribe
- keep a single retry timer
- reconnect using the current authenticated session

On successful re-subscribe:
- retry state resets
- if this was a recovery reconnect, a pull runs immediately to catch changes missed during the gap

Stale/old channel callbacks are ignored:
- every callback checks that its channel is still the current channel
- intentional `stopRealtime()` clears `this.channel` before Supabase removes the channel
- therefore the resulting CLOSED callback does not trigger an unwanted reconnect

## Auth/session timer lifecycle

Cloud push/pull timers no longer survive session transitions.

On:
- explicit sign-out
- auth callback becoming null
- rejected non-owner session
- new owner session beginning initial sync

the manager clears:
- pending push timer
- pending pull/cloud retry timer
- cloud retry attempt counter

`stopRealtime()` separately clears realtime retry state.

This prevents an old session timer from firing during a new session's `initialSync()`.

## New functional tests

`tests/cloudRealtimeRecovery.test.ts`
- channel failure schedules catch-up pull and reconnect
- successful re-subscribe reconciles missed changes
- intentional channel stop ignores stale CLOSED callbacks
- realtime retry is bounded and deduplicated

`tests/cloudSessionTimerLifecycle.test.ts`
- auth sign-out clears all scheduled work/realtime state
- new owner session clears old timers before initial sync
- non-owner rejection clears old timers/channel before sign-out

Existing cloud CAS/delete/retry tests remain green.

## Still intentionally unresolved

The remote cloud protocol is not a single distributed transaction across:
- Supabase Storage
- wetapp_media
- wetapp_messages
- wetapp_conversations
- wetapp_state

A true fix would need a server-side staged/finalized protocol, lease, or revision-bound transaction design.

Do not add client-side ordering tricks and label them remote atomicity.

## Next reliability direction

Continue only from concrete, offline-testable failure modes.

Good next audits:
1. verify no cloud path calls `markSynced()` / advances last-sync metadata before all required writes/index commits are durable;
2. verify failed post-CAS cleanup cannot accidentally clear pending/recovery metadata;
3. audit account/session handoff for any remaining state fields that should reset with a new user id;
4. audit local persistence mutations only where memory can diverge from durable storage after a reproducible failure.

Avoid:
- speculative bundle work
- chat latency micro-tuning without production evidence
- broad refactors without a failure case
