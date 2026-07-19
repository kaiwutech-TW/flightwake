---
record_id: {{YYMMDD}}-{{slug}}
session: {{session id or person}}
date: {{YYYY-MM-DD}}
repos: [{{repos touched}}]
tests: {{N passed / tsc clean / or "no runtime surface"}}
prod_changes: {{migrations/deploys/data operations; none if none}}
---
<!-- flightwake record — a flight record. Triggers: touched schema / touched prod / ≥3 commits since last record / session wrap-up. -->
<!-- Filename: records/YYMMDD-slug.md. Write for "a stranger three months from now": no abbreviations, no codenames only you understand. -->

# {{Title: one sentence saying what this stretch of work did}}

**TL;DR**: {{Two or three sentences: what problem it started from, what state it ended in.}}

## Key findings (by importance; delete section if none)

1. {{Finding + evidence. Ones that qualify also go into TRAPS/DECISIONS}}

## Deliverables / Commits

<!-- Dedup: git tells the details; only the range goes here — add a sentence only for mappings git can't show. -->

{{start hash}}..{{end hash}} ({{one sentence on what the range covers; omit if git log is clear enough}})

## Verification evidence

<!-- De-identification: no prod URLs, client/internal codenames, real IDs, tokens/keys (the repo may go public). Use sanitized forms: numeric results, pointers ("see prod log YYYY-MM-DD"). -->

- {{What was verified end-to-end, how, and the result}}

## Unfinished / Handoff

- {{What's not done + the next entry point (mirror it into STATE)}}
