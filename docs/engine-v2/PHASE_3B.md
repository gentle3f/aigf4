# Engine V2 Phase 3B: Strict-Review Transport Adapter

Phase 3B extracts the one-request strict-review transport boundary into `strictReviewAdapter`.

```
strictReviewSingleReply / strictReviewGroupReply
  -> requestStrictReviewDecision
  -> runReviewPipeline
  -> index.tsx injected attempt
     -> build messages and accounting
  -> strictReviewAdapter
  -> existing timeout-aware Venice transport
  -> raw result
  -> index.tsx parse, trace, and fallback
```

- The adapter executes exactly one injected provider transport request using the unchanged strict-review settings: temperature `0.18`, topP `0.82`, repetition penalty `1.02`, and `stop: []`.
- Messages, prompt construction, prompt-cache key creation, response format, parsing, tracing, logging, routing, and review application remain in `index.tsx`.
- The existing timeout-aware transport is injected so timeout, abort, error, and raw result identity are preserved.
- Single, Cc, and group strict review share the same adapter through the existing shared review pipeline.
- No generation transport extraction, Jev, OpenRouter, or behavioural change is included.
