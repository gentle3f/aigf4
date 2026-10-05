# AIGF Memory Policy Stabilized — 2026-09-29

## Branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- Runtime code HEAD: `63f1d68 Stabilize explicit and auto memory policy`
- Previous runtime commit: `9cef71a Harden character photo generation`
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.

## Character photo reliability
Commit `9cef71a` was validated and deployed before the memory work.

Exact production-default image models were smoke-tested directly:
- `qwen-image-3` generate: valid non-black image
- `qwen-image-3-edit` edit: valid non-black image

Production take-photo approval now:
- retries the same image model once only for clearly transient/capacity failures
- validates returned image blobs
- decodes/samples the result before durable save
- rejects near-all-black or almost transparent provider outputs
- never saves a rejected black/blank output into chat history
- keeps the same model on retry to preserve identity/style consistency

Validation at that checkpoint:
- photo reliability targeted 7/7 PASS
- full suite 604/604 PASS
- build/typecheck/diff PASS

## Memory audit findings
The old system felt random for concrete reasons:
1. Manual memory cards only triggered for narrow wording like "永遠記住", not ordinary explicit "記住..." requests.
2. "只限本次" had no real temporary-memory store; it merely marked proposal status and relied on recent chat history.
3. Auto-memory ran only every 12 user turns.
4. Auto-memory prompt said importance 1-2 should usually be omitted, but runtime did not enforce that.
5. Manual permanent memories were always hardcoded as `vulnerability`.
6. Auto-memory model route followed mutable chat-model settings.
7. A turn the user explicitly chose as session-only/declined could later be independently re-extracted by auto-memory.

## New deterministic memory policy in 63f1d68

### Explicit user-controlled memory
Any explicit store request such as:
- 記住...
- 唔好忘記 / 不要忘記...
- remember...
- don't forget...

is separated from recall questions such as:
- 記唔記得 / 還記得...
- Do you remember...
- Remember when...

The app opens the memory scope card for explicit store requests.

Scope:
- explicit permanent wording -> permanent button is visually preferred
- explicit session-only wording -> session-only button is visually preferred
- ordinary "記住..." -> no silent scope assumption; user chooses
- user can always choose Permanent / Session only / Do not save

### Permanent = soul.md only by user choice
Permanent memory is never silently auto-promoted.
It is pinned in `soul.md`.
Semantic kind is deterministic instead of hardcoded:
- boundary
- promise
- preference
- relationship
- vulnerability
- core

The source user message ID is stored with the permanent memory.

### Session-only = real ephemeral ledger
New module: `sessionMemory.ts`.
Session memories:
- exist in memory only, not localStorage/cloud/export
- survive navigation between chats during the same loaded browser session
- are injected into every relevant prompt
- disappear on page reload
- are cleared when that conversation is cleared/deleted
- are not copied into a timeline branch
- Group session memories carry `known_by` member IDs so private temporary facts do not leak to other members

Injected into:
- normal single generation
- single strict review
- character-photo proposal context
- normal Group generation
- Group strict review
- direct Experience/Director rewrite

### Manual-decision firewall
Every memory proposal records the source user message ID.
Once the user has explicitly controlled a memory turn (permanent / session-only / declined):
- that whole user/model turn is excluded from future auto-memory extraction
- manual summaries are also used as a semantic dedupe exclusion
- therefore choosing "session only" or "do not save" cannot later be silently promoted into long-term auto memory

### Auto-memory = episodic memory.md only
Auto-memory remains non-pinned `memory.md`; it never auto-promotes to permanent `soul.md`.

Policy is now:
- extraction cadence: every 8 user turns (was 12)
- recovery/backfill minimum remains 8
- only importance >= 3 is accepted into durable memory.md
- importance 1-2 is hard rejected by runtime
- model route is fixed and independent of mutable chat settings:
  1. default quality fallback
  2. default primary
  3. default emergency fallback
- extraction temperature remains 0.2

### Recall behavior
Memory selection already occurs on every normal reply.

One-to-one:
- up to 12 soul.md entries
- up to 12 memory.md entries
- ranked by importance + query relevance + recency

Group:
- present member: up to 8 pinned soul + 7 private episodic
- absent member: up to 3 pinned soul + 0 private episodic
- room-wide: up to 8 shared episodic entries
- memory firewall remains active between members

Explicit past-reference cues such as "上次 / 之前 / 記得 / remember / last time" additionally select up to 3 older verbatim turns from archival history.

## Validation for 63f1d68
Targeted memory/integration:
- 70/70 PASS

Full suite:
- 618/618 PASS

Also:
- build PASS
- typecheck PASS
- git diff --check PASS
- worktree clean after commit

Production build size observed in validation:
- main JS ~357.11 kB raw / 124.59 kB gzip
- increase is roughly 3.7 kB raw / ~1 kB gzip versus the photo-reliability checkpoint
- session/policy logic is intentionally hot because every chat generation can use it

## Product interpretation
The intended memory hierarchy is now:
1. Recent chat history = working memory
2. Session-only ledger = explicit temporary memory for this loaded browser session
3. memory.md = auto-extracted durable episodic memory
4. soul.md = user-confirmed permanent/pinned memory only

This is designed to maximize user control and remove silent scope promotion.

## Next suggested work
After deployment/user trial:
1. Observe several real explicit memory flows:
   - ordinary "記住..."
   - permanent wording
   - session-only wording
   - decline
2. Confirm session-only survives several replies but disappears after reload.
3. Inspect actual auto-memory quality after 8-turn checkpoints.
4. If desired, add a small memory diagnostics view showing:
   - last auto-memory checkpoint
   - next checkpoint in N user turns
   - recently added memory.md entries and source IDs
   - current session-only entries
   without exposing private content unless user explicitly opens it.
