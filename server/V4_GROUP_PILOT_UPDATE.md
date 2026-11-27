# V4 group chat and memory pilot

- Combined group reply/scene/NPC transaction (workflow v3, context version 2) and separate eighth-turn group memory follow-up. Group member snapshots exclude avatar transport metadata, not member settings.
- Memory reducer shared with browser; historical presence, per-member perspective, manual exclusions, and source checks retained. Multi-batch recovery deferred.
- Typecheck and 43/43 targeted tests passed. PGlite end-to-end passed group admission, scene/NPC commit, memory trigger, one submission after lost acknowledgement, restricted knowledge, other rooms unchanged.
- Pilot group generation and memory migrations installed; 35 existing messages unchanged, group tasks zero at migration, dedicated worker grant confirmed and client claim/direct table denied.
- Bundle sha256 121b2f2b19b0b26067fe31f2df3ca17badeec562c0aa45cdf9d30c7211ed7f54. Owner upgrade script tmp/v4-worker/UPGRADE_V4_GROUP_OWNER.sh sha256 aef0d756bc72d0192e2c5f180777832ba563efa74c1f8288d9bd72c884891f66.
- Frontend VITE_AIGF_SERVER_GROUP_GENERATION_V4 stays off until actual worker upgrade and live test. Only ordinary text group mode is in scope; group Worldline, surprise events, media, historical backfill, other two variant ports and production cutover remain.

- Owner first preflight failed before replacement: lz-string absent on VPS. Rebuilt bundle with only pg/opencc-js external; checked all external imports against runtime manifest and imported bundle in isolated temporary directory with exactly locked runtime package versions. Retry same owner script path; old ledger hash unchanged by failed attempt.
