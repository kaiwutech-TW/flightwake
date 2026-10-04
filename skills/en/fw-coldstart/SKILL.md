---
name: fw-coldstart
description: flightwake cold start — restore state before touching a repo. Use when starting work in a repo that has .flightwake/, when the user says take over / continue / coldstart, or at the start of any session touching a flightwake-managed repo.
---

# fw-coldstart — cold-start takeover

Purpose: before touching any file, recover to a "safe takeover" state with the minimum reading — cold-start cost (time and tokens to a correct report) is this framework's quality metric.

## Steps

1. Read `.flightwake/STATE.md` (where we are, in progress, next entry points, standing facts)
   **Not initialized yet?** If STATE still carries the shipped template's own placeholders — the frontmatter
   `updated: {{DATE}}`, `updated_by: {{SESSION_OR_PERSON}}`, `latest_record: records/{{YYMMDD}}-{{slug}}.md`, or body lines
   that are exactly the template's `{{…}}` lines — this is a first run, not a takeover. Write the first STATE, then skip to step 5:
   - Only those known template lines count as unfilled. Any other `{{…}}` is the user's content (an example, a template of
     their own) and stays as written; anything already filled in stays as written too — replace only the unfilled lines
   - Fill from the repo as it is: README/docs, `git log --oneline -20`, the directory layout, obvious open work.
     `updated` = today, `updated_by` = you (model/session), `latest_record` = the newest file in `.flightwake/records/`, or `none`
   - `health`: the template's pre-filled `health: green` counts as unfilled. Mark green only with verification evidence from
     this session (e.g. you ran the tests and they passed); otherwise mark yellow and say why in the comment
     (e.g. `health: yellow  # first STATE — nothing verified yet`)
   - Missing material: no commits → "no history yet"; no README → describe from the file tree and say so; no records →
     `latest_record: none`. Write "unknown" rather than guess
   - Report the first STATE to the user (one paragraph, plus what you could not determine) before continuing
2. Read the `latest_record` the STATE frontmatter points to (full context of the last wrap-up)
3. Read only when needed: `DECISIONS.md` (mandatory before changing an established direction), `TRAPS.md` (check when hitting weird symptoms;
   **also — if the work you're about to do touches the territory of a trap, read that entry before you act**, don't wait for the
   symptom, by then you've already stepped in it)
   — in both, **skip entries marked superseded** (they are history; when old and new conflict, trust active / the newer date)
   — for TRAPS entries, **check `confidence` first**: only `confirmed` may be treated as a rule; `probable`/`suspected`/
     legacy entries without the field are **leads, not facts** — and must **never** be used to argue "doing it this way is safe"
     (a wrong safety call hits prod and your users directly). To proceed on one, verify it yourself first, then write the result
     back and raise the entry's confidence
4. Quantify the lag: `git rev-list --count "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   (≥1 = the last session didn't wrap up — raise your guard; if STATE was never committed, use `git log --oneline -10` instead)
5. Report back to the user in one paragraph: "where the last session got to, where this one plans to pick up, whether there are unverified changes (health)" — **only start working after reporting**

## Red lines

- STATE health is yellow/red → deal with the unverified/broken parts first; don't stack new work on top
- STATE untouched for over 7 days while git log has new commits → backfill a record before starting (archaeology is cheapest while the memory is still in commit messages)
- TRAPS has >20 active entries, or this cold start measurably took >5 minutes → propose compaction to the user
  (merge duplicates, mark no-longer-true entries superseded — compaction means changing status and consolidating, never deleting lines)
  **The proposal must be approvable with a single word**: give the diagnosis first (what's slow: STATE too long/stale?
  last session never wrapped up? too many stale TRAPS/DECISIONS entries? records using codenames outsiders can't read?),
  then an item-by-item plan (which entry gets superseded and why; which get merged). Don't touch anything before the user confirms —
  a wrong "is this still true" call propagates to every future session. The judgment stays with the human; the work stays with the model.
