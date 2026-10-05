# AIGF Handoff — Cloud Import Transaction + Replacement Media Cleanup Hardened

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current code HEAD before this handoff-doc commit: `469fc25`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless explicitly requested.
Do not use GitHub Actions for heavy work.

## Current validation
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **496 / 496 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree clean after latest code commit
- main JS: about **407.82 kB / 143.25 kB gzip**

## Latest reliability commits
- `9558f2e` — Pause cloud sync during archive transactions
- `7bee9f5` — Clean replaced history media after import commit
- `469fc25` — Discard cloud events from rolled-back imports

Previous transaction hardening remains in place:
- `075dacd` — Make archive restore transactional
- `1d5e273` — Defer room avatar cleanup until import commit
- `425b478` — Clean persona avatars after import commit
- `e247aa4` — Remap colliding imported media IDs
- `f8b7f95` — Preflight archive media before restore

## Current archive transaction semantics

### During archive restore
A local cloud-change batch is active.
Cloud push/pull defers while the batch is active.

### Successful transaction
1. metadata/state/history/rooms/settings and imported touched media commit transactionally
2. old persona/room avatars are cleaned only after commit
3. for replacement imports only, old character photos/chat attachments are cleaned only when:
   - they were referenced by pre-import histories
   - they are no longer referenced by post-import histories
4. unrelated pre-existing orphan media is intentionally preserved as possible recovery evidence
5. queued cloud-change scopes flush only after durable commit/post-commit cleanup

### Failed transaction with successful rollback
- metadata/state/history/rooms/settings return to the pre-import snapshot
- touched avatar/photo/attachment assets are restored/removed as appropriate
- old media referenced by rolled-back histories is not cleaned
- transaction-local cloud-change scopes are discarded with `close(false)`
- **zero transient local-cloud-change events escape**

### Failed rollback
- cloud batch is discarded
- storage failure event is surfaced
- an AggregateError tells the user that recovery was incomplete

## Replacement media cleanup details
New post-commit helper compares:
- media referenced by pre-import snapshot histories
- media referenced by final current histories

It deletes only removed references:
- character photo assets
- chat attachment assets

Cleanup failures are logged per asset and do not roll back a successful durable import.

## Tests added/extended
`tests/importTransactionRollback.test.ts` now covers:
- replacement import cleans removed referenced photo/attachment assets
- unrelated orphan photo is preserved
- failed replacement import preserves media referenced by rolled-back histories
- successful archive transaction withholds cloud events until commit
- failed archive transaction with successful rollback leaks **no** cloud-change scopes

## Next reliability audit
Check whether post-commit deletion of old local media emits/queues the correct `media` cloud-change scope.
If local media cleanup can occur without cloud sync learning about it, fix that concrete inconsistency.
Do not perform blind orphan-media cleanup.
