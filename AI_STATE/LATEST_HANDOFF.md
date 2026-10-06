# Latest AIGF Handoff

Authoritative current development handoff:
- `AI_STATE/HANDOFF_20261006_AIGF_SUPABASE_CUTOVER.md`

Current objective:
- complete one-time cutover from the old over-quota Supabase project to the new Supabase project;
- production Vercel env vars have already been updated to the new Supabase URL + Publishable key;
- new Supabase project bootstrap SQL has run successfully with “Success. No rows returned”;
- **production still needs a redeploy after those env changes**, then phone re-auth / seed / verification.

Recent relevant commits:
- `bc33690 Prepare new Supabase backend bootstrap`
- `c5c1de9 Allow local research capture before migration`
- `9c097b4 Add low-egress research capture`
- `7d2b21c Stop Supabase Realtime self-echo egress`
- `600dbba Document 200-record Jev production calibration`

New backend bootstrap:
- `supabase/NEW_PROJECT_BOOTSTRAP.sql`
- includes chat/state/messages/media schema, RLS, private Storage bucket, state CAS, Research table;
- final migration explicitly removes Wetapp chat/state/media tables from `supabase_realtime`.

Old Supabase project:
- keep it intact until the new backend has been seeded from the phone and verified complete;
- do not re-enable row-level Realtime for the large Wetapp tables.

Research Capture:
- deployed;
- local full-content archive + compact cloud metadata / selective full samples;
- no Realtime;
- latest validation before cutover: targeted 25/25 PASS, full suite 662/662 PASS, typecheck PASS, production build PASS.

Recovered authoritative baseline:
- `AI_STATE/HANDOFF_20261005_AIGF_RECOVERED_AUTHORITATIVE.md`

Latest Jev real-production evidence:
- `AI_STATE/HANDOFF_20261005_AIGF_JEV_REAL_PROD_200.md`

Branch:
- `perf/cleanup-send-latency-20260923`

Mandatory:
- GEN-FUJI Local MCP only.
- Transient `server is not initialized` errors: ping/system_info and retry.
- No Codex quota.
- No Remote Desktop Commander.
- Do not weaken MCP safety.
- Do not redo completed recovery, Jev, egress-hotfix, or Research Capture work without evidence.
