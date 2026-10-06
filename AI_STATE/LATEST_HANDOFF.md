# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261006_AIGF_SUPABASE_LIVE_CUTOVER_CONFIRMED.md`

Current objective:
- finish final verification of the one-time Supabase migration;
- production has already been redeployed after the new Supabase Production env values were updated;
- `wetapp.madproduction.ai` now points to deployment `dpl_4TXpYwDGhey4PoXrqFxvdRuBDWqA`;
- the current live bundle's Supabase endpoint is different from the pre-cutover production bundle's endpoint;
- user reports phone re-login + upload after cutover;
- exact new-backend row/object counts are the remaining verification step.

Verification helper:
- `supabase/VERIFY_NEW_PROJECT_CUTOVER.sql`
- read-only;
- checks auth user count, state/conversation/message/media/research counts, private Storage object count, and whether any of the four large Wetapp tables remain in `supabase_realtime`.
- expected: `large_chat_tables_still_in_realtime = 0`.

Existing backend bootstrap:
- `supabase/NEW_PROJECT_BOOTSTRAP.sql`
- already applied successfully by the user in the NEW Supabase SQL Editor;
- includes RLS, private `wetapp-private` bucket, state CAS, Research table, and Realtime publication removal.

Production facts:
- Supabase Production env values updated around 15:18 HKT on 2026-10-06.
- current production deployment created around 15:24 HKT and reached READY around 15:24:31 HKT.
- this proves the current deployment was built after the new env values were present.

Old Supabase project:
- keep intact until new-project counts/content are accepted;
- do not delete it yet.

Research Capture:
- deployed;
- no row-level Realtime;
- latest validation before cutover: targeted 25/25 PASS, full suite 662/662 PASS, typecheck PASS, production build PASS.

Important lineage:
- `11a593a Document Supabase backend cutover`
- `bc33690 Prepare new Supabase backend bootstrap`
- `c5c1de9 Allow local research capture before migration`
- `9c097b4 Add low-egress research capture`
- `7d2b21c Stop Supabase Realtime self-echo egress`

Branch:
- `perf/cleanup-send-latency-20260923`

Mandatory:
- GEN-FUJI Local MCP only for local work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not expose/store Supabase URL or Publishable Key in handoff files.
- Do not redo completed recovery, Jev, egress-hotfix, Research Capture, backend bootstrap, or production redeploy without evidence.
