# Wetapp Engine V2: Phase 2B1

## Live broad single-turn tracing

Normal and Cc single-character turns now create a metadata-only trace at the
existing `runSingleTurnAdapter` seam. The trace records only broad generation,
strict-review, and whole-seam latency plus an accepted, error, or aborted
outcome. It ends before the existing reply commit path, so it never claims a
turn was committed.

There is no per-attempt tracing yet: primary, repair, fallback, continuation,
Cc polish, and strict-review internal loops remain uninstrumented. Group turns
remain on their direct legacy path and create no live trace. No Decision/Jev
provider is involved.

Recent traces are bounded to 50 in-memory metadata-only records. They are not
written to browser storage, Supabase, the network, or a window-global debug
object. Trace collection is best-effort and is not part of chat correctness;
generation, review, persistence, rendering, haptics, and all existing runtime
behaviour remain unchanged.
