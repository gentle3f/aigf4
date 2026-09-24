# Wetapp Engine V2: Phase 0 and Phase 1

## Scope

This milestone freezes selected legacy conversation behavior and adds
future-facing contracts only. It does not change prompts, providers, routing,
sampling, state, persistence, sync, or UI. Jev/OpenRouter is deliberately not
integrated: a future decision provider may advise routing only and must never
generate text or mutate conversation state.

## Current pipeline map

### Shared request and commit path

1. `sendMessage` persists the new user turn, then `beginChatRequest` copies
   the persona/room inputs into the current `ActiveChatRequest`. The legacy
   request still carries mutable staged wardrobe state during generation.
2. The character path resolves `buildCharacterModelRoute(chatModelSettings, isCc)`.
3. A candidate is generated, then strict review is requested.
4. If the request is still active, the accepted candidate is converted to a
   chat content object and committed.
5. The final model message is persisted and rendered. Relationship/NPC/event
   side effects follow, then background auto-memory is scheduled.

### Single chat

- Builds the character system prompt, archived recall, NPC requirements,
  recent history, and latest user content.
- The first route model receives one primary attempt and one repair attempt.
  Each later fallback gets one attempt.
- A truncated valid reply may use the existing continuation call before the
  candidate is reviewed.
- Wardrobe envelope extraction stages `pendingWardrobeState`; strict review
  may replace it only with a valid revised envelope.

### Group chat

- Builds the group prompt with fixed member ledgers, per-member memory,
  current scene/wardrobe, reality layer and epoch, then selects recent history.
- Uses the same route and first-model repair count as single chat, with group
  sampling and structured group parsing.
- Parses a candidate into dialogue segments plus a proposed scene. Strict
  revision must provide the complete group transport envelope and pass current
  ownership, participant, repetition, and parser checks.
- The accepted proposed scene is committed before the final model message is
  persisted.

## Review, commit, and memory ordering

Candidate text and candidate scene/wardrobe are not durably committed before
strict review returns and the active-request guard passes. However, the user
turn is intentionally persisted before generation so prompt construction can
read it immediately. Therefore the current engine guarantees final accepted
**model** output feeds state/memory, but does not defer durable user-turn
persistence until after review. This is recorded for a later Engine V2 commit
boundary phase; no behavior was changed here.

Auto-memory is scheduled only after final response persistence. It reads
committed history and applies validated summaries in the existing background
coordinator.

## Characterization coverage

`tests/conversationCharacterization.test.ts` records:

- saved model setting precedence, normal/Cc/strict routes;
- primary repair and fallback attempt cardinality;
- strict-review keep/revise transport parsing;
- group structured output and proposed scene parsing;
- texting epoch selection excluding legacy raw dialogue;
- the current abort limitation as metadata-only coverage.

The live DOM orchestration remains legacy code in `index.tsx`; Phase 0 avoids
duplicating it into a fake browser. Existing group, epoch, strict-review,
wardrobe, storage, and auto-memory tests remain the behavioral guardrails.

## Phase 1 contracts

`engine/contracts.ts` defines `TurnSnapshot`, `ResolvedModelRoute`,
`TurnContext`, single/group candidate proposals, review state, and a future
`DecisionProvider` interface. Candidate scene and wardrobe fields are named
as proposed state, not committed state.

`engine/observability/generationTrace.ts` defines a metadata-only,
in-memory `GenerationTrace`. It stores identifiers, model routes, counts,
latencies, token/accounting sizes, review metadata, and final commit status.
It has no fields for prompts, messages, generated responses, API keys, or
provider payloads. It is not production-connected in this phase.

## Deliberately legacy

`index.tsx` remains the orchestrator. Prompt builders, history selection,
Venice request shapes, strict review, scene parsing, persistence, Supabase
sync, and auto-memory retain their current implementations. No decision gate,
debug HUD, model optimization, or state redesign is present.

## Recommended Phase 2

Extract one behavior-identical, dependency-injected single-turn generation
adapter from `index.tsx`, initially without changing its callers. Connect the
metadata-only trace at existing boundaries, then add a parallel group adapter.
Only after equivalence tests cover both adapters should a future optional
decision provider be evaluated before strict review.
