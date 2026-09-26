# Phase 4G: Jev Controlled Factor Isolation

## Purpose

Phase 4G adds a fictional, offline calibration corpus for isolating individual structural and evidence factors that may move Jev review signals. It does not change production review behavior, questions, model selection, routing, thresholds, or authority.

## Current evidence

The frozen clean benchmark completed 34 cases with 14 directional pairs. It showed clear synthetic separation for group narration, persona voice, replayed beats, and wardrobe, but also showed important controls such as a non-zero labelled-dialogue group-narration signal and an unestablished-wardrobe signal.

The frozen production-shape parity benchmark completed 20 cases. Its group transport envelope, Cc persona evidence, complex history, and serialized scene shapes moved some negative baselines relative to the clean corpus. Production observations still show higher Normal/Cc/Group shadow signals in places than either fictional suite explains.

## Why factor isolation

Synthetic clean controls and production-shaped controls each combine several differences at once. This corpus changes one declared factor at a time while preserving the category, expected label, semantic candidate marker, and baseline linkage wherever possible. A measured delta is descriptive calibration evidence only; it cannot prove a real-world causal mechanism.

## Families

- `group_narration`: group mode, chat wrapper, labelled dialogue, first person within a label, scene and NPC tags, full serializer envelope, persona evidence, scene duplication, and role-labelled history.
- `persona_voice`: description and prompt length, multiple rules, bilingual and Traditional Chinese evidence, candidate language and code switching, and group persona evidence. Each negative candidate is compatible with its supplied explicit voice rule.
- `replayed_beat`: bounded history, repeated objects or verbs, incomplete-action wording, similar different actions, scene duplication, and full group transport. Every negative explicitly keeps the target repair uncompleted.
- `continuity`: bounded history, participants, repeated location evidence, scene summary, unresolved items, proposed scene, embedded scene, duplication, and full group transport. Every negative remains in the Lantern workshop.
- `wardrobe`: a small stable anchor set for established conflict, established match, and unspecified clothing.

## Privacy and authority boundary

All fixtures use fictional people and fictional scenes. The harness writes no user content by default, makes no network request unless an operator explicitly supplies `--live`, and safe JSON output excludes ReviewState, candidate text, persona text, history, keys, headers, and environment values.

Jev remains shadow-only. Gemma remains the sole production authority. There are no thresholds, routes, skip-Gemma behavior, or production state mutations in this phase.

## Next step

After code audit, run one explicit live isolation calibration only. Do not tune questions or set a threshold before reviewing the untouched results.
