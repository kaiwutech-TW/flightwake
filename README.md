<!-- Primary edition (English). Translations: README.zh-TW.md / README.zh-CN.md / README.ja.md — editing any edition obligates syncing the others. -->
# flightwake ✈️

> **Records are the contrail your work naturally leaves behind — not a flight plan you must file before takeoff.**

[![npm](https://img.shields.io/npm/v/flightwake)](https://www.npmjs.com/package/flightwake) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kaiwutech-TW/flightwake/badge)](https://scorecard.dev/viewer/?uri=github.com/kaiwutech-TW/flightwake)

🌐 **English** · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[Explore the illustrated website](https://flightwake.kaiwu.com.tw/en/) for the four-language overview and a real Orca multi-agent case study. [Website source](website/).

An ultra-lightweight work-recording framework for strong AI coding agents (Claude Fable 5 generation and beyond). Zero runtime dependencies, pure Markdown, everything lives in git.

![A real cold start on this repo: /fw-coldstart reads STATE + the latest record and reports a safe takeover in ~30 seconds](https://raw.githubusercontent.com/kaiwutech-TW/flightwake/main/docs/demo.gif)

*A real cold start on this very repo (recorded live, zh-TW install): one command, two file reads, and a fresh session reports exactly where the last one left off.*

## Install

```bash
cd your-repo
npx flightwake setup                # guided install: a few questions, shows every path it will write, installs after you confirm
```

`setup` needs a terminal. It checks git first (offering `git init` if the directory isn't a repo — default No, run only after the final confirmation), then asks language (preselected from your terminal locale — `LC_ALL`, then `LC_MESSAGES`, then `LANG`, the OS locale only when none of them is set; `C` / `POSIX` mean English — and shown with where it came from), agents (the detected ones if the folder already has CLAUDE.md / AGENTS.md / GEMINI.md; otherwise it asks which tools you use — pick one or more, nothing preselected), optional add-ons as one list (below) and repo type (code / notes), prints one summary line (`lang=… · agents=… · add-ons=… · profile=…`) so a wrong guess is easy to spot, lists every path it will write, and asks `Proceed? [Y/n]` — Enter installs; `n`, EOF or Ctrl-C writes nothing. It installs through the same path as `init`, then runs `doctor` and prints next steps. Flags you pass on the command line answer their question; `--private` is flag-only and is never asked.

**The add-on list** has fixed numbers — 1 bottom gauge, 2 Claude Code mod, 3 team roles, 4 Orca collaboration (rows that don't apply here are left out) — and your answer is the exact set you want: Enter keeps the ones marked `*`, typing numbers or names (`1 2`, `mod roles`) picks exactly those and nothing else, `0` picks none. With Claude Code among the agents, the mod is preselected unless `claude --version` reports a version older than 2.1.287 (the mod would never load). The bottom gauge is preselected only when neither you (`~/.claude/settings.json`) nor the repo already has a status line: it is written to the committed `.claude/settings.json`, so in this repo it replaces every teammate's own status line, and the row says so. Orca collaboration is preselected only when setup runs inside Orca (an `ORCA_*` environment variable is set); an `orca` program found only on PATH shows the row unmarked, because GNOME's screen reader is also called `orca`. Team roles are never preselected. Rows already installed are shown as `✓` and kept as they are.

**On a repo that already has flightwake**, setup changes neither language nor repo type (that is `update --lang=… / --profile=…`). If an add-on that applies here is not installed, it offers three choices: upgrade in place (the same as `npx flightwake update`), upgrade and add add-ons (only adds — your other options and your records are untouched; the same path as `update --statusline / --mod / --orca`), or leave it as it is (writes nothing, exit 0). When everything that applies is installed, it goes straight to the in-place upgrade.

**Non-interactive form** — `npx flightwake init [flags]` (a bare `npx flightwake` does the same) never asks anything: use it for automation, agents, CI, and when you already know what you want:

```bash
npx flightwake init --statusline    # English (default) + the bottom gauge
npx flightwake init --statusline --agents=claude,codex,gemini   # all three agents at once (Claude Code + Codex + Gemini CLI)
npx flightwake update               # upgrade an existing install in place (keeps your options: lang/statusline/private); ends with one line naming add-ons you don't have
npx flightwake update --mod         # upgrade and add the Claude Code mod (also --statusline, --orca)
```

`update` and `init` never ask. When an add-on that applies here is not installed, they end with one line naming it, plus `npx flightwake setup` (asks first, lists every path) or the direct command (`npx flightwake update --statusline / --mod / --orca`, `npx flightwake roles install`). Nothing is added automatically, and the line tells agents to ask the person before adding any; it is gone once everything that applies is installed. On a `--private` install, follow these `update` commands rather than `init` flags: `init` without `--private` would write the shared `.claude/settings.json`.

**Pick your language** (non-interactive form; `setup` asks it for you) — installed templates, skills, and all CLI/gauge output follow it. `setup` starts the language question on your terminal locale and shows what it read — Enter keeps it, a number changes it. `init` never guesses: the installed language is shared by everyone who clones the repo, so one person's terminal must not pick it. It installs English unless you pass `--lang`, and if your terminal locale says another language it prints the switch command (`npx flightwake update --lang=<x>`). Copy the line you want:

| Language | Fresh install | Already installed in another language |
|---|---|---|
| English | `npx flightwake init --statusline` | `npx flightwake update --lang=en` |
| 繁體中文 | `npx flightwake init --lang=zh-TW --statusline` | `npx flightwake update --lang=zh-TW` |
| 简体中文 | `npx flightwake init --lang=zh-CN --statusline` | `npx flightwake update --lang=zh-CN` |
| 日本語 | `npx flightwake init --lang=ja --statusline` | `npx flightwake update --lang=ja` |

Switching languages is safe: `update --lang=<x>` replaces only framework-owned files (templates, skills, hooks, the
marker block) and keeps your other options (private, gauge, add-ons, profile). Your STATE / DECISIONS / TRAPS / records are never touched — they stay in whatever language you
wrote them. Drop `--statusline` from a fresh-install line if you don't want the gauge. Add `--agents=claude,codex,gemini` (any subset) to install for those agents explicitly — without it, init installs for whichever instruction files already exist (CLAUDE.md / AGENTS.md / GEMINI.md).

**Don't hand-translate the installed files.** The marker records which language you installed, so the next
`update` refreshes them from that language's source and your edits disappear. Switch with `update --lang=<x>` instead;
if you already did hand-edit, init/update will now name each file it overwrote.

init creates `.flightwake/` (templates + Stop hook), copies 4 skills into `.claude/skills/`, merges the Stop hook into `.claude/settings.json`, and appends the trigger-obligation table (wrapped in `<!-- flightwake:begin/end -->` markers) to **detected agent instruction files** (CLAUDE.md / AGENTS.md / GEMINI.md — whichever exist; if none, it creates AGENTS.md; `--agents=claude,codex,gemini` selects explicitly). **Each detected platform gets the same skills and hook in its own dialect**: Codex and Gemini CLI read the skills from `.agents/skills/fw-*`, the STATE check goes into `.codex/hooks.json` (Stop) or `.gemini/settings.json` (AfterAgent), and the table says `$fw-coldstart` to Codex, `/fw-coldstart` to Claude Code, and the bare skill name to Gemini. Codex asks you to trust the repo hook once on first run. **Pure file copying, zero runtime dependencies** (Node ≥18 used only at install time and by the hooks). User data (STATE/DECISIONS/TRAPS) is never overwritten; `--force` only updates framework-owned files. `update` re-detects what you installed and refreshes it from the latest version.

## How to use

### Right after the first install

1. Open an agent session in the repo and run `/fw-coldstart` — it notices STATE is still the unfilled template and writes the first STATE from the repo itself (health is never guessed green: it is yellow until something was actually verified)
2. `git add .flightwake .claude CLAUDE.md && git commit`
3. Every session after that follows the daily loop below

### The daily loop

You (and the model) only need to remember one thing: **start work with `/fw-coldstart`; the model triggers every other obligation itself** — the obligation table is already in the instruction file, and strong models both read it and honor it. A typical session:

```text
You:   /fw-coldstart
Model: (reads STATE + the latest record, ~1 minute)
       "Last session got to X, health green, next entry point is Y.
        Unverified changes: none. Pick up from Y?"
You:   Yes, go
Model: (starts working directly. Makes a decision that closes off options →
        one line appended to DECISIONS; hits a non-obvious trap → /fw-trap)
You:   Wrap up
Model: (/fw-record: writes the flight record, updates STATE, runs the
        sensitive-info self-check)
```

Forgot to wrap up? When STATE lags ≥3 commits, the Stop hook blocks once before the session ends to remind you (it also nags when STATE claims health=green but the latest record carries no test evidence); `--ci` brings the same gate to other agents and human collaborators. Honest edges of the net: the lag counts *human* commits only — bot commits (`dependabot[bot]`, `renovate[bot]`, …) are excluded, because a dependency bump never makes STATE wrong and the bot's own PR could never satisfy the gate. A session that commits nothing (research, ops work) or a squash/rebase flow slips under it — the net catches forgetting; it doesn't replace the session-end obligation. For multi-session construction, say "handoff" before stopping so the model runs `/fw-handoff`.

### The only thing you need to watch

Whether STATE's health is honest (green/yellow/red). The framework has a single quality metric: **how long it takes a fresh session to reach a safe takeover after `/fw-coldstart`** — if that takes more than 5 minutes, your records are degrading. Everything else — record count, format compliance — doesn't matter.

When that light comes on, you don't do the maintenance yourself. Say: *"this cold start took X minutes — diagnose what's slow and compact."* The model comes back with a diagnosis (STATE too long? last session never wrapped up? stale TRAPS/DECISIONS entries?) and an item-by-item plan — which entries to mark superseded and why, which to merge — and you approve with one word. Facts work better than pressure: "over 5 minutes means the next session will fumble the takeover" is a prompt the model can reason about; "this is serious!" is not.

### See what it actually looks like

This repo dogfoods its own framework: [`.flightwake/`](.flightwake/) contains the real STATE, DECISIONS, and records — every step from the gap list to the open-source launch is recorded there. That's exactly what will grow in your repo after installing.

### Stage-by-stage playbook

New to working with a strong model? [docs/workflow.md](docs/workflow.md) is a stage map of what **you** do and what to say to the model at each point — beginner main line, advanced folds for Claude Code veterans. (繁體中文版:[workflow.zh-TW.md](docs/workflow.zh-TW.md))

Using more than one model on the same repo? [docs/multi-agent.md](docs/multi-agent.md) shows how Claude Code, Codex, and Gemini CLI share one `.flightwake/` — what init installs for each, how to invoke the skills in each tool, and the wrap-up → commit → cold-start loop that makes the handover identical whichever model wrote last. (繁體中文版:[multi-agent.zh-TW.md](docs/multi-agent.zh-TW.md))

Running a team of agents (a project manager, a tech lead, a coder, a reviewer)? [docs/roles.md](docs/roles.md) covers `flightwake roles` (opt-in, v0.14.0+): the agent recommends a set of roles for your project, you preview and customize them, and each role is written into the instruction file its agent re-reads at every session start — so nobody forgets their job after `/clear`, across repos if your team spans several. (繁體中文:[roles.zh-TW.md](docs/roles.zh-TW.md) · 简体中文:[roles.zh-CN.md](docs/roles.zh-CN.md) · 日本語:[roles.ja.md](docs/roles.ja.md))

## Why this project exists

A Fable 5-class model doesn't need to be taught how to do the work — but there are four things no model can do however strong it gets, because they are **structural** and don't disappear as models improve:

1. **Sessions die; context is finite.** When work spans sessions, memory resets to zero; without records, every takeover is a git archaeology dig — a strong model just digs faster, it doesn't get to skip the dig.
2. **Git records the what, not the why.** Commits tell you what changed, never "why the other path wasn't taken" or "the root cause of that trap" — which happen to be the two most expensive pieces of information for the next session (or the next agent).
3. **Discipline drifts in long sessions.** "Reported done before the tests ran", "touched prod without leaving verification evidence" — these slides have nothing to do with model intelligence and need guards outside the model.
4. **Agents don't share state.** Claude, Codex, Gemini, and human teammates each see their own world; state only becomes everyone's once it's in git.

So flightwake supplements **persistence and discipline, not intelligence**. Its ancestor in spirit is GSD: GSD is **navigation** (turn-by-turn guidance for every step); flightwake is a **dashcam + warning lights + road signs** — strong models drive themselves, so the framework only does three things:

1. **Dashcam**: decisions, discoveries, verification evidence, recorded after the fact (`records/`, `DECISIONS.md`, `TRAPS.md`)
2. **Warning lights**: hard guards independent of model strength (tests green before "done", prod changes must leave verification evidence, destructive operations need confirmation first)
3. **Road signs**: any session can die; the next session reads `STATE.md` and takes over safely within 2 minutes

The origin was a real three-day session (2026-07-15~17: two repos, 19 commits, 4 cron jobs, 2 deep bug fixes — no upfront planning, zero derailment). It proved a strong model needs no navigation — but everything it left behind to make the next session possible (SUMMARY/CONTEXT/memory files) was improvised on the spot. flightwake turns that improvisation into an installable convention.

## Core principle: records follow work — they don't lead it

GSD is **stage-driven** (research→plan→execute→verify gates); flightwake is **trigger-driven** (events create obligations):

| Trigger event | Obligation | Tool |
|---|---|---|
| Starting to touch a repo | Read STATE + the latest record first | `/fw-coldstart` |
| Making a decision that closes off other options | One line into DECISIONS (append-only, with the why) | write directly |
| Hitting a non-obvious trap | One entry into TRAPS | `/fw-trap` |
| Touching schema / touching prod / ~3+ commits | Wrap up with a record | `/fw-record` |
| Work will span sessions | Write handoff/CONTEXT **before stopping** (not before starting) | `/fw-handoff` |
| Session about to close | Update STATE's position and next-step entry point | part of `/fw-record` |

**Escalation rule (the opposite of GSD)**: by default everything is quick — just start working; only "construction spanning multiple sessions" escalates to a phase (one CONTEXT file; plan decomposition is left to the model's in-the-moment judgment).

## File layout (after installing into a target repo)

```
your-repo/
├── .flightwake/
│   ├── STATE.md             # where we are now, next-step entry (always short, always current)
│   ├── DECISIONS.md         # append-only decision log (one line per decision, with the why)
│   ├── TRAPS.md             # trap registry (OKF-style frontmatter entries)
│   ├── TEMPLATE-record.md   # flight-record template
│   ├── hooks/state-check.mjs  # Stop hook: reminds you to wrap up when STATE lags ≥3 commits
│   └── records/             # flight records (one per meaningful wrap-up)
├── .claude/skills/fw-*/     # the four skills (Claude Code)
├── .claude/settings.json    # init merges the Stop hook config here
├── .agents/skills/fw-*/     # the same four skills for Codex / Gemini CLI (only when AGENTS.md / GEMINI.md is detected)
├── .codex/hooks.json        # Codex Stop hook (only when AGENTS.md is detected)
└── .gemini/settings.json    # Gemini CLI AfterAgent hook (only when GEMINI.md is detected)
```

The skills and hooks are convenience sugar per platform — the same four skills and the same check script, installed where Claude Code, Codex, and Gemini CLI each look for them; `.flightwake/` itself is plain Markdown in git, so every agent (and every human) reads and writes the same state. Any other agent that reads the instruction file can follow the same trigger obligations by hand. Coexists with an existing GSD `.planning/` (old records become historical archives).

## Advanced install

**`--private`** keeps records **local-only, out of git**: every write is registered in `.git/info/exclude` (purely local — no trace left in the repo), the hook goes into `.claude/settings.local.json`, and the obligation table goes into `CLAUDE.local.md` (git-tracked instruction files are never touched). The cost: records aren't shared with the repo, and a fresh clone needs `init --private` again — "in git, shared with the repo" is flightwake's default and reason to exist; `--private` is the escape hatch for personal use inside someone else's repo.

**`doctor`** (`npx flightwake doctor`) is a read-only, no-network check of the install structure: git and git root, Node ≥18, `.flightwake/`, STATE (unfilled template fields are a warning), `latest_record`, marker blocks and their version/lang/profile consistency, skills, hook registration (valid JSON, exact command, correct event — Stop for Claude Code/Codex, AfterAgent for Gemini CLI — no duplicates, script exists), that `--private` excludes are actually in effect, and the status of optional add-ons. Each line is ok / warning / fail; exit code 1 on any failure. It verifies structure only, not that hooks fire at runtime (whether Codex trusts the hook path can't be checked — doctor prints a hint instead). Writes nothing.

**`--profile=code|notes`** (default `code`) picks the obligation table. `notes` is for repos that aren't code (writing, research, notes): it drops "tests green + typecheck clean", "prod verification evidence", and the schema/prod wrap-up trigger, and keeps cold start, decisions, traps, handoff, the ≥3-commit wrap-up, confirming destructive operations, and an honest STATE at session end. The same files are installed. The profile is stored in the marker (`profile=notes`); `update` keeps it, and `update --profile=code` switches back.

**`--orca`** (opt-in; also a `setup` list item, listed only when Orca is detected and preselected only when setup runs inside Orca) adds a marked block to each active platform's instruction file: use visible Orca tabs — not hidden background runs — for cross-agent discussion and review, plus a one-writer review protocol (the agent that was asked to review writes no record and doesn't touch STATE; the asker records the conclusions it adopts). `uninstall` removes it; `update` refreshes it where installed; `update --orca` adds it.

**`--mod`** (optional; offered by `setup` when Claude Code is selected and preselected if Claude Code is at least 2.1.287) installs `flightwake-mod` in `.claude/skills/flightwake-mod/`. Mod 0.3.0 has eight switches: STATE injection, a prompt band, a session flight log, TRAPS tripwire, role guard (off by default), API-equivalent cost, session Fleet, and the side panel. `/fw-mod` shows their current state; `/fw-panel` opens the side panel with this repo's health, context and attention items. Inside Orca, the panel also groups Claude and Codex terminals by repo, with switch controls and a confirmed wrap-up action for idle agents. The panel opens only when requested and remembers that choice until closed. It requires Claude Code 2.1.287+, folder trust and a session started at the repo root. After a **new** mod install, restart Claude Code, then run `/fw-mod` to confirm it loaded. `update` refreshes an installed mod; `update --mod` adds it; `uninstall` removes shipped files while keeping user-added files. Details: [docs/mod.md](docs/mod.md).

**`--git-init`** makes `init` create the git repo when the directory isn't one — explicit flag only; without it, init stops and tells you. Both `init` and `setup` check that git is installed first and print per-platform install hints if not.

**`uninstall`** reverses init's fixed write scope: removes the skills' and the framework's own files (only what it shipped — anything you added inside a skill folder, or a directory where a shipped file was, is kept and listed), extracts flightwake's Stop hook from settings (your other hooks stay untouched), and strips the marker blocks from instruction files and `.git/info/exclude` (files created by flightwake are deleted once emptied). **`.flightwake/` is user data and is kept by default**; only `uninstall --purge` deletes it too.

**Monorepo policy: one install per repo, at the git root.** Work is session-shaped — a session routinely spans multiple packages, and records follow the session; per-subdirectory installs would shred one stretch of work into fragmented records and turn "which STATE do I read?" into a new cold-start ambiguity. Running init in a subdirectory stops and points you to the root. Submodules have their own `.git` and count as independent repos. If a high-traffic multi-team monorepo sees false positives from the CI staleness check, tune `--threshold` first.

### Migrating from GSD

Wrap up your current milestone first, then:

1. `npx flightwake init` — coexists with `.planning/`; nothing is deleted
2. Tell your agent: *"This repo is switching from GSD to flightwake. Read `.planning/` for the current state and initialize `.flightwake/STATE.md` with /fw-record — unfinished items go into the next-step entries. From now on `.planning/` is a historical archive; don't update it."*
3. Remove (or comment out) GSD's own instruction block from CLAUDE.md, so the two rulebooks don't compete for the model's obedience

### Status line (optional)

`npx flightwake init --statusline` puts a persistent gauge at the bottom of Claude Code:

```
✈️ flightwake │ ●green · STATE 2c behind │ ▓▓░░░░░░░░ 23%
```

Health color (the one thing you watch), STATE staleness (same rev-list logic as the Stop hook — but as a live gauge instead of an exit-time reminder), and context usage. The gauge also tells you **the next command for the current state** — session just started → `→ 開工先 /fw-coldstart`; STATE ≥3 commits behind → `→ /fw-record`; context running hot → `→ /fw-record → /clear → /fw-coldstart`; all healthy → silence. It never overwrites an existing statusline (a single-value setting), and repo-level config takes precedence over user-level, so it coexists with tools that set a global one.

Note: a plain `npx flightwake init` does **not** install the gauge — it's opt-in. Already ran init without it? `npx flightwake update --statusline` adds the gauge and keeps your other options (including `--private`); the bar appears in the next Claude Code session.

The gauge also tells you when a newer flightwake exists (`→ v0.9.1 available: npx flightwake update`) — shown only when nothing more urgent is up. The check is an anonymous GET to the npm registry at most once per 24h, cached in the OS temp dir, always in a background process (rendering never waits on the network). Opt out with `FLIGHTWAKE_NO_UPDATE_CHECK=1`.

### CI-side wrap-up check (optional)

The hook fires only inside Claude Code, Codex, and Gemini CLI sessions; to extend the "STATE must not lag" discipline to other agents and human collaborators, run the same script in CI — it fails when STATE lags HEAD by ≥3 commits (tunable via `--threshold=N`):

```yaml
# .github/workflows/flightwake.yml (example; pin actions to SHAs per your repo's conventions)
name: flightwake
on: [push, pull_request]
permissions:
  contents: read
jobs:
  state-fresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # rev-list needs full history to count the lag
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: node .flightwake/hooks/state-check.mjs --ci
```

flightwake will not write a workflow into your repo — `.github/workflows/` is permission-sensitive and outside the "fixed write scope" promise; copy the example yourself.

## Boundaries with neighboring systems

**Claude Code memory**: persistent memory has the same shape as flightwake (frontmatter + `[[links]]`) but lives on a different layer — memory is single-machine, single-person; flightwake's files go into git and travel with the repo to teammates, CI, and any agent. Repo facts (traps, decisions, state) go to flightwake; personal preferences and cross-project habits go to memory. Never write the same fact in both places — with one deliberate exception: a trap that isn't repo-specific (platform/language layer) lives in both, because the repo's registry must stay self-contained while your other repos need the warning too (one copy per scope is division of labor, not duplication).

**[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)**: OKF manages the **knowledge layer** (system facts: schemas, metric definitions, code mappings); flightwake manages the **process layer** (what happened, why, where we are now). flightwake's knowledge-shaped artifacts adopt OKF conventions (YAML frontmatter + `[[links]]`) — naturally compatible on the shared "plain Markdown + frontmatter" substrate.

## Security

- **Zero dependencies, no network, no install scripts**: the installer only copies files; the hook only uses `git` (no shell) for read-only queries.
- **Fixed write scope**: `init` only touches `.flightwake/`, `.claude/skills/fw-*`, `.claude/settings.json`, the marker blocks inside agent instruction files (including the Orca block, only when you opted in), `~/.flightwake/registry.json` (init/update write it; uninstall removes this repo's entry), `.claude/skills/fw-roles` / `.agents/skills/fw-roles` (only when you opted into roles), `.claude/skills/flightwake-mod/` (only when you opted into the mod; `uninstall` removes the shipped files and keeps anything you added there, and with `--private` it is added to the exclude block), and — when Codex / Gemini CLI is detected — `.agents/skills/fw-*`, `.codex/hooks.json`, `.gemini/settings.json`; with `--private` it instead touches `.claude/settings.local.json`, `CLAUDE.local.md`, and the marker block in `.git/info/exclude` (the Codex/Gemini files are written only while untracked, and excluded). `uninstall` reverses the same scope. Nothing is ever written through a symlink or outside the repo: the install is checked first, and if any required path would be refused it stops before writing anything and names the path (exit 1). Files are replaced via a temp file + rename, never overwritten in place; uninstall and the roles commands follow the same rules. `--private` refuses up front if privacy can't take effect (something it must exclude is already tracked, or `.git/info/exclude` can't be written). `doctor` writes nothing — when the mod is installed it also runs `claude --version` (read-only). The one exception to "only copies files" is `git init`: it runs only after you confirm it in `setup`'s final summary, or when you pass `--git-init`.
- **The hook lives in git**: `.flightwake/hooks/state-check.mjs` is a file in your repo — anyone who can commit can change it, same trust level as all repo-local config; Claude Code asks for confirmation when loading it, and Codex records a trust hash per hook definition and re-asks whenever it changes.
- Vulnerability reports: see [SECURITY.md](SECURITY.md). Published to npm via Trusted Publishing (with provenance); verify with `npm audit signatures`.

## Status

🚧 v0.x — actively dogfooded; conventions may still evolve (append-only files carry a `superseded` lifecycle, and read-side tolerance keeps old installs working).

## License

[MIT](LICENSE)
