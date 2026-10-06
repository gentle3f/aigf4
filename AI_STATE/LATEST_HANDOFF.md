# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261006_AIGF_SUPABASE_LIVE_CUTOVER_CONFIRMED.md`

Current status:
- production is on the NEW Supabase backend;
- first seed was incomplete because old-backend local sync indexes were reused;
- OLD project counts: conversations 29, messages 11079, media 45, private storage objects 45;
- NEW project before repair: conversations 29, messages 578, media 0, private storage objects 0, research 4;
- NEW project correctly has `large_chat_tables_still_in_realtime = 0`.

Root cause:
- stale `wetappCloudMessageIndexV1` / `wetappCloudMediaIndexV1` caused previously synced local data to be skipped when seeding the new backend.

Repair:
- commit `14df270 Force full cloud reseed after backend cutover`;
- safe-merge protocol v2 forces a complete local message/media upsert before pull/merge;
- preserve-remote mode prevents destructive deletion during recovery;
- full suite 664/664 PASS, typecheck PASS, production build PASS.

Production repair deployment:
- `dpl_Br94heSVwP7XxUTYeBup7hkYHiTu`
- READY
- commit `14df270db846143440db0a9479e256734c630f64`
- `wetapp.madproduction.ai` is aliased to it.

Next action:
- phone must fully reload/reopen Wetapp so safe-merge v2 runs;
- after cloud sync completes, run `supabase/VERIFY_NEW_PROJECT_CUTOVER.sql` again in the NEW project;
- expect messages/media/storage to rise toward the old-project baseline;
- Realtime count must stay 0.

Do NOT delete old Supabase yet.

Mandatory:
- GEN-FUJI Local MCP only for local work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not expose/store Supabase URL or Publishable Key in handoff files.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
