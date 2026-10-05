# AIGF Surprise Event Generation Lazy Handoff — 2026-09-29

## Branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- HEAD: `07b45b3 Lazy-load Surprise Event generation`
- Use GEN-FUJI Local MCP only.
- Do not use Remote Desktop Commander.
- Do not use Codex quota.
- Do not deploy the main branch automatically.

## Jev state preserved
Previous authoritative Jev details remain in:
- `AI_STATE/HANDOFF_20260929_AIGF_JEV_GROUP_GATE_V2_COLLAPSED.md`

No Jev/Gemma routing authority changed.
Gemma remains authoritative.
No threshold / skip-Gemma policy is approved.

## Surprise Event cold split
`07b45b3 Lazy-load Surprise Event generation`

New cold feature:
- `features/surpriseEventGeneration.ts`

Moved out of startup/main:
- Surprise Event member-context construction
- large event system prompt
- NSFW/non-sexual event authoring rules
- event model route execution
- proposal parsing/validation
- recent-event similarity rejection
- event fallback construction

Kept in main:
- event modal/options UI
- persistence and card insertion
- active-event start/director cue
- active-event lifecycle through normal send/getResponse
- relationship updates and continuation

The cold feature receives only a narrow request snapshot plus prepared history/recent messages and callbacks for:
- model execution
- runtime status
- text normalization
- abort classification

It does not own memory persistence, sendMessage/getResponse, strict review, Jev, local storage, cloud, or DOM.

## Validation
- focused Experience Engine / lazy-feature tests: 18/18 PASS
- full suite: 580/580 PASS
- typecheck PASS
- build PASS
- diff check PASS
- index.tsx: 9,500 lines
- main JS: ~371.10 kB / 128.96 kB gzip
- before split main JS: ~383.18 kB / 133.42 kB gzip
- startup reduction: ~12.08 kB raw / ~4.46 kB gzip
- new cold chunk: surpriseEventGeneration ~40.35 kB / 17.91 kB gzip

No deployment.

## Next audit
Current promising next seam:
- character photo proposal generation (large cold prompt/model/fallback path)

Caution:
- `buildCharacterPhotoPrompt` and image model selection are shared with interactive photo-proposal cards, so do not blindly move them if it would force synchronous card interactions async.
- Prefer extracting only photo-request generation/draft logic first, leaving shared prompt helpers hot unless a clean dependency seam is proven.
