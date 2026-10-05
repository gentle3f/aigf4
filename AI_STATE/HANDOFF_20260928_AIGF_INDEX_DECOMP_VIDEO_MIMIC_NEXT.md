# AIGF Handoff — Index Decomposition Progress After Video + Mimic Splits

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current HEAD before this handoff-doc commit: `ea9e0ec`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule
Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do **not** use Codex quota.
Do **not** use Remote Desktop Commander unless the user explicitly asks for it.
Do not use GitHub Actions for heavy work.
Keep changes small, tested, reversible, and separated into logical commits.

## Critical do-not-redo list
Do not restart:
- Jev persistence work
- dead-file cleanup discovery
- chat-history windowing
- repo discovery
- earlier cold-feature extractions listed below

Preserve behavior in:
- Group generation
- Cc route
- normal chat send flow
- memory/retrieval
- wardrobe
- strict review / Gemma
- Jev production shadow
- relationship / continuity state

## Current local branch state
Origin:
- `19fc7d5` — handoff commit before decomposition

Local branch is ahead by **12 commits**:

1. `110cec8` — Lazy-load Jev shadow diagnostics
2. `c2f0c8b` — Lazy-load public identity search UI
3. `744c5b7` — Lazy-load Live Cloud UI
4. `8fd8c21` — Lazy-load Cloud Backup UI
5. `ca5c162` — Lazy-load create group UI
6. `ff704e4` — Lazy-load room memory UI
7. `b060cc4` — Lazy-load room info UI
8. `94523b4` — Lazy-load chat model settings UI
9. `8234b5f` — Lazy-load album media UI
10. `17951bc` — Extract video job persistence
11. `9c78412` — Lazy-load video studio runtime
12. `ea9e0ec` — Lazy-load mimic persona creator

Worktree is clean at this handoff.

## Validation at HEAD `ea9e0ec`
- `npm.cmd run typecheck` — PASS
- `npm.cmd test` — **352 / 352 PASS**
- `npm.cmd run build` — PASS
- `git diff --check` — PASS before the commit
- worktree — clean

## Objective progress

Original decomposition baseline:
- `index.tsx`: about **16,616 lines**
- main JS: about **924.96 kB minified / 307.32 kB gzip**

Current:
- `index.tsx`: **11,839 lines**
- main JS: **798.45 kB minified / 268.74 kB gzip**

Net reduction so far:
- about **4,777 index.tsx lines**
- about **126.51 kB minified main JS**
- about **38.58 kB gzip main JS**

The bundle still exceeds Vite's 500 kB warning threshold, so decomposition is not finished.

## Current cold chunks in latest build
- createGroupUi — 2.34 kB / 1.18 gzip
- chatModelSettingsUi — 3.19 / 1.42
- liveCloudUi — 4.45 / 1.60
- roomInfoUi — 4.70 / 1.94
- albumUi — 5.34 / 2.15
- publicIdentitySearch — 6.41 / 2.58
- cloudBackupUi — 8.36 / 3.32
- roomMemoryUi — 9.52 / 3.90
- jevShadowDiagnostics — 10.84 / 3.31
- videoStudio — 39.38 / 14.65
- mimicPersonaCreator — 43.94 / 15.83

## Important behavior boundaries established

### Video Studio
- Entire Video Studio DOM/runtime/polling/prompt-optimizer/model selection moved behind dynamic import.
- `veniceVideo.ts` is no longer statically imported by `index.tsx`.
- Normal startup only checks safe pending-job metadata.
- If a persisted pending job exists, successful auth lazy-loads Video Studio and resumes it automatically.
- Pending-job localStorage validation/persistence is isolated in `videoStudioPersistence.ts`.
- Video feature does not own chat/group/review/memory runtime.

### Mimic / Persona Creator
- Transcript parser, ZIP/JSON chat import parsing, transcript sampling, model prompts, manual/public/transcript draft generation, modal state, and save handlers moved behind dynamic import.
- Main keeps only the three creation entry points and the separate shared public-identity helper still used elsewhere.
- Persona persistence is injected back into `MemoryManager`; feature does not own chat runtime.
- Avatar optimization, post-save persona refresh/open-chat, and random-recruit handoff are injected dependencies.

### Album
- Hot paths now only call `albumUi?.refresh()`; they do not import Album when it has never been opened.
- Album deletion still preserves destructive-operation request cancellation semantics.

### Chat Model Settings
- Runtime routing state remains hot.
- Only the modal UI/draft controls are cold.
- Background model loading refreshes an already-loaded UI handle only; it does not trigger the cold import.

### Room / Group admin
- Create Group, Room Memory, and Room Info are separate cold features.
- Group generation/review/chat send stay outside those features.

## Characterization protection added
New feature tests include:
- `tests/videoStudioFeature.test.ts`
- `tests/videoStudioPersistence.test.ts`
- `tests/mimicPersonaCreatorFeature.test.ts`
- `tests/albumUiFeature.test.ts`
- `tests/chatModelSettingsUiFeature.test.ts`
- `tests/roomInfoUiFeature.test.ts`
- earlier cold-feature tests for cloud/group/room/Jev/public identity

These tests explicitly prevent cold UI features from taking ownership of Group generation, chat send, review, memory, or related hot-path execution.

## Next decomposition guidance

### Do NOT whole-sale split Image Studio yet
Image Studio is not currently a clean cold island:
- `imageModels`
- `loadImageModels`
- `selectedImageModels`
- image generation helpers

are also used by:
- chat photo proposals
- character selfies/photos
- Photo Viewer regeneration

A cosmetic whole-file move would likely pull the chunk back into hot paths or duplicate model state.

### Better next candidates
Prefer another isolated UI/admin island with a clean callback boundary, e.g.:
- Persona Settings / persona editor UI, if its save/runtime boundary can be separated without moving persona state semantics
- avatar source / avatar prompt editor UI
- disabled/legacy persona-creator UI cleanup if proven dead and unreferenced
- other modal/admin surfaces that are not used by send/generation hot paths

Before choosing, measure references and do not split purely for line count.

## Process to continue
For each next extraction:
1. Identify all external refs.
2. Mirror the feature first while production remains unchanged.
3. Use typecheck to discover real dependencies.
4. Convert only necessary capabilities to explicit callbacks.
5. Switch production wiring to dynamic import.
6. Add characterization tests.
7. Run typecheck.
8. Run full tests.
9. Run build and compare main chunk size.
10. Commit one logical extraction.

## Deployment note
The decomposition commits above are local branch commits in this handoff.
Do not assume these 12 commits are live in production merely because they are committed.
Avoid unnecessary repeated production deployments; verify the intended deployment point before deploying.

## Immediate next action
1. Read this handoff and `AI_STATE/LATEST_HANDOFF.md`.
2. Verify branch / HEAD / clean worktree.
3. Do not redo completed extractions.
4. Inspect the next low-risk cold UI boundary, preferably Persona Settings / avatar admin.
5. Continue only if the extraction creates real lazy loading or removes meaningful initial JS.
