# AIGF UI 2.0 Live Test Handoff — 2026-10-07

## Supabase migration status

The new Supabase backend is fully verified and data-complete.

Final NEW project verification:
- auth users: 1
- state rows: 1
- conversations: 29
- conversation message_count sum: 11086
- message rows: 11086
- media rows: 45
- private storage objects: 45
- research turns: 4
- large Wetapp tables in Realtime: 0

Old baseline before reseed:
- conversations: 29
- messages: 11079
- media: 45
- storage objects: 45

The +7 messages in the new project are consistent with activity after the old-project audit. Conversation-declared total exactly matches physical message rows. Media counts match exactly. Supabase cutover is complete.

## UI 2.0 work

User felt the existing Wetapp UI looked old-tech. Existing primary chat skin in `mori.css` is strongly WhatsApp-Web-like.

A standalone visual prototype was first created locally under:
- `prototypes/wetapp-ui-v2/index.html`

User liked the direction but wanted to test it with real functions on phone.

### Real functional UI 2.0 test

Implemented an opt-in visual layer on the real Wetapp app:
- `ui-v2.css`
- query gate added in `index.html`
- activation: `?ui=v2`
- default URL remains on the existing UI

Important:
- same production app
- same chat / Group / Cc / memory / media / Supabase / review logic
- UI 2.0 is CSS + shell presentation only
- no separate dummy data or backend
- normal URL is unaffected because all UI 2.0 rules are gated under `html[data-wetapp-ui="v2"]`

Design direction:
- warm contemporary relationship-first messenger
- reduce WhatsApp clone feel
- cleaner conversation list
- softer warm canvas
- dark user bubbles / light character bubbles
- editorial narration treatment
- improved Group speaker hierarchy
- floating composer
- modern desktop popover and mobile bottom-sheet treatment
- shared modal/sheet modernisation
- small `UI 2.0 TEST` marker while testing

Validation:
- full suite: 666/666 PASS
- typecheck PASS
- production build PASS
- added `tests/uiV2Gate.test.ts` to verify opt-in gate and scoped stylesheet

Commit:
- `48d0eed Add opt-in Wetapp UI 2.0`

Production deployment:
- `dpl_8BntRVTVvtuo5jjNmq5TV4Mc5fH2`
- READY
- aliases include `wetapp.madproduction.ai`

User can test the live functional version on phone by opening the normal Wetapp production URL with `?ui=v2`.

## Current product work

Group Reply V2 is still waiting for more real Research Capture baseline usage. UI/UX work can continue in parallel without changing Group reply logic.

## Operating rules

- GEN-FUJI Local MCP only for local filesystem/repo/command work.
- No Remote Desktop Commander.
- No Codex quota.
- Do not weaken MCP safety.
- Do not re-enable row-level Realtime for the four large Wetapp tables.
- Preserve existing app behaviour while iterating UI 2.0.
