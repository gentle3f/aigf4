# AIGF Supabase Realtime Egress Hotfix — 2026-10-05

## Incident

Supabase organization usage showed a sudden egress spike starting 2026-09-29.

Observed in the Supabase Usage dashboard:
- billing-period egress used: 13.71 GB
- Free-plan allowance: 5 GB
- overage: 8.71 GB
- on 2026-09-29, Realtime Egress was about 1.002 GB and 91.4% of that day's egress
- PostgREST was about 96.8 MB; Storage/Auth were negligible

This timing coincided with the recovery/reinstall period, but code audit showed that a single active phone was sufficient to create the Realtime egress pattern.

## Root cause

`SupabaseCloudSyncManager.startRealtime()` subscribed to `postgres_changes` on:
- `wetapp_state`
- `wetapp_conversations`
- `wetapp_messages`
- `wetapp_media`

Every local cloud write could therefore be emitted back to the same device through Supabase Realtime.

The client did check `source_device_id` and ignored same-device events, but that check occurred only **after** the Realtime payload had already been sent to the client and counted as egress.

This is especially expensive because:
- message change payloads can contain full message content;
- state changes can contain the large state payload;
- ordinary sync can upsert conversations, changed messages and state in one cycle.

## Hotfix

1. Row-level Supabase Postgres Changes subscriptions are disabled.
2. `startRealtime()` now only tears down any stale channel and clears retry state.
3. Multi-device catch-up is retained through lightweight cloud-state revision probes.
4. Foreground/online pull checks first fetch only:
   `revision, updated_at, source_device_id`
5. If the known revision has not changed and there are no pending local changes, the app exits without downloading the state payload or enumerating messages/media.
6. Full pull remains available when the cloud revision genuinely changed, recovery is required, or the user explicitly reloads/reconciles cloud state.

## Safety

The existing conflict/recovery paths remain intact:
- pending local edits still use safe-recovery conflict handling;
- manual reload/recovery can still force a full pull;
- local archive transaction protection remains;
- state/message/media rollback boundary remains;
- no chat generation, review, memory, Jev, Group/Cc or media-generation behavior was changed.

## Validation

Post-hotfix validation:
- targeted Cloud Sync tests: 21/21 PASS
- full suite: 650/650 PASS
- TypeScript typecheck: PASS
- production build: PASS
- main bundle: ~360.60 kB minified / ~125.87 kB gzip
- git diff --check: PASS

## Research Capture

The unfinished Research Capture implementation was explicitly separated from this hotfix and is **not** part of the deployment.

Its draft is preserved at:
`C:\Workspaces\PROJECTS\AIGF_RESEARCH_DRAFT_20261005`

Future Research Capture design must avoid syncing full content for every turn through Supabase. Prefer local full-content capture plus compact cloud metadata and sampled high-value content.

## Monitoring

After production deployment:
- Supabase Realtime Egress should fall sharply because AIGF no longer opens row-level Postgres Changes subscriptions.
- Supabase Usage data refreshes with delay; compare the next full day's Realtime Egress against the 2026-09-29–2026-10-05 spike.
- If egress remains high, investigate another Supabase project/client before changing this hotfix.
