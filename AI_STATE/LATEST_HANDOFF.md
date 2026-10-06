# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261006_AIGF_SUPABASE_LIVE_CUTOVER_CONFIRMED.md`

Current objective:
- Supabase cutover is verified for auth, state, conversations, messages, Research Capture, and Realtime publication removal;
- production has already been redeployed after the new Supabase Production env values were updated;
- `wetapp.madproduction.ai` points to deployment `dpl_4TXpYwDGhey4PoXrqFxvdRuBDWqA`;
- verification counts from the NEW backend: auth=1, state=1, conversations=29, messages=578, research=4, large chat tables in Realtime=0;
- media metadata=0 and private Storage objects=0 remain the only conditional check: acceptable only if the phone has no locally stored private avatar blobs, character photos, or chat attachments.

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
