# Latest AIGF Handoff

Authoritative current development handoff:
- `AI_STATE/HANDOFF_20261006_AIGF_RESEARCH_CAPTURE_LOW_EGRESS.md`
- Research Capture is locally complete/validated but not deployed until the Supabase migration is applied.

Recovered authoritative baseline:
- `AI_STATE/HANDOFF_20261005_AIGF_RECOVERED_AUTHORITATIVE.md`

Recovered production runtime baseline:
- recovery source commit `d45359c Recover latest AIGF runtime from Vercel eb20be4`
- Vercel deployment `dpl_4xLXbtKfgnvHseC2NWGYsBQAYkqb`
- deployed runtime content corresponding to lost local-only commit `eb20be4187aa531c9b9c8ce80e54c1b39051a8ff Add production favicon`

Reconstructed final production E2E documentation:
- `AI_STATE/HANDOFF_20260929_AIGF_PRODUCTION_E2E_REGRESSION.md`
- `AI_STATE/PRODUCTION_E2E_REGRESSION_MATRIX_20260929.md`

Latest production hotfix:
- `AI_STATE/HANDOFF_20261005_AIGF_SUPABASE_EGRESS_HOTFIX.md`
- Supabase row-level Realtime self-echo disabled after a 13.71 GB egress incident; lightweight revision-head polling retains cloud catch-up without normal same-device payload echo.

Latest Jev real-production evidence:
- `AI_STATE/HANDOFF_20261005_AIGF_JEV_REAL_PROD_200.md`
- 200-record Group Gate V2 cohort analyzed; Gemma remains authoritative and no skip-Gemma threshold is approved.

Important late surviving handoffs:
- `AI_STATE/HANDOFF_20260929_AIGF_BROAD_RELIABILITY_AUDIT.md`
- `AI_STATE/HANDOFF_20260929_AIGF_PERFORMANCE_DIAGNOSTICS_EXPORT.md`
- `AI_STATE/HANDOFF_20260929_AIGF_MEMORY_V5_DIAGNOSTICS.md`
- `AI_STATE/HANDOFF_20260929_AIGF_MESSAGE_RECALL_HARDENED.md`
- `AI_STATE/HANDOFF_20260929_AIGF_MEMORY_V5_DEEP_RECALL.md`
- `AI_STATE/HANDOFF_20260929_AIGF_PHOTO_FALLBACK_LADDER.md`

Branch:
- `perf/cleanup-send-latency-20260923`

Latest local validation:
- full suite **661/661 PASS**
- typecheck PASS
- production build PASS
- Research Capture remains undeployed pending Supabase migration
- main JS ~360.60 kB minified / ~125.87 kB gzip
- npm production audit: 0 vulnerabilities
- Vercel recovery manifest: 534/534 files downloaded, 0 failed

Git lineage warning:
- GitHub history survived only through `19fc7d5`.
- Later runtime content was recovered from Vercel, not from the lost Git objects.
- Do not pretend the new recovery commit is the original `eb20be4` object.
- The final pre-loss local HEAD was known as `7cf4c89`, with post-`eb20be4` changes being documentation-only.

Mandatory:
- GEN-FUJI Local MCP only.
- No Codex quota.
- No Remote Desktop Commander.
- Do not weaken MCP safety.
- Do not redo completed Memory V5, recall, photo fallback, Jev shadow, decomposition, performance diagnostics, or reliability work without evidence.
- Prioritize real user-observed failures.
