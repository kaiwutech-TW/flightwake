#!/usr/bin/env bash
# flightwake 安裝器煙霧測試 — 在 temp git repo 跑 init 三次(初裝/重跑/--force),驗證冪等與資料安全。
set -euo pipefail

FW="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "❌ FAIL: $1"; exit 1; }
pass() { echo "  ok: $1"; }

# 複製一份源碼來測(這樣可以安全地塞 .DS_Store 模擬 macOS 垃圾檔)
SRC="$TMP/fw-src"
cp -R "$FW" "$SRC"
touch "$SRC/skills/.DS_Store" "$SRC/skills/fw-record/.DS_Store"
CLI="$SRC/bin/cli.mjs"

REPO="$TMP/repo"
mkdir -p "$REPO" && cd "$REPO"

# 0. 非 git repo 應退出非零
node "$CLI" init >/dev/null 2>&1 && fail "非 git repo 應該退出非零"
pass "非 git repo 擋下"

git init -q
git config user.email t@t.t && git config user.name t
echo "# 專案說明" > CLAUDE.md

# 1. 初裝:檔案齊全
node "$CLI" init >/dev/null
for f in .flightwake/STATE.md .flightwake/DECISIONS.md .flightwake/TRAPS.md \
         .flightwake/TEMPLATE-record.md .flightwake/hooks/state-check.mjs \
         .claude/skills/fw-coldstart/SKILL.md .claude/skills/fw-record/SKILL.md \
         .claude/skills/fw-handoff/SKILL.md .claude/skills/fw-trap/SKILL.md \
         .claude/settings.json; do
  [ -f "$f" ] || fail "初裝後缺 $f"
done
[ -d .flightwake/records ] || fail "缺 records/"
pass "初裝檔案齊全"

# 1b. 敏感資訊防護:模板與 fw-record skill 帶去識別化提醒
grep -q '去識別化' .flightwake/TEMPLATE-record.md || fail "record 模板缺去識別化提醒"
grep -q '去識別化' .claude/skills/fw-record/SKILL.md || fail "fw-record skill 缺去識別化檢查"
pass "去識別化提醒到位"

# 2. 不夾帶垃圾檔
find .claude/skills -name '.DS_Store' | grep -q . && fail ".DS_Store 被裝進 skills"
pass "無 .DS_Store"

# 3. settings.json 是有效 JSON 且含 hook
node -e "const s=require('./.claude/settings.json'); if(!JSON.stringify(s.hooks.Stop).includes('state-check.mjs')) process.exit(1)" \
  || fail "settings.json 無效或缺 Stop hook"
pass "settings.json hook 正確"

# 4. CLAUDE.md 片段恰好一份
[ "$(grep -c 'flightwake:begin' CLAUDE.md)" = 1 ] || fail "CLAUDE.md 片段不是恰好一份"
pass "CLAUDE.md 片段一份"

# 5. 重跑冪等:使用者資料不動、片段不重複(含兩個 CLAUDE.md 候選同存的情況)
echo "SENTINEL-USER-DATA" >> .flightwake/STATE.md
echo "sentinel" > .claude/CLAUDE.md
node "$CLI" init >/dev/null
grep -q SENTINEL-USER-DATA .flightwake/STATE.md || fail "重跑覆蓋了 STATE.md"
total=$(( $(grep -c 'flightwake:begin' CLAUDE.md) + $(grep -c 'flightwake:begin' .claude/CLAUDE.md || true) ))
[ "$total" = 1 ] || fail "兩個 CLAUDE.md 同存時片段被重複安裝(共 $total 份)"
pass "重跑冪等"

# 6. --force:更新框架檔案、仍不動使用者資料、片段仍一份
echo "OLD-SKILL" >> .claude/skills/fw-record/SKILL.md
node "$CLI" init --force >/dev/null
grep -q OLD-SKILL .claude/skills/fw-record/SKILL.md && fail "--force 沒更新 skill"
grep -q SENTINEL-USER-DATA .flightwake/STATE.md || fail "--force 覆蓋了 STATE.md"
[ "$(grep -c 'flightwake:begin' CLAUDE.md)" = 1 ] || fail "--force 後片段不是恰好一份"
pass "--force 更新正確"

# 7. Stop hook:STATE 未 commit → 靜默;落後 3 commits → block;更新 STATE → 解除
out=$(echo '{}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "STATE 從未 commit 時 hook 不該出聲"
git add -A && git commit -qm "install flightwake"
for i in 1 2 3; do echo "$i" > "f$i.txt" && git add "f$i.txt" && git commit -qm "c$i"; done
out=$(echo '{}' | node .flightwake/hooks/state-check.mjs)
echo "$out" | grep -q '"decision":"block"' || fail "落後 3 commits 時 hook 應該 block(got: $out)"
out=$(echo '{"stop_hook_active":true}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "stop_hook_active 時應靜默(防循環)"
echo "updated" >> .flightwake/STATE.md
out=$(echo '{}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "STATE 有未 commit 更新時應視為新鮮"
pass "Stop hook 行為正確"

# 8. 多平台:無任何指令檔 → 建 AGENTS.md,重跑冪等
REPO2="$TMP/repo2"
mkdir -p "$REPO2" && cd "$REPO2"
git init -q && git config user.email t@t.t && git config user.name t
node "$CLI" init >/dev/null
[ -f AGENTS.md ] || fail "無指令檔時應建 AGENTS.md"
[ "$(grep -c 'flightwake:begin' AGENTS.md)" = 1 ] || fail "AGENTS.md 片段不是恰好一份"
node "$CLI" init >/dev/null
[ "$(grep -c 'flightwake:begin' AGENTS.md)" = 1 ] || fail "重跑後 AGENTS.md 片段重複"
pass "無指令檔 → 建 AGENTS.md"

# 9. 多平台:CLAUDE.md + GEMINI.md 同存 → 各貼一份、不多建;--agents 指定缺檔平台會建檔;不認得的值退出非零
REPO3="$TMP/repo3"
mkdir -p "$REPO3" && cd "$REPO3"
git init -q && git config user.email t@t.t && git config user.name t
echo "# c" > CLAUDE.md
echo "# g" > GEMINI.md
node "$CLI" init >/dev/null
[ "$(grep -c 'flightwake:begin' CLAUDE.md)" = 1 ] || fail "CLAUDE.md 應恰好一份片段"
[ "$(grep -c 'flightwake:begin' GEMINI.md)" = 1 ] || fail "GEMINI.md 應恰好一份片段"
[ -f AGENTS.md ] && fail "已有指令檔時不應多建 AGENTS.md"
node "$CLI" init --agents=codex >/dev/null
[ "$(grep -c 'flightwake:begin' AGENTS.md)" = 1 ] || fail "--agents=codex 應建 AGENTS.md 並貼片段"
node "$CLI" init --agents=nonsense >/dev/null 2>&1 && fail "--agents 不認得的值應退出非零"
pass "多平台偵測與 --agents"

echo ""
echo "✅ smoke 全過"
