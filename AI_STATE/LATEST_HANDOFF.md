# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261007_AIGF_UI_V2_LIVE_TEST.md`

Current status:
- Supabase migration COMPLETE and verified. Do not redo it.
- Wetapp UI 2.0 remains opt-in via `?ui=v2`; V1 remains default.
- Immersive Scene Mode is Group-only and persisted by `wetappUiV2ImmersiveScene`.

Latest scene functionality:
- `RoomSceneState.memberStates` persists per-member:
  - posture
  - action
  - attention
  - innerThought
  - chemistry
- These are emitted inside the existing Group generation response. No second model call.
- Expanded `此刻` shows posture/action/wardrobe.
- Tapping a cast member opens X-ray showing inner thought, attention and chemistry.
- Chemistry is both directly visible in X-ray and carried into the next Group prompt as continuity.
- Other characters must not know another character's private inner thought unless visibly revealed.

Latest bugfix after first real user test:
- `此刻` detail is now vertically scrollable with viewport-aware max-height.
- Cast click now opens hidden detail, renders X-ray and scrolls it into view instead of only showing selected border.
- `member_states` parser accepts array/object map formats and snake_case/camelCase variants.
- Missing posture/action may fall back to clearly attributable visible narration.
- Fallback attribution is conservative: narration must clearly start with that member identity; do not infer another character's action merely because their name appears later in the sentence.
- Inner thought and chemistry are never guessed from visible text.

Validation:
- 690/690 tests PASS
- typecheck PASS
- production build PASS

Latest functional commit:
- `4651270 Fix scene X-ray interaction and state fallback`

Current production deployment:
- `dpl_FrehStjD4MiniMghUdoxdSHaeQA4`
- READY
- `wetapp.madproduction.ai` active.

Product direction:
- User treats Wetapp as a persistent private relationship/world experience rather than a messaging simulator.
- High-frequency fictional four-character Group is the primary future usage-study sample.
- Relationship fingerprint remains future:
  - soul = who the character is
  - memory = what happened
  - fingerprint = repeated interaction patterns that emerge between user/characters over time

Next:
- user should retry one fresh Group turn;
- expand `此刻` and scroll;
- tap several cast members and confirm X-ray appears;
- judge accuracy/usefulness of posture/action/inner thought/chemistry before further chemistry-engine work.

Mandatory:
- GEN-FUJI Local MCP only for local work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
