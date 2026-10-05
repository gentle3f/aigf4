# AIGF Handoff — Cloud Auth Stale Actions Contained

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current code HEAD before this handoff-doc commit: `81c2d14f9f77cc17f3a2abcaf85b50d4f75b055d`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule

Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander.
Do not use GitHub Actions for heavy work.

Preserve:
- normal chat / Group / Cc generation
- review / Jev / memory / wardrobe behaviour
- local persistence recovery
- safe cloud pull / state CAS / deferred destructive deletes
- realtime recovery and auth transitions
- local-first guarantees when cloud fails

Do not claim cloud push is fully remote-atomic.

---

## Validated state

At code HEAD `81c2d14`:

- `npm.cmd test` — **555 / 555 PASS**
- `npm.cmd run typecheck` — PASS
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- main JS: **408.19 kB minified / 143.44 kB gzip**
- Supabase cloud chunk: **248.69 kB / 64.80 kB gzip**
- code worktree clean immediately after the code commit

No production deployment was performed in this continuation.

---

## Reliability work completed in this continuation

### 1. Same-user re-login invalidates stale cloud runtime work

Commit:
- `0e55501` — **Invalidate stale cloud work across same-user relogin**

Problem:
Checking only `session.user.id` was insufficient. A logout followed by a re-login to the same owner ID could make old async work appear current again.

Fix:
- added a monotonically changing `sessionGeneration`
- session-scoped operations now validate both owner user ID and generation
- stale work is rejected across:
  - initial sync
  - cloud state-head preflight
  - pending push
  - push stages
  - pull / rollback boundary
  - media/message/deletion stages
  - pull/push timers
  - realtime reconnect timer
  - realtime startup and callbacks

Characterization includes same-user re-login while old state-head, push, pull, and realtime work is in flight.

### 2. Stale password update cannot overwrite newer session state

Commit:
- `2d47003` — **Ignore stale cloud password updates**

Problem proven by failing tests:
- a slow `auth.updateUser({ password })` success could mark a newer runtime `synced`
- a stale failure could overwrite signed-out / newer auth state with `error`

Fix:
- bind the password-update action to its starting `sessionUserId + sessionGeneration`
- stale success returns without local state mutation
- stale failure still rejects to the caller but cannot change the newer local auth state

The remote Supabase password request itself cannot be undone if Supabase already accepted it; this guard is specifically about preventing stale local runtime takeover.

### 3. Stale manual sign-out cannot clear a newer re-login

Commit:
- `c1c685f` — **Ignore stale manual cloud sign-outs**

Problem proven by failing tests:
- a slow old sign-out success could clear a session that had already re-logged in
- a slow old sign-out failure could overwrite a newer session with `error`

Fix:
- bind manual sign-out to the starting session generation
- re-check after remote `auth.signOut()`
- re-check again after realtime teardown
- stale success no longer tears down the newer local runtime
- stale failure rejects without overwriting the newer auth state

### 4. Stale password-login results cannot replace newer auth state

Commit:
- `177cb90` — **Ignore stale cloud password logins**

Problem proven by failing tests:
- late invalid credentials could overwrite a newer signed-in state with `signed_out`
- late successful login could replace a newer same-user session/token with the stale session object
- late transport failure could overwrite newer state with `error`

Fix:
- bind password login to both starting `authStateChangeEpoch` and `sessionGeneration`
- newer auth event/session generation supersedes the manual login result
- stale success returns without applying its session
- stale API / transport errors still reject to the original caller but do not mutate newer state

### 5. Stale magic-link results cannot overwrite newer auth state

Commit:
- `81c2d14` — **Ignore stale cloud magic-link results**

Problem proven by failing tests:
- late magic-link success could set `signed_out` after the user had already become signed in
- late API or transport errors could set `error` over a newer successful auth state

Fix:
- bind magic-link request to starting `authStateChangeEpoch + sessionGeneration`
- stale success returns without state mutation
- stale error still rejects to the original caller without touching the newer state

Targeted auth transport suite after all fixes:
- **17 / 17 PASS**

---

## Earlier cloud reliability work that is already complete

Do not redo these:

- `a8b1afc` — retry transient startup cloud session lookup
- `9d2ad15` — contain thrown cloud auth transport errors
- `8922989` — stop stale cloud work after session changes
- `90e8e71` — scope realtime reconnect to current cloud session
- `5972aff` — ignore stale cloud session lookups
- `e132467` — scope cloud state preflight to current session
- `0e55501` — same-user session-generation protection
- `2d47003` — stale password update protection
- `c1c685f` — stale manual sign-out protection
- `177cb90` — stale password login protection
- `81c2d14` — stale magic-link protection

The earlier handoff `AI_STATE/HANDOFF_20260928_AIGF_CLOUD_AUTH_FAILURE_CONTAINED.md` remains useful background, but this document supersedes it for the current continuation point.

---

## Current guarantees

### Session identity
Cloud async work is no longer scoped only by owner user ID. A same-user re-login starts a new generation, invalidating older work.

### Startup / refresh
Transient or thrown `getSession()` failures are contained and retried.
Overlapping/stale session lookups cannot overwrite a newer auth-state result.

### Manual auth actions
The four manual auth surfaces now have stale-result protection:
- magic link
- password login
- password update
- sign-out

A stale action may still complete remotely if the remote provider already processed it, but it cannot take ownership of a newer local auth runtime.

### Cloud sync / realtime
Existing safe merge, state CAS, deferred deletion, transaction rollback, bounded retry, realtime reconnect, and local-first failure guarantees remain intact.

---

## Recommended next audit

Do **not** start another broad cloud rewrite.

First inspect the current code/tests and look only for a concrete async boundary that can still:
1. mutate state after its session/auth runtime has been superseded, or
2. become permanently stuck after a transient failure.

The obvious manual auth actions and same-user cloud/realtime races covered in this pass are now characterized. If no reproducible failure is found, stop the cloud reliability audit and return to the larger AIGF roadmap rather than inventing speculative work.

The larger roadmap remains the already-started low-risk decomposition / lazy-loading programme; preserve the hot chat/Group/Cc/review paths.

---

## Git / deployment discipline

- Work on `perf/cleanup-send-latency-20260923`.
- Use GEN-FUJI Local MCP only.
- No Codex.
- No Remote Desktop Commander.
- No GitHub Actions for this work.
- Do not expose secrets or `.env.local`.
- Keep one logical commit per reliability fix.
- Do not deploy unless there is an explicit reason to move a tested commit to production.
