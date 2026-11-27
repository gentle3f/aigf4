# V4 bounded world ledger backfill pilot

- Latest unreviewed turn first; thereafter oldest missing evidence. Existing valid source records remain; no full world rebuild. Three batches max per successful story-triggered chain, max eight sources per batch, existing adaptive retry bounded to four attempts. Partial-only or failed jobs do not spawn successors.
- New plan pendingCount enables transactional continuation only when more sources remain outside the initial batch. Smaller adaptive retries and partial coverage can defer remaining work to future turns. No mass replay at installation.
- Typecheck, 11/11 targeted tests, full PGlite suite passed. Three distinct jobs added 24 reviewed sources to existing 2/32, preserving the original observation and other world data. An initial fixture variable reference was fixed and rerun passed.
- Pilot database migration installed, trigger confirmed, 99 existing messages unchanged, zero active ledger jobs. No production change.
- New bundle SHA256 3b4553fa10ee1cf2751804fd3d728797132b44c21907a6872efaa53bf0063356; owner script tmp/v4-worker/UPGRADE_V4_LEDGER_BACKFILL_OWNER.sh SHA256 063cede8fb3374ee8664e79309c50324625347bd885d06f16451b490bbf8a245. Dependency guard and isolated runtime pass. Worker install and live multi-batch test pending.
- Prior persona backfill live test passed: 24/24 turns, two batches, seven memories, 48 fixture messages; prior 51 messages preserved. Group multi-batch only local fixture verified.
