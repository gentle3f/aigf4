# G8E isolated cloud append checkpoint lab

Experimental, not an applied migration. The actual Supabase tables and RLS definitions from NEW_PROJECT_BOOTSTRAP.sql are rehearsed in a fresh in-memory PGlite database; synthetic auth functions emulate claims. No live database access or writes.

Reproduce locally from repo root:
```
npm install --prefix tmp/sync-lab --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.6.0
node tests/cloudAppendCheckpoint.pg.mjs
node node_modules/tsx/dist/cli.mjs --test tests/cloudAppendCheckpoint.test.ts
```

8/8 actual SQL checks, 13/13 targeted TS tests, tsc PASS. Existing app not wired to experimental RPC. Existing conversation and known state revision only; append-only text; no deletion, media, new conversations, concurrent legacy writers, or full two-way merge support. State payload must derive from the exact remote baseline plus intended changes. For lost response inspect exact resulting revision, history and payload; no automatic replay. PGlite single-engine sequential device simulation, not concurrent network clients or live Supabase auth. Legacy clients currently write messages/media before CAS, so do not enable this with legacy writers still active. Media bucket existing bootstrap cap 50 MiB, while local studio limit 100 MiB; must align on live capability before upload. Production and VPS unchanged.
