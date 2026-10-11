# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases before 0.7.1 predate the public launch and were never published; the history starts there.

## [Unreleased]

### Added
- **Side panel** (mod 0.3.0, feature `panel`, on by default but opens only when asked). `/fw-panel` opens a pane beside
  the transcript with STATE (health, lag, context, the "In progress" and "Next entry points" items), this session's flight
  log and cost, and the other live sessions (blocked first). Once opened it reopens in later sessions until you close it;
  the choice is one yes/no in the mod's own plugin store. It exists because the band hides itself under the bottom gauge,
  which left nothing of the mod on screen. `/fw-mod` lists it as the eighth switch.
- **Panel "Watch" block**: context at 80%+ (wrap up), why health is not green, uncommitted files, the latest record's
  "Unfinished / Handoff" items, and more than 20 active TRAPS entries. Other sessions show their seat role and get a
  second line when their context is at 80%+ or they run another flightwake / mod version.
- **Fleet console** in the side panel, inside Orca: every agent terminal Orca has — Claude Code and Codex — as one card
  per repo (blocked first), with that repo's health and flightwake version (read-only from its own `.flightwake/`),
  each agent's task title, role, state and a context bar. **Go** switches to the tab; **Wrap up** (idle agents only,
  confirmed each time, re-checked before sending) types `/fw-record` or `$fw-record` into it. Runs `orca terminal list`
  every 10 s only while the pane is open; outside Orca the fleet falls back to the Claude Code sessions' own reports.
  States of agents without a fleet file are read from the tab title and recent output (a heuristic, labelled as such).
- **Session file fields** (additive, `flightwake.session/1`): `context` (`{percent}`), `role` (the seat role id) and
  `fwVersion` (the install version from the marker).

### Fixed
- The empty `/fw-fleet` message named the current mod version as the minimum; it now names 0.2.0, when fleet shipped.

## [0.16.0] — 2026-10-11

### Added
- **Showcase website** at https://flightwake.kaiwu.com.tw/ (four languages, picks the browser language on first visit,
  a real anonymised two-repo multi-agent case); source under `website/`, linked from the README and the GitHub page.
- **Tokens and API-equivalent cost** (mod 0.2.0, feature `spend`, on by default). The band's last field and a line in
  `/fw-mod` show `1.2M tok · ≈$4.99`; `/fw-cost` prints the breakdown (uncached input / cache write / cache read / output,
  the number of API responses counted, the model). Cost is Claude Code's own ledger (the `/cost` figure at API list prices;
  on a subscription it is not a bill), taken from the engine's `session.measure` event after every turn. Tokens are summed
  from the session transcript under `~/.claude/projects/`, once per API response (one response spans several transcript
  lines sharing `message.id`); subagents keep their own transcripts and are not included. Null when unknown, never zero.
- **Bottom gauge (`statusline.mjs`)** shows the same field (`tokens` from the transcript Claude Code hands it, `≈$` from
  `cost.total_cost_usd` on stdin), so the band stays quiet when the gauge is the effective status line, as before.
- **Session fleet** (mod 0.2.0, feature `fleet`, on by default). Each interactive session reports working/blocked/idle/ended
  to `~/.flightwake/sessions/<id>.json` (blocked only from an unanswered permission dialog or an
  AskUserQuestion/ExitPlanMode in flight); `/fw-fleet`, `npx flightwake fleet [--json] [--prune]`, a `⛔` field on the
  bottom gauge, and a one-time `claude --resume` hint after an unclean death. `FLIGHTWAKE_HOME` (absolute only) moves the
  folder; nothing is written for `-p` / SDK runs, when the folder would be inside the repo (re-checked after a `/cd`), or
  when it is a flightwake records folder or lies in any git repo or flightwake root (a repo installed at `$HOME`; judged by
  real path too, and refused when a check cannot be answered). The file format
  (`flightwake.session/1`, additive-only) is documented for other tools under "Fleet file contract" in `docs/mod.md`.
  `init --mod`, `update --mod` and setup's add path create the folder with mode 0700 (never inside a repo; setup lists it
  before Proceed); `uninstall` and `--purge` keep it, even when it
  lies inside the `.flightwake/` being purged; `fleet --prune` is the only delete, deletes only flightwake session files
  (never another tool's JSON), refuses when the folder lies inside a repo, and re-reads each file's mtime right before
  deleting it. A resume command is offered for stale sessions and ended ones (except after `/clear` / `/resume`)
  whose own transcript still exists; a transcript path a record names is used only when it is that session's transcript
  under `~/.claude/projects/`.
- **setup preselects the language** from the terminal locale (`LC_ALL` → `LC_MESSAGES` → `LANG`, the OS locale via Intl
  only when none is set; `C`/`POSIX` = English) and shows where the guess came from, plus a
  `lang=… · agents=… · add-ons=… · profile=…` line before the path list; `init`/`update` never guess.
- **setup on an installed repo** can *upgrade and add add-ons* (adds only; same path as `update --statusline/--mod/--orca`).
- **`update` and `init` end with one line** naming applicable add-ons that are not installed, with `npx flightwake setup`
  or the direct `update --…` / `roles install` command; nothing is added automatically. An `orca` found only on PATH (it
  may be GNOME's screen reader) is not named.

### Changed
- **The mod's write invariant is restated:** it never writes inside the repo or your records; its only write is the
  session fleet file `<base>/sessions/<id>.json` outside the repo (refused when `<base>` resolves inside the repo, is a
  records folder or lies in any git repo or flightwake root; never through a symlink, never over a file that is not a
  flightwake session file). The read scope gains `<base>/sessions/*.json`, a check that another session's transcript
  exists (existence only), existence probes for `<base>/STATE.md` and for `.git` and `.flightwake/STATE.md` on `<base>`
  and the folders above it, and where the repo root and `<base>/sessions` really land (a `stat` that follows links).
- **setup add-ons are one list** with recommended defaults (mod when Claude Code is picked and new enough; bottom gauge
  only when neither you nor the repo has a status line; Orca only inside Orca; roles never) — was four yes/no questions,
  all No; Enter keeps the marked ones, numbers/names pick exactly those, `0` none; a `--statusline` / `--mod` / `--orca`
  flag always reaches the install (which says why when it can't apply); leaving an installed repo as it is exits 0.
- **init's language hint** names the detected locale and suggests `npx flightwake update --lang=…`.
- **mod next steps** say to restart an already-open Claude Code session from the repo root, then `/fw-mod`.

### Fixed
- Mod tests on Claude Code 2.1.294: `turn.complete` now holds the hook result to `{ text }` and the input to `{ answer, … }`
  (acceptance test 4 was red on an untouched checkout; the engine stub and the call are updated).
- `update --mod` printed none of the mod's next steps and skipped the 0700 session fleet folder.
- the 'bottom gauge not installed' hint suggested `init --statusline`, and the language hint `init --lang=…` — on a
  `--private` install, following them wrote the shared `.claude/settings.json`. The non-TTY `setup` message on an
  installed repo, the hand-edit overwrite warning and doctor's inconsistent-install hint now point at `update` too.
- a `--private` install with no marker (every Claude instruction file tracked) forgot its language: the next `update`
  re-rendered it in English. The `.git/info/exclude` header now carries `lang=` next to `profile=`; a header written
  before that is read back from the language stamped into `.flightwake/hooks/state-check.mjs`.
- the cross-repo registry followed a relative `HOME` into the repo being installed (`relhome/.flightwake/registry.json`),
  and an empty `FLIGHTWAKE_HOME` put `registry.json` in the working directory.
  It now uses the session fleet's base (an absolute `FLIGHTWAKE_HOME`, else an absolute `HOME`) and is skipped with a
  notice when there is none.

## [0.15.0] — 2026-10-05

### Added
- **`npx flightwake setup` — guided install.** Interactive (needs a terminal; without one it explains and exits 1).
  Checks git is installed, then that the directory is a repo (offers `git init`, default No, run only after the final
  confirmation). If flightwake is already installed it only offers an in-place upgrade (`update`) or leaving. Then asks
  language, agents (detected ones offered; with no instruction file at all it asks which tools you use, multi-select,
  nothing preselected), optional add-ons (each default No: the bottom gauge — only if Claude Code is selected; roles — installs
  only the `fw-roles` skill; Orca collaboration — only if Orca is detected) and repo type (code / notes), shows every path it
  will write and asks `Proceed? [Y/n]` (Enter installs), installs through the same path as `init`, then runs `doctor` and
  prints next steps.
  Flags on the command line answer their question; `--private` is flag-only and never asked. Ctrl-C, EOF, or declining before
  the final confirmation writes nothing. `npx flightwake` (no command) and `init` are unchanged and never ask questions —
  the non-interactive form for automation, agents, CI and advanced users.
- **`npx flightwake doctor` — read-only install check** (no network, writes nothing). Checks git and git root, Node ≥18,
  `.flightwake/`, STATE (unfilled template fields are a warning), `latest_record`, marker blocks and their
  version/lang/profile consistency, skills, hook registration (valid JSON, exact command, correct event — Stop for Claude
  Code/Codex, AfterAgent for Gemini CLI — no duplicates, script exists), whether `--private` excludes are in effect, and
  optional add-ons. Prints ok / warning / fail per line; exits 1 on any failure. It verifies install structure only, not
  that hooks fire at runtime (Codex path trust can't be checked — printed as a hint).
- **`--profile=code|notes`** (default `code`). `notes` is a trimmed obligation table for non-code repos: it drops "tests green
  + typecheck clean", "prod verification evidence" and the schema/prod wrap-up trigger, and keeps cold start, decisions,
  traps, handoff, the ≥3-commit wrap-up, confirming destructive operations, and an honest STATE at session end. Same files are
  installed. Stored in the marker (`profile=notes`); `update` keeps it, `update --profile=code` switches back.
- **`--orca` — opt-in Orca collaboration add-on** (also a `setup` question). A marked block in each active platform's
  instruction file telling agents to use visible Orca tabs, not hidden background runs, for cross-agent discussion and review,
  plus the one-writer review protocol. `uninstall` removes it; `update` refreshes it only where installed.
- **`init --git-init`** creates the git repo when the directory isn't one (explicit flag only).
- **`flightwake-mod` — opt-in Claude Code mod** (`init --mod`, or a `setup` question asked only when Claude Code is
  picked, default No). A plugin of function hooks, installed into `.claude/skills/flightwake-mod/` (only its manifest,
  `hooks/` and `types/`), which Claude Code ≥2.1.287 loads by itself as `flightwake-mod@skills-dir` once the folder's
  trust prompt is accepted and the session starts at the repo root. Five features, each with its own switch: STATE in the
  system prompt at session start, a quiet status band above the prompt, a session flight log (`/fw-log`), TRAPS tripwire
  hints from the new optional `paths` / `commands` fields, and an off-by-default role guard for `deny-write` paths (not a
  security boundary; turned on per person in `/config` or user settings — the installer can't). Reads `.flightwake/` and
  git only, never writes your records. Skipped with a note when Claude Code is not among the agents; `update` refreshes it
  only where installed and keeps files you added there; `uninstall` removes only the files it shipped (and folders left
  empty), keeping and listing anything you added; `--private` excludes it. `doctor` reports
  it (manifest, hooks modules, shipped files, version vs the package, `claude --version` when readable) and prints what it
  can't see (folder trust, starting at the repo root). Guide: `docs/mod.md` (four languages).
  `/fw-mod` (read-only) shows each feature as on / off / idle, why, and how to make it take effect, plus the mod version,
  language and profile. Without the bottom gauge the band is always shown with the context percentage (it stands in for the
  gauge); with the gauge it stays quiet. `/fw-log` lists files changed through shell commands in a separate, "inferred"
  section and shows local time with UTC; a test run chained with other commands gets a one-time note to run it on its own.

### Changed
- `fw-record`: when `/fw-log` exists (the Claude Code mod), its output is the basis for `tests:` evidence and the change list;
  entries it marks unknown are judged by hand, never counted as passed. `fw-trap` and the TRAPS template document the optional
  `paths` / `commands` fields (leave them empty when unsure). Four languages.
- `init` and `setup` now check that git is installed first, with per-platform install hints — also when a `.git` directory exists.
- `fw-coldstart` handles a never-filled STATE: it writes the first STATE from the repo, and health is never guessed green
  (yellow unless something was verified this session). The READMEs and workflow docs now say to run `fw-coldstart` after
  install instead of initializing STATE with `fw-record`.
- `init` (and `setup`) now end by pointing at `fw-coldstart` for the first STATE, instead of hand-editing STATE.
- `fw-record`'s description and the record template's trigger line read "≥3 commits / session wrap-up / (code repos)
  schema or prod", so notes repos aren't told to wrap up on schema/prod changes.
- `roles` (install) under a `--private` install now adds `fw-roles` to the exclude block, and `update` keeps it there —
  before, the copied skill showed up in `git status`.

### Fixed
- `uninstall` (and `roles remove` for fw-roles) removes only the files flightwake shipped in each skill folder and the mod
  folder; a directory sitting where a shipped file was is never deleted recursively, and anything else in there (your
  files) is kept and listed. Previously a whole skill folder was deleted, including files you had added.
- `/fw-log`'s shell-inferred list only names paths it can confirm: option values (e.g. `sed -e` scripts) are never taken
  for paths, relative paths are not guessed after an uncertain `cd`, paths outside the repo are dropped, and a path is
  listed only if git reports it as changed afterwards.
- `setup` in a real terminal: lines holding a typed answer could vanish from the screen (seen in Orca's terminal). setup now
  reads lines from a cooked tty — plain prompts, no cursor movement or erase sequences — so every question and answer stays.
- `init`/`setup` no longer tell an existing install to "run fw-coldstart — it writes the first STATE" when STATE is already
  filled in; the next step is then just the commit. `latest_record: none` is the one canonical "no record yet" (fw-coldstart
  writes it); `doctor` treats it — and any value while `records/` is empty — as information, not a warning.
- A `--private` install for Claude Code (its table in `CLAUDE.local.md`) followed by `update` fell back to Codex: it created
  `AGENTS.md`, `.agents/skills`, `.codex/hooks.json`, and dropped `CLAUDE.local.md` from the exclude block, so it showed up in
  `git status`. A `CLAUDE.local.md` carrying the flightwake marker now counts as Claude Code (the bug is also in 0.14.0).
- **Writes never go through a symlink or land outside the repo** (pre-existing): a framework file symlinked to
  `../STATE.md` let `update` overwrite STATE. init / update / setup / `roles install` now preflight the whole install
  (core and roles through one guarded writer): if any required path is a symlink, resolves outside the repo or goes through
  a dangling symlink, they stop before writing anything, list the paths and exit 1. A run that still stops part-way never
  prints ✅; setup doesn't claim success when doctor fails. A symlinked or broken `~/.flightwake/registry.json` stays a
  notice (best-effort, exit 0).
- Writes replace files atomically (temp file + rename) instead of overwriting in place, so a framework file that is a
  hardlink to STATE can't overwrite STATE. The replaced file keeps its existing mode (a 0600 `settings.local.json` stays
  0600; the temp file is never looser than the original). `uninstall` and `roles remove / apply / assign` go through the same guarded,
  preflighted writer (cross-repo roles are protected per target repo); a path of the wrong type (`.claude` is a file)
  stops before writing; files that would be skipped anyway (tracked under `--private`) no longer trigger a refusal.
- `--private` refuses up front when privacy can't take effect — an artifact is already tracked (e.g. `.flightwake/`) or
  `.git/info/exclude` can't be written — instead of installing and printing ✅ (main warned and exited 0).
- Agent names (`--agents`, setup's tool question) only accept claude / codex / gemini — inherited names like
  `constructor` or `__proto__` were accepted before.
- `doctor`: under `--private`, the paths that must be ignored are derived from what is installed (deleting `.flightwake/`
  from the exclude block now fails); platforms are derived from installed hook files too (a deleted marker no longer hides a
  broken `.codex/hooks.json`); hooks must match event, `type: "command"` and command; malformed settings are reported item by
  item instead of crashing.
- `--private --orca` no longer appends the Orca block to a git-tracked instruction file (Claude → `CLAUDE.local.md`,
  unless that is tracked too; Codex/Gemini → skipped with a warning).
- The git check applies to `init` and `setup` only; `uninstall` works again on a repo whose git binary is missing.
- `fw-coldstart`: after filling an uninitialized STATE, a repo with any history still goes through the normal takeover steps.

### Documentation
- READMEs (en / zh-TW / zh-CN / ja): `setup` is the primary install entry, `init` is documented as the non-interactive form;
  new `doctor`, `--profile=notes`, Orca and `--git-init` sections; the Security "Fixed write scope" list now includes
  `~/.flightwake/registry.json`, the opt-in Orca block and `fw-roles` skill, and names `git init` as the one exception to
  "only copies files".
- Claude Code mod guide `docs/mod.md` (en / zh-TW / zh-CN / ja); READMEs: the mod in `setup`'s add-on list, a `--mod`
  section, and `.claude/skills/flightwake-mod/` in the fixed write scope (plus `doctor`'s read-only `claude --version`).

## [0.14.0] — 2026-09-28

### Added
- **`flightwake roles` — opt-in team roles that survive `/clear` (preview, en + zh-TW).** Never installed by
  `init`. `roles` installs a `fw-roles` skill in which the agent itself scans the project, recommends 3–5 roles
  from nine presets (pm, tech-lead, coder, reviewer, qa, researcher, plus conditional release, security, designer —
  each with an explicit **Never** list aimed at a documented failure mode: loosening tests to get green, self-review,
  dispatching without "done when", claiming "live" before verification), shows
  a preview, and takes customizations in conversation into one human-edited `.flightwake/ROLES.md`.
  `roles apply [--dry-run]` renders each role into the instruction file its agent reads at every session start
  (Claude Code → `CLAUDE.md`, Codex → `AGENTS.md`, Gemini CLI → `GEMINI.md`), inside
  `<!-- flightwake-roles:begin/end -->` markers at the top of the file — no hook, no trust prompt. A team may
  span repos: one ROLES.md, and apply writes into every repo it names (member repos find the source again from
  the block's `src=`). Routing key is (folder, agent): two roles on the same agent in one folder are refused.
  `roles remove` and `uninstall` strip the blocks and the skill; ROLES.md is user data and is kept; `update`
  refreshes the skill only where it is already installed.
- **Seats and on-call roles.** An optional `## seats` table (`| repo | vendor | role |`) decides who sits where; a role
  without a seat is **on call** and costs no seat. `roles apply` generates every on-call role as a native agent definition in
  each seated (repo, vendor) — `.claude/agents/fw-<id>.md`, `.codex/agents/fw-<id>.toml` — so a seated agent can spawn
  `fw-security` directly (seated roles get no native copy, so no seat can spawn another seat's job and bypass the
  review split), and `roles card <id>` prints any role as a dispatch card for a cross-vendor worker
  (stdout only; on error nothing on stdout and a non-zero exit, so a worker is never dispatched without its role).
  Seat blocks now say they are the *main session's* role and that an explicit card overrides them for that task.
  `### When to call` in a role feeds every seat's team list. `roles assign <repo>:<vendor> <id> [--add] [--dry-run]`
  edits exactly one seats cell and re-applies (legacy files without a table are asked to migrate first).
- **Ownership manifest.** `.flightwake/roles-manifest.json` records every generated output with a hash; apply rewrites or
  removes only output that still matches, so a same-named user file, a hand-edited generated file, or another team's
  output is reported as a conflict and nothing is written. A role or a whole repo leaving ROLES.md is cleaned up.
- Roles are documented and generated as **guidance, not permissions**: in testing, a Codex custom agent defined as
  read-only still wrote files when spawned from a writable session, so nothing claims enforcement.

## [0.13.0] — 2026-09-02

### Added
- **Codex and Gemini CLI get the skills and the wrap-up hook, not just the obligation table.** Until now
  `--agents=codex` (or a repo that only had AGENTS.md) received a table that said "run `/fw-coldstart`" — a
  Claude Code slash command Codex cannot see — while the four skills were only ever copied into `.claude/skills/`.
  init/update now install, per detected platform: the skills into `.agents/skills/fw-*` (read by both Codex and
  Gemini CLI) alongside `.claude/skills/`; the STATE staleness check as a Stop hook in `.codex/hooks.json` and
  as an AfterAgent hook in `.gemini/settings.json` (same script — it answers `block` to Claude/Codex and `deny`
  to Gemini, which is that host's spelling of the same thing); and the obligation table in each platform's
  dialect (`/fw-…` for Claude Code, `$fw-…` for Codex, bare skill names for Gemini), with a one-line note on
  where the skills and hook live. `uninstall` reverses all of it and leaves other skills/hooks in those trees
  untouched. The `.flightwake/` data layer was always shared; what an agent could *do* with it was not.
  Field-verified on Codex 0.147.0: the four skills are discovered from `.agents/skills/`, and the Stop hook's
  reason arrives as the continuation prompt when STATE lags. The Gemini CLI hook follows the published hooks
  reference and is not yet field-verified.
- **`docs/multi-agent.md`** (en + zh-TW): how several models share one repo's flightwake memory — what init
  installs per platform, each tool's skill syntax, the wrap-up → commit → cold-start loop, what is deliberately
  *not* shared, and the rules for two agents open on the same checkout.
- **Cross-repo registry**: init/update record the repo path in `~/.flightwake/registry.json` (uninstall removes
  it) so read-only cross-repo tools such as [flightwake-tower](https://github.com/kaiwutech-TW/flightwake-tower)
  can find every installed repo. Best-effort: a registry problem never fails an install, and a corrupt registry is
  left in place rather than clobbered. `FLIGHTWAKE_HOME` relocates it (the smoke test uses this for isolation).

### Changed
- The hook's reminder says "run fw-record" instead of "/fw-record": the same message now reaches three hosts
  with three invocation syntaxes.

## [0.12.0] — 2026-08-05

### Added
- **TRAPS entries carry a `confidence` on their root cause** — `confirmed` (controlled experiment: toggle the
  cause, symptom follows, at least twice) / `probable` (repeat observations, no control) / `suspected` (single
  observation, or the most likely explanation at the time). Motivated by a real failure mode: the registry's most
  expensive defect is not a missing entry but a misdiagnosis recorded as settled fact — readers cannot distinguish
  a nailed root cause from the best guess at the time, and following a wrong one costs more than an empty registry.
  Three rules ship with it: the symptom field is always fact (confidence rates the root cause only); below
  `confirmed` the remedy is written as a *workaround* and never treated as a rule; and the bar is **asymmetric** —
  `probable` suffices to argue "this breaks", while "this is safe" requires `confirmed`, because that error reaches
  prod and end users.
- `fw-coldstart` now reads TRAPS **before acting in a trap's territory**, not only after a weird symptom shows up —
  by the time the symptom appears the trap has already been stepped in.
- `fw-handoff` Scope now requires one line of **acceptance** — what counts as done, stated observably (which
  number must match what, what appears on which screen, which test goes green). The section already pinned down
  what is in and out of scope but never what "finished" looks like, so the receiving session had to invent a
  definition — usually a looser one.
- **`fw-record` now routes unfinished work to the right exit** — loose ends the next session can pick up in
  passing stay in the record's unfinished section; a multi-session build being paused is redirected to
  `/fw-handoff` (the record keeps only a pointer). The boundary between the two exits was never stated, which is
  why handoffs went unwritten in practice (this very repo: 23 records, 0 CONTEXTs). The workflow guide's
  wrap-up-or-stop section gained the boundary rule and a worked four-section CONTEXT example (en + zh-TW).

### Compatibility
- **Backward compatible.** The field is optional; existing entries without it are treated as `unknown`, which
  readers handle exactly like `suspected`. No migration required, and `update` does not rewrite user data
  (STATE/DECISIONS/TRAPS/records are never overwritten).

## [0.11.0] — 2026-07-27

### Added

- **Installed content now ships in four languages** — `--lang=en|zh-TW|zh-CN|ja`. Templates, the four skills,
  the CLAUDE.md snippet, the status-line gauge, and all CLI/hook output follow the chosen language; previously
  only English and Traditional Chinese were installable while the README already existed in four.
  There is deliberately **no auto-detection**: a terminal's `LANG` and the OS locale routinely disagree, and a
  confident wrong guess is worse than a stated default. `init` now points at the alternatives when it defaults
  to English, and every README's install section carries a copy-paste table.
- **Overwritten local edits are named.** When `--force`/`update` replaces a framework-owned file that was
  edited locally, each file is listed instead of vanishing silently. Flagged only when the install is already
  at the same version *and* language — across a version or language change content legitimately differs.
- The status line shows the installed flightwake version, in dim text, as its first field
  (hidden when running from an unstamped source checkout).

### Fixed

- **STATE staleness now counts human commits only.** Bot commits (`dependabot[bot]`, `renovate[bot]`, …)
  are excluded from both the Stop-hook/CI check and the status-line gauge. A dependency bump never makes
  STATE wrong, and a bot's own PR could never satisfy the gate — an unsatisfiable check just trains everyone
  to ignore red.

### Changed

- Dependabot groups `github/codeql-action/*` into a single PR. The sub-actions must run at the same version,
  so splitting them across PRs made every one of them fail CI on its own.

## [0.10.0] — 2026-07-23

An external-evaluation-driven release: the neighbouring ecosystem was surveyed (auto-capture memory,
spec/task-first frameworks, markdown conventions), the retrospective × git-native × zero-dependency ×
hard-guard quadrant confirmed unoccupied, and the three real gaps the evaluation surfaced closed.

### Added

- **`health: green` now needs evidence.** The Stop hook and `--ci` gain a second check: STATE claiming green
  while the latest record carries no test evidence (empty `tests:` frontmatter) gets a nag. Detection is
  frontmatter-presence only — no prose judgement — and in CI it is a warning, never a gate.
- **Cross-repo traps stop biting twice.** `fw-trap` judges a trap's scope: platform/language-layer traps are
  registered in the repo's TRAPS *and* saved to user-level memory, so other repos get the warning too.
- **README opens with a live demo** — a real ~30-second cold start recorded on this repo.

### Changed

- The honest edges of the reminder net are documented in all four README editions: the lag check counts
  commits, so a session that commits nothing, or a squash/rebase flow, slips under it.

## [0.9.0] — 2026-07-19

The full-i18n release.

### Added

- **English by default.** `npx flightwake init` installs English templates, skills, and CLI/hook output.
  Traditional Chinese remains fully supported via `--lang=zh-TW`; existing (pre-0.9, all zh-TW) installs are
  detected and keep their language on update.
- **`npx flightwake update`** — in-place upgrade that re-detects language, status line, and private mode, and
  refreshes only framework-owned files. User data is never touched.
- **Update hint in the gauge** (`→ v0.9.1 available: npx flightwake update`), shown only when nothing more
  urgent is. Anonymous npm-registry GET at most once per 24h, cached in the OS temp dir, always backgrounded.
  Opt out with `FLIGHTWAKE_NO_UPDATE_CHECK=1`.
- `docs/workflow.md`, the stage-by-stage playbook, English-first with a zh-TW edition.

### Fixed

- Status line TTY guard — manual runs no longer hang waiting on stdin.

## [0.8.2] — 2026-07-18

### Fixed

- **Correct context-window size on 1M-context models.** The gauge reads `context_window` from Claude Code's
  status-line stdin instead of assuming 200k; on Fable 5-class sessions it had over-reported usage roughly 5×
  (63% shown for an actual 12.7%). Falls back to the 200k estimate on older Claude Code versions.
- `init` now states that the status line is opt-in and that `--statusline` adds it.

## [0.8.1] — 2026-07-18

### Added

- The status line names the next command for the current state: session just started → `/fw-coldstart`;
  STATE ≥3 commits behind → `/fw-record`; context running hot → `/fw-record → /clear → /fw-coldstart`;
  all healthy → silence.

## [0.8.0] — 2026-07-18

### Added

- **`npx flightwake init --statusline`** — a persistent gauge in Claude Code: health colour, STATE staleness,
  context usage. Never overwrites an existing status line.
- GSD migration guide in all four README editions.

## [0.7.2] — 2026-07-18

First public release. ✈️

### Added

- Open-sourced with gaps 1–7 closed: de-identification guard, superseded lifecycle, multi-platform install,
  `--private` local mode, `uninstall`, CI-side STATE check, monorepo policy.
- README in four languages (EN primary · 繁中 · 简中 · 日本語).
- Published via npm Trusted Publishing (OIDC + provenance).

## [0.7.1] — 2026-07-18

Initial npm publish; superseded within the day by 0.7.2.

[Unreleased]: https://github.com/kaiwutech-TW/flightwake/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.16.0
[0.15.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.15.0
[0.14.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.14.0
[0.13.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.13.0
[0.11.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.11.0
[0.10.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.10.0
[0.9.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.9.0
[0.8.2]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.8.2
[0.8.1]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.8.1
[0.8.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.8.0
[0.7.2]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.7.2
[0.7.1]: https://www.npmjs.com/package/flightwake/v/0.7.1
