---
name: fw-coldstart
description: flightwake cold start — restore state before touching a repo. Use when starting work in a repo that has .flightwake/, when the user says take over / continue / coldstart, or at the start of any session touching a flightwake-managed repo.
---

# fw-coldstart — cold-start takeover

Purpose: before touching any file, recover to a "safe takeover" state with the minimum reading. **Time it** — cold-start cost is the framework's quality metric.

## Steps

1. Read `.flightwake/STATE.md` (where we are, in progress, next entry points, standing facts)
2. Read the `latest_record` the STATE frontmatter points to (full context of the last wrap-up)
3. Read only when needed: `DECISIONS.md` (mandatory before changing an established direction), `TRAPS.md` (check when hitting weird symptoms)
   — in both, **skip entries marked superseded** (they are history; when old and new conflict, trust active / the newer date)
4. Quantify the lag: `git rev-list --count "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   (≥1 = the last session didn't wrap up — raise your guard; if STATE was never committed, use `git log --oneline -10` instead)
5. Report back to the user in one paragraph: "where the last session got to, where this one plans to pick up, whether there are unverified changes (health)" — **only start working after reporting**
   (To measure token cost: the model can't see its own usage — prefer zero-token parsing of the local transcript
   (`~/.claude/projects/<project>/*.jsonl` carries usage per message; hook stdin also carries transcript_path); ask the user for `/cost` only if that fails)

## Red lines

- STATE health is yellow/red → deal with the unverified/broken parts first; don't stack new work on top
- STATE untouched for over 7 days while git log has new commits → backfill a record before starting (archaeology is cheapest while the memory is still in commit messages)
- TRAPS has >20 active entries, or this cold start measurably took >5 minutes → propose compaction to the user
  (merge duplicates, mark no-longer-true entries superseded — compaction means changing status and consolidating, never deleting lines)
  **The proposal must be approvable with a single word**: give the diagnosis first (what's slow: STATE too long/stale?
  last session never wrapped up? too many stale TRAPS/DECISIONS entries? records using codenames outsiders can't read?),
  then an item-by-item plan (which entry gets superseded and why; which get merged). Don't touch anything before the user confirms —
  a wrong "is this still true" call propagates to every future session. The judgment stays with the human; the work stays with the model.
