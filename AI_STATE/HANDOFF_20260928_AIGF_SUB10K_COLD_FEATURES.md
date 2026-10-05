# AIGF Handoff — Sub-10k Main + Cold Feature Continuation

Date: 2026-09-28
Branch: `perf/cleanup-send-latency-20260923`
Current code HEAD before this handoff-doc commit: `f1fd1131b3e60c5296f6050ec7bfbf3df095a768`
Local repo: `C:\Users\FUJITSU\Documents\My books\aigf4`

## Mandatory operating rule

Use **GEN-FUJI Local MCP** for all repo / shell / file / Git work.
Do not use Codex quota.
Do not use Remote Desktop Commander.
Do not use GitHub Actions for heavy work.

Preserve:
- normal chat / Group / Cc generation
- strict review / Jev
- memory / wardrobe / relationship continuity
- local persistence and cloud safety
- current Group-first user experience

Do not broaden refactors into generation methodology changes merely to reduce file size.

---

## Current validated milestone

At code HEAD `f1fd113`:

- `index.tsx`: **9,980 lines**
- main JS: **384.19 kB minified / 134.47 kB gzip**
- `npm.cmd test`: **560 / 560 PASS**
- `npm.cmd run typecheck`: PASS
- `npm.cmd run build`: PASS
- `git diff --check`: PASS
- worktree clean after code commit
- no production deployment performed in this continuation

This completes the first meaningful `index.tsx < 10,000 lines` milestone while also reducing startup JS. It is not merely a cosmetic file split.

Earlier comparison from the start of this continuation:
- main JS: **408.19 kB / 143.44 kB gzip**
- `index.tsx`: **10,883 lines**

Net in this continuation:
- main JS reduced by about **24.0 kB minified / 9.0 kB gzip**
- `index.tsx` reduced by about **903 lines**

Longer historical baseline remains about:
- `index.tsx`: ~16,616 lines
- main JS: ~924.96 kB / ~307.32 kB gzip

---

## User-visible chat entry fix

Commit:
- `af3c907` — **Open chat history at latest message**

Problem:
Windowed chat history correctly rendered only the newest tail, but `#chat-container` has CSS `scroll-behavior: smooth`. Entering a room used `scrollTop = scrollHeight`, causing a visible long smooth-scroll through the rendered window.

Fix:
- entry now uses existing `setInstantScrollTop(chatContainer, chatContainer.scrollHeight)`
- applies to the production chat entry path
- history remains windowed; older messages still load upward
- no history deletion or continuity change

Validated by `tests/chatHistoryWindow.test.ts`.

---

## Cold-feature decomposition completed in this continuation

### 1. Image Studio

Commit:
- `9dedad8` — **Lazy-load Image Studio UI**

New cold module:
- `features/imageStudio.ts`

Main keeps only genuinely shared image runtime:
- image model cache
- selected image model preference
- shared seed / seed-lock state
- helpers also used by character-photo workflows

Image Studio owns:
- generate/edit UI
- model presentation controls
- source-image preparation
- results/download/edit-again UI
- adult confirmation
- Studio request lifecycle

Build effect at that step:
- main: **408.19 -> 396.63 kB**
- Image Studio cold chunk: ~**14.09 kB / 5.27 kB gzip**

Do not move the remaining shared image helpers cold without checking character-photo / Photo Viewer dependencies.

### 2. Shared Public Identity resolution

Commit:
- `9a9d1b7` — **Share cold public identity resolution**

New cold module:
- `features/publicIdentityResolution.ts`

Purpose:
- removed duplicated Wikipedia-confirmed identity AI metadata logic from main and Mimic
- main and Mimic now dynamically load one shared resolver
- `features/publicIdentitySearch.ts` remains lookup/UI-only and does not own model/chat behaviour

Build effect at that step:
- main: **396.63 -> 393.54 kB**
- Mimic chunk also reduced
- public identity resolution is a separate cold chunk

### 3. Random Persona / Random Recruit

Commit:
- `261b846` — **Lazy-load random persona recruitment**

New cold modules:
- `features/randomPersonaSeed.ts`
- `features/randomRecruit.ts`

Moved cold:
- random persona catalog orchestration
- recent variation-history handling
- Random Recruit UI state
- random avatar generation workflow

Mimic manual randomize and Random Recruit share the same seed provider, preserving variation avoidance.

### 4. Surprise Event catalog

Commit:
- `b3888ef` — **Keep surprise event catalog cold**

Large `NSFW_SURPRISE_EVENT_DIRECTIONS` catalog moved out of main into the already-cold `experienceEngine.ts`.

Do not move surprise-event hot routing/state blindly; only the data catalog was an obvious cold payload.

### 5. Persona inspect

Commit:
- `f1fd113` — **Lazy-load persona inspect helper**

New cold module:
- `features/personaInspect.ts`

The explicit God Mode commands such as:
- `show current persona`
- `show current setting`
- Traditional-Chinese persona-inspect variants

now load only when a tiny keyword prefilter matches.
Normal chat / Group / Cc and ordinary God Mode messages do not load this chunk.

Build effect:
- main: **384.65 -> 384.19 kB**
- persona-inspect cold chunk: ~**0.72 kB / 0.45 kB gzip**
- `index.tsx`: **10,012 -> 9,980 lines**

---

## Dead-code cleanup / test repair

Legacy definition-only helpers were removed as part of the concurrent cleanup that landed before the sub-10k checkpoint, including:
- `startLegacyChat`
- old `setLoading` wrapper
- disabled `getPostActionResponse` path and its unused notice helper

This exposed one stale architecture test that still required `startLegacyChat`.

Commit:
- `68495df` — **Update navigation test after legacy chat cleanup**

The test now characterizes the real production `startChat` path:
- navigation itself does not cancel a background request
- history replacement may cancel the matching request
- destructive mutation still cancels appropriately

After repair, full suite is green at **560 / 560**.

---

## Current bundle shape worth preserving

Current build includes cold chunks for, among others:
- Persona Inspect ~0.72 kB
- Random Recruit ~2.35 kB
- Public Identity Resolution ~3.78 kB
- Public Identity Search ~6.41 kB
- Image Studio ~14.09 kB
- File Manager ~22.49 kB
- Experience Engine ~28.99 kB
- Video Studio ~39.36 kB
- Mimic Persona Creator ~41.31 kB
- Random Persona Seed/catalog ~61.25 kB
- Supabase Cloud Sync ~248.69 kB

Main:
- **384.19 kB / 134.47 kB gzip**

The main chunk is now already below the old 500 kB first target.

---

## Next roadmap

Do not chase line count for its own sake. The next goal is continued startup/runtime reduction with behavior-frozen hot chat paths.

Recommended next audit order:

1. Inspect remaining explicit/admin/cold helpers in `index.tsx` using reachability + bundle evidence.
2. Prefer features that are activated only by:
   - explicit menu buttons
   - admin/configuration screens
   - rare God Mode utilities
   - media/creation tools
3. Continue measuring main minified/gzip after every extraction.
4. Keep one logical commit per seam.

Avoid aggressive extraction of these until there is a strong seam:
- normal send flow
- Group generation
- Cc generation
- strict review
- Jev shadow
- memory retrieval
- wardrobe
- relationship continuity
- request lifecycle / cancellation

A next useful target should reduce startup JS, not merely move 20 lines to another statically imported file.

---

## Git / deployment discipline

- Branch: `perf/cleanup-send-latency-20260923`
- GEN-FUJI Local MCP only
- no Codex
- no Remote Desktop Commander
- no GitHub Actions heavy work
- no production deployment unless explicitly moving a tested milestone live
- preserve small reversible commits
