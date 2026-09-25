# Engine V2 Phase 2B3: Single Strict-Review Attempt Trace

Phase 2B3 extends the existing in-memory `GenerationTrace` for normal and Cc
single-character chat strict review. It records one metadata-only entry for
each actual reviewer-model request. Group strict review remains untraced, and
Phase 2B2 generation attempt tracing is unchanged.

## Attempt metadata

`strictReview.attempts` stores the returned model, 1-based reviewer attempt
index, latency, provider token counts, finish reason, and one terminal outcome:
`keep`, `revise`, `invalid`, `error`, or `aborted`.

The closed error-code set remains `ABORTED`, `TIMEOUT`, `INVALID_RESPONSE`,
and `UNKNOWN`. Invalid parsed review responses use `INVALID_RESPONSE`; timeout,
fatal request-controller abort, and other failures use the existing sanitized
classification rules.

## Behaviour and privacy

The existing reviewer route, one-request-per-reviewer iteration, parser,
fallback, all-reviewers-fail return value, and strict-review application remain
authoritative. Tracing neither sends nor retries a request. The broad Phase 2B1
`stages.reviewLatencyMs` remains the total review-stage duration.

No prompt, candidate, review response, issues list, history, memory, wardrobe,
provider body, credential, or raw error text is retained. Traces remain in the
existing bounded 50-record in-memory collector only; there is no persistence or
network telemetry.
