# Engine V2 Phase 2C3: Group Generation Attempt Trace

Phase 2C3 extends the existing group `GenerationTrace` with one metadata-only
attempt record for every actual `generateChatTextWithTimeout` request in the
legacy group generator. The existing route remains primary plus one repair on
route index zero, followed by one attempt for every fallback route.

Attempts use the existing `primary`, `repair`, and `fallback` phases. Accepted
records are made only after the existing group parser and current rejection
checks accept the candidate. A provider result rejected by parsing, repetition,
or the existing selected-participant validation is recorded as `invalid` with
`INVALID_RESPONSE` before the legacy catch continues unchanged. Provider errors
use only `TIMEOUT` or `UNKNOWN`; existing aborts use `ABORTED`.

The Phase 2C2 broad generation/review/total timing remains unchanged. Group
strict-review attempts remain untraced, and `strictReview.attempts` remains
absent. Records remain metadata-only in the shared bounded 50-record in-memory
collector with no persistence or network telemetry. Proposed scene/state still
returns unchanged to the existing downstream `getResponse` commit boundary.
