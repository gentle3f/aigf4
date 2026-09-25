# Engine V2 Phase 3E: Strict-Review Attempt Executor

Phase 3E extracts the single-reviewer attempt state machine.

```
strictReviewSingleReply / strictReviewGroupReply
  -> requestStrictReviewDecision
  -> runReviewPipeline
  -> index.tsx prepares request
  -> runStrictReviewAttempt
      -> one strictReviewAdapter request
      -> reviewResultParser
      -> one terminal attempt trace
      -> decision / null / fatal throw
  -> reviewPipeline fallback / return
```

- One executor invocation makes one provider request and records one terminal attempt outcome.
- Route orchestration remains in `reviewPipeline`; history and message preparation remain in `index.tsx`.
- Request construction remains in `reviewRequestBuilder`, transport in `strictReviewAdapter`, and parsing in `reviewResultParser`.
- Invalid results remain `invalid/INVALID_RESPONSE`; fatal controller aborts rethrow unchanged; non-fatal failures return `null` for the pipeline fallback.
- Single, Cc, and group reviews share this executor. No behavioural change, Jev, or OpenRouter work is included.
