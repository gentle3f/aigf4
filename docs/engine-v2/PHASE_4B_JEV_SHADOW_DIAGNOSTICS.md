# Phase 4B: Jev Shadow Diagnostics

## Purpose and authority

Jev is observational only. Gemma remains the authoritative strict-review path for every reply. Gemma keep/revise outcomes are comparator data, not ground truth or an accuracy label. No thresholds, skip-Gemma behaviour, routing changes, retry changes, model changes, or candidate-application changes are introduced here.

## In-memory metadata boundary

The collector retains at most 50 metadata-only observations in JavaScript memory. `getJevShadowRecords()` returns a detached, whitelisted snapshot; `clearJevShadowRecords()` clears only this page-session collector.

Allowed diagnostics metadata includes provider route/status data, normalized Jev signals, latency and usage, Gemma keep/revise/unavailable, and closed Gemma issue labels. It never includes review state, prompts, user messages, candidate responses, scene or memory text, participant names, wardrobe strings, raw provider responses, raw Gemma issue text, revised responses, or API keys.

There is no localStorage, sessionStorage, IndexedDB, cloud sync, Supabase, server persistence, analytics, network request, or global debug object in the diagnostics path. Records reset on page reload. The panel refreshes only on open or manual Refresh; it does not poll.

## Closed Gemma reason labels

The strict-review JSON schema and parser share this fixed list:

- `request_mismatch`: the candidate materially fails the newest request.
- `identity`: identity, named person, or fixed role conflict.
- `speaker_ownership`: speech, action, thought, or first-person ownership is assigned incorrectly.
- `continuity`: a material completed-scene contradiction not covered more specifically below.
- `reality_layer`: physical, texting, or imagined reality mode conflict.
- `wardrobe`: authoritative outfit conflict.
- `state`: location, presence, body position, or other current physical-state conflict.
- `replayed_beat`: an old instruction, completed action, or finished beat is replayed.
- `persona_voice`: material personality, voice, regional-language, or characterization failure.
- `third_party_speech`: relevant third-party participation or speech is mishandled.
- `user_agency`: a consequential user speech, action, choice, or commitment is invented.
- `incomplete_ending`: the response is materially incomplete or cut off.
- `group_narration`: group narration or first-person envelope rule failure.
- `other`: a concrete defect that fits no named label.

These are labels for the existing conservative review criteria only. They do not make the reviewer more eager to revise. `KEEP` always parses as `issues: []`; `REVISE` retains only recognized labels, deduplicates them, and falls back to `['other']` when no recognized label remains. Legacy tagged revisions also use `['other']`. Rejected raw labels are never retained or logged.

## Jev comparison display

Jev Shadow shows per-record closed Gemma labels and non-zero aggregate `Gemma revise reasons`. Copy JSON contains only the whitelisted metadata, including `gemmaIssueCodes` and `summary.gemmaIssues`.

The historical internal field `falseNegativeCandidate` remains for compatibility only. The UI calls it `Jev clean / Gemma revise` and explains it as comparator disagreement only, not a proven false negative.
