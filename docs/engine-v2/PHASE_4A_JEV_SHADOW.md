# Engine V2 Phase 4A: Jev Shadow Gate V1

Review Pipeline Extraction V1 is closed. Phase 4A adds an observational Jev shadow only; Gemma strict review remains the only production decision path.

- The browser calls same-origin `POST /api/openrouter-decisions`; the Vercel endpoint requires the existing signed Wetapp session and keeps `OPENROUTER_API` or `OPENROUTER_API_KEY` server-side.
- The endpoint uses only `POST https://openrouter.ai/api/alpha/decisions` and allowlists the pinned `typesafe/jev-1.13` model. It supplies one fixed `choice` route question plus seven fixed `noul` semantic-risk checks.
- The input is the existing minimized `ReviewState`: latest user text, current reality/scene/participants/wardrobe, empty already-available memory evidence, candidate text, and a group proposed scene where available. It performs no memory retrieval or database work.
- States are never silently truncated. A state above the explicit 48,000-character serialized cap is unavailable. The server uses a 2,500 ms upstream timeout and no retry.
- Jev starts best-effort beside strict review and is never awaited by Gemma, response persistence, rendering, or haptics. No confidence threshold, skip logic, rewrite, routing authority, or state-write authority exists.
- Observations are bounded to 50 in-memory metadata-only records. No local storage, database, cloud, network analytics, or private text telemetry is used.
- `falseNegativeCandidate` means only `Jev clean + Gemma revise`; it is a calibration candidate, never a proven error or production decision.
