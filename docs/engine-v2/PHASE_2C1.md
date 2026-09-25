# Engine V2 Phase 2C1: Group Turn Adapter Seam

Phase 2C1 adds a tiny dependency-injected seam around the legacy group turn
orchestration. The adapter owns no routing, parsing, proposed state, persistence,
or business logic.

Before:

```text
runRoomConversationGeneration(...)
  -> strictReviewGroupReply(...)
```

After:

```text
runGroupTurnAdapter({
  generateCandidate: () => runRoomConversationGeneration(...),
  reviewCandidate: candidate => strictReviewGroupReply(..., candidate),
})
```

Both underlying implementations remain in `index.tsx`. The reviewed
`GroupGenerationResult`, including its proposed scene and wardrobe state, is
still returned to the existing `getResponse` downstream path, which alone
persists accepted room scene state and performs all other effects.

There is no group `GenerationTrace`, group performance collector, telemetry, or
state commit in this adapter. The existing normal/Cc single-turn Phase 2B1/B2/B3
trace wiring remains unchanged.
