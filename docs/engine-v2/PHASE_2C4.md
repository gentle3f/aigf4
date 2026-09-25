# Engine V2 Phase 2C4: Group Strict-Review Attempt Trace

Phase 2C4 completes observability parity for normal/Cc single and group turn paths.

- Group strict-review now passes the same optional `GenerationTrace` used by its generation stage into the shared Phase 2B3 reviewer transport.
- The shared transport records one metadata-only reviewer attempt per actual request: `keep`, `revise`, `invalid`, `error`, or `aborted`.
- Error codes remain closed: `INVALID_RESPONSE`, `TIMEOUT`, `UNKNOWN`, and `ABORTED`. Invalid parsing marks the attempt before entering the existing catch path, preventing duplicate records.
- Group generation primary/repair/fallback records remain only in `trace.attempts`; reviewer records remain only in `trace.strictReview.attempts`.
- Broad group timings remain owned by the existing group adapter: generation latency, review-stage latency, total latency, and final accepted/error/aborted outcome.
- The shared collector remains metadata-only, process-local, bounded to 50 traces, and has no persistence or network telemetry.
- Group scene application remains downstream in `getResponse`; tracing and strict review do not commit room state.

No prompt, reviewer route, retry, parser, validation, application, scene, or model behaviour changes are intended.
