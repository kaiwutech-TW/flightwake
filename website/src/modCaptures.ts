/**
 * Edited excerpts of actual flightwake output, captured 2026-10-11.
 * The separate 0.17.0 panel is an anonymized visual reconstruction in Landing.astro.
 * 1: Claude Code 2.1.296 ran /fw-mod with -p in an isolated 0.17.0 install via --plugin-dir.
 * 2: 0.16.0 test/setup-drive.mjs ran the real setup flow with injected answers.
 * 3: 0.16.0 bin/cli.mjs fleet read controlled session fixtures based on test/smoke.sh.
 * Output is excerpted and Markdown formatting flattened for display. Temporary filesystem paths are omitted;
 * Fleet names and states in scene 3 are test data.
 */
export const modCaptures = [
  `flightwake-mod v0.3.0

STATE at session start (stateInject): on — STATE is not initialized yet, so only a "run /fw-coldstart" note is injected
band above the prompt (band): on — shown above the prompt with health, STATE lag and context use (it stands in for the bottom gauge)
session flight log (recorder): on — this session: 0 file(s) by tools, 0 via shell (inferred), 0 test run(s), 0 commit(s) — /fw-log prints them
trap tripwire (tripwire): idle — no active TRAPS entry has paths or commands
role guard (roleGuard): off — opt-in
tokens and cost (spend): on — this session: tokens unknown · API-equivalent ≈ $0.00 — /fw-cost prints the breakdown
session fleet (fleet): idle — a -p / SDK run: nothing to report
side panel (panel): idle — closed; it opens only when you ask — /fw-panel opens it beside the transcript (from 110 columns)

Read-only: /fw-mod changes nothing.`,
  `The core (records, the four skills, the wrap-up hook) is always installed. Optional add-ons — * = recommended:
  [*] 1) Bottom gauge in Claude Code (health / STATE lag / context usage)
  [*] 2) Claude Code mod — inside Claude Code: a status row above the prompt, STATE loaded when a session starts, a log of this session's changes and test runs (/fw-log), a hint when you touch something a known trap mentions, and an optional role guard.
       Needs Claude Code 2.1.287 or later. It loads in a Claude Code session started from the repo root, after you accept the folder trust prompt — a session that is already open needs a restart.
  [ ] 3) Team roles (installs only the fw-roles skill; your agent recommends roles later, nothing applied yet)
Enter = the * ones · or type the numbers you want (e.g. 1 2) · 0 = none:`,
  `flightwake fleet — 2 live · ⛔ 1 blocked — [isolated test sessions] (last 7 days)
⛔ blocked  demo-review              demo-re…    21s  permission · Bash
● working   demo-build               demo-bu…    14s  Read src/app.ts`,
] as const;

export const modCommands = [
  '/fw-mod',
  'npx flightwake setup',
  'npx flightwake fleet --lang=en',
] as const;
