# Wetapp Engine V2: Phase 2A

## Single-turn seam

Single-character chat now preserves the existing sequence through a small,
dependency-injected seam:

```
runCharacterChatGeneration
  -> runSingleTurnAdapter
    -> runConversationGeneration
    -> strictReviewSingleReply
  -> existing getResponse commit path
```

Previously, `runCharacterChatGeneration` invoked those same two legacy
functions directly in that order. The adapter only awaits generation, passes
its result to review, and returns the reviewed result.

## Unchanged boundaries

`runConversationGeneration`, continuation, model routing, retry/repair and
fallback handling, prompts, validators, Cc polishing, and
`strictReviewSingleReply` remain in `index.tsx`. Errors and aborts propagate
unchanged through the adapter. Existing commit ordering, pending wardrobe
state, user and assistant persistence, and auto-memory ordering are unchanged.

Group generation remains on its original direct
`runRoomConversationGeneration -> strictReviewGroupReply` path.

## Deferred work

GenerationTrace remains deliberately disconnected. Phase 2B can add live,
metadata-only trace instrumentation at this seam after its behaviour has been
measured and validated.
