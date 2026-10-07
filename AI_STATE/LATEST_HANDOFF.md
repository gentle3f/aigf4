# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261007_AIGF_UI_V2_LIVE_TEST.md`

Current status:
- Supabase migration COMPLETE and verified. Do not redo it.
- Group Reply V2 generation logic still should not be broadly rewritten without a larger real Research Capture baseline unless the user explicitly asks.
- Wetapp UI 2.0 remains opt-in via `?ui=v2`; V1 remains default.
- UI 2.0 visual pass, dark mode, composer growth, reply-scroll behavior, Group punctuation fix and low-latency Room Info presence toggles are live.

Immersive Scene Mode:
- Group-only UI layer, persisted by `wetappUiV2ImmersiveScene`, default on unless disabled.
- Shows location/reality/present cast and staged live Group lines.
- Narration is environmental prose.
- Cast active-speaker state does not rely on color.

Latest addition — World State + Character Insight:
- `RoomSceneState.memberStates` now persists per-member:
  - posture
  - action
  - attention
  - innerThought
  - chemistry
- Same Group generation call emits these fields inside the existing <scene> payload; there is NO second model request.
- Prior member state is carried into the next Group prompt as PRIVATE SCENE-ENGINE continuity.
- Other characters must not know another member's private inner thought unless visibly disclosed.
- Strict-review revision preserves generated member state.
- Expanded `此刻` displays posture/action/wardrobe for each present member.
- Tapping a cast member opens an instant local X-ray panel showing fictional roleplay inner thought, attention and chemistry.
- Existing scenes without state do not invent values; they begin populating after the next fresh Group reply.

Product direction:
- user primarily treats Wetapp as a persistent private relationship/world experience rather than a messaging simulator.
- High-frequency fictional four-character Group is the primary future usage-study sample.
- Comfort-focused Group is secondary.
- Relationship fingerprint remains a future concept:
  - soul = who the character is
  - memory = what happened
  - fingerprint = repeated interaction patterns that emerge between user/characters over time

Latest functional commits:
- `34739d9 Add Group world state and character insight`
- `5538b37 Add immersive Group scene mode`
- `56716e5 Fix group punctuation and room presence lag`
- `df8a117 Refine composer growth and reply scrolling`

Current functional production deployment:
- `dpl_HXFRUELBjjGX2Fw9o8mWk31LvxnG`
- READY
- `wetapp.madproduction.ai` alias active.

Validation:
- 687/687 tests PASS
- typecheck PASS
- production build PASS

Next:
- user should send one fresh Group turn, expand `此刻`, and tap several cast members.
- judge whether posture/action/wardrobe are accurate enough, whether inner thought is interesting rather than generic, and whether chemistry feels like real cross-character dynamics.
- refine based on real output before adding more mechanics.

Mandatory:
- GEN-FUJI Local MCP only for local work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
