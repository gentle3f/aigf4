# V4 bounded memory backfill pilot

- Both memory planners resume oldest pending turns at existing checkpoint with two-turn overlap. One request per batch, up to 16 turns. Never reset checkpoint for old summary version. At least eight unprocessed turns required; malformed historical turns and missing group presence remain deferred.
- Database successor triggers after successful memory commit; at most three batches per chain, fresh immutable job IDs, no historical replay on install. No mass backfill triggered; remaining backlog waits for next eligible chat or future explicit backfill.
- 11/11 targeted tests and full isolated PGlite suite pass, including persona checkpoint 8->22->36->50, group 8->22->36->48, six unique requests, preserved prior memories, no absent member knowledge. Initial integrated fixture encountered unrelated pending mock tasks; corrected fixture setup and reran successfully.
- Pilot migration installed, both triggers confirmed, 51 existing messages unchanged, zero active memory tasks. Production untouched.
- New bundle SHA256 0b52a672d890f3bf7558e4a093d9b1ccc9c843d769adbe5d41fbd9c9a60d8770; owner upgrade script tmp/v4-worker/UPGRADE_V4_BACKFILL_OWNER.sh SHA256 7bd44494fe18aeec49ac2dd505fe45ab8d6759f1c1a6544ba96b5abf923ab33b. Typecheck, dependency guard and isolated runtime passed.
- Existing worker still installed; actual new backfill execution unverified until owner update. No production historical data migrated. Historical world ledger backlog and special modes are separate tasks.
