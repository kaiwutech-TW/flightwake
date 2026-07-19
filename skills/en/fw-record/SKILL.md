---
name: fw-record
description: flightwake wrap-up record — write the flight record and update STATE. Use when wrapping up work that touched schema/prod, spanned 3+ commits, or when the session is ending; also when the user says wrap up / record this.
---

# fw-record — flight-record wrap-up

Purpose: turn this stretch of work into a durable artifact "a stranger three months from now can read". **Written after the fact — never interrupting the work rhythm.**

## Steps

1. Inventory this stretch: `git log --oneline "$(git log -1 --format=%H -- .flightwake/STATE.md)"..HEAD`
   lists commits since the last wrap-up (if STATE was never committed, use `git log --oneline -20`); recall key findings/decisions/verifications
2. Write `.flightwake/records/YYMMDD-slug.md` following `.flightwake/TEMPLATE-record.md`:
   - TL;DR in two or three sentences (starting problem → ending state)
   - Key findings ordered by importance; ones that qualify **also go into TRAPS** (in /fw-trap format) **and DECISIONS**
   - Commit range in one line (details stay in git), verification evidence, unfinished/handoff
3. Update `.flightwake/STATE.md`: where we are, in progress, next entry points, the `latest_record` pointer, `health`
4. Commit together (record + STATE in one commit, message `docs(fw): record YYMMDD-slug`)

## Quality check (ask yourself after writing)

- Can someone who doesn't know this project read the TL;DR and know what happened?
- Any codenames only this session understands? (yes → expand them)
- Is the verification evidence a *claim* or *evidence*? (needs numbers/output/links)
- **Dedup**: did you re-copy things git already records (commit messages, diff details)? Does the same fact already live in STATE/DECISIONS? (yes → replace with a link/hash; write it twice and one copy is already stale)
- **De-identification**: any prod URLs, client/internal codenames, real IDs, tokens/keys in the record? (the repo may go public; scan before committing:
  `grep -nEi 'https?://|token|secret|key|password' .flightwake/records/<this-file>`, confirm each hit is sanitized)
