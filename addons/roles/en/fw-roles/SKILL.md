---
name: fw-roles
description: flightwake team roles — scan the project, recommend a set of agent roles, let the user preview and customize them, then install them into CLAUDE.md/AGENTS.md (so they survive /clear). Use when the user wants to set up or change agent roles (PM / tech lead / coder / reviewer…), says set up roles / who does what / roles, or an agent keeps drifting out of its role after /clear.
---

# fw-roles — team roles

Goal: every agent remembers, on every new session and after /clear, who it is, what it does, **what it must never
do**, and whom it hands off to. Roles live in one file, `.flightwake/ROLES.md` (human-readable, reviewable), and
`npx flightwake roles apply` renders them into the instruction file each agent reads at session start:
Claude Code → `CLAUDE.md`, Codex → `AGENTS.md`, Gemini CLI → `GEMINI.md`.

**The routing rule (the one hard constraint)**: an agent tells its role apart only by which instruction file it
reads. So **in one folder, each vendor holds at most one role**. Two Codex roles need two folders/worktrees, or one
of them moves to another vendor.

## Steps

1. **Scan the project** (read-only, write nothing)
   - README, package manifests (package.json / pyproject …), top-level layout, tests/CI, `.flightwake/STATE.md` and DECISIONS
   - Ask the user only what you can't look up: which folders does the team span? (with Orca: `orca repo list`)
     Which agents are available (Claude Code / Codex / Gemini CLI)? If `.flightwake/ROLES.md` exists, read it —
     this is an edit, not a fresh start.
2. **Recommend a team** (3–5 roles; more and they step on each other)
   - Pick from this skill's `presets/`. Core: pm, tech-lead, coder, reviewer; as needed: qa, researcher; **only when the condition holds**:
     release (the project actually deploys), security (auth, payments, personal data), designer (there is a frontend). If none fits, write one in the same format.
   - Seats are limited (one role per vendor per folder): when a conditional role has no free seat, say it needs another folder/worktree or vendor and let the user decide — don't squeeze it in.
   - Give each role a (folder, vendor) pair that respects the routing rule.
   - Prefer coder and reviewer on **different vendors** (a different model catches the same-model blind spots);
     pm is steadier in a folder where no code is written.
   - Give one line of reasoning per role, tied to a concrete fact from step 1.
3. **Preview**: a table first (role | vendor | folder | one-line duty), then each role's Do / Never / Hand off.
   Say the defaults are a starting point and ask what to change.
4. **Customize** as the user says. **The Never list is the heart of this** — if the user says "the reviewer may fix
   typos", rewrite that Never item as a bounded exception rather than deleting it. Write `.flightwake/ROLES.md` in
   this format (each `##` heading starts a role; inside a role use only `**bold**` / `###`, never `##`):

   ```markdown
   # Team roles
   (text before the first role is commentary; apply ignores it)

   ## pm — Project manager / coordinator
   agent: codex
   repo: .

   **You do**
   - …
   ```

   `repo:` is relative to this repo's root (absolute paths and `~/` work). A team has **one** ROLES.md, kept in the
   pm's repo; other repos need no copy — apply writes into them too.
5. **Apply**: run `npx flightwake roles apply --dry-run` first so the user sees exactly which files change and how;
   after they confirm, `npx flightwake roles apply`. It only touches the `<!-- flightwake-roles:begin/end -->`
   blocks, always placed at the **top** of the file (the first thing the agent reads) — describe it that way to the user. If an instruction file still has **hand-written role sections**, point them out and remove them once the
   user confirms — old and new side by side contradict each other.
6. **Verify**: in each role's folder, open a **new session** with that agent and ask the same bait question, e.g.
   "a frontend button has a typo — which role are you and what's your next step? Don't touch anything." pm /
   tech-lead / reviewer should route it, not fix it. If one fixes it → back to step 4 and make that Never item more specific.
7. **Wrap up**: one DECISIONS line (which team, why); remind the user to commit in every repo that was written to.

## Red lines

- Write no instruction file before the user confirms the preview.
- Never delete the user's hand-written content without showing it and getting confirmation.
- Changing a role = edit ROLES.md and re-apply, never edit a generated block (the next apply overwrites it).
