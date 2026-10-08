# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261007_AIGF_UI_V2_LIVE_TEST.md`

Current status:
- Supabase migration COMPLETE. Do not redo it.
- Wetapp UI 2.0 remains opt-in via `?ui=v2`; V1 remains default.
- Immersive Scene Mode is Group-only and persisted by `wetappUiV2ImmersiveScene`.

Immersive Scene / X-ray:
- `RoomSceneState.memberStates` persists per-member:
  - posture
  - action
  - attention
  - innerThought
  - chemistry
- Expanded `此刻` shows posture/action/wardrobe and is scrollable.
- Tapping a cast member opens X-ray and scrolls it into view.
- X-ray directly shows inner thought, attention and chemistry.
- Chemistry is also fed into the next Group prompt so it can influence later dialogue/reactions.
- Other characters cannot know another member's private inner thought unless visibly revealed.

Latest private-state fix:
- Group generation now REQUIRES every currently present member to have non-empty attention, innerThought and chemistry before the candidate can be accepted.
- Missing private state rejects the candidate and uses the existing repair/fallback path.
- Retry instructions include the concrete previous defect and missing member names.
- No permanent second API call was added; extra calls happen only if a generation violates this contract.
- Parser still accepts array/object map and snake_case/camelCase member-state variants.
- posture/action may conservatively fall back to clearly attributable visible narration; inner thought and chemistry are never guessed.

Presence capacity:
- `ROOM_PRESENT_MEMBER_LIMIT = 6`.
- Six characters may now be present in the same scene/room at once, excluding the user.
- Shared constant flows through RoomManager, participant actions, Group schema maxItems, Surprise Event participant selection and other dependent paths.
- Total fixed room member limit remains 8.

Validation:
- 691/691 tests PASS
- typecheck PASS
- production build PASS

Latest functional commits:
- `8bf0ed3 Make Enter insert newline in chat composer`
- `c2679f3 Require Group private state and allow six present members`

Composer behavior:
- Enter inserts a newline; keyboard Enter never sends.
- Only the Send button sends from the shared chat composer.

Production:
- `dpl_7ogpQzEntUotesM26Va175RbyRfC`
- READY
- `wetapp.madproduction.ai` alias active.

Next:
- user should send a fresh Group turn and verify all present members now show X-ray private state.
- user can also test adding/toggling a sixth present character.
- if private state still fails after enforcement, inspect actual generated transport output rather than adding another UI patch.

Mandatory:
- GEN-FUJI Local MCP only for local work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
