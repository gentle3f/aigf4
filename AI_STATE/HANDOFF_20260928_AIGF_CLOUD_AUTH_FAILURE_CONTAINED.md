# AIGF Handoff — Cloud Auth / Realtime Failure Containment

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current HEAD before this handoff-doc commit: `dced724`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander.
Do not use GitHub Actions for heavy work.

## Core behaviour that must not regress
Preserve:
- normal chat / Group / Cc generation
- review / Jev / memory / wardrobe
- local persistence recovery
- safe cloud pull / state CAS / deferred destructive deletes
- realtime recovery and auth transitions
- manual cloud sync / reload / sign-out
- local-first guarantees when cloud fails

## Latest validated state
HEAD: `dced724`

Validation:
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **522 / 522 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree clean after code commit
- main JS: **408.19 kB / 143.45 kB gzip**

## Recent reliability commits
- `6fbaf2c` — Defer cloud deletes until state CAS
- `bc3c9b0` — Recover Supabase realtime after channel failure
- `6f69c30` — Clear cloud timers across auth transitions
- `13c766f` — Surface failed manual cloud actions
- `bcb6761` — Preserve cloud runtime on sign-out failure
- `faaa30b` — Fail closed on unauthorized cloud session
- `dced724` — Contain realtime teardown and startup failures

## Current guarantees

### Manual sync / reload
- manual sync rejects if safe push does not actually complete
- manual reload rejects if safe recovery does not actually complete
- manager error detail is surfaced instead of false-success
- pending local work remains durable for retry

### Manual sign-out
Remote auth sign-out is now attempted **before** local cloud runtime teardown.

If remote sign-out fails:
- promise rejects
- state becomes error
- current session remains locally intact
- push/pull/realtime retry timers stay intact
- active realtime channel stays intact
- Live Cloud UI displays the failure

If remote sign-out succeeds:
- scheduled cloud work is cleared
- realtime is detached
- local session / initialized user are cleared
- state becomes signed_out

### Unauthorized/non-owner Supabase session
Non-owner sessions fail closed:
- timers are cleared
- realtime channel is detached
- automatic remote sign-out is attempted
- local manager session is cleared regardless of remote sign-out success
- no cloud sync can continue under the unauthorized identity
- remote sign-out failure is contained as an explicit error state, not an unhandled rejection

### Realtime teardown
`stopRealtime()` now treats remote `removeChannel()` failure as best-effort:
- local `this.channel` is cleared first
- stale channel callbacks remain inert because every callback checks channel identity
- removeChannel failure is logged but does not block sign-out or session transition

### Initial realtime startup
If initial realtime setup throws after a valid owner session:
- error is contained
- state becomes error
- bounded cloud retry is scheduled
- bounded realtime restart is scheduled
- auth callback does not leak an unhandled rejection

## Realtime retry / reconciliation already present
- CHANNEL_ERROR / TIMED_OUT / CLOSED schedule catch-up pull + reconnect
- retry uses bounded exponential backoff
- successful resubscribe resets retry state
- recovered realtime schedules immediate reconciliation pull
- stale old-channel events are ignored by channel identity guard

## Existing cloud safety that must remain
- remote pull applies locally transactionally
- cloud state/message/media indexes commit only after appropriate remote state CAS
- destructive remote deletes are deferred until state CAS succeeds
- transient cloud failures use bounded retry
- auth/session transition clears stale scheduled cloud work before new initialization
- cloud push is **not** claimed to be fully remote-atomic

## Recommended next audit
Look for a concrete cloud/auth state that can become permanently stuck after a transient failure.

Highest-value candidate:
- `start()` sets `started = true` before `auth.getSession()`
- if `getSession()` fails transiently while no local session exists, current online/visibility handlers return early when `this.session` is null
- verify whether the manager can recover without page reload or a new auth event
- if not, add a conservative session-refresh retry path without duplicating auth listeners

Do not broaden this into speculative cloud architecture work.
