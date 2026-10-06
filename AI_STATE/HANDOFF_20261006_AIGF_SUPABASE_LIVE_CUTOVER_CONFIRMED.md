# AIGF Supabase Cutover Verification Handoff — 2026-10-06

## Objective

Complete the one-time AIGF/Wetapp migration from the old Supabase backend to the new Supabase project while preserving the phone/local copy and not deleting the old backend until the new cloud is complete.

## Production cutover

Vercel project:
- `aigf4`

New Supabase Production env values were already in place before the first cutover redeploy.

Initial cutover deployment:
- `dpl_4TXpYwDGhey4PoXrqFxvdRuBDWqA`
- READY
- `wetapp.madproduction.ai` pointed to it
- live bundle Supabase endpoint differed from the pre-cutover deployment, proving production had switched away from the old project.

## New-project verification before repair

User ran:
- `supabase/VERIFY_NEW_PROJECT_CUTOVER.sql`

NEW project result:
- `auth_users = 1`
- `wetapp_state_rows = 1`
- `wetapp_conversations_rows = 29`
- `wetapp_messages_rows = 578`
- `wetapp_media_rows = 0`
- `wetapp_private_storage_objects = 0`
- `wetapp_research_turns_rows = 4`
- `large_chat_tables_still_in_realtime = 0`

This proved auth/state/Research/new endpoint worked, and Realtime publication removal worked, but data migration was incomplete.

## Old-project comparison

User ran:
- `supabase/COMPARE_OLD_PROJECT_CUTOVER.sql`

OLD project result:
- `auth_users = 1`
- `wetapp_state_rows = 1`
- `wetapp_conversations_rows = 29`
- `wetapp_messages_rows = 11079`
- `wetapp_media_rows = 45`
- `wetapp_private_storage_objects = 45`
- `wetapp_research_turns_rows = null`
- `large_chat_tables_still_in_realtime = 4`

Therefore the first new-project seed missed:
- about 10,501 previously synced message rows;
- all 45 previously synced media objects.

Do NOT delete the old project.

## Root cause found

The phone retained local IndexedDB sync indexes from the old Supabase backend:
- `wetappCloudMessageIndexV1`
- `wetappCloudMediaIndexV1`
- conversation/state indexes as well.

During the first seed into the empty new project:
- `pushMessages()` compared local messages against the old-backend message index and uploaded only rows whose hashes looked changed;
- `pushMedia()` compared local media against the old-backend media index and uploaded only changed blobs.

Because the indexes were not backend-scoped, previously synced old-project data was incorrectly treated as already present in the new project.

This explains the observed counts:
- conversations were all upserted: 29 vs 29;
- only 578 changed/new messages were uploaded;
- zero media uploaded because all 45 local media signatures were already marked synced in the stale index.

## Repair implemented

Commit:
- `14df270 Force full cloud reseed after backend cutover`

Repair:
- safe-merge protocol advanced to version 2;
- first v2 recovery pass forces a complete local message + media snapshot;
- forced snapshot ignores stale message/media indexes for upload selection;
- recovery uses `preserveRemote=true`, so it upserts local data without deleting remote rows;
- then it force-pulls/merges cloud + local;
- only after merge does the normal state CAS/final sync complete;
- no row-level Realtime is re-enabled.

Validation:
- full test suite: 664/664 PASS;
- typecheck PASS;
- production build PASS.

## Repair deployment

The repair commit was pushed to GitHub `main`.

Current repair production deployment:
- `dpl_Br94heSVwP7XxUTYeBup7hkYHiTu`
- commit `14df270db846143440db0a9479e256734c630f64`
- state READY
- aliases include `wetapp.madproduction.ai`

Live page now serves a new bundle after the repair deployment.

## Required user action now

On the phone:
1. fully reload/reopen `wetapp.madproduction.ai` so the new bundle executes;
2. leave the Live Cloud session signed in / open Live Cloud if needed;
3. safe-merge v2 should automatically perform the forced full reseed.

After the app reports cloud sync complete, run `supabase/VERIFY_NEW_PROJECT_CUTOVER.sql` again in the NEW Supabase project.

Expected direction:
- `wetapp_conversations_rows` remains around 29;
- `wetapp_messages_rows` should rise from 578 toward the full local history, expected around the old 11079 baseline if the phone still contains the complete history;
- `wetapp_media_rows` should rise from 0 toward 45;
- `wetapp_private_storage_objects` should rise from 0 toward 45;
- `large_chat_tables_still_in_realtime` must remain 0.

Exact message/media counts should be compared after reseed; do not assume equality until verified.

## Durable operating rules

- GEN-FUJI Local MCP only for local filesystem/repo/command work.
- Never use Remote Desktop Commander.
- Never use Codex quota.
- Do not weaken MCP safety.
- Do not expose/store Supabase URL or Publishable Key in handoff files.
- Do not delete the old Supabase project until the repaired new-cloud counts/content are accepted.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
