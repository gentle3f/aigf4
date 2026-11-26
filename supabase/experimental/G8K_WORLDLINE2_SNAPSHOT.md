# G8K Worldline 2 real-state checkpoint laboratory
Base 7a57e34. Integrates existing Worldline 2 registry/chronicle, source-validated ledger, director and Fixed/Variable Prompt settings into G8J experimental SQL snapshots. Not connected to runtime or live cloud.
Commands:
- npm install --prefix tmp/sync-lab --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.6.0
- npm exec -- tsx --test tests/storySnapshotLab.test.ts tests/worldlineRecall.test.ts tests/worldline2Prompt.test.ts tests/durableWorldlineTurn.test.ts
- npm exec -- tsx tests/storySnapshotLab.pg.mjs
- npm run typecheck
Capture repairs chronicle against retained history, excludes invalid ledger evidence, clears stale turn-specific override, and retains fixed/director preferences. Restore requires matching exact history fingerprint, normalizes and verifies records, ledger and preferences; preserves unrelated stories; refuses divergent local state absent explicit expected baseline; rolls back preceding local writes on a simulated one-time quota error. No guarantee of atomic localStorage writes if process crashes or rollback itself fails. SQL lab uses synthetic owner and separate local storage maps, not real devices; verifies actual application snapshots on append/restore/recall and stale revision rejection. 21/21 selected TS tests; 2/2 isolated actual SQL tests. No live data or model API calls.
Remaining: authenticated transport, runtime submit/confirm/recall wiring, legacy writer coordination, Worldline 1 adapter, settings-only/media synchronization and real device acceptance. SQL is experimental, not a migration.
