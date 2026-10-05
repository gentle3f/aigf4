# AIGF Memory V4 + Character Photo Reliability — 2026-09-29

## Branch / current code
- Branch: `perf/cleanup-send-latency-20260923`
- Production code commit: `63f1d68 Stabilize explicit and auto memory policy`
- Photo reliability commit immediately before it: `9cef71a Harden character photo generation`
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.

## Production
Latest production deployment:
- deployment id: `dpl_FbHTtCKfoh9UKEugRMJ3ntB5rM9N`
- deployment URL: `https://aigf4-9wm5tnvtv-gens-projects-4f99f8b9.vercel.app`
- custom alias: `https://wetapp.madproduction.ai`
- custom-domain HTTP check: 200
- recent Vercel runtime errors after deploy: 0
- Vercel production build main chunk: ~358.24 kB / 125.20 kB gzip
- build transformed 255 modules

## Validation
Before deploy:
- full suite: 618 / 618 PASS
- targeted memory-policy/session tests: PASS
- build: PASS
- typecheck: PASS
- git diff --check: PASS

## Character photo reliability
The user's real failures were after accepting a character photo proposal:
1. upstream "demand too high" / capacity error
2. a returned all-black image

Exact production default models were tested directly:
- `qwen-image-3` generate: valid image
- `qwen-image-3-edit` avatar/reference edit: valid image
The black output was not reproducible and is treated as an intermittent upstream bad output.

`9cef71a` hardens the actual Accept -> image path:
- explicit transient capacity/status errors retry the SAME model once
- no silent provider/model switching
- non-image edit responses are rejected
- tiny/incomplete blobs are rejected
- generated pixels are sampled before durable save
- almost fully transparent or conservatively near-all-black images are rejected
- a black/blank image is never saved into chat/history
- black-output failures do not silently spend money on a second generation; user gets a retry action
- transient overload is retried once automatically, then shown as retryable if still failing

New cold helper:
- `features/characterPhotoImageReliability.ts`
- ~2.60 kB / 1.52 kB gzip

## Memory V4 — why it was needed
Old behavior felt random because:
- only phrases like "永遠記住" opened the explicit memory card
- "只限本次" and "不要儲存" had almost identical underlying behavior
- no real temporary memory store existed
- a statement declined/session-only could later be promoted by background auto-memory
- manual permanent memories were always mislabeled as `vulnerability`
- auto-memory model selection followed the currently selected chat model/fallback route
- prompt guidance said importance 1–2 should usually be omitted, but code still persisted them
- auto-memory ran only every 12 user turns

## Memory V4 behavior

### 1. Explicit memory intent is deterministic
`memoryPolicy.ts` recognizes explicit store commands such as:
- 記住 / 牢記 / 唔好忘記 / 不要忘記
- please remember / don't forget

Recall questions such as:
- 記唔記得 / 仲記得 / 還記得
- do you remember / remember when
do NOT open a memory-store card.

Scope detection:
- explicit permanent wording -> permanent button is primary
- explicit temporary/session wording -> session-only button is primary
- ordinary "記住..." -> no scope is assumed; user chooses

### 2. Permanent / session / decline are now genuinely different
Permanent:
- writes only to `soul.md`
- user approves it explicitly
- group user chooses which present members know it
- source message ID is stored for provenance / recall cleanup
- kind is deterministically classified instead of always `vulnerability`:
  `core | relationship | vulnerability | promise | preference | event | boundary`

Session-only:
- writes to a real in-memory `sessionMemory.ts` store
- included in subsequent prompts
- not persisted to local storage/cloud
- survives navigation during the current browser runtime
- cleared on reload because it is RAM-only
- also explicitly cleared when conversation/persona is cleared or deleted
- group entries carry `known_by` member IDs and the Group prompt has a firewall preventing non-target members from knowing them

Declined:
- writes to neither soul.md, memory.md nor session memory.

### 3. Manual memory choice has authority over auto-memory
Every new manual memory proposal stores `sourceMessageId`.

For all manual outcomes (saved/session-only/declined):
- that controlled user turn and its following model reply are suppressed from auto-memory extractor evidence
- manual proposal summaries become deterministic long-term exclusion anchors
- later auto-memory candidates that substantially match a manually handled fact are rejected by code
- normalization handles common Cantonese/Mandarin variants such as 唔食 / 不吃 and 鍾意 / 喜歡

Therefore:
- permanent facts are not duplicated into memory.md
- session-only facts are not silently promoted later
- declined facts are not silently stored later

### 4. Auto-memory write policy is now stable
Auto-memory extraction:
- cadence: every 8 new user turns (was 12)
- fixed dedicated model route, independent of the user's current chat-model setting:
  1. default quality fallback
  2. default primary
  3. default emergency fallback
- currently this means Gemma quality route first, then default Qwen primary, then emergency fallback
- code-level persistence floor: importance >= 3
- importance 1–2 is now actually rejected instead of merely discouraged by prompt
- auto-memory remains episodic `memory.md`; it does NOT automatically write `soul.md`
- permanent `soul.md` is user-authorized

### 5. When memory is used for replies
This part remains deliberately conservative in V4:
- selected `soul.md` and `memory.md` entries are inserted into the character system prompt on every character generation
- session-only memory is also injected while the browser session is alive
- Group memory continues to enforce per-member knowledge firewall
- older exact chat-turn archival recall is triggered only by explicit past-reference cues (e.g. 記得 / 上次 / 之前 / remember / last time)
- recent exact conversation history still uses the existing bounded history windows

No broad retrieval-limit rewrite was made in V4. If user still sees unstable recall after testing the new write policy, the next phase should audit retrieval quotas / ranking separately rather than mixing it into the write-policy change.

## Suggested functional checks
1. Send: `記住我唔食辣`
   - should show memory scope card
   - choose "只限本次"
   - subsequent replies should know it
   - it should not appear in long-term memory
   - reload should clear that temporary memory
2. Send: `永遠記住我鍾意凍檸茶`
   - card should emphasize permanent
   - after approval it should enter soul.md as preference
   - reload should preserve it
3. Send: `你仲記唔記得上次去海邊？`
   - must NOT open the memory-store card
   - should execute normal recall/chat behavior
4. For Group, choose only one member on a session-only memory.
   - only that member should be allowed to know/use it.

## Next recommended work
After a few real conversations on Memory V4:
- inspect actual stored soul.md / memory.md quality
- if recall still feels unstable, profile retrieval selection separately:
  - single-chat 12-entry selection behavior
  - Group per-member 7-entry selection behavior
  - room-wide shared memory limit 8
  - old-turn archival recall cue coverage
Do not change retrieval limits merely to reduce line count or without real examples.
