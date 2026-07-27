<!-- Dependabot PRs can ignore this template. -->

## Why

<!-- The problem you hit, not just what you changed. This is the part worth keeping. -->

## What changed

<!-- Short. The diff covers the detail. -->

## Checklist

- [ ] `bash test/smoke.sh` is green
- [ ] If a hook changed: both copies updated (`diff hooks/X.mjs .flightwake/hooks/X.mjs` shows only the LANG/FW_VERSION stamps)
- [ ] If documented behaviour changed: all four README editions updated (en / zh-TW / zh-CN / ja)
- [ ] No new dependencies (runtime or dev) — see [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] If this reverses an entry in `.flightwake/DECISIONS.md`: which one, and why its revisit condition is met
