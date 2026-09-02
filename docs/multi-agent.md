# One folder, three models — sharing flightwake memory across Claude Code, Codex, and Gemini CLI

> 繁體中文版:[multi-agent.zh-TW.md](multi-agent.zh-TW.md)

## The one idea

flightwake's memory is **files in your repo**, not a service and not any model's private memory:

```
.flightwake/
├── STATE.md        # where we are, what's in flight, where to start next
├── DECISIONS.md    # choices that closed off other options, with the why
├── TRAPS.md        # non-obvious traps, with a confidence on each root cause
└── records/        # one flight record per meaningful wrap-up
```

Every model that opens the folder reads the same four files and writes to the same four files. That is the whole
sharing mechanism. There is no sync step, no export, no "import Codex memory into Claude" — if the file changed,
the next model to open the folder sees the change.

What differs per model is only the **verb layer**: how each one is told about the obligations, how it invokes the
four skills, and where its wrap-up hook lives. `npx flightwake init` installs that layer for every platform it
detects, so you set it up once and then simply switch tools.

## What init installs for each model

| | Claude Code | Codex | Gemini CLI |
|---|---|---|---|
| Detected by | `CLAUDE.md` (or `.claude/CLAUDE.md`) | `AGENTS.md` | `GEMINI.md` |
| Obligation table goes into | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` |
| Skills | `.claude/skills/fw-*` | `.agents/skills/fw-*` | `.agents/skills/fw-*` (same directory) |
| How you invoke a skill | `/fw-coldstart` | `$fw-coldstart` | say "run the fw-coldstart skill" (activates by name/description) |
| Wrap-up hook | `Stop` in `.claude/settings.json` | `Stop` in `.codex/hooks.json` | `AfterAgent` in `.gemini/settings.json` |
| One-time platform prompt | confirms loading the repo hook | asks you to **trust** the repo hook once (re-asks if it changes) | — |

To get all three at once in a repo that only has `CLAUDE.md` today:

```bash
npx flightwake init --agents=claude,codex,gemini   # creates AGENTS.md and GEMINI.md, installs everything
git add .flightwake .claude .agents .codex .gemini CLAUDE.md AGENTS.md GEMINI.md && git commit
```

Already installed? `npx flightwake update` re-detects the instruction files present and fills in whatever a
platform is missing. Nothing in `.flightwake/` is ever overwritten by install or update.

The hook is the same script for all three (`.flightwake/hooks/state-check.mjs`); it answers each host in that
host's dialect. It fires only in a real session — from a shell, `node .flightwake/hooks/state-check.mjs --ci`
runs the same check.

## The daily loop when you switch models

The rule that makes sharing work is simple: **the model that stops writes, the model that starts reads.**

1. **Before you switch away** from a model (or end its session): have it wrap up — `/fw-record`, `$fw-record`,
   or "run the fw-record skill". That updates STATE and, when the work warrants it, writes a flight record.
   The hook nags when STATE lags 3+ commits, but you don't have to wait for the nag.
2. **Commit** (`git add .flightwake && git commit`). On the same machine, in the same checkout, the next model
   sees the files immediately even before you commit; across machines, worktrees, or teammates, git is the
   transport, so commit and push.
3. **When the next model opens the folder**, its first action is the cold start (`/fw-coldstart`,
   `$fw-coldstart`, "run fw-coldstart"). It reads STATE and the latest record, reports where things stand, and
   only then touches anything. Every model follows the same script, so the handover is identical regardless of
   which model wrote the last record and which one reads it.
4. **Mid-work obligations are the same for everyone**: a decision that closes off options → one line in
   DECISIONS; a non-obvious trap → `fw-trap` on the spot; stopping a multi-session build → `fw-handoff`.

A typical day: Claude Code designs and records → you commit → Codex picks up the implementation after
`$fw-coldstart` and records its own wrap-up → Gemini CLI reviews the next morning after "run fw-coldstart", sees
both records in `records/`, and adds a trap it found. Three models, one timeline.

## What is *not* shared (and shouldn't be)

- **Each tool's own memory** — Claude Code's auto-memory, Codex's and Gemini's conversation histories and
  transcripts — stays per tool, per machine. flightwake does not read them. If a fact matters to the repo, it
  has to be *in the repo*: a trap in TRAPS, a decision in DECISIONS, the situation in STATE. That's the
  discipline the obligation table enforces.
- **Platform config** (`.claude/`, `.codex/`, `.gemini/`, `.agents/`) is per platform by design. Commit it so
  teammates get the same setup, but don't expect one platform to read another's.
- **`--private` installs** keep `.flightwake/` out of git via `.git/info/exclude`. Everything still works across
  models on *that one machine*, but nothing travels — private mode trades sharing for privacy on purpose.

## Two models in the same folder at the same time

Sometimes you'll have Claude Code and Codex both open on the same checkout. That works, with two rules:

- **One writer per file at a time.** STATE and DECISIONS are append/rewrite targets; if two sessions both wrap
  up at once you'll merge by hand. Let one finish its `fw-record` before the other starts its own.
- **A model that didn't cold-start doesn't know what the other one just did.** If the other session wrote a
  record while this one was busy, ask this one to re-run the cold start before it wraps up, so its STATE update
  builds on the current situation instead of overwriting it.

If you want true parallelism, give each model its own git worktree; flightwake installs once per repo (at the
git root), and each worktree carries the same `.flightwake/` on its branch.

## Checking that it's wired up

```bash
ls .agents/skills .claude/skills           # fw-coldstart fw-handoff fw-record fw-trap in both
cat .codex/hooks.json .gemini/settings.json # each has a state-check.mjs hook
grep -n 'fw-coldstart' CLAUDE.md AGENTS.md GEMINI.md
# → /fw-coldstart in CLAUDE.md, $fw-coldstart in AGENTS.md, fw-coldstart in GEMINI.md
```

Then in each tool, open the folder and ask for the cold start in that tool's syntax. All three should answer with
the same "where we were / where I'll pick up / anything unverified" summary — read from the same STATE.
