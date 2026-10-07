# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261007_AIGF_UI_V2_LIVE_TEST.md`

Current status:
- Supabase migration COMPLETE and verified. Do not redo it.
- Group Reply V2 generation logic is still waiting for a larger real Research Capture baseline; do not rewrite Group logic without explicit instruction.
- Wetapp UI 2.0 is live behind `?ui=v2`; default V1 remains unchanged.
- UI 2.0 now includes:
  - Home Quick Actions and featured latest conversation;
  - identity-first chat header;
  - warm light/dark themes;
  - open-text 1-on-1 replies;
  - improved Group story hierarchy;
  - grouped chat action sheet;
  - composer auto-grow;
  - loading/auditing states that do not force scroll to bottom;
  - dark-mode contrast fixes;
  - fixed Group opening punctuation preservation;
  - low-latency Room Info presence toggles.

Latest major addition:
- UI-only **Immersive Scene Mode v1** for Group rooms.
- It is persisted using `wetappUiV2ImmersiveScene` and defaults on unless explicitly disabled.
- Topbar Scene toggle switches standard/immersive presentation.
- Scene shell renders existing room data only: location, reality layer, present count, cast, summary, unresolved threads.
- Cast active-speaker state uses movement/border/text/explicit `說話中`, not color alone.
- Live Group reply segments stage at ~220ms intervals; history does not replay.
- Narration becomes environmental prose.
- Dark-mode and reduced-motion fallbacks included.
- No Group generation, prompt, reviewer, memory, Supabase or Cc logic changed.

Design direction agreed:
- user treats Wetapp primarily as a persistent private relationship/world experience rather than a messaging simulator;
- future product exploration should prioritize actual usage history before adding more speculative mechanics;
- user's high-frequency fictional four-character Group is the primary usage-study sample;
- comfort-focused Group is a secondary sample;
- relationship fingerprint concept is distinct from soul/memory:
  - soul = who the character is;
  - memory = what happened;
  - fingerprint = repeated user-character interaction patterns that emerge over time.

Latest functional commits:
- `5538b37 Add immersive Group scene mode`
- `56716e5 Fix group punctuation and room presence lag`
- `df8a117 Refine composer growth and reply scrolling`
- `215e925 Fix UI 2.0 dark Home menu contrast`
- `84b3bba Fix UI 2.0 dark Group contrast`

Current production deployment:
- `dpl_Cv9i9aWVBUqsnxXJq5wCaSW9Trrh`
- READY
- `wetapp.madproduction.ai` alias active.

Validation:
- 684/684 tests PASS
- typecheck PASS
- production build PASS

Next:
- user should test Immersive Scene Mode in a real high-frequency Group;
- collect concrete UX feedback before expanding it;
- if it works, next candidate is an Actual Usage Study before implementing relationship fingerprints or deeper world mechanics.

Mandatory:
- GEN-FUJI Local MCP only for local work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
