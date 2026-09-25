# Engine V2 Phase 3A: Shared Review Pipeline Seam

Phase 3A extracts generic reviewer-route orchestration into `runReviewPipeline`.

```
strictReviewSingleReply / strictReviewGroupReply
  -> requestStrictReviewDecision
  -> runReviewPipeline
  -> injected existing reviewer attempt
  -> Venice + parse + trace
  -> decision / null
```

- The pipeline only iterates the supplied route, provides stable 0-based route indexes and 1-based attempt indexes, returns the first non-null decision, and returns null after exhaustion.
- Provider calls, request payloads, prompt construction, parsing, timeout and abort behaviour, token accounting, tracing, logging, and per-attempt fallback handling remain in `index.tsx`.
- Single and group revision application remains outside the pipeline.
- Reviewer routing, tracing, error/fallback semantics, and response behaviour are unchanged.
- The generic pipeline has no provider, prompt, private-content, telemetry, Jev, or OpenRouter dependency.

No behavioural change is intended.
