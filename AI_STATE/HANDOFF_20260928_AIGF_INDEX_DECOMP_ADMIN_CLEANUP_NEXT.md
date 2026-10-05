# AIGF Handoff — Index Decomposition After Persona/Avatar Admin + Dead UI Cleanup

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current HEAD before this handoff-doc commit: `b33506f`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do **not** use Codex quota.
Do **not** use Remote Desktop Commander unless the user explicitly asks for it.
Do not use GitHub Actions for heavy work.
Keep changes conservative, tested, reversible, and separated into logical commits.

## Do not redo completed work
Already completed and committed:
- Jev diagnostics lazy loading
- public identity search lazy loading
- Live Cloud UI lazy loading
- Cloud Backup UI lazy loading
- Create Group UI lazy loading
- Room Memory UI lazy loading
- Room Info UI lazy loading
- Chat Model Settings UI lazy loading
- Album UI lazy loading
- Video job persistence extraction
- Video Studio lazy loading
- Mimic Persona Creator lazy loading
- Avatar Admin UI lazy loading
- Persona Settings UI lazy loading
- unreachable Avatar Prompt Editor removal
- unreachable legacy Persona Creator removal
- unreachable Diary UI/module removal
- unreachable Interests UI removal

Preserve behaviour in:
- Group generation
- Cc route
- normal chat send flow
- memory/retrieval
- wardrobe
- strict review / Gemma
- Jev production shadow
- relationship / continuity state

## Latest commits since previous decomposition handoff
- `33c2d9c` — Remove unreachable avatar prompt editor
- `e9ecfa7` — Lazy-load avatar admin UI
- `e66bf61` — Lazy-load persona settings UI
- `508c89e` — Remove unreachable legacy persona creator
- `0411126` — Remove unreachable diary UI module
- `b33506f` — Remove unreachable interests UI

Earlier decomposition commits remain authoritative as documented in the previous handoff.

## Validation at HEAD `b33506f`
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **356 / 356 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree — clean

## Objective progress

Original baseline:
- `index.tsx`: about **16,616 lines**
- main JS: about **924.96 kB minified / 307.32 kB gzip**

Current:
- `index.tsx`: **11,543 lines**
- main JS: **791.53 kB minified / 267.14 kB gzip**
- HTML: **118.01 kB / 22.64 kB gzip**

Net reduction from original baseline:
- about **5,073 index.tsx lines**
- about **133.43 kB minified main JS**
- about **40.18 kB gzip main JS**

The app is still above the Vite 500 kB main-chunk warning threshold. The decomposition goal is not complete.

## Current cold chunks from latest build
- createGroupUi — 2.34 kB / 1.18 gzip
- avatarAdminUi — 3.06 / 1.29
- chatModelSettingsUi — 3.19 / 1.42
- personaSettingsUi — 4.13 / 1.71
- liveCloudUi — 4.45 / 1.60
- roomInfoUi — 4.70 / 1.94
- albumUi — 5.34 / 2.15
- publicIdentitySearch — 6.41 / 2.58
- cloudBackupUi — 8.36 / 3.32
- roomMemoryUi — 9.52 / 3.90
- jevShadowDiagnostics — 10.84 / 3.31
- videoStudio — 39.38 / 14.65
- mimicPersonaCreator — 43.94 / 15.83

## New architectural boundaries

### Avatar Admin UI
- Avatar source picker / room member chooser / public identity search are cold.
- Local file input, image compression, and actual avatar persistence remain hot in `index.tsx`.
- Feature receives callbacks for persona/room reads and writes; it does not own MemoryManager/RoomManager runtime.
- Room Info hide/restore is callback-based so Avatar Admin does not directly own another cold feature.

### Persona Settings UI
- Modal DOM, form state, public identity editing, favorite-photo prompt normalization, and update assembly are cold.
- Main still owns actual persistence semantics:
  - `memoryManager.updatePersona`
  - `roomManager.updateMember`
  - currentPersona synchronization
  - one-message greeting-history rewrite
  - post-save system message
- Hot member switching uses `personaSettingsUi?.refreshAvatar()`; it does not trigger the dynamic import merely because a member changes.

## Dead UI cleanup completed

### Unreachable Avatar Prompt Editor
Removed:
- dead modal HTML
- DOM refs
- dead state
- open/close/save functions
- listeners

There was no opener/caller anywhere in the repo.

### Legacy Persona Creator
All active creation routes already use Mimic:
- public figure -> Mimic public
- create persona -> Mimic manual
- transcript -> Mimic transcript
- random recruit remains its separate real flow

Removed unreachable old creator:
- HTML modal
- creator-only DOM/state
- disabled stub functions
- listeners

Do not remove `MemoryManager.saveCustomPersona`; it is still used by active flows.

### Diary UI/module
`diary.ts` had 288 lines but zero import/init caller.
Removed:
- `diary.ts`
- hidden diary menu item
- diary modal HTML
- unused `diaryModule` variable

**Important compatibility boundary:** diary data methods/schema remain intentionally:
- `MemoryManager.getDiaryEntries/addDiaryEntry/getAllDiaryEntries`
- FileManager diary export/import
- Supabase cloud diary payload merge

Do not delete those merely because the UI is gone; they preserve existing user backup/data compatibility.

### Interests UI
The Interests button was hidden and its modal functions had zero callers.
Removed:
- hidden menu item
- interests modal HTML
- index DOM refs
- dead modal/render/toast stubs/listeners
- now-unused `Interest` import from index

**Important compatibility boundary:** Managers/FileManager/Supabase interests data methods remain intentionally for old data compatibility.

## Characterization protection
Recent tests:
- `tests/avatarAdminUiFeature.test.ts`
- `tests/personaSettingsUiFeature.test.ts`
- existing Video/Mimic/Album/Room/Cloud/Jev feature tests

These explicitly keep chat/group/review/memory execution out of cold admin features and keep persistence ownership in main where intended.

## Next candidates

### First: audit disabled Gift UI
Current evidence before handoff:
- gift button is hidden
- its click handler only calls disabled notice
- gift file input and preview runtime still exist
- `handleGiftSelection` only clears the input and shows disabled notice
- `removeGift` only clears dead attachedGift/preview state
- `showSelectionView` still calls `removeGift()`

Before deleting:
1. confirm no other programmatic click/open path for gift upload
2. confirm `attachedGift` is not included in send/generation logic anymore
3. if fully unreachable, remove hidden button/input/preview DOM, state, functions/listeners, and stale `removeGift()` call as one logical cleanup commit

### Other candidates after that
- another isolated disabled/unreachable modal if evidence proves it dead
- a larger cold UI island with real bundle benefit
- avoid whole-sale Image Studio split until shared image model state is separated

## Image Studio warning
Do not whole-sale split Image Studio yet.
Its image model state and helpers are shared by:
- chat photo proposals
- character photos/selfies
- Photo Viewer regeneration

A cosmetic split could pull the chunk back into hot paths or duplicate state.

## Process for continuing
For every extraction/cleanup:
1. prove reachability/dependency boundary first
2. preserve hot chat/Group behaviour
3. typecheck
4. full tests
5. production build
6. diff check
7. compare bundle size
8. commit one logical change
9. update durable handoff after several meaningful commits

## Immediate next action
1. Read this handoff and `AI_STATE/LATEST_HANDOFF.md`
2. Verify branch / HEAD / clean worktree
3. Audit Gift UI reachability
4. Remove it only if the button/input/preview path is fully unreachable
5. Otherwise choose another proven cold/dead island
