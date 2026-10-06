# AIGF Supabase Backend Cutover Handoff — 2026-10-06

## Current objective

Move AIGF/Wetapp cloud backup from the old Supabase organization/project that exceeded Free-plan egress to a fresh Supabase project, while preserving the phone as the authoritative local seed and keeping the Realtime self-echo fix.

This is a one-time backend migration, not a recurring quota-circumvention workflow.

## Why the migration is happening

Old Supabase organization `Gen` exceeded its Free-plan egress quota after an AIGF cloud-sync bug caused large same-device Realtime echo traffic.

Observed Supabase usage evidence:
- billing-cycle egress reached ~13.71 GB against a 5 GB Free allowance;
- Supabase warning later reported 12.46 GB against a 5.5 GB Fair Use threshold and threatened 402 restrictions after 2026-10-08;
- a dashboard tooltip for 2026-09-29 showed:
  - Realtime Egress: ~1.002 GB / 91.4%
  - PostgREST: ~96.8 MB / 8.6%
  - Storage: ~313 KB
  - Auth: ~29 KB

Root cause found in AIGF:
- row-level `postgres_changes` subscribed to `wetapp_state`, `wetapp_conversations`, `wetapp_messages`, `wetapp_media`;
- same-device writes were sent over Realtime first and only discarded client-side after egress had already been incurred;
- large state/message payloads therefore echoed back to the same phone.

## Completed egress hotfix

Production lineage contains:
- `7d2b21c Stop Supabase Realtime self-echo egress`

The hotfix:
- disables row-level Postgres Changes subscriptions;
- uses a lightweight `revision + updated_at + source_device_id` head probe before any heavy pull;
- skips full state/message/media downloads when revision is unchanged.

Validated before deployment:
- targeted cloud tests passed;
- full test suite passed;
- typecheck passed;
- production build passed.

## Research Capture

Research Capture was then completed and deployed:
- `9c097b4 Add low-egress research capture`
- `c5c1de9 Allow local research capture before migration`

Current production deployment before the Supabase cutover:
- deployment `dpl_35Lygs8d4krKTMzmmnPsfxwYXuTr`
- aliases include `wetapp.madproduction.ai` and `aigf4.vercel.app`
- live smoke was HTTP 200

Research Capture behavior:
- complete Group-turn content stays in phone IndexedDB by default;
- ordinary cloud record is compact metadata only;
- full-content cloud samples are selective/high-value;
- no Research Realtime subscription;
- local retention 30 days / max 1000 records;
- cloud retention 90 days once cloud table is available;
- missing research table disables further Research cloud retries for that app session while preserving pending local records.

Latest validation after missing-table fallback:
- targeted Research/Cloud tests: 25/25 PASS
- full suite: 662/662 PASS
- typecheck PASS
- production build PASS

## New Supabase project preparation

A new Supabase Free project has been created by the user under a different Supabase account/dashboard.

Do NOT store or repeat the new Project URL or Publishable Key in handoff files.

Vercel variables involved:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Important discovery:
- user initially updated only the Vercel **Development** values;
- assistant then copied those same new values internally to the existing **Production** env vars using Vercel tools;
- Production env vars now have fresh update timestamps and point to the new Supabase backend;
- however, environment changes do not affect the already-built production deployment until a new production deployment/redeploy occurs.

## New backend bootstrap

Added and committed:
- `bc33690 Prepare new Supabase backend bootstrap`

Files:
- `supabase/NEW_PROJECT_BOOTSTRAP.sql`
- `supabase/migrations/20261006000000_disable_wetapp_realtime.sql`

`NEW_PROJECT_BOOTSTRAP.sql` combines, in order:
1. original Wetapp cloud schema / RLS / private storage bucket;
2. state revision CAS migration;
3. Research Capture table migration;
4. final migration that explicitly removes the four large chat tables from `supabase_realtime`.

The final Realtime-removal migration covers:
- `wetapp_state`
- `wetapp_conversations`
- `wetapp_messages`
- `wetapp_media`

The bootstrap file was checked for generation errors after one formatting issue was caught and fixed:
- no literal `\\n` separators remain;
- contains state/messages schema;
- contains private Storage bucket setup;
- contains CAS function;
- contains Research table;
- contains final Realtime publication removal.

## Most recent user action — IMPORTANT

User opened the **new Supabase project SQL Editor**, pasted the full contents of:
`C:\Workspaces\PROJECTS\AIGF\supabase\NEW_PROJECT_BOOTSTRAP.sql`

Supabase result:
**“Success. No rows returned”**

Therefore the new backend schema bootstrap is now considered successfully applied.

This supersedes the older note saying the Research migration was not applied.

## Current cutover state

Completed:
- new Supabase project exists;
- new Supabase Project URL + Publishable key have been entered into Vercel Development and copied to Production;
- new backend SQL bootstrap ran successfully;
- new backend includes RLS, private `wetapp-private` bucket, state CAS, Research table;
- final migration disables publication of chat/state/media tables through Supabase Realtime;
- old Supabase project still exists and MUST NOT be deleted yet.

Not completed:
- production has **not yet been redeployed after the new Production env values were changed**;
- therefore the currently running production deployment may still contain the old Supabase URL/key embedded at build time;
- phone has not yet been reauthenticated against the new Supabase project;
- phone local data has not yet been verified as seeded into the new cloud;
- new Supabase row counts / media objects / Research backlog have not yet been verified;
- Authentication URL Configuration has not yet been confirmed in this handoff.

## Immediate next steps in the next chat

1. Use GEN-FUJI Local MCP as the main local tool; ignore transient `server is not initialized` errors by pinging/retrying.
2. Inspect current git status and preserve existing commits; do not redo completed egress/Research work.
3. Verify AIGF's actual Supabase auth flow before requiring extra URL Configuration changes.
4. Redeploy production so the already-updated Production env vars are compiled into the app.
5. Verify `wetapp.madproduction.ai` points to the new deployment and returns HTTP 200.
6. On phone, expect the old Supabase auth session to be invalid for the new project; sign in again using the permitted Wetapp owner identity if needed.
7. Because the new cloud is empty and the phone is the authoritative current copy, allow AIGF's initial sync to seed local state/conversations/messages/media to the new backend.
8. Verify cloud seed succeeded before deleting or abandoning the old backend:
   - state row exists;
   - conversations/messages have populated;
   - media metadata + `wetapp-private` Storage objects are present as applicable;
   - Research pending records can upload to `wetapp_research_turns`;
   - no four chat tables are published to Realtime.
9. Monitor new Supabase Usage; Realtime egress should remain near zero.
10. Do NOT delete the old Supabase project until the new cloud backup is proven complete.

## Git / repo state

Repo:
`C:\Workspaces\PROJECTS\AIGF`

Branch:
`perf/cleanup-send-latency-20260923`

Recent commits:
- `bc33690 Prepare new Supabase backend bootstrap`
- `c5c1de9 Allow local research capture before migration`
- `9c097b4 Add low-egress research capture`
- `7d2b21c Stop Supabase Realtime self-echo egress`
- `600dbba Document 200-record Jev production calibration`

At handoff creation, branch status showed it ahead of origin and there was a working-tree modification to:
- `AI_STATE/HANDOFF_20261006_AIGF_RESEARCH_CAPTURE_LOW_EGRESS.md`

Do not assume that modification is substantive; inspect before changing it.

## Durable operating rules

- GEN-FUJI Local MCP only for local filesystem/repo/command work.
- Never use Remote Desktop Commander.
- Never use Codex quota.
- Do not weaken MCP safety.
- Git commands may require:
  `git -c safe.directory=C:/Workspaces/PROJECTS/AIGF ...`
- Original commit identity:
  `gentle3f <gentle3f@gmail.com>`
  Use per-command identity only; do not alter global git config.
- No destructive changes to phone/local data.
- Old Supabase project remains a fallback until new cloud is verified.
- Do not re-enable row-level Supabase Realtime for large Wetapp tables.
- Research Capture stays observational only; Gemma remains authoritative and Jev remains shadow-only.
