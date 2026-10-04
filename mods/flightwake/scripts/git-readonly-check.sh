#!/usr/bin/env bash
# flightwake-mod zero-write check against a REAL git (the plugin test kit has no process access, so it can only assert
# the flag is present; this script proves the flag does what we rely on).
#   1. static: every `$.process.run(['git', …])` in hooks/ carries --no-optional-locks
#   2. control: in a repo whose index is stale, a plain `git status` DOES rewrite .git/index (else the check is blind)
#   3. the mod's git command set (status / log / rev-list / rev-parse — tests/acceptance.test.ts (4) pins the set)
#      run with --no-optional-locks leaves .git/index byte-identical
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fail() { echo "❌ $*"; exit 1; }

bad=$(grep -rn "process.run(\['git'" "$HERE/hooks" | grep -v -- "--no-optional-locks" || true)
[ -z "$bad" ] || fail "git call without --no-optional-locks:
$bad"
echo "ok: every git call in hooks/ carries --no-optional-locks"

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkrepo() {
  git init -q "$1"; git -C "$1" config user.email t@t; git -C "$1" config user.name t
  mkdir -p "$1/.flightwake"; echo "health: green" > "$1/.flightwake/STATE.md"; echo a > "$1/a.txt"
  git -C "$1" add -A; git -C "$1" commit -qm base; echo b >> "$1/a.txt"; git -C "$1" commit -qam two
  sleep 1; touch "$1/a.txt" "$1/.flightwake/STATE.md"  # same content, new mtime → stat info in the index is stale
}
sum() { shasum "$1/.git/index" | cut -d' ' -f1; }

mkrepo "$T/control"; before=$(sum "$T/control"); git -C "$T/control" status --porcelain >/dev/null; after=$(sum "$T/control")
[ "$before" != "$after" ] || fail "control: plain git status did not rewrite the stale index — this check cannot see writes here"
echo "ok: control — plain git status rewrote .git/index ($before → $after)"

mkrepo "$T/mod"; R="$T/mod"; before=$(sum "$R")
g() { git -C "$R" --no-optional-locks "$@" >/dev/null; }
g status --porcelain -- .flightwake/STATE.md
last=$(git -C "$R" --no-optional-locks log -1 --format=%H -- .flightwake/STATE.md)
g rev-list --count "$last..HEAD"
g rev-list --count '--author=\[bot\]' "$last..HEAD"
g rev-parse HEAD
g status --porcelain
after=$(sum "$R")
[ "$before" = "$after" ] || fail "the mod's git commands rewrote .git/index ($before → $after)"
echo "ok: the mod's git command set left .git/index byte-identical ($before)"
