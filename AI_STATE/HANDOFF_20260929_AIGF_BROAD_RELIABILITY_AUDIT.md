# AIGF Broad Reliability Audit Handoff — 2026-09-29 14:20 HKT

## Mandatory local-work rules
- Use GEN-FUJI Local MCP for all local repo/file/shell/Git work.
- Do NOT use Remote Desktop Commander.
- Do NOT use Codex quota.
- Inspect actual HEAD/worktree before any work because auto mode may advance.
- Prioritize any real user test failure over this audit backlog.

## Repo / runtime
- Repo: `C:\Users\FUJITSU\Documents\My books\aigf4`
- Branch: `perf/cleanup-send-latency-20260923`
- Runtime code commit: `4ed342ee364901908e505bdcc5515596e4565f6b`
- Commit: `4ed342e Harden low-frequency reliability paths`
- Worktree was clean immediately after the runtime commit.

## Why this audit happened
The user correctly challenged whether prior work was a genuinely broad audit.

Prior work was primarily:
- user-reported-failure driven
- subsystem targeted
- regression-test heavy around already discovered paths

Passing tests did NOT mean the full product had been exhaustively audited.

This pass deliberately broadened scope beyond the current failure:
- storage failure paths
- async lifecycle / fire-and-forget paths
- export/download flows
- cold UI entry points
- DOM HTML interpolation
- raw fetch handling
- silent catches / console-only failures
- production dependency vulnerabilities
- test coverage distribution

## Audit methods

### Static scans
Scanned runtime source for:
- direct localStorage/sessionStorage/IndexedDB writes
- fire-and-forget promises
- console-only error handlers
- raw fetch calls
- dynamic innerHTML
- empty/silent catches
- object URL lifecycle
- un-awaited Promise chains

### Coverage
Ran the complete suite with Node coverage.

Audit checkpoint before these fixes:
- line coverage: ~80.96%
- branch coverage: ~76.53%
- function coverage: ~82.96%

Important interpretation:
- core Memory / Group / review logic is substantially better covered
- low-frequency UI/network orchestration has materially lower behavioral coverage
- coverage percentage itself is NOT a reason to refactor

### Dependency audit
Before fix:
- 1 moderate production advisory
- transitive `undici@6.28.0` through `@vercel/blob`
- GHSA-3wwx-pv8p-q78v

After lockfile patch:
- `undici@6.29.0`
- `npm audit --omit=dev`: 0 vulnerabilities

## Concrete bugs fixed

### 1. Album ZIP download could get stuck / fail silently
Before:
- selected-photo export had no try/catch/finally
- one failed fetch / IndexedDB read / ZIP generation could leave Download disabled
- remote fetch did not reject non-2xx responses
- object URL was revoked immediately after click, which is fragile on mobile browsers
- thumbnail/viewer async failures could become unhandled rejections

Now:
- export is bounded by try/catch/finally
- Download controls recover after failure
- non-2xx fetch is rejected
- missing photo blob is surfaced as a failure
- object URL revoke is delayed 1 second
- thumbnail/viewer promise failures are contained
- button text indicates retryable failure

### 2. Album deletion could stop halfway
Before:
- `Promise.all` rejected on the first failed asset deletion
- UI refresh after intended history deletion might never run

Now:
- asset cleanup uses `Promise.allSettled`
- intended chat-history deletion completes
- UI always refreshes
- orphan cleanup failure is warned without leaving the modal half-finished

### 3. FileManager ZIP lifecycle was not actually awaited
Found a real async contract bug.

Before:
- `saveCurrentChat()` called `zip.generateAsync(...).then(...)` without await
- method could resolve before the archive existed
- later compression failure escaped the caller
- `downloadImages()` had the same pattern
- object URLs were not cleaned up

Now:
- ZIP generation is awaited
- failures propagate to the caller
- current-chat / image archive lifecycle is real, not fire-and-forget
- object URLs are revoked after 1 second
- image download rejects non-2xx fetches and missing images

### 4. Save-before-exit could exit before save finished
Before:
- Save & Exit triggered async export
- immediately hid the modal and navigated home
- archive failure happened after navigation and was console-only

Now:
- Save & Exit awaits FileManager + archive generation
- on failure, user stays in place
- a visible error is shown
- normal chat / room export failures are also visible, not console-only

### 5. Mimic avatar preview interpolated URL through innerHTML
Before:
- avatar URL was embedded inside an HTML string

Even though ordinary sources are expected to be safe image URLs/data URLs, this is an unnecessary DOM-injection surface.

Now:
- preview uses `document.createElement('img')`
- assigns `image.src` as a DOM property
- no avatar URL is interpolated through `innerHTML`

### 6. Cloud Backup state could crash app startup when localStorage write fails
Before:
- reading state was protected
- writing state was not
- app startup immediately calls `initializeCloudBackupState()`
- a browser storage SecurityError / QuotaExceededError could throw during module initialization

Now:
- `persistCloudBackupState` catches storage failure
- startup continues instead of crashing
- function reports success/failure
- browser gets a deferred `wetapp-storage-failed` event so the existing warning UI can surface the problem after listeners are attached

### 7. Production dependency advisory
- `undici` updated 6.28.0 -> 6.29.0 in package-lock
- production dependency audit now reports 0 vulnerabilities

## New regression tests
- `tests/reliabilityAuditFixes.test.ts`
- `tests/cloudBackupStateReliability.test.ts`

They lock:
- Album recovery / delayed blob URL revoke
- Mimic avatar DOM-safe rendering
- awaited FileManager ZIP generation
- Save & Exit waiting for archive completion
- Cloud Backup startup survival on localStorage failure

## Validation
Final runtime validation:
- full suite: 650 / 650 PASS
- typecheck: PASS
- production build: PASS
- git diff --check: PASS
- npm audit --omit=dev: 0 vulnerabilities

Latest local build at runtime commit:
- main JS ~360.74 kB / 125.97 kB gzip
- Album cold chunk ~6.17 / 2.50 gzip
- FileManager cold chunk ~22.81 / 7.32 gzip
- Mimic creator remains cold

## Production
Deployed exactly once after validation.

Deployment:
- ID: `dpl_2i6DaHYZoiiTJrduffQeJAwYS6e8`
- URL: `https://aigf4-gxn1hj3t6-gens-projects-4f99f8b9.vercel.app`
- target: production
- state: READY
- runtime commit: `4ed342ee364901908e505bdcc5515596e4565f6b`

Aliases confirmed:
- `https://aigf4.vercel.app`
- `https://wetapp.madproduction.ai`

Production smoke:
- wetapp.madproduction.ai -> HTTP 200
- current main bundle fetched successfully
- visible export-error path is present
- Cloud Backup storage guard is present

## What was NOT claimed
This is a broad reliability audit, but it is NOT a proof that AIGF has zero bugs.

No static/unit audit can prove that.

Remaining risk is concentrated in live-browser / external-service behavior.

### Residual risk areas worth real-browser testing
1. FileManager end-to-end archive workflows
   - single chat export
   - all-chat export
   - import on another device/browser
   - missing media / large archive

2. Cloud Backup live workflow
   - setup / backup / restore on a real account
   - browser storage disabled/full
   - interrupted upload/download

3. Supabase Live Cloud
   - unit coverage is broad around transaction/realtime/session races
   - live external auth/network/device interaction still cannot be proven by local unit tests

4. Image / Video Studio mobile browser behavior
   - source-file handling
   - share/download behavior
   - background/visibility transitions

5. Low-frequency cold UI
   - many modules are architecture-tested but not fully DOM-interaction-tested

6. Performance
   - use the new Performance 診斷 export with real production Single + Group turns
   - do not optimize further from localhost timing alone

## Areas that were inspected and deliberately NOT changed
- Memory V5 core / diagnostics
- message recall hardening
- character photo continuity / image fallback
- Group transport sanitation
- strict review authority
- Jev authority
- New Scene memory call ordering

Reason:
- no new concrete defect was demonstrated in those paths
- existing focused tests are strong
- changing them merely because coverage is not 100% would increase risk

## Engineering rule from here
If the user reports any actual production failure:
- investigate that path first

If there is no reported failure:
- prefer real-browser E2E smoke of residual-risk workflows
- add tests around observed gaps
- do NOT resume blind index.tsx decomposition
- do NOT alter Memory quotas / model routes / strict review without evidence
- Jev remains shadow-only; Gemma remains authoritative
