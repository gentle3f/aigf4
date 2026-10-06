# Latest AIGF Handoff

Authoritative current handoff:
- `AI_STATE/HANDOFF_20261007_AIGF_UI_V2_LIVE_TEST.md`

Current status:
- Supabase migration COMPLETE and verified: conversations 29, messages 11086, message_count sum 11086, media 45, storage 45, research 4, Realtime large tables 0.
- Group Reply V2 is waiting for more real Research Capture baseline turns.
- functional Wetapp UI 2.0 test is live in production behind the `?ui=v2` query gate.
- default Wetapp URL remains on the existing UI.
- UI 2.0 uses the exact same production functions/data/backend; only the visual layer changes.

UI 2.0 commit:
- `48d0eed Add opt-in Wetapp UI 2.0`

Production deployment:
- `dpl_8BntRVTVvtuo5jjNmq5TV4Mc5fH2`
- READY
- `wetapp.madproduction.ai` alias active.

Validation:
- 666/666 tests PASS
- typecheck PASS
- production build PASS

Next:
- user continues testing UI 2.0 on phone and desktop with real usage;
- latest phone refinements are live: no conversation trash buttons, corrected 2x2 Group header avatars, fully scrollable mobile three-dot menu, camera shortcut hidden;
- refine remaining visual/UX issues from hands-on feedback;
- keep Group Reply capture running in parallel.

Mandatory:
- GEN-FUJI Local MCP only for local work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
