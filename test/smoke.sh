#!/usr/bin/env bash
# flightwake installer smoke test — runs init in temp git repos (fresh/rerun/--force/lang/update),
# verifying idempotency and user-data safety.
set -euo pipefail

# Keep tests deterministic and offline: never let the statusline spawn a background update check
export FLIGHTWAKE_NO_UPDATE_CHECK=1

FW="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() { echo "❌ FAIL: $1"; exit 1; }
pass() { echo "  ok: $1"; }

# 複製一份源碼來測(這樣可以安全地塞 .DS_Store 模擬 macOS 垃圾檔)
SRC="$TMP/fw-src"
cp -R "$FW" "$SRC"
touch "$SRC/skills/.DS_Store" "$SRC/skills/en/fw-record/.DS_Store" "$SRC/skills/zh-TW/fw-record/.DS_Store"
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

# 1b. 敏感資訊防護:模板與 fw-record skill 帶去識別化提醒(英文預設)
grep -q 'De-identification' .flightwake/TEMPLATE-record.md || fail "record 模板缺去識別化提醒"
grep -q 'De-identification' .claude/skills/fw-record/SKILL.md || fail "fw-record skill 缺去識別化檢查"
pass "去識別化提醒到位"

# 1c. 英文預設 + marker 帶 lang + hook 蓋章(LANG/FW_VERSION)
grep -q 'Where we are' .flightwake/STATE.md || fail "預設應裝英文模板"
grep -q 'lang=en' CLAUDE.md || fail "marker 應帶 lang=en"
grep -q "const LANG = 'en'" .flightwake/hooks/state-check.mjs || fail "state-check 應蓋 LANG=en"
FWV=$(node -e "console.log(require('$SRC/package.json').version)")
grep -q "const FW_VERSION = '$FWV'" .flightwake/hooks/statusline.mjs || fail "statusline 應蓋 FW_VERSION=$FWV"
pass "英文預設與蓋章"

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
node .flightwake/hooks/state-check.mjs --ci >/dev/null 2>&1 && fail "--ci 落後時應退出非零"
node .flightwake/hooks/state-check.mjs --ci --threshold=99 >/dev/null 2>&1 || fail "--ci 未達門檻時應通過"
node .flightwake/hooks/state-check.mjs --ci --threshold=abc >/dev/null 2>&1 && fail "--threshold 非法值應退回預設 3,不得靜默變成永不觸發"
out=$(echo '{"stop_hook_active":true}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "stop_hook_active 時應靜默(防循環)"
echo "updated" >> .flightwake/STATE.md
out=$(echo '{}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "STATE 有未 commit 更新時應視為新鮮"
pass "Stop hook 行為正確"

# 7b. health=green 需證據:最新 record 無 tests 欄 → hook 提醒;CI 只警告不失敗;補上 tests → 靜默
printf -- '---\nrecord_id: 990101-t\ndate: 2026-01-01\n---\n# t\n' > .flightwake/records/990101-t.md
node -e "const fs=require('fs');const f='.flightwake/STATE.md';fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/latest_record: .*/,'latest_record: records/990101-t.md'))"
git add -A && git commit -qm "record without tests"
out=$(echo '{}' | node .flightwake/hooks/state-check.mjs)
echo "$out" | grep -q '"decision":"block"' || fail "green 無 tests 證據時 hook 應提醒(got: $out)"
node .flightwake/hooks/state-check.mjs --ci >/dev/null 2>"$TMP/warn.txt" || fail "證據缺口在 CI 只警告,不得失敗"
grep -q 'tests' "$TMP/warn.txt" || fail "CI 應印出證據警告(got: $(cat "$TMP/warn.txt"))"
printf -- '---\nrecord_id: 990101-t\ndate: 2026-01-01\ntests: 1 passed\n---\n# t\n' > .flightwake/records/990101-t.md
git add -A && git commit -qm "add tests evidence"
out=$(echo '{}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "tests 已補時 hook 應靜默(got: $out)"
pass "health=green 需測試證據"

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

# 10. --private:全部寫入被 exclude、hook 進 settings.local.json、受追蹤的 CLAUDE.md 不碰、git status 乾淨、重跑冪等
REPO4="$TMP/repo4"
mkdir -p "$REPO4" && cd "$REPO4"
git init -q && git config user.email t@t.t && git config user.name t
echo "# c" > CLAUDE.md
git add CLAUDE.md && git commit -qm "base"
node "$CLI" init --private >/dev/null
grep -q 'flightwake:begin' .git/info/exclude || fail "--private 應在 .git/info/exclude 寫入標記區塊"
grep -q '^\.flightwake/$' .git/info/exclude || fail "exclude 缺 .flightwake/ 條目"
[ -f .claude/settings.local.json ] || fail "--private 應把 hook 寫進 settings.local.json"
[ -f .claude/settings.json ] && fail "--private 不應建 settings.json"
node -e "const s=require('./.claude/settings.local.json'); if(!JSON.stringify(s.hooks.Stop).includes('state-check.mjs')) process.exit(1)" \
  || fail "settings.local.json 無效或缺 Stop hook"
grep -q 'flightwake:begin' CLAUDE.md && fail "--private 不應碰受追蹤的 CLAUDE.md"
[ "$(grep -c 'flightwake:begin' CLAUDE.local.md)" = 1 ] || fail "--private 應把義務表寫進 CLAUDE.local.md"
[ -z "$(git status --porcelain)" ] || fail "--private 後 git status 應乾淨(got: $(git status --porcelain | tr '\n' ' '))"
node "$CLI" init --private >/dev/null
[ "$(grep -c 'flightwake:begin' .git/info/exclude)" = 1 ] || fail "重跑後 exclude 區塊重複"
[ "$(grep -c 'flightwake:begin' CLAUDE.local.md)" = 1 ] || fail "重跑後 CLAUDE.local.md 片段重複"
grep -q '^CLAUDE\.local\.md$' .git/info/exclude || fail "重跑後 exclude 掉了 CLAUDE.local.md 條目"
pass "--private 本機模式"

# 11. uninstall:框架檔全清、使用者資料與使用者 hook 保留、片段移除不傷其他內容、冪等
REPO5="$TMP/repo5"
mkdir -p "$REPO5" && cd "$REPO5"
git init -q && git config user.email t@t.t && git config user.name t
echo "# 專案說明" > CLAUDE.md
node "$CLI" init >/dev/null
echo "USER-DATA" >> .flightwake/STATE.md
node -e "const f='./.claude/settings.json',fs=require('fs'),s=require(f);s.hooks.Stop.push({hooks:[{type:'command',command:'echo user-hook'}]});fs.writeFileSync(f,JSON.stringify(s,null,2))"
node "$CLI" uninstall >/dev/null
[ -d .claude/skills/fw-coldstart ] && fail "uninstall 應刪 skills"
[ -f .flightwake/TEMPLATE-record.md ] && fail "uninstall 應刪 TEMPLATE-record"
[ -f .flightwake/hooks/state-check.mjs ] && fail "uninstall 應刪 hook 檔"
grep -q USER-DATA .flightwake/STATE.md || fail "uninstall 不應動使用者資料"
grep -q 'flightwake:begin' CLAUDE.md && fail "uninstall 應移除 CLAUDE.md 片段"
grep -q '專案說明' CLAUDE.md || fail "uninstall 不應動 CLAUDE.md 其他內容"
grep -q 'state-check' .claude/settings.json 2>/dev/null && fail "uninstall 應移除 flightwake Stop hook"
grep -q 'user-hook' .claude/settings.json || fail "uninstall 不應動使用者自己的 hook"
node "$CLI" uninstall >/dev/null || fail "重跑 uninstall 應成功(冪等)"
pass "uninstall 反向清除"

# 12. --private 安裝後 uninstall:exclude/CLAUDE.local.md/settings.local.json 全清;--purge 連使用者資料一起刪
REPO6="$TMP/repo6"
mkdir -p "$REPO6" && cd "$REPO6"
git init -q && git config user.email t@t.t && git config user.name t
echo "# c" > CLAUDE.md && git add CLAUDE.md && git commit -qm base
node "$CLI" init --private >/dev/null
node "$CLI" uninstall >/dev/null
grep -q 'flightwake:begin' .git/info/exclude 2>/dev/null && fail "uninstall 應移除 exclude 區塊"
[ -f CLAUDE.local.md ] && fail "uninstall 應刪由 flightwake 建的 CLAUDE.local.md"
[ -f .claude/settings.local.json ] && fail "uninstall 應刪只含 flightwake hook 的 settings.local.json"
[ -d .flightwake ] || fail "uninstall 預設應保留 .flightwake/"
node "$CLI" uninstall --purge >/dev/null
[ -d .flightwake ] && fail "--purge 應刪 .flightwake/"
[ -z "$(git status --porcelain)" ] || fail "--private 裝完再 uninstall --purge 後應無任何痕跡(got: $(git status --porcelain | tr '\n' ' '))"
pass "uninstall --private/--purge"

# 14. 模式混用不重複:--private 裝過再跑預設 init,片段與 hook 都不得裝第二份
REPO7="$TMP/repo7"
mkdir -p "$REPO7" && cd "$REPO7"
git init -q && git config user.email t@t.t && git config user.name t
echo "# c" > CLAUDE.md && git add CLAUDE.md && git commit -qm base
node "$CLI" init --private >/dev/null
node "$CLI" init >/dev/null
grep -q 'flightwake:begin' CLAUDE.md && fail "混用後片段被重複貼進 CLAUDE.md"
[ "$(grep -c 'flightwake:begin' CLAUDE.local.md)" = 1 ] || fail "混用後 CLAUDE.local.md 片段應仍恰好一份"
grep -q 'state-check' .claude/settings.json 2>/dev/null && fail "混用後 hook 被重複裝進 settings.json"
pass "模式混用不重複"

# 16. --statusline:選配儀表、輸出正常、他家設定不覆蓋、uninstall 清除
REPO8="$TMP/repo8"
mkdir -p "$REPO8" && cd "$REPO8"
git init -q && git config user.email t@t.t && git config user.name t
echo "# c" > CLAUDE.md
node "$CLI" init --statusline >/dev/null
node -e "const s=require('./.claude/settings.json'); if(!String(s.statusLine.command).includes('statusline.mjs')) process.exit(1)" \
  || fail "--statusline 應寫入 settings.statusLine"
echo '{}' | node .flightwake/hooks/statusline.mjs | grep -q 'flightwake' || fail "statusline 應輸出儀表"
echo '{}' | node .flightwake/hooks/statusline.mjs | grep -q 'fw-coldstart' || fail "剛開場應提示 /fw-coldstart"
node "$CLI" uninstall >/dev/null
[ -f .claude/settings.json ] && fail "uninstall 後全 flightwake 的 settings 應已空刪除"
[ -f .flightwake/hooks/statusline.mjs ] && fail "uninstall 應刪 statusline.mjs"
REPO9="$TMP/repo9"
mkdir -p "$REPO9" && cd "$REPO9"
git init -q && git config user.email t@t.t && git config user.name t
echo "# c" > CLAUDE.md
mkdir -p .claude && echo '{"statusLine":{"type":"command","command":"other-tool"}}' > .claude/settings.json
node "$CLI" init --statusline >/dev/null
node -e "const s=require('./.claude/settings.json'); if(s.statusLine.command!=='other-tool') process.exit(1)" \
  || fail "不得覆蓋他家 statusline"
pass "--statusline 儀表"

# 13. monorepo 政策:子目錄跑 init/uninstall 應退出非零並指路 git root
cd "$REPO3"
mkdir -p sub
cd sub
out=$(node "$CLI" init 2>&1) && fail "子目錄 init 應退出非零"
echo "$out" | grep -q 'one install per repo' || fail "子目錄 init 應說明 monorepo 政策(got: $out)"
node "$CLI" uninstall >/dev/null 2>&1 && fail "子目錄 uninstall 也應擋下"
pass "monorepo 政策:子目錄擋下指路"

# 17. --lang=zh-TW:中文模板/skill/片段、marker 帶 lang、CLI 輸出中文
REPO10="$TMP/repo10"
mkdir -p "$REPO10" && cd "$REPO10"
git init -q && git config user.email t@t.t && git config user.name t
echo "# c" > CLAUDE.md
out=$(node "$CLI" init --lang=zh-TW --statusline)
grep -q '現在在哪' .flightwake/STATE.md || fail "--lang=zh-TW 應裝中文模板"
grep -q '冷啟動' .claude/skills/fw-coldstart/SKILL.md || fail "--lang=zh-TW 應裝中文 skill"
grep -q 'flightwake 工作紀律' CLAUDE.md || fail "--lang=zh-TW 應貼中文片段"
grep -q 'lang=zh-TW' CLAUDE.md || fail "marker 應帶 lang=zh-TW"
echo "$out" | grep -q '使用者資料不覆蓋\|下一步' || fail "--lang=zh-TW CLI 輸出應為中文"
grep -q "const LANG = 'zh-TW'" .flightwake/hooks/statusline.mjs || fail "statusline 應蓋 LANG=zh-TW"
echo '{}' | node .flightwake/hooks/statusline.mjs | grep -q '開工先 /fw-coldstart' || fail "zh-TW 儀表提示應為中文"
node "$CLI" init --lang=nonsense >/dev/null 2>&1 && fail "--lang 不認得的值應退出非零"
pass "--lang=zh-TW 中文安裝"

# 18. update:偵測既有選項(lang/statusline)、force 刷新框架檔、不動使用者資料、沿用 marker 語言
echo "OLD-SKILL" >> .claude/skills/fw-record/SKILL.md
echo "SENTINEL-U" >> .flightwake/STATE.md
out=$(node "$CLI" update)
grep -q OLD-SKILL .claude/skills/fw-record/SKILL.md && fail "update 應刷新 skill"
grep -q SENTINEL-U .flightwake/STATE.md || fail "update 不應動使用者資料"
grep -q '冷啟動' .claude/skills/fw-coldstart/SKILL.md || fail "update 應沿用 zh-TW(不得換成英文)"
grep -q 'lang=zh-TW' CLAUDE.md || fail "update 後 marker 應保留 lang=zh-TW"
node -e "const s=require('./.claude/settings.json'); if(!String(s.statusLine.command).includes('statusline.mjs')) process.exit(1)" \
  || fail "update 應保留 statusline 安裝"
echo "$out" | grep -q '已更新到' || fail "update 收尾應報版本(zh-TW)"
pass "update 就地更新(zh-TW 沿用)"

# 19. 舊版 marker(無 lang 屬性)→ update 視為 zh-TW;未安裝的 repo update 應退出非零
node -e "const fs=require('fs');fs.writeFileSync('CLAUDE.md',fs.readFileSync('CLAUDE.md','utf8').replace(/flightwake:begin v[^\s]+ lang=zh-TW/,'flightwake:begin v0.8.2'))"
node "$CLI" update >/dev/null
grep -q '冷啟動' .claude/skills/fw-coldstart/SKILL.md || fail "無 lang 舊 marker 應視為 zh-TW"
grep -q 'lang=zh-TW' CLAUDE.md || fail "update 後 marker 應補上 lang=zh-TW"
REPO11="$TMP/repo11"
mkdir -p "$REPO11" && cd "$REPO11"
git init -q && git config user.email t@t.t && git config user.name t
node "$CLI" update >/dev/null 2>&1 && fail "未安裝的 repo 跑 update 應退出非零"
pass "舊 marker 相容與 update 防呆"

echo ""
echo "✅ smoke 全過"
