# AIGF Handoff — Cloud Push Retry, Realtime Recovery, and Auth Timer Lifecycle Hardened

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
- worktree clean
- main JS: about **408.19 kB / 143.44 kB gzip**
- Supabase sync remains a cold chunk: about **241.74 kB / 63.49 kB gzip**

## Latest reliability commits
- `6fbaf2c` — Defer cloud deletes until state CAS
- `b77748d` — Update AIGF cloud delete retry handoff
- `bc3c9b0` — Recover Supabase realtime after channel failure
- `6f69c30` — Clear cloud timers across auth transitions

Previous hardening still applies:
- `6a79f95` — Commit cloud indexes only after state CAS
- `a25a0e3` — Make cloud pull locally transactional
- `3e783ad` — Verify replacement media cleanup sync scope
- archive/import transaction hardening from earlier handoffs

## Cloud push destructive deletes are now post-CAS

Before this change, normal push could:
1. upload/upsert media/messages
2. delete remote rows that disappeared locally
3. only afterwards attempt the state revision CAS

Now:
- `pushMedia()` returns a `CloudMediaPushPlan`
  - next local media index
  - remote media IDs that should be deleted
- `pushMessages()` returns a `CloudMessagePushPlan`
  - next message/conversation indexes
  - removed message IDs grouped by conversation
  - removed conversations
- neither helper performs destructive remote deletes
- state CAS runs first
- only after CAS succeeds does `applyRemoteDeletionPlan()` delete:
  - messages
  - conversations
  - media rows
  - media storage blobs
- local sync indexes commit only after the delete plan succeeds

### Failure semantics
If CAS conflicts:
- delete plan is never called
- all local sync indexes remain at the previous committed baseline
- pending remains true
- pull recovery is required

If CAS succeeds but the delete plan later fails:
- local sync indexes still remain old
- pending remains true
- bounded retry is scheduled
- repeated delete work is idempotent and can be retried safely

Functional tests cover both cases.

## Bounded transient cloud retry

Generic transient sync errors no longer remain stuck waiting for a future browser event.

Current retry policy:
- 1.5 s
- 3 s
- 6 s
- 12 s
- 24 s
- 30 s cap

Properties:
- only while a session exists and navigator is online
- no duplicate retry if a pull timer is already pending
- successful `markSynced()` resets the backoff
- reconnect/online resets the backoff and schedules a quick recovery path
- offline clears pending pull retry; browser `online` event resumes recovery
- revision conflicts keep their existing immediate safe-recovery path rather than waiting for generic backoff

`tests/cloudRetryBackoff.test.ts` verifies the full delay sequence, reset, offline behaviour, and duplicate suppression.

## Realtime disconnect gaps are now recovered

Supabase Realtime status handling now covers:
- `CHANNEL_ERROR`
- `TIMED_OUT`
- `CLOSED`
- `SUBSCRIBED`

On channel failure:
- UI enters error state
- a REST pull is scheduled to cover missed events
- a bounded realtime restart is scheduled

If Supabase re-subscribes before the restart timer:
- retry state is cleared
- restart timer is cancelled
- an immediate pull reconciles any events missed during the gap

If the channel is actually `CLOSED`:
- a replacement channel is created after bounded backoff

Intentional channel removal is protected by channel identity:
- stale callbacks from the old channel are ignored
- intentional sign-out/stop does not cause the channel to resurrect

`tests/cloudRealtimeRecovery.test.ts` verifies:
- failure -> catch-up pull/reconnect
- stale CLOSED after intentional stop is ignored
- successful resubscribe resets retry state and reconciles
- realtime restart uses bounded exponential backoff and suppresses duplicate timers

## Auth/session transitions now clear stale scheduled cloud work

A real cross-session race was closed.

Before:
- push/pull timers from an old session could survive sign-out or account/session transition
- the old realtime channel could remain alive until after the next session's initial sync began

Now:
- `clearScheduledCloudWork()` clears:
  - push timer
  - pull timer
  - cloud retry attempt
- `stopRealtime()` clears realtime restart state and removes the old channel
- explicit `signOut()` clears timers + realtime before calling auth sign-out
- `applySession(null)` clears timers + realtime before entering signed-out state
- rejected non-owner sessions clear old timers/realtime before auth sign-out
- a different owner session clears timers and stops old realtime **before** new-session `initialSync()`

`tests/cloudSessionTimerLifecycle.test.ts` verifies all three auth-transition cases.

## Important unresolved distributed-system limitation

**Cloud push is still not fully remote-atomic. Do not claim otherwise.**

The push still spans:
- Supabase Storage blobs
- `wetapp_media`
- `wetapp_messages`
- `wetapp_conversations`
- state revision CAS

Current guarantees are stronger:
- destructive deletes do not happen before CAS
- local indexes do not advance before CAS
- transient failures retry automatically
- state conflicts trigger safe recovery
- pull applies locally inside a rollback transaction

But changed/new remote media/message upserts can still occur before the final state CAS.
If CAS or transport later fails, those remote upserts can temporarily exist ahead of the accepted state revision.

A real fix requires a deliberate server-side protocol such as staged/revision-bound rows or another finalize/lease design. Do not implement a race-window-only patch and call it atomic.

## Recommended next reliability direction

Prefer issues that can be fully closed and proven offline.

Good candidates:
1. audit cloud metadata / flags around post-CAS partial failure so no local UI ever reports synced before all cleanup/index work finishes;
2. audit backup/restore behaviour when IndexedDB media writes fail mid-operation;
3. audit account/auth error paths for local data safety, especially magic-link/password session transitions;
4. audit stale or corrupt cloud state payload handling before applying it locally;
5. continue only from a concrete reproducible failure mode.

Avoid:
- speculative bundle work
- chat latency micro-optimization without production evidence
- pretending the remaining distributed remote atomicity problem can be solved client-only
