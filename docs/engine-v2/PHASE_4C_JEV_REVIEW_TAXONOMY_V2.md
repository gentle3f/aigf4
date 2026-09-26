# Phase 4C: Jev Review Taxonomy V2 and Evidence Alignment

## Why V1 changed

Production calibration recorded 64 shadow observations: Jev selected `full_review` 62 times and `clean` twice, while Gemma selected `revise` 16 times. That routing rate would save about 3% of Gemma calls, so V1 was too sensitive to be useful as an observational gate.

This phase does not solve that by adding a threshold. Threshold tuning would hide an evidence and taxonomy mismatch rather than correct it. V1 did not receive explicit mode, Cc mode, the existing authoritative review context, or bounded recent completed history. It therefore could not judge several of the same categories Gemma receives evidence for.

Gemma remains a comparator, not ground truth.

## V2 request evidence

`ReviewState` now carries explicit `mode` (`single` or `group`) and `ccMode`. It retains existing state fields and adds two Jev-only, transient evidence fields:

- `authoritativeContext`: the exact authoritative prompt already built for Gemma, retained unchanged up to 12,000 characters; longer input uses a deterministic head and tail split with a neutral marker.
- `recentHistoryText`: a deterministic snapshot from the same strict-review history source, retaining up to eight most-recent visible user/assistant messages and 8,000 characters. The newest user message is excluded because it already has its own `latestUserText` field.

No memory retrieval, second prompt construction, network request, or summarization is added. Gemma still receives its full existing authoritative prompt and its existing history without semantic change. The client bounds optional Jev evidence again against the unchanged 48,000-character ReviewState cap, so added evidence cannot push an otherwise valid state over that server limit.

## Taxonomy and routing semantics

Jev V2 aligns with the existing closed Gemma issue taxonomy:

`request_mismatch`, `identity`, `speaker_ownership`, `continuity`, `reality_layer`, `wardrobe`, `state`, `replayed_beat`, `persona_voice`, `third_party_speech`, `user_agency`, `incomplete_ending`, `group_narration`, and `other`.

Questions are conservative: a high signal requires an actual, concrete material defect supported by supplied evidence. Missing, ambiguous, speculative, stylistic, or merely unusual content is low. Consensual adult intimacy, explicitness, emotional intensity, and fictional role-play are not defects themselves. `group_narration` is explicitly relevant only to group mode, and first person remains permitted inside labelled dialogue.

The route is `clean` unless a supported concrete defect warrants full strict review. Uncertainty or several weak concerns do not escalate it, and insufficient evidence prefers `clean`. There is no numeric threshold.

## Authority, privacy, and follow-up

Jev remains best-effort and shadow-only. Each reviewed turn starts at most one Jev request, then Gemma still runs for every reply and remains the only reviewer that can keep, revise, or affect candidate application. V2 signals, route, and fixed `taxonomyVersion: 'v2'` are metadata only; they have no skip, write, retry, or routing authority.

The in-memory diagnostics collector and Copy JSON remain metadata-only. They can include the V2 signal values, timing, usage, route, Gemma's closed reason labels, and taxonomy version, but never authoritative context, history, latest user text, candidate text, scene text, participant names, wardrobe text, memory summaries, prompts, or provider bodies. Nothing is persisted, synced, or sent to analytics.

After deployment, collect a new V2 sample across normal, Cc, and group chats. Compare route distribution, each category's calibration against Gemma keep/revise and closed reasons, latency, input/output tokens, cost, unavailable rates, and any clean/revise comparator disagreements before considering any future authority change.
