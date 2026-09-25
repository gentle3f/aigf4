# Phase 4B: Jev Shadow Diagnostics

## Purpose

This phase adds a read-only, in-page diagnostic view for the existing Jev shadow evaluator. Jev remains observational only: Gemma remains the authoritative strict-review path for every reply.

## Scope

- The collector retains at most 50 metadata-only observations in JavaScript memory.
- `getJevShadowRecords()` returns a detached, whitelisted snapshot.
- `clearJevShadowRecords()` clears only the current page-session collector.
- The chat "more options" menu exposes a `Jev Shadow` dialog with summary counts, an inspectable metadata table, manual refresh, clipboard JSON export, and clear confirmation.

## Data boundary

The collector and exported JSON may include request and provider metadata only: mode, status/reason codes, route probabilities, seven normalized signals, latency, usage, Gemma outcome, and comparison metadata.

They never include review state, system prompts, user messages, candidate responses, memory, persona data, scene text, or raw provider responses. There is no localStorage, sessionStorage, IndexedDB, cloud sync, Supabase, analytics, network request, or global debug object involved.

## Interpretation boundary

`falseNegativeCandidates` means only `Jev clean + Gemma revise`. It is a calibration candidate, not an accuracy claim. The diagnostics do not score either reviewer and do not influence routing, retries, model selection, candidate text, memory, scene state, or persistence.

## Lifecycle

Observations reset on page reload. The panel refreshes only when opened or when the user presses Refresh; it does not poll or use timers.
