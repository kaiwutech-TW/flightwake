<!-- English edition. 中文版:README.md(flip 日對調:本檔改名 README.md,中文版改 README.zh-TW.md)。兩版同步義務:改一邊必改另一邊。 -->
# flightwake ✈️

> **Records are the contrail your work naturally leaves behind — not a flight plan you must file before takeoff.**

An ultra-lightweight work-recording framework for strong AI coding agents (Claude Fable 5 generation and beyond).
Its ancestor in spirit is GSD: GSD is **navigation** (turn-by-turn guidance for every step the model takes); flightwake is a **dashcam + warning lights + road signs** — strong models drive themselves, so the framework only does three things:

1. **Dashcam**: decisions, discoveries, verification evidence, recorded after the fact (`records/`, `DECISIONS.md`, `TRAPS.md`)
2. **Warning lights**: hard guards independent of model strength (tests green before "done", prod changes must leave verification evidence, destructive operations need confirmation first)
3. **Road signs**: any session can die; the next session reads `STATE.md` and takes over safely within 2 minutes

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

**The single quality metric: cold-start cost.** Not document count, not process compliance — how long a fresh session needs to take over safely. Over 5 minutes = record quality has degraded.

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

## Division of labor with Claude Code memory

Claude Code's persistent memory (the memory directory) has the same shape as flightwake (frontmatter + `[[links]]`) but lives on a different layer:
**memory is single-machine, single-person; flightwake's files go into git and travel with the repo — to teammates, CI, and any agent.**
The rule: repo facts (traps, decisions, state) go to flightwake; personal preferences and cross-project habits go to memory. Never write the same fact in both places.

## Relationship to OKF (layered, not competing)

[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf) manages the **knowledge layer** (system facts: schemas, metric definitions, code mappings); flightwake manages the **process layer** (what happened, why, where we are now). flightwake's knowledge-shaped artifacts (TRAPS, domain facts) adopt OKF conventions: YAML frontmatter (`type`/`tags`/`timestamp`) + `[[links]]` — the two are naturally compatible on the shared "plain Markdown + frontmatter" substrate. OKF's catalog-generation machinery (reference agent) suits standalone knowledge-curation work and is out of scope here.

## Install

```bash
cd your-repo
npx flightwake init        # upgrade an existing install: add --force
```

init will: create `.flightwake/` (templates + Stop hook), copy the 4 skills into `.claude/skills/`, merge the Stop hook into `.claude/settings.json`, and append the trigger-obligation table (wrapped in `<!-- flightwake:begin/end -->` markers) to **detected agent instruction files** (CLAUDE.md / AGENTS.md / GEMINI.md — whichever exist; if none exist it creates AGENTS.md, the widest-compatibility de-facto standard; `--agents=claude,codex,gemini` selects explicitly, creating files as needed).

`--private` keeps records **local-only, out of git**: every write is registered in `.git/info/exclude` (purely local — no trace left in the repo), the hook goes into `.claude/settings.local.json`, and the obligation table goes into `CLAUDE.local.md` (git-tracked instruction files are never touched). The cost: records aren't shared with the repo, and a fresh clone needs `init --private` again — "in git, shared with the repo" is flightwake's default and reason to exist; `--private` is the escape hatch for personal use inside someone else's repo.

`uninstall` reverses init's fixed write scope: removes the skills and framework files, extracts flightwake's Stop hook from settings (your other hooks stay untouched), and strips the marker blocks from instruction files and `.git/info/exclude` (files created by flightwake are deleted once emptied). **`.flightwake/` (STATE/DECISIONS/TRAPS/records) is user data and is kept by default**; only `uninstall --purge` deletes it too.

**Monorepo policy: one install per repo, at the git root.** Work is session-shaped — a session routinely spans multiple packages, and records follow the session; per-subdirectory installs would shred one stretch of work into fragmented records and turn "which STATE do I read?" into a new cold-start ambiguity. Running init in a subdirectory stops and points you to the root. Submodules have their own `.git` and count as independent repos. If a high-traffic multi-team monorepo sees false positives from the CI staleness check, tune `--threshold` first; per-subdirectory installs will be reconsidered when a real need shows up.

The skills and Stop hook are convenience sugar for Claude Code; `.flightwake/` itself is plain Markdown — any agent that reads the instruction file can follow the same trigger obligations. **Pure file copying, zero runtime dependencies** (Node ≥18 used only at install time and by the hook) — coexists with an existing GSD `.planning/` (old records become historical archives). User data (STATE/DECISIONS/TRAPS) is never overwritten under any circumstances; `--force` only updates framework-owned skills/hook/templates/snippets.

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

## Security

- **Zero dependencies, no network, no install scripts**: the installer only copies files; the hook only uses `git` (no shell) for read-only queries.
- **Fixed write scope**: `init` only touches `.flightwake/`, `.claude/skills/fw-*`, `.claude/settings.json`, and the marker blocks inside agent instruction files (CLAUDE.md / AGENTS.md / GEMINI.md); with `--private` it instead touches `.claude/settings.local.json`, `CLAUDE.local.md`, and the `# flightwake:begin/end` marker block in `.git/info/exclude`. `uninstall` reverses the same scope and never touches `.flightwake/` user data by default (`--purge` to delete).
- **The hook lives in git**: `.flightwake/hooks/state-check.mjs` is a file in your repo — anyone who can commit can change it, same trust level as all repo-local config; Claude Code asks for confirmation when loading it.
- Vulnerability reports: see [SECURITY.md](SECURITY.md). Published to npm via Trusted Publishing (with provenance); verify with `npm audit signatures`.

## Origin

Distilled from a real three-day session (2026-07-15~17; two repos: a backend automation service × a data dashboard; 19 commits, 4 cron jobs, 2 deep bug fixes — no upfront planning, zero derailment). The SUMMARY/CONTEXT/memory files that session left behind became the prototypes of this framework's three templates.

## License

[MIT](LICENSE)
