# G8E isolated cloud append checkpoint lab

Experimental, not an applied migration. The actual Supabase tables and RLS definitions from NEW_PROJECT_BOOTSTRAP.sql are rehearsed in a fresh in-memory PGlite database; synthetic auth functions emulate claims. No live database access or writes.

Reproduce locally from repo root:
```
npm install --prefix tmp/sync-lab --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.6.0
node tests/cloudAppendCheckpoint.pg.mjs
node node_modules/tsx/dist/cli.mjs --test tests/cloudAppendCheckpoint.test.ts
```

8/8 actual SQL checks, 13/13 targeted TS tests, tsc PASS. Existing app not wired to experimental RPC. Existing conversation and known state revision only; append-only text; no deletion, media, new conversations, concurrent legacy writers, or full two-way merge support. State payload must derive from the exact remote baseline plus intended changes. For lost response inspect exact resulting revision, history and payload; no automatic replay. PGlite single-engine sequential device simulation, not concurrent network clients or live Supabase auth. Legacy clients currently write messages/media before CAS, so do not enable this with legacy writers still active. Media bucket existing bootstrap cap 50 MiB, while local studio limit 100 MiB; must align on live capability before upload. Production and VPS unchanged.

## G8F App-to-SQL checkpoint integration
Run `node node_modules/tsx/dist/cli.mjs tests/cloudCheckpointApp.pg.mjs` after installing the pinned PGlite dependency above. Uses actual MemoryManager durable user/reply persistence and SupabaseCloudSyncManager applyRemoteData against isolated PostgreSQL with synthetic fixtures, two separate localStorage maps and managers. Five checks PASS: baseline V2 fingerprints, lost response after actual commit resolved by read-only exact revision+history+state digest (one RPC), stale baseline blocks RPC and preserves B's conflicting local reply, explicit synthetic reset/pull then B append and A restore, lost response before commit remains pending and never automatically resends. The checkpoint session only uploads text appends and preserves exact baseline cloud state unchanged; no UI or production transport wiring, no live Supabase requests. Local receipt stores only digests and revision, not text, and is verified before dispatch. Pending not-confirmed/conflict requires explicit future resolution; not implemented here. Separate maps simulate sequential devices, not simultaneous network clients; shared IndexedDB fixture is not full device isolation. Existing SQL lab 8/8 remains prior verified; current integration 5/5, targeted TS 31/31, tsc PASS. Next: integrate explicit conflict resolution and isolated transport/UI, align migration/cutover with legacy writers, then actual cloud and media acceptance.
