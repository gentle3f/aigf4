# AIGF Handoff — Main Entry ~395 KB, Bundle Micro-Splitting Stop Line

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current HEAD before this handoff-doc commit: `7af63dc`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless explicitly requested.
Do not use GitHub Actions for heavy work.
Keep changes conservative, tested, reversible, and separated into logical commits.

## Core behaviour that must not regress
Preserve:
- normal single-chat send and first text-message latency
- Group generation and parser/display behaviour
- Cc independent route
- active-request navigation semantics
- memory extraction / retrieval
- wardrobe / scene reality epoch
- strict review / Gemma
- Jev production shadow
- relationship continuity
- surprise-event continuation after a card starts
- room/private continuity handoff
- local/cloud backup and safe import behaviour

## Latest validated state

Current code HEAD:
- `7af63dc` — Preconnect Google Fonts origins

Validation across the latest code changes:
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **395 / 395 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree clean after commit

Latest production build:
- main JS: **395.44 kB / 140.23 kB gzip**
- HTML: **108.16 kB / 20.92 kB gzip**
- Vite >500 kB warning: gone

Original baseline:
- main JS about **924.96 kB / 307.32 kB gzip**

Net main-entry reduction:
- about **529.5 kB minified**
- about **167.1 kB gzip**

## Milestones since the previous 411 kB handoff

### 1. Chat Experience UI cold split
Commit:
- `8778dfe` — Lazy-load chat experience UI

Hot:
- `ChatPreferences`
- `defaultChatPreferences`
- `preferencePrompt()`

Cold in `features/chatExperienceUi.ts`:
- `parseExperienceSuggestions`
- `experienceDialog`
- `experienceButton`
- `editChatPreferences`

User-triggered entry points share one cached loader.

Build impact:
- new cold chunk: **2.20 kB / 1.28 gzip**
- main: **410.95 → 409.27 kB**

### 2. Group prompt builder split with prefetch
Commit:
- `9945758` — Prefetch lazy Group prompt builder

Moved the large Group prompt-construction block from `groupChat.ts` to:
- `groupChatPrompt.ts`

`groupChat.ts` remains hot for:
- history selection
- display repair
- parser / envelope handling
- segment normalization
- room member resolution

`groupChatPrompt.ts` owns:
- member/persona prompt blocks
- memory firewall prompt
- texting/physical reality contract
- wardrobe prompt
- prompt accounting
- `buildGroupSystemPromptWithAccounting()`
- `buildGroupSystemPrompt()`

Important latency protection:
- opening a room calls `loadGroupChatPromptModule()` in the background
- Group send/review await the same cached promise
- first Group send normally has the prompt chunk prefetched already

Existing Group prompt and parser test corpus remained unchanged semantically.

Build impact:
- Group prompt cold chunk: **11.79 kB / 4.91 gzip**
- main: **409.27 → 398.08 kB**
- main crossed below **400 kB**

### 3. Media stores removed from pure-text startup
Commit:
- `5db1b46` — Lazy-load media stores

Removed static main imports of:
- `photoStore.ts`
- `chatMediaStore.ts`

Cached loaders are used only when an actual image/attachment operation needs:
- get character photo blob
- save character photo asset
- get chat attachment blob
- save chat attachment

A characterization test confirms normal single-text generation does not depend on either loader.

Build impact:
- chatMediaStore cold chunk: **1.36 kB / 0.64 gzip**
- photoStore cold chunk: **1.45 kB / 0.70 gzip**
- main: **398.08 → 396.07 kB**

### 4. Participant-only persona conversion removed from hot continuity module
Commit:
- `7f446de` — Keep persona conversion on participant path

Moved:
- `roomMemberToPersona()`
- room-memory -> persona-memory conversion
- persona-memory merge helpers

from hot `conversationTransfer.ts` into:
- `conversationTransferPersona.ts`

Runtime consumer is only the already-cold:
- `features/participantActionUi.ts`

Hot `conversationTransfer.ts` keeps only continuity/bridge responsibilities required by normal chat opening/history.

Build impact:
- main: **396.07 → 395.44 kB**
- Participant Action cold chunk grew correspondingly
- full suite became **395 / 395 PASS**

### 5. Google Fonts connection warm-up
Commit:
- `7af63dc` — Preconnect Google Fonts origins

Added before the existing font stylesheet:
- preconnect to `fonts.googleapis.com`
- preconnect to `fonts.gstatic.com` with crossorigin

No font, layout, or visual design change.
There are no eager third-party JavaScript/CDN scripts left in `index.html`.

## Important current cold boundaries

Cold chunks now include:
- jsZipLoader — 0.77 / 0.44 gzip
- chatMediaStore — 1.36 / 0.64
- photoStore — 1.45 / 0.70
- chatSearchUi — 1.63 / 0.74
- newSceneAction — 1.90 / 1.16
- photoPromptUi — 2.00 / 1.01
- chatExperienceUi — 2.20 / 1.28
- createGroupUi — 2.34 / 1.18
- veniceImage — 2.64 / 1.35
- avatarAdminUi — 3.06 / 1.29
- chatModelSettingsUi — 3.19 / 1.42
- autoMemory — 3.82 / 1.68
- personaSettingsUi — 4.13 / 1.71
- observedNpcPersona — 4.14 / 2.33
- liveCloudUi — 4.45 / 1.60
- roomInfoUi — 4.85 / 1.97
- albumUi — 5.46 / 2.20
- publicIdentitySearch — 6.41 / 2.58
- conversationActions — 7.32 / 2.97
- cloudBackupUi — 8.39 / 3.34
- roomMemoryUi — 9.52 / 3.90
- cloudBackup — 10.54 / 4.33
- jevShadowDiagnostics — 10.90 / 3.34
- groupChatPrompt — 11.79 / 4.91
- photoViewerUi — 13.32 / 5.25
- participantActionUi — ~13.96 / 5.29
- fileManager — 17.28 / 5.92
- experienceEngine — 21.79 / 10.49
- videoStudio — 39.38 / 14.66
- mimicPersonaCreator — 44.06 / 15.89
- randomPersona — 60.79 / 28.32
- Supabase client — 101.40 / 28.27
- supabaseCloudSync — ~232.37 / 61.29

## New characterization tests since the 411 kB handoff
- `tests/chatExperienceUiLazyFeature.test.ts`
- `tests/groupChatPromptLazyFeature.test.ts`
- `tests/mediaStoreLazyFeature.test.ts`
- `tests/conversationTransferPersonaLazyFeature.test.ts`

Existing characterization tests were updated only where module ownership changed; behavioural assertions were not weakened.

## Audits that were intentionally NOT turned into changes

### Unused GROUP_RESPONSE_FORMAT
`GROUP_RESPONSE_FORMAT` has no live caller.
It was temporarily removed and the whole test suite passed.
Production build size did not change by even one byte because the bundler already tree-shakes it.
The cleanup was therefore reverted rather than committing zero-impact churn.

### photoPromptPreference
Only ~1.3 kB source.
Some helpers participate in the character-photo proposal path after chat replies.
Dynamic splitting would add boundary complexity for negligible savings.
Leave hot.

### videoStudioPersistence
Index only needs a pending-job read at startup; full Video Studio is already cold.
The current ESM bundle likely tree-shakes unused write/remove code.
Further splitting would save very little and risks subtly changing corrupt-job cleanup semantics.
Do not split unless measured runtime evidence justifies it.

### conversationTransfer
The remaining hot module is required synchronously for:
- start-chat scene-transition repair
- private-return handoff recovery
- context-bridge prompt conversion
- context-bridge display

Do not make normal chat opening asynchronous merely to save another small chunk.

## Bundle micro-splitting stop line

At **395.44 kB / 140.23 gzip**, remaining large hot dependencies are predominantly true chat/runtime core:
- managers / persistence state
- roomManager
- personas
- Venice text transport
- NPC dialogue continuity
- Group parser/display/history shell
- memory retrieval
- wardrobe state
- conversation continuity bridges
- model routing
- strict review / Jev production path

Do **not** continue splitting these merely to reduce bundle numbers.
The next optimization phase should be driven by measured runtime latency or reliability, not source size.

## Recommended next AIGF direction

Choose work from actual user-perceived/runtime evidence:
1. inspect existing chat performance instrumentation and current generation trace timing;
2. identify where first reply latency is actually spent (prompt build, request, review, render, persistence);
3. optimize only a measured bottleneck;
4. separately continue product/reliability work if a current AIGF feature priority exists.

Avoid resuming blind bundle archaeology unless the startup/network profile later shows a specific remaining problem.
