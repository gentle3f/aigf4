# AIGF Authoritative Recovery Handoff — 2026-10-05

## Status

AIGF source recovery after the Windows/data-loss incident is complete enough to resume development from the recovered local repo.

Authoritative local repo:
`C:\Workspaces\PROJECTS\AIGF`

Branch:
`perf/cleanup-send-latency-20260923`

## Recovery lineage

The restored GitHub clone initially stopped at:

`19fc7d5d0f78b4fdb87aa0af92fc4d810a0b65d1 Add AIGF persistence cleanup handoff`

That GitHub state was **not** the final pre-loss local state.

Surviving Vercel production metadata proved later local-only runtime commits existed and were deployed directly via CLI. The final deployed runtime was:

`eb20be4187aa531c9b9c8ce80e54c1b39051a8ff Add production favicon`

Vercel deployment:
`dpl_4xLXbtKfgnvHseC2NWGYsBQAYkqb`

The deployment preserved a complete source file tree. On 2026-10-05 that tree was downloaded locally and restored into the GitHub clone while preserving the clone's `.git` directory.

Recovery manifest:
- deployment files downloaded: 534
- successful: 534
- failed: 0

Source/config/test/doc files synchronized into the repo: 385.

Generated deployment artifacts/log/tmp content were not used as authoritative source.

## Exact source verification

Representative SHA-256 parity between the downloaded Vercel source and the restored repo was verified for:

- `index.tsx`
- `package.json`
- `features/characterPhotoImageReliability.ts`
- `features/chatPerformanceDiagnostics.ts`
- `cloudBackupState.ts`
- `AI_STATE/HANDOFF_20260929_AIGF_BROAD_RELIABILITY_AUDIT.md`
- `public/favicon.svg`

The recovered `index.tsx` is 429,658 bytes, versus 862,614 bytes in the old GitHub snapshot, confirming the late decomposition work is present.

The production build currently reports the main JS chunk at approximately:
- 360.60 kB minified
- 125.87 kB gzip

## Validation after recovery

Completed on 2026-10-05:

- TypeScript typecheck: PASS
- Full test suite: **650/650 PASS**
- Production build: PASS
- npm production audit: **0 vulnerabilities**

The test suite includes the recovered Memory V5, recall, character-photo reliability, Group persistence, Jev shadow, cloud recovery, lazy feature, and reliability regression coverage.

## Preserved / recovered late work

Recovered runtime/source includes:
- late index decomposition and cold/lazy features;
- Group/Cc transport and persistence hardening;
- Memory V5 and diagnostics;
- message recall hardening;
- character-photo continuity and NSFW-aware fallback;
- Jev shadow persistence/diagnostics/export code;
- mobile performance diagnostics;
- broad reliability audit fixes;
- production favicon/runtime.

## Post-runtime docs

The original local-only Git objects for the final documentation commits were not recovered from GitHub.

Known final local lineage before the incident:
- `eb20be4` — final deployed runtime
- `6546572` — production E2E documentation
- `7cf4c89` — production E2E regression matrix; final known local HEAD

The final known worktree at `7cf4c89` was clean.

The two E2E documents have been reconstructed from surviving chat/deployment evidence:
- `AI_STATE/HANDOFF_20260929_AIGF_PRODUCTION_E2E_REGRESSION.md`
- `AI_STATE/PRODUCTION_E2E_REGRESSION_MATRIX_20260929.md`

They are marked as reconstructed and are not falsely presented as byte-identical recovered files.

## Rollback copy

The pre-recovery GitHub working tree was preserved at:

`C:\Workspaces\PROJECTS\AIGF_PRE_RECOVERY_19fc7d5`

Do not delete it until the recovered repo has been used successfully for a reasonable period.

## Git-history rule

Do **not** rewrite history to pretend the recovered runtime is the original lost `eb20be4` commit object.

Create a new recovery commit on top of the surviving `19fc7d5` history. The commit should document that the tree content was recovered from Vercel deployment `dpl_4xLXbtKfgnvHseC2NWGYsBQAYkqb`.

## Mandatory operating rules

- GEN-FUJI Local MCP only for local repo/files/shell/Git.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not reconnect or modify recovery HDD material unless separately requested.
- Do not redo completed work merely because the original Git commit objects are missing.
- Prefer evidence-driven fixes over further speculative decomposition.
- Jev remains shadow/diagnostic unless a later explicit validation promotes it.
- Do not increase memory quotas without evidence.

## Next development step

Treat `C:\Workspaces\PROJECTS\AIGF` as the authoritative surviving AIGF development copy after the recovery commit is created.

Before the next feature/fix:
1. verify clean worktree after the recovery commit;
2. read this handoff;
3. preserve all recovered behavior;
4. prioritize any real user test failure over refactoring.
