# AIGF Production E2E Regression Handoff — 2026-09-29

> Recovery note (2026-10-05): the original local-only handoff was lost in the Windows/data-loss incident. This document is reconstructed from surviving deployment metadata, surviving handoffs, and recorded chat results. It preserves the known substantive state but is not represented as byte-identical to the original file.

## Authoritative runtime

- Repo at the time: `C:\Users\FUJITSU\Documents\My books\aigf4`
- Branch: `perf/cleanup-send-latency-20260923`
- Final production runtime commit: `eb20be4187aa531c9b9c8ce80e54c1b39051a8ff Add production favicon`
- Production deployment: `dpl_4xLXbtKfgnvHseC2NWGYsBQAYkqb`
- Deployment source: Vercel CLI from the local working repository.
- Earlier broad-reliability runtime: `4ed342ee364901908e505bdcc5515596e4565f6b Harden low-frequency reliability paths`
- Performance diagnostics runtime commit: `977bd7b58aa073246229da5bf7fed79c05d87b2e Add mobile performance diagnostics export`

## What had already been completed before this E2E pass

### Index decomposition / bundle reduction
The former monolithic `index.tsx` had been substantially decomposed into lazy/cold modules. Checkpoints included:

- initial bundle under 500 kB;
- ~411 kB and ~395 kB checkpoints;
- a ~351 kB cold-split checkpoint;
- extraction of Album, Cloud Backup, Room Memory/Info, image/video studio, Mimic Persona, public identity, settings/admin, Group creation, conversation actions, surprise/god/random flows, and other cold UI/features.

The work was not to continue decomposition purely for line-count vanity. Further extraction needed a concrete performance, ownership, reliability, or maintainability reason.

### Memory / recall
Completed:
- Memory V5 deep-recall upgrade;
- Memory V5 local diagnostics;
- message recall hardening;
- sourced soul/memory/session-memory rollback;
- Group recall restoring the exact pre-turn scene/reality epoch;
- no quota increase without evidence.

### Character photo reliability
Completed:
- live-photo continuity prioritization;
- NSFW-aware fallback ladder;
- bounded fallback behavior;
- first-model transient retry;
- black/blank image rejection;
- NSFW edit/generate model ordering.

### Group / Cc / review
Completed:
- Group transport-leak cleanup;
- deferred Group scene persistence;
- reply-scroll fix;
- Jev persistence/diagnostics/export support;
- Jev remained observational/shadow;
- strict review remained authoritative.

### Performance diagnostics
The in-app diagnostics UI under More Options included:
- capture start/stop;
- completed/generated turn counters;
- average total/network/local-pre/post-network-render timings;
- per-turn mode/review/retry/fallback metadata;
- copy/share/download JSON;
- no prompt/user/assistant text;
- bounded in-memory history and reload reset.

### Broad reliability audit
The broad audit fixed real low-frequency failure paths in:
- Album UI;
- file export/download lifecycle;
- Save & Exit archive waiting/failure behavior;
- Mimic Persona avatar HTML handling;
- Cloud Backup startup storage failure handling;
- production dependency advisory state.

Validation at that checkpoint was 650/650 tests, typecheck/build/diff PASS and production audit 0.

## Production E2E result

The actual production deployment was exercised across:

- auth;
- Single Cc;
- Group transport sanitation;
- persistence/reload;
- attachment + Album;
- single/all export/import in a fresh browser;
- character photo + Album/photo ZIP;
- encrypted Cloud Backup + fresh-browser restore + cleanup;
- mobile 390×844;
- network fault retry/recovery;
- Performance diagnostics export/privacy;
- Recall durable rollback;
- New Scene reload persistence;
- major lazy UIs;
- signed-out Live Cloud smoke.

All listed scenarios passed.

See:
`AI_STATE/PRODUCTION_E2E_REGRESSION_MATRIX_20260929.md`

## Deliberate non-claims / remaining risk

This pass did not prove:
- real video generation;
- authenticated Live Cloud end-to-end sync;
- actual mobile OS process-kill recovery;
- true browser quota exhaustion;
- arbitrarily huge archive/history stress.

Do not convert those untested areas into assumed failures, but do not call them covered.

## Performance interpretation

A representative production measurement was dominated by network/model latency rather than local pre-render work. Local pre-network and post-network render overhead were on the order of tens of milliseconds, while generation/review dominated seconds.

Do **not** weaken the review architecture based on a single timing sample.

## Final local-only commits after the production runtime

Known post-runtime documentation lineage:

- `6546572379b91ccfa0460bb49ea11141f26b7aae Document production E2E regression matrix`
- `7cf4c89a30ca23d3b5f5c65c84e91129243a7d01 Add production E2E regression matrix`

The final known local worktree was clean. These commits were not pushed to GitHub and were not redeployed because they were documentation-only.

## Mandatory continuation rules

- Use GEN-FUJI Local MCP for local repo/file/shell/Git work.
- Do not use Remote Desktop Commander.
- Do not use Codex quota.
- Do not redo completed decomposition, Memory V5, recall, photo fallback, Jev calibration, or broad-reliability work without evidence.
- Prioritize a real user-observed failure over speculative refactoring.
- Jev stays shadow unless separately validated and explicitly promoted by a later decision.
