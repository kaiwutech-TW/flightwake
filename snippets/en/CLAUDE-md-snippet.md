<!-- flightwake trigger-obligation snippet — init appends this file's content (minus this comment) to the target repo's CLAUDE.md -->
## flightwake work discipline

This repo uses flightwake (a flight-recorder-style work framework): **records follow work — they don't lead it**.
Default to just starting work; the following events trigger obligations:

| Trigger | Obligation |
|---|---|
| First time this session touches this repo | Run `/fw-coldstart` first (read `.flightwake/STATE.md` + the latest record; report back before touching anything) |
| Making a decision that closes off other options | Append one line to `.flightwake/DECISIONS.md` (with the why) |
| Hitting a non-obvious trap | `/fw-trap` it into `.flightwake/TRAPS.md` on the spot |
| Touched schema / touched prod / ≥3 commits since last record | Wrap up with `/fw-record` (flight record + update STATE; the Stop hook reminds you when STATE lags) |
| Multi-session construction is stopping | `/fw-handoff` (write CONTEXT before stopping — not before starting) |
| Session ending | STATE must reflect reality (honest health color) |

Hard guards (independent of model strength): tests green + typecheck clean before anything counts as done; prod changes must leave verification evidence in the record; confirm with the user before destructive operations.
Dedup principle: every fact lives in exactly one place (don't re-copy what git can already answer; record/STATE/DECISIONS each have their role — elsewhere, point with a link or hash). Write it twice and one copy is already stale.
