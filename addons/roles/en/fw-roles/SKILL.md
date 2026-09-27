---
name: fw-roles
description: flightwake team roles — recommend, customize, and install agent roles that survive /clear (seats in CLAUDE.md/AGENTS.md, on-call roles as native agents). Use when setting up or changing who does what on a multi-agent team, calling an on-call role, or when an agent drifts out of its role after /clear.
---

# fw-roles — team roles

Goal: every agent remembers, on every new session and after /clear, who it is, what it does, **what it must never
do**, and whom it hands off to — and phase-specific roles (security, design, release…) don't need a seat up front.

## Two ideas

- **Seat**: a (folder, vendor) pair. At most one seat per vendor per folder — an agent tells its role apart only by
  which instruction file it reads (Claude Code → `CLAUDE.md`, Codex → `AGENTS.md`, Gemini CLI → `GEMINI.md`). A seated
  role is written at the top of that file and comes back after /clear. Long-lived, daily roles sit: pm, tech-lead,
  coder, reviewer.
- **On call**: a role without a seat. apply generates native definitions in every seated (folder, vendor)
  (`.claude/agents/fw-<id>.md`, `.codex/agents/fw-<id>.toml`). When needed: same vendor, short task → spawn the native
  agent `fw-<id>`; other vendor or long task → pm dispatches a worker whose task starts with the output of
  `npx flightwake roles card <id>`. No seat limit. Phase-specific roles (security, designer, release, qa) start on call.

**Honest boundary**: role text is guidance, not a permission boundary. Native definitions claim no read-only or
no-write enforcement (tested: it doesn't hold; see TRAPS `codex-custom-agent-sandbox-not-enforced`). Say so to the user.

## First setup

1. **Scan** (read-only, write nothing)
   - README, manifests, top-level layout, tests/CI/deployment, `.flightwake/STATE.md` and DECISIONS
   - Ask only what you can't look up: which folders does the team span? (with Orca: `orca repo list`) Which agents are
     available? If `.flightwake/ROLES.md` exists, read it — this is an edit; go to "Day-to-day changes" below.
2. **Recommend**: 3–4 seats plus some on-call roles.
   - Pick from this skill's `presets/`. Core (usually seated): pm, tech-lead, coder, reviewer; as needed: qa,
     researcher; **only when the condition holds**: release (the project actually deploys), security (auth, payments,
     personal data), designer (there is a frontend).
   - Prefer coder and reviewer on **different vendors**; pm is steadier in a folder where no code is written.
   - One line of reasoning per role, tied to a fact from step 1. Give on-call roles a `### When to call` (pm's trigger list).
3. **Preview**: the seats table (folder | vendor | role) first, then on-call roles and when to call them, then each
   role's Do / Never / Hand off.
4. **Customize** as the user says. **The Never list is the heart of this** — "the reviewer may fix typos" becomes a
   bounded exception, not a deleted line. Write `.flightwake/ROLES.md` (`##` starts a role; inside a role use only
   `**bold**` / `###`):

   ```markdown
   # Team roles
   (text before the first ## is commentary; apply ignores it)

   ## pm — Project manager / coordinator
   **You do**
   - …

   ## security — Security review
   **You do**
   - …
   ### When to call
   - The change touches auth, permissions, secrets, payments, personal data

   ## seats
   | repo | vendor | role |
   |---|---|---|
   | . | codex | pm |
   | ../app | claude | coder |
   ```

   `repo` is relative to the root of the repo holding ROLES.md (absolute paths, `~/`, and spaces work). A team has
   **one** ROLES.md, kept in the pm's repo; apply writes into every repo in the seats table.
5. **Apply**: show `npx flightwake roles apply --dry-run` (what gets added, updated, cleaned up); after the user
   confirms, `npx flightwake roles apply`. Seat blocks always go at the **top** of the instruction file; nothing else is
   touched — describe it that way. If an instruction file still has **hand-written role sections**, point them out and
   remove them once the user confirms. When apply reports **conflicts** (a user file with the same name, a hand-edited
   generated file, another team's output) it writes nothing: show the conflicts as-is and let the user decide — never
   delete files yourself to get around them.
6. **Verify**: open a **new session** in each seat and ask a bait question ("a button has a typo — which role are you
   and what's your next step? Don't touch anything"); pm / tech-lead / reviewer should route it. Also call one on-call
   role (spawn `fw-<id>`, or dispatch a worker with its card) and confirm it identifies as the on-call role, not the seat.
   If Codex can't see `fw-<id>`: the repo must be trusted at its exact path (worktrees count separately), and a
   definition Codex can't parse is dropped silently — tell the user rather than working around it.
7. **Wrap up**: one DECISIONS line (seats and on-call roles, and why); remind the user to commit in every repo written
   to (including `.claude/agents/`, `.codex/agents/`, and `.flightwake/roles-manifest.json`).

## Day-to-day changes

- **Change the role on a seat** (e.g. entering launch, a seat becomes release):
  `npx flightwake roles assign <repo>:<vendor> <role> --dry-run` → user confirms → run without `--dry-run`. It edits only
  that seats cell and re-applies; a new seat needs `--add`. It takes effect on the **next new session** — running
  sessions keep their old role, so tell the user which ones to restart. Then add a DECISIONS line saying why.
- **Change a role's content**: edit its section in ROLES.md and apply; never edit a generated block or native file
  (it will be reported as a conflict).
- **Call an on-call role**: same vendor → spawn `fw-<id>`; other vendor → first confirm `npx flightwake roles card <id>`
  succeeded (on failure stdout is empty — don't dispatch anyway), then put the card at the top of the worker's task.
  Dispatch with: task, working directory, files it may change, acceptance, how to report. If it can't be called (no such
  agent type, spawn fails) → report to the user; **never** fall back to a generic sub-agent or do the work yourself.
- **Migrate the legacy format** (no `## seats`; roles carry `agent:` / `repo:` lines): assign refuses it. Turn each
  role's `agent` / `repo` into a seats row and delete those two lines; show the user the full before/after, write only
  after they confirm, then run apply --dry-run.

## Red lines

- Write no instruction file or ROLES.md before the user confirms the preview.
- Never delete the user's hand-written content or a file apply reported as a conflict without showing it and getting confirmation.
- Never present roles as access control; if the user needs a real restriction, tell them to use the tool's own
  permission settings and test it themselves.
