# Engine V2 Phase 3C: Strict-Review Request Builder

Phase 3C extracts a pure strict-review request/message builder.

```
strictReviewSingleReply / strictReviewGroupReply
  -> requestStrictReviewDecision
  -> runReviewPipeline
  -> getStrictReviewHistory
  -> buildStrictReviewRequest
  -> prompt accounting
  -> strictReviewAdapter
  -> parse + trace + fallback
```

- The builder preserves the exact candidate/user wrapper, authoritative prefix, message order, and history entry identity.
- History selection remains in `index.tsx`; authoritative prompt construction and candidate serialization remain outside the builder.
- Prompt accounting, transport, parsing, tracing, and fallback remain in `index.tsx`.
- The strict-review adapter, routes, and request behaviour are unchanged.
- No Jev, OpenRouter, or behavioural change is included.
