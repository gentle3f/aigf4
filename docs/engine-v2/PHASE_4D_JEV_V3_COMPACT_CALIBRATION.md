# Phase 4D: Jev V3 Compact Calibration

## Scope

Jev remains best-effort and shadow-only. Gemma always runs and is the only
reviewer that can keep, revise, retry, or affect the response. A reviewed turn
starts at most one Jev request.

## Compact review state

V3 replaces V2 `authoritativeContext` with deterministic `personaEvidence`.
It is capped at 4,000 characters and contains only a persona name,
description, and persona prompt. Group evidence shares its bounded budget
across members so an oversized first persona cannot remove other names.

V3 uses the same strict-review history source, excludes the dedicated newest
user message and system messages, and limits retained history to four messages
and 4,000 characters. The complete state remains capped at 48,000 characters.
No memory retrieval is added for Jev.

## Signals only

The Decisions request contains exactly fourteen closed, independent NOUL
signals aligned with the Gemma taxonomy:

`request_mismatch`, `identity`, `speaker_ownership`, `continuity`,
`reality_layer`, `wardrobe`, `state`, `replayed_beat`, `persona_voice`,
`third_party_speech`, `user_agency`, `incomplete_ending`, `group_narration`,
and `other`.

There is no route question, route probability, confidence, agreement,
disagreement, or false-negative calculation in V3. Jev metadata is marked
`taxonomyVersion: 'v3'` and has no production authority.

## Calibration metadata

Diagnostics retain only safe request metadata, model, latency, usage, all
fourteen signals, Gemma's sanitized issue codes, comparable issue codes, and
anomaly labels. `group_narration` produced for a single chat is retained as a
Gemma anomaly and omitted from comparable issue codes. It does not change
Gemma's decision or any reply behaviour.

The diagnostics panel and JSON export remain session-only and do not include
review state, prompt text, chat text, or persisted data.
