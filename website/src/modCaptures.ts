/**
 * Edited excerpts of actual flightwake 0.16.0 output, captured 2026-10-11.
 * 1: test/setup-drive.mjs runs the real setup flow with injected answers (Claude Code 2.1.296).
 * 2: Claude Code 2.1.296 ran /fw-mod interactively in an isolated installed repo via --plugin-dir.
 * 3: bin/cli.mjs fleet read controlled session fixtures based on test/smoke.sh.
 * Output is excerpted and Markdown formatting flattened for display. Temporary filesystem paths are omitted;
 * Fleet names and states in scene 3 are test data.
 */
export const modCaptures = [
  `The core (records, the four skills, the wrap-up hook) is always installed. Optional add-ons — * = recommended:
  [*] 1) Bottom gauge in Claude Code (health / STATE lag / context usage)
  [*] 2) Claude Code mod — inside Claude Code: a status row above the prompt, STATE loaded when a session starts, a log of this session's changes and test runs (/fw-log), a hint when you touch something a known trap mentions, and an optional role guard.
       Needs Claude Code 2.1.287 or later. It loads in a Claude Code session started from the repo root, after you accept the folder trust prompt — a session that is already open needs a restart.
  [ ] 3) Team roles (installs only the fw-roles skill; your agent recommends roles later, nothing applied yet)
Enter = the * ones · or type the numbers you want (e.g. 1 2) · 0 = none:`,
  `flightwake-mod v0.2.0

STATE at session start (stateInject): on — STATE is not initialized yet, so only a "run /fw-coldstart" note is injected
band above the prompt (band): on — hiding the fields the bottom gauge already shows; only the one-time 80% context toast remains
session flight log (recorder): on — this session: 0 file(s) by tools, 0 via shell (inferred), 0 test run(s), 0 commit(s) — /fw-log prints them
trap tripwire (tripwire): idle — no active TRAPS entry has paths or commands
role guard (roleGuard): off — opt-in
tokens and cost (spend): on — this session: tokens unknown · API-equivalent ≈ $0.00 — /fw-cost prints the breakdown
session fleet (fleet): on — this session is reported as idle in [isolated test sessions] (heartbeat 30 s; never prompt or command text)

Read-only: /fw-mod changes nothing.`,
  `flightwake fleet — 2 live · ⛔ 1 blocked — [isolated test sessions] (last 7 days)
⛔ blocked  demo-review              demo-re…    21s  permission · Bash
● working   demo-build               demo-bu…    14s  Read src/app.ts`,
] as const;

export const modCommands = [
  'npx flightwake setup',
  '/fw-mod',
  'npx flightwake fleet --lang=en',
] as const;
