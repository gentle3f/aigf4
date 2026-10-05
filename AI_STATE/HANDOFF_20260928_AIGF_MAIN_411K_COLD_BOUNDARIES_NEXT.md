# AIGF Handoff — Main Entry ~411 KB, Cold Feature Boundary Mature

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current HEAD before this handoff-doc commit: `dd6bc05`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander unless explicitly requested.
Do not use GitHub Actions for heavy work.
Keep changes conservative, tested, reversible, and separated into logical commits.

## Core behavior that must not regress
Preserve:
- Group generation
- Cc independent route
- normal chat send / first text-message latency / active-request navigation semantics
- memory extraction / retrieval
- wardrobe / scene reality epoch
- strict review / Gemma
- Jev production shadow
- relationship continuity
- surprise-event continuation after a card is started
- room/private continuity handoff
- local/cloud backup semantics and safe import behavior

## Latest validated state
HEAD: `dd6bc05` — Lazy-load surprise event engine

Validation:
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **387 / 387 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree clean after commit

Latest main entry:
- **410.95 kB minified / 146.37 kB gzip**
- original baseline: about 924.96 / 307.32
- main reduction from baseline: about **514 kB minified / 161 kB gzip**
- Vite >500k warning remains gone

## Recent high-value commits
- `852fe5e` — Lazy-load file manager workflows
- `6262a77` — Lazy-load random persona catalog
- `df91c08` — Lazy-load Supabase cloud sync
- `3295af7` — Lazy-load JSZip runtime
- `f14b294` — Lazy-load Cloud Backup manager
- `7be31de` — Lazy-load auto-memory extractor
- `25f7121` — Lazy-load Venice image transport
- `60da6d1` — Lazy-load observed NPC persona analyzer
- `dd6bc05` — Lazy-load surprise event engine

## Important current cold boundaries

### FileManager
All manual import/export/download/archive work uses cached `loadFileManager()`.
Cloud Backup sees only narrow archive-provider callbacks.

### Supabase cloud sync
Full sync manager + Supabase client load only after auth or explicit Live Cloud access.
They are not HTML module-preloaded.

### Cloud Backup
Lightweight `cloudBackupState.ts` is hot.
Full manager loads only for persisted enabled state or explicit Cloud Backup UI.
Enabled users retain startup auto-backup semantics.

### JSZip
No eager CDN script in HTML.
`jsZipLoader.ts` loads cdnjs JSZip 3.10.1 only when a ZIP operation actually occurs.

### Random Persona
Large persona catalog is dynamic.
Random recruit + Mimic manual randomize share the same cached loader.

### Auto Memory
Tiny `autoMemoryPolicy.ts` stays hot for threshold/version checks.
Full `autoMemory.ts` loads only after summary threshold/recovery/manual summary actually requires batching/parsing.
Managers/RoomManager/RoomMemory UI all import policy constants instead of forcing extractor hot.

### Venice image transport
Tiny `veniceImagePolicy.ts` keeps image model defaults hot.
Full `veniceImage.ts` loads only on explicit image model listing/generation/edit paths.
Normal text chat does not load it.

### Observed NPC persona analyzer
Ordinary NPC detection remains hot where needed.
`observedNpcPersona.ts` loads only when the user accepts an NPC promotion and no existing stored persona can be reused.

### Surprise Event engine
Hot:
- `relationshipState.ts`: relationship prompt + post-turn relationship pulse
- `surpriseEventPresentation.ts`: category/intensity display labels

Cold:
- full `experienceEngine.ts` surprise-event parser/schema/fallback/similarity/playability/category/NSFW machinery
- loaded once at start of `generateSurpriseEvent()`

`groupChat.ts` now imports relationship prompt directly from `relationshipState.ts`, so Group no longer pulls in the whole event engine.

Latest experience cold chunk:
- **21.79 kB / 10.49 gzip**

## Latest notable cold chunks
- jsZipLoader 0.77 / 0.44 gzip
- chatSearchUi 1.63 / 0.74
- newSceneAction 1.90 / 1.15
- photoPromptUi 2.00 / 1.01
- createGroupUi 2.34 / 1.18
- veniceImage 2.64 / 1.35
- avatarAdminUi 3.06 / 1.29
- chatModelSettingsUi 3.19 / 1.42
- autoMemory 3.82 / 1.68
- personaSettingsUi 4.13 / 1.71
- observedNpcPersona 4.14 / 2.33
- liveCloudUi 4.45 / 1.60
- roomInfoUi 4.85 / 1.97
- albumUi 5.39 / ~2.19
- publicIdentitySearch 6.41 / 2.58
- conversationActions 7.20 / 2.92
- cloudBackupUi 8.36 / 3.32
- roomMemoryUi 9.52 / 3.90
- cloudBackup 10.54 / 4.33
- jevShadowDiagnostics 10.84 / 3.28
- photoViewerUi 13.26 / 5.23
- participantActionUi 13.31 / 5.10
- fileManager 17.13 / 5.87
- experienceEngine 21.79 / 10.49
- videoStudio 39.38 / 14.66
- mimicPersonaCreator 44.06 / 15.89
- randomPersona 60.79 / 28.32
- Supabase client 101.40 / 28.27
- supabaseCloudSync 232.22 / 61.22

## New characterization tests since previous handoff
- `tests/cloudBackupManagerLazyFeature.test.ts`
- `tests/autoMemoryLazyFeature.test.ts`
- `tests/veniceImageLazyFeature.test.ts`
- `tests/observedNpcPersonaLazyFeature.test.ts`
- `tests/experienceEngineLazyFeature.test.ts`

## Optimization policy from here
Main is already well below the original 500 kB goal.
Do **not** chase bundle size if it increases first text-message latency.

Avoid lazy-loading or destabilizing:
- `venice.ts` text transport
- `groupChat.ts` generation/parser core
- `npcDialogue.ts` normal prompt/response continuity
- strict review / Jev production path
- memory retrieval used during prompt construction
- core managers / room manager
unless a clearly non-hot seam is proven first.

Good next work:
1. audit remaining static imports for modules used only by explicit admin/media/background flows;
2. prefer extracting cold sub-features from mixed modules rather than lazy-loading an entire hot module;
3. stop when only first-message/core-chat dependencies remain.

## Continue process
For each change:
1. prove runtime boundary
2. preserve first-message/chat/Group semantics
3. typecheck
4. targeted characterization test
5. full tests
6. production build
7. diff check
8. compare initial bundle/preload graph
9. commit one logical change
10. update handoff after several meaningful commits
