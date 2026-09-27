---
name: fw-handoff
description: flightwake cross-session handoff — write CONTEXT for work that is unfinished and will continue later. Use when stopping mid-build on multi-session work, when the user says handoff / continue next time, or before context runs out on a large task.
---

# fw-handoff — cross-session handoff

Purpose: let any session cold-start into unfinished construction. **The trigger is before stopping — not before starting** —
a CONTEXT written after touching reality is the only kind that's real.

## Steps

1. Write `.flightwake/records/YYMMDD-slug-CONTEXT.md` with four mandatory sections:
   - **Scope**: what to build / explicitly out of scope (guards against scope creep); plus one line of
     **acceptance** — what counts as done, stated **observably** (which number must match what, what must
     appear on which screen, which test must go green). With no observable definition of "done", the next
     session invents one — usually looser than yours
   - **Settled decisions**: with the why (also logged to DECISIONS)
   - **Current state & data foundation**: what's ready (with verification evidence), what's an assumption (mark "spot-check before executing")
   - **Next step**: concrete down to "open this file / run this command"
2. List open questions separately — **ones needing a human are marked "confirm with X"**; never leave the next session guessing
3. Update STATE: in-progress + next entry point pointing at this CONTEXT
4. Commit; then propose a push to the user (a handoff is only safe once it leaves this machine, but pushing is the user's call)

## Where the CONTEXT lives

One CONTEXT, no upfront plan decomposition — the executing session plans in the moment.
If the repo has a legacy `.planning/` directory, the CONTEXT may live in its phases/ directory to keep that index (same format).
