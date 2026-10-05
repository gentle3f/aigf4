# AIGF Handoff — Initial Bundle Below 500 KB

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current HEAD before this handoff-doc commit: `3295af7`
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
- normal chat send / active-request navigation semantics
- memory extraction / retrieval
- wardrobe / scene reality epoch
- strict review / Gemma
- Jev production shadow
- relationship / surprise-event continuation state
- room/private continuity handoff
- local/cloud backup semantics and safe import behavior

## Latest validation at HEAD `3295af7`
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **376 / 376 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS
- worktree — clean

## Bundle milestone

Original baseline:
- `index.tsx`: about **16,616 lines**
- main JS: about **924.96 kB minified / 307.32 kB gzip**

Previous sub-10K handoff:
- `index.tsx`: **9,974 lines**
- main JS: **759.70 kB / 257.04 kB gzip**

Current latest build:
- `index.tsx`: about **10,047 lines** (line count is no longer the optimization target)
- main JS: **450.97 kB / 162.73 kB gzip**
- HTML: **108.02 kB / 20.90 kB gzip**
- Vite large-chunk warning: **gone**

Net main-bundle reduction from original baseline:
- about **474 kB minified**
- about **145 kB gzip**

## Major commits since the sub-10K handoff
- `852fe5e` — Lazy-load file manager workflows
- `6262a77` — Lazy-load random persona catalog
- `df91c08` — Lazy-load Supabase cloud sync
- `3295af7` — Lazy-load JSZip runtime

## New boundaries

### FileManager
`fileManager.ts` is no longer statically imported by `index.tsx`.

One cached `loadFileManager()` singleton now serves:
- manual current-chat export
- export all chats
- image ZIP download
- ZIP import
- room export
- save-before-exit
- Cloud Backup archive packing / restore

CloudBackupManager now depends on a narrow `CloudBackupArchiveProvider`:
- `createAllDataArchive()`
- `getLastBackupMediaSummary()`
- `restoreAllDataArchive()`

Latest build:
- FileManager cold chunk: **17.13 kB / 5.85 gzip**

### Random Persona catalog
`randomPersona.ts` (large static catalog) is no longer in startup graph.

Shared dynamic loader:
- random recruit
- Mimic manual randomize seed

Mimic seed dependency now accepts async seed creation.

Latest build:
- randomPersona cold chunk: **60.79 kB / 28.32 gzip**

### Supabase Cloud Sync
`SupabaseCloudSyncManager` is no longer constructed before auth check.

It is loaded through a singleton dynamic import when:
- auth succeeds and sync starts
- user explicitly opens Live Cloud

Startup semantics remain:
- refresh auth session first
- if unlocked, await cloud sync start

Latest build:
- supabaseCloudSync dynamic chunk: **232.21 kB / 61.20 gzip**
- Supabase client chunk: **101.40 kB / 28.27 gzip**
- neither is module-preloaded by `dist/index.html`

This was the change that took the main entry below 500 kB.

### JSZip
The old eager HTML script was removed:
- no startup cdnjs JSZip request

New shared `jsZipLoader.ts` loads the same cdnjs JSZip 3.10.1 only when a ZIP operation is actually requested.

Cold consumers:
- FileManager
- Album selected-photo ZIP
- Mimic transcript ZIP import

Latest build:
- jsZipLoader chunk: **0.77 kB / 0.44 gzip**
- `dist/index.html`: **NO_EAGER_JSZIP**

## Initial HTML dependency verification
Latest `dist/index.html` preloads only:
- main entry
- rolldown runtime
- CSS

It does **not** preload:
- Supabase cloud sync
- Supabase client
- FileManager
- randomPersona
- JSZip

## New characterization tests
- `tests/fileManagerLazyFeature.test.ts`
- `tests/randomPersonaLazyFeature.test.ts`
- `tests/supabaseCloudSyncLazyFeature.test.ts`
- `tests/jsZipLazyFeature.test.ts`
- existing Cloud Backup / Live Cloud / navigation tests updated where architecture changed

## Current meaningful cold chunks
- jsZipLoader — 0.77 / 0.44 gzip
- chatSearchUi — 1.63 / 0.74
- newSceneAction — 1.90 / 1.15
- photoPromptUi — 2.00 / 1.01
- createGroupUi — 2.34 / 1.18
- avatarAdminUi — 3.06 / 1.29
- chatModelSettingsUi — 3.19 / 1.42
- personaSettingsUi — 4.13 / 1.71
- liveCloudUi — 4.45 / 1.60
- roomInfoUi — 4.85 / 1.97
- albumUi — 5.39 / 2.17
- publicIdentitySearch — 6.41 / 2.58
- conversationActions — 7.20 / 2.91
- cloudBackupUi — 8.36 / 3.32
- roomMemoryUi — 9.52 / 3.90
- jevShadowDiagnostics — 10.84 / 3.28
- photoViewerUi — 13.20 / 5.21
- participantActionUi — 13.32 / 5.11
- fileManager — 17.13 / 5.85
- videoStudio — 39.38 / 14.65
- mimicPersonaCreator — 44.06 / 15.89
- randomPersona — 60.79 / 28.32
- Supabase client — 101.40 / 28.27
- supabaseCloudSync — 232.21 / 61.20

## Next-step selection rule
The main bundle is now below the former 500 kB target.
Continue only where there is real startup/network value or architectural value.

Good next audit:
1. `CloudBackupManager` is still a hot import (~24 KB source) only because `startAutoBackup()` is called at startup.
2. Determine whether disabled Cloud Backup users can avoid loading the manager entirely while preserving auto backup for enabled users.
3. Prefer a tiny persisted-state reader or separate lightweight state module rather than duplicating backup semantics.
4. After that, reassess remaining hot imports by actual build impact.

Avoid risky extraction from:
- sendMessage / getResponse
- Group generation/review
- memory extraction
- strict review/Jev
- Surprise Event generation/start
unless a clean service seam is proven first.

## Continue process
For every extraction/cleanup:
1. prove dependency/reachability boundary
2. preserve hot chat/Group behavior
3. typecheck
4. targeted characterization test
5. full tests
6. production build
7. diff check
8. verify initial HTML preload graph when relevant
9. compare bundle size
10. commit one logical change
11. update durable handoff after several meaningful commits
