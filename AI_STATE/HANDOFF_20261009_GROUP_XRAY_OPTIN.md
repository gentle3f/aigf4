# AIGF Group X-ray — optional on-demand recovery (2026-10-09)

## Why
The user reported that Group replies were restored by the prior hotfix but X-ray innerThought/attention/chemistry still remained empty for their frequent four-character Group. The original Group model is not reliably including optional `member_states` in its trailing scene JSON, especially in long/multi-character responses. The prior hard requirement broke Group chat and MUST NOT return.

## Implemented
- Added exported `parseGroupXrayStates(rawText, room)` in `groupChat.ts`.
  - Parses short dedicated JSON or `<xray>JSON</xray>`, with member ID/name normalization and active-member filtering.
  - Existing Group parser and chat acceptance remain unchanged.
- In immersive Group cast X-ray, if any of innerThought/attention/chemistry is missing, show explicit `補讀此刻 X-ray · 額外 1 次 AI 請求` button.
- Clicking the button is the ONLY action that starts extra generation. Opening an avatar alone makes no call.
- A single compact model request requests fictional private thoughts, attention, chemistry for ALL currently present members in one batch, using scene metadata plus at most the last six short history excerpts.
- Parsing is tolerant and saves only returned fields, preserving existing posture/action and prior private state. Room persists through `updateRoomSceneDeferred`.
- An in-flight room change, scene change, present-member change, or room updatedAt change discards stale enrichment.
- Failure only shows a retryable inline message, never changes/blocks Group dialogue.
- No model hidden chain-of-thought; these are fictional character inner states for narrative continuity.
- Normal auto-generated `member_states` continues as best-effort with zero extra calls if the existing Group model outputs them.

## Validation
- 696/696 tests PASS
- typecheck PASS
- direct Vite production build PASS
- Added parser unit tests and UI integration regression.
- Functional commit `dde7401 Add opt-in compact Group X-ray enrichment`.
- Production deployment `dpl_5eTfg53VAmpw8oZNrHZFCqxvN81d` READY, alias `wetapp.madproduction.ai`.

## Test instructions
Open `?ui=v2` and main Group. Tap cast member; if X-ray is empty, press `補讀此刻 X-ray`. This makes one explicit extra compact AI request; the returned available states should appear for all present members without sending a new chat turn. Other members can be inspected immediately after it completes. Must validate against real user session; tests alone do not guarantee provider output.

## Safety/continuity
GEN-FUJI Local MCP only; no Remote Desktop Commander, Codex or recovery HDD. Existing dirty `AI_STATE/LATEST_HANDOFF.md` and `AI_STATE/HANDOFF_20261007_AIGF_UI_V2_LIVE_TEST.md` were deliberately NOT overwritten or staged by this work. Do not reintroduce hard mandatory private-state gates.
