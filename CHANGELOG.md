# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Releases before 0.7.1 predate the public launch and were never published; the history starts there.

## [Unreleased]

### Added

- The status line shows the installed flightwake version, in dim text, as its first field
  (hidden when running from an unstamped source checkout).

### Fixed

- **STATE staleness now counts human commits only.** Bot commits (`dependabot[bot]`, `renovate[bot]`, …)
  are excluded from both the Stop-hook/CI check and the status-line gauge. A dependency bump never makes
  STATE wrong, and a bot's own PR could never satisfy the gate — an unsatisfiable check just trains everyone
  to ignore red.

### Changed

- Dependabot groups `github/codeql-action/*` into a single PR. The sub-actions must run at the same version,
  so splitting them across PRs made every one of them fail CI on its own.

## [0.10.0] — 2026-07-23

An external-evaluation-driven release: the neighbouring ecosystem was surveyed (auto-capture memory,
spec/task-first frameworks, markdown conventions), the retrospective × git-native × zero-dependency ×
hard-guard quadrant confirmed unoccupied, and the three real gaps the evaluation surfaced closed.

### Added

- **`health: green` now needs evidence.** The Stop hook and `--ci` gain a second check: STATE claiming green
  while the latest record carries no test evidence (empty `tests:` frontmatter) gets a nag. Detection is
  frontmatter-presence only — no prose judgement — and in CI it is a warning, never a gate.
- **Cross-repo traps stop biting twice.** `fw-trap` judges a trap's scope: platform/language-layer traps are
  registered in the repo's TRAPS *and* saved to user-level memory, so other repos get the warning too.
- **README opens with a live demo** — a real ~30-second cold start recorded on this repo.

### Changed

- The honest edges of the reminder net are documented in all four README editions: the lag check counts
  commits, so a session that commits nothing, or a squash/rebase flow, slips under it.

## [0.9.0] — 2026-07-19

The full-i18n release.

### Added

- **English by default.** `npx flightwake init` installs English templates, skills, and CLI/hook output.
  Traditional Chinese remains fully supported via `--lang=zh-TW`; existing (pre-0.9, all zh-TW) installs are
  detected and keep their language on update.
- **`npx flightwake update`** — in-place upgrade that re-detects language, status line, and private mode, and
  refreshes only framework-owned files. User data is never touched.
- **Update hint in the gauge** (`→ v0.9.1 available: npx flightwake update`), shown only when nothing more
  urgent is. Anonymous npm-registry GET at most once per 24h, cached in the OS temp dir, always backgrounded.
  Opt out with `FLIGHTWAKE_NO_UPDATE_CHECK=1`.
- `docs/workflow.md`, the stage-by-stage playbook, English-first with a zh-TW edition.

### Fixed

- Status line TTY guard — manual runs no longer hang waiting on stdin.

## [0.8.2] — 2026-07-18

### Fixed

- **Correct context-window size on 1M-context models.** The gauge reads `context_window` from Claude Code's
  status-line stdin instead of assuming 200k; on Fable 5-class sessions it had over-reported usage roughly 5×
  (63% shown for an actual 12.7%). Falls back to the 200k estimate on older Claude Code versions.
- `init` now states that the status line is opt-in and that `--statusline` adds it.

## [0.8.1] — 2026-07-18

### Added

- The status line names the next command for the current state: session just started → `/fw-coldstart`;
  STATE ≥3 commits behind → `/fw-record`; context running hot → `/fw-record → /clear → /fw-coldstart`;
  all healthy → silence.

## [0.8.0] — 2026-07-18

### Added

- **`npx flightwake init --statusline`** — a persistent gauge in Claude Code: health colour, STATE staleness,
  context usage. Never overwrites an existing status line.
- GSD migration guide in all four README editions.

## [0.7.2] — 2026-07-18

First public release. ✈️

### Added

- Open-sourced with gaps 1–7 closed: de-identification guard, superseded lifecycle, multi-platform install,
  `--private` local mode, `uninstall`, CI-side STATE check, monorepo policy.
- README in four languages (EN primary · 繁中 · 简中 · 日本語).
- Published via npm Trusted Publishing (OIDC + provenance).

## [0.7.1] — 2026-07-18

Initial npm publish; superseded within the day by 0.7.2.

[Unreleased]: https://github.com/kaiwutech-TW/flightwake/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.10.0
[0.9.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.9.0
[0.8.2]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.8.2
[0.8.1]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.8.1
[0.8.0]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.8.0
[0.7.2]: https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.7.2
[0.7.1]: https://www.npmjs.com/package/flightwake/v/0.7.1
