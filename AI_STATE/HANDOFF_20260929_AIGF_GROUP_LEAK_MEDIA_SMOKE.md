# AIGF Group Leak + Media Smoke Handoff — 2026-09-29

## Branch / code
- Branch: `perf/cleanup-send-latency-20260923`
- Code HEAD before this handoff commit: `18e0577 Sanitize Group conversation previews`
- Use GEN-FUJI Local MCP only.
- No Remote Desktop Commander.
- No Codex quota.

## Group transport leak hardening
### 131bc82 — Harden Group transport leak cleanup
Two-layer protection:
1. `stripGroupTransportResidue()` truncates visible Group segment text at transport boundaries:
   - `</chat>`
   - opening/closing `<scene...>`
   - opening/closing `<npc_candidate...>`
   - isolated opening `<chat>` is removed without dropping following visible prose
2. Group bot rendering no longer falls through to generic raw `content.text` when safe segments are empty.

This protects:
- primary Group generation
- Gemma Group revision
- stored Group segments / legacy display repair
- Group history re-entry

### 18e0577 — Sanitize Group conversation previews
Production browser inspection exposed a second legacy-only leak path:
- recent-conversation sidebar preview read stored `message.content.text` directly
- old Group messages containing transport residue therefore still showed `<chat>/<scene>/<npc_candidate>` in the sidebar

Fix:
- exported and reused the same shared Group transport sanitizer
- only room/group previews are sanitized, so ordinary one-to-one text containing literal XML-like text is untouched

Validation:
- Group targeted: 47/47 PASS
- full suite: 597/597 PASS
- build PASS
- typecheck PASS
- diff check PASS
- main bundle ~351.53 kB / 122.67 kB gzip

## Media smoke after index cold splits
The user reported prior failures specifically from asking a character to take a photo, not Image Studio.

### Character-photo proposal cold module
Real Venice chat smoke ran through:
- `features/characterPhotoProposalGeneration.ts`
- primary route attempted `qwen-3-8-27b`
- fallback `gemma-4-uncensored` produced an accepted proposal
- proposal result:
  - aspect ratio 3:4
  - one subject
  - no avatar reference in this synthetic persona
  - prompt retained green coat continuity and café setting

This proves the new cold module can generate a valid live proposal and recover from an invalid/unaccepted primary attempt.

### Real image generation
Direct Venice upstream using the same account API key:
- generate: Chroma
- output image: 110,734 bytes, valid WebP
- edit: Grok Imagine Edit
- output image: 216,451 bytes, valid WebP
- visual inspection confirmed a real source image and a real edited image, with the mug retained and background changed

This covers both generate and edit media transports. The edit branch is especially relevant because character-photo requests commonly use avatar-reference edit mode.

### Real video generation
A real low-cost video job was queued and completed.
Validated output:
- 1,921,741 bytes
- H.264
- 864×496
- 24 fps
- 4.041667 seconds
- extracted frame was visually valid

No duplicate media generation should be run merely to repeat this smoke.

### UI-auth limitation
Agent-browser could load the user's Chrome profile data but the automated tab did not inherit an unlocked Wetapp gate cookie.
The assistant did NOT bypass or extract the user's auth secret/cookie.
Therefore:
- character-photo proposal + real image generate/edit + real video generation were verified through app module/direct Venice transport
- a fully clicked production UI character-photo confirmation flow was not completed inside the automation browser

## Production before next deploy
Current production deployment before this handoff:
- `dpl_54ULkYzzjJATNFxaLbCiBHAzTJuM`
- commit `1328483`
- READY
- aliases include `wetapp.madproduction.ai`
- recent runtime error scan: 0 errors

## Next action
Deploy the current branch including `18e0577` to production once.
After deploy:
1. reload the production browser profile
2. confirm legacy Group sidebar preview no longer renders transport residue
3. scan Vercel runtime errors
4. do not regenerate image/video unless a failure is specifically observed
