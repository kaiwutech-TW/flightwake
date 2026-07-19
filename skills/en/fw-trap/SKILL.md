---
name: fw-trap
description: flightwake trap registration — write a non-obvious trap into the TRAPS registry. Use immediately when a surprising root cause is found (weird error, vendor quirk, encoding trap), or when the user says log this trap / trap.
---

# fw-trap — trap registration

Purpose: any given trap gets stepped in exactly once per project (including future sessions and other agents).

## What qualifies for TRAPS

- Symptom and root cause are **far apart** (e.g., jsonb stored as a string scalar → root cause is the driver's encoding of "string parameter + ::jsonb")
- Undocumented vendor behavior (e.g., some operation path doesn't fire the webhook)
- Environment-difference traps (passes locally, explodes in prod)
- **Doesn't qualify**: ordinary bugs, anything obvious from reading the error message

## Steps

1. Follow the entry format demonstrated at the top of `.flightwake/TRAPS.md` (OKF-style frontmatter: name/type/tags/discovered)
   and write it at the **top** of `.flightwake/TRAPS.md`
2. All four fields: symptom (paste the original error message), root cause in one sentence, fix/workaround, evidence link (commit/record)
3. Link related traps with `[[name]]`
4. Write it on the spot — trap details fade within half a day
5. When a new trap **replaces or covers** an existing entry: set the old entry's frontmatter `status` to `superseded` and point its body at the [[new entry]] — never delete lines,
   so an "old md vs new md" conflict always has a clear direction
