# Engine V2 Phase 2B2: Single-Generation Attempt Trace

Phase 2B2 extends the existing Phase 2B1 in-memory trace for normal and Cc
single-character chats only. It observes each actual primary generation model
request without changing the generation route, retry count, prompts, sampling,
validation, continuation limit, or response handling.

## Coverage

- Primary route, first request: `primary`
- Primary route, later request: `repair`
- Later model routes: `fallback`
- Truncated-response follow-up calls: `continuation`

The original route index is retained and request attempt indexes are recorded
as 1-based metadata. A trace is optional: calls without one preserve legacy
behaviour. Group generation and strict-review model attempts are intentionally
not instrumented in this phase.

## Metadata and privacy

Each attempt may include phase, returned model, route index, attempt index,
latency, provider token counts, finish reason, and one of `accepted`,
`invalid`, `error`, or `aborted`. No prompt, reply, message, candidate,
provider body, credential, or arbitrary error text is stored.

Error codes are a closed set: `ABORTED`, `TIMEOUT`, `INVALID_RESPONSE`, and
`UNKNOWN`. Trace writes are best-effort and remain process-local in the
existing bounded 50-record collector; nothing is persisted or sent over the
network.

## Behaviour guarantee

Tracing happens around existing model calls only. It neither initiates nor
retries a request, and it does not affect continuation merging, strict review,
or final persistence. Existing errors retain their original propagation and
retry behaviour.
