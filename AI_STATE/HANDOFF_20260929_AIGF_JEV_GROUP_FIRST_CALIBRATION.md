# AIGF Jev Group-First Calibration Handoff — 2026-09-29

## Current branch / HEAD
- Branch: `perf/cleanup-send-latency-20260923`
- Current HEAD: `d0a6fe5 Record deterministic group narration shadow`
- Branch is intentionally far ahead of remote. Do not blindly push/deploy the full branch.
- Use GEN-FUJI Local MCP only. No Remote Desktop Commander. No Codex quota.

## Production status
Production is NOT this HEAD.

Current production was deployed from the isolated release branch based on `19fc7d5` with only:
- `1316979 Open chat history at latest message`
- `c192386 Add mobile Jev JSON export`

Production deployment ID:
- `dpl_BsSRQZRqPaCcqggpe8hcGwpxPHGo`

`wetapp.madproduction.ai` returned HTTP 200 and Vercel runtime error scan was clean immediately after deploy.

Do not deploy the main work branch unless a deliberately isolated release is prepared.

## Real Group production evidence already collected
User exported 63 Jev shadow records.

Important observations:
- All 63 are Group mode, Cc=false.
- 59 Jev OK, 4 unavailable.
- Gemma: 49 keep, 14 revise.
- Gemma revise reasons include:
  - group_narration: 9
  - wardrobe: 2
  - persona_voice: 2
  - other: 2
- Existing Jev `groupNarrationViolation` had essentially no separation against Gemma `group_narration` in this cohort.
- Key conclusion: do not tune a threshold on the existing Group narration signal.

## Root-cause insight
The app already parses Group output into structured segments.

Existing deterministic helper:
- `groupNarrationUsesFirstPerson(parsed)`

It directly checks narration segments for first-person ownership (`我 / I / me / my / mine`).
Therefore Group narration ownership is not fundamentally an AI semantic-judgment problem.

Gemma strict rule:
- Group narration must remain external third-person.
- First person is allowed only inside labelled character dialogue.

The current Jev production proposition asks Jev to infer this from the full serialized candidate envelope, which includes dialogue, narration, scene JSON, and NPC transport metadata. That is likely the wrong layer of abstraction.

## Completed in d0a6fe5
New Group shadow observations now record safe deterministic metadata:
- `calibrationCohort: 'group-deterministic-v1'`
- `deterministicGroupNarrationViolation: boolean`

The Boolean comes directly from `groupNarrationUsesFirstPerson(candidate)` before strict review.

Properties:
- Group only.
- Metadata-only.
- No chat text, prompts, state, names, or secrets persisted.
- Old records remain valid and untouched.
- No routing authority.
- Gemma remains 100% authoritative.
- Existing Jev questions are unchanged for now.

Diagnostics export summary now includes:
- checkedCount
- violationCount
- clearCount
- withGemmaIssueAndViolation
- withGemmaIssueButClear
- withoutGemmaIssueButViolation
- withoutGemmaIssueAndClear
- Jev average groupNarration signal for deterministic true vs false

This allows the next production cohort to directly compare:
1. deterministic parser truth
2. Jev probability
3. Gemma group_narration label

## Validation
For `d0a6fe5`:
- targeted Jev tests: 15/15 PASS
- typecheck: PASS
- full suite: 567/567 PASS
- production build: PASS
- diff check: PASS
- main bundle: ~380.90 kB / 133.04 kB gzip
- Jev diagnostics cold chunk: ~12.99 kB / 4.02 kB gzip

No deployment from this commit.

## Immediate next actions
Continue in this order:

1. Add the deterministic Group narration cohort summary to the Jev Shadow UI so it is visible without manual JSON analysis.
2. Design a Group-first Jev semantic gate that does NOT ask Jev to re-derive structured narration ownership from serialized text.
3. Keep deterministic hard checks separate from Jev semantic checks.
4. Create controlled Group A/B fixtures for the new semantic gate, using production-shaped Group states.
5. Do not promote any Jev routing authority or skip Gemma yet.
6. After a clean new cohort design is ready, deploy only through an isolated production release branch if explicit production collection is needed.
7. The transport metadata leak fix `c89153d` is still only on the main branch and not yet on production; if deploying it, use an isolated safe backport.

## Main architectural principle
User primarily uses Group chat. Optimize Jev for Group-first evidence instead of spending time collecting Normal/Cc data first.

Do not chase thresholds on a broken proposition. Fix the evidence/question boundary first.
