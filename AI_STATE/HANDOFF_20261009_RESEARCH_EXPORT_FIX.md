# AIGF — Mobile Research JSON Export Hotfix (2026-10-09)

## User report
The user tapped **分享 Research JSON** in the Jev Shadow diagnostics dialog and received the generic error **未能匯出 Research JSON**. No complete Research Capture archive was available to analyze for Group Reply V2.

## Root risks found
- Old flow read up to 1,000 full-content turns into phone memory at once, then pretty-stringified all of them.
- It called `navigator.share()` only *after* awaiting IndexedDB export/serialization. On mobile, browser transient user activation may have expired.
- A share error went straight to generic failure and skipped the download route.
- The UI hid the underlying error and conflated a zero-record archive with an export/share failure.
- The old fallback fired a programmatic anchor click after async work and revoked its object URL after one second, which is unreliable on mobile.

## Fix (read-only export path only)
Functional commit `9fa4d53 Make mobile Research JSON export batched and retryable`.

- `researchCapture.ts`: added `listResearchTurnRecordsPage(offset, limit)` using the IndexedDB createdAtMs cursor in reverse order. Bounded max 100; UI batch 50. No full-store materialization.
- Stats now use IndexedDB count and index cursor instead of loading every full conversation just to show count/pending/oldest.
- `createResearchCaptureExport({offset, limit})` returns up to 50 records by default, plus batch metadata total/count/nextOffset. Full candidate/response/ReviewState contents remain intact, not redacted.
- Jev Shadow Research controls now use a two-step mobile-safe flow:
  1. **準備 Research JSON（每批 50 筆）** asynchronously creates file and persistent object URL;
  2. real user tap on **下載已準備的 Research JSON** link or **分享已準備的 Research JSON** button. `navigator.share()` runs synchronously inside the second tap, not after awaited IndexedDB I/O.
- **準備下一批 50 筆** and **重新由最新一批開始** allow paging to preserve the entire archive without one huge file.
- Share failures leave download link available; error cause is displayed. Empty archive explicitly shows 0 records and reminds to check Research Capture ON + same browser.
- Temporary object URL revoked when dialog closes or preparing next batch.
- No modifications to original IndexedDB records, no purges/deletes, no cloud schema/sync changes, and no changes to chat generation or reviewer.

## Verification
- 697/697 tests PASS (including newest-first paging, full fields present, complete paging, no deletion).
- TypeScript typecheck PASS.
- Production build PASS via `npx vite build --logLevel error`.
- Git functional commit `9fa4d53` pushed to `main`.
- Vercel production `dpl_Hjo4NSWvG5JvNXBkQ9i2649P7jVT` READY, alias `wetapp.madproduction.ai`.

## Next user test
On the same phone/browser that was collecting Wetapp Group Research: open Jev Shadow, confirm Research Capture ON and **local full-content archive N turns**, tap **準備 Research JSON（每批 50 筆）**, then **下載已準備的 Research JSON**. Upload resulting `aigf-research-capture-part-01-*.json` to ChatGPT. Tap next batch for additional records if needed.

A passed local test does not establish real-device iOS/Android UX success; await direct user report. Do not claim actual cloud current count without querying authorized backend. Avoid changing or clearing phone/browser IndexedDB.
