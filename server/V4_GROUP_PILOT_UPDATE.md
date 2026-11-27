# V4 group chat and memory pilot

- Combined group reply/scene/NPC transaction (workflow v3, context version 2) and separate eighth-turn group memory follow-up. Group member snapshots exclude avatar transport metadata, not member settings.
- Memory reducer shared with browser; historical presence, per-member perspective, manual exclusions, and source checks retained. Multi-batch recovery deferred.
- Typecheck and 43/43 targeted tests passed. PGlite end-to-end passed group admission, scene/NPC commit, memory trigger, one submission after lost acknowledgement, restricted knowledge, other rooms unchanged.
- Pilot group generation and memory migrations installed; 35 existing messages unchanged, group tasks zero at migration, dedicated worker grant confirmed and client claim/direct table denied.
- Bundle sha256 63e2ed0fa0a0d2b93f36272815ab73eae197e8c0cccf74784ed48fefa6162523. Owner upgrade script tmp/v4-worker/UPGRADE_V4_GROUP_OWNER.sh sha256 79e0d4c566c9f87b34822457415ce6cae199cb9fb092aeea471f378a9b866caa.
- Frontend VITE_AIGF_SERVER_GROUP_GENERATION_V4 stays off until actual worker upgrade and live test. Only ordinary text group mode is in scope; group Worldline, surprise events, media, historical backfill, other two variant ports and production cutover remain.
