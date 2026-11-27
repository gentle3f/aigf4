# V4 server-owned generation — 2026-11-27

Goal: after server acceptance, all browser tabs and devices may go offline; VPS completes generation and persists the reply before any device reconnects.

Implemented locally:
- Atomic V4 acceptance RPC stores message, immutable workflow plan, and durable job in a single commit.
- Private outbox worker RPCs: lease/claim, release, failure, atomic reply + state completion.
- Server worker core uses GET before POST with the exact durable job ID. Unknown accepted POST can be recovered within 12h (queue retains terminal results 24h); known queued job missing is never recreated.
- Restricted NOLOGIN role, no direct business-table permissions. No production grants or installation.
- Local PGlite 7 admission + 6 lifecycle + 1 integrated fixture pass. Integrated fixture simulates client disconnect, lost submit ack, worker restart, one reply written exactly once. Queue/model is mocked in that test; prior actual queue smoke is separate.
- Shared single-character finalizer uses existing reply rules, language normalization, wardrobe parsing, review application, and deterministic Worldline chronicle/director updates. Immutable finalizer context stored with admission; its latest user text must match the saved message. Worker adapter and actual finalizer tested together in local PGlite with synthetic model output. Group finalization and asynchronous persona/world ledger extraction not yet ported.
- Run: npm exec -- tsx scripts/testGenerationOutboxV4.mjs (requires existing local tmp/sync-lab PGlite).

Not yet wired:
1. Complete parity and wire production worker runner to finalizer. Port world ledger and persona/group memory/scene processing; never substitute raw candidate text for processed chat.
2. V4 admission is now wired to the actual single-character Send path, disabled by default via VITE_AIGF_SERVER_GENERATION_V4. Complete plan/context and marked user message use a single RPC, with exact durable operation ID and receipt checks. Legacy sync cannot commit an orphan marker, even at the SQL layer. Need real browser acceptance, local unsent draft retry/recall UX, and support for special/group turns.
3. Replace strict global revision conflict with reviewed per-conversation/state patch merge. Current prototype conservatively marks a conflict on ANY intervening state revision. Do not silently overwrite newer state.
4. Provision scoped database login and a persistent VPS process using existing localhost queue; no broad DB grants.
5. Isolated live DB installation + synthetic model request; terminate both browser clients before worker completion, verify persisted reply via new session.
6. Port shared behavior to AIGF and Worldline1, then cutover after acceptance. Existing production and legacy messages unchanged.

2026-11-27 admission tests: 29/29 targeted TS tests, 16/16 SQL/integrated fixture checks, typecheck PASS. No deployment. V4 feature flag is off; current preview remains V3. Status RPC owner-only; direct outbox writes from client denied. Before enabling V4, provision worker DB role and persistent service, finish context conflict and unsupported turn handling. The UI must not claim delivery before exact server receipt.
