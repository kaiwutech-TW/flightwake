# Team roles — every agent still knows who it is after /clear

> 繁體中文:[roles.zh-TW.md](roles.zh-TW.md) · 简体中文:[roles.zh-CN.md](roles.zh-CN.md) · 日本語:[roles.ja.md](roles.ja.md)

**Opt-in add-on, flightwake v0.14.0+.** `init` never installs it.

## The problem it solves

You run a small team of agents, e.g. Codex as project manager, Claude as tech lead, Claude writing code, Codex
reviewing it. You tell each one its role in the chat. Then someone runs `/clear` (or a new session starts) and the
role is gone. The project manager wakes up, reads "next step: fix X" in STATE, and does what any capable model
does with no other instruction: it fixes X itself. Nobody dispatched anything, nobody reviewed anything.

The fix is to put the role where the agent reads it **every time a session starts**, not in the chat and not in
STATE (STATE says what is happening, not who you are). Each tool already has such a file:

| Agent | Reads at every session start (and after /clear) |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |

Claude Code does not read `AGENTS.md` and Codex does not read `CLAUDE.md` (verified on Claude Code 2.1 and Codex
0.157; if a future version starts reading both, the "← you" marker and the other-agent note still tell them apart), so in a folder with one Claude and one
Codex, the file name alone tells each agent which role is its own. No hook, no launch flag, no trust prompt.

## Quick start

```bash
npx flightwake roles                  # install the fw-roles skill into this repo
```

Then ask your agent: **"run fw-roles"** (Claude Code: `/fw-roles`, Codex: `$fw-roles`). It will:

1. **Scan** the project — README, manifests, layout, tests, `.flightwake/STATE.md` — and ask which folders the team spans and which agents you have.
2. **Recommend** 3–5 roles from nine presets — core `pm`, `tech-lead`, `coder`, `reviewer`; as needed `qa`, `researcher`; only when the condition holds `release` (you deploy), `security` (auth, payments, personal data), `designer` (there is a frontend) — each with a reason tied to your project.
3. **Preview** them: a table (role / agent / folder / duty), then each role's *You do / Never / Hand off to*.
4. **Customize** whatever you say ("the reviewer may fix typos itself") and write `.flightwake/ROLES.md`.
5. **Apply**: show `npx flightwake roles apply --dry-run`, and after you confirm, run `npx flightwake roles apply`.
6. **Verify**: open a new session with each agent and ask a bait question ("a button has a typo — who are you and what's your next step?"). A pm, tech lead, or reviewer should route it, not fix it.

The **Never** lists matter most. In testing, the lines that kept a project manager dispatching instead of coding
were "never write product code; the moment 'it's faster if I just fix it' crosses your mind, dispatch instead".
When you customize, turn a Never into a bounded exception rather than deleting it.

## ROLES.md

One file per team, kept in the repo where the project manager works. Text before the first role is commentary.

```markdown
# Team roles

## pm — Project manager
agent: codex
repo: .

**You do**
- Set priorities, cut work into bounded tasks, dispatch, verify results.

**Never**
- Write or edit product code.

**Hand off to**
- Implementation → coder; review → reviewer.

## coder — Primary implementer
agent: claude
repo: ../app
...
```

- `## <id> — <title>` starts a role. Inside a role use bold text or `###`, never `##`.
- `agent:` is `claude`, `codex`, or `gemini`.
- `repo:` is the folder this role works in, relative to this repo's root (absolute paths and `~/` work). Default `.`.

## Teams that span several repos

A planning repo and an implementation repo can share one team. Keep ROLES.md in one of them; `roles apply` writes
each role into the repo named by its `repo:` line. Every generated block records where its source lives (`src=`),
so running `npx flightwake roles apply` inside a member repo finds the same ROLES.md and gives the same result.
Commit the changed instruction files in **every** repo apply touched.

## The one rule: one role per agent per folder

An agent tells its role apart only by which instruction file it reads. Two Codex roles in the same folder would
both read `AGENTS.md`, so `roles apply` refuses that and writes nothing. Put the second role in another folder or
git worktree, or give it to a different agent.

## What apply writes

Each role becomes a block at the **top** of its instruction file, between
`<!-- flightwake-roles:begin … -->` and `<!-- flightwake-roles:end -->`: the role heading, a note that the block is
reloaded after /clear, your role text, the whole team list (who, which agent, which folder, "← you"), and one line
saying direct instructions from the user count as a dispatch. Everything outside the markers is left alone.

Remove a role from ROLES.md and re-apply → its block is removed. Edit ROLES.md, never the generated block — the
next apply overwrites it.

## Commands

| Command | What it does |
|---|---|
| `npx flightwake roles` | Install (or refresh) the `fw-roles` skill in `.claude/skills/`, plus `.agents/skills/` when the repo has `AGENTS.md` or `GEMINI.md` |
| `npx flightwake roles apply --dry-run` | Show which files would change and the exact blocks; write nothing |
| `npx flightwake roles apply` | Render ROLES.md into the instruction files of every repo in the team |
| `npx flightwake roles remove` | Strip role blocks and the skill from this repo; ROLES.md is kept |
| `npx flightwake update` | Refreshes the skill only where it is already installed |
| `npx flightwake uninstall` | Also strips role blocks and the skill; ROLES.md is kept like the rest of your records |

## Limits

- Presets and the skill ship in English and Traditional Chinese; other install languages get the English ones.
- Two roles on the same agent in one folder are not supported (see the rule above).
- The role is guidance the model reads, not a sandbox. It changes what the agent chooses to do; it does not stop a
  tool call. Keep your real guardrails (reviews, branch protection, permissions) in place.

## Prior art

Role catalogs we studied (reference only — no text copied): [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) · [ruflo](https://github.com/ruvnet/ruflo) · [wshobson/agents](https://github.com/wshobson/agents) · [multi-agent-shogun](https://github.com/yohey-w/multi-agent-shogun). multi-agent-shogun's per-role forbidden actions are the closest idea to our Never lists.
