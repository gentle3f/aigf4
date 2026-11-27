# V4 World Ledger pilot update

- Independent post-chat world-ledger task, scheduled on successful V4 story reply. Reuses the existing world ledger prompt, quote validation, source coverage, recent batch selection, and adaptive prefix halving (maximum four attempts).
- Stable queue attempt ID for transport recovery; a new ID only for a durably recorded adaptive retry. Source SHA-256 and world creation identity checked before applying; no rewriting chat history. Commits only the target world's ledger and defers during active chat. Other worlds and memories remain intact.
- Local isolated PGlite end-to-end: actual story completion trigger, lost acknowledgement, single submission, two reviewed sources and one validated observation; chat unchanged. 17/17 targeted tests pass. Typecheck and bundle pass.
- Pilot Supabase migration installed, 31 messages unchanged, zero ledger tasks at installation. Worker RPC grant true, authenticated claim and direct worker table access false.
- Existing memory worker upgrade confirmed by owner; live memory smoke fixture finished with checkpoint 8 and 5 memories, source aigf-vps-memory-v4.
- Build: node scripts/buildGenerationWorkerV4.mjs; node scripts/buildV4LedgerOwnerUpgrade.mjs.
- Bundle SHA256 49f7055a15cc9005a607013445a009aa6d0039826b11c87ebb8336e2c47e6937. Owner upgrade script tmp/v4-worker/UPGRADE_V4_LEDGER_OWNER.sh SHA256 f18234f9262378bba9fc30927fb2b1d30f46bac87927d6c6ddaf3ccf591ca606.
- Actual ledger worker upgrade and live provider test still pending. Old worker remains operational. No production change. Native sync and group chat not covered; backlog catch-up beyond recent batches remains explicit work.
