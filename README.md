<!-- Primary edition (English). Translations: README.zh-TW.md / README.zh-CN.md / README.ja.md — editing any edition obligates syncing the others. -->
# flightwake ✈️

> **Records are the contrail your work naturally leaves behind — not a flight plan you must file before takeoff.**

[![npm](https://img.shields.io/npm/v/flightwake)](https://www.npmjs.com/package/flightwake) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kaiwutech-TW/flightwake/badge)](https://scorecard.dev/viewer/?uri=github.com/kaiwutech-TW/flightwake)

🌐 **English** · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

An ultra-lightweight work-recording framework for strong AI coding agents (Claude Fable 5 generation and beyond). Zero runtime dependencies, pure Markdown, everything lives in git.

## Install

```bash
cd your-repo
npx flightwake init        # upgrade an existing install: add --force
```

init creates `.flightwake/` (templates + Stop hook), copies 4 skills into `.claude/skills/`, merges the Stop hook into `.claude/settings.json`, and appends the trigger-obligation table (wrapped in `<!-- flightwake:begin/end -->` markers) to **detected agent instruction files** (CLAUDE.md / AGENTS.md / GEMINI.md — whichever exist; if none, it creates AGENTS.md; `--agents=claude,codex,gemini` selects explicitly). **Pure file copying, zero runtime dependencies** (Node ≥18 used only at install time and by the hook). User data (STATE/DECISIONS/TRAPS) is never overwritten; `--force` only updates framework-owned files.

> Note: the CLI output and the installed templates/skills are currently in Traditional Chinese (the team dogfooding it works in zh-TW). Full English defaults are planned — the framework mechanics are language-independent, and your agent reads either just fine.

## How to use

### Right after the first install

1. Open a Claude Code session and say "**initialize STATE with /fw-record**" — the model writes the repo's current situation into the first STATE
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

Forgot to wrap up? When STATE lags ≥3 commits, the Stop hook blocks once before the session ends to remind you; `--ci` brings the same gate to other agents and human collaborators. For multi-session construction, say "handoff" before stopping so the model runs `/fw-handoff`.

### The only thing you need to watch

Whether STATE's health is honest (green/yellow/red). The framework has a single quality metric: **how long a fresh session needs to take over safely** (>5 minutes = your records are degrading). Everything else — record count, format compliance — doesn't matter.

### See what it actually looks like

This repo dogfoods its own framework: [`.flightwake/`](.flightwake/) contains the real STATE, DECISIONS, and records — every step from the gap list to the open-source launch is recorded there. That's exactly what will grow in your repo after installing.

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
├── .claude/skills/fw-*/     # the four skills
└── .claude/settings.json    # init merges the Stop hook config here
```

The skills and Stop hook are convenience sugar for Claude Code; `.flightwake/` itself is plain Markdown — any agent that reads the instruction file can follow the same trigger obligations. Coexists with an existing GSD `.planning/` (old records become historical archives).

## Advanced install

**`--private`** keeps records **local-only, out of git**: every write is registered in `.git/info/exclude` (purely local — no trace left in the repo), the hook goes into `.claude/settings.local.json`, and the obligation table goes into `CLAUDE.local.md` (git-tracked instruction files are never touched). The cost: records aren't shared with the repo, and a fresh clone needs `init --private` again — "in git, shared with the repo" is flightwake's default and reason to exist; `--private` is the escape hatch for personal use inside someone else's repo.

**`uninstall`** reverses init's fixed write scope: removes the skills and framework files, extracts flightwake's Stop hook from settings (your other hooks stay untouched), and strips the marker blocks from instruction files and `.git/info/exclude` (files created by flightwake are deleted once emptied). **`.flightwake/` is user data and is kept by default**; only `uninstall --purge` deletes it too.

**Monorepo policy: one install per repo, at the git root.** Work is session-shaped — a session routinely spans multiple packages, and records follow the session; per-subdirectory installs would shred one stretch of work into fragmented records and turn "which STATE do I read?" into a new cold-start ambiguity. Running init in a subdirectory stops and points you to the root. Submodules have their own `.git` and count as independent repos. If a high-traffic multi-team monorepo sees false positives from the CI staleness check, tune `--threshold` first.

### Migrating from GSD

Wrap up your current milestone first, then:

1. `npx flightwake init` — coexists with `.planning/`; nothing is deleted
2. Tell your agent: *"This repo is switching from GSD to flightwake. Read `.planning/` for the current state and initialize `.flightwake/STATE.md` with /fw-record — unfinished items go into the next-step entries. From now on `.planning/` is a historical archive; don't update it."*
3. Remove (or comment out) GSD's own instruction block from CLAUDE.md, so the two rulebooks don't compete for the model's obedience

### CI-side wrap-up check (optional)

The Stop hook only works inside Claude Code; to extend the "STATE must not lag" discipline to other agents and human collaborators, run the same script in CI — it fails when STATE lags HEAD by ≥3 commits (tunable via `--threshold=N`):

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

**Claude Code memory**: persistent memory has the same shape as flightwake (frontmatter + `[[links]]`) but lives on a different layer — memory is single-machine, single-person; flightwake's files go into git and travel with the repo to teammates, CI, and any agent. Repo facts (traps, decisions, state) go to flightwake; personal preferences and cross-project habits go to memory. Never write the same fact in both places.

**[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)**: OKF manages the **knowledge layer** (system facts: schemas, metric definitions, code mappings); flightwake manages the **process layer** (what happened, why, where we are now). flightwake's knowledge-shaped artifacts adopt OKF conventions (YAML frontmatter + `[[links]]`) — naturally compatible on the shared "plain Markdown + frontmatter" substrate.

## Security

- **Zero dependencies, no network, no install scripts**: the installer only copies files; the hook only uses `git` (no shell) for read-only queries.
- **Fixed write scope**: `init` only touches `.flightwake/`, `.claude/skills/fw-*`, `.claude/settings.json`, and the marker blocks inside agent instruction files; with `--private` it instead touches `.claude/settings.local.json`, `CLAUDE.local.md`, and the marker block in `.git/info/exclude`. `uninstall` reverses the same scope.
- **The hook lives in git**: `.flightwake/hooks/state-check.mjs` is a file in your repo — anyone who can commit can change it, same trust level as all repo-local config; Claude Code asks for confirmation when loading it.
- Vulnerability reports: see [SECURITY.md](SECURITY.md). Published to npm via Trusted Publishing (with provenance); verify with `npm audit signatures`.

## Status

🚧 v0.x — actively dogfooded; conventions may still evolve (append-only files carry a `superseded` lifecycle, and read-side tolerance keeps old installs working).

## License

[MIT](LICENSE)
