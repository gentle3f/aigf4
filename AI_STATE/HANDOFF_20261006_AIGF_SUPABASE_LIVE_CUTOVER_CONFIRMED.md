# AIGF Supabase Cutover Verification Handoff — 2026-10-06

## Objective

Finish verification of the one-time AIGF/Wetapp migration from the old Supabase backend to the new Supabase project without deleting the old project prematurely.

## Confirmed in this session

### Production redeploy completed after new Supabase env update

Vercel project:
- `aigf4`

Current live production deployment:
- `dpl_4TXpYwDGhey4PoXrqFxvdRuBDWqA`
- state: READY
- production alias: `wetapp.madproduction.ai`
- deployment created: 2026-10-06 15:24:08 HKT
- ready: 2026-10-06 15:24:31 HKT

The Production Supabase env vars had already been updated before this deployment:
- `VITE_SUPABASE_URL` updated about 15:18:15 HKT
- `VITE_SUPABASE_PUBLISHABLE_KEY` updated about 15:18:18 HKT

Therefore this deployment was built after the new Production Supabase configuration was in place.

### Live bundle endpoint fingerprint changed

Compared:
- current live production bundle on `wetapp.madproduction.ai`
- previous production deployment `dpl_35Lygs8d4krKTMzmmnPsfxwYXuTr`

Result:
- both bundles contain exactly one Supabase project endpoint;
- the current endpoint is different from the pre-cutover endpoint;
- endpoint values/keys were intentionally not written into this handoff.

This is direct evidence that current live production is no longer pointing at the old Supabase project.

### User-reported phone action

After the cutover deployment, the user reports:
- phone login completed;
- upload/sync was triggered.

Because current live production is confirmed to point to the different/new Supabase endpoint, a fresh phone login/upload performed on the current live app targets the new project.

This is strong cutover evidence, but exact cloud row/object counts have not yet been independently read from the authenticated Supabase backend.

## New verification helper

Added:
- `supabase/VERIFY_NEW_PROJECT_CUTOVER.sql`

This is read-only and returns:
- auth user count;
- `wetapp_state` row count;
- `wetapp_conversations` row count;
- `wetapp_messages` row count;
- `wetapp_media` row count;
- `wetapp_research_turns` row count;
- object count in private bucket `wetapp-private`;
- count of the four large Wetapp tables still present in `supabase_realtime`.

Expected final Realtime result:
- `large_chat_tables_still_in_realtime = 0`

## Existing backend bootstrap remains valid

The new backend bootstrap was already reported by the user as successfully applied in the new Supabase SQL Editor:
- result: “Success. No rows returned”

It includes:
- Wetapp schema;
- RLS;
- private `wetapp-private` storage bucket;
- state CAS;
- Research Capture table;
- final removal of `wetapp_state`, `wetapp_conversations`, `wetapp_messages`, and `wetapp_media` from `supabase_realtime`.

## What remains before declaring migration fully closed

1. Run/read the read-only verification counts in the NEW Supabase project.
2. Confirm:
   - at least one auth user exists;
   - state row exists;
   - conversations/messages are populated as expected;
   - media rows/storage objects are present when applicable;
   - Research rows can populate;
   - `large_chat_tables_still_in_realtime = 0`.
3. Observe new Supabase usage; Realtime egress should remain near zero.
4. Do NOT delete the old Supabase project until the new-cloud data counts/content are accepted.

## Repo state before this handoff update

Repo:
`C:\Workspaces\PROJECTS\AIGF`

Branch:
`perf/cleanup-send-latency-20260923`

Important lineage:
- `11a593a Document Supabase backend cutover`
- `bc33690 Prepare new Supabase backend bootstrap`
- `c5c1de9 Allow local research capture before migration`
- `9c097b4 Add low-egress research capture`
- `7d2b21c Stop Supabase Realtime self-echo egress`

Do not redo the egress hotfix, Research Capture work, schema bootstrap, or production redeploy.

## Durable operating rules

- GEN-FUJI Local MCP is the main/only local filesystem/repo/command tool.
- Never use Remote Desktop Commander.
- Never use Codex quota.
- Do not weaken MCP safety.
- Do not expose/store the Supabase Project URL or Publishable Key in handoff files.
- Do not delete the old Supabase project yet.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
