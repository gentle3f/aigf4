# AIGF Production E2E Regression Matrix — 2026-09-29

> Recovery note (2026-10-05): the original local-only documentation commit was lost with the Windows/data-loss incident. This file is reconstructed from the surviving Vercel deployment metadata, surviving AIGF handoffs, and the recorded chat/test results. It is intended to preserve the substantive regression matrix; it is not claimed to be byte-for-byte identical to the lost file.

## Production runtime under test

- Branch: `perf/cleanup-send-latency-20260923`
- Final deployed runtime commit: `eb20be4187aa531c9b9c8ce80e54c1b39051a8ff` — **Add production favicon**
- Vercel production deployment: `dpl_4xLXbtKfgnvHseC2NWGYsBQAYkqb`
- Deployment source: CLI, from the local repo rather than a GitHub-triggered build.
- The later local-only commits `6546572` and `7cf4c89` were documentation-only and were not redeployed.

## Production E2E matrix

| Area | Result | Notes |
| --- | --- | --- |
| Authentication / app unlock | PASS | Production app entry/auth path exercised. |
| Single Cc chat | PASS | Normal generation/review/render path exercised. |
| Group chat | PASS | Group generation path exercised, including transport sanitation. |
| Group transport sanitation | PASS | No leaked internal transport/control payload in visible assistant content. |
| Persistence / reload | PASS | Conversation state survived reload in the tested browser path. |
| Attachment + Album | PASS | Attachment flow and Album flow exercised together. |
| Single-chat export/import | PASS | Exported one conversation and imported into a fresh browser context. |
| All-chat export/import | PASS | Full chat archive export/import exercised in a fresh browser context. |
| Character photo | PASS | Live character-photo generation/reliability path exercised. |
| Album / photo ZIP | PASS | Photo archive ZIP produced and validated in E2E. |
| Encrypted Cloud Backup | PASS | Backup creation and fresh-browser restore exercised; test backup cleaned up afterward. |
| Mobile viewport | PASS | Production tested at 390×844 viewport. |
| Network fault retry/recovery | PASS | Retry/recovery behavior exercised under injected failure. |
| Performance diagnostics | PASS | Capture/export flow exercised; export contained metrics and no prompt/user/assistant text. |
| Recall durable rollback | PASS | Recall removed the target turn and restored the associated derived state. |
| New Scene | PASS | New Scene state persisted across reload. |
| Major lazy UIs | PASS | Cold/lazy feature entry points opened successfully in production. |
| Live Cloud signed-out smoke | PASS | Signed-out Live Cloud surface/path smoke-tested. |

## Intentionally not covered by that pass

The production E2E run did **not** claim coverage for:

- actual video generation;
- authenticated Live Cloud end-to-end mutation/sync;
- a true mobile-OS process kill / app resume cycle;
- browser storage quota exhaustion in a real browser;
- very large archive / extreme-history stress beyond the tested fixtures.

Those remain separate risk areas rather than failed tests.

## Temporary E2E artifacts

The E2E harness used a temporary folder outside the project repo:
`C:\Users\FUJITSU\aigf_e2e_tmp`.

Known temporary artifacts included Playwright scripts, a local attachment, exported chat ZIPs, a photo ZIP, and a performance JSON sample. They were intentionally removed after the test and are **not** project source that should be recovered from HDD.

Known generated names included:
- `Cc_1790668003551.zip`
- `all_chats_1790668003934.zip`
- `Cc_photos_1790668149795.zip`
- `aigf-performance-2026-09-29T07-55-48-171Z.json`
- `e2e-attachment.txt`

## Performance sample observed during production E2E

One measured production sample was approximately:

- total: ~17,036 ms
- network: ~14,256 ms
- local pre-network: ~16 ms
- post-network render: ~15 ms
- strict review: ~10,653 ms

This single sample was diagnostic only. It was not used as evidence to weaken or skip the authoritative review architecture.

## Product / architecture conclusions

- Gemma/strict review remained authoritative.
- Jev remained shadow/diagnostic only.
- No threshold-based skip-Gemma behavior was introduced.
- The runtime had already been split into cold/lazy feature modules; the main bundle was well below the earlier ~925 kB baseline.
- Save & Exit's legacy modal path was found to be unreachable/dead during this audit and was not treated as a user-facing regression.

## Final 2026-09-29 local state known before the data-loss incident

The last known local HEAD after documenting this matrix was:

`7cf4c89a30ca23d3b5f5c65c84e91129243a7d01 Add production E2E regression matrix`

The worktree was clean at that point and was reported as approximately 167 commits ahead of the GitHub origin. The deployed runtime remained `eb20be4`; the commits after it were documentation-only.
