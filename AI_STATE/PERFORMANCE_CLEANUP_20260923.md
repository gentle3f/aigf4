# Performance Cleanup - 2026-09-23

## Scope and safety

- Branch: `perf/cleanup-send-latency-20260923`
- No remote push, deployment, Vercel command, or data migration was performed.
- Character prompts, strict review, group/NPC logic, memories, wardrobe, photo/video flows, imports, cloud sync and local data formats are unchanged.
- The change is deliberately limited to the write timing of normal appended chat messages.

## Baseline profile

The immediate-send path was traced from `dispatchSendMessage` through `sendMessage`, `MemoryManager.addMessage`, generation, strict review and final rendering.

| Phase | Baseline finding |
| --- | --- |
| User bubble | Rendered first, then JavaScript continued synchronously in the same task. |
| History persistence before request | `addMessage()` synchronously serialized every room, LZ-UTF16 compressed the entire `chatHistories` object, called `localStorage.setItem`, then notified cloud sync. |
| Realistic local compression sample | 900 messages / 688,741 JSON characters: 7 samples `172.6, 154.5, 159.7, 171.5, 154.6, 152.3, 153.9 ms`; median `154.6 ms`. |
| Prompt and model | Prompt construction, Venice primary/retry/fallback, and strict review happen after this blocking persistence phase. |

The compression measurement isolates the dominant main-thread work that occurred after a send. Storage and cloud scheduling can add additional time on a device with a busy storage backend.

## Implemented change

`MemoryManager.addMessage()` now updates in-memory history immediately but schedules the full compressed snapshot for the next timer turn. Therefore the new message is still available to prompt construction immediately, while the expensive snapshot runs after the network request has started.

- Multiple messages in the same turn share one write.
- `pagehide` and hidden-tab transitions flush a scheduled write synchronously before the page is left.
- Existing explicit operations such as import, recall, clear and delete retain their existing immediate persistence behaviour.
- The storage encoding format remains `lz16:` and no existing records are migrated or deleted.
- Cloud sync is still notified only after a successful durable snapshot, preserving its prior ordering.

## Performance instrumentation

Enable locally with either `?perf=1` or `localStorage.setItem('wetappPerfEnabled', '1')`.

The browser console logs only phase names and durations, never messages, prompts, names, or media:

- `send:user-render`, `send:user-persist`
- `storage:history-encode`, `storage:history-write`, `storage:cloud-notify`, `storage:deferred-history-flush`
- `generation:prompt-build`, primary/repair/fallback request start and duration
- `strict-review:prepare`, request start/duration, parsing
- `response:final-persist`, final render, relationship update, persona-list render, final visible

Recent timing-only snapshots are available at `window.__aigf4Perf` while instrumentation is enabled.

## Architecture map

| Area | Main modules |
| --- | --- |
| UI and request orchestration | `index.tsx` |
| Personas, normal chat histories, soul/memory records | `managers.ts` |
| Text completion and Venice request shaping | `venice.ts` |
| Strict response quality gate | `strictReview.ts` |
| Group room/member/scene persistence | `roomManager.ts`, `roomStorage.ts`, `groupChat.ts` |
| Memory extraction and targeted recall | `autoMemory.ts`, `memoryRetrieval.ts` |
| Images, videos and local media | `veniceImage.ts`, `veniceVideo.ts`, `chatMediaStore.ts`, `photoStore.ts` |
| Cloud and recovery | `supabaseCloudSync.ts`, `cloudBackup.ts`, `chatRecoveryStore.ts` |

## Dead-code and cleanup audit

- No large module was removed in this pass. The apparent old helpers in `index.tsx` are coupled to import compatibility, legacy room histories, special tools, or current UI affordances; removing them without a feature-by-feature migration would risk user data or existing flows.
- The `ai` placeholder is intentionally retained for disabled legacy helpers and is documented inline in `index.tsx`.
- The production bundle remains one large entry chunk (`875.26 kB`, `291.64 kB` gzip). This is a real future performance opportunity, but dynamic splitting of photo/video/import/settings dialogs is separate from send latency and should be handled behind feature-level regression checks.

## Remaining bottlenecks and next safe steps

1. Venice model generation and strict review remain the largest wall-clock cost after the local send freeze is removed. The new phase logs make primary versus review versus fallback delay measurable.
2. Group chats have larger prompt construction and strict-review payloads. If their timings dominate, reduce only duplicated prompt material after comparing reply quality on saved group histories.
3. Add lazy-loaded feature dialogs to reduce first-load JavaScript, with an explicit smoke test for every tool after each split.
4. Keep automatic memories asynchronous; do not move memory summarisation back onto the send critical path.

## Verification

- `npm.cmd run typecheck` passed.
- `npm.cmd test` passed: 112/112.
- `npm.cmd run build` passed.
- `git diff --check` passed.
