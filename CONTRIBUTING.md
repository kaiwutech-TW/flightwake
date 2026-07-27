# Contributing to flightwake

Thanks for looking. This file exists to save you wasted work: flightwake has a few hard constraints that
are not guessable from the code, and a PR that violates one of them can't be merged no matter how good it is.
Please skim the constraints before you start.

## The hard constraints

**1. Zero dependencies — runtime *and* dev.** `package.json` has no `dependencies`, no `devDependencies`,
and no install scripts. The installer and the hooks may use Node built-in modules and the `git` binary,
nothing else. Calls to git go through `execFileSync('git', …)` — never a shell.
This is a promise to users about the attack surface (see [SECURITY.md](SECURITY.md)), not a style preference.
A PR that adds a package to make something prettier, faster, or shorter will be declined.

**2. User data is never overwritten.** `.flightwake/STATE.md`, `DECISIONS.md`, `TRAPS.md`, and `records/`
belong to the user. `init --force` and `update` refresh only framework-owned files (skills, hooks, templates,
the CLAUDE.md snippet). Any code path that could clobber user data is a bug, including "obviously safe" merges.

**3. Hooks exist in two copies — change both.** `hooks/*.mjs` is the source that ships to npm.
`.flightwake/hooks/*.mjs` is this repo's own installed copy (flightwake dogfoods itself). They must stay
identical apart from the installer's stamps:

```sh
diff hooks/state-check.mjs .flightwake/hooks/state-check.mjs   # expect only the LANG line
diff hooks/statusline.mjs  .flightwake/hooks/statusline.mjs    # expect only LANG + FW_VERSION
```

Editing one and not the other is the single most repeated mistake in this repo's history.

**4. The four README editions stay in sync.** `README.md` (English, primary), `README.zh-TW.md`,
`README.zh-CN.md`, `README.ja.md`. If you change described behaviour, change all four. English is the
source of truth; if you can only write one, write the English one and say so in the PR — a maintainer
will handle the rest.

**5. Workflows pin action SHAs and use minimal permissions.** Every `uses:` is pinned to a full commit SHA
with the version in a trailing comment. Don't switch to tags, don't broaden `permissions:`.
Dependency bumps come from Dependabot; `github/codeql-action/*` sub-actions are grouped because they must
move in lockstep.

**6. Minimal command surface.** flightwake deliberately ships four skills (`fw-coldstart`, `fw-record`,
`fw-trap`, `fw-handoff`). Proposals for new commands are judged against that ceiling — read
`.flightwake/DECISIONS.md` first; several have already been considered and declined, with reasons.

## Before you open a PR

- **Read `.flightwake/DECISIONS.md`.** It is the log of choices that closed off other options, each with its
  rationale and the condition under which it should be revisited. If your change reverses one, say which
  entry and why the revisit condition is met — that argument is welcome, an unexplained reversal is not.
- **Run the tests.** `bash test/smoke.sh` builds throwaway git repos in a temp directory and exercises install,
  update, uninstall, private mode, the hooks, and the monorepo policy. It must be green. There is no other
  test suite and no build step.
- **Check the traps.** `.flightwake/TRAPS.md` records non-obvious failure modes already paid for once.

## Opening the PR

Branch off `main`, keep the change focused, and in the description say **why** — what problem you hit, not just
what you changed. flightwake's whole premise is that the reasoning is the part worth keeping.

CI runs smoke tests on Ubuntu and macOS, CodeQL, and flightwake's own STATE freshness check. All must pass.

## Things that are especially welcome

- Bug reports with a reproduction, particularly on platforms other than Claude Code
- Traps you hit that the framework should have warned you about
- Corrections to the non-English READMEs from native speakers
- Evidence that a documented behaviour doesn't match reality

## Reporting security issues

Don't open a public issue — see [SECURITY.md](SECURITY.md) for private reporting.
