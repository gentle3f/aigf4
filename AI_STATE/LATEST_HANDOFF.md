# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261007_AIGF_UI_V2_LIVE_TEST.md`

Current status:
- Supabase migration COMPLETE and verified.
- Group Reply V2 is still waiting for a larger real Research Capture baseline; do not rewrite Group logic yet without explicit instruction.
- Functional Wetapp UI 2.0 is live behind `?ui=v2`; default URL remains the old UI.
- UI 2.0 now includes the full current visual pass:
  - true Home Quick Actions for Image Studio / Video Studio;
  - featured latest conversation and clearer Group/persona distinction;
  - lighter identity-focused chat header;
  - warm clean canvas with stable persona-driven aura/accent;
  - open-text 1-on-1 character replies;
  - editorial narration/scene styling;
  - floating composer with camera shortcut hidden;
  - grouped chat actions with explicit sticky close control;
  - native-feel view/message/composer/sheet motion with reduced-motion fallback;
  - editorial Wetapp typography;
  - optional persisted warm dark mode.

Latest live commits:
- `0dcadbc Organize UI 2.0 chat menu actions`
- `aa31599 Rebuild UI 2.0 home actions`
- `ba94ea2 Open up UI 2.0 character replies`
- `15c1224 Complete UI 2.0 motion and theming`

Latest production deployment:
- `dpl_B6YoTYfEj2eLpXeCJtRKQjxPLvrx`
- READY
- `wetapp.madproduction.ai` alias active.

Validation:
- 676/676 tests PASS
- typecheck PASS
- production build PASS

Next:
- user should use the live UI 2.0 on phone/desktop and report concrete UX/visual changes;
- refine based on real use rather than speculative redesign;
- keep Group Research Capture running in parallel.

Mandatory:
- GEN-FUJI Local MCP only for local work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
