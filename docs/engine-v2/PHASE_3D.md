# Engine V2 Phase 3D: Strict-Review Result Parser

Phase 3D extracts the pure strict-review provider-result parser.

```
strictReviewSingleReply / strictReviewGroupReply
  -> requestStrictReviewDecision
  -> runReviewPipeline
  -> reviewRequestBuilder
  -> strictReviewAdapter
  -> reviewResultParser
  -> index.tsx trace / fallback / application
```

- Accepted result forms and invalid-result behaviour are unchanged: fenced or plain keep tags, non-empty tagged revisions, and supported JSON decisions.
- The parser is pure text parsing. It has no request, trace, transport, model-route, room, persona, or abort-state knowledge.
- `attemptRecorded`, invalid attempt traces, success traces, token metadata, fallback, and abort/error handling remain in `index.tsx`.
- Transport remains in `strictReviewAdapter`; request construction remains in `reviewRequestBuilder`; reviewer routing remains in `reviewPipeline`.
- Single, Cc, and group reviews share the same parser path. No behavioural change, Jev, or OpenRouter work is included.
