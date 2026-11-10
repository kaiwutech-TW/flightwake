# What flightwake leaves behind — this repo as the example

> 繁體中文版:[evidence.zh-TW.md](evidence.zh-TW.md)

flightwake has been used to build itself since its first public commit. Everything it recorded is in this repo's
[`.flightwake/`](../.flightwake/), in plain Markdown, written by the agents that did the work and reviewed by a person.
This page shows what that looks like after four months, and what it does and does not prove.

## The record, in numbers

Counted on 2026-11-10. To recount, run these at the repo root:

| What | Count | Command |
|---|---|---|
| Session records | 45 | `ls .flightwake/records/*.md \| wc -l` |
| Decisions (one line each, with the why) | 127 | `grep -c '^\| 20' .flightwake/DECISIONS.md` |
| Traps still in force | 20 | `npx flightwake traps stats` |
| Traps kept but marked superseded | 22 | `grep -c '^status: superseded' .flightwake/TRAPS.md` |

Nothing is deleted. A decision that was reversed stays, marked with what replaced it; a trap that stopped being true
is marked superseded and points to its replacement.

## Three files worth opening

- **A session record:** [`records/261110-narrow-a1-a2-tripwire.md`](../.flightwake/records/261110-narrow-a1-a2-tripwire.md).
  Twenty-five tests started failing after a Claude Code update. The record says what the cause turned out to be, how
  that was confirmed, what changed, and what is still unverified. A new session, or a person, reads this instead of
  asking.
- **The decision log:** [`DECISIONS.md`](../.flightwake/DECISIONS.md). One row per choice that closed off other
  options, with the reason and the condition that would reopen it. The top rows (2026-11-10) are a scope cut: which
  features went into maintenance mode, and why.
- **A trap:** `plugin-test-kit-denies-unanswered-permission-request` in [`TRAPS.md`](../.flightwake/TRAPS.md). It was
  recorded as `probable` on 2026-10-26 with what had not been ruled out, and upgraded to `confirmed` on 2026-11-10 once
  the cause was found in the vendor's type definitions. The confidence label is what told the next session not to
  trust the first explanation.

## Why traps carry a confidence level

In August 2026 we audited the trap registries of two other repos that use flightwake (private projects, so the entries
can't be published). Of 106 entries, 24 (22%) had later been marked as misdiagnosed, corrected or replaced. In one
case the same root cause was written up three times; the first two explanations were wrong, and the feature they
described was broken in production for three days between them. Another entry turned a single observation into a
rule that said an operation was safe; it wasn't.

So every trap now says how sure its root cause is: `confirmed` (a controlled test, at least twice, or a first-hand
source), `probable` (seen repeatedly, no control) or `suspected` (seen once). An entry can argue "this breaks" at
`probable`, but it can only argue "this is safe" at `confirmed`. Full write-up:
[`records/260803-trap-confidence.md`](../.flightwake/records/260803-trap-confidence.md) (in Chinese).

This is one audit of two repos by the person who wrote the tool. It explains a design choice; it is not a benchmark.

## What this does not prove

- **It is one maintainer's repo.** Most records are in Traditional Chinese, the working language here.
- **There is no controlled comparison.** The cold-start measurements in [benchmarks.md](benchmarks.md) are two runs,
  and the comparison side was never run. Read them as a description, not a result.
- **Research on context files is mixed.** One 2026 study found that repository context files did not generally raise
  agents' task success and added over 20% to cost; another found that injecting verified, task-relevant experience
  helped. flightwake's bet is the second kind: short, reviewed entries that surface only when an agent touches the
  place they are about. That bet has not been measured.
