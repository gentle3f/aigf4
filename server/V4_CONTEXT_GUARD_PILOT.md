# V4 conversation context guard (pilot)

- Newly admitted versioned jobs store a server-calculated SHA256 of full shared state payload, target conversation title/kind and ordered target messages (including role, content and speaker).
- Claim, finish and explicit retry use the same guard rather than the global revision alone. Independent message-only edits or replies in other chats no longer invalidate a job. Same-chat edits and all shared-state changes still conflict; no claim of arbitrary concurrent group/world state merging.
- No worker protocol or binary change. Existing jobs without guard retain strict revision checks. No historical jobs replayed.
- Local PGlite regression passed all previous checks plus two independent jobs finalized in reverse order, same-chat edit fenced even without revision bump, shared-state change fenced, retry after independent admission with original receipt unchanged.
- Pilot migration installed: guard column, claim/finish guard, worker permission verified; direct client hash helper denied. Existing 51 messages and 3 completed jobs unchanged, no active jobs at migration. Live concurrent browser test still pending; production untouched.
