# V4 pilot deployment — prepared, NOT enabled
# All deployment must use owner-approved service provisioning; existing AIGF
# Queue ops key only permits queue source deployment, not new system services.

## 1. Build locally
From this branch:
  npm ci --ignore-scripts
  node scripts/buildGenerationWorkerV4.mjs
  npm exec -- tsx --test tests/generationWorkerRunner.test.ts
Output: tmp/v4-worker/worker.mjs, SHA printed by build.
The bundle has external dependencies pg and opencc-js; deploy only the minimal server/v4-runtime/package.json and package-lock.json and run npm ci --omit=dev --ignore-scripts. Minimal runtime npm audit returned 0 vulnerabilities. Node 22+ required.

## 2. Prepare only the existing isolated AIGF-SYNC-PILOT project (hmrcvjxdmedrjjcjbtmd)
Apply wetapp_generation_outbox_v4.sql then wetapp_generation_worker_v4.sql after reviewed backup and schema check. V3 receipt RPC already exists. V4 schema now installed; see deployment update below.
Create dedicated LOGIN role aigf_v4_pilot_worker with a random password via owner-approved database administration. Grant membership ONLY in aigf_generation_worker. No direct tables, superuser, createdb, createrole or bypassrls.
Set the pilot-only DB connection string in /etc/aigf-v4/database-url, mode 0600 root owner. Use verified TLS. For a Supabase session pooler use role.projectref username; no URL query options. Never use the postgres role or production credentials.
Set existing queue authorization token in /etc/aigf-v4/queue-token through owner-approved provisioning; do not print it.

## 3. Tencent service
Install the bundled worker and locked runtime dependencies under /opt/aigf-v4, owner root, read-only to dedicated service account aigf-v4.
Install server/aigf-generation-v4.service as /etc/systemd/system/aigf-generation-v4.service.
Before enabling, run the same service in --check mode with LoadCredential, confirm V4_WORKER_DB_ROLE_PASS. The main service is independent of the existing aigf-gen Queue.
Run the service with V4 frontend flag still OFF, and no admitted real jobs. Verify READY.
Use one synthetic admitted message and workflow with unique IDs; disconnect all clients, check outbox status + database reply and chronicle. Test reboot recovery. No private conversation needed.
Only after real acceptance and review of concurrent revision handling, activate frontend V4 flag on dedicated preview.

## Blockers
- Existing Tencent forced-command ops receiver does not authorize installing new service accounts, credentials, systemd units or files outside the Queue source deployment.
- Pilot SQL installed; new dedicated DB login/credentials are not provisioned. No new service running.
- Worker finalizer currently supports single-character workflows and chronicle/director updates only. Memory/group processing and global revision conflict behavior remain open.
- Existing full app dependency tree audit reports 8 vulnerabilities; the minimal V4 worker runtime audit is clean (0). Full-app dependency remediation is separate.

## 2026-11-27 pilot deployment update
- V4 SQL installed via Supabase MCP in AIGF-SYNC-PILOT only. Existing messages=9 and states=1 unchanged; jobs=0. Admission/worker execute grants and deferrable marker trigger verified; anonymous admission, direct client outbox insert and worker direct message access denied. Existing V3 security-definer warning and Auth leaked-password protection warning remain; no V4 security advisor finding. SQL executor postgres has ADMIN OPTION on worker role, but SET ROLE is not granted; actual worker login still unverified.
- Generated owner installer: tmp/v4-worker/INSTALL_V4_PILOT_OWNER.sh. Build commands: node scripts/buildGenerationWorkerV4.mjs; node scripts/buildV4PilotOwnerInstaller.mjs. Owner runs in Tencent terminal, supplies pilot session-pooler admin URI at hidden prompt, provisions dedicated login with random password locally, installs worker and existing queue credential into separate service. Production project rejected by provisioning code. No admin credential sent in chat or persisted. No real generation job submitted yet.
- Installer stops on preexisting service/config/role; if it fails after creating files, inspect partial state before retry. Node 22+ and npm must already be available; no automatic system package changes.
