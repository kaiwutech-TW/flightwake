# The Claude Code mod — state, a status band, a flight log and a tripwire inside Claude Code

> 繁體中文:[mod.zh-TW.md](mod.zh-TW.md) · 简体中文:[mod.zh-CN.md](mod.zh-CN.md) · 日本語:[mod.ja.md](mod.ja.md)

**Opt-in add-on, Claude Code only.** `init` never installs it unless you pass `--mod` (or answer yes in `setup`).

## What it is

`flightwake-mod` is a Claude Code plugin (a "mod") made of function hooks. Codex and Gemini CLI have no equivalent,
and everything else in flightwake — the skills, the Stop hook, the bottom gauge — works the same with or without it.
`.flightwake/` Markdown stays the single source of truth.

What it reads: `.flightwake/`, git state (always `git --no-optional-locks`, so it never rewrites `.git/index`), the
flightwake and roles marker blocks in `CLAUDE.md` / `.claude/CLAUDE.md` / `CLAUDE.local.md`, the flightwake marker in
`AGENTS.md` / `GEMINI.md` (language only), the `package.json` scripts and the effective `statusLine` setting; for `spend`,
this session's own transcript under `~/.claude/projects/` (token totals only); for `fleet`, the session files in
`<base>/sessions/*.json` (see [Session fleet](#session-fleet-fleet)), whether another session's transcript under
`~/.claude/projects/` still exists (existence only, and only a path that is that session's own transcript), and whether
`<base>` is a records folder or lies in a git repo (`<base>/STATE.md`, and `.git` and `.flightwake/STATE.md` on `<base>`
or a folder above it; existence only), and where the repo root and `<base>/sessions` really land (a `stat` that follows
links). No network.

What it never does: write inside the repo or your records (STATE, DECISIONS, TRAPS, records, ROLES.md). Its state is
per session, with two exceptions: **its only file write is one file per interactive session, `<base>/sessions/<id>.json`,
outside the repo** (the `fleet` feature; `<base>` is an absolute `FLIGHTWAKE_HOME`, else `~/.flightwake`), and the
`panel` feature keeps one yes/no — whether you last opened or closed the side panel — in the mod's own Claude Code
plugin store. If `<base>`
resolves inside the session's repo, is a flightwake records folder, or lies in any git repo, nothing is written. Any error in it degrades silently, and in a folder without `.flightwake/STATE.md` it does nothing at all. Its display
language follows the language recorded in the instruction-file marker at install time.

## Requirements

The mod only loads when all of these hold:

- **Claude Code 2.1.287 or later.**
- Claude Code loads it from the project's `.claude/skills/flightwake-mod/` as `flightwake-mod@skills-dir` — **only after
  you accept the workspace trust prompt** for the folder (the first time you open it).
- **The session starts at the repo root.** Starting from a subdirectory does not load it.
- A plugin with the same name in your personal directory would take precedence over the project's.

## Install, update, remove

```bash
npx flightwake setup          # add-ons list: row 2, listed when you picked Claude Code, preselected (*)
npx flightwake init --mod     # install it directly
npx flightwake update --mod   # add it to an existing install, keeping your other options
```

- `setup` shows the add-ons as one list (Enter keeps the `*` rows, numbers pick exactly those, `0` none). With Claude
  Code picked, the mod row is preselected and states in plain words: it needs Claude Code 2.1.287+, it loads in a
  session started from the repo root after you accept the trust prompt, and a session that is already open needs a
  restart. When `claude --version` reports an older version the row says so and is not preselected; when the version
  can't be read (no `claude`, or it doesn't answer within 5 s), the row stays preselected.
- `init --mod` when Claude Code is not among the agents being set up: prints a note and skips the mod (not an error).
  If `.claude/skills/flightwake-mod/` already exists, `init --mod` skips it unless `--force`.
- What gets copied: the plugin's manifest (`.claude-plugin/plugin.json`), `hooks/` and `types/` — not its tests or
  development scripts.
- `npx flightwake update` (and `init --force`) refresh the mod **only where it is already installed**, file by file; files
  you added inside `.claude/skills/flightwake-mod/` are kept. A bare `update` never adds the mod; `update --mod` (or
  setup on an installed repo → *Upgrade and add add-ons*) adds it and keeps your other options. When Claude Code is
  among the agents and the mod is missing, `update` and `init` end with one line saying so; nothing is added until
  someone asks for it (agents are told to ask the person first).
- `npx flightwake uninstall` removes the files flightwake shipped there and the folders that leaves empty. Anything else
  in `.claude/skills/flightwake-mod/` (files you added, files Claude Code wrote) is kept and listed in the output;
  a directory sitting where flightwake shipped a file is kept and named too, never deleted recursively. `uninstall --purge`
  is about `.flightwake/` only and does not delete them either.
- `--private`: the mod folder goes into the `.git/info/exclude` block. If the folder is already tracked by git,
  `--private` refuses before writing anything (same as the other private requirements). Adding the mod later with
  `update --mod` on a private install keeps it private and adds it to the exclude block.

After installing, the installer prints what you need to know: it needs Claude Code 2.1.287+; start from the repo root
and accept the trust prompt; if Claude Code is already open in this repo, that session cannot see the mod — quit it and
start Claude Code again from the repo root (mods load when Claude Code starts); then run `/fw-mod` in Claude Code to check
that it loaded and what each feature is doing; how to
turn the role guard on yourself (the `pluginConfigs` key below, or `/config`); and that it is not a security boundary.

### The bottom gauge and the band together

`setup` lists both as separate rows of the same list (row 1 the gauge, row 2 the mod), so you can take either, both or
neither. If both are installed, the closing message says: the bottom gauge shows health / STATE
lag / context use; the band above the prompt hides those same fields while the gauge is on, stays quiet, and only
toasts once when context runs hot. Choosing the mod never removes the gauge. Without the gauge, the band is always shown
and stands in for it; the installer's closing message says so.

## The eight features — each has its own switch

Seven are on by default; the role guard is off. (The side panel's switch only makes `/fw-panel` available; the
panel itself never opens until you ask for it.) Switches live in Claude Code's `/config`, or in your *user* settings
(`~/.claude/settings.json`):

```json
"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "roleGuard": true } } }
```

Project settings are not read for plugin options, so the installer cannot set them for you — it is a per-person choice.

| Switch | Default | What it does |
|---|---|---|
| `stateInject` | on | At session start, adds `.flightwake/STATE.md` (a snapshot taken once per session) to the system prompt, with a note that it is the state as of the last wrap-up and git should still be checked. An unfilled template STATE gives a one-line "run the cold start" note instead. Over 6000 characters, it injects the frontmatter, the "in progress" and "next entry points" sections and the file path, with a hint to compact STATE, rather than cutting the first N characters. It does not replace `fw-coldstart` — the lag check and reading the latest record are still the skill's job. |
| `band` | on | A row above the prompt: health colour, STATE lag (same count as the Stop hook's check; bot commits don't count), context use, tokens and cost (see `spend`), and the next suggested command. Without flightwake's bottom gauge (`statusline.mjs`) as the effective status line, the band is always shown and always shows the context percentage when Claude Code reports one — it stands in for the gauge. It turns yellow at ≥60% and red at ≥80%, and one toast appears when context reaches 80%. While STATE is still the unfilled template, it shows health as `?` with the hint "STATE not initialized yet — run /fw-coldstart". When the gauge is the effective status line, the band hides the fields the gauge already shows and stays quiet; the toast remains. |
| `recorder` | on | A session flight log: files changed, commits, and recognised test commands with their result. Files changed through shell commands are listed separately, as inferred. `/fw-log` prints it, with times in local time and UTC, for `fw-record` to use as `tests:` evidence and the change list. It never writes a record. |
| `tripwire` | on | When the agent edits a file or runs a command matching an active TRAPS entry's optional `paths` / `commands` fields, the entry's gist and confidence are shown to the agent once per session — after the tool ran, so it protects the next attempt, not this one. Never blocks. `probable` / `suspected` entries are labelled as leads, not conclusions. |
| `roleGuard` | off | For this folder's Claude seat role, `deny-write: [globs]` lines in the role body (ROLES.md) become blocks on the main session's `Edit` / `Write` / `NotebookEdit` into those paths, with a message naming the role, the rule and what to do instead. Only the person can release it with `/fw-role-release` (typed in the prompt) for this session; the release stays visible in the status line. Details: [the role guard section of roles.md](roles.md#optional-the-claude-code-mods-role-guard). |
| `spend` | on | Tokens used this session and the API-equivalent cost. Cost is Claude Code's own ledger (the figure `/cost` shows, at API list prices — on a subscription it is not a bill); tokens are summed from the session transcript under `~/.claude/projects/`, one count per API response (subagents keep their own transcripts and are not included). Shown as the band's last field (`1.2M tok · ≈$4.99`) — when the bottom gauge is the effective status line the gauge shows the same field and the band stays quiet — and as a line in `/fw-mod`; `/fw-cost` prints the breakdown (uncached input / cache write / cache read / output). Refreshed after every turn. |
| `fleet` | on | Reports this session's state — working, blocked (waiting on you), idle or ended — to `<base>/sessions/<id>.json` outside the repo, for `/fw-fleet`, `npx flightwake fleet`, a `⛔` field on the bottom gauge and a one-time `claude --resume` hint after a session stopped unexpectedly. Interactive sessions only; never prompt or command text. See [Session fleet](#session-fleet-fleet). |
| `panel` | on | `/fw-panel` opens a pane beside the transcript gathering what the other features know: STATE (health, lag, context use, the "In progress" and "Next entry points" items), this session's flight log and cost, and the other live sessions. Opened only when you ask; once opened it reopens by itself in later sessions until you close it. See [Side panel](#side-panel-panel). |

### TRAPS fields used by the tripwire

Both are optional; old entries without them are simply not matched.

```markdown
paths: ["src/db/**", "*.sql"]
commands: ["npm run migrate", "psql"]
```

- `paths` — repo-relative globs. A pattern without `/` matches that file name at any depth.
- `commands` — command prefixes, compared token by token. No regex.
- Superseded entries are never matched.

## Side panel (`panel`)

The band hides itself while the bottom gauge is on, so with both installed nothing of the mod is on screen. The side
panel puts it in one place you can keep open:

- **Header:** health, STATE lag (the band's reading; the panel measures it itself only while the band is off), context
  use, when STATE was last updated, this session's tokens and cost, and the flightwake install version and mod version.
- **Watch** (only when there is something to say): context at 80% or more (wrap up: `/fw-record` → `/clear` →
  `/fw-coldstart`); why health is yellow or red (the comment after STATE's `health:` value); uncommitted files in the
  working tree; the "Unfinished / Handoff" items of the record STATE's `latest_record` names (only a
  `records/<name>.md` under `.flightwake/`); more than 20 active TRAPS entries (fw-coldstart's line for compacting).
- **In progress / Next:** the top-level items of those two STATE sections (up to 5 and 6, with a "+n more" line),
  matched by heading in all four template languages, Markdown reduced to plain text.
- **This session:** the flight log's counts (files, shell-inferred files, test runs with ✓/✗, commits), the latest test
  runs and the files changed most recently.
- **Other sessions:** the other live sessions from the fleet heartbeat, blocked ones first (`⛔`), with their seat role
  and how long each has been in that state; a second line when one is at 80% context or more (wrap up), or runs another
  flightwake or mod version than this session. Claude Code sessions with the mod 0.3.0+ only (older writers show no
  context, role or version; Codex and Gemini sessions write no file); refreshed every 30 s.

**Opening and closing.** `/fw-panel` toggles it; `/fw-panel on` and `/fw-panel off` say which. It never opens unless you
asked: once you open it, later sessions (in any repo with flightwake) open it at start, and closing it — `/fw-panel`,
its close mark, or ctrl+x x — stops that. Where it appears is Claude Code's choice: beside the transcript in the
fullscreen layout from 110 terminal columns, otherwise above the prompt; a pane reopened at session start on a narrower
terminal waits undrawn until you widen it or run `/fw-panel`. On the terminal's main screen (`CLAUDE_CODE_NO_FLICKER=0`,
or tmux by default) it always opens above the prompt. The panel reads only what the other features already keep for the
session, plus STATE; it runs no git while drawing.

## Session fleet (`fleet`)

Each interactive session reports one thing — **does it need you?** — to a small file outside the repo, so you can see
every Claude Code session at once: which one is waiting on you, which are working, which are idle, and which stopped
unexpectedly and can be picked up again. Readers: `/fw-fleet`, `npx flightwake fleet`, a `⛔` field on the bottom gauge,
and other tools (Orca) through the [file contract](#fleet-file-contract).

**States.** `working` (a turn is running, or a manual `/compact`), `blocked` (waiting on you), `idle` (between turns),
`ended` (the session ended, with the reason). A session is `blocked` only when:

- a **permission dialog** is up — a `PermissionRequest` that nothing beneath answered (no settings hook gave a decision),
  in an interactive session. An `ask` verdict alone is not counted: in auto mode, with the classifier or a headless
  decider, nobody is asked, so it never shows as blocked;
- or the main loop has an **`AskUserQuestion` or `ExitPlanMode`** call in flight. A subagent's question does not count;
  a subagent's permission dialog does (shown as `(subagent)`).

**Where.** `<base>/sessions/<session id>.json`, where `<base>` is `FLIGHTWAKE_HOME` when it is set to an **absolute**
path, else `$HOME/.flightwake` (`%USERPROFILE%\.flightwake` on Windows). An empty or relative `FLIGHTWAKE_HOME` is
ignored. `npx flightwake init --mod`, `update --mod` and setup's *Upgrade and add add-ons* create `<base>/sessions`
with mode `0700` when it is absent (they never change an existing folder and refuse a symlink); if the mod creates the folder first, files get your umask (usually `0644`).

**When it writes.** On a change of state, on taking over the new id after `/clear` or `/resume`, and a heartbeat every
30 s. Never on an ordinary tool call, prompt or command — about 2 writes per turn, 2 per dialog and 1 per 30 s. The
whole file is rewritten each time.

**What it never writes.** Prompt text, Bash command text, question / option / plan text, URLs, queries, patterns, any
path outside the repo, permission `tool_input`, MCP messages, git remote or branch, model, cost or context %. The
file holds ids, the repo paths, tool names, a repo-relative file path for Edit / Write / MultiEdit / Read /
NotebookEdit, times and counters.

**When it writes nothing.** Each case shows as an idle reason in `/fw-mod`, and the other features are unaffected:

- a `-p` / SDK run (nobody can answer it, and CI would flood the folder);
- no home folder (`HOME` / `USERPROFILE` unset, or not an absolute path);
- `<base>` resolves **inside the session's repo** — set `FLIGHTWAKE_HOME` to an absolute folder outside it (checked
  again before every write: the repo root follows `/cd` and worktree moves). Judged by real path too, so a link above
  `<base>` that leads into the repo counts; when the real path cannot be had, nothing is written;
- `<base>` is a flightwake records folder (it holds `STATE.md`: a repo installed at `$HOME`, or `FLIGHTWAKE_HOME` set
  to some repo's `.flightwake`) or lies in **any git repo or flightwake root** (`.git` or `.flightwake/STATE.md` on
  `<base>` or a folder above it, also under its real path) — the files would show up in that repo, and its
  `uninstall --purge` would reach them. A probe that cannot be answered counts as a hit;
- `<base>`, the `sessions` folder or the file is a symbolic link (never written through; checked again at every
  heartbeat; a check that cannot be answered counts as a link);
- the file exists and is not a flightwake session file (left untouched; checked again at every heartbeat, so one put
  there later is not overwritten either);
- the session id cannot be a file name;
- a write fails — retried on the next change.

A folder without `.flightwake/STATE.md` gets no file, no timer, no command and no hint.

**Switch.** `fleet`, on by default. `"fleet": false` under the same `pluginConfigs` key turns it off; a file already
written then goes stale (and may be offered once as a resume candidate) — `npx flightwake fleet --prune` removes it.

### `/fw-fleet`

Read-only. Lists the session files from the last 7 days (newest 200), blocked first (longest waiting first), then
working, idle, stale and ended (at most 10 ended rows); `/fw-fleet all` widens to 30 days. A session whose heartbeat is
older than 120 s is shown as **stale**, never as working or blocked. A file that cannot be read (being written, or
damaged) is counted in a footer line; an unknown format, a clock ahead of yours by over 60 s, or two processes on one
session show as `unknown`. A resume command is offered for a stale session and for an ended one — after a normal exit,
a logout or an unexpected end alike, but not after `/clear` or `/resume` (that process went on under another id) — when
it had at least one turn and its transcript still exists. (The one-time [resume hint](#the-resume-hint) is narrower:
unexpected stops only.)

```
## /fw-fleet

**3 live · ⛔ 1 blocked · 1 resumable** — ~/.flightwake/sessions (last 7 days)

| state | session | repo | for | detail |
|---|---|---|---:|---|
| ⛔ blocked | `3f9a2c1e` | api | 2m | permission · Bash |
| ● working | `8b21d0aa` (this session) | flightwake | 12s | Edit src/a.ts |
| ● working | `c0ffee12` | orca ⎇ feat-x | 1m | Read (subagent) |
| ○ idle | `77aa0b3c` | web | 5m | answered |
| ◌ stale | `1234abcd` | flightwake | 2h | no heartbeat (was working) — crashed or asleep? · `claude --resume 1234abcd-…` |
| – ended | `deadbeef` | web | 1d | exited |

2 older ended file(s) hidden — `/fw-fleet all` shows 30 days.
Read-only: /fw-fleet changes nothing. `npx flightwake fleet --prune` removes ended/stale files older than 7 days.
```

`orca ⎇ feat-x` is a worktree (`feat-x`) of the repo `orca`. A `cd '…' && ` prefix is added to the resume command when
that session was started in another folder — `claude --resume` must run where the session began.

### `npx flightwake fleet`

The same list in the terminal, from any folder (no repo needed; it runs no git). Read-only, except `--prune`.

```
npx flightwake fleet                     # text, blocked first
npx flightwake fleet --json              # one JSON object for tools (additive-only, like the file)
npx flightwake fleet --all               # 30 days, no cap on ended rows
npx flightwake fleet --root=/abs/path    # only sessions whose repo or main working tree is that path
npx flightwake fleet --prune [--days=N] [--dry-run]   # delete ended/stale files older than N days (default 7)
```

`--lang=` picks the language (else the current folder's flightwake language, else English). The resume command is
always printed with its `cd '…' && ` prefix. `--prune` touches only regular `<id>.json` files directly in the folder:
an ended file whose end, or a stale file whose last heartbeat, is older than N days, or a torn write of ours (it begins
with `{"schema":"flightwake.session/`) or a file of an unknown `flightwake.session/` version last modified before then;
never a file that is not ours (any other JSON), never a file modified in the last 120 s, never the folder. It refuses
(exit 1, nothing deleted) when the folder lies inside a repo or a records folder. It is the **only** way anything in
`<base>/sessions` is deleted: `npx flightwake uninstall` and `--purge` keep the folder (it is shared by every repo) and
say so.

### The bottom gauge field

When another session has been blocked for at least 2 s and its heartbeat is live, the bottom gauge (`statusline.mjs`)
shows a red field right after the brand, so it survives truncation: `⛔ api blocked` for one (the repo name, up to 16
characters), `⛔ 2 blocked` for several. Your own session is never counted. It reads only files modified in the last
120 s, writes nothing and uses no network.

### The resume hint

At the start of a fresh session (not on reload, `/clear` or `/resume`), at most once: if a session **in the same repo
folder** stopped unexpectedly — its heartbeat went stale (crash, `kill -9`, power loss), or it ended with reason
`other` — within the last 7 days, had at least one turn, its transcript still exists, and nobody has started a
session in that folder since, one toast offers the command:

```
flightwake: a session in this repo stopped unexpectedly 2h ago (it was working). Pick it up: claude --resume 1234abcd-… — /fw-fleet lists all
```

A normal `/exit`, `/clear`, `/resume` or logout never triggers it. "Once" comes from the files themselves: when a newer
session has started in that folder, the candidate is dropped — nothing extra is stored.

### Fleet file contract

Schema `flightwake.session/1`. JSON (`JSON.stringify(rec, null, 2)` plus a newline), UTF-8, usually under 1.2 KB,
rewritten whole on each write. Every field is always present; `null` means unknown, never a fake zero. Times are epoch
milliseconds.

| field | meaning |
|---|---|
| `schema` | `"flightwake.session/1"` |
| `mod` | the writer's mod version |
| `sessionId` | the session id; equals the file's base name |
| `instance` | a per-process writer token (survives a hot reload) |
| `state` | `working` / `blocked` / `idle` / `ended` |
| `why` | machine reason for the last state change (for example `permission-dialog`, `turn.complete:answer`, `adopt:clear`); heartbeats keep it |
| `stateSince`, `seq`, `heartbeatAt`, `heartbeatMs` | when the state last changed; +1 per write; time of the last write (frozen once ended); `30000` |
| `startedAt` | when this process took this id |
| `root`, `repoRoot`, `launchCwd` | the session's working root (follows `/cd` and worktree moves); the main working tree or null; where the session was launched — `claude --resume` must run there |
| `lang`, `surface` | display language; `terminal` etc. or null |
| `blocked` | null, or `{kind: permission / question / plan, tool, target, agent, since}` — non-null exactly when `state` is `blocked`; the oldest open wait wins |
| `activity` | null, or `{tool, target, agent, at}` — the latest tool call started |
| `inFlight`, `turns` | tool calls running now; turns so far |
| `lastTurn` | null, or `{reason, at, durationMs}` from the last main-loop turn |
| `ended` | null, or `{reason, at, stateAtEnd}` — `reason` is Claude Code's session-end reason or `id-changed` |
| `resume` | `{id, resumable}` — `resumable` means the session had at least one turn |
| `transcript` | the transcript path, or null |
| `parent` | null, or `{sessionId, via: clear / resume / fork / id-changed}` — the session this one replaced in the same process |
| `contested` | true when two processes hold one id |
| `host` | only the keys whose variable is set: `orcaTerminal` (`ORCA_TERMINAL_HANDLE`), `orcaWorkspace` (`ORCA_WORKSPACE_ID`), `tmuxPane` (`TMUX_PANE`) |
| `context` | mod 0.3.0+: null, or `{percent}` — context use at the last turn or heartbeat, rounded |
| `role` | mod 0.3.0+: the folder's Claude seat role id (from the roles block in `.claude/CLAUDE.md` / `CLAUDE.md`), or null |
| `fwVersion` | mod 0.3.0+: the flightwake version in the repo's instruction-file marker (`0.16.0`), or null |

`target` is a repo-relative path for Edit / Write / MultiEdit / Read / NotebookEdit inside the repo, else null; `agent`
is true when a subagent made the call.

Rules for readers:

- v1 is **additive-only**. Ignore unknown fields; treat a missing field as null; map an unknown `state` or `kind` to
  `unknown`; show an unknown major version as `unknown`, with the id and heartbeat.
- A parse failure is transient (a torn write): skip the file this round and keep the last good value.
- **Stale:** `now − heartbeatAt > max(4 × clamp(heartbeatMs, 5000, 600000), 90000)`, with `heartbeatMs` 30000 when
  missing (120 s today). A stale file is never working or blocked.
  `contested: true`, or a `heartbeatAt` more than 60 s in the future, is `unknown`.
- **Alert** on blocked only when `now − blocked.since ≥ 2000`, deduplicated by `${sessionId}:${blocked.since}`.
- Deleting is `npx flightwake fleet --prune` only.

Guidance for Orca and other tools:

- Watch the folder (`fs.watch`, 200 ms debounce, 5 s poll fallback) and re-read only the files that changed. Do not
  spawn `npx flightwake fleet --json` per poll.
- Map a file to a pane by `host.orcaTerminal`, falling back to `root` / `launchCwd` (newest `heartbeatAt` wins).
- Follow `parent.sessionId` across `/clear`.
- Resume button: `claude --resume ${resume.id}`, run in `launchCwd`.

## Checking what it is doing: /fw-mod

`/fw-mod` is read-only. It lists each of the eight features as on, off or idle, with the reason and what to do to make it
take effect. For example: the band hidden because the bottom gauge was detected; the tripwire on but idle because no
active TRAPS entry has `paths` or `commands`; the role guard off (with how to turn it on), or on but idle because this
folder's seat has no role or no `deny-write`; STATE injected this session, or only the "run /fw-coldstart" note because
STATE is not initialized; this session reported as idle in `~/.flightwake/sessions/…`, or not reporting because it
is a `-p` run or the folder would be inside the repo. It also shows the mod version, the detected language and the profile. It changes nothing, and
it is not one of the eight switches — it is always available where flightwake is installed.

## Doctor

`npx flightwake doctor` reports whether the mod is installed — it is optional, and not installed is not a problem. When
installed, it checks:

- the manifest exists and parses;
- `hooks/hooks.json` and the modules it names exist, and every shipped file is present;
- the installed version matches the one in the package (a mismatch is a warning pointing at `update`);
- shipped files that were edited by hand (a warning; `update` restores them);
- if `claude --version` can be run, it compares with 2.1.287 (older is a warning; unreadable is just a hint, never a
  failure). Besides doctor's read-only git queries, this is the only command it runs, and it is read-only too — doctor
  still writes nothing.

doctor cannot see whether the folder is trusted or whether sessions start at the repo root, and it says so. Confirm inside
Claude Code that the mod loaded — run `/fw-mod`.

## Limits — read this

- **"pass" in `/fw-log`** means: a directly invoked, recognised test runner ran in a recognisable way and returned 0.
  It cannot see settings in config files or the environment that make tests not run (for example `addopts` in
  `pytest.ini`, a build profile that skips tests), and it does not vouch for what the tests check. Anything it cannot
  prove is recorded as "unknown" with the exit code, not as pass.
- **Shell-inferred changes in `/fw-log` may be incomplete.** They are inferred from the commands, not observed: targets
  of output redirections (`>`, `>>`), `cp`, `mv`, `rm`, `tee` and `sed -i`, inside the repo. Writes made any other way
  (scripts, other programs, git) are not seen. The "files changed by the agent" list still holds only what the Edit /
  Write / NotebookEdit tools reported.
- **Only paths that can be confirmed are listed — some changes may be missing, none should be wrong.** Each command is read
  with its own option syntax, so option values (sed's `-e` / `-f` scripts, cp's `-t` / `-S`) never count as paths; a relative
  path is resolved only while the working directory is certain (at the start, or after a leading `cd dir &&`) — after any
  other `cd` it is not guessed; paths outside the repo are dropped; and a candidate is listed only if git, afterwards,
  reports it as changed in the repo. Not a git repo → nothing is listed. (The tripwire makes the opposite trade on
  purpose: it only hints, so it would rather over-hint; the log is a record, so it would rather miss.)
- **A test command chained with other commands is recorded as "unknown"** (for example `echo … && npm test 2>&1; echo
  exit=$?` — only the whole chain's exit code is visible). The agent gets one note per session saying such a run cannot
  count as passing evidence; the note blocks nothing. When you need evidence, run the test command on its own once.
- **The role guard is not a security boundary.** Bash and other tools are not checked, subagents are not checked, and
  a symlink or other alias of a denied path is not caught.
- When the tripwire cannot be sure of the working directory (for example `cd` after `||`, or inside subshells), it
  checks each candidate directory — up to 16 of them; beyond that it falls back to matching the tail of the path — so
  it may hint more than necessary.
- **Session fleet: a permission dialog can overstay.** No event marks "dialog answered": after you approve, the tool
  runs inside the same call, so the session stays `blocked` until the tool finishes. In the terminal the dialog is
  cleared as soon as the tool's progress pill is drawn; MCP tools and WebFetch stay blocked until they finish. The
  `for` column counts from `blocked.since`, and the UI says "permission", not "dialog open".
- **Session fleet on the desktop app, VS Code and Remote Control is unverified.** If the permission event does not fire
  there, a dialog shows as working — a miss, not a false alarm.
- **Session fleet and synced home folders:** another machine's live sessions look live (the file has no host name).
- **Two processes on one session id** (for example `claude --resume <id>` in two terminals) show as `unknown`. If one
  ends while the other is live, the file says ended for up to 30 s, until the other's next heartbeat.
- **Turning `fleet` off mid-session** leaves the file to go stale; it may be offered once as a resume candidate.
  `npx flightwake fleet --prune` removes it.
- **Policy surface.** With `fleet`, the hooks module uses `fs.write`, `fs.list` and six environment reads
  (`FLIGHTWAKE_HOME`, `HOME`, `USERPROFILE`, `ORCA_TERMINAL_HANDLE`, `ORCA_WORKSPACE_ID`, `TMUX_PANE`). A managed policy
  that refuses plugins which write files refuses the **whole** mod, not only this feature.
- Claude Code only. Requires 2.1.287+, an accepted folder trust prompt, and starting at the repo root.
- **Verified once in a real Claude Code session**, where the first five features took effect. Not yet verified in a real
  session: the `spend` feature, resuming a session after a restart, behaviour after compaction, the 80% toast, the desktop / VS Code look,
  whether `/config` lists the options (the documentation describes it), and the whole `fleet` feature (a real-session
  check of the dialog, auto mode, AskUserQuestion, `/clear`, `/exit` and `kill -9` cases is required before release).
