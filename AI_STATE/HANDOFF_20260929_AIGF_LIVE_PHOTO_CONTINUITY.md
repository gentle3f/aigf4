# AIGF Live Photo Continuity Fix — 2026-09-29

## Branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- Runtime code HEAD: `461004e Prioritize live photo continuity`
- Previous memory checkpoint remains `63f1d68 Stabilize explicit and auto memory policy`

## Problem
Character photo proposal generation could silently fall back after all configured proposal models failed.
That local fallback used only stale room metadata:
- room.scene.location
- room.scene.summary

This could make the photo prompt describe the broad room situation instead of what the characters were actually doing in the newest completed interaction.

## Fix
- Recent completed conversation is now explicit PRIMARY photo continuity evidence.
- Room scene/location/presence/wardrobe is SECONDARY baseline only.
- Recent completed narration/dialogue explicitly outranks stale room summaries.
- The proposal model is told to silently reconstruct the current physical moment before producing the JSON prompt.
- One stable recent-message snapshot is reused across all proposal model attempts.
- If every configured proposal model fails, the app now refuses the stale local-scene fallback and returns a retryable error instead of generating a misleading photo prompt.
- No extra model call was added.

## Validation
- Character photo proposal targeted: 6/6 PASS
- Full suite: 620/620 PASS
- build PASS
- typecheck PASS
- git diff --check PASS
- main bundle unchanged around 357.11 kB / 124.59 kB gzip
- cold character photo proposal chunk ~11.69 kB / 5.19 kB gzip

## Regression cases
1. Room summary says character is sitting on sofa, recent completed dialogue says character is kneeling beside an open suitcase packing. Photo continuity evidence must mark the latter PRIMARY.
2. All proposal models fail. No stale room-summary photo draft may be returned.

## Mandatory
- GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.
