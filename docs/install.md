# Installing flightwake

> 繁體中文版:[install.zh-TW.md](install.zh-TW.md) · Back to the [README](../README.md)

Everything about installing, upgrading and removing flightwake. The short version is in the README: `npx flightwake setup`.

## Guided install (`setup`)

```bash
cd your-repo
npx flightwake setup                # guided install: a few questions, shows every path it will write, installs after you confirm
```

`setup` needs a terminal. It checks git first (offering `git init` if the directory isn't a repo — default No, run only after the final confirmation), then asks language (preselected from your terminal locale — `LC_ALL`, then `LC_MESSAGES`, then `LANG`, the OS locale only when none of them is set; `C` / `POSIX` mean English — and shown with where it came from), agents (the detected ones if the folder already has CLAUDE.md / AGENTS.md / GEMINI.md; otherwise it asks which tools you use — pick one or more, nothing preselected), optional add-ons as one list (below) and repo type (code / notes), prints one summary line (`lang=… · agents=… · add-ons=… · profile=…`) so a wrong guess is easy to spot, lists every path it will write, and asks `Proceed? [Y/n]` — Enter installs; `n`, EOF or Ctrl-C writes nothing. It installs through the same path as `init`, then runs `doctor` and prints next steps. Flags you pass on the command line answer their question; `--private` is flag-only and is never asked.

**The add-on list** has fixed numbers — 1 bottom gauge, 2 Claude Code mod, 3 team roles, 4 Orca collaboration (rows that don't apply here are left out) — and your answer is the exact set you want: Enter keeps the ones marked `*`, typing numbers or names (`1 2`, `mod roles`) picks exactly those and nothing else, `0` picks none. With Claude Code among the agents, the mod is preselected unless `claude --version` reports a version older than 2.1.287 (the mod would never load). The bottom gauge is preselected only when neither you (`~/.claude/settings.json`) nor the repo already has a status line: it is written to the committed `.claude/settings.json`, so in this repo it replaces every teammate's own status line, and the row says so. Orca collaboration is preselected only when setup runs inside Orca (an `ORCA_*` environment variable is set); an `orca` program found only on PATH shows the row unmarked, because GNOME's screen reader is also called `orca`. Team roles are never preselected. Rows already installed are shown as `✓` and kept as they are.

**On a repo that already has flightwake**, setup changes neither language nor repo type (that is `update --lang=… / --profile=…`). If an add-on that applies here is not installed, it offers three choices: upgrade in place (the same as `npx flightwake update`), upgrade and add add-ons (only adds — your other options and your records are untouched; the same path as `update --statusline / --mod / --orca`), or leave it as it is (writes nothing, exit 0). When everything that applies is installed, it goes straight to the in-place upgrade.

## Non-interactive install (`init` / `update`)

**Non-interactive form** — `npx flightwake init [flags]` (a bare `npx flightwake` does the same) never asks anything: use it for automation, agents, CI, and when you already know what you want:

```bash
npx flightwake init --statusline    # English (default) + the bottom gauge
npx flightwake init --statusline --agents=claude,codex,agy   # three agents at once (Claude Code + Codex + Antigravity)
npx flightwake update               # upgrade an existing install in place (keeps your options: lang/statusline/private); ends with one line naming add-ons you don't have
npx flightwake update --mod         # upgrade and add the Claude Code mod (also --statusline, --orca)
```

`update` and `init` never ask. When an add-on that applies here is not installed, they end with one line naming it, plus `npx flightwake setup` (asks first, lists every path) or the direct command (`npx flightwake update --statusline / --mod / --orca`, `npx flightwake roles install`). Nothing is added automatically, and the line tells agents to ask the person before adding any; it is gone once everything that applies is installed. On a `--private` install, follow these `update` commands rather than `init` flags: `init` without `--private` would write the shared `.claude/settings.json`.

## Language

**Pick your language** (non-interactive form; `setup` asks it for you) — installed templates, skills, and all CLI/gauge output follow it. `setup` starts the language question on your terminal locale and shows what it read — Enter keeps it, a number changes it. `init` never guesses: the installed language is shared by everyone who clones the repo, so one person's terminal must not pick it. It installs English unless you pass `--lang`, and if your terminal locale says another language it prints the switch command (`npx flightwake update --lang=<x>`). Copy the line you want:

| Language | Fresh install | Already installed in another language |
|---|---|---|
| English | `npx flightwake init --statusline` | `npx flightwake update --lang=en` |
| 繁體中文 | `npx flightwake init --lang=zh-TW --statusline` | `npx flightwake update --lang=zh-TW` |
| 简体中文 | `npx flightwake init --lang=zh-CN --statusline` | `npx flightwake update --lang=zh-CN` |
| 日本語 | `npx flightwake init --lang=ja --statusline` | `npx flightwake update --lang=ja` |

Switching languages is safe: `update --lang=<x>` replaces only framework-owned files (templates, skills, hooks, the
marker block) and keeps your other options (private, gauge, add-ons, profile). Your STATE / DECISIONS / TRAPS / records are never touched — they stay in whatever language you
wrote them. Drop `--statusline` from a fresh-install line if you don't want the gauge. Add `--agents=claude,codex,agy,gemini` (any subset) to install for those agents explicitly — without it, init installs for whichever instruction files already exist (CLAUDE.md / AGENTS.md / GEMINI.md). Antigravity (`agy`) has no instruction file of its own, so name it once with `--agents`; after that `update` finds it from its hook.

**Don't hand-translate the installed files.** The marker records which language you installed, so the next
`update` refreshes them from that language's source and your edits disappear. Switch with `update --lang=<x>` instead;
if you already did hand-edit, init/update will now name each file it overwrote.

## What `init` writes

init creates `.flightwake/` (templates + Stop hook), copies 4 skills into `.claude/skills/`, merges the Stop hook into `.claude/settings.json`, and appends the trigger-obligation table (wrapped in `<!-- flightwake:begin/end -->` markers) to **detected agent instruction files** (CLAUDE.md / AGENTS.md / GEMINI.md — whichever exist; if none, it creates AGENTS.md; `--agents=claude,codex,agy,gemini` selects explicitly). **Each platform gets the same skills and hook in its own dialect**: Codex, Antigravity and Gemini CLI read the skills from `.agents/skills/fw-*`, the STATE check goes into `.codex/hooks.json` (Stop), `.agents/hooks.json` (Antigravity, Stop) or `.gemini/settings.json` (AfterAgent), and the table says `$fw-coldstart` to Codex, `/fw-coldstart` to Claude Code, and the bare skill name to Antigravity and Gemini. Claude Code and Codex also get the **trap check**: one `PreToolUse` entry (`.flightwake/hooks/trap-check.mjs`, with the shared `traps-core.mjs` next to it) that shows an active TRAPS entry when a call edits a file matching its `paths`, runs a command starting with one of its `commands`, or writes such a path through the shell. The hint reaches the agent with the tool result — it is for the next step, never a gate — and each entry is shown once per session, kept in a private folder outside the repo (`~/.flightwake/hints`, 0700; `FLIGHTWAKE_HOME` moves it). `FLIGHTWAKE_TRIPWIRE=off` silences it; in Claude Code the mod's `"tripwire": false` does too. Codex asks you to trust the repo hooks once on first run, and stops running a hook silently if its `hooks.json` entry is edited afterwards (`/hooks` then shows "needs review"), so `update` never rewrites those entries. Antigravity's hooks cannot add context, so it gets the trap entries with `paths` as rules instead: `.agents/rules/flightwake-trap-*.md` with `trigger: model_decision`, regenerated from TRAPS.md by `init` / `update` and `npx flightwake traps rules` (generated files carry a do-not-edit marker; your own rules are never touched). Antigravity asks once whether you trust the folder. Details per platform: [multi-agent.md](multi-agent.md). **Pure file copying, zero runtime dependencies** (Node ≥18 used only at install time and by the hooks). User data (STATE/DECISIONS/TRAPS) is never overwritten; `--force` only updates framework-owned files. `update` re-detects what you installed and refreshes it from the latest version.

## Options

**`--private`** keeps records **local-only, out of git**: every write is registered in `.git/info/exclude` (purely local — no trace left in the repo), the hook goes into `.claude/settings.local.json`, and the obligation table goes into `CLAUDE.local.md` (git-tracked instruction files are never touched). The cost: records aren't shared with the repo, and a fresh clone needs `init --private` again — "in git, shared with the repo" is flightwake's default and reason to exist; `--private` is the escape hatch for personal use inside someone else's repo.

**`doctor`** (`npx flightwake doctor`) is a read-only, no-network check of the install structure: git and git root, Node ≥18, `.flightwake/`, STATE (unfilled template fields are a warning), `latest_record`, marker blocks and their version/lang/profile consistency, skills, hook registration (valid JSON, exact command, correct event — Stop for Claude Code, Codex and Antigravity, AfterAgent for Gemini CLI — no duplicates, script exists), that `--private` excludes are actually in effect, and the status of optional add-ons. Each line is ok / warning / fail; exit code 1 on any failure. It verifies structure only, not that hooks fire at runtime (whether Codex trusts the hook path can't be checked — doctor prints a hint instead). Writes nothing.

**`--profile=code|notes`** (default `code`) picks the obligation table. `notes` is for repos that aren't code (writing, research, notes): it drops "tests green + typecheck clean", "prod verification evidence", and the schema/prod wrap-up trigger, and keeps cold start, decisions, traps, handoff, the ≥3-commit wrap-up, confirming destructive operations, and an honest STATE at session end. The same files are installed. The profile is stored in the marker (`profile=notes`); `update` keeps it, and `update --profile=code` switches back.

**`--orca`** (opt-in; also a `setup` list item, listed only when Orca is detected and preselected only when setup runs inside Orca) adds a marked block to each active platform's instruction file: use visible Orca tabs — not hidden background runs — for cross-agent discussion and review, plus a one-writer review protocol (the agent that was asked to review writes no record and doesn't touch STATE; the asker records the conclusions it adopts). `uninstall` removes it; `update` refreshes it where installed; `update --orca` adds it.

**`--mod`** (optional; offered by `setup` when Claude Code is selected and preselected if Claude Code is at least 2.1.287) installs `flightwake-mod` in `.claude/skills/flightwake-mod/`. Mod 0.5.0 has nine switches: STATE injection, a prompt band, a session flight log, TRAPS tripwire, role guard (off by default), API-equivalent cost, session Fleet, trip records and the side panel. `/fw-mod` shows their current state; `/fw-panel` opens the side panel with this repo's health, context and attention items. Inside Orca, the panel also groups Claude and Codex terminals by repo, with switch controls and a confirmed wrap-up action for idle agents. The panel opens only when requested and remembers that choice until closed. It requires Claude Code 2.1.287+, folder trust and a session started at the repo root. After a **new** mod install, restart Claude Code, then run `/fw-mod` to confirm it loaded. `update` refreshes an installed mod; `update --mod` adds it; `uninstall` removes shipped files while keeping user-added files. Details: [docs/mod.md](mod.md).

**`--git-init`** makes `init` create the git repo when the directory isn't one — explicit flag only; without it, init stops and tells you. Both `init` and `setup` check that git is installed first and print per-platform install hints if not.

**`uninstall`** reverses init's fixed write scope: removes the skills' and the framework's own files (only what it shipped — anything you added inside a skill folder, or a directory where a shipped file was, is kept and listed), extracts flightwake's Stop and PreToolUse hooks from settings (your other hooks stay untouched), and strips the marker blocks from instruction files and `.git/info/exclude` (files created by flightwake are deleted once emptied). **`.flightwake/` is user data and is kept by default**; only `uninstall --purge` deletes it too.

**Monorepo policy: one install per repo, at the git root.** Work is session-shaped — a session routinely spans multiple packages, and records follow the session; per-subdirectory installs would shred one stretch of work into fragmented records and turn "which STATE do I read?" into a new cold-start ambiguity. Running init in a subdirectory stops and points you to the root. Submodules have their own `.git` and count as independent repos. If a high-traffic multi-team monorepo sees false positives from the CI staleness check, tune `--threshold` first.

## Claude Code plugin

For Claude Code alone, flightwake also comes as a plugin from its own marketplace (this repository; the plugin itself is the
published npm package):

```
/plugin install flightwake --marketplace kaiwutech-TW/flightwake
```

The plugin carries the four skills in English, the wrap-up reminder (Stop) and the trap check (PreToolUse). It does not
create `.flightwake/` or the obligation table: run `npx flightwake init --plugin` once in each repo (`/fw-coldstart` offers
to when the folder is missing). `--plugin` writes `.flightwake/` and the table but skips `.claude/skills/` and the Claude
Code hooks, and the marker remembers it for `update`; Codex and Antigravity, if selected, are installed as usual. A repo
that also has the npx skills shows both copies in the skill list (the repo's copy answers `/fw-…`); the plugin's hooks stay
quiet there, so nothing is reminded twice, and `doctor` names the duplicate. The plugin has no other languages, no mod
and no add-ons — use `npx flightwake setup` for those.

## Migrating from GSD

Wrap up your current milestone first, then:

1. `npx flightwake init` — coexists with `.planning/`; nothing is deleted
2. Tell your agent: *"This repo is switching from GSD to flightwake. Read `.planning/` for the current state and initialize `.flightwake/STATE.md` with /fw-record — unfinished items go into the next-step entries. From now on `.planning/` is a historical archive; don't update it."*
3. Remove (or comment out) GSD's own instruction block from CLAUDE.md, so the two rulebooks don't compete for the model's obedience

## Status line (optional)

`npx flightwake init --statusline` puts a persistent gauge at the bottom of Claude Code:

```
✈️ flightwake │ ●green · STATE 2c behind │ ▓▓░░░░░░░░ 23%
```

Health color (the one thing you watch), STATE staleness (same rev-list logic as the Stop hook — but as a live gauge instead of an exit-time reminder), and context usage. The gauge also tells you **the next command for the current state** — session just started → `→ 開工先 /fw-coldstart`; STATE ≥3 commits behind → `→ /fw-record`; context running hot → `→ /fw-record → /clear → /fw-coldstart`; all healthy → silence. It never overwrites an existing statusline (a single-value setting), and repo-level config takes precedence over user-level, so it coexists with tools that set a global one.

Note: a plain `npx flightwake init` does **not** install the gauge — it's opt-in. Already ran init without it? `npx flightwake update --statusline` adds the gauge and keeps your other options (including `--private`); the bar appears in the next Claude Code session.

The gauge also tells you when a newer flightwake exists (`→ v0.9.1 available: npx flightwake update`) — shown only when nothing more urgent is up. The check is an anonymous GET to the npm registry at most once per 24h, cached in the OS temp dir, always in a background process (rendering never waits on the network). Opt out with `FLIGHTWAKE_NO_UPDATE_CHECK=1`.

## CI-side wrap-up check (optional)

The hook fires only inside Claude Code, Codex, Antigravity and Gemini CLI sessions; to extend the "STATE must not lag" discipline to other agents and human collaborators, run the same script in CI — it fails when STATE lags HEAD by ≥3 commits (tunable via `--threshold=N`):

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
