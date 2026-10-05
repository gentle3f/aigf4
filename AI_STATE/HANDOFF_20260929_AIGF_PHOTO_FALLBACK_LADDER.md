# AIGF Character Photo Fallback Ladder — 2026-09-29

## Branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- Runtime code HEAD: `da03693 Add NSFW-aware photo fallback ladder`
- Previous continuity fix: `461004e Prioritize live photo continuity`
- Memory V4 remains in `63f1d68 Stabilize explicit and auto memory policy`

## User-observed failures
1. Photo prompt sometimes described broad room.scene instead of what characters were actually doing.
2. Accepting a photo sometimes returned provider "demand too high".
3. Subsequent attempts repeatedly returned near-black/blank images.

## Photo proposal fixes
- Recent completed dialogue/narration is PRIMARY continuity evidence.
- room.scene/location/presence/wardrobe is SECONDARY baseline.
- Recent completed interaction wins when it conflicts with stale room summary.
- The cold proposal module no longer creates a stale-room local fallback.
- The outer getResponse emergency proposal fallback was also removed.
- If every proposal model fails, the app returns an explicit retryable error instead of pretending a stale prompt is correct.

## Photo image execution fixes
CharacterPhotoProposal now stores:
- `contentMode: 'general' | 'nsfw'`

Image approval uses a bounded 3-model ladder.

### General edit
1. configured/preferred model (normally qwen-image-3-edit)
2. grok-imagine-edit
3. qwen-image-2-edit

### NSFW edit
1. qwen-edit-uncensored
2. configured/preferred model
3. grok-imagine-edit

### General generate
1. configured/preferred model (normally qwen-image-3)
2. grok-imagine-image
3. flux-2-pro

### NSFW generate
1. lustify-v8
2. lustify-v7
3. configured/preferred model

Provider discovery metadata with `most_uncensored` is also recognized.

Policy:
- max 3 distinct image models
- only the first model may receive one same-model retry for a clearly transient/capacity error
- near-black/blank image validation failure immediately advances to the next model
- other non-abort provider/model errors also advance to the next model
- abort stops immediately
- only a validated image is saved
- durable metadata records the ACTUAL successful model, resolution and price

## Real upstream smoke
Current Venice model discovery confirmed:
- lustify-v8 and lustify-v7 have `most_uncensored`
- qwen-edit-uncensored is available for image edit

Real safe-content smoke:
- lustify-v8 generate: PASS, valid non-black WebP
- qwen-edit-uncensored edit: PASS, valid non-black WebP
- edit preserved subject and changed the environment successfully

## Validation
- targeted character-photo tests: 19/19 PASS
- full suite: 626/626 PASS
- build PASS
- typecheck PASS
- git diff --check PASS
- main bundle ~356.29 kB / 124.46 kB gzip
- characterPhotoImagePolicy cold chunk ~1.33 kB / 0.79 kB gzip

## Mandatory
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.
- Keep NSFW photo routing uncensored-first.
- Do not reintroduce stale room-scene emergency photo proposals.
