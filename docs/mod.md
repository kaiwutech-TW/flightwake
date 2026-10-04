# The Claude Code mod — state, a status band, a flight log and a tripwire inside Claude Code

> 繁體中文:[mod.zh-TW.md](mod.zh-TW.md) · 简体中文:[mod.zh-CN.md](mod.zh-CN.md) · 日本語:[mod.ja.md](mod.ja.md)

**Opt-in add-on, Claude Code only.** `init` never installs it unless you pass `--mod` (or answer yes in `setup`).

## What it is

`flightwake-mod` is a Claude Code plugin (a "mod") made of function hooks. Codex and Gemini CLI have no equivalent,
and everything else in flightwake — the skills, the Stop hook, the bottom gauge — works the same with or without it.
`.flightwake/` Markdown stays the single source of truth.

What it reads: `.flightwake/`, git state (always `git --no-optional-locks`, so it never rewrites `.git/index`), the
flightwake and roles marker blocks in `CLAUDE.md` / `.claude/CLAUDE.md` / `CLAUDE.local.md`, the flightwake marker in
`AGENTS.md` / `GEMINI.md` (language only), the `package.json` scripts and the effective `statusLine` setting. No network.

What it never does: write your records (STATE, DECISIONS, TRAPS, records, ROLES.md). Its only state is per session. Any
error in it degrades silently, and in a folder without `.flightwake/STATE.md` it does nothing at all. Its display
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
npx flightwake setup          # add-ons step: one extra question, only if you picked Claude Code (default No)
npx flightwake init --mod     # install it directly
```

- `setup` explains the mod in plain words and mentions the 2.1.287 requirement and the trust prompt.
- `init --mod` when Claude Code is not among the agents being set up: prints a note and skips the mod (not an error).
  If `.claude/skills/flightwake-mod/` already exists, `init --mod` skips it unless `--force`.
- What gets copied: the plugin's manifest (`.claude-plugin/plugin.json`), `hooks/` and `types/` — not its tests or
  development scripts.
- `npx flightwake update` (and `init --force`) refresh the mod **only where it is already installed**, file by file; files
  you added inside `.claude/skills/flightwake-mod/` are kept. `update` never adds the mod.
- `npx flightwake uninstall` removes the files flightwake shipped there and the folders that leaves empty. Anything else
  in `.claude/skills/flightwake-mod/` (files you added, files Claude Code wrote) is kept and listed in the output;
  a directory sitting where flightwake shipped a file is kept and named too, never deleted recursively. `uninstall --purge`
  is about `.flightwake/` only and does not delete them either.
- `--private`: the mod folder goes into the `.git/info/exclude` block. If the folder is already tracked by git,
  `--private` refuses before writing anything (same as the other private requirements). Adding the mod later with
  `init --mod` on a private install also adds it to the exclude block.

After installing, the installer prints what you need to know: it needs Claude Code 2.1.287+; start from the repo root
and accept the trust prompt; run `/fw-mod` in Claude Code to check that it loaded and what each feature is doing; how to
turn the role guard on yourself (the `pluginConfigs` key below, or `/config`); and that it is not a security boundary.

### The bottom gauge and the band together

`setup` keeps both questions. If both are installed, the closing message says: the bottom gauge shows health / STATE
lag / context use; the band above the prompt hides those same fields while the gauge is on, stays quiet, and only
toasts once when context runs hot. Choosing the mod never removes the gauge. Without the gauge, the band is always shown
and stands in for it; the installer's closing message says so.

## The five features — each has its own switch

Four are on by default; the role guard is off. Switches live in Claude Code's `/config`, or in your *user* settings
(`~/.claude/settings.json`):

```json
"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "roleGuard": true } } }
```

Project settings are not read for plugin options, so the installer cannot set them for you — it is a per-person choice.

| Switch | Default | What it does |
|---|---|---|
| `stateInject` | on | At session start, adds `.flightwake/STATE.md` (a snapshot taken once per session) to the system prompt, with a note that it is the state as of the last wrap-up and git should still be checked. An unfilled template STATE gives a one-line "run the cold start" note instead. Over 6000 characters, it injects the frontmatter, the "in progress" and "next entry points" sections and the file path, with a hint to compact STATE, rather than cutting the first N characters. It does not replace `fw-coldstart` — the lag check and reading the latest record are still the skill's job. |
| `band` | on | A row above the prompt: health colour, STATE lag (same count as the Stop hook's check; bot commits don't count), context use, and the next suggested command. Without flightwake's bottom gauge (`statusline.mjs`) as the effective status line, the band is always shown and always shows the context percentage when Claude Code reports one — it stands in for the gauge. It turns yellow at ≥60% and red at ≥80%, and one toast appears when context reaches 80%. While STATE is still the unfilled template, it shows health as `?` with the hint "STATE not initialized yet — run /fw-coldstart". When the gauge is the effective status line, the band hides the fields the gauge already shows and stays quiet; the toast remains. |
| `recorder` | on | A session flight log: files changed, commits, and recognised test commands with their result. Files changed through shell commands are listed separately, as inferred. `/fw-log` prints it, with times in local time and UTC, for `fw-record` to use as `tests:` evidence and the change list. It never writes a record. |
| `tripwire` | on | When the agent edits a file or runs a command matching an active TRAPS entry's optional `paths` / `commands` fields, the entry's gist and confidence are shown to the agent once per session — after the tool ran, so it protects the next attempt, not this one. Never blocks. `probable` / `suspected` entries are labelled as leads, not conclusions. |
| `roleGuard` | off | For this folder's Claude seat role, `deny-write: [globs]` lines in the role body (ROLES.md) become blocks on the main session's `Edit` / `Write` / `NotebookEdit` into those paths, with a message naming the role, the rule and what to do instead. Only the person can release it with `/fw-role-release` (typed in the prompt) for this session; the release stays visible in the status line. Details: [the role guard section of roles.md](roles.md#optional-the-claude-code-mods-role-guard). |

### TRAPS fields used by the tripwire

Both are optional; old entries without them are simply not matched.

```markdown
paths: ["src/db/**", "*.sql"]
commands: ["npm run migrate", "psql"]
```

- `paths` — repo-relative globs. A pattern without `/` matches that file name at any depth.
- `commands` — command prefixes, compared token by token. No regex.
- Superseded entries are never matched.

## Checking what it is doing: /fw-mod

`/fw-mod` is read-only. It lists each of the five features as on, off or idle, with the reason and what to do to make it
take effect. For example: the band hidden because the bottom gauge was detected; the tripwire on but idle because no
active TRAPS entry has `paths` or `commands`; the role guard off (with how to turn it on), or on but idle because this
folder's seat has no role or no `deny-write`; STATE injected this session, or only the "run /fw-coldstart" note because
STATE is not initialized. It also shows the mod version, the detected language and the profile. It changes nothing, and
it is not one of the five switches — it is always available where flightwake is installed.

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
- Claude Code only. Requires 2.1.287+, an accepted folder trust prompt, and starting at the repo root.
- **Verified once in a real Claude Code session**, where all five features took effect. Not yet verified in a real
  session: resuming a session after a restart, behaviour after compaction, the 80% toast, the desktop / VS Code look,
  and whether `/config` lists the options (the documentation describes it).
