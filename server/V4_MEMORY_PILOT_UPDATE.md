# V4 persona memory pilot update

- Local browser memory reducer is shared with the server. Existing cadence, manual exclusions, source IDs, importance filtering and deduplication are retained.
- Completed eligible ordinary persona chats enqueue a separate memory task. An immutable request is saved before the first provider call. Lost acknowledgement is recovered by the same queue job ID. Memory commits update only the target persona, never the conversation.
- Database guards defer a memory commit while any V4 chat for that user is accepted or queued. Changed evidence or memory state invalidates a result rather than overwriting it.
- Initial scope: ordinary single-persona turns only, one eligible batch (same restriction as previous browser VPS route). Worldline ledger, group memory, multi-batch backfill remain separate work.
- Synthetic local E2E: 8th turn, no browser, lost submit acknowledgement, one memory and checkpoint saved, 16 chat messages unchanged.
- Pilot project hmrcvjxdmedrjjcjbtmd: memory outbox migration installed, worker RPC grant confirmed, authenticated claim and worker direct table access denied; existing 15 messages unchanged, zero memory tasks at installation.
- Build: node scripts/buildGenerationWorkerV4.mjs; node scripts/buildV4MemoryOwnerUpgrade.mjs.
- New VPS bundle sha256 ed94906c3f359f06e76a419b9447416259dd19b763a8b8d61757c65e1b2fe900. Owner upgrade script tmp/v4-worker/UPGRADE_V4_MEMORY_OWNER.sh sha256 ba1c400ef8a6ab06a9efb153bf78ba4db929121eec3dccd56c75dcc3fdbee141.
- Existing restricted ops receiver only updates the Queue; owner must upgrade the separate V4 service. Script checks old/new hash, tests existing credentials and CA, backs up old bundle, restarts only V4, rolls back on failure. No new credentials.
- Actual worker upgrade and live memory generation NOT yet verified. Production unchanged.
