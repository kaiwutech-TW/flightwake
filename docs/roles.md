# Team roles — every agent still knows who it is after /clear

> 繁體中文:[roles.zh-TW.md](roles.zh-TW.md) · 简体中文:[roles.zh-CN.md](roles.zh-CN.md) · 日本語:[roles.ja.md](roles.ja.md)

**Opt-in add-on, flightwake v0.14.0+.** `init` never installs it.

## The problem it solves

You run a small team of agents, e.g. Codex as project manager, Claude as tech lead, Claude writing code, Codex
reviewing it. You tell each one its role in the chat. Then someone runs `/clear` (or a new session starts) and the
role is gone. The project manager wakes up, reads "next step: fix X" in STATE, and does what any capable model
does with no other instruction: it fixes X itself. Nobody dispatched anything, nobody reviewed anything.

Two more problems show up once a team runs for a while:

- **Some roles are only needed in some phases.** Security review, UI design, and release matter later, but you
  don't want them occupying an agent from day one.
- **Jobs drift.** The tech lead ends up doing platform paperwork; the role text should follow, cleanly.

## Two ideas: seats and on-call roles

**A seat** is a (folder, vendor) pair. The role on a seat is written where that vendor reads instructions **every
time a session starts** — not in the chat, and not in STATE (STATE says what is happening, not who you are):

| Vendor | Reads at every session start (and after /clear) |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

Claude Code does not read `AGENTS.md` and Codex does not read `CLAUDE.md` (verified on Claude Code 2.1 and Codex
0.157), so in a folder with one Claude and one Codex the file name alone tells each agent which role is its own. That
is also the one limit: **one seat per vendor per folder.** Long-lived roles sit — pm, tech lead, coder, reviewer.

**An on-call role** has no seat and no limit. `roles apply` generates it as a native agent definition in every seated
(folder, vendor):

- Claude Code: `.claude/agents/fw-<id>.md`
- Codex: `.codex/agents/fw-<id>.toml`

When it's needed:

- **Same vendor, short task** → the seated agent spawns the native agent `fw-<id>` (e.g. the coder asks for `fw-security`).
- **Other vendor, or a longer task** → the project manager dispatches a worker whose task starts with the role card
  from `npx flightwake roles card <id>`. The card says "for this task, act as this role" and overrides the seat role of
  the folder the worker lands in; the repo's shared rules still apply.

Phase-specific roles (security, designer, release, qa) start on call. Each can carry a `### When to call` section,
which shows up in every seat's team list — so the project manager re-reads the triggers at every session start.

## Quick start

```bash
npx flightwake roles                  # install the fw-roles skill into this repo
```

Then ask your agent: **"run fw-roles"** (Claude Code: `/fw-roles`, Codex: `$fw-roles`). It will:

1. **Scan** the project — README, manifests, layout, tests, deployment, `.flightwake/STATE.md` — and ask which folders the team spans and which agents you have.
2. **Recommend** 3–4 seats and some on-call roles from nine presets — core `pm`, `tech-lead`, `coder`, `reviewer`; as needed `qa`, `researcher`; only when the condition holds `release` (you deploy), `security` (auth, payments, personal data), `designer` (there is a frontend) — each with a reason tied to your project.
3. **Preview**: the seats table, the on-call roles and when to call them, then each role's *You do / Never / Hand off to*.
4. **Customize** whatever you say ("the reviewer may fix typos itself") and write `.flightwake/ROLES.md`.
5. **Apply**: show `npx flightwake roles apply --dry-run`, and after you confirm, run `npx flightwake roles apply`.
6. **Verify**: a bait question in a new session for each seat ("a button has a typo — who are you and what's your next step?"), plus one on-call role called for real.

The **Never** lists matter most. In testing, the lines that kept a project manager dispatching instead of coding
were "never write product code; the moment 'it's faster if I just fix it' crosses your mind, dispatch instead".
When you customize, turn a Never into a bounded exception rather than deleting it.

## ROLES.md

One file per team, kept in the repo where the project manager works. Text before the first role is commentary.

```markdown
# Team roles

## pm — Project manager
**You do**
- Set priorities, cut work into bounded tasks, dispatch, verify results.

**Never**
- Write or edit product code.

**Hand off to**
- Implementation → coder; review → reviewer.

## security — Security review
**You do**
- Review changes that touch auth, secrets, payments, personal data.
### When to call
- The change touches auth, permissions, secrets, payments, personal data.

## seats
| repo | vendor | role |
|---|---|---|
| . | codex | pm |
| ../app | claude | coder |
| ../app | codex | reviewer |
```

- `## <id> — <title>` starts a role. Inside a role use bold text or `###`, never `##`.
- `## seats` is a table: `repo` relative to this repo's root (absolute paths, `~/`, and spaces work), `vendor` is
  `claude`, `codex`, or `gemini`, `role` is a role id. A role may hold several seats; a role with no seat is on call.
- Older files without a seats table (each role carrying `agent:` / `repo:` lines) still work as-is; `roles assign`
  asks you to migrate first, and the fw-roles skill does the migration with a full preview.

## Teams that span several repos

A planning repo and an implementation repo can share one team: keep ROLES.md in one of them, and `apply` writes into
every repo in the seats table. Every generated block records where its source lives (`src=`), so running
`npx flightwake roles apply` inside a member repo finds the same ROLES.md and gives the same result. Commit the changed
files in **every** repo apply touched — instruction files, `.claude/agents/`, `.codex/agents/`, and
`.flightwake/roles-manifest.json` next to ROLES.md.

## Changing seats: `roles assign`

```bash
npx flightwake roles assign ../app:codex release --dry-run   # preview
npx flightwake roles assign ../app:codex release             # edit that one seats cell, then re-apply
npx flightwake roles assign ../new:claude designer --add     # a seat that doesn't exist yet needs --add
```

`assign` edits only that cell of the seats table — comments, role text, and order are untouched — and it refuses to
write if ROLES.md changed while it was planning. The change takes effect on each agent's **next new session**; running
sessions and workers keep their current role until then. Add a DECISIONS line saying why (the fw-roles skill does).

## What apply writes, and what it will never overwrite

- **Seat blocks** at the **top** of each instruction file, between `<!-- flightwake-roles:begin … -->` and
  `<!-- flightwake-roles:end -->`: the role, a note that it is reloaded after /clear and is the *main session's* role,
  your role text, the team list (seats, on-call roles and when to call them, "← you"), and one line saying direct
  instructions from the user count as a dispatch. Everything outside the markers is left alone.
- **Native on-call definitions** in `.claude/agents/` and `.codex/agents/`, each marked as generated.
- **A manifest** (`.flightwake/roles-manifest.json`) listing every generated output with a hash.

apply only rewrites or removes an output that still matches what it generated, or that already equals the new
content. A same-named file you wrote, a generated file you edited by hand, or another team's output is a **conflict**:
apply lists it and writes nothing. When a role or a whole repo leaves ROLES.md, its old blocks and definitions are
cleaned up through the manifest. Edit ROLES.md, never the generated output.

## Commands

| Command | What it does |
|---|---|
| `npx flightwake roles` | Install (or refresh) the `fw-roles` skill in `.claude/skills/`, plus `.agents/skills/` when the repo has `AGENTS.md` or `GEMINI.md` |
| `npx flightwake roles apply --dry-run` | Show what would be added, updated, or cleaned up — and the exact blocks; write nothing |
| `npx flightwake roles apply` | Render ROLES.md into every repo of the team; clean up stale output |
| `npx flightwake roles card <id>` | Print one role as a dispatch card on stdout (on error: nothing on stdout, message on stderr, non-zero exit) |
| `npx flightwake roles assign <repo>:<vendor> <id> [--add] [--dry-run]` | Put a role on a seat |
| `npx flightwake roles remove` | Strip this repo's role blocks, generated agents, and the skill; ROLES.md is kept |
| `npx flightwake update` | Refreshes the skill only where it is already installed |
| `npx flightwake uninstall` | Also strips role blocks, generated agents, and the skill; ROLES.md is kept like the rest of your records |

## Limits — read this

- **Roles are guidance, not permissions.** They change what an agent chooses to do; they do not stop a tool call.
  We tested it: a Codex custom agent defined as read-only still wrote files when spawned from a writable session.
  Nothing flightwake generates claims to enforce anything. Keep your real guardrails (reviews, branch protection,
  the tools' own permission settings) in place.
- One seat per vendor per folder; use on-call roles or another folder/worktree for more.
- Presets and the skill ship in English and Traditional Chinese; other install languages get the English ones.
- Gemini CLI gets seat blocks but no native on-call definitions yet.
- **Codex loads `.codex/agents/` only in a trusted project — trusted at that exact repo path** (a trusted parent folder does not cover a git repo inside it, and each worktree path counts separately). Check by spawning once, not by the file existing; a definition with a field Codex doesn't recognize is silently dropped, which is why flightwake writes only `name`, `description`, and `developer_instructions`.
- A role's "When to call" informs the agent; it does not fire by itself. The seat blocks carry the explicit rule ("when a task matches, that role does it — spawn it or dispatch it"), which is what made the agent actually delegate in testing.

### Optional: the Claude Code mod's role guard

If you use the `flightwake-mod` Claude Code mod, its **role guard** switch (`roleGuard`, off by default) can turn one machine-readable rule into a block. "Roles are guidance, not permissions" above still holds for everything else.

- **Turning it on.** In Claude Code's `/config` (the mod's options are rows there), or in your *user* settings (`~/.claude/settings.json`): `"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "roleGuard": true } } }`. Project settings are not read for plugin options, so this is a per-person choice.
- **Where to write it.** A line of its own in the role's body in `ROLES.md`: `deny-write: ["src/**", "lib/**"]` (repo-relative globs; a pattern without `/` matches that file name at any depth). `roles apply` and `roles card` copy the body verbatim, so the line travels into the seat block and into the dispatch card.
- **What the mod enforces.** With the switch on, the *main* Claude Code session's `Edit`, `Write` and `NotebookEdit` into those paths are refused, with a message that names the role, the rule and what to do instead (hand the work to the role that owns it, or ask the person to release it).
- **What stays guidance.** Everything else: Bash and every other tool, MCP, subagents, and the natural-language "Never" items — they are never turned into rules.
- **Overrides.** A session that opens with a dispatch card follows the card's role instead of the seat (a card without `deny-write` guards nothing). A subagent, including an on-call role spawned for a task, is an explicit assignment and is not checked.
- **Release.** Only the person can run `/fw-role-release` (typed in the prompt, not from a plugin or the model): with no argument it lists the rules; with a glob or its number it releases that rule; `all` releases every rule; `revoke` takes the releases back. A release lasts for this session only, stays visible in the status line while it is active, and leaves a note in the transcript.  When a path falls under several rules, every one of them must be released: releasing `src/**` does not release `src/private/**`. The guard only acts in a folder where flightwake is installed (`.flightwake/STATE.md` exists); moving the session to another folder re-reads that folder's seat.
- **When changes apply.** The role is read once when a session starts; edit the seat or `deny-write` and start a new session (or `/clear`) to pick it up.
- **Not a security boundary.** This is a convenience that catches the common slip of a manager writing product code. A determined agent can still write through Bash. Paths are compared as written (normalized, but symlinks and other aliases of the same file are not resolved), so an alias of a denied path is not caught either. Keep your real guardrails in place.

## Prior art

Role catalogs we studied (reference only — no text copied): [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [ruflo](https://github.com/ruvnet/ruflo) · [wshobson/agents](https://github.com/wshobson/agents) · [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun). multi-agent-shogun's per-role forbidden actions are the closest idea to our Never lists; Gas Town's long-lived crew vs. short-lived workers is the closest idea to seats vs. on-call.
