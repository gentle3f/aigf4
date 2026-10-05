# AIGF Group Transport Leak Hardened — 2026-09-29

## Branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- Current code HEAD: `131bc82 Harden Group transport leak cleanup`
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.

## Production status
Production is still the previously deployed `92c8e69` checkpoint.
This new transport-leak hardening is committed locally but NOT deployed yet.
Do not deploy unless explicitly requested.

## User report
User reported that Group replies still occasionally showed transport/code residue at the end.

Previously fixed case:
- visible prose followed by an empty `<chat></chat>` envelope
- commit `c89153d Strip leaked group transport metadata`

Newly reproduced remaining leak:
- an otherwise valid parsed Group dialogue segment itself contains trailing transport residue, e.g.
  `我哋返去啦。</chat><scene>{...}</scene><npc_candidate>null</npc_candidate>`
- malformed/incomplete trailing transport residue can also appear, e.g.
  `我等你。</chat><scene>{"location":"門外"`

Root cause:
- `cleanGroupSegmentText()` only stripped punctuation/quotes; it did not strip transport markup inside an already-successfully-parsed segment.
- render had another edge case: if safe Group segments became empty, `appendMessage()` could fall through to the generic bot bubble and render raw `content.text`.

## Fix in 131bc82
### 1. Segment-level transport invariant
Added `stripGroupTransportResidue()` inside `groupChat.ts`.

Visible Group segment text now:
- truncates at `</chat>`
- truncates at opening/closing `<scene...>`
- truncates at opening/closing `<npc_candidate...>`
- removes an isolated opening `<chat>` marker without discarding following visible text

Because this is called by `cleanGroupSegmentText()`, it protects:
- primary Group generation
- strict-review / Gemma Group revisions
- normalized stored Group segments
- legacy Group display repair
- Group history text re-entry

### 2. Render-level fail-closed behavior
Changed Group bot rendering from:
- render Group UI only when `groupDisplaySegments.length > 0`

to:
- any `sender === 'bot' && currentRoom` always stays on the Group rendering path

Therefore a corrupted Group message that sanitizes to zero safe segments can no longer fall through and render raw `content.text`.

## Regression coverage
Added tests for:
1. complete transport tail embedded inside a valid dialogue segment
2. malformed/incomplete transport tail with no closing tags
3. legacy stored `content.segments` carrying transport residue
4. Group renderer never falling through to raw `content.text`

Before the sanitizer, the first three new tests failed with exact leaked transport text.
After the fix:
- Group targeted tests: 46/46 PASS
- full suite: 596/596 PASS
- typecheck: PASS
- build: PASS
- diff check: PASS
- main bundle: ~351.49 kB / 122.65 kB gzip

## Previous architecture checkpoint
Cold-split details remain in:
- `AI_STATE/HANDOFF_20260929_AIGF_351KB_COLD_SPLIT_CHECKPOINT.md`

Jev details remain in:
- `AI_STATE/HANDOFF_20260929_AIGF_JEV_GROUP_GATE_V2_COLLAPSED.md`

## Next action
Highest priority if user approves:
- deploy `131bc82` safely to production
- then test normal Group chatting and confirm the occasional trailing transport/code leak is gone

Do not resume blind index decomposition just for line count.
