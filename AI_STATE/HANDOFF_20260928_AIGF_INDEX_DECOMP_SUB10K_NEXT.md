# AIGF Handoff — Index Decomposition Sub-10K Milestone

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current HEAD before this handoff-doc commit: `b685a6b`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless the user explicitly asks for it.
Do not use GitHub Actions for heavy work.
Keep changes conservative, tested, reversible, and separated into logical commits.

## Core behavior that must not regress
Preserve:
- Group generation
- Cc independent route
- normal chat send / active-request navigation semantics
- memory extraction / retrieval
- wardrobe / scene reality epoch
- strict review / Gemma
- Jev production shadow
- relationship / surprise-event continuation state
- room/private continuity handoff

## Latest validation at HEAD `b685a6b`
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **368 / 368 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree — clean

## Milestone metrics

Original baseline:
- `index.tsx`: about **16,616 lines**
- main JS: about **924.96 kB minified / 307.32 kB gzip**

Current:
- `index.tsx`: **9,974 lines**
- main JS: **759.70 kB minified / 257.04 kB gzip**
- HTML: **108.11 kB / 20.94 kB gzip**

Net reduction from original baseline:
- **6,642 index.tsx lines**
- **165.26 kB minified main JS**
- **50.28 kB gzip main JS**

The app is still above Vite's 500 kB warning threshold. The decomposition objective is not finished.

## Newest commits after the prior handoff
- `d4c00fc` — Remove unreachable gift UI
- `0cde73b` — Remove unreachable suggestion UI
- `4288b8a` — Remove unreachable dating UI module
- `b04db2b` — Lazy-load participant action workflow
- `f69cf0c` — Lazy-load photo viewer UI
- `0541506` — Lazy-load destructive conversation actions
- `9f9b73d` — Lazy-load photo prompt UI
- `5d365db` — Lazy-load new scene action
- `5847495` — Lazy-load chat search UI
- `089a806` — Remove unreachable legacy persona code
- `b685a6b` — Remove unreachable legacy memory modal

Earlier decomposition commits remain authoritative as documented in older handoffs.

## Current cold chunks from latest build
- chatSearchUi — 1.63 kB / 0.74 gzip
- newSceneAction — 1.90 / 1.15
- photoPromptUi — 2.00 / 1.01
- createGroupUi — 2.34 / 1.18
- avatarAdminUi — 3.06 / 1.29
- chatModelSettingsUi — 3.19 / 1.42
- personaSettingsUi — 4.13 / 1.71
- liveCloudUi — 4.45 / 1.60
- roomInfoUi — 4.85 / 1.97
- albumUi — 5.34 / 2.16
- publicIdentitySearch — 6.41 / 2.58
- conversationActions — 7.20 / 2.92
- cloudBackupUi — 8.36 / 3.33
- roomMemoryUi — 9.52 / 3.90
- jevShadowDiagnostics — 10.84 / 3.28
- photoViewerUi — 13.20 / 5.21
- participantActionUi — 13.32 / 5.10
- videoStudio — 39.38 / 14.65
- mimicPersonaCreator — 43.94 / 15.84

## Newly established boundaries

### Participant Action workflow
Cold feature: `features/participantActionUi.ts`
Owns user-triggered room admin continuity workflows:
- invite character
- private chat from room member
- return private version to room
- replace stale room member with private version
- present / leave scene toggles
- context bridges and continuity transfer needed by those actions

Main injects managers/navigation/runtime state.
It must not own Group generation, strict review, Jev, or ordinary send.

Room Info now awaits async presence updates before rerendering.

### Photo Viewer
Cold feature: `features/photoViewerUi.ts`
Owns:
- viewer/fullscreen DOM
- zoom/pinch
- model/ratio/resolution/seed controls
- Venice image regeneration request

Main retains persistence semantics via callbacks:
- add Studio result
- append visible chat photo
- shared seed synchronization
- chat history / album persistence

Hot avatar/chat attachment paths lazy-load fullscreen only on explicit image open.

### Destructive conversation actions
Cold feature: `features/conversationActions.ts`
Owns:
- delete custom persona
- delete conversation
- clear current chat
- create timeline branch
- recall user message
- photo/attachment asset cleanup
- memory/scene rollback for recall and branch

Important active-request semantics:
- navigation alone never cancels an active request
- destructive mutation cancels only the matching conversation
- timeline branch refuses while any active request exists; it does not cancel the request

Main retains synchronous message-action-menu DOM state.

### Photo Prompt
Cold feature: `features/photoPromptUi.ts`
Owns only manual photo-request modal and subject/sender selection.
Actual photo turn remains main-owned through `sendMessage({ characterPhotoRequest: true, ... })`.

Removed unused old states:
- `pendingPhotoSenderMemberId`
- `pendingPhotoSubjectMemberIds`

### New Scene
Cold feature: `features/newSceneAction.ts`
Owns:
- completed-scene history selection
- scene-transition context bridge
- recent memory summary trigger
- SCENE_END persistence
- room episodic scene memory
- scene id/start/reset/unresolved reset/wardrobe reset

Main retains visible SCENE_START append and current-room refresh callback.

### Chat Search
Cold feature: `features/chatSearchUi.ts`
Owns:
- chat search DOM/state/highlights/navigation
- explicit expansion of older rendered history before search

Main injects:
- current hidden-history count via `renderedChatHistoryStartIndex`
- `prependOlderChatHistory(count)`

Hot navigation only calls `chatSearchUi?.close()`; it must never import the search feature merely because the user changes conversation/home.

## Dead UI/code removed in this phase

### Gift
Hidden button/input/preview/state/listeners were unreachable and never entered send/prompt state.

### Suggestion
Hidden suggestion button/container/getSuggestions state was unreachable.

### Dating
Removed:
- `dating.tsx` (242 lines, zero import/init caller)
- hidden dating UI
- unreachable proposal modal/functions/listeners

Manager compatibility methods were intentionally left untouched.

### Legacy persona code
Removed zero-caller:
- `getPolicyViolationResponse`
- `getSystemPhotoFailResponse`
- `getSystemErrorResponse`
- `renderLegacyPersonaList`
- old Gemini `generateAndSetAvatar`
- obsolete `ai: any = null` placeholder

The old Gemini avatar path had zero callers; active avatar handling is Avatar Admin/local upload.

### Legacy Memory modal
Removed old `memory-modal`, DOM refs, open/save/close functions and listeners.
It had zero opener.
The real memory entry points use `Room Memory`.
MemoryManager data and Room Memory UI were not changed.

## Characterization tests added/updated
Recent:
- `tests/participantActionUiFeature.test.ts`
- `tests/photoViewerUiFeature.test.ts`
- `tests/conversationActionsFeature.test.ts`
- `tests/photoPromptUiFeature.test.ts`
- `tests/newSceneActionFeature.test.ts`
- `tests/chatSearchUiFeature.test.ts`
- `tests/chatHistoryWindow.test.ts` updated for lazy Chat Search architecture
- `tests/chatRequestNavigation.test.ts` updated for lazy destructive actions

These tests intentionally protect ownership boundaries instead of only checking bundle shape.

## Do not aggressively split these yet

### Surprise Event
The draw/generation/start workflow is deeply coupled to:
- ActiveChatRequest
- model routing / generateChatTextWithTimeout
- request lifecycle
- getResponse continuation
- relationship pulse / event persistence

Do not split it merely to reduce line count. First isolate a stable service seam if revisited.

### Image Studio
Do not whole-sale split it yet.
Image model inventory/seed/helpers are shared by:
- Image Studio
- character photo proposals
- Photo Viewer

A cosmetic split can pull it back into the hot chunk or duplicate state.

## Next-step selection rule
Now that the sub-10K milestone is reached, stop optimizing for line count itself.
Choose the next work by **actual initial-bundle reduction and architectural value**.

Good next audits:
1. identify a genuinely cold workflow with >5–10 kB build impact
2. audit remaining zero-caller legacy functions/UI
3. consider separating reusable image-model service state before another Image Studio split
4. look for admin/download/export flows that can be cold-loaded

Avoid risky extraction from:
- sendMessage / getResponse
- Group generation/review
- memory extraction
- strict review/Jev
unless a clean dependency seam is proven first.

## Continue process
For every extraction/cleanup:
1. prove reachability/dependency boundary
2. preserve hot chat/Group behavior
3. typecheck
4. targeted characterization test
5. full tests
6. production build
7. diff check
8. compare bundle size
9. commit one logical change
10. update durable handoff after several meaningful commits
