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

## How sure is the root cause (confidence)

The registry's most expensive failure isn't a missing entry — it's **a misdiagnosis written as settled fact**.
Readers can't tell "nailed by a controlled experiment" apart from "the most likely story at the time," and
following a wrong root cause takes you further off course than having no registry at all. So rate the root cause:

| confidence | Meaning | Evidence required |
|---|---|---|
| `confirmed` | Controlled experiment: toggle the cause → symptom appears/disappears, at least twice. For **non-causal** facts (does a feature exist, what's on the list, how does this version behave), substitute "exhaustive direct verification + a primary source you can point at" (source line numbers / official docs / item-by-item check in the console) | Evidence field must point at that experiment or that source |
| `probable` | Consistent across several observations, but no control group | State how many observations, over what period |
| `suspected` | Single observation, or "the most likely explanation at the time" | State **what you haven't ruled out yet** |

Three rules:

1. **The symptom field is always fact** (paste the error verbatim); confidence rates only the root cause field
2. Below `confirmed`, write the fix as a **workaround**, never a "fix" — and **never treat it as a rule**
3. **Asymmetric bar** — using this trap to argue "**this breaks**" → `probable` is enough (being wrong just
   costs extra caution); to argue "**this is safe**" → it must be `confirmed` (being wrong hits prod and your users directly)

Raising confidence (suspected → confirmed) is an **in-place edit of the same entry**, not a supersede;
supersede is reserved for when the root cause itself changed.

## Steps

1. Follow the entry format demonstrated at the top of `.flightwake/TRAPS.md` (OKF-style frontmatter: name/type/status/confidence/tags/discovered)
   and write it at the **top** of `.flightwake/TRAPS.md`
2. All four fields: symptom (paste the original error message), root cause in one sentence, fix/workaround, evidence link (commit/record)
3. Link related traps with `[[name]]`
4. **Write the symptom on the spot** — details fade within half a day. **Leave the root cause unsettled until it's nailed**:
   if it isn't, mark `confidence: suspected` and note what you haven't ruled out. Don't leave the entry unwritten while
   you think, and don't dress a guess as a conclusion. Come back and raise it once you've nailed it
5. When a new trap **replaces or covers** an existing entry: set the old entry's frontmatter `status` to `superseded` and point its body at the [[new entry]] — never delete lines,
   so an "old md vs new md" conflict always has a clear direction
6. Judge the trap's **scope**: if it isn't specific to this repo — any project would step in it (platform/language/tool layer, e.g. Node stdin behavior, shell expansion) —
   still register it in TRAPS (the repo's registry must be self-contained: the next person or agent can't see your personal memory),
   **and save a copy to your user-level memory** (e.g. Claude memory) so your other repos don't re-trip it.
   One copy per scope is division of labor, not duplication: a generic trap recorded in only one repo bites again in the next repo
