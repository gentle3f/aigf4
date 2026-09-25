# Engine V2 Phase 2C2: Group Broad Trace

Phase 2C2 connects the existing metadata-only `GenerationTrace` collector to
the group adapter seam. Every group turn creates one `mode: 'group'` trace and
wraps the unchanged legacy sequence:

```text
runGroupTurnAdapter(
  generateCandidate: runRoomConversationGeneration(...),
  reviewCandidate: strictReviewGroupReply(...),
)
```

The trace records only generation-stage latency, strict-review-stage latency,
whole-seam latency, and the terminal `accepted`, `error`, or `aborted` outcome.
It is finalized before the existing downstream `getResponse` commit boundary,
so `committed` remains unset and proposed room scene/state is never written by
the adapter or trace.

Group generation attempts and individual group strict-review attempts remain
untraced. Traces use the same bounded, defensive-copy, in-memory 50-record
collector as normal and Cc single turns, with no persistence or network
telemetry. Existing Phase 2B single/Cc tracing is unchanged.
