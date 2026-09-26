# Phase 4E: Jev Synthetic Calibration Harness

## Why this phase exists

The five-turn V3 normal production smoke test confirmed the compact state
reduction: average Jev input was about 3,123 tokens, average latency was about
529 ms, and average cost was about USD 0.000131 per turn. Jev was available in
all five observations, while Gemma kept four candidates and revised one for
`persona_voice`.

The signals were not calibrated: baseline values were broadly elevated, with
`personaVoiceViolation` especially high and `groupNarrationViolation` around
0.44--0.49 for every single-chat record. Real-user collection is paused until
the questions can be tested against controlled evidence.

## Proposition questions

The existing fourteen upstream NOUL keys remain unchanged. Each question is
now a short literal proposition; its score means the probability that the
proposition is true. There is no global quality question, route, threshold,
or production decision derived from these values.

`group_narration_violation` is an explicit conjunction: `state.mode ===
'group'` and first-person narration for a participant occurs outside labelled
character dialogue. A single chat therefore makes the proposition false.

## Synthetic corpus and harness

The deterministic corpus contains 34 fictional cases: fourteen tightly paired
positive/negative examples plus six hard negative controls. It covers all
fourteen Gemma taxonomy categories, including single-mode and labelled-dialogue
group-narration controls. The `other` positive is an unreplaced visible
template placeholder, documented as a concrete response defect outside the
other thirteen categories.

Run offline fixture validation only:

```powershell
npm.cmd run jev:calibrate
```

This default command makes no network request. A real synthetic run requires
an explicit opt-in and uses the same production Decisions transport,
normalization, model alias, and timeout:

```powershell
npm.cmd run jev:calibrate -- --live
```

Optional safe JSON output contains only synthetic case IDs, categories,
expected labels, signals, model, latency, usage, costs, failure codes, and
aggregate statistics:

```powershell
npm.cmd run jev:calibrate -- --live --json-out tmp/jev-synthetic-results.json
```

The report presents positive/negative means, extrema, mean separation, and
paired directional results (`positive > matched negative`). It deliberately
does not call these accuracy metrics and has no guessed numeric pass/fail
threshold. Synthetic directional behaviour is a calibration check only; it
does not establish real-world production accuracy.

## Production authority

The harness is developer tooling. Production still starts at most one Jev
shadow request per reviewed turn, while Gemma runs for every review and remains
the sole authority for keep/revise, candidate application, retries, memory,
wardrobe, and state changes.
