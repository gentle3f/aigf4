# Engine V2 Phase 3F: Strict-Review Attempt Coordinator

Phase 3F extracts the prepared strict-review attempt coordinator.

```
strictReviewSingleReply / strictReviewGroupReply
  -> requestStrictReviewDecision
  -> runReviewPipeline
  -> runPreparedStrictReviewAttempt
      -> injected review-history selector
      -> reviewRequestBuilder
      -> accounting hooks
      -> strictReviewAdapter
      -> reviewResultParser
      -> reviewAttemptExecutor
  -> decision / null / fatal throw
  -> single/group review application
```

- The coordinator composes the existing builder, adapter, parser, and executor without changing their behaviour.
- Reviewer routing remains in `reviewPipeline`; history policy, authoritative prompts, runtime UI state, and application remain in `index.tsx`.
- Preparation/request accounting stays observable through injected hooks and request settings remain unchanged.
- Preparation failures remain outside provider-attempt tracing; terminal trace, abort, and fallback semantics remain in the executor.
- No behavioural change, Jev, or OpenRouter work is included.
