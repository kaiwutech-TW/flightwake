---
updated: {{DATE}}
updated_by: {{SESSION_OR_PERSON}}
latest_record: records/{{YYMMDD}}-{{slug}}.md
health: green   # green | yellow (unverified changes) | red (known broken)
---
<!-- flightwake STATE — always short, always current. A fresh session's first stop. -->
<!-- Rule: only "now" and "next" live here; history goes to records/, decisions to DECISIONS.md. -->
<!-- Cold-start contract: this file + latest_record must enable a safe takeover within 5 minutes. -->

# Where we are

{{One paragraph: current focus and status.}}

# In progress (don't delete until done)

- [ ] {{Unfinished work + where it's stuck}}

# Next entry points

1. {{Most likely next thing → which file/command to start from}}
2. {{Second most likely}}

# Standing facts (3-5 pieces of survival knowledge for this repo)

- {{e.g., migrations are SQL files — never drizzle-kit push}}
- {{e.g., tests hit a real DB; fixtures always use the vitest- prefix}}
