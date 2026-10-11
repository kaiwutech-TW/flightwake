#!/usr/bin/env bash
# flightwake installer smoke test — runs init in temp git repos (fresh/rerun/--force/lang/update),
# verifying idempotency and user-data safety.
set -euo pipefail

# Keep tests deterministic and offline: never let the statusline spawn a background update check
export FLIGHTWAKE_NO_UPDATE_CHECK=1
# FORCE_COLOR makes node colour console.log output even into a pipe (`1` becomes ESC[33m1ESC[39m) and breaks every
# string comparison below — TRAPS force-color-colours-piped-node-output
unset FORCE_COLOR

FW="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# macOS: mktemp gives /var/... (a symlink) while node's process.cwd() reports /private/var/... —
# resolve to the physical path so registry keys (recorded from cwd) match the paths tests compare against
TMP="$(cd "$TMP" && pwd -P)"
# Isolate the cross-repo registry — without this, every test repo below lands in the real ~/.flightwake/registry.json
export FLIGHTWAKE_HOME="$TMP/fw-home"
# Locale / Orca / personal Claude settings feed setup preselects, init's language hint and the add-on notice —
# pin them so a zh_TW, Orca or personal-status-line developer machine runs the same tests as CI
if [ -n "${LC_ALL:-}" ]; then export LC_CTYPE="$LC_ALL" LC_COLLATE="$LC_ALL"; unset LC_ALL; fi
export LC_MESSAGES=C
unset LANGUAGE ORCA_APP_VERSION ORCA_TERMINAL_HANDLE ORCA_WORKSPACE_ID
export CLAUDE_CONFIG_DIR="$TMP/claude-cfg"

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
echo "$out" | grep -q '/fw-record' && fail "hook 訊息不得寫死 Claude 的斜線指令(Codex 是 \$fw-record)"
# 同一份腳本三個宿主:Codex 的 Stop 也吃 block;Gemini 的 AfterAgent 要 deny
out=$(echo '{"hook_event_name":"Stop","turn_id":"t1","model":"gpt"}' | node .flightwake/hooks/state-check.mjs)
echo "$out" | grep -q '"decision":"block"' || fail "Codex 形狀的 Stop stdin 應 block(got: $out)"
out=$(echo '{"hook_event_name":"AfterAgent","prompt":"x","prompt_response":"y"}' | node .flightwake/hooks/state-check.mjs)
echo "$out" | grep -q '"decision":"deny"' || fail "Gemini AfterAgent 應回 deny(got: $out)"
node .flightwake/hooks/state-check.mjs --ci >/dev/null 2>&1 && fail "--ci 落後時應退出非零"
node .flightwake/hooks/state-check.mjs --ci --threshold=99 >/dev/null 2>&1 || fail "--ci 未達門檻時應通過"
node .flightwake/hooks/state-check.mjs --ci --threshold=abc >/dev/null 2>&1 && fail "--threshold 非法值應退回預設 3,不得靜默變成永不觸發"
out=$(echo '{"stop_hook_active":true}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "stop_hook_active 時應靜默(防循環)"
echo "updated" >> .flightwake/STATE.md
out=$(echo '{}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "STATE 有未 commit 更新時應視為新鮮"
pass "Stop hook 行為正確"

# 7a. bot commit 不計入落後:依賴升版不會讓 STATE 過時,且 bot 的 PR 無法自己補 STATE
git add -A && git commit -qm "state update"
for i in 4 5 6; do
  echo "$i" > "f$i.txt" && git add "f$i.txt"
  git -c user.name='dependabot[bot]' -c user.email='49699333+dependabot[bot]@users.noreply.github.com' \
    commit -qm "chore(deps): bump $i"
done
out=$(echo '{}' | node .flightwake/hooks/state-check.mjs)
[ -z "$out" ] || fail "3 個 bot commit 不該觸發落後提醒(got: $out)"
node .flightwake/hooks/state-check.mjs --ci >/dev/null 2>&1 || fail "--ci 面對純 bot commit 應通過"
echo "human" > f7.txt && git add f7.txt && git commit -qm "human work"
node .flightwake/hooks/state-check.mjs --ci --threshold=1 >/dev/null 2>&1 && fail "人的 commit 仍須計入(門檻 1 應觸發)"
pass "bot commit 不計入落後、人的 commit 仍計入"

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
# Codex 方言:義務表寫 $fw-…、skill 落 .agents/skills、Stop hook 進 .codex/hooks.json
grep -q '`\$fw-coldstart`' AGENTS.md || fail "AGENTS.md 應以 Codex 語法 \$fw-coldstart 指涉 skill"
grep -q '`/fw-' AGENTS.md && fail "AGENTS.md 不得殘留 Claude 的 /fw- 斜線指令(Codex 沒這指令)"
grep -q '\.agents/skills' AGENTS.md || fail "AGENTS.md 應說明 skill 在 .agents/skills"
for s in fw-coldstart fw-record fw-trap fw-handoff; do
  [ -f ".agents/skills/$s/SKILL.md" ] || fail ".agents/skills/$s 應就位(Codex/Gemini 讀這裡)"
done
node -e "const s=require('./.codex/hooks.json'); if(!JSON.stringify(s.hooks.Stop).includes('state-check.mjs')) process.exit(1)" \
  || fail ".codex/hooks.json 無效或缺 Stop hook"
grep -q 'CLAUDE_PROJECT_DIR' .codex/hooks.json && fail "Codex hook 不得依賴 \$CLAUDE_PROJECT_DIR(Codex 不設這個變數)"
[ -f .gemini/settings.json ] && fail "沒有 GEMINI.md 時不該裝 Gemini hook"
node "$CLI" init >/dev/null
[ "$(grep -c 'flightwake:begin' AGENTS.md)" = 1 ] || fail "重跑後 AGENTS.md 片段重複"
[ "$(node -e "console.log(require('./.codex/hooks.json').hooks.Stop.length)")" = 1 ] || fail "重跑後 Codex Stop hook 重複"
pass "無指令檔 → 建 AGENTS.md(Codex 方言 + .agents/skills + .codex hook)"

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
# 各平台各自的方言:Claude 保留 /fw-,Gemini 用裸名;Gemini 的 hook 是 AfterAgent;Codex 沒被偵測到就不裝 .codex
grep -q '`/fw-coldstart`' CLAUDE.md || fail "CLAUDE.md 應保留 Claude 的 /fw-coldstart"
grep -q '`fw-coldstart`' GEMINI.md || fail "GEMINI.md 應以裸名 fw-coldstart 指涉 skill"
grep -q '`/fw-\|`\$fw-' GEMINI.md && fail "GEMINI.md 不得出現 /fw- 或 \$fw- 指令形式"
[ -f .agents/skills/fw-coldstart/SKILL.md ] || fail "GEMINI.md 存在時 skill 應落 .agents/skills"
node -e "const s=require('./.gemini/settings.json'); if(!JSON.stringify(s.hooks.AfterAgent).includes('state-check.mjs')) process.exit(1)" \
  || fail ".gemini/settings.json 無效或缺 AfterAgent hook"
[ -f .codex/hooks.json ] && fail "未偵測到 Codex 時不該裝 .codex/hooks.json"
node "$CLI" init --agents=codex >/dev/null
[ "$(grep -c 'flightwake:begin' AGENTS.md)" = 1 ] || fail "--agents=codex 應建 AGENTS.md 並貼片段"
[ -f .codex/hooks.json ] || fail "--agents=codex 應裝 .codex/hooks.json"
node "$CLI" init --agents=nonsense >/dev/null 2>&1 && fail "--agents 不認得的值應退出非零"
pass "多平台偵測與 --agents(各平台方言)"

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

# 11b. Codex/Gemini 對稱:uninstall 只拿走自己的 skill 與 hook,使用者放在 .agents/skills 與 hooks.json 的東西不動;
#      flightwake 建的空目錄(.agents/.codex/.gemini)清掉
REPO5B="$TMP/repo5b"
mkdir -p "$REPO5B" && cd "$REPO5B"
git init -q && git config user.email t@t.t && git config user.name t
echo "# 專案說明" > AGENTS.md
echo "# g" > GEMINI.md
node "$CLI" init >/dev/null
mkdir -p .agents/skills/mine && echo "user skill" > .agents/skills/mine/SKILL.md
node -e "const f='./.codex/hooks.json',fs=require('fs'),s=require(f);s.hooks.Stop.push({hooks:[{type:'command',command:'echo user-hook'}]});fs.writeFileSync(f,JSON.stringify(s,null,2))"
node "$CLI" uninstall >/dev/null
[ -d .agents/skills/fw-coldstart ] && fail "uninstall 應刪 .agents/skills 的 fw skill"
[ -f .agents/skills/mine/SKILL.md ] || fail "uninstall 不應動使用者自己的 .agents/skills"
grep -q 'state-check' .codex/hooks.json && fail "uninstall 應移除 Codex Stop hook"
grep -q 'user-hook' .codex/hooks.json || fail "uninstall 不應動使用者自己的 Codex hook"
[ -f .gemini/settings.json ] && fail "只有 flightwake 內容的 .gemini/settings.json 應被刪除"
[ -d .gemini ] && fail "空的 .gemini 目錄應被清掉"
grep -q 'flightwake:begin' AGENTS.md && fail "uninstall 應移除 AGENTS.md 片段"
grep -q '專案說明' AGENTS.md || fail "uninstall 不應動 AGENTS.md 其他內容"
grep -q "# g" GEMINI.md || fail "uninstall 不應動使用者自己建的 GEMINI.md"
REPO5C="$TMP/repo5c"
mkdir -p "$REPO5C" && cd "$REPO5C"
git init -q && git config user.email t@t.t && git config user.name t
node "$CLI" init >/dev/null && node "$CLI" uninstall >/dev/null
[ -d .agents ] && fail "無指令檔安裝後 uninstall 應清掉 .agents"
[ -d .codex ] && fail "無指令檔安裝後 uninstall 應清掉 .codex"
[ -f AGENTS.md ] && fail "flightwake 建的 AGENTS.md 清空後應刪除"
pass "uninstall 對 Codex/Gemini 對稱"

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
# 16.1 token 與 API 等值費用:費用照 stdin 的 cost.total_cost_usd 印;token 從 transcript 加總、同一 message.id 只算一次
printf '%s\n' '{"type":"assistant","message":{"id":"m1","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":1000,"cache_creation_input_tokens":200}}}' \
  '{"type":"assistant","message":{"id":"m1","usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":1000,"cache_creation_input_tokens":200}}}' \
  '{"type":"assistant","message":{"id":"m2","usage":{"input_tokens":5,"output_tokens":5,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}}' > sl-transcript.jsonl
sl_out=$(printf '{"cost":{"total_cost_usd":1.2345},"transcript_path":"%s"}' "$PWD/sl-transcript.jsonl" | node .flightwake/hooks/statusline.mjs)
echo "$sl_out" | grep -q '1.36k tok' || fail "16.1 儀表應從 transcript 加總 token(去重後 1360 → 1.36k):$sl_out"
echo "$sl_out" | grep -q '≈\$1.23' || fail "16.1 儀表應印 API 等值費用 ≈\$1.23:$sl_out"
echo '{}' | node .flightwake/hooks/statusline.mjs | grep -q 'tok' && fail "16.1 沒有 transcript 與 cost 時不該印 token/費用"
rm -f sl-transcript.jsonl
# 16.2 session fleet 欄位(F7):別的 session 在等你(blocked ≥2s、心跳新鮮、非本 session、非 contested)→ 品牌後第二欄紅色 ⛔;
#      symlink 不讀;120 s 內沒改過的檔不讀(so:心跳新鮮但 mtime 舊);沒有 blocked 就沒有 ⛔;四語(en 預設、zh-TW/zh-CN/ja 實裝,含 n>1);
#      FLIGHTWAKE_HOME 空字串退回 HOME、相對路徑忽略;相對的 HOME 不用
#      「未滿 2s 不算」用獨立資料夾、seed 後立刻量(不跟後面的安裝共用時間,慢機器也不會過 2s 而變成被算進去)
FSEED="$TMP/fleet-seed.cjs"
cat > "$FSEED" <<'SEED'
// node fleet-seed.cjs <dir> <id> '<js object expr using now>' [mtimeAgoMs]
const fs = require('fs');
const [dir, id, expr = '({})', ago] = process.argv.slice(2);
const now = Date.now();
const o = new Function('now', 'return ' + expr)(now);
const rec = {
  schema: 'flightwake.session/1', mod: '0.2.0', sessionId: id, instance: 'seed-' + id, state: 'idle', why: 'session.start',
  stateSince: now - 5000, seq: 1, heartbeatAt: now - 1000, heartbeatMs: 30000, startedAt: now - 600000,
  root: '/x/' + id, repoRoot: null, launchCwd: '/x/' + id, lang: 'en', surface: 'terminal', blocked: null, activity: null,
  inFlight: 0, turns: 2, lastTurn: null, ended: null, resume: { id, resumable: true }, transcript: null, parent: null,
  contested: false, host: {}, ...o,
};
fs.mkdirSync(dir, { recursive: true });
const p = dir + '/' + id + '.json';
fs.writeFileSync(p, JSON.stringify(rec, null, 2) + '\n');
if (ago) { const t = (now - Number(ago)) / 1000; fs.utimesSync(p, t, t); }
SEED
fseed() { node "$FSEED" "$@"; }
BLK='state:"blocked",stateSince:now-10000,blocked:{kind:"permission",tool:"Bash",target:null,agent:false,since:now-10000}'
GH="$TMP/gauge-home"; GS="$GH/sessions"
fseed "$GS" sa "({$BLK,heartbeatAt:now-5000,root:'/x/orca'})"
fseed "$GS" me "({$BLK})"
fseed "$GS" sc "({$BLK,heartbeatAt:now-180000})"
fseed "$GS" se "({$BLK,contested:true})"
fseed "$GS" so "({$BLK,root:'/x/old'})" 180000
ln -s "$GS/sa.json" "$GS/sf.json"
fgauge() { printf '{"session_id":"me"}' | FLIGHTWAKE_HOME="${2:-$GH}" node "${1:-.flightwake/hooks/statusline.mjs}"; }
sl_out=$(fgauge)
echo "$sl_out" | grep -q '⛔ orca blocked' || fail "16.2 只有 sa 該算(me/心跳舊/contested/symlink/mtime 超過 120 s 都不算):$sl_out"
GH3="$TMP/gauge-home3"
fseed "$GH3/sessions" sd "({state:'blocked',stateSince:now-500,blocked:{kind:'question',tool:'AskUserQuestion',target:null,agent:false,since:now-500}})"
sd_out=$(fgauge "" "$GH3")
echo "$sd_out" | grep -q '⛔' && fail "16.2 blocked 未滿 2s 不該算:$sd_out"
node -e 'const p=process.argv[1].split(" │ "); if(!/flightwake/.test(p[0])||!p[1].startsWith("\x1b[31m⛔")) process.exit(1)' "$sl_out" || fail "16.2 ⛔ 欄位應緊接品牌之後、紅色:$sl_out"
fseed "$GS" sg "({$BLK,root:'/x/web'})"
fgauge | grep -q '⛔ 2 blocked' || fail "16.2 兩個 blocked 應顯示 ⛔ 2 blocked:$(fgauge)"
rm -f "$GS/sa.json" "$GS/sg.json" "$GS/sf.json"
fgauge | grep -q '⛔' && fail "16.2 沒有可算的 blocked 時不該有 ⛔:$(fgauge)"
fseed "$GS" sa "({$BLK,root:'/x/orca'})"
for l in zh-TW zh-CN ja; do
  case $l in
    zh-TW) k='⛔ orca 等你回覆'; k2='⛔ 2 個 session 等你回覆';;
    zh-CN) k='⛔ orca 等你回复'; k2='⛔ 2 个 session 等你回复';;
    ja) k='⛔ orca が応答待ち'; k2='⛔ 2 件が応答待ち';;
  esac
  R="$TMP/repo8-$l"; mkdir -p "$R" && (cd "$R" && git init -q && echo "# c" > CLAUDE.md && node "$CLI" init --lang=$l --statusline >/dev/null)
  fgauge "$R/.flightwake/hooks/statusline.mjs" | grep -q "$k" || fail "16.2 $l 儀表應印「$k」:$(fgauge "$R/.flightwake/hooks/statusline.mjs")"
  fseed "$GS" sg "({$BLK,root:'/x/web'})"
  fgauge "$R/.flightwake/hooks/statusline.mjs" | grep -q "$k2" || fail "16.2 $l 儀表兩個 blocked 應印「$k2」:$(fgauge "$R/.flightwake/hooks/statusline.mjs")"
  rm -f "$GS/sg.json"
done
GH2="$TMP/gauge-home2"; fseed "$GH2/.flightwake/sessions" sh "({$BLK,root:'/x/home'})"
printf '{"session_id":"me"}' | FLIGHTWAKE_HOME= HOME="$GH2" node .flightwake/hooks/statusline.mjs | grep -q '⛔ home blocked' || fail "16.2 空的 FLIGHTWAKE_HOME 應退回 HOME/.flightwake"
fseed "$PWD/relhome/sessions" sr "({$BLK,root:'/x/rel'})"
out=$(printf '{"session_id":"me"}' | FLIGHTWAKE_HOME=relhome HOME="$GH2" node .flightwake/hooks/statusline.mjs)
echo "$out" | grep -q '⛔ home blocked' || fail "16.2 相對的 FLIGHTWAKE_HOME 應忽略、改用 HOME:$out"
echo "$out" | grep -q 'rel' && fail "16.2 相對的 FLIGHTWAKE_HOME 不得被讀:$out"
printf '{"session_id":"me"}' | FLIGHTWAKE_HOME=relhome HOME= USERPROFILE= node .flightwake/hooks/statusline.mjs | grep -q '⛔' && fail "16.2 沒有可用的 base 時不該有 ⛔"
fseed "$PWD/relhome/.flightwake/sessions" sr2 "({$BLK,root:'/x/rel2'})"
printf '{"session_id":"me"}' | FLIGHTWAKE_HOME= HOME=relhome USERPROFILE= node .flightwake/hooks/statusline.mjs | grep -q '⛔' && fail "16.2 相對的 HOME 不得當 base(會落在工作目錄)"
rm -rf relhome
pass "16.2 儀表 ⛔ 欄位:只算別的 session 的新鮮 blocked(≥2s、非 contested、不經 symlink)、緊接品牌、四語(含 n>1)、base 規則同 mod"
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

# 17b. zh-CN / ja:模板、skill、片段、儀表、state-check 都要跟著語言走
for L in zh-CN ja; do
  D="$TMP/repo10-$L"
  mkdir -p "$D" && cd "$D"
  git init -q && git config user.email t@t.t && git config user.name t
  echo "# c" > CLAUDE.md
  node "$CLI" init --lang="$L" --statusline >/dev/null
  grep -q "lang=$L" CLAUDE.md || fail "marker 應帶 lang=$L"
  grep -q "const LANG = '$L'" .flightwake/hooks/statusline.mjs || fail "$L statusline 應蓋 LANG=$L"
  grep -q "const LANG = '$L'" .flightwake/hooks/state-check.mjs || fail "$L state-check 應蓋 LANG=$L"
  [ -s .claude/skills/fw-coldstart/SKILL.md ] || fail "$L 應裝 skill"
done
cd "$TMP/repo10-zh-CN"
grep -q '现在在哪' .flightwake/STATE.md || fail "zh-CN 應裝简体模板"
grep -q '开工先 /fw-coldstart' <(echo '{}' | node .flightwake/hooks/statusline.mjs) || fail "zh-CN 儀表應为简体"
node .flightwake/hooks/state-check.mjs --ci 2>&1 | grep -q '新鲜' || fail "zh-CN state-check 輸出應为简体"
cd "$TMP/repo10-ja"
grep -q '今どこにいるか' .flightwake/STATE.md || fail "ja 應裝日文模板"
grep -q 'まず /fw-coldstart から' <(echo '{}' | node .flightwake/hooks/statusline.mjs) || fail "ja 儀表應為日文"
node .flightwake/hooks/state-check.mjs --ci 2>&1 | grep -q '最新' || fail "ja state-check 輸出應為日文"
pass "zh-CN / ja 安裝內容與輸出"

# 17c. 手改框架檔後重裝 → 逐檔點名被覆蓋;使用者資料不列入
cd "$TMP/repo10-ja"
printf '\nMANUAL-EDIT\n' >> .claude/skills/fw-coldstart/SKILL.md
echo "USER-DATA" >> .flightwake/STATE.md
out=$(node "$CLI" init --lang=ja --force --statusline)
# 只取警告區塊本身(到空行為止)——init 其餘輸出也提到 STATE.md,整段抓會誤判
warn=$(echo "$out" | awk '/ローカルの変更/{f=1} f&&/^$/{exit} f')
echo "$warn" | grep -q 'fw-coldstart/SKILL.md' || fail "覆蓋本地修改應點名該檔(got: $out)"
echo "$warn" | grep -q 'STATE.md' && fail "使用者資料不該出現在覆蓋清單"
grep -q USER-DATA .flightwake/STATE.md || fail "使用者資料不得被覆蓋"
# 版本/語言不同時內容本來就會變,不得誤報
cd "$TMP/repo10-zh-CN"
out=$(node "$CLI" init --lang=ja --force --statusline)
echo "$out" | grep -q 'had local edits\|本地修改\|ローカルの変更' && fail "切換語言不得誤報本地修改"
cd "$REPO10"   # 後續測試接續 zh-TW 這個 repo,別把 cwd 留在別處
pass "覆蓋本地修改時逐檔點名、切語言不誤報"

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

# 20. registry:init 登記 repo 路徑、update 保留 registered 日期、uninstall 移除、壞檔不炸安裝也不被覆蓋
REG="$FLIGHTWAKE_HOME/registry.json"
node -e "const r=require('$REG'); if(!r.repos['$TMP/repo']) process.exit(1)" || fail "init 後 registry 應含 repo 路徑"
REPO12="$TMP/repo12"
mkdir -p "$REPO12" && cd "$REPO12"
git init -q && git config user.email t@t.t && git config user.name t
node "$CLI" init >/dev/null
node -e "const r=require('$REG'); if(r.repos['$REPO12']?.fw_version!=='$FWV') process.exit(1)" || fail "registry 條目應記 fw_version=$FWV"
reg1=$(node -e "console.log(require('$REG').repos['$REPO12'].registered)")
node "$CLI" update >/dev/null
reg2=$(node -e "console.log(require('$REG').repos['$REPO12'].registered)")
[ "$reg1" = "$reg2" ] || fail "update 不應改 registered 日期(got: $reg1 → $reg2)"
node "$CLI" uninstall >/dev/null
node -e "const r=require('$REG'); if(r.repos['$REPO12']) process.exit(1)" || fail "uninstall 應移除 registry 條目"
echo 'not json' > "$REG"
node "$CLI" init >/dev/null || fail "registry 壞檔不得讓 init 失敗"
grep -q 'not json' "$REG" || fail "壞 registry 應原樣保留供檢查,不得被覆蓋"
node "$CLI" uninstall >/dev/null || fail "registry 壞檔不得讓 uninstall 失敗"
pass "registry 登記/移除/壞檔容錯"

# 21. roles 附加元件:init 不裝;install/apply/dry-run/冪等/跨 repo/src 回溯/撤角色/路由衝突/remove/uninstall
TEAM="$TMP/team"; HOME_R="$TEAM/plan"; WORK_R="$TEAM/work"
for r in "$HOME_R" "$WORK_R"; do
  mkdir -p "$r" && (cd "$r" && git init -q && git config user.email t@t.t && git config user.name t)
done
cd "$HOME_R"
node "$CLI" roles apply >/dev/null 2>&1 && fail "未 init 的 repo 跑 roles 應退出非零"
echo "# 使用者自己的規則" > AGENTS.md; echo "# plan 說明" > CLAUDE.md
node "$CLI" init --lang=zh-TW >/dev/null
[ -d .claude/skills/fw-roles ] && fail "init 不應安裝 fw-roles(選配)"
node "$CLI" roles >/dev/null
[ -f .claude/skills/fw-roles/SKILL.md ] && [ -f .agents/skills/fw-roles/presets/pm.md ] || fail "roles install 應裝 skill 與 presets 到兩個 skill 樹"
grep -q '禁止' .claude/skills/fw-roles/presets/reviewer.md || fail "zh-TW 安裝應帶中文 presets"
(cd "$WORK_R" && echo "# work" > CLAUDE.md && node "$CLI" init --agents=claude,codex --lang=zh-TW >/dev/null)
cat > .flightwake/ROLES.md <<'ROLES'
# 團隊角色
說明文字會被忽略。

## pm — 專案經理
agent: codex
repo: .

**你做**
- 派工
**禁止**
- 寫程式碼 PM-NEVER

## lead — 技術總監
agent: claude

**你做**
- 審技術 LEAD-BODY

## coder — 主寫程式
agent: claude
repo: ../work

**你做**
- 寫程式 CODER-BODY

## reviewer — 審核
agent: codex
repo: ../work

**你做**
- 審核 REVIEWER-BODY
ROLES
before=$(cat AGENTS.md CLAUDE.md "$WORK_R/AGENTS.md" "$WORK_R/CLAUDE.md" | shasum)
node "$CLI" roles apply --dry-run | grep -q 'PM-NEVER' || fail "dry-run 應印出將寫入的區塊"
[ "$before" = "$(cat AGENTS.md CLAUDE.md "$WORK_R/AGENTS.md" "$WORK_R/CLAUDE.md" | shasum)" ] || fail "dry-run 不得寫檔"
node "$CLI" roles apply >/dev/null || fail "roles apply 應成功"
head -1 AGENTS.md | grep -q 'flightwake-roles:begin' || fail "角色區塊應放在指令檔最前面"
grep -q 'PM-NEVER' AGENTS.md && ! grep -q 'LEAD-BODY' AGENTS.md || fail "plan/AGENTS.md 應只有 pm 角色"
grep -q 'LEAD-BODY' CLAUDE.md && ! grep -q 'PM-NEVER' CLAUDE.md || fail "plan/CLAUDE.md 應只有 lead 角色"
grep -q '使用者自己的規則' AGENTS.md && grep -q 'flightwake:begin' AGENTS.md || fail "apply 不得動使用者內容與義務表"
grep -q 'CODER-BODY' "$WORK_R/CLAUDE.md" && grep -q 'REVIEWER-BODY' "$WORK_R/AGENTS.md" || fail "跨 repo 角色應寫進 work"
grep -q 'src=../plan/.flightwake/ROLES.md' "$WORK_R/AGENTS.md" || fail "區塊 marker 應帶相對 src"
grep -q "$WORK_R" AGENTS.md && grep -q '← 你' AGENTS.md || fail "團隊清單應列他 repo 路徑並標出自己"
grep -q '不適用於你' CLAUDE.md || fail "同資料夾有他廠牌角色時應提示"
snap=$(cat AGENTS.md CLAUDE.md "$WORK_R/AGENTS.md" "$WORK_R/CLAUDE.md" | shasum)
node "$CLI" roles apply >/dev/null
[ "$snap" = "$(cat AGENTS.md CLAUDE.md "$WORK_R/AGENTS.md" "$WORK_R/CLAUDE.md" | shasum)" ] || fail "roles apply 重跑應冪等"
[ "$(grep -c 'flightwake-roles:begin' AGENTS.md)" = 1 ] || fail "區塊應恰好一份"
(cd "$WORK_R" && node "$CLI" roles apply >/dev/null) || fail "無 ROLES.md 的成員 repo 應能從 src 回溯套用"
[ "$snap" = "$(cat AGENTS.md CLAUDE.md "$WORK_R/AGENTS.md" "$WORK_R/CLAUDE.md" | shasum)" ] || fail "從成員 repo 套用結果應一致"
# 撤掉 reviewer → work/AGENTS.md 的區塊被拿掉,義務表留著
node -e "const f='.flightwake/ROLES.md',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/## reviewer[\s\S]*$/,''))"
node "$CLI" roles apply >/dev/null
grep -q 'flightwake-roles:begin' "$WORK_R/AGENTS.md" && fail "撤掉的角色區塊應被移除"
grep -q 'flightwake:begin' "$WORK_R/AGENTS.md" || fail "撤角色不得動義務表"
# 路由衝突:同資料夾兩個 claude → 退出非零、不寫檔
cp .flightwake/ROLES.md "$TMP/roles.bak"
printf '\n## qa — 測試\nagent: claude\n\n- QA\n' >> .flightwake/ROLES.md
snap=$(cat AGENTS.md CLAUDE.md | shasum)
node "$CLI" roles apply >/dev/null 2>&1 && fail "同資料夾同廠牌兩角色應退出非零"
[ "$snap" = "$(cat AGENTS.md CLAUDE.md | shasum)" ] || fail "驗證失敗時不得寫任何檔"
printf '\n## x — 未知\nagent: cursor\n\n- X\n' > .flightwake/ROLES.md
node "$CLI" roles apply >/dev/null 2>&1 && fail "不認得的 agent 應退出非零"
cp "$TMP/roles.bak" .flightwake/ROLES.md
# update 只刷新已裝的 fw-roles;work 沒裝就不會長出來
echo "local edit" >> .claude/skills/fw-roles/SKILL.md
node "$CLI" update >/dev/null
grep -q 'local edit' .claude/skills/fw-roles/SKILL.md && fail "update 應刷新已安裝的 fw-roles"
(cd "$WORK_R" && node "$CLI" update >/dev/null); [ -d "$WORK_R/.claude/skills/fw-roles" ] && fail "update 不得替未安裝者裝 fw-roles"
# remove:區塊與 skill 清掉、ROLES.md 保留;uninstall 也清
node "$CLI" roles remove >/dev/null
grep -q 'flightwake-roles' AGENTS.md CLAUDE.md && fail "roles remove 應移除本 repo 角色區塊"
[ -d .claude/skills/fw-roles ] && fail "roles remove 應移除 fw-roles skill"
[ -f .flightwake/ROLES.md ] || fail "ROLES.md 是使用者資料,不得刪"
(cd "$WORK_R" && node "$CLI" uninstall >/dev/null)
grep -q 'flightwake-roles' "$WORK_R/CLAUDE.md" && fail "uninstall 應移除角色區塊"
grep -q '# work' "$WORK_R/CLAUDE.md" || fail "uninstall 不得傷使用者內容"
pass "roles 附加元件(選配/跨 repo/冪等/撤角色/路由衝突/remove/uninstall)"

# 22. roles v2:座位表/待命原生定義/card/assign/manifest 清理與衝突/escape/含空白路徑
V2="$TMP/v2 team"; P="$V2/plan"; A="$V2/app x"
for r in "$P" "$A"; do mkdir -p "$r" && (cd "$r" && git init -q && git config user.email t@t.t && git config user.name t && echo "# 使用者內容" > CLAUDE.md && echo "# 使用者規則" > AGENTS.md && node "$CLI" init --lang=zh-TW >/dev/null); done
cd "$P"
cat > .flightwake/ROLES.md <<'ROLES'
# 團隊角色

## pm — 專案經理
**你做**
- 派工 PM-BODY

## coder — 寫手
**你做**
- 寫程式 CODER-BODY

## reviewer — 審核
**你做**
- 審核

## security — 資安
**你做**
- 審 """ 引號 \ 反斜線 🔐
### When to call
- 碰到登入、金流

## seats
| repo | vendor | role |
|---|---|---|
| . | codex | pm |
| ../app x | claude | coder |
| ../app x | codex | reviewer |
ROLES
node "$CLI" roles apply >/dev/null || fail "v2 apply 應成功(含空白路徑)"
grep -q 'PM-BODY' AGENTS.md && grep -q 'CODER-BODY' "$A/CLAUDE.md" || fail "座位表應決定區塊寫到哪"
[ -f "$A/.claude/agents/fw-security.md" ] && [ -f "$A/.codex/agents/fw-security.toml" ] && [ -f .codex/agents/fw-security.toml ] || fail "每個座位的 (repo,vendor) 都應產生待命原生定義"
ls .codex/agents/fw-coder.toml .codex/agents/fw-pm.toml "$A/.claude/agents/fw-reviewer.md" 2>/dev/null | grep -q . && fail "有座位的角色不應產生原生定義(會繞過分工)"
python3 -c "import tomllib,sys; d=tomllib.load(open(sys.argv[1],'rb')); assert d['name']=='fw-security' and '\"\"\"' in d['developer_instructions'] and '\\\\' in d['developer_instructions'] and '🔐' in d['developer_instructions']" "$A/.codex/agents/fw-security.toml" || fail "TOML 應可解析且 escape 正確"
head -3 "$A/.claude/agents/fw-security.md" | grep -q '^name: "fw-security"' || fail "Claude 定義 frontmatter 應正確"
grep -q '碰到登入' "$A/.claude/agents/fw-security.md" && grep -q '待命' AGENTS.md || fail "When to call 應進描述與團隊名單"
grep -q '主 session' AGENTS.md || fail "座位區塊應限定主 session 並允許派工卡覆寫"
[ -f .flightwake/roles-manifest.json ] || fail "應寫 manifest"
snap=$(cd "$V2" && find . -path '*/.git' -prune -o -type f -print0 | sort -z | xargs -0 shasum | shasum)
node "$CLI" roles apply >/dev/null
[ "$snap" = "$(cd "$V2" && find . -path '*/.git' -prune -o -type f -print0 | sort -z | xargs -0 shasum | shasum)" ] || fail "v2 apply 重跑應冪等"
# card:stdout 只有卡片、不帶座位身分;錯誤走 stderr 且非零
node "$CLI" roles card security > "$TMP/card.out" 2>"$TMP/card.err" || fail "roles card 應成功"
grep -q '角色卡' "$TMP/card.out" && grep -q '覆寫' "$TMP/card.out" && ! grep -q '← 你' "$TMP/card.out" || fail "角色卡內容不對"
[ -s "$TMP/card.err" ] && fail "card 成功時 stderr 應為空"
node "$CLI" roles card nope > "$TMP/card.out" 2>"$TMP/card.err" && fail "未知角色 card 應退出非零"
[ -s "$TMP/card.out" ] && fail "card 失敗時 stdout 必須為空(避免派出沒角色的 worker)"
# 使用者同名檔 → 衝突、什麼都不寫
echo "我自己的 agent" > "$A/.claude/agents/fw-qa.md"
printf '\n## qa — 測試\n**你做**\n- QA\n' >> .flightwake/ROLES.md
snap=$(cat AGENTS.md "$A/CLAUDE.md" | shasum)
node "$CLI" roles apply >/dev/null 2>&1 && fail "撞到使用者同名檔應退出非零"
grep -q '我自己的 agent' "$A/.claude/agents/fw-qa.md" && [ "$snap" = "$(cat AGENTS.md "$A/CLAUDE.md" | shasum)" ] || fail "衝突時不得覆寫或寫入任何檔"
rm "$A/.claude/agents/fw-qa.md"; node "$CLI" roles apply >/dev/null || fail "排除衝突後應可套用"
# 手改產生檔 → 衝突;刪掉後重跑收斂
echo "hand edit" >> "$A/.codex/agents/fw-security.toml"
node "$CLI" roles apply >/dev/null 2>&1 && fail "手改過的產生檔應視為衝突"
rm "$A/.codex/agents/fw-security.toml"; node "$CLI" roles apply >/dev/null || fail "刪掉手改檔後重跑應收斂"
# 撤角色 → 各處原生定義被清;整個 repo 移出座位表 → 舊區塊與原生檔被清(manifest)
node -e "const f='.flightwake/ROLES.md',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\n## qa[\s\S]*$/,'\n'))"
node "$CLI" roles apply >/dev/null
[ -f "$A/.claude/agents/fw-qa.md" ] && fail "撤掉的角色原生定義應被清掉"
node -e "const f='.flightwake/ROLES.md',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(/\| \.\.\/app x \| (claude|codex) \| (coder|reviewer) \|\n/g,''))"
node "$CLI" roles apply >/dev/null || fail "移除 repo 座位後 apply 應成功"
grep -q 'flightwake-roles' "$A/CLAUDE.md" "$A/AGENTS.md" && fail "移出座位表的 repo 舊區塊應被清(manifest 追蹤)"
[ -f "$A/.codex/agents/fw-security.toml" ] && fail "移出座位表的 repo 原生定義應被清"
grep -q '# 使用者內容' "$A/CLAUDE.md" && grep -q 'flightwake:begin' "$A/AGENTS.md" || fail "清理不得傷使用者內容與義務表"
# assign:只改座位表那一格;--dry-run 不寫;座位不存在需 --add;舊格式拒絕
cp .flightwake/ROLES.md "$TMP/r.before"
node "$CLI" roles assign .:codex reviewer --dry-run >/dev/null || fail "assign --dry-run 應成功"
cmp -s .flightwake/ROLES.md "$TMP/r.before" || fail "assign --dry-run 不得改 ROLES.md"
node "$CLI" roles assign .:codex reviewer >/dev/null || fail "assign 應成功"
[ "$(diff "$TMP/r.before" .flightwake/ROLES.md | grep -c '^[<>]')" = 2 ] || fail "assign 應只改一行"
grep -q '| . | codex | reviewer |' .flightwake/ROLES.md && grep -q '審核' AGENTS.md || fail "assign 後座位與區塊應更新"
node "$CLI" roles assign "../app x:claude" coder >/dev/null 2>&1 && fail "不存在的座位沒 --add 應退出非零"
node "$CLI" roles assign "../app x:claude" coder --add >/dev/null || fail "--add 應新增座位"
grep -q 'CODER-BODY' "$A/CLAUDE.md" || fail "--add 的座位應套用"
cd "$HOME_R" && node "$CLI" roles assign .:codex pm >/dev/null 2>&1 && fail "舊格式(無座位表)assign 應退出非零並要求遷移"
# 另一個 team 產生到同一目的地 → 來源衝突
cd "$P"; mkdir -p "$TMP/team2/.flightwake" && (cd "$TMP/team2" && git init -q && node "$CLI" init >/dev/null)
printf '## security — 他隊資安\n**You do**\n- x\n\n## lead — l\n**You do**\n- y\n\n## seats\n| repo | vendor | role |\n|---|---|---|\n| %s | claude | lead |\n' "$A" > "$TMP/team2/.flightwake/ROLES.md"
(cd "$TMP/team2" && node "$CLI" roles apply >/dev/null 2>&1) && fail "他隊寫到已有本隊產物的目的地應報來源衝突"
# remove:清本 repo 的區塊、產生的 agent 與 skill
cd "$A" && node "$CLI" roles remove >/dev/null
ls .claude/agents/fw-* 2>/dev/null | grep -q . && fail "roles remove 應清掉產生的 agent"
grep -q 'flightwake-roles' CLAUDE.md AGENTS.md && fail "roles remove 應清掉區塊"
pass "roles v2(座位表/待命原生定義/card/assign/manifest 清理/衝突/escape/空白路徑)"

# ═══════════════════════════════════════════════════════════════════════════
# 23+. setup / doctor / profile / Orca / git 前置檢查(docs/plans/setup.md「測試」)
# ═══════════════════════════════════════════════════════════════════════════
DRIVE="$SRC/test/setup-drive.mjs"
PTYRUN="$SRC/test/pty-run.py"
NODE_BIN="$(command -v node)"
HAVE_PY=1; command -v python3 >/dev/null 2>&1 || HAVE_PY=0
newrepo() { mkdir -p "$1" && cd "$1" && git init -q && git config user.email t@t.t && git config user.name t; }
# 整個目錄(含 .git)的檔案清單 + 內容雜湊 + 跨 repo registry — 用來證明「零寫入」
snap() { { find . | sort; find . -type f -exec shasum {} + | sort -k2; if [ -f "$FLIGHTWAKE_HOME/registry.json" ]; then echo REGISTRY; shasum < "$FLIGHTWAKE_HOME/registry.json"; else echo NO-REGISTRY; fi; } | shasum; }
# 取出 JSON 設定檔、用 node 就地改(argv: file, js-body 操作變數 j)
jedit() { node -e "const fs=require('fs');const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f,'utf8'));$2;fs.writeFileSync(f,JSON.stringify(j,null,2))" "$1"; }

# 23. setup 在非 TTY(stdin 不是終端機)→ 非零 + 指引改用 init
newrepo "$TMP/s-nontty" >/dev/null
rc=0; out=$(node "$CLI" setup </dev/null 2>&1) || rc=$?
[ "$rc" -ne 0 ] || fail "非 TTY 的 setup 應退出非零"
echo "$out" | grep -q 'init' || fail "非 TTY 的 setup 應指引改用 init(got: $out)"
[ ! -e .flightwake ] || fail "非 TTY 的 setup 不得寫任何東西"
rc=0; out=$(echo y | node "$CLI" setup 2>&1) || rc=$?
[ "$rc" -ne 0 ] || fail "stdin 為管道的 setup 應退出非零"
pass "setup 非 TTY 擋下並指引 init"

# 24. git 不在 PATH:專屬訊息,不與「不是 repo」混用(init 無 .git / init 有 .git / setup)
NOGIT="$TMP/nogit-bin"; mkdir -p "$NOGIT"; ln -s "$NODE_BIN" "$NOGIT/node"
if PATH="$NOGIT" "$NODE_BIN" -e "require('child_process').execFileSync('git',['--version'],{stdio:'ignore'})" 2>/dev/null; then
  fail "測試前提錯誤:受限 PATH 下仍找得到 git"
fi
mkdir -p "$TMP/ng-nogit" && cd "$TMP/ng-nogit"
rc=0; out=$(PATH="$NOGIT" "$NODE_BIN" "$CLI" init 2>&1) || rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q 'git is not installed' || fail "無 git + 無 .git 的 init 應印「git is not installed」並非零(rc=$rc: $out)"
echo "$out" | grep -qi 'not a git repo' && fail "無 git 時不應用「不是 repo」訊息"
[ -z "$(ls -A)" ] || fail "無 git 時 init 不得寫任何東西"
rc=0; out=$(PATH="$NOGIT" "$NODE_BIN" "$CLI" init --git-init 2>&1) || rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q 'git is not installed' || fail "無 git 時 init --git-init 也應擋下"
[ -z "$(ls -A)" ] || fail "無 git 時 init --git-init 不得建任何東西"
newrepo "$TMP/ng-hasgit" >/dev/null
rc=0; out=$(PATH="$NOGIT" "$NODE_BIN" "$CLI" init 2>&1) || rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q 'git is not installed' || fail "有 .git 但無 git 的 init 應印專屬訊息並非零(rc=$rc: $out)"
[ ! -e .flightwake ] || fail "有 .git 但無 git 時 init 不得寫 .flightwake"
rc=0; out=$(PATH="$NOGIT" "$NODE_BIN" "$DRIVE" -- y y y 2>&1) || rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q 'git is not installed' || fail "無 git 時 setup 應印專屬訊息並非零(rc=$rc: $out)"
[ ! -e .flightwake ] || fail "無 git 時 setup 不得寫 .flightwake"
pass "git 不在 PATH:init(無/有 .git)與 setup 皆印專屬訊息"

# 25. 非 repo 目錄:init 無旗標 → 擋下且零寫入;--git-init → 建 .git 並完整安裝
mkdir -p "$TMP/nr1" && cd "$TMP/nr1"
rc=0; out=$(node "$CLI" init 2>&1) || rc=$?
[ "$rc" -ne 0 ] || fail "非 repo 的 init 應非零"
echo "$out" | grep -q -- '--git-init' || fail "非 repo 訊息應提示 --git-init"
[ -z "$(ls -A)" ] || fail "非 repo 的 init 擋下時不得建任何東西(got: $(ls -A | tr '\n' ' '))"
node "$CLI" init --git-init >/dev/null || fail "init --git-init 應成功"
[ -d .git ] && [ -d .flightwake ] && [ -f .claude/skills/fw-record/SKILL.md ] || fail "--git-init 後 .git 與安裝應齊全"
grep -q 'flightwake:begin' AGENTS.md || fail "--git-init 後應有義務表"
[ "$(git rev-parse --show-toplevel)" = "$TMP/nr1" ] || fail "--git-init 應在目前目錄建 repo"
pass "非 repo:init 擋下零寫入;--git-init 建 repo 並完整安裝"

# 26. 無指令 == init(不提問):repo 內直接安裝;TTY 下也要自己跑完
newrepo "$TMP/nocmd" >/dev/null
node "$CLI" >/dev/null </dev/null || fail "無指令應等同 init 並成功"
[ -f .flightwake/STATE.md ] && grep -q 'flightwake:begin' AGENTS.md || fail "無指令應完成安裝"
if [ "$HAVE_PY" = 1 ]; then
  newrepo "$TMP/nocmd-tty" >/dev/null
  rc=0; python3 "$PTYRUN" 60 "" node "$CLI" >/dev/null || rc=$?
  [ "$rc" = 0 ] || fail "TTY 下無指令應直接跑完(exit 0,不得卡住問問題);rc=$rc(124=逾時)"
  [ -f .flightwake/STATE.md ] && grep -q 'flightwake:begin' AGENTS.md || fail "TTY 下無指令應完成安裝"
  # pty-run 本身:逾時回 124;Ctrl-C 轉義會送達
  rc=0; python3 "$PTYRUN" 1 "" sleep 5 >/dev/null || rc=$?
  [ "$rc" = 124 ] || fail "pty-run 逾時應回 124(got $rc)"
  rc=0; python3 "$PTYRUN" 10 '\x03' cat >/dev/null || rc=$?
  [ "$rc" = 130 ] || fail "pty-run 的 \\x03 應中斷子程序(got $rc)"
  # setup 在 TTY 下會真的提問:Ctrl-C 於第一題 → 非零,零寫入
  newrepo "$TMP/setup-tty" >/dev/null; b=$(snap)
  rc=0; python3 "$PTYRUN" 30 '\x03' node "$CLI" setup >/dev/null || rc=$?
  [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ] || fail "TTY 下 setup 收到 Ctrl-C 應非零退出且不卡住(rc=$rc)"
  [ "$b" = "$(snap)" ] || fail "TTY 下 setup 被 Ctrl-C 後不得有任何寫入"
else
  echo "  skip: 沒有 python3,略過 TTY(pty)案例"
fi
pass "無指令 == init(含 TTY 下不提問);pty-run 逾時/Ctrl-C 行為"

# 27. setup 問答流程(driver 注入答案):全預設只裝核心
newrepo "$TMP/sd-default" >/dev/null
out=$(node "$DRIVE" --orca=0 -- "" 2 "" "" "" 2>&1) || fail "全預設 setup 應成功(out: $out)"
echo "$out" | grep -q 'Orca collaboration (' && fail "--orca=0 時不得出現 Orca 題目"
[ -f .flightwake/STATE.md ] && [ -f .claude/skills/fw-record/SKILL.md ] || fail "全預設應裝核心"
grep -q 'statusLine' .claude/settings.json && fail "全預設不得裝 statusLine"
[ -e .claude/skills/fw-roles ] || [ -e .agents/skills/fw-roles ] && fail "全預設不得裝 fw-roles"
grep -rq 'flightwake-orca' --include='*.md' . 2>/dev/null && fail "全預設不得有 Orca 區塊"
grep -q '<!-- flightwake:begin v[0-9.]* lang=en -->' AGENTS.md || fail "全預設的 marker 應為英文且無 profile=(got: $(grep 'flightwake:begin' AGENTS.md))"
grep -q 'profile=' AGENTS.md && fail "全預設(程式專案)marker 不得帶 profile="
# 附加元件清單只選一項(取代語意:選的就是全部)
newrepo "$TMP/sd-sl" >/dev/null; echo "# 我的" > CLAUDE.md
node "$DRIVE" --orca=0 -- "" "" 1 "" y >/dev/null || fail "statusline 單選 setup 應成功"
grep -q 'statusLine' .claude/settings.json || fail "清單選 1 應寫入 statusLine"
[ -e .claude/skills/flightwake-mod ] && fail "只選 1 不得裝 mod"
[ -e .claude/skills/fw-roles ] && fail "只答 statusline 不得裝 roles"
grep -q 'flightwake-orca' CLAUDE.md && fail "只答 statusline 不得有 Orca 區塊"
newrepo "$TMP/sd-roles" >/dev/null
node "$DRIVE" --orca=0 -- "" 2 3 "" y >/dev/null || fail "roles 單選 setup 應成功"
[ -f .claude/skills/fw-roles/SKILL.md ] || [ -f .agents/skills/fw-roles/SKILL.md ] || fail "清單選 3 應裝 fw-roles"
grep -q 'statusLine' .claude/settings.json && fail "只答 roles 不得裝 statusLine"
grep -rq 'flightwake-orca' --include='*.md' . && fail "只答 roles 不得有 Orca 區塊"
newrepo "$TMP/sd-orca" >/dev/null
out=$(node "$DRIVE" --orca=1 -- "" 2 "" "" y 2>&1) || fail "Orca 單選 setup 應成功(out: $out)"
echo "$out" | grep -q 'Orca collaboration (' || fail "--orca=1 時應出現 Orca 題目"
echo "$out" | grep -q '\[\*\] 4) Orca collaboration (' || fail "在 Orca 裡(ORCA_* env)Orca 應預選(got: $out)"
grep -q 'flightwake-orca:begin' AGENTS.md || fail "Orca 預選 + Enter 應寫入 Orca 區塊"
[ -e .claude/skills/fw-roles ] || [ -e .agents/skills/fw-roles ] && fail "只答 Orca 不得裝 roles"
grep -q 'statusLine' .claude/settings.json && fail "只答 Orca 不得裝 statusLine"
# Orca 預選但答 0 → 不寫區塊;PATH 上只有 orca 程式(可能是 GNOME 螢幕閱讀器)→ 列出但不預選
newrepo "$TMP/sd-orca-n" >/dev/null
node "$DRIVE" --orca=1 -- "" 2 0 "" y >/dev/null || fail "Orca 預選但答 0 的 setup 應成功"
grep -q 'flightwake-orca' AGENTS.md && fail "Orca 預選但答 0,不得寫區塊"
newrepo "$TMP/sd-orca-path" >/dev/null
out=$(node "$DRIVE" --orca=path -- "" 2 "" "" y 2>&1) || fail "--orca=path 的 setup 應成功(out: $out)"
echo "$out" | grep -q '\[ \] 4) Orca collaboration (' || fail "PATH 上只有 orca 時應列出 Orca 但不預選(got: $out)"
grep -q 'flightwake-orca' AGENTS.md && fail "PATH 上只有 orca、Enter 不得寫 Orca 區塊"
# repo 類型選 2 → notes
newrepo "$TMP/sd-notes" >/dev/null
node "$DRIVE" --orca=0 -- "" 2 "" 2 y >/dev/null || fail "筆記型 setup 應成功"
grep -q 'flightwake:begin v[0-9.]* lang=en profile=notes' AGENTS.md || fail "選筆記型 marker 應帶 profile=notes"
# 旗標視為該題答案(不再提問)
newrepo "$TMP/sd-flags" >/dev/null
out=$(node "$DRIVE" --orca=0 --flags='{"lang":"en","agents":["codex"],"profile":"notes"}' -- "" y 2>&1) || fail "帶旗標 setup 應成功(out: $out)"
echo "$out" | grep -qF 'Language / ' && fail "給了 lang 旗標就不該再問語言"
echo "$out" | grep -q 'What kind of repo' && fail "給了 profile 旗標就不該再問 repo 類型"
grep -q 'profile=notes' AGENTS.md || fail "旗標 profile=notes 應生效"
pass "setup 流程:全預設只裝核心;statusline/roles/Orca 各自單選;旗標跳題"

# 28. setup:拒絕 git init → 退出 1 且目錄仍空;同意 → 最終確認後才建
mkdir -p "$TMP/sd-nogit" && cd "$TMP/sd-nogit"
rc=0; node "$DRIVE" --orca=0 -- n >/dev/null || rc=$?
[ "$rc" = 1 ] || fail "拒絕 git init 應退出 1(got $rc)"
[ -z "$(ls -A)" ] || fail "拒絕 git init 後目錄應仍為空(got: $(ls -A | tr '\n' ' '))"
rc=0; node "$DRIVE" --orca=0 -- "" >/dev/null || rc=$?
[ "$rc" = 1 ] && [ -z "$(ls -A)" ] || fail "git init 題直接 Enter(預設否)應退出 1 且零寫入"
node "$DRIVE" --orca=0 -- y "" 2 "" "" y >/dev/null || fail "同意 git init 並確認應成功"
[ -d .git ] && [ -d .flightwake ] || fail "同意後應建 .git 並安裝"
# 已有安裝:告知現況;y → 更新(0);n → 1 且沒有檔案被改
newrepo "$TMP/sd-exist" >/dev/null
node "$CLI" init >/dev/null
b=$(snap)
rc=0; out=$(node "$DRIVE" -- 3 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "已安裝時選「維持原狀」應退出 0(got $rc: $out)"
echo "$out" | grep -qi 'already installed' || fail "已安裝時應告知「already installed」(got: $out)"
echo "$out" | grep -q 'left as it is' || fail "選「維持原狀」應說明沒有寫入(got: $out)"
[ "$b" = "$(snap)" ] || fail "已安裝時選「維持原狀」不得改任何檔案"
rc=0; out=$(node "$DRIVE" -- 1 n 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "已安裝時選 1 後確認答 n 應退出 1(got $rc)"
[ "$b" = "$(snap)" ] || fail "已安裝時選 1 後確認答 n 不得改任何檔案"
rc=0; out=$(node "$DRIVE" -- "" "" 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "已安裝時最終確認 Enter(預設是)應執行更新並退出 0(got $rc)"
echo "$out" | grep -q '\[Y/n\]' || fail "最終確認應顯示 [Y/n]"
echo "$out" | grep -qF 'Language / ' && fail "已安裝時不應再問語言等題(只有最終確認)"
sed -i.bak 's/flightwake:begin v[0-9.]*/flightwake:begin v0.0.1/' AGENTS.md && rm -f AGENTS.md.bak
rc=0; out=$(node "$DRIVE" -- 1 y 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "已安裝時選 1、確認答 y 應成功更新(got $rc: $out)"
grep -q "flightwake:begin v$FWV lang=en" AGENTS.md || fail "setup 更新應沿用既有語言並升到目前版本(got: $(grep 'flightwake:begin' AGENTS.md))"
pass "setup:拒絕 git init 零寫入;已安裝:維持原狀 exit 0 不動、選 1 後 n 不動、選 1 後 y 更新"

# 29. Orca 協作 add-on:init 預設不加;--orca 每個啟用的指令檔都加;uninstall 清掉且保留使用者行;update 只刷新既有
newrepo "$TMP/or1" >/dev/null
echo "# 我的規則 KEEP-CLAUDE" > CLAUDE.md; echo "# 我的規則 KEEP-AGENTS" > AGENTS.md
node "$CLI" init --agents=claude,codex >/dev/null
grep -q 'flightwake-orca' CLAUDE.md AGENTS.md && fail "init 未給 --orca 不得加 Orca 區塊"
newrepo "$TMP/or2" >/dev/null
echo "# 我的規則 KEEP-CLAUDE" > CLAUDE.md; echo "# 我的規則 KEEP-AGENTS" > AGENTS.md
node "$CLI" init --agents=claude,codex --orca >/dev/null
for f in CLAUDE.md AGENTS.md; do
  [ "$(grep -c 'flightwake-orca:begin' $f)" = 1 ] && [ "$(grep -c 'flightwake-orca:end' $f)" = 1 ] || fail "--orca 應在 $f 加一個 Orca 區塊"
done
grep -q "flightwake-orca:begin v$FWV lang=en -->" CLAUDE.md || fail "Orca 區塊應帶版本與語言"
node "$CLI" init --agents=claude,codex --orca --force >/dev/null
[ "$(grep -c 'flightwake-orca:begin' CLAUDE.md)" = 1 ] || fail "--orca --force 重跑不得重複區塊"
# update 刷新既有區塊
sed -i.bak 's/flightwake-orca:begin v[0-9.]*/flightwake-orca:begin v0.0.1/' CLAUDE.md && rm -f CLAUDE.md.bak
node "$CLI" update >/dev/null
grep -q "flightwake-orca:begin v$FWV" CLAUDE.md || fail "update 應刷新既有 Orca 區塊版本"
# update 不在沒有區塊的檔案新增
node -e "const fs=require('fs');fs.writeFileSync('AGENTS.md',fs.readFileSync('AGENTS.md','utf8').replace(/\n?<!-- flightwake-orca:begin[\s\S]*?<!-- flightwake-orca:end -->\n?/,'\n'))"
grep -q 'flightwake-orca' AGENTS.md && fail "測試前提:應已移除 AGENTS.md 的 Orca 區塊"
node "$CLI" update >/dev/null
grep -q 'flightwake-orca' AGENTS.md && fail "update 不得在沒有 Orca 區塊的檔案新增"
grep -q 'flightwake-orca:begin' CLAUDE.md || fail "update 不得移除 CLAUDE.md 既有的 Orca 區塊"
# uninstall:區塊清掉、使用者的行保留
node "$CLI" uninstall >/dev/null
grep -q 'flightwake-orca' CLAUDE.md AGENTS.md && fail "uninstall 應清掉 Orca 區塊"
grep -q 'flightwake:begin' CLAUDE.md AGENTS.md && fail "uninstall 應清掉義務表"
grep -q 'KEEP-CLAUDE' CLAUDE.md && grep -q 'KEEP-AGENTS' AGENTS.md || fail "uninstall 不得動使用者自己的行"
# detectOrca(明確 env,不依賴本機真實 Orca)
EMPTYBIN="$TMP/empty-bin"; mkdir -p "$EMPTYBIN"
ORCABIN="$TMP/orca-bin"; mkdir -p "$ORCABIN"; printf '#!/bin/sh\nexit 0\n' > "$ORCABIN/orca"; chmod +x "$ORCABIN/orca"
dorca() { node --input-type=module -e "import {detectOrca} from '$SRC/bin/install.mjs'; console.log(detectOrca($1))"; }
[ "$(dorca "{PATH:'$EMPTYBIN'}")" = false ] || fail "detectOrca:空 PATH 且無 ORCA_* 應為 false"
[ "$(dorca "{}")" = false ] || fail "detectOrca:{} 應為 false"
[ "$(dorca "{ORCA_APP_VERSION:'1'}")" = true ] || fail "detectOrca:ORCA_APP_VERSION 應為 true"
[ "$(dorca "{ORCA_TERMINAL_HANDLE:'h'}")" = true ] || fail "detectOrca:ORCA_TERMINAL_HANDLE 應為 true"
[ "$(dorca "{PATH:'$EMPTYBIN:$ORCABIN'}")" = true ] || fail "detectOrca:PATH 含 orca 執行檔應為 true"
pass "Orca add-on:預設不加、--orca 全檔、update 只刷新既有、uninstall 保留使用者行、detectOrca"

# 30. 中斷:最終確認答 n、^D、^C → 零寫入(含非 repo 且 git init 答 y 的情況)
chk_zero() { # $1 描述;其餘 = driver 答案;在目前目錄執行並比對快照
  local desc="$1"; shift; local b rc=0; b=$(snap)
  node "$DRIVE" --orca=0 -- "$@" >/dev/null 2>&1 || rc=$?
  [ "$rc" -ne 0 ] || fail "$desc:應非零退出"
  [ "$b" = "$(snap)" ] || fail "$desc:不得有任何寫入"
}
newrepo "$TMP/int-repo" >/dev/null
chk_zero "最終確認 n" "" 2 "" "" n
chk_zero "最終確認 no" "" 2 "" "" no
chk_zero "語言題 ^D" ^D
chk_zero "agent 題 ^D" "" ^D
chk_zero "最終確認 ^D" "" 2 "" "" ^D
chk_zero "答案用完(隱含 EOF)" "" ""
chk_zero "語言題 ^C" ^C
chk_zero "附加元件題 ^C" "" 2 ^C
chk_zero "repo 類型題 ^C" "" 2 "" ^C
chk_zero "最終確認 ^C" "" 2 "" "" ^C
mkdir -p "$TMP/int-nonrepo" && cd "$TMP/int-nonrepo"
chk_zero "非 repo:git init 題 ^D" ^D
chk_zero "非 repo:git init 答 y 後最終確認 n" y "" 2 "" "" n
chk_zero "非 repo:git init 答 y 後 ^D" y "" 2 "" ^D
chk_zero "非 repo:git init 答 y 後 ^C" y "" 2 ^C
[ ! -e .git ] || fail "非 repo 中斷後不得有 .git"
# 帶旗標 gitInit 的非 repo 取消:也不得先建 .git
b=$(snap); rc=0; node "$DRIVE" --orca=0 --flags='{"gitInit":true}' -- "" 2 "" "" n >/dev/null 2>&1 || rc=$?
[ "$rc" -ne 0 ] && [ "$b" = "$(snap)" ] && [ ! -e .git ] || fail "旗標 gitInit 但最終確認 n:不得建 .git"
# 已安裝再中斷
newrepo "$TMP/int-exist" >/dev/null; node "$CLI" init >/dev/null
chk_zero "已安裝:^D" ^D
chk_zero "已安裝:^C" ^C
chk_zero "已安裝:選 1 後 n" 1 n
chk_zero "已安裝:加裝清單 ^D" 2 ^D
chk_zero "已安裝:加裝後 n" 2 3 n
chk_zero "已安裝:加裝清單 ^C" 2 ^C
pass "中斷(n/^D/^C/答案用完)一律零寫入非零退出,含非 repo 的 git init"

# 31. worktree / submodule / 一般子目錄
newrepo "$TMP/wt-main" >/dev/null
echo x > README; git add README; git commit -qm init
git worktree add -q "$TMP/wt-tree" -b wt-branch
cd "$TMP/wt-tree"
node "$CLI" init >/dev/null || fail "worktree 根目錄 init 應成功"
[ -f .flightwake/STATE.md ] || fail "worktree 內應裝好"
rc=0; out=$(node "$CLI" doctor 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "worktree 內 doctor 應退出 0(rc=$rc: $out)"
# submodule 算獨立 repo
newrepo "$TMP/sm-lib" >/dev/null; echo y > f; git add f; git commit -qm lib
newrepo "$TMP/sm-host" >/dev/null; echo x > README; git add README; git commit -qm init
git -c protocol.file.allow=always submodule add -q "$TMP/sm-lib" libsub >/dev/null 2>&1
cd libsub
node "$CLI" init >/dev/null || fail "submodule 內 init 應成功(自成一個 repo)"
[ -f .flightwake/STATE.md ] || fail "submodule 內應裝好"
# 一般子目錄 → monorepo 訊息
cd "$TMP/sm-host"; mkdir -p pkg/a && cd pkg/a
rc=0; out=$(node "$CLI" init 2>&1) || rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q 'one install per repo' || fail "子目錄 init 應非零並印 monorepo 訊息(rc=$rc: $out)"
[ -z "$(ls -A)" ] || fail "子目錄 init 擋下時不得寫東西"
rc=0; out=$(node "$DRIVE" -- y y y 2>&1) || rc=$?
[ "$rc" -ne 0 ] && echo "$out" | grep -q 'one install per repo' || fail "子目錄 setup 應非零並印 monorepo 訊息(rc=$rc: $out)"
[ -z "$(ls -A)" ] || fail "子目錄 setup 擋下時不得寫東西"
pass "worktree 可裝且 doctor 0;submodule 自成 repo;子目錄擋下(init 與 setup)"

# 32. doctor:新裝 → 0(STATE 未填只是提醒);各種破壞 → 1
newrepo "$TMP/doc-base" >/dev/null
node "$CLI" init --agents=claude >/dev/null
rc=0; out=$(node "$CLI" doctor 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "新裝後 doctor 應退出 0(rc=$rc: $out)"
echo "$out" | grep -qi 'unfilled' || fail "新裝後 doctor 應提醒 STATE 未填(提醒不影響退出碼)"
doc_variant() { # $1 名稱 $2 在副本內執行的破壞指令(shell) $3 預期出現在失敗行(✗)的文字(grep -E);預期 doctor 退出 1
  local name="$1" dir="$TMP/doc-v-$(echo "$1" | tr -c 'a-zA-Z0-9\n' _)"
  cp -R "$TMP/doc-base" "$dir"; ( cd "$dir" && eval "$2" )
  local rc=0 out; out=$(cd "$dir" && node "$CLI" doctor 2>&1) || rc=$?
  [ "$rc" = 1 ] || fail "doctor:$name 應退出 1(rc=$rc: $out)"
  echo "$out" | grep -E '^  ✗' | grep -qE "$3" || fail "doctor:$name 應有點名問題的失敗行(預期 /$3/;got: $out)"
  echo "$out" | grep -qE 'at .*\.mjs:[0-9]+|TypeError|SyntaxError' && fail "doctor:$name 不得以例外崩潰(got: $out)"
  return 0
}
doc_variant "缺 skill 目錄" 'rm -rf .claude/skills/fw-record' '\.claude/skills.*fw-record'
doc_variant "移除 Stop hook" 'jedit .claude/settings.json "delete j.hooks.Stop"' 'Claude Code.*Stop hook'
doc_variant "改 hook command" 'jedit .claude/settings.json "j.hooks.Stop[0].hooks[0].command+=\" --extra\""' 'command differs'
doc_variant "JSON 損毀" 'echo "{ not json" > .claude/settings.json' 'settings\.json is not valid JSON'
doc_variant "hook 重複登記" 'jedit .claude/settings.json "j.hooks.Stop.push(JSON.parse(JSON.stringify(j.hooks.Stop[0])))"' 'registered 2 times'
doc_variant "缺 hook 腳本" 'rm .flightwake/hooks/state-check.mjs' 'state-check\.mjs missing'
doc_variant "缺 .flightwake" 'rm -rf .flightwake' '\.flightwake/ missing'
newrepo "$TMP/doc-gem" >/dev/null
node "$CLI" init --agents=gemini >/dev/null
rc=0; node "$CLI" doctor >/dev/null 2>&1 || rc=$?
[ "$rc" = 0 ] || fail "gemini 新裝 doctor 應退出 0(rc=$rc)"
jedit .gemini/settings.json 'j.hooks.Stop=j.hooks.AfterAgent; delete j.hooks.AfterAgent'
rc=0; out=$(node "$CLI" doctor 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "Gemini hook 登記在 Stop(應為 AfterAgent)doctor 應退出 1(rc=$rc: $out)"
echo "$out" | grep -E '^  ✗' | grep -q 'AfterAgent' || fail "doctor 應以失敗行指出 Gemini 應為 AfterAgent"
# 唯讀證明:--private 安裝(有被 git 忽略的檔)+ 全 agent + statusline + roles,doctor 前後逐檔雜湊 + .git/info/exclude + registry 完全相同
newrepo "$TMP/doc-ro" >/dev/null
echo x > README; git add README; git commit -qm init
node "$CLI" init --private --statusline --agents=claude,codex,gemini --orca >/dev/null
node "$CLI" roles install >/dev/null
git status --short --ignored | grep -q '^!!' || fail "測試前提:--private 應產生被忽略的檔"
b=$(snap); ex=$(shasum < .git/info/exclude)
node "$CLI" doctor >/dev/null 2>&1 || fail "--private 全選項安裝 doctor 應退出 0"
[ "$b" = "$(snap)" ] && [ "$ex" = "$(shasum < .git/info/exclude)" ] || fail "doctor 必須唯讀(檔案/內容/exclude/registry 都不得變)"
# 對壞掉的安裝也唯讀
rm -rf .claude/skills/fw-record; b=$(snap)
node "$CLI" doctor >/dev/null 2>&1 && fail "壞掉的安裝 doctor 應非零"
[ "$b" = "$(snap)" ] || fail "doctor 對壞掉的安裝也必須唯讀"
pass "doctor:新裝 0、各種破壞 1、唯讀(含被忽略檔/exclude/registry)"

# 33. --profile=notes:marker、義務表、update 保留、舊 marker 視為 code、雙向切換、私有安裝全受追蹤仍記住
newrepo "$TMP/pf-code" >/dev/null
node "$CLI" init --agents=claude >/dev/null
grep -qi 'typecheck' CLAUDE.md && grep -qi 'schema' CLAUDE.md || fail "測試前提:程式專案義務表應含 typecheck 與 schema"
grep -q 'profile=' CLAUDE.md && fail "程式專案 marker 不得帶 profile="
node "$CLI" update >/dev/null
grep -q 'profile=' CLAUDE.md && fail "舊式 marker(無 profile)update 後應視為 code,不得出現 profile 屬性"
grep -qi 'typecheck' CLAUDE.md || fail "舊式 marker update 後仍應是 code 義務表"
newrepo "$TMP/pf-notes" >/dev/null
node "$CLI" init --agents=claude,codex --profile=notes >/dev/null
for f in CLAUDE.md AGENTS.md; do
  grep -q "flightwake:begin v$FWV lang=en profile=notes -->" $f || fail "$f marker 應帶 profile=notes(got: $(grep 'flightwake:begin' $f))"
  grep -qi 'typecheck' $f && fail "$f notes 義務表不得有 typecheck"
  grep -qi 'schema' $f && fail "$f notes 義務表不得有 schema"
done
node "$CLI" update >/dev/null
grep -q 'profile=notes' CLAUDE.md AGENTS.md || fail "update 應保留 notes"
grep -qi 'typecheck' CLAUDE.md && fail "update 後 notes 義務表仍不得有 typecheck"
rc=0; node "$CLI" doctor >/dev/null 2>&1 || rc=$?; [ "$rc" = 0 ] || fail "notes 安裝 doctor 應 0"
# 雙向切換
node "$CLI" update --profile=code >/dev/null
grep -q 'profile=' CLAUDE.md AGENTS.md && fail "update --profile=code 應回到 code(不留 profile 屬性)"
grep -qi 'typecheck' CLAUDE.md || fail "切回 code 後義務表應有 typecheck"
node "$CLI" update --profile=notes >/dev/null
grep -q 'profile=notes' CLAUDE.md AGENTS.md && ! grep -qi 'typecheck' CLAUDE.md || fail "update --profile=notes 應切成 notes"
node "$CLI" update >/dev/null
grep -q 'profile=notes' CLAUDE.md || fail "切到 notes 後無旗標 update 應保留"
node "$CLI" update --profile=code >/dev/null
grep -q 'profile=' CLAUDE.md && fail "再切回 code 應成功"
# private 且所有指令檔都受追蹤 → 沒有 marker,profile 記在 exclude 標頭,update 保留
newrepo "$TMP/pf-priv" >/dev/null
echo "# a" > AGENTS.md; echo "# g" > GEMINI.md; git add -A; git commit -qm base
node "$CLI" init --private --profile=notes --agents=codex,gemini >/dev/null
grep -q 'flightwake:begin' AGENTS.md GEMINI.md && fail "測試前提:受追蹤的指令檔不得被寫 marker"
grep -q '^# flightwake:begin v[0-9.]* profile=notes' .git/info/exclude || fail "exclude 標頭應記 profile=notes(got: $(grep 'flightwake:begin' .git/info/exclude))"
node "$CLI" update >/dev/null
grep -q '^# flightwake:begin v[0-9.]* profile=notes' .git/info/exclude || fail "update 後 exclude 標頭應仍記 profile=notes"
node "$CLI" doctor 2>&1 | grep -q 'profile: notes' || fail "doctor 應回報 profile: notes"
[ -z "$(git status --porcelain)" ] || fail "全受追蹤的 private notes 安裝後 git status 應乾淨"
node "$CLI" update --profile=code >/dev/null
grep -q '^# flightwake:begin v[0-9.]* profile=notes' .git/info/exclude && fail "update --profile=code 後 exclude 標頭不應再有 profile=notes"
pass "--profile=notes:marker/義務表/update 保留/舊 marker=code/雙向切換/private 無 marker 仍記住"

# 34. --private + roles:roles install 後 git status 仍乾淨;update 後仍乾淨
newrepo "$TMP/pr-roles" >/dev/null
echo x > README; git add README; git commit -qm init
node "$CLI" init --private >/dev/null
[ -z "$(git status --porcelain)" ] || fail "測試前提:--private 後 git status 應乾淨"
node "$CLI" roles install >/dev/null
ls .claude/skills/fw-roles/SKILL.md >/dev/null 2>&1 || ls .agents/skills/fw-roles/SKILL.md >/dev/null 2>&1 || fail "roles install 應裝 fw-roles"
[ -z "$(git status --porcelain)" ] || fail "--private 後 roles install 不得讓檔案出現在 git status(got: $(git status --porcelain | tr '\n' ' '))"
node "$CLI" update >/dev/null
[ -z "$(git status --porcelain)" ] || fail "--private + roles 後 update,git status 仍應乾淨(got: $(git status --porcelain | tr '\n' ' '))"
pass "--private + roles:install 與 update 後 git status 皆乾淨"

# 35. agent 題:偵測不到任何指令檔 → 直接問用哪些工具(可複選、不預選);偵測得到 → 維持「Enter 沿用」;最終確認預設是
newrepo "$TMP/ag-none" >/dev/null
out=$(node "$DRIVE" --orca=0 -- "" "" 1 0 "" "" 2>&1) || fail "無指令檔時選 claude 的 setup 應成功(out: $out)"
echo "$out" | grep -q 'Which AI coding tools' || fail "無指令檔時應直接問用哪些工具"
echo "$out" | grep -q 'detected:' && fail "無指令檔時不得顯示偵測結果或預選"
echo "$out" | grep -q 'Pick at least one' || fail "無指令檔時直接 Enter 應要求至少選一個(不得預設 codex)"
echo "$out" | grep -q 'Bottom gauge in Claude Code' || fail "選了 claude 應問到儀表那一題"
grep -q 'flightwake:begin' CLAUDE.md || fail "選 claude 應寫入 CLAUDE.md"
[ -e AGENTS.md ] && fail "只選 claude 不得建 AGENTS.md"
newrepo "$TMP/ag-names" >/dev/null
node "$DRIVE" --orca=0 -- "" "claude,gemini" 0 "" "" >/dev/null || fail "以名稱複選應成功"
grep -q 'flightwake:begin' CLAUDE.md && grep -q 'flightwake:begin' GEMINI.md || fail "複選 claude,gemini 應寫兩個指令檔"
[ -e AGENTS.md ] && fail "未選 codex 不得建 AGENTS.md"
newrepo "$TMP/ag-bad" >/dev/null
out=$(node "$DRIVE" --orca=0 -- "" "9,cursor" 2 "" "" "" 2>&1) || fail "輸入無效後重選應成功(out: $out)"
echo "$out" | grep -q 'Not recognized' || fail "無效的編號/名稱應被指出並重問"
grep -q 'flightwake:begin' AGENTS.md || fail "重選 codex 後應寫 AGENTS.md"
newrepo "$TMP/ag-found" >/dev/null; echo "# a" > AGENTS.md
out=$(node "$DRIVE" --orca=0 -- "" "" "" "" "" 2>&1) || fail "偵測得到指令檔時 Enter 沿用應成功(out: $out)"
echo "$out" | grep -q 'detected: codex' || fail "偵測得到指令檔時應顯示偵測結果"
echo "$out" | grep -q 'Which AI coding tools' && fail "偵測得到指令檔時不應改問工具清單"
grep -q 'flightwake:begin' AGENTS.md || fail "Enter 沿用偵測結果應寫 AGENTS.md"
echo "$out" | grep -q 'Proceed? \[Y/n\]' || fail "最終確認應為 [Y/n]"
[ -f .flightwake/STATE.md ] || fail "最終確認 Enter(預設是)應執行安裝"
newrepo "$TMP/ag-init" >/dev/null
node "$CLI" init >/dev/null && grep -q 'flightwake:begin' AGENTS.md || fail "init 非互動預設不變:無指令檔仍建 AGENTS.md"
pass "agent 題:無指令檔直接問(複選、不預選、選 claude 會問儀表);有指令檔維持沿用;確認預設是;init 預設不變"

# 36. Astra diff 審查(docs/plans/setup.diff-review-astra.md)的回歸測試
# 36.1 doctor 的 private 檢查要從安裝產物推導必要排除:刪掉 exclude 裡的 .flightwake/ → doctor 失敗並點名
newrepo "$TMP/ax1" >/dev/null; echo x > README; git add README; git commit -qm init
node "$CLI" init --private >/dev/null
sed -i.bak '/^\.flightwake\/$/d' .git/info/exclude && rm -f .git/info/exclude.bak
git status --porcelain | grep -q '.flightwake' || fail "36.1 測試前提:刪掉排除後 .flightwake 應出現在 git status"
rc=0; out=$(node "$CLI" doctor 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "36.1 private 必要排除缺 .flightwake/ 時 doctor 應退出 1(rc=$rc: $out)"
echo "$out" | grep -q '✗.*--private.*\.flightwake' || fail "36.1 doctor 應點名 .flightwake 未被忽略(got: $out)"
pass "36.1 doctor private:必要排除由安裝產物推導,缺 .flightwake/ 即失敗"

# 36.2 --private 下 Orca 區塊不得寫進受追蹤的指令檔:claude 改寫 CLAUDE.local.md;codex 跳過並警告
newrepo "$TMP/ax2" >/dev/null
node "$CLI" init --agents=claude,codex >/dev/null && git add CLAUDE.md AGENTS.md && git commit -qm shared
rc=0; out=$(node "$CLI" init --private --orca --agents=claude,codex 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "36.2 跳過受追蹤檔不是失敗,應 exit 0(rc=$rc: $out)"
git diff --quiet -- CLAUDE.md AGENTS.md || fail "36.2 --private --orca 不得改動受追蹤的 CLAUDE.md / AGENTS.md(diff: $(git diff --stat | tr '\n' ' '))"
grep -q 'flightwake-orca:begin' CLAUDE.local.md 2>/dev/null || fail "36.2 claude 的 Orca 區塊應改寫進 CLAUDE.local.md"
git check-ignore -q CLAUDE.local.md || fail "36.2 CLAUDE.local.md 應被排除"
echo "$out" | grep -q -- '--private: AGENTS.md' || fail "36.2 codex 受追蹤時應跳過並警告(got: $out)"
node "$CLI" update >/dev/null
git diff --quiet -- CLAUDE.md AGENTS.md || fail "36.2 private 的 update 也不得改動受追蹤的指令檔"
pass "36.2 --private 下 Orca 區塊不進受追蹤檔(claude 走 CLAUDE.local.md、codex 跳過並警告)"

# 36.3 寫入框架檔前檢查 symlink / 實際落點:hook 指向 ../STATE.md、skill 檔指向 DECISIONS → update 拒寫、使用者資料不變
newrepo "$TMP/ax3" >/dev/null
node "$CLI" init >/dev/null
echo "# 我的 STATE KEEP" >> .flightwake/STATE.md; echo "# 我的決策 KEEP" >> .flightwake/DECISIONS.md
rm .flightwake/hooks/state-check.mjs && ln -s ../STATE.md .flightwake/hooks/state-check.mjs
rm .claude/skills/fw-record/SKILL.md && ln -s ../../../.flightwake/DECISIONS.md .claude/skills/fw-record/SKILL.md
st=$(shasum < .flightwake/STATE.md); de=$(shasum < .flightwake/DECISIONS.md)
rc=0; out=$(node "$CLI" update 2>&1) || rc=$?
[ "$st" = "$(shasum < .flightwake/STATE.md)" ] || fail "36.3 update 不得經由 symlink 覆蓋 STATE.md"
[ "$de" = "$(shasum < .flightwake/DECISIONS.md)" ] || fail "36.3 update 不得經由 symlink 覆蓋 DECISIONS.md"
[ "$rc" -ne 0 ] || fail "36.3 拒寫時應非零退出,讓自動化看得到"
echo "$out" | grep -q 'symlink' || fail "36.3 應說明因 symlink 拒寫(got: $out)"
[ -L .flightwake/hooks/state-check.mjs ] || fail "36.3 拒寫時不得動那個 symlink"
# 實際落點在 repo 外:.flightwake/hooks 本身是指向外部的目錄 symlink
newrepo "$TMP/ax3b" >/dev/null; node "$CLI" init >/dev/null
mkdir -p "$TMP/ax3-outside" && rm -rf .flightwake/hooks && ln -s "$TMP/ax3-outside" .flightwake/hooks
rc=0; out=$(node "$CLI" update 2>&1) || rc=$?
[ -z "$(ls -A "$TMP/ax3-outside")" ] || fail "36.3 實際落點在 repo 外時不得寫入(got: $(ls -A "$TMP/ax3-outside"))"
[ "$rc" -ne 0 ] && echo "$out" | grep -q 'outside' || fail "36.3 應說明落點在 repo 外而拒寫(rc=$rc: $out)"
pass "36.3 hook 檔 symlink 與 hooks 目錄落點在 repo 外:拒寫、STATE/DECISIONS 不被覆蓋(其他路徑類別見 37.6)"

# 36.4 doctor 平台清單也從安裝產物推導;hook 驗 type 與 command;結構異常逐項回報不崩潰
newrepo "$TMP/ax4" >/dev/null; echo "# 我的 AGENTS 內容" > AGENTS.md
node "$CLI" init --agents=claude,codex >/dev/null
node -e "const fs=require('fs');fs.writeFileSync('AGENTS.md',fs.readFileSync('AGENTS.md','utf8').replace(/\n?<!-- flightwake:begin[\s\S]*?<!-- flightwake:end -->\n?/,'\n'))"
grep -q 'flightwake:begin' AGENTS.md && fail "36.4 測試前提:AGENTS.md 的 marker 應已刪除"
rc=0; out=$(node "$CLI" doctor 2>&1) || rc=$?
[ "$rc" = 1 ] && echo "$out" | grep -E '^  ✗' | grep -q 'AGENTS.md' || fail "36.4 marker 被刪但 Codex 產物還在,doctor 應以失敗回報不一致(rc=$rc: $out)"
echo "{ broken" > .codex/hooks.json
rc=0; out=$(node "$CLI" doctor 2>&1) || rc=$?
[ "$rc" = 1 ] && echo "$out" | grep -E '^  ✗' | grep -q '\.codex/hooks.json is not valid JSON' || fail "36.4 marker 刪除後壞掉的 .codex/hooks.json 仍須被檢查到(rc=$rc: $out)"
doc_variant "hook type 被改成 prompt" 'jedit .claude/settings.json "j.hooks.Stop[0].hooks[0].type=\"prompt\""' 'type'
doc_variant "hooks 是字串" 'jedit .claude/settings.json "j.hooks=\"oops\""' '"hooks" is not an object'
doc_variant "hooks.Stop 是物件" 'jedit .claude/settings.json "j.hooks.Stop={x:1}"' 'hooks\.Stop is not an array'
doc_variant "頂層是陣列" 'echo "[]" > .claude/settings.json' 'not a JSON object'
pass "36.4 doctor:平台由產物推導、marker 遺失報不一致、hook 驗 type、結構異常逐項回報不崩潰"

# 36.5 git 前置檢查只套用在 init 與 setup:有 .git、PATH 沒有 git 時 uninstall 仍要完成移除(與 main 相同)
newrepo "$TMP/ax5" >/dev/null; echo "# 我的" > CLAUDE.md
node "$CLI" init --agents=claude >/dev/null
rc=0; out=$(PATH="$NOGIT" "$NODE_BIN" "$CLI" uninstall 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "36.5 無 git 時 uninstall 應成功(rc=$rc: $out)"
[ ! -e .claude/skills/fw-record ] && ! grep -q 'flightwake:begin' CLAUDE.md || fail "36.5 無 git 時 uninstall 應移除框架檔與區塊"
grep -q '# 我的' CLAUDE.md && [ -f .flightwake/STATE.md ] || fail "36.5 uninstall 不得動使用者內容與資料"
pass "36.5 無 git 時 uninstall 照常完成(git 前置檢查只限 init / setup)"

# 36.6 fw-coldstart 未初始化分支(四語)的 skill 文字:包含「有歷史就續走原流程、只有真正全新才直接回報」的指示(文字檢查,不驗證 agent 實際行為)
for pair in "en:truly fresh:then skip to step 5" "zh-TW:真正全新:然後直接跳到第 5 步" "zh-CN:真正全新:然后直接跳到第 5 步" "ja:まったくの新規:ステップ 5 へ直接進む"; do
  l=${pair%%:*}; rest=${pair#*:}; want=${rest%%:*}; old=${rest#*:}
  f="$SRC/skills/$l/fw-coldstart/SKILL.md"
  grep -q "$want" "$f" || fail "36.6 $l fw-coldstart 應寫明只有真正全新的安裝才直接回報(缺「${want}」)"
  grep -q "$old" "$f" && fail "36.6 $l fw-coldstart 不得再無條件跳到第 5 步(仍有「${old}」)"
  grep -q 'latest_record' "$f" && grep -q 'rev-list --count' "$f" || fail "36.6 $l 原流程步驟應保留"
done
pass "36.6 fw-coldstart 四語 skill 文字包含續走流程的指示(文字檢查,未驗證 agent 是否遵循)"

# 36.7 setup 摘要列出的路徑 == 實際寫入的路徑(新增或內容變動的檔;目錄項涵蓋其下的檔;registry 另計)
# 檔案清單 + 雜湊 + mtime(同內容重寫也算寫入;.git 只取 info/exclude)+ registry
fsnap() { node -e '
    const fs=require("fs"),path=require("path"),crypto=require("crypto");
    const out=[]; const add=(f)=>{ const st=fs.statSync(f,{bigint:true}); out.push(crypto.createHash("sha1").update(fs.readFileSync(f)).digest("hex")+":"+st.mtimeNs+" "+f); };
    const walk=(d)=>{ for (const n of fs.readdirSync(d)) { const p=d==="."?n:path.join(d,n); if (p===".git") continue; const st=fs.lstatSync(p); if (st.isDirectory()) walk(p); else if (st.isFile()) add(p); } };
    walk("."); if (fs.existsSync(".git/info/exclude")) add(".git/info/exclude");
    const reg=process.env.FLIGHTWAKE_HOME+"/registry.json"; if (fs.existsSync(reg)) add(reg);
    console.log(out.sort().join("\n"));'; }
summary_vs_writes() { # $1 描述;其餘 = driver 參數(含 --);在目前目錄跑,比對摘要與實際變動
  local desc="$1"; shift; fsnap > "$TMP/sw.before"
  node "$DRIVE" "$@" > "$TMP/sw.out" 2>&1 || fail "36.7 $desc:setup 應成功($(tail -5 "$TMP/sw.out"))"
  fsnap > "$TMP/sw.after"
  node -e '
    const fs=require("fs"); const [b,a,o]=process.argv.slice(1).map((f)=>fs.readFileSync(f,"utf8"));
    const map=(t)=>new Map(t.split("\n").filter(Boolean).map((l)=>{const i=l.indexOf(" ");return [l.slice(i+1),l.slice(0,i)];}));
    const B=map(b), A=map(a);
    const changed=[...A].filter(([f,h])=>B.get(f)!==h).map(([f])=>f);
    const lines=o.split("\n"); const i=lines.findIndex((l)=>/These paths will be written:/.test(l));
    const listed=[]; for (let k=i+1;k<lines.length&&lines[k].startsWith("  ");k++) listed.push(lines[k].trim().replace(/\s+\(git init\)$/,""));
    const covers=(e,f)=>e===f||(e.endsWith("/")&&f.startsWith(e));
    const unlisted=changed.filter((f)=>!listed.some((e)=>covers(e,f)));
    const unused=listed.filter((e)=>e!==".git/"&&!changed.some((f)=>covers(e,f))&&!(e.endsWith("/")&&fs.existsSync(e)));
    if (unlisted.length||unused.length){console.log("unlisted writes: "+unlisted.join(", ")+" | listed but not written: "+unused.join(", "));process.exit(1);}
  ' "$TMP/sw.before" "$TMP/sw.after" "$TMP/sw.out" || fail "36.7 $desc:摘要與實際寫入不一致"
}
newrepo "$TMP/ax7a" >/dev/null; echo "# 我的" > CLAUDE.md
summary_vs_writes "新裝全選項(private+statusline+mod+roles+Orca+notes)" --orca=1 --flags='{"private":true}' -- "" "claude,codex" "1 2 3 4" 2 ""
grep -q 'flightwake-orca:begin' CLAUDE.local.md && [ -f .claude/skills/fw-roles/SKILL.md ] && [ -f .claude/skills/flightwake-mod/hooks/register.ts ] || fail "36.7 測試前提:全選項應已安裝"
newrepo "$TMP/ax7b" >/dev/null
summary_vs_writes "新裝全預設" --orca=0 -- "" 2 "" "" ""
sed -i.bak 's/flightwake:begin v[0-9.]*/flightwake:begin v0.0.1/' AGENTS.md && rm -f AGENTS.md.bak
summary_vs_writes "已安裝 → 升級" -- "" ""
mkdir -p "$TMP/ax7c" && cd "$TMP/ax7c"
summary_vs_writes "非 repo:git init + 安裝" --orca=0 -- y "" 1 1 "" ""
[ -d .git ] || fail "36.7 測試前提:應已 git init"
pass "36.7 setup 摘要與實際寫入的路徑集合一致(新裝全選項/全預設/升級/含 git init)"

# 37. Astra 複審(docs/plans/setup.diff-review-astra-2.md)的回歸測試
# 37.1 工具名稱只接受明確集合:constructor / toString / __proto__ 一律無法辨識(setup 複選題與 init --agents)
for bad in constructor toString __proto__ hasOwnProperty; do
  newrepo "$TMP/ay1-$bad" >/dev/null
  rc=0; out=$(node "$CLI" init --agents=$bad 2>&1) || rc=$?
  [ "$rc" = 1 ] && echo "$out" | grep -q 'not recognized' || fail "37.1 init --agents=$bad 應被拒(rc=$rc: $out)"
  [ ! -e .flightwake ] || fail "37.1 init --agents=$bad 不得寫入"
  out=$(node "$DRIVE" --orca=0 -- "" "$bad" 2 "" "" "" 2>&1) || fail "37.1 setup 答 $bad 後重選應成功(out: $out)"
  echo "$out" | grep -q "Not recognized: $bad" || fail "37.1 setup 應把 $bad 當成無法辨識(got: $out)"
  node "$CLI" doctor >/dev/null 2>&1 || fail "37.1 重選 codex 後 doctor 應 0"
done
pass "37.1 工具名稱白名單:constructor/toString/__proto__ 等在 setup 與 init --agents 都被拒"

# 37.2 --private 的 Orca 改寫到 CLAUDE.local.md 時,新目的地受追蹤 → 跳過並警告,不寫入
newrepo "$TMP/ay2" >/dev/null
node "$CLI" init --agents=claude >/dev/null && echo "# 本地筆記" > CLAUDE.local.md && git add CLAUDE.md CLAUDE.local.md && git commit -qm shared
rc=0; out=$(node "$CLI" init --private --orca --agents=claude 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "37.2 跳過受追蹤檔不是失敗,應 exit 0(rc=$rc: $out)"
git diff --quiet -- CLAUDE.md CLAUDE.local.md || fail "37.2 受追蹤的 CLAUDE.md / CLAUDE.local.md 都不得被改(diff: $(git diff --stat | tr '\n' ' '))"
echo "$out" | grep -q -- '--private: CLAUDE.local.md' || fail "37.2 CLAUDE.local.md 受追蹤時應跳過並警告(got: $out)"
pass "37.2 --private 的 Orca 新目的地(CLAUDE.local.md)受追蹤也跳過並警告"

# 37.3 registry 維持 best-effort:registry.json 是 symlink → 安裝照常成功(exit 0,與 main 一致)、只提醒、不經由 symlink 寫入
newrepo "$TMP/ay3" >/dev/null
RH="$TMP/ay3-home"; mkdir -p "$RH" && echo '{"version":1,"repos":{}}' > "$TMP/ay3-real-registry.json" && ln -s "$TMP/ay3-real-registry.json" "$RH/registry.json"
rb=$(shasum < "$TMP/ay3-real-registry.json")
rc=0; out=$(FLIGHTWAKE_HOME="$RH" node "$CLI" init 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "37.3 registry 是 symlink 時安裝仍應 exit 0(rc=$rc: $out)"
echo "$out" | grep -q 'registry' || fail "37.3 應提醒 registry 未更新"
echo "$out" | grep -q '✅ done' || fail "37.3 registry 問題不影響安裝完成訊息"
[ "$rb" = "$(shasum < "$TMP/ay3-real-registry.json")" ] && [ -L "$RH/registry.json" ] || fail "37.3 不得經由 symlink 寫 registry,也不得動那個 symlink"
rc=0; FLIGHTWAKE_HOME="$RH" node "$CLI" update >/dev/null 2>&1 || rc=$?
[ "$rc" = 0 ] || fail "37.3 registry 是 symlink 時 update 也應 exit 0"
pass "37.3 registry 是 symlink:只提醒、不寫入、安裝與 update 照常 exit 0"

# 37.4 roles 的安裝與 update 刷新也走同一層寫入防護:.claude/skills 連到 repo 外 → 不刪、不重建外部的 fw-roles
newrepo "$TMP/ay4" >/dev/null; node "$CLI" init >/dev/null && node "$CLI" roles install >/dev/null
mkdir -p "$TMP/ay4-out" && mv .claude/skills/* "$TMP/ay4-out/" && rmdir .claude/skills && ln -s "$TMP/ay4-out" .claude/skills
echo keep > "$TMP/ay4-out/fw-roles/KEEP"; ob=$(cd "$TMP/ay4-out" && find . -type f | sort | xargs shasum | shasum)
rc=0; out=$(node "$CLI" update 2>&1) || rc=$?
[ -f "$TMP/ay4-out/fw-roles/KEEP" ] || fail "37.4 update 不得刪除 repo 外的 fw-roles(KEEP 消失)"
[ "$ob" = "$(cd "$TMP/ay4-out" && find . -type f | sort | xargs shasum | shasum)" ] || fail "37.4 update 不得改動 repo 外的任何 skill 檔"
[ "$rc" = 1 ] && echo "$out" | grep -q 'outside' || fail "37.4 應以 repo 外落點拒寫並非零退出(rc=$rc: $out)"
rc=0; out=$(node "$CLI" roles install 2>&1) || rc=$?
[ -f "$TMP/ay4-out/fw-roles/KEEP" ] && [ "$rc" = 1 ] || fail "37.4 roles install 也不得重建 repo 外的 fw-roles(rc=$rc: $out)"
# setup 選 roles 時同樣:預檢就拒,外部目錄與 repo 都不被寫
newrepo "$TMP/ay4b" >/dev/null; mkdir -p "$TMP/ay4b-out" .claude && ln -s "$TMP/ay4b-out" .claude/skills
b=$(fsnap); rc=0; out=$(node "$DRIVE" --orca=0 -- "" 1 3 "" 2>&1) || rc=$?
[ "$rc" = 1 ] && [ -z "$(ls -A "$TMP/ay4b-out")" ] && [ "$b" = "$(fsnap)" ] || fail "37.4 setup(含 roles)遇 repo 外落點應在寫入前中止(rc=$rc: $out)"
pass "37.4 roles 安裝/刷新走同一層防護:repo 外的 fw-roles 不被刪除或重建(update、roles install、setup)"

# 37.5 先預檢、後寫入:必要路徑會被拒寫 → 寫入前整個中止、不留半套、不印 done;懸空目錄 symlink 有一致診斷;setup 的 doctor 失敗不印成功
newrepo "$TMP/ay5" >/dev/null; mkdir -p .claude && echo '{"mine":1}' > shared.json && ln -s ../shared.json .claude/settings.json
b=$(fsnap); rc=0; out=$(node "$CLI" init 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "37.5 必要路徑被拒寫時 init 應非零(rc=$rc)"
[ "$b" = "$(fsnap)" ] && [ ! -e .flightwake ] || fail "37.5 預檢失敗時不得留下半套安裝(got: $(ls -A | tr '\n' ' '))"
echo "$out" | grep -q '✅' && fail "37.5 未完成不得印 ✅(got: $out)"
echo "$out" | grep -q 'symlink' && echo "$out" | grep -qi 'nothing was written' || fail "37.5 應說明哪個路徑因 symlink 被拒、且什麼都沒寫(got: $out)"
newrepo "$TMP/ay5b" >/dev/null; ln -s "$TMP/does-not-exist" .claude
b=$(fsnap); rc=0; out=$(node "$CLI" init 2>&1) || rc=$?
[ "$rc" = 1 ] && [ "$b" = "$(fsnap)" ] || fail "37.5 懸空的 .claude symlink:init 應非零且零寫入(rc=$rc: $out)"
echo "$out" | grep -qE 'ENOENT|at .*\.mjs:[0-9]+' && fail "37.5 懸空 symlink 不得拋 ENOENT(got: $out)"
echo "$out" | grep -q '\.claude' && echo "$out" | grep -qi 'symlink' || fail "37.5 懸空 symlink 應得到同樣的拒寫診斷(got: $out)"
newrepo "$TMP/ay5c" >/dev/null; echo "# g" > GEMINI.md; mkdir -p .gemini && echo "{ bad" > .gemini/settings.json
rc=0; out=$(node "$DRIVE" --orca=0 -- "" "" "" "" "" 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "37.5 setup 後 doctor 失敗時 setup 應非零(rc=$rc)"
echo "$out" | grep -q '✅' && fail "37.5 doctor 失敗時 setup 不得印成功(got: $out)"
echo "$out" | grep -qi 'doctor found' || fail "37.5 應說明 doctor 發現問題、安裝未完成(got: $out)"
pass "37.5 預檢:必要路徑被拒即寫入前中止不留半套;懸空 symlink 一致診斷;doctor 失敗不印成功"

# 37.6 symlink / 落點防護涵蓋各類路徑(延伸 36.3 的 hooks):skills 目錄、settings、指令檔、roles skill → update 拒寫、目標不變、零寫入
sym_variant() { # $1 名稱 $2 在已安裝 repo 內做 symlink 的指令 $3 受保護的目標檔(相對 repo 或絕對)
  local dir="$TMP/ay6-$(echo "$1" | tr -c 'a-zA-Z0-9\n' _)"; newrepo "$dir" >/dev/null
  node "$CLI" init --agents=claude >/dev/null && node "$CLI" roles install >/dev/null
  echo "# KEEP $1" >> .flightwake/STATE.md; echo "# KEEP $1" >> .flightwake/DECISIONS.md
  eval "$2"; local tb; tb=$(shasum < "$3"); local b; b=$(fsnap)
  local rc=0 out; out=$(node "$CLI" update 2>&1) || rc=$?
  [ "$rc" = 1 ] || fail "37.6 $1:update 應非零(rc=$rc: $out)"
  [ "$tb" = "$(shasum < "$3")" ] || fail "37.6 $1:受保護的目標 $3 不得被改"
  [ "$b" = "$(fsnap)" ] || fail "37.6 $1:預檢失敗時 repo 內不得有任何寫入"
  echo "$out" | grep -qE 'symlink|outside' || fail "37.6 $1:應說明拒寫原因(got: $out)"
}
mkdir -p "$TMP/ay6-out"
sym_variant "skill 目錄" 'cp -R .claude/skills/fw-trap "$TMP/ay6-out/fw-trap" && rm -rf .claude/skills/fw-trap && ln -s "$TMP/ay6-out/fw-trap" .claude/skills/fw-trap' "$TMP/ay6-out/fw-trap/SKILL.md"
sym_variant "settings.json" 'echo "{\"mine\":\"USER RECORD\"}" > .flightwake/records/saved.json && rm .claude/settings.json && ln -s ../.flightwake/records/saved.json .claude/settings.json' .flightwake/records/saved.json
sym_variant "指令檔" 'rm CLAUDE.md && ln -s .flightwake/DECISIONS.md CLAUDE.md' .flightwake/DECISIONS.md
sym_variant "roles skill 目錄" 'cp -R .claude/skills/fw-roles "$TMP/ay6-out/fw-roles" && rm -rf .claude/skills/fw-roles && ln -s "$TMP/ay6-out/fw-roles" .claude/skills/fw-roles' "$TMP/ay6-out/fw-roles/SKILL.md"
sym_variant "hook 檔(36.3)" 'rm .flightwake/hooks/state-check.mjs && ln -s ../STATE.md .flightwake/hooks/state-check.mjs' .flightwake/STATE.md
pass "37.6 symlink / 落點防護涵蓋 hooks、skills 目錄、settings、指令檔、roles skill(update 拒寫、目標不變、零寫入)"

# 38. Astra 第三輪(docs/plans/setup.diff-review-astra-3.md)合併前必修的回歸測試
# 38.1 寫入是「暫存檔 + rename」,不原地覆寫:hook 檔、skill 檔是 STATE / DECISIONS 的 hardlink → update 後使用者資料不變
newrepo "$TMP/az1" >/dev/null; node "$CLI" init >/dev/null
echo "# KEEP 38.1" >> .flightwake/STATE.md; echo "# KEEP 38.1" >> .flightwake/DECISIONS.md
rm .flightwake/hooks/state-check.mjs && ln .flightwake/STATE.md .flightwake/hooks/state-check.mjs
rm .claude/skills/fw-record/SKILL.md && ln .flightwake/DECISIONS.md .claude/skills/fw-record/SKILL.md
st=$(shasum < .flightwake/STATE.md); de=$(shasum < .flightwake/DECISIONS.md)
rc=0; out=$(node "$CLI" update 2>&1) || rc=$?
[ "$st" = "$(shasum < .flightwake/STATE.md)" ] || fail "38.1 hook 檔是 STATE 的 hardlink 時,update 不得蓋掉 STATE"
[ "$de" = "$(shasum < .flightwake/DECISIONS.md)" ] || fail "38.1 skill 檔是 DECISIONS 的 hardlink 時,update 不得蓋掉 DECISIONS"
[ "$rc" = 0 ] && grep -q 'flightwake STATE checks' .flightwake/hooks/state-check.mjs || fail "38.1 hook 應被換成新的獨立檔案(rc=$rc: $out)"
pass "38.1 暫存檔 + rename 取代目的地:hardlink 到 STATE / DECISIONS 的框架檔被更新時使用者資料不變"

# 38.2 uninstall / roles remove / roles apply / roles assign 走同一層防護
newrepo "$TMP/az2" >/dev/null; node "$CLI" init >/dev/null && node "$CLI" roles install >/dev/null
mkdir -p "$TMP/az2-out" && mv .claude/skills/* "$TMP/az2-out/" && rmdir .claude/skills && ln -s "$TMP/az2-out" .claude/skills
echo keep > "$TMP/az2-out/fw-roles/KEEP"
for c in uninstall "roles remove"; do
  rc=0; out=$(node "$CLI" $c 2>&1) || rc=$?
  [ -f "$TMP/az2-out/fw-roles/KEEP" ] || fail "38.2 $c 不得刪除 repo 外的內容(KEEP 消失)"
  [ "$rc" = 1 ] && echo "$out" | grep -q 'outside' || fail "38.2 $c 應以落點在 repo 外拒絕並非零(rc=$rc: $out)"
done
[ -f .flightwake/hooks/state-check.mjs ] && grep -q 'flightwake:begin' AGENTS.md || fail "38.2 uninstall 預檢失敗時不得先刪了其他東西"
newrepo "$TMP/az2b" >/dev/null; node "$CLI" init --agents=claude >/dev/null
printf '## pm — PM\n**You do**\n- plan\n\n## qa — QA\n**You do**\n- test\n\n## seats\n| repo | vendor | role |\n|---|---|---|\n| . | claude | pm |\n' > .flightwake/ROLES.md
node "$CLI" roles apply >/dev/null || fail "38.2 測試前提:roles apply 應成功"
node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync('.flightwake/roles-manifest.json','utf8'));m.note='USER RECORD KEEP';fs.writeFileSync('.flightwake/records/saved.json',JSON.stringify(m,null,2))"
rm .flightwake/roles-manifest.json && ln -s records/saved.json .flightwake/roles-manifest.json
sv=$(shasum < .flightwake/records/saved.json); ro=$(shasum < .flightwake/ROLES.md)
for c in "roles apply" "roles assign .:claude qa"; do
  rc=0; out=$(node "$CLI" $c 2>&1) || rc=$?
  [ "$sv" = "$(shasum < .flightwake/records/saved.json)" ] || fail "38.2 $c 不得經由 symlink 的 manifest 覆寫使用者紀錄"
  [ "$ro" = "$(shasum < .flightwake/ROLES.md)" ] || fail "38.2 $c 預檢失敗時不得改 ROLES.md"
  [ "$rc" = 1 ] && echo "$out" | grep -q 'symlink' || fail "38.2 $c 應以 symlink 拒絕並非零(rc=$rc: $out)"
done
pass "38.2 uninstall / roles remove 不刪 repo 外內容;roles apply / assign 不經由 symlink manifest 覆寫,預檢失敗零寫入"

# 38.3 --private 的必要排除寫不進去 → 預檢就中止,不印 ✅、不回 0(registry 只是提醒,排除是必要條件)
for kind in dir symlink-dir; do
  newrepo "$TMP/az3-$kind" >/dev/null; rm -f .git/info/exclude
  if [ "$kind" = dir ]; then mkdir .git/info/exclude; else mkdir -p "$TMP/az3-target" && ln -s "$TMP/az3-target" .git/info/exclude; fi
  rc=0; out=$(node "$CLI" init --private 2>&1) || rc=$?
  [ "$rc" = 1 ] || fail "38.3 exclude 是 $kind 時 init --private 應非零(rc=$rc: $out)"
  echo "$out" | grep -q '✅' && fail "38.3 隱私未生效不得印 ✅(got: $out)"
  [ ! -e .flightwake ] && [ ! -e .claude ] || fail "38.3 exclude 寫不進去應在預檢中止、零寫入(got: $(ls -A | tr '\n' ' '))"
  echo "$out" | grep -q 'exclude' || fail "38.3 應點名 .git/info/exclude(got: $out)"
done
newrepo "$TMP/az3-tracked" >/dev/null; node "$CLI" init >/dev/null && git add -A && git commit -qm shared
rc=0; out=$(node "$CLI" init --private 2>&1) || rc=$?
[ "$rc" = 1 ] && ! echo "$out" | grep -q '✅' || fail "38.3 .flightwake 已受追蹤時 --private 無法生效,不得印 ✅ 或回 0(rc=$rc: $out)"
[ ! -e .git/info/exclude ] || ! grep -q 'flightwake:begin' .git/info/exclude || fail "38.3 隱私無法生效時不得寫 exclude"
echo "$out" | grep -q 'git rm -r --cached' || fail "38.3 應說明如何讓 .flightwake 脫離追蹤(got: $out)"
pass "38.3 private 必要排除寫不進去(exclude 是目錄 / 指向目錄 / .flightwake 已受追蹤)→ 預檢中止、不印 ✅、非零"

# 38.4 預檢檢查目的地與祖先的型別:.claude 是一般檔 → 寫入前中止;roles install 遇 .agents 是檔案也不留半套、不拋未捕捉例外
newrepo "$TMP/az4" >/dev/null; echo "not a dir" > .claude
rc=0; out=$(node "$CLI" init 2>&1) || rc=$?
[ "$rc" = 1 ] && [ ! -e .flightwake ] || fail "38.4 .claude 是檔案時 init 應在寫入前中止(rc=$rc: $(ls -A | tr '\n' ' '))"
echo "$out" | grep -qE 'ENOTDIR|at .*\.mjs:[0-9]+' && fail "38.4 不得以例外結束(got: $out)"
echo "$out" | grep -q '\.claude' && echo "$out" | grep -qi 'not a directory' || fail "38.4 應說明 .claude 不是目錄(got: $out)"
newrepo "$TMP/az4b" >/dev/null; node "$CLI" init --agents=claude,codex >/dev/null
rm -rf .agents && echo "file" > .agents
rc=0; out=$(node "$CLI" roles install 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "38.4 .agents 是檔案時 roles install 應非零(rc=$rc: $out)"
[ ! -e .claude/skills/fw-roles ] || fail "38.4 roles install 不得裝一半(.claude/skills/fw-roles 已建立)"
echo "$out" | grep -qE 'ENOTDIR|at .*\.mjs:[0-9]+' && fail "38.4 roles install 不得拋未捕捉例外(got: $out)"
pass "38.4 預檢的型別檢查:.claude / .agents 是一般檔 → 寫入前中止,roles install 不留半套、不拋例外"

# 38.5 預檢只檢查實際會寫的目的地:--private 下受追蹤(且為 symlink)的 .codex/hooks.json / .gemini/settings.json 被跳過 → exit 0(同 main)
for plat in codex gemini; do
  newrepo "$TMP/az5-$plat" >/dev/null
  if [ "$plat" = codex ]; then f=.codex/hooks.json; ins=AGENTS.md; else f=.gemini/settings.json; ins=GEMINI.md; fi
  mkdir -p "$(dirname $f)" && echo '{"mine":true}' > real-hooks.json && ln -s ../real-hooks.json "$f" && echo "# x" > "$ins"
  git add -A && git commit -qm base
  rc=0; out=$(node "$CLI" init --private --agents=$plat 2>&1) || rc=$?
  [ "$rc" = 0 ] || fail "38.5 $plat:受追蹤而被跳過的 symlink 不應讓安裝被拒(rc=$rc: $out)"
  echo "$out" | grep -q -- "--private: $f is git-tracked" || fail "38.5 $plat:應說明跳過受追蹤的 $f(got: $out)"
  [ "$(cat real-hooks.json)" = '{"mine":true}' ] || fail "38.5 $plat:不得寫入受追蹤的檔"
done
pass "38.5 --private 下受追蹤而被跳過的 symlink 設定檔不觸發拒寫(codex / gemini,exit 0)"

# 39. Astra 第四輪:rename 取代既有檔時保留原權限(暫存檔不比原檔寬鬆);目的地不存在才用預設
fmode() { node -e "console.log((require('fs').statSync(process.argv[1]).mode & 0o7777).toString(8))" "$1"; }
(
umask 022
newrepo "$TMP/aw1" >/dev/null; node "$CLI" init --agents=claude >/dev/null
chmod 600 .claude/settings.json; chmod 640 CLAUDE.md; chmod 700 .flightwake/hooks/state-check.mjs; chmod 600 .claude/skills/fw-record/SKILL.md
jedit .claude/settings.json "delete j.hooks"   # 讓 update 必須重寫 settings.json
sed -i.bak 's/flightwake:begin v[0-9.]*/flightwake:begin v0.0.1/' CLAUDE.md && rm -f CLAUDE.md.bak && chmod 640 CLAUDE.md
node "$CLI" update >/dev/null || fail "39 update 應成功"
grep -q 'state-check.mjs' .claude/settings.json && grep -q "flightwake:begin v$FWV" CLAUDE.md || fail "39 測試前提:settings.json 與 CLAUDE.md 應已被重寫"
[ "$(fmode .claude/settings.json)" = 600 ] || fail "39 settings.json 應維持 0600(got $(fmode .claude/settings.json))"
[ "$(fmode CLAUDE.md)" = 640 ] || fail "39 指令檔應維持 0640(got $(fmode CLAUDE.md))"
[ "$(fmode .flightwake/hooks/state-check.mjs)" = 700 ] || fail "39 hook 檔應維持 0700(got $(fmode .flightwake/hooks/state-check.mjs))"
[ "$(fmode .claude/skills/fw-record/SKILL.md)" = 600 ] || fail "39 skill 檔應維持 0600(got $(fmode .claude/skills/fw-record/SKILL.md))"
[ "$(fmode .flightwake/TEMPLATE-record.md)" = 644 ] || fail "39 未改權限的檔維持預設 0644(got $(fmode .flightwake/TEMPLATE-record.md))"
# 附加路徑:沒有 marker 的指令檔 0600 → init 附加義務表後仍 0600
newrepo "$TMP/aw2" >/dev/null; echo "# 我的" > CLAUDE.md; chmod 600 CLAUDE.md
node "$CLI" init --agents=claude >/dev/null
grep -q 'flightwake:begin' CLAUDE.md && [ "$(fmode CLAUDE.md)" = 600 ] || fail "39 附加後指令檔應維持 0600(got $(fmode CLAUDE.md))"
[ "$(fmode .flightwake/STATE.md)" = 644 ] || fail "39 新建的檔用預設權限 0644(got $(fmode .flightwake/STATE.md))"
# private:含使用者設定的 settings.local.json 0600 → init --private 後仍 0600
newrepo "$TMP/aw3" >/dev/null; mkdir -p .claude && echo '{"env":{"TOKEN":"secret"}}' > .claude/settings.local.json && chmod 600 .claude/settings.local.json
node "$CLI" init --private --agents=claude >/dev/null || fail "39 init --private 應成功"
grep -q 'state-check.mjs' .claude/settings.local.json && grep -q 'secret' .claude/settings.local.json || fail "39 測試前提:settings.local.json 應合併寫入且保留使用者設定"
[ "$(fmode .claude/settings.local.json)" = 600 ] || fail "39 settings.local.json 應維持 0600(got $(fmode .claude/settings.local.json))"
)
pass "39 rename 取代保留既有權限:settings.json / settings.local.json / 指令檔(取代與附加)/ hook / skill;新檔用預設"

# ═══════════════════════════════════════════════════════════════════════════
# 40+. flightwake-mod 接進安裝器(docs/plans/integration.md「測試」)
# ═══════════════════════════════════════════════════════════════════════════
MODREL=.claude/skills/flightwake-mod
MODSRC="$SRC/mods/flightwake"
MODV=$(node -e "console.log(require('$MODSRC/.claude-plugin/plugin.json').version)")
# 套件內「發行內容」的檔案清單(manifest、hooks、types;不含 tests/ 與 scripts/)
mod_ship_list() { (cd "$MODSRC" && { echo .claude-plugin/plugin.json; find hooks types -type f; } | sort); }
# mod 自己讀語言的方式:直接 import mod 的 core.ts(MARKER_FILES 順序 + markerLang),不在測試裡另抄一份 regex
modlang() { node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --input-type=module -e "
  import fs from 'node:fs';
  import { MARKER_FILES, markerLang } from '$MODSRC/hooks/lib/core.ts';
  let l = 'en';
  for (const f of MARKER_FILES) { if (!fs.existsSync(f)) continue; const x = markerLang(fs.readFileSync(f, 'utf8')); if (x !== null) { l = x; break; } }
  console.log(l);"; }

# 40.1 init --mod(有 claude)→ 只裝發行內容;init 不帶 --mod → 不裝;旗標與 init 不提問的行為不變
newrepo "$TMP/md1" >/dev/null; echo "# 我的" > CLAUDE.md
node "$CLI" init >/dev/null
[ -e $MODREL ] && fail "40.1 init 未給 --mod 不得安裝 mod"
newrepo "$TMP/md1b" >/dev/null; echo "# 我的" > CLAUDE.md
rc=0; out=$(node "$CLI" init --mod </dev/null 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "40.1 init --mod 應成功(rc=$rc: $out)"
[ "$(cd $MODREL && find . -type f | sed 's|^\./||' | sort)" = "$(mod_ship_list)" ] || fail "40.1 安裝內容應恰為發行檔(got: $(cd $MODREL && find . -type f | sort | tr '\n' ' '))"
for f in $(mod_ship_list); do cmp -s "$MODSRC/$f" "$MODREL/$f" || fail "40.1 $f 應與套件內容相同"; done
[ ! -e $MODREL/tests ] && [ ! -e $MODREL/scripts ] || fail "40.1 不得把測試與開發腳本裝進使用者 repo"
echo "$out" | grep -q 'flightwake-mod@skills-dir' || fail "40.1 結尾應說明角色守門怎麼自己開(鍵 flightwake-mod@skills-dir)"
echo "$out" | grep -qi 'not a security boundary' || fail "40.1 結尾應重申角色守門不是安全邊界"
echo "$out" | grep -q '2.1.287' || fail "40.1 結尾應提到需要 Claude Code 2.1.287 以上"
pass "40.1 init --mod 只裝 manifest/hooks/types;不帶 --mod 不裝;結尾說明角色守門啟用方式"

# 40.2 active agents 沒有 claude → 說明並略過,不算錯誤
newrepo "$TMP/md2" >/dev/null
rc=0; out=$(node "$CLI" init --mod --agents=codex 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "40.2 沒有 claude 時 --mod 應略過而非失敗(rc=$rc: $out)"
[ ! -e $MODREL ] || fail "40.2 沒有 claude 時不得安裝 mod"
echo "$out" | grep -q 'flightwake-mod' && echo "$out" | grep -qi 'Claude Code' || fail "40.2 應說明 mod 只用於 Claude Code 而略過(got: $out)"
node "$CLI" doctor >/dev/null 2>&1 || fail "40.2 略過 mod 後 doctor 應 0"
pass "40.2 沒有 claude:--mod 說明並略過,exit 0"

# 40.3 update 只在已安裝的地方刷新;刷新時保留使用者自己加的檔;--force 也刷新既有
newrepo "$TMP/md3" >/dev/null; node "$CLI" init --agents=claude >/dev/null
node "$CLI" update >/dev/null
[ -e $MODREL ] && fail "40.3 未安裝 mod 時 update 不得新增"
node "$CLI" init --agents=claude --mod >/dev/null
echo "// stale" > $MODREL/hooks/register.ts; rm $MODREL/types/index.d.ts
echo "mine" > $MODREL/MY-NOTES.md; mkdir -p $MODREL/.claude-plugin/types && echo "engine" > $MODREL/.claude-plugin/types/x.d.ts
node "$CLI" update >/dev/null || fail "40.3 update 應成功"
cmp -s "$MODSRC/hooks/register.ts" $MODREL/hooks/register.ts && cmp -s "$MODSRC/types/index.d.ts" $MODREL/types/index.d.ts || fail "40.3 update 應把發行檔刷新回套件內容"
[ "$(cat $MODREL/MY-NOTES.md)" = mine ] && [ "$(cat $MODREL/.claude-plugin/types/x.d.ts)" = engine ] || fail "40.3 update 不得刪除使用者(或引擎)在 mod 資料夾自己加的檔"
echo "// stale" > $MODREL/hooks/register.ts
node "$CLI" init --agents=claude --force >/dev/null
cmp -s "$MODSRC/hooks/register.ts" $MODREL/hooks/register.ts || fail "40.3 init --force 也應刷新既有的 mod"
pass "40.3 update/--force 只刷新既有 mod、保留使用者加的檔;未安裝不新增"

# 40.4 uninstall 只移除發行過的檔與因此變空的目錄;使用者(或引擎)自己加的檔保留並列出;--purge 也不刪它們
[ -f $MODREL/MY-NOTES.md ] && [ -f $MODREL/.claude-plugin/types/x.d.ts ] || fail "40.4 測試前提:40.3 建立的自加檔應存在"
rc=0; out=$(node "$CLI" uninstall 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "40.4 uninstall 應成功(rc=$rc: $out)"
[ "$(cat $MODREL/MY-NOTES.md)" = mine ] && [ "$(cat $MODREL/.claude-plugin/types/x.d.ts)" = engine ] || fail "40.4 uninstall 不得刪除使用者在 mod 資料夾自己加的檔"
for f in $(mod_ship_list); do [ ! -e "$MODREL/$f" ] || fail "40.4 uninstall 應移除發行檔 $f"; done
[ ! -e $MODREL/hooks ] && [ ! -e $MODREL/types ] || fail "40.4 只剩發行檔的目錄在移除後變空,應一併移除"
echo "$out" | grep -q 'MY-NOTES.md' && echo "$out" | grep -q '.claude-plugin/types/x.d.ts' || fail "40.4 uninstall 應列出留下了什麼(got: $out)"
[ -f .flightwake/STATE.md ] || fail "40.4 uninstall 不得刪使用者資料"
node "$CLI" init --agents=claude --mod >/dev/null && node "$CLI" uninstall --purge >/dev/null || fail "40.4 重裝後 uninstall --purge 應成功"
[ "$(cat $MODREL/MY-NOTES.md)" = mine ] && [ ! -e .flightwake ] || fail "40.4 --purge 只針對 .flightwake,不得刪 mod 資料夾裡的自加檔"
newrepo "$TMP/md4b" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null && node "$CLI" uninstall >/dev/null
[ ! -e $MODREL ] || fail "40.4 沒有自加檔時 uninstall 應移除整個 mod 資料夾"
pass "40.4 uninstall 只移除發行檔與變空的目錄,自加檔保留並列出(--purge 亦然);沒有自加檔則整個資料夾移除"

# 40.5 --private:mod 資料夾進排除清單;排除失敗(已受追蹤)= 拒寫;private 安裝後再 init --mod 也不留痕跡
newrepo "$TMP/md5" >/dev/null; echo x > README; git add README; git commit -qm init
node "$CLI" init --private --mod --agents=claude >/dev/null || fail "40.5 init --private --mod 應成功"
[ -f $MODREL/hooks/register.ts ] || fail "40.5 測試前提:mod 應已安裝"
grep -qx "$MODREL/" .git/info/exclude || fail "40.5 exclude 應含 $MODREL/(got: $(cat .git/info/exclude))"
[ -z "$(git status --porcelain)" ] || fail "40.5 --private + mod 後 git status 應乾淨(got: $(git status --porcelain | tr '\n' ' '))"
node "$CLI" update >/dev/null; [ -z "$(git status --porcelain)" ] || fail "40.5 update 後 git status 仍應乾淨(got: $(git status --porcelain | tr '\n' ' '))"
[ ! -e AGENTS.md ] && [ ! -e .agents ] || fail "40.5 private 的 claude 安裝(marker 在 CLAUDE.local.md)update 後不得改裝成 codex(main 既有錯誤)"
node "$CLI" doctor >/dev/null 2>&1 || fail "40.5 private + mod 的 doctor 應 0"
newrepo "$TMP/md5b" >/dev/null; echo x > README; git add README; git commit -qm init
node "$CLI" init --private --agents=claude >/dev/null && node "$CLI" init --mod --agents=claude >/dev/null || fail "40.5 private 安裝後 init --mod 應成功"
[ -f $MODREL/hooks/register.ts ] && [ -z "$(git status --porcelain)" ] || fail "40.5 private 安裝後再 init --mod,mod 也要被排除(got: $(git status --porcelain | tr '\n' ' '))"
newrepo "$TMP/md5c" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null && git add -A && git commit -qm shared
git rm -rq --cached .flightwake .claude/skills/fw-* .claude/settings.json CLAUDE.md && git commit -qm untrack-core
b=$(fsnap); rc=0; out=$(node "$CLI" init --private --agents=claude 2>&1) || rc=$?
[ "$rc" = 1 ] && [ "$b" = "$(fsnap)" ] || fail "40.5 mod 資料夾已受追蹤時 --private 無法生效,應在預檢中止且零寫入(rc=$rc: $out)"
echo "$out" | grep -q "$MODREL" && echo "$out" | grep -q 'git rm -r --cached' || fail "40.5 應點名受追蹤的 mod 資料夾與處理方式(got: $out)"
pass "40.5 --private:mod 進排除、update 仍乾淨、private 後補裝也排除;mod 已受追蹤 → 預檢中止"

# 40.6 安裝語言經由 marker 傳給 mod(用 mod 自己的讀取邏輯驗):setup / init、profile=notes、CLAUDE.local.md、只剩 AGENTS.md 有 marker
newrepo "$TMP/md6a" >/dev/null
node "$DRIVE" --orca=0 -- 2 1 2 "" "" >/dev/null || fail "40.6 setup(zh-TW、claude、mod)應成功"
[ -f $MODREL/hooks/register.ts ] || fail "40.6 setup 清單選 2 應裝 mod"
[ "$(modlang)" = zh-TW ] || fail "40.6 setup 裝 zh-TW 後 mod 讀到的語言應為 zh-TW(got $(modlang))"
newrepo "$TMP/md6b" >/dev/null
node "$CLI" init --agents=claude --mod --lang=ja --profile=notes >/dev/null
grep -q 'lang=ja profile=notes' CLAUDE.md || fail "40.6 測試前提:marker 應帶 lang=ja profile=notes"
[ "$(modlang)" = ja ] || fail "40.6 profile=notes 的 marker,mod 應讀到 ja(got $(modlang))"
newrepo "$TMP/md6c" >/dev/null; echo "# 共用" > CLAUDE.md; git add CLAUDE.md; git commit -qm base
node "$CLI" init --private --agents=claude --mod --lang=zh-CN >/dev/null
grep -q 'flightwake:begin' CLAUDE.md && fail "40.6 測試前提:受追蹤的 CLAUDE.md 不得被寫"
[ "$(modlang)" = zh-CN ] || fail "40.6 private(marker 在 CLAUDE.local.md)mod 應讀到 zh-CN(got $(modlang))"
newrepo "$TMP/md6d" >/dev/null; echo "# 共用" > CLAUDE.md; echo "# 本地" > CLAUDE.local.md; git add -A; git commit -qm base
node "$CLI" init --private --agents=claude,codex --mod --lang=ja >/dev/null
grep -q 'flightwake:begin' CLAUDE.md CLAUDE.local.md && fail "40.6 測試前提:兩個受追蹤的 Claude 指令檔都不得被寫"
grep -q 'flightwake:begin v[0-9.]* lang=ja' AGENTS.md || fail "40.6 測試前提:AGENTS.md 應有 ja marker"
[ -f $MODREL/hooks/register.ts ] || fail "40.6 測試前提:mod 應已安裝"
[ "$(modlang)" = ja ] || fail "40.6 只有 AGENTS.md 有 marker 時 mod 應讀到 ja(got $(modlang))"
pass "40.6 安裝語言經 marker 傳給 mod:setup zh-TW、notes ja、CLAUDE.local.md zh-CN、只剩 AGENTS.md ja"

# 40.7 setup:mod 列只在選了 Claude Code 時出現、預選;摘要含 mod 路徑;兩者都選時一句話說明橫條與儀表
newrepo "$TMP/md7a" >/dev/null
out=$(node "$DRIVE" --orca=0 -- "" 2 "" "" "" 2>&1) || fail "40.7 只選 codex 的 setup 應成功(out: $out)"
echo "$out" | grep -q 'Claude Code mod —' && fail "40.7 沒選 Claude Code 不得列出 mod"
newrepo "$TMP/md7b" >/dev/null; echo "# 我的" > CLAUDE.md
out=$(node "$DRIVE" --orca=0 -- "" "" "" "" "" 2>&1) || fail "40.7 mod 預選的 setup 應成功(out: $out)"
echo "$out" | grep -q '\[\*\] 2) Claude Code mod —' || fail "40.7 選了 Claude Code 應列出 mod 且預選(got: $out)"
echo "$out" | grep -A3 'Claude Code mod —' | grep -q '2.1.287' && echo "$out" | grep -A3 'Claude Code mod —' | grep -qi 'trust' || fail "40.7 mod 列應提到 2.1.287 與第一次的資料夾信任(got: $out)"
[ -f $MODREL/hooks/register.ts ] || fail "40.7 mod 預選,Enter 應安裝"
newrepo "$TMP/md7b2" >/dev/null; echo "# 我的" > CLAUDE.md
node "$DRIVE" --orca=0 -- "" "" 0 "" "" >/dev/null || fail "40.7 清單答 0 的 setup 應成功"
[ -e $MODREL ] && fail "40.7 清單答 0 不得安裝 mod"
grep -q statusLine .claude/settings.json && fail "40.7 清單答 0 不得安裝 statusLine"
newrepo "$TMP/md7c" >/dev/null; echo "# 我的" > CLAUDE.md
out=$(node "$DRIVE" --orca=0 -- "" "" "1 2" "" "" 2>&1) || fail "40.7 儀表 + mod 的 setup 應成功(out: $out)"
echo "$out" | sed -n '/These paths will be written/,/Proceed/p' | grep -q "$MODREL/" || fail "40.7 摘要應列出 $MODREL/"
[ -f $MODREL/hooks/register.ts ] && grep -q statusLine .claude/settings.json || fail "40.7 兩者都選應都安裝(不因 mod 而不裝儀表)"
echo "$out" | grep -qi 'band above the prompt' && echo "$out" | grep -qi 'bottom gauge' || fail "40.7 兩者都選時結尾應說明橫條與底部儀表各顯示什麼(got: $out)"
echo "$out" | grep -q 'flightwake-mod@skills-dir' || fail "40.7 setup 裝 mod 後結尾應說明角色守門的啟用方式"
newrepo "$TMP/md7d" >/dev/null; echo "# 我的" > CLAUDE.md
summary_vs_writes "新裝含 mod" --orca=0 -- "" "" 2 "" ""
[ -f $MODREL/hooks/register.ts ] || fail "40.7 測試前提:mod 應已安裝"
summary_vs_writes "已安裝(含 mod)→ 升級" -- "" ""
pass "40.7 setup:mod 列只對 Claude 列出、預選(Enter 裝、0 不裝)、說明版本與信任;摘要 == 實際寫入;儀表與 mod 並存說明"

# 40.8 既有防護涵蓋 mod 路徑:預檢列出 mod;symlink(資料夾連到 repo 外、內部檔指向 STATE)、hardlink、權限
newrepo "$TMP/md8a" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null
mkdir -p "$TMP/md8a-out" && mv $MODREL "$TMP/md8a-out/" && ln -s "$TMP/md8a-out/flightwake-mod" $MODREL
ob=$(cd "$TMP/md8a-out" && find . -type f | sort | xargs shasum | shasum); b=$(fsnap)
rc=0; out=$(node "$CLI" update 2>&1) || rc=$?
[ "$rc" = 1 ] && [ "$b" = "$(fsnap)" ] && [ "$ob" = "$(cd "$TMP/md8a-out" && find . -type f | sort | xargs shasum | shasum)" ] || fail "40.8 mod 資料夾連到 repo 外時 update 應在預檢中止、零寫入(rc=$rc: $out)"
echo "$out" | grep -q 'flightwake-mod' || fail "40.8 拒寫訊息應點名 mod 路徑(got: $out)"
rc=0; out=$(node "$CLI" uninstall 2>&1) || rc=$?
[ "$rc" = 1 ] && [ -f "$TMP/md8a-out/flightwake-mod/hooks/register.ts" ] || fail "40.8 uninstall 不得刪除 repo 外的 mod 內容(rc=$rc)"
newrepo "$TMP/md8b" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null; echo "# KEEP" >> .flightwake/STATE.md
rm $MODREL/hooks/register.ts && ln -s ../../../../.flightwake/STATE.md $MODREL/hooks/register.ts
st=$(shasum < .flightwake/STATE.md); b=$(fsnap); rc=0; out=$(node "$CLI" update 2>&1) || rc=$?
[ "$rc" = 1 ] && [ "$st" = "$(shasum < .flightwake/STATE.md)" ] && [ "$b" = "$(fsnap)" ] || fail "40.8 mod 內檔案是指向 STATE 的 symlink 時 update 應拒寫、STATE 不變(rc=$rc: $out)"
newrepo "$TMP/md8c" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null; echo "# KEEP" >> .flightwake/STATE.md
rm $MODREL/hooks/register.ts && ln .flightwake/STATE.md $MODREL/hooks/register.ts
st=$(shasum < .flightwake/STATE.md); node "$CLI" update >/dev/null || fail "40.8 hardlink 情境 update 應成功"
[ "$st" = "$(shasum < .flightwake/STATE.md)" ] && cmp -s "$MODSRC/hooks/register.ts" $MODREL/hooks/register.ts || fail "40.8 mod 檔是 STATE 的 hardlink 時,update 應換成獨立的新檔、STATE 不變"
(
umask 022
newrepo "$TMP/md8d" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null
chmod 600 $MODREL/hooks/register.ts; echo "// old" > $MODREL/hooks/register.ts; chmod 600 $MODREL/hooks/register.ts
node "$CLI" update >/dev/null && cmp -s "$MODSRC/hooks/register.ts" $MODREL/hooks/register.ts || fail "40.8 權限情境 update 應刷新檔案"
[ "$(fmode $MODREL/hooks/register.ts)" = 600 ] || fail "40.8 mod 檔重寫後應維持 0600(got $(fmode $MODREL/hooks/register.ts))"
[ "$(fmode $MODREL/hooks/hooks.json)" = 644 ] || fail "40.8 mod 新檔用預設 0644"
)
# 預檢依實際發行檔逐一檢查目的地與祖先型別:mod 內、skill 內的發行檔位置是目錄 / 祖先是一般檔 → 第一個寫入前中止
type_variant() { # $1 名稱 $2 準備指令 $3 安裝指令 $4 預期點名的路徑
  newrepo "$TMP/md8t-$5" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null; eval "$2"
  local b rc=0 out; b=$(fsnap); out=$(eval "$3" 2>&1) || rc=$?
  [ "$rc" = 1 ] && [ "$b" = "$(fsnap)" ] || fail "40.8 $1:應在第一個寫入前中止、零寫入(rc=$rc: $out)"
  echo "$out" | grep -q "$4" && echo "$out" | grep -qi 'nothing was written' || fail "40.8 $1:應點名 $4 並說明什麼都沒寫(got: $out)"
  echo "$out" | grep -qE 'EISDIR|ENOTDIR|at .*\.mjs:[0-9]+' && fail "40.8 $1:不得以例外結束(got: $out)"
  return 0
}
type_variant "mod 發行檔位置是目錄" "rm $MODREL/hooks/register.ts && mkdir $MODREL/hooks/register.ts" 'node "$CLI" init --agents=claude --mod --force' "$MODREL/hooks/register.ts" a
type_variant "mod 發行檔的祖先是一般檔" "rm -rf $MODREL/hooks/lib && echo x > $MODREL/hooks/lib" 'node "$CLI" update' "$MODREL/hooks/lib" b
type_variant "skill 檔位置是目錄" "rm .claude/skills/fw-record/SKILL.md && mkdir .claude/skills/fw-record/SKILL.md" 'node "$CLI" update' ".claude/skills/fw-record/SKILL.md" c
newrepo "$TMP/md8t-roles" >/dev/null; node "$CLI" init --agents=claude >/dev/null && node "$CLI" roles install >/dev/null
rm .claude/skills/fw-roles/SKILL.md && mkdir .claude/skills/fw-roles/SKILL.md && echo x > .claude/skills/fw-roles/SKILL.md/junk
node "$CLI" update >/dev/null && [ -f .claude/skills/fw-roles/SKILL.md ] || fail "40.8 fw-roles 是整目錄替換,內部型別衝突應被替換掉而非中止"
pass "40.8 symlink(資料夾在 repo 外、內部檔指向 STATE)、hardlink、權限、發行檔目的地與祖先型別(mod / skill;fw-roles 整目錄替換)的防護涵蓋 mod 路徑"

# 40.9 doctor:未安裝 = 提醒以外的選配資訊;已安裝檢查 manifest / hooks 模組 / 版本;Claude Code 版本;印出看不到的兩件事
NOCL="$TMP/nocl-bin"; mkdir -p "$NOCL"; ln -sf "$NODE_BIN" "$NOCL/node"; ln -sf "$(command -v git)" "$NOCL/git"
fakeclaude() { mkdir -p "$TMP/fc-$1"; printf '#!/bin/sh\necho "%s (Claude Code)"\n' "$1" > "$TMP/fc-$1/claude"; chmod +x "$TMP/fc-$1/claude"; echo "$TMP/fc-$1"; }
docmod() { local p="$1"; shift; PATH="$p" "$NODE_BIN" "$CLI" doctor 2>&1; }
newrepo "$TMP/md9" >/dev/null; node "$CLI" init --agents=claude >/dev/null
rc=0; out=$(docmod "$NOCL") || rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -qi 'mod: not installed (optional)' || fail "40.9 未安裝 mod 應只回報狀態且 doctor 0(rc=$rc: $out)"
node "$CLI" init --agents=claude --mod >/dev/null
rc=0; out=$(docmod "$(fakeclaude 2.1.290):$NOCL") || rc=$?
[ "$rc" = 0 ] || fail "40.9 新裝 mod 的 doctor 應 0(rc=$rc: $out)"
echo "$out" | grep -E '^  ok' | grep -q "flightwake-mod.*v$MODV" || fail "40.9 應回報已安裝的 mod 版本(got: $out)"
echo "$out" | grep -E '^  ok' | grep -q 'Claude Code 2.1.290' || fail "40.9 取得 Claude Code 版本且 ≥2.1.287 應為 ok(got: $out)"
echo "$out" | grep -qi 'trust' && echo "$out" | grep -qi 'repo root' || fail "40.9 應印出 doctor 看不到的兩件事:資料夾信任、從 repo 根目錄啟動(got: $out)"
rc=0; out=$(docmod "$(fakeclaude 2.1.200):$NOCL") || rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -E '^  !' | grep -q '2.1.287' || fail "40.9 Claude Code 低於 2.1.287 應為提醒(不失敗)(rc=$rc: $out)"
rc=0; out=$(docmod "$NOCL") || rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -E '^  ·' | grep -q 'claude --version' || fail "40.9 取不到 Claude Code 版本只印提示、不算失敗(rc=$rc: $out)"
b=$(fsnap); docmod "$(fakeclaude 2.1.290):$NOCL" >/dev/null; [ "$b" = "$(fsnap)" ] || fail "40.9 doctor(含 mod 檢查)必須唯讀"
mod_doc_variant() { # $1 名稱 $2 破壞指令 $3 預期等級(✗ 或 !)$4 預期文字(grep -E)$5 預期退出碼
  MDV=$((${MDV:-0} + 1)); local dir="$TMP/md9-v$MDV"; cp -R "$TMP/md9" "$dir"; ( cd "$dir" && eval "$2" )
  local rc=0 out; out=$(cd "$dir" && PATH="$NOCL" "$NODE_BIN" "$CLI" doctor 2>&1) || rc=$?
  [ "$rc" = "$5" ] || fail "40.9 doctor:$1 應退出 $5(rc=$rc: $out)"
  echo "$out" | grep -E "^  $3" | grep -qE "$4" || fail "40.9 doctor:$1 應有點名問題的行(預期 $3 /$4/;got: $out)"
  echo "$out" | grep -qE 'at .*\.mjs:[0-9]+|TypeError|SyntaxError' && fail "40.9 doctor:$1 不得以例外崩潰(got: $out)"
  return 0
}
mod_doc_variant "缺 manifest" "rm $MODREL/.claude-plugin/plugin.json" '✗' 'flightwake-mod.*plugin\.json' 1
mod_doc_variant "manifest 損毀" "echo '{ bad' > $MODREL/.claude-plugin/plugin.json" '✗' 'flightwake-mod.*plugin\.json' 1
mod_doc_variant "缺 hooks.json" "rm $MODREL/hooks/hooks.json" '✗' 'flightwake-mod.*hooks\.json' 1
mod_doc_variant "缺 hooks 模組" "rm $MODREL/hooks/register.ts" '✗' 'flightwake-mod.*register\.ts' 1
mod_doc_variant "版本不一致" "jedit $MODREL/.claude-plugin/plugin.json 'j.version=\"0.0.1\"'" '!' 'flightwake-mod.*0\.0\.1.*update' 0
mod_doc_variant "發行檔被改" "echo '// x' >> $MODREL/hooks/lib/core.ts" '!' 'flightwake-mod.*hooks/lib/core\.ts.*update' 0
newrepo "$TMP/md9p" >/dev/null; echo x > README; git add README; git commit -qm init
node "$CLI" init --private --agents=claude --mod >/dev/null
sed -i.bak "\|^$MODREL/\$|d" .git/info/exclude && rm -f .git/info/exclude.bak
rc=0; out=$(docmod "$NOCL") || rc=$?
[ "$rc" = 1 ] && echo "$out" | grep -q "✗.*--private.*flightwake-mod" || fail "40.9 private 下 mod 資料夾沒被忽略時 doctor 應失敗並點名(rc=$rc: $out)"
pass "40.9 doctor:mod 未安裝/已安裝、manifest/hooks 模組/版本/內容、Claude Code 版本(ok/提醒/取不到)、private 排除、唯讀"

# 41. 第二階段延後的三件事 — 只是關鍵字的文字檢查(四語),不驗證 agent 實際行為
for l in en zh-TW zh-CN ja; do
  grep -q '/fw-log' "$SRC/skills/$l/fw-record/SKILL.md" && grep -q 'unknown' "$SRC/skills/$l/fw-record/SKILL.md" || fail "41 $l fw-record 應說明有 /fw-log 時先取用其輸出、unknown 要自己判斷"
  grep -q 'paths' "$SRC/skills/$l/fw-trap/SKILL.md" && grep -q 'commands' "$SRC/skills/$l/fw-trap/SKILL.md" || fail "41 $l fw-trap 應說明選填欄位 paths / commands"
  sed -n '/^---$/,/^---$/p' "$SRC/templates/$l/TRAPS.md" | grep -q '^paths: \[\]' && sed -n '/^---$/,/^---$/p' "$SRC/templates/$l/TRAPS.md" | grep -q '^commands: \[\]' || fail "41 $l TRAPS 範本條目應有空的 paths / commands 欄位"
done
node -e "const a=require('$SRC/mods/flightwake/.claude-plugin/plugin.json').author; if(!a||!a.name) process.exit(1)" || fail "41 mod manifest 應有 author"
pass "41 文字檢查(關鍵字,不驗證 agent 行為):fw-record 提到 /fw-log 與 unknown、fw-trap 與 TRAPS 範本有 paths/commands(四語);manifest 有 author"

# 42. 既有安裝的試裝回饋:「下一步」依 STATE 是否已初始化;「尚無 record」的正規寫法(latest_record: none)
filled_state() { printf -- '---\nupdated: 2026-10-05\nupdated_by: tester\nlatest_record: %s\nhealth: yellow  # test\n---\n\n# Where we are\n\nfilled\n' "$1" > .flightwake/STATE.md; }
newrepo "$TMP/nx1" >/dev/null
out=$(node "$CLI" init --agents=claude 2>&1) || fail "42 新裝應成功"
echo "$out" | grep -q 'writes the first STATE' || fail "42 新裝(STATE 未填)的下一步應提示 fw-coldstart 寫第一版 STATE(got: $out)"
filled_state none
for c in "init --agents=claude --force" "init --agents=claude --force --mod" "update"; do
  out=$(node "$CLI" $c 2>&1) || fail "42 $c 應成功"
  echo "$out" | grep -qi 'first STATE' && fail "42 STATE 已初始化時,$c 的結尾不得再說會寫出第一版 STATE(got: $out)"
done
out=$(node "$CLI" init --agents=claude --force 2>&1)
echo "$out" | grep -q 'git commit' || fail "42 STATE 已初始化時 init --force 的下一步應只提示 commit(got: $out)"
newrepo "$TMP/nx2" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null
filled_state none; rm -f .claude/skills/flightwake-mod/hooks/register.ts
out=$(node "$CLI" init --agents=claude --force --mod --lang=zh-TW 2>&1) || fail "42 zh-TW --force 應成功"
echo "$out" | grep -q '第一版 STATE' && fail "42 zh-TW:STATE 已初始化不得說寫出第一版 STATE(got: $out)"
newrepo "$TMP/nx3" >/dev/null; echo x > README; git add README; git commit -qm i
node "$CLI" init --private >/dev/null; filled_state none
out=$(node "$CLI" init --private --force 2>&1) || fail "42 private --force 應成功"
echo "$out" | grep -qi 'first STATE' && fail "42 private:STATE 已初始化不得說寫出第一版 STATE(got: $out)"
# doctor:latest_record: none 是正規的「尚無 record」;records/ 為空時其他寫法也不算問題;records/ 有檔卻指向不存在才提醒
newrepo "$TMP/nx4" >/dev/null; node "$CLI" init --agents=claude >/dev/null
for v in none '(尚無)' 'records/YYMMDD-none.md'; do
  filled_state "$v"; rc=0; out=$(node "$CLI" doctor 2>&1) || rc=$?
  [ "$rc" = 0 ] || fail "42 doctor latest_record=$v 應 0(rc=$rc: $out)"
  echo "$out" | grep -E '^  (!|✗)' | grep -q 'latest_record' && fail "42 doctor:records/ 為空時 latest_record=$v 不得列為提醒或失敗(got: $out)"
  echo "$out" | grep -E '^  ·' | grep -q 'no record yet' || fail "42 doctor:應以資訊列回報尚無 record(latest_record=$v;got: $out)"
done
echo '---' > .flightwake/records/260101-x.md; filled_state records/260102-missing.md
out=$(node "$CLI" doctor 2>&1)
echo "$out" | grep -E '^  !' | grep -q 'latest_record' || fail "42 doctor:records/ 有檔卻指向不存在的檔,仍應提醒(got: $out)"
for l in en zh-TW zh-CN ja; do grep -q 'latest_record: none' "$SRC/skills/$l/fw-coldstart/SKILL.md" && grep -q 'doctor' "$SRC/skills/$l/fw-coldstart/SKILL.md" || fail "42 $l fw-coldstart 應說明 none 是唯一正規寫法(doctor 認得)"; done
pass "42 下一步依 STATE 是否已初始化(init --force/update/private/zh-TW);latest_record: none 與空 records/ 不算問題;fw-coldstart 四語提到正規寫法(關鍵字檢查)"

# 43. 真機回饋(驗收者在真實終端機與 Claude Code 實測)
# 43.1 setup 在真的 pty 下,已回答的題目與答案都留在畫面上(四語):不送任何游標移動/清除的控制序列,答案與題目同一行
if [ "$HAVE_PY" = 1 ]; then
  PTYANS="$SRC/test/pty-answers.py"
  PY3="$(command -v python3)"
  for ln in 1 2 3 4; do
    newrepo "$TMP/tty-$ln" >/dev/null
    rc=0; env -u ORCA_APP_VERSION -u ORCA_TERMINAL_HANDLE -u ORCA_WORKSPACE_ID PATH="$NOCL" "$PY3" "$PTYANS" 60 "$NODE_BIN" "$CLI" setup -- "$ln" 1 2 "" n > "$TMP/tty-$ln.out" 2>&1 || rc=$?
    [ "$rc" = 1 ] || fail "43.1 lang=$ln:最終確認答 n 應退出 1(rc=$rc)"
    node -e '
      const fs = require("fs"); const raw = fs.readFileSync(process.argv[1], "utf8"); const ln = process.argv[2];
      const bad = [];
      if (/\x1b\[/.test(raw)) bad.push("output contains cursor/erase control sequences: " + JSON.stringify(raw.match(/\x1b\[[0-9;?]*[A-Za-z]/g).slice(0, 5)));
      const lines = raw.split(/\r?\n/).map((l) => l.replace(/\r/g, "").trimEnd());
      const need = [[/\[\d\] ?(\d)$/, "language prompt with its answer", (m) => m[1] === ln],
                    [/(none|都不要|なし): ?2$/, "add-ons prompt with its answer 2"],
                    [/\[Y\/n\] ?n$/, "final confirmation with its answer n"]];
      for (const [re, what, ok = () => true] of need) if (!lines.some((l) => { const m = re.exec(l); return m && ok(m); })) bad.push("missing on screen: " + what);
      if (bad.length) { console.log(bad.join("\n") + "\n---\n" + lines.join("\n")); process.exit(1); }
    ' "$TMP/tty-$ln.out" "$ln" || fail "43.1 lang=$ln:畫面上應保留每一題與答案($(head -c 300 "$TMP/tty-$ln.out" | tr -d '\033'))"
    [ ! -e .flightwake ] || fail "43.1 lang=$ln:取消後不得寫入"
  done
  # Ctrl-C 在問答中仍是零寫入、非零退出
  newrepo "$TMP/tty-int" >/dev/null; b=$(snap)
  rc=0; PATH="$NOCL" "$PY3" "$PTYANS" 30 "$NODE_BIN" "$CLI" setup -- 2 $'\x03' >/dev/null 2>&1 || rc=$?
  [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ] && [ "$b" = "$(snap)" ] || fail "43.1 問答中 Ctrl-C 應非零退出且零寫入(rc=$rc)"
  pass "43.1 setup 在真的 pty 下不送游標/清除控制序列,四語的題目與答案都留在畫面上;Ctrl-C 零寫入"
else
  echo "  skip: 沒有 python3,略過 43.1(pty)"
fi

# 43.2 mod 狀態指令與橫條新規則在安裝器/doctor/skill 的文字(四語 skill 部分是關鍵字檢查)
cv=$(sed -n "s/^export const MOD_VERSION = '\(.*\)'$/\1/p" "$SRC/mods/flightwake/hooks/lib/core.ts")
[ "$cv" = "$MODV" ] || fail "43.2 mod 的 MOD_VERSION($cv)應與 plugin.json 的 version($MODV)一致"
newrepo "$TMP/fm1" >/dev/null
out=$(node "$CLI" init --agents=claude --mod 2>&1) || fail "43.2 init --mod 應成功"
echo "$out" | grep -q '/fw-mod' || fail "43.2 安裝結尾應指向 /fw-mod 確認 mod 有載入(got: $out)"
echo "$out" | grep -qi 'band above the prompt is always shown' || fail "43.2 沒裝底部儀表時,結尾應說明橫條一律顯示並帶 context(got: $out)"
out=$(node "$CLI" doctor 2>&1)
echo "$out" | grep -E '^  ·' | grep -q '/fw-mod' || fail "43.2 doctor 應指向 /fw-mod 確認載入(got: $out)"
newrepo "$TMP/fm2" >/dev/null
out=$(node "$CLI" init --agents=claude --mod --statusline 2>&1)
echo "$out" | grep -qi 'band above the prompt is always shown' && fail "43.2 有底部儀表時不應說橫條一律顯示"
echo "$out" | grep -qi 'bottom gauge and mod together' || fail "43.2 有底部儀表時應印並存說明"
for l in en zh-TW zh-CN ja; do
  case $l in en) k='chained';; zh-TW|zh-CN) k='串在一起';; ja) k='つなげて';; esac
  grep -q "$k" "$SRC/skills/$l/fw-record/SKILL.md" || fail "43.2 $l fw-record 應說明與其他指令串在一起跑的測試不能當通過證據(關鍵字 $k)"
done
pass "43.2 MOD_VERSION 與 plugin.json 一致;安裝結尾與 doctor 指向 /fw-mod;無儀表時說明橫條一律顯示;fw-record 四語提到串接的測試(關鍵字檢查)"

# 44. Astra 收尾複審第 2 點:uninstall 遇到「發行清單中應為檔案、實際是目錄」不遞迴刪除;skill 與 fw-roles 同樣處理;自加檔一律保留並列出
newrepo "$TMP/un1" >/dev/null; node "$CLI" init --agents=claude --mod >/dev/null && node "$CLI" roles install >/dev/null
for d in "$MODREL/hooks/register.ts" .claude/skills/fw-record/SKILL.md .claude/skills/fw-roles/SKILL.md; do rm -rf "$d" && mkdir -p "$d" && echo keep > "$d/KEEP"; done
echo mine > .claude/skills/fw-trap/MINE.md
rc=0; out=$(node "$CLI" uninstall 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "44 uninstall 應成功(rc=$rc: $out)"
for d in "$MODREL/hooks/register.ts" .claude/skills/fw-record/SKILL.md .claude/skills/fw-roles/SKILL.md; do
  [ "$(cat "$d/KEEP" 2>/dev/null)" = keep ] || fail "44 $d 是目錄(型別不符)時 uninstall 不得刪除其中的使用者檔"
  echo "$out" | grep -q "$(basename "$(dirname "$d")")/SKILL.md\|hooks/register.ts" || fail "44 應列出型別不符而保留的 $d(got: $out)"
done
[ "$(cat .claude/skills/fw-trap/MINE.md 2>/dev/null)" = mine ] || fail "44 skill 資料夾裡的自加檔應保留"
echo "$out" | grep -q 'MINE.md' || fail "44 應列出保留的自加檔 MINE.md(got: $out)"
[ ! -e .claude/skills/fw-coldstart ] && [ ! -e .claude/skills/fw-handoff ] || fail "44 沒有自加內容的 skill 資料夾應整個移除"
[ ! -e "$MODREL/hooks/hooks.json" ] && [ ! -e "$MODREL/.claude-plugin/plugin.json" ] || fail "44 其他發行檔仍應移除"
pass "44 uninstall:發行檔位置是目錄時保留並列出(mod / skill / fw-roles),skill 內自加檔保留並列出,其餘照常移除"

# 45. F7 session fleet:`npx flightwake fleet`(唯讀清單 / --json / --prune 唯一的刪除路徑)、init --mod 建 0700 的 sessions、
#     uninstall(含 --purge)不碰 sessions 並印「kept」、靜態檢查(fs.write 只在 fleet.ts;§8 常數三處一致)
#     transcript 只認「該 session 自己在 <HOME>/.claude/projects/<key>/<id>.jsonl」的路徑;其他路徑(e3 的 $FH/t.jsonl)永不看
FH="$TMP/fleet-home"; FS="$FH/sessions"; FU="$TMP/fleet-user"; mkdir -p "$FS" "$FU/.claude/projects/-x"
TRS() { printf '%s' "$FU/.claude/projects/-x/$1.jsonl"; }
for t in b1 s1 e1 e4; do : > "$(TRS $t)"; done; : > "$FH/t.jsonl"
fleet() { HOME="$FU" FLIGHTWAKE_HOME="$FH" node "$CLI" fleet "$@"; }
fsnap2() { { find "$1" | sort; find "$1" -type f -exec shasum {} + | sort -k2; find "$1" -type l -exec ls -l {} + | awk '{print $NF}' | sort; } | shasum; }
D=86400000
fseed "$FS" b1 "({$BLK,heartbeatAt:now-1000,root:'/x/api',transcript:'$(TRS b1)'})"
fseed "$FS" w1 "({state:'working',stateSince:now-12000,activity:{tool:'Edit',target:'src/a.ts',agent:false,at:now},root:'/x/orca/wt',repoRoot:'/x/orca'})"
fseed "$FS" i1 "({lastTurn:{reason:'answer',at:now-5000,durationMs:1000}})"
fseed "$FS" s1 "({state:'working',heartbeatAt:now-3*3600000,launchCwd:\"/x/it's\",transcript:'$(TRS s1)'})" $((3*3600000))
fseed "$FS" e1 "({state:'ended',heartbeatAt:now-$D,ended:{reason:'other',at:now-$D,stateAtEnd:'idle'},transcript:'$(TRS e1)'})" $D
fseed "$FS" e2 "({state:'ended',heartbeatAt:now-$D,ended:{reason:'prompt_input_exit',at:now-$D,stateAtEnd:'idle'},transcript:'$(TRS e2)'})" $D
fseed "$FS" e3 "({state:'ended',heartbeatAt:now-$D,ended:{reason:'other',at:now-$D,stateAtEnd:'idle'},transcript:'$FH/t.jsonl'})"
fseed "$FS" e4 "({state:'ended',heartbeatAt:now-$D,ended:{reason:'prompt_input_exit',at:now-$D,stateAtEnd:'idle'},transcript:'$(TRS e4)'})" $D
fseed "$FS" u2 "({schema:'flightwake.session/2'})"
printf '{"schema":"flightwake.sess' > "$FS/torn.json"
printf '{"schema":"flightwake.session/1","sess' > "$FS/oldbad.json"; touch -t 202001010000 "$FS/oldbad.json"
printf 'garbage' > "$FS/oldjunk.json"; touch -t 202001010000 "$FS/oldjunk.json"
printf '{"name":"my fixture","user":"x"}' > "$FS/fixture.json"; touch -t 202001010000 "$FS/fixture.json"
fseed "$FH" outside "({state:'ended',ended:{reason:'other',at:now-$D,stateAtEnd:'idle'}})" $D
ln -s "$FH/outside.json" "$FS/lnk.json"
echo notes > "$FS/notes.txt"; cp "$FS/e1.json" "$FS/.hidden.json"; touch -t 202001010000 "$FS/.hidden.json"
FN="$TMP/fleet-nonrepo"; mkdir -p "$FN" && cd "$FN"
before=$(fsnap2 "$FH"); cwd_before=$(fsnap2 "$FN")
rc=0; out=$(fleet 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "45 fleet 在非 repo 目錄應成功(rc=$rc: $out)"
echo "$out" | head -1 | grep -q '^flightwake fleet — 3 live · ⛔ 1 blocked · 3 resumable — ' || fail "45 標頭摘要不對(got: $out)"
node -e '
  const L=process.argv[1].split("\n").slice(1); const at=(k)=>L.findIndex((l)=>l.startsWith(k));
  const o=["⛔ blocked","● working","○ idle","◌ stale","– ended","? unknown"].map(at);
  if (o.some((i)=>i<0) || o.some((v,i)=>i&&v<o[i-1])) process.exit(1);' "$out" || fail "45 順序應為 blocked < working < idle < stale < ended < unknown(got: $out)"
echo "$out" | grep -q 'orca ⎇ wt' || fail "45 worktree 應顯示 repo ⎇ worktree(got: $out)"
[ "$(echo "$out" | grep -c 'claude --resume')" = 3 ] || fail "45 只有 s1(stale)、e1(ended other)與 e4(正常 /exit)有 transcript 可接回;e2 的 transcript 不在、e3 的路徑不是它的 transcript(got: $out)"
echo "$out" | grep -q 'claude --resume e4' || fail "45 正常 /exit(prompt_input_exit)且 transcript 在的 e4 也應可接回(got: $out)"
echo "$out" | grep 'claude --resume' | grep -vq "cd '" && fail "45 resume 指令一律帶 cd '…'(got: $out)"
echo "$out" | grep -qF "cd '/x/it'\\''s' && claude --resume s1" || fail "45 launchCwd 的單引號應 shell 跳脫(got: $out)"
echo "$out" | grep -q '1 file(s) could not be read' || fail "45 torn.json 應計入讀不了(7 天外的 oldbad/oldjunk/fixture 不讀)(got: $out)"
echo "$out" | grep -q 'unknown format' || fail "45 schema /2 應顯示 unknown(got: $out)"
echo "$out" | grep -q 'outside\|notes\|hidden\.json' && fail "45 symlink / 非 FILE_RE 的名稱不得列出(got: $out)"
js=$(fleet --json) || fail "45 --json 應成功"
node -e '
  const j=JSON.parse(process.argv[1]); const by=(id)=>j.sessions.find((s)=>s.sessionId===id);
  const ok = j.version===1 && j.counts && j.counts.blocked===1 && j.counts.unknown===1 && j.constants.heartbeatMs===30000
    && j.sessions.every((s)=>typeof s.display==="string" && "resumeCommand" in s && typeof s.file==="string")
    && by("s1").display==="stale" && /^cd \x27/.test(by("s1").resumeCommand) && by("e2").resumeCommand===null && by("b1").resumeCommand===null
    && by("e3").resumeCommand===null && /claude --resume e4$/.test(by("e4").resumeCommand)
    && by("u2").display==="unknown" && j.unreadable.some((u)=>u.file==="torn.json") && j.hidden>=1;
  if (!ok) { console.log(JSON.stringify(j).slice(0,400)); process.exit(1); }' "$js" || fail "45 --json 結構不對"
fleet --lang=ja | head -1 | grep -q '稼働 3' || fail "45 --lang=ja 標頭"
fleet --lang=zh-TW | head -1 | grep -q '3 個進行中' || fail "45 --lang=zh-TW 標頭"
fleet --root=/x/orca | grep -q 'orca ⎇ wt' || fail "45 --root= 應以 repoRoot 也能比對"
fleet --root=/x/orca | grep -q ' api \| s1 \| e1 ' && fail "45 --root= 應只留該 repo 的列"
[ "$(fsnap2 "$FH")" = "$before" ] && [ "$(fsnap2 "$FN")" = "$cwd_before" ] || fail "45 fleet / --json 必須唯讀"
rc=0; out=$(FLIGHTWAKE_HOME="$TMP/fleet-missing" node "$CLI" fleet 2>&1) || rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -q 'no session has reported yet' || fail "45 資料夾不存在 → exit 0 並說明(rc=$rc: $out)"
FLIGHTWAKE_HOME="$TMP/fleet-missing" node "$CLI" fleet --json | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8")); if(j.version!==1||j.sessions.length) process.exit(1)' || fail "45 資料夾不存在時 --json 仍是一個物件"
[ -e "$TMP/fleet-missing" ] && fail "45 fleet 不得建立不存在的資料夾"
rc=0; fleet --days=x >/dev/null 2>&1 || rc=$?; [ "$rc" = 1 ] || fail "45 --days=x 應 exit 1"
rc=0; fleet --bogus >/dev/null 2>&1 || rc=$?; [ "$rc" = 1 ] || fail "45 不認得的旗標應 exit 1"
node "$CLI" --help | grep -q '^  fleet ' || fail "45 help 應列出 fleet"
out=$(fleet --prune --days=0 --dry-run) || fail "45 --prune --dry-run 應成功"
echo "$out" | grep -q 'would remove  e1.json' || fail "45 --dry-run 應列出將刪除的檔(got: $out)"
[ "$(fsnap2 "$FH")" = "$before" ] || fail "45 --prune --dry-run 不得刪任何東西"
out=$(fleet --prune --days=0) || fail "45 --prune 應成功"
for f in e1 e2 e4 s1 oldbad; do [ -e "$FS/$f.json" ] && fail "45 --prune --days=0 應刪除 $f.json(got: $out)"; done
for f in b1 w1 i1 e3 u2 torn .hidden oldjunk fixture; do [ -f "$FS/$f.json" ] || fail "45 --prune 不得刪 $f.json(剛寫過 / 進行中 / 不符檔名 / 不是我們的檔)(got: $out)"; done
[ -L "$FS/lnk.json" ] && [ -f "$FH/outside.json" ] && [ -f "$FS/notes.txt" ] && [ -d "$FS" ] || fail "45 --prune 不得碰 symlink、其目標、非 .json 檔或資料夾本身"
echo "$out" | tail -1 | grep -q '^pruned 5 of ' || fail "45 prune 摘要(got: $out)"
echo "$out" | grep -q 'fixture\|oldjunk' && fail "45 --prune 不得列出不是 flightwake session 的檔(got: $out)"
# base 在某個 repo 裡:--prune 拒絕(exit 1、什麼都不刪),--dry-run 也一樣
PR="$TMP/fl-prune-repo"; mkdir -p "$PR" && (cd "$PR" && git init -q)
fseed "$PR/fw/sessions" old1 "({state:'ended',heartbeatAt:now-$D,ended:{reason:'other',at:now-$D,stateAtEnd:'idle'}})" $D
for extra in "" "--dry-run"; do
  rc=0; out=$(FLIGHTWAKE_HOME="$PR/fw" node "$CLI" fleet --prune --days=0 $extra 2>&1) || rc=$?
  [ "$rc" = 1 ] && [ -f "$PR/fw/sessions/old1.json" ] || fail "45 base 在 repo 裡時 --prune $extra 應 exit 1 且不刪(rc=$rc: $out)"
  echo "$out" | grep -qF "$PR/fw/sessions lies inside a repo or a flightwake records folder; nothing deleted" || fail "45 拒絕 --prune 時應說明(got: $out)"
done
# uninstall / --purge:sessions 位元組不變、印 kept 行
newrepo "$TMP/fl-un" >/dev/null; FLIGHTWAKE_HOME="$FH" node "$CLI" init --agents=claude --mod >/dev/null
before=$(fsnap2 "$FS")
out=$(FLIGHTWAKE_HOME="$FH" node "$CLI" uninstall 2>&1) || fail "45 uninstall 應成功"
echo "$out" | grep -qF "kept $FS — session files are shared by every repo" || fail "45 uninstall 應印 kept 行(got: $out)"
FLIGHTWAKE_HOME="$FH" node "$CLI" init --agents=claude --mod >/dev/null
out=$(FLIGHTWAKE_HOME="$FH" node "$CLI" uninstall --purge 2>&1) || fail "45 uninstall --purge 應成功"
echo "$out" | grep -qF "kept $FS" || fail "45 uninstall --purge 也應印 kept 行(got: $out)"
[ "$(fsnap2 "$FS")" = "$before" ] || fail "45 uninstall / --purge 不得改動 sessions"
# 裝在 $HOME 的 repo(base = 它的 .flightwake 紀錄資料夾):init --mod 不在那裡建 sessions;
# 若那裡已有 sessions(舊版或手建),--purge 繞開它刪 .flightwake 其餘內容,並印 kept 行
HR="$TMP/fl-homerepo"; newrepo "$HR" >/dev/null
env -u FLIGHTWAKE_HOME HOME="$HR" node "$CLI" init --agents=claude --mod >/dev/null
[ -e "$HR/.flightwake/sessions" ] && fail "45 base 是某個 repo 的 .flightwake 時,init --mod 不得在裡面建 sessions"
fseed "$HR/.flightwake/sessions" live1 "({})"
out=$(env -u FLIGHTWAKE_HOME HOME="$HR" node "$CLI" uninstall --purge 2>&1) || fail "45 HOME 是 repo 時 uninstall --purge 應成功(got: $out)"
[ -f "$HR/.flightwake/sessions/live1.json" ] || fail "45 --purge 不得刪掉位在 .flightwake 裡的 sessions(got: $out)"
[ -e "$HR/.flightwake/STATE.md" ] && fail "45 --purge 仍應刪掉 .flightwake 其餘的使用者資料(got: $out)"
echo "$out" | grep -qF "kept $HR/.flightwake/sessions — session files are shared by every repo" || fail "45 --purge 繞開 sessions 時應印 kept 行(got: $out)"
cd "$TMP"
# init --mod:sessions 不存在才建、0700;不帶 --mod 不建;既有資料夾不 chmod;base 是 symlink 不經由它建
modeof() { node -e 'console.log((require("fs").statSync(process.argv[1]).mode & 0o777).toString(8))' "$1"; }
newrepo "$TMP/fl-mk" >/dev/null
FLIGHTWAKE_HOME="$TMP/fleet-mk0" node "$CLI" init --agents=claude >/dev/null
[ -e "$TMP/fleet-mk0/sessions" ] && fail "45 init 不帶 --mod 不建 sessions"
FLIGHTWAKE_HOME="$TMP/fleet-mk1" node "$CLI" init --agents=claude --mod --force >/dev/null
[ "$(modeof "$TMP/fleet-mk1/sessions")" = 700 ] || fail "45 init --mod 應建 0700 的 sessions(got: $(modeof "$TMP/fleet-mk1/sessions" 2>&1))"
mkdir -p "$TMP/fleet-mk2/sessions" && chmod 755 "$TMP/fleet-mk2/sessions"
FLIGHTWAKE_HOME="$TMP/fleet-mk2" node "$CLI" init --agents=claude --mod --force >/dev/null
[ "$(modeof "$TMP/fleet-mk2/sessions")" = 755 ] || fail "45 既有的 sessions 不得被 chmod"
mkdir -p "$TMP/fleet-mk3-real" && ln -s "$TMP/fleet-mk3-real" "$TMP/fleet-mk3"
rc=0; out=$(FLIGHTWAKE_HOME="$TMP/fleet-mk3" node "$CLI" init --agents=claude --mod --force 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "45 sessions 建不了只是提醒,不讓安裝失敗"
[ -e "$TMP/fleet-mk3-real/sessions" ] && fail "45 base 是 symlink 時不得經由它建 sessions"
echo "$out" | grep -qF "$TMP/fleet-mk3/sessions (or the folder holding it) is a symbolic link — not created, and the mod writes nothing through it" || fail "45 base 是 symlink 時的提醒應說明 mod 不會經由它寫入(got: $out)"
echo "$out" | grep -q 'creates it on first use' && fail "45 base 是 symlink 時不得說 mod 會自己建(got: $out)"
# FLIGHTWAKE_HOME 是 repo 內以 .. 開頭的子資料夾(..cache):仍算在 repo 內,不建
rc=0; FLIGHTWAKE_HOME="$PWD/..cache" node "$CLI" init --agents=claude --mod --force >/dev/null 2>&1 || rc=$?
[ "$rc" = 0 ] && [ ! -e "$PWD/..cache/sessions" ] || fail "45 FLIGHTWAKE_HOME=<repo>/..cache 仍在 repo 內,init --mod 不得建 sessions"
# 靜態檢查:$.fs.write 只在 hooks/features/fleet.ts;§8 常數與 FILE_RE 三處一致(mod / CLI / 儀表)
MODF="$SRC/mods/flightwake"
fws=$(cd "$MODF" && grep -rl 'fs\.write' hooks | sort || true)
[ -f "$MODF/hooks/features/fleet.ts" ] || fail "45 mods/flightwake/hooks/features/fleet.ts 不見了"
[ "$fws" = "hooks/features/fleet.ts" ] || fail "45 \$.fs.write 只能出現在 hooks/features/fleet.ts(got: $fws)"
for f in "$MODF/hooks/lib/fleet.ts" "$SRC/bin/fleet.mjs" "$SRC/hooks/statusline.mjs"; do
  [ -f "$f" ] || { fail "45 $f 不見了(§8 常數三處之一)"; continue; }
  for c in 'HEARTBEAT_MS = 30000' 'STALE_FLOOR_MS = 90000' 'STALE_FACTOR = 4' 'BLOCKED_ALERT_MS = 2000' 'CLOCK_SKEW_MS = 60000'; do
    grep -qF "$c" "$f" || fail "45 $f 缺少與其他兩處一致的「$c」"
  done
  grep -qF '/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/' "$f" || fail "45 $f 的 FILE_RE 應與 §2 一致"
done
# register.ts DEFAULTS 與 plugin.json userConfig 的 default 一致(「預設開啟幾項」兩處都靠它)
node -e '
  const fs=require("fs"); const [reg, man]=process.argv.slice(1);
  const m=/export const DEFAULTS = (\{[^}]*\})/.exec(fs.readFileSync(reg,"utf8")); if(!m) process.exit(2);
  const d=new Function("return "+m[1])(); const u=JSON.parse(fs.readFileSync(man,"utf8")).userConfig;
  const want=Object.fromEntries(Object.entries(u).map(([k,v])=>[k,v.default]));
  if (JSON.stringify(Object.entries(d).sort())!==JSON.stringify(Object.entries(want).sort())) { console.log(JSON.stringify(d), JSON.stringify(want)); process.exit(1); }' \
  "$MODF/hooks/register.ts" "$MODF/.claude-plugin/plugin.json" || fail "45 register.ts DEFAULTS 應與 plugin.json userConfig 的 default 一致"
pass "45 fleet CLI 唯讀清單/--json/--prune(不碰別人的 JSON、base 在 repo 裡拒絕)、init --mod 建 0700 sessions、uninstall 保留 sessions、fs.write 與 §8 常數三處一致、DEFAULTS 對 plugin.json"

# 46. 安裝/升級流程:setup 依終端機語系預選語言、附加元件一題清單(取代語意)、已安裝 repo 三選一(升級/升級並加裝/離開)、
#     init 的語言提示指向 update --lang、init/update 結尾一行未安裝的適用附加元件(不提問、不自動加)
# 本節所有 CLI 呼叫的 locale / Orca / 個人設定都由檔頭固定(LC_MESSAGES=C、ORCA_* unset、CLAUDE_CONFIG_DIR 指向空目錄)
NOTICE='Optional add-ons available here but not installed'
no_notice() { echo "$2" | grep -q "$NOTICE" && fail "46 $1 不得印未安裝附加元件的提示(got: $2)"; return 0; }
ncli() { PATH="$NOCL" "$NODE_BIN" "$CLI" "$@"; }   # PATH 沒有 orca / claude:通知內容不受開發機影響
markers() { grep -h 'flightwake:begin' CLAUDE.md CLAUDE.local.md AGENTS.md GEMINI.md 2>/dev/null || true; }

# 46.1 detectLocale:LC_ALL → LC_MESSAGES → LANG 第一個非空值為準(C/POSIX 也算、不往下);三者皆空才看 Intl;LANGUAGE 不看
node --input-type=module -e "
  import { detectLocale } from '$SRC/bin/install.mjs';
  const I = (t) => () => t, X = () => { throw 0; }, N = I(null);
  const rows = [
    [{LANG:'zh_TW.UTF-8'}, I('ja-JP'), 'zh-TW', 'LANG'], [{LANG:'zh_HK.UTF-8'}, N, 'zh-TW', 'LANG'], [{LANG:'zh_MO'}, N, 'zh-TW', 'LANG'],
    [{LANG:'zh_CN.GB2312'}, N, 'zh-CN', 'LANG'], [{LANG:'zh_SG'}, N, 'zh-CN', 'LANG'], [{LANG:'zh'}, N, 'zh-CN', 'LANG'],
    [{LANG:'ja_JP.eucJP'}, N, 'ja', 'LANG'], [{LANG:'en_US.UTF-8'}, N, 'en', 'LANG'], [{LANG:'fr_FR.UTF-8'}, N, 'en', 'LANG'],
    [{LANG:'zh_TW.UTF-8@stroke'}, N, 'zh-TW', 'LANG'], [{LC_ALL:'ja_JP.UTF-8',LANG:'zh_TW.UTF-8'}, N, 'ja', 'LC_ALL'],
    [{LC_ALL:'',LC_MESSAGES:'zh_CN.UTF-8',LANG:'en_US.UTF-8'}, N, 'zh-CN', 'LC_MESSAGES'],
    [{LC_ALL:'C',LANG:'zh_TW.UTF-8'}, I('zh-Hant-TW'), 'en', 'LC_ALL'], [{LANG:'C.UTF-8'}, I('zh-TW'), 'en', 'LANG'], [{LANG:'POSIX'}, N, 'en', 'LANG'],
    [{}, I('zh-Hant-TW'), 'zh-TW', 'Intl'], [{}, I('zh-Hans-HK'), 'zh-CN', 'Intl'], [{}, I('ja-JP'), 'ja', 'Intl'], [{}, I('und'), 'en', 'Intl'],
    [{}, X, 'en', null], [{LANGUAGE:'ja',LANG:'en_US.UTF-8'}, N, 'en', 'LANG'],
  ];
  const bad = rows.map(([env, intl, lang, source]) => [JSON.stringify(env), lang, source, detectLocale(env, intl)])
    .filter(([, lang, source, got]) => got.lang !== lang || got.source !== source);
  if (bad.length) { for (const [e, l, s, g] of bad) console.log(e, 'want', l, s, 'got', JSON.stringify(g)); process.exit(1); }
" || fail "46.1 detectLocale 的優先順序 / 對應表不對"
pass "46.1 detectLocale:POSIX 優先順序(C/POSIX 停止)、Intl 只在三者皆空時、zh 的 script 優先於 region、LANGUAGE 不看(21 列)"

# 46.1b userStatusline(真的函式,不經 setup-drive 的替身):CLAUDE_CONFIG_DIR 優先於 HOME/.claude、儀表本身不算、壞 JSON / 沒檔 = false
US="$TMP/us"; mkdir -p "$US/cfg-mine" "$US/cfg-gauge" "$US/cfg-empty" "$US/cfg-bad" "$US/h/.claude"
echo '{"statusLine":{"type":"command","command":"my-sl"}}' > "$US/cfg-mine/settings.json"
echo '{"statusLine":{"type":"command","command":"node .flightwake/hooks/statusline.mjs"}}' > "$US/cfg-gauge/settings.json"
echo '{"statusLine":' > "$US/cfg-bad/settings.json"
cp "$US/cfg-mine/settings.json" "$US/h/.claude/settings.json"
node --input-type=module -e "
  import { userStatusline } from '$SRC/bin/install.mjs';
  const U = '$US';
  const rows = [
    [{ CLAUDE_CONFIG_DIR: U + '/cfg-mine' }, true], [{ CLAUDE_CONFIG_DIR: U + '/cfg-gauge' }, false],
    [{ HOME: U + '/h' }, true], [{ CLAUDE_CONFIG_DIR: U + '/cfg-empty', HOME: U + '/h' }, false],
    [{ CLAUDE_CONFIG_DIR: U + '/cfg-bad' }, false], [{ CLAUDE_CONFIG_DIR: U + '/missing' }, false],
  ];
  const bad = rows.filter(([env, want]) => userStatusline(env) !== want);
  if (bad.length) { for (const [e, w] of bad) console.log(JSON.stringify(e), 'want', w); process.exit(1); }
" || fail "46.1b userStatusline 的讀取位置 / 判斷不對"
pass "46.1b userStatusline:CLAUDE_CONFIG_DIR 優先於 HOME/.claude、儀表的 statusline.mjs 不算、壞 JSON 與沒檔 = false(6 列)"

# 46.2 setup 的語言題以 locale 預選(只是預選:Enter 沿用、號碼可改);旗標與既有安裝不問語言
newrepo "$TMP/lc-tw" >/dev/null
out=$(node "$DRIVE" --locale='{"LANG":"zh_TW.UTF-8"}' -- "" 2 "" "" "" 2>&1) || fail "46.2 LANG=zh_TW 的 setup 應成功(out: $out)"
echo "$out" | grep -q '^\[2\] $' || fail "46.2 LANG=zh_TW 時語言題預設應為 [2](got: $out)"
echo "$out" | grep -qF 'LANG=zh_TW.UTF-8' && echo "$out" | grep -q '整個團隊共用' || fail "46.2 題下應以繁中說明依據(LANG=zh_TW.UTF-8)與全隊共用(got: $out)"
grep -q 'flightwake:begin v[0-9.]* lang=zh-TW' AGENTS.md || fail "46.2 Enter 沿用預選應裝 zh-TW(got: $(markers))"
echo "$out" | grep -q '  lang=zh-TW · ' || fail "46.2 路徑清單前應重述 lang=zh-TW(got: $out)"
no_notice "setup(新裝)" "$out"
newrepo "$TMP/lc-c" >/dev/null
out=$(node "$DRIVE" --locale='{"LANG":"C"}' -- "" 2 "" "" "" 2>&1) || fail "46.2 LANG=C 的 setup 應成功(out: $out)"
echo "$out" | grep -q '^\[1\] $' || fail "46.2 LANG=C 時語言題預設應為 [1](got: $out)"
echo "$out" | grep -q '預選' && fail "46.2 en 時題下不得多印說明(got: $out)"
grep -q 'flightwake:begin v[0-9.]* lang=en' AGENTS.md || fail "46.2 LANG=C 應裝 en(got: $(markers))"
newrepo "$TMP/lc-intl" >/dev/null
out=$(node "$DRIVE" --intl=zh-Hant-TW -- "" 2 "" "" "" 2>&1) || fail "46.2 Intl=zh-Hant-TW 的 setup 應成功(out: $out)"
echo "$out" | grep -q '^\[2\] $' && echo "$out" | grep -q '系統語系 zh-Hant-TW' || fail "46.2 只有 Intl 時應預選 [2] 並註明系統語系(got: $out)"
newrepo "$TMP/lc-flag" >/dev/null
out=$(node "$DRIVE" --flags='{"lang":"ja"}' --locale='{"LANG":"zh_TW.UTF-8"}' -- 2 "" "" "" 2>&1) || fail "46.2 帶 lang 旗標的 setup 應成功(out: $out)"
echo "$out" | grep -qF 'Language / ' && fail "46.2 給了 lang 旗標就不問語言(got: $out)"
grep -q 'flightwake:begin v[0-9.]* lang=ja' AGENTS.md || fail "46.2 lang 旗標優先於 locale(got: $(markers))"
newrepo "$TMP/lc-exist" >/dev/null; node "$CLI" init >/dev/null
rc=0; out=$(node "$DRIVE" --locale='{"LANG":"ja_JP.UTF-8"}' -- 3 2>&1) || rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -q 'already installed' || fail "46.2 已安裝 + 離開應 exit 0 並說明已安裝(rc=$rc: $out)"
echo "$out" | grep -qF 'Language / ' && fail "46.2 已安裝時不問語言(got: $out)"
grep -q 'flightwake:begin v[0-9.]* lang=en' AGENTS.md || fail "46.2 已安裝的語言不因 locale 改變(got: $(markers))"
pass "46.2 setup 語言題:LANG=zh_TW 預選 [2] 並以繁中說明依據、C → [1] 無說明、Intl 註明系統語系;旗標優先;已安裝不問"

# 46.3 init 不猜語言:只點名偵測到的 locale 與 update --lang=(不是 init --lang)
newrepo "$TMP/lh1" >/dev/null
out=$(LC_MESSAGES=zh_TW.UTF-8 node "$CLI" init 2>&1) || fail "46.3 init 應成功"
echo "$out" | grep -qF 'npx flightwake update --lang=zh-TW' && echo "$out" | grep -q '已安裝英文版' && echo "$out" | grep -qF 'LC_MESSAGES=zh_TW.UTF-8' \
  || fail "46.3 locale 是 zh_TW 時 init 應點名依據並給 update --lang=zh-TW(got: $out)"
grep -q 'flightwake:begin v[0-9.]* lang=en' AGENTS.md || fail "46.3 init 一律裝 en(got: $(markers))"
grep -q '現在在哪' .flightwake/STATE.md && fail "46.3 偵測不得改變寫入的語言(STATE 應是英文模板)"
newrepo "$TMP/lh2" >/dev/null
out=$(node "$CLI" init 2>&1) || fail "46.3 預設 locale 的 init 應成功"
echo "$out" | grep -q 'Other languages' && echo "$out" | grep -qF 'update --lang=zh-TW' || fail "46.3 一般提示應指向 update --lang=(got: $out)"
echo "$out" | grep -q 'Your terminal locale' && fail "46.3 locale 是 C 時不得說終端機語系指向別的語言(got: $out)"
echo "$out" | grep -qF 'init --lang=' && fail "46.3 提示不得再建議 init --lang=(got: $out)"
newrepo "$TMP/lh3" >/dev/null
out=$(node "$CLI" init --lang=en 2>&1) || fail "46.3 init --lang=en 應成功"
echo "$out" | grep -q 'Installed in English' && fail "46.3 明確給了 --lang 不印語言提示(got: $out)"
out=$(node "$CLI" init 2>&1) || fail "46.3 第二次 init 應成功"
echo "$out" | grep -q 'Installed in English' && fail "46.3 已有 marker 時不印語言提示(got: $out)"
newrepo "$TMP/lh4" >/dev/null; echo x > README; git add README; git commit -qm i
out=$(LC_MESSAGES=ja_JP.UTF-8 node "$CLI" init --private 2>&1) || fail "46.3 init --private 應成功"
echo "$out" | grep -qF 'update --lang=ja' || fail "46.3 private + ja locale 應提示 update --lang=ja(got: $out)"
echo "$out" | grep -qF 'init --lang' && fail "46.3 private 時不得建議 init --lang(會丟掉 --private)(got: $out)"
node "$CLI" update --lang=ja >/dev/null || fail "46.3 照提示 update --lang=ja 應成功"
markers | grep -q 'lang=ja' || fail "46.3 update --lang=ja 後 marker 應為 ja(got: $(markers))"
[ -z "$(git --no-optional-locks status --porcelain)" ] || fail "46.3 照提示切換語言後 private 安裝仍不得出現在 git status(got: $(git --no-optional-locks status --porcelain))"
pass "46.3 init:偵測到 zh_TW 只印依據與 update --lang=zh-TW、仍裝 en;C 時一般提示;--lang / 既有 marker 不印;private 照提示切換仍乾淨"

# 46.4 新裝的附加元件清單(claude repo;--orca 預設 0)
cl_repo() { newrepo "$TMP/$1" >/dev/null; echo "# 我的" > CLAUDE.md; }
has_sl() { grep -q statusLine .claude/settings.json 2>/dev/null; }
has_mod() { [ -f $MODREL/hooks/register.ts ]; }
has_roles() { [ -e .claude/skills/fw-roles ]; }
cl_repo ck-def
out=$(node "$DRIVE" -- "" "" "" "" "" 2>&1) || fail "46.4 清單 Enter 的 setup 應成功(out: $out)"
has_sl && has_mod || fail "46.4 Enter 應裝預選的儀表與 mod(got: $out)"
has_roles && fail "46.4 roles 永不預選"
for s in '[*] 1) Bottom gauge in Claude Code' '[*] 2) Claude Code mod —' '[ ] 3) Team roles' 'teammates see it' \
         '→ add-ons: bottom gauge, Claude Code mod' 'add-ons=gauge,mod'; do
  echo "$out" | grep -qF -- "$s" || fail "46.4 清單 Enter:輸出缺「$s」(got: $out)"
done
echo "$out" | grep -qF '] 4) ' && fail "46.4 不在 Orca 裡不得列出附加元件 4)(got: $out)"
no_notice "setup(清單 Enter)" "$out"
cl_repo ck-0
out=$(node "$DRIVE" -- "" "" 0 "" "" 2>&1) || fail "46.4 清單 0 的 setup 應成功(out: $out)"
has_sl || has_mod || has_roles && fail "46.4 清單 0 只裝核心"
[ -f .flightwake/STATE.md ] && echo "$out" | grep -qF '→ no add-ons (the core only)' || fail "46.4 清單 0 應裝核心並說明(got: $out)"
cl_repo ck-3
node "$DRIVE" -- "" "" 3 "" "" >/dev/null || fail "46.4 清單 3 的 setup 應成功"
has_roles && ! has_sl && ! has_mod || fail "46.4 清單 3 = 只有 roles(取代語意,不含預選的儀表與 mod)"
cl_repo ck-names
node "$DRIVE" -- "" "" "mod roles" "" "" >/dev/null || fail "46.4 清單以名稱作答應成功"
has_mod && has_roles && ! has_sl || fail "46.4 清單「mod roles」= mod + roles、沒有儀表"
cl_repo ck-comma
node "$DRIVE" -- "" "" "1,3" "" "" >/dev/null || fail "46.4 清單以逗號作答應成功"
has_sl && has_roles && ! has_mod || fail "46.4 清單「1,3」= 儀表 + roles、沒有 mod"
cl_repo ck-bad5
out=$(node "$DRIVE" -- "" "" 5 2 "" "" 2>&1) || fail "46.4 清單答 5 後重答應成功(out: $out)"
echo "$out" | grep -qF 'Not an option: 5' && has_mod && ! has_sl && ! has_roles || fail "46.4 清單答 5 應指出並重問,重答 2 = 只有 mod(got: $out)"
cl_repo ck-bady
out=$(node "$DRIVE" -- "" "" y 0 "" "" 2>&1) || fail "46.4 清單答 y 後重答應成功(out: $out)"
echo "$out" | grep -qF 'Not an option: y' || fail "46.4 清單答 y 應指出不是選項(got: $out)"
cl_repo ck-bad01
out=$(node "$DRIVE" -- "" "" "0 1" 0 "" "" 2>&1) || fail "46.4 清單答「0 1」後重答應成功(out: $out)"
echo "$out" | grep -qF 'Not an option: 0' || fail "46.4 0 與其他編號混用應指出(got: $out)"
has_sl || has_mod && fail "46.4 清單「0 1」被拒、重答 0 → 只裝核心"
newrepo "$TMP/ck-codex" >/dev/null
out=$(node "$DRIVE" -- "" 2 "" "" "" 2>&1) || fail "46.4 只選 codex 的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[ ] 3) Team roles' && echo "$out" | grep -qF 'Enter = none' || fail "46.4 只選 codex:只列 roles(不預選),Enter = none(got: $out)"
echo "$out" | grep -q '1) Bottom gauge' && fail "46.4 只選 codex 不得列出儀表(got: $out)"
newrepo "$TMP/ck-orca" >/dev/null
out=$(node "$DRIVE" --orca=1 -- "" 2 "" "" "" 2>&1) || fail "46.4 在 Orca 裡的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[*] 4) Orca collaboration (' && grep -q 'flightwake-orca:begin' AGENTS.md || fail "46.4 在 Orca 裡 Orca 應預選、Enter 寫入區塊(got: $out)"
newrepo "$TMP/ck-orcapath" >/dev/null
out=$(node "$DRIVE" --orca=path -- "" 2 "" "" "" 2>&1) || fail "46.4 PATH 上只有 orca 的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[ ] 4) Orca collaboration (' && echo "$out" | grep -q 'not running inside Orca' || fail "46.4 PATH 上只有 orca:列出、說明、不預選(got: $out)"
grep -q 'flightwake-orca' AGENTS.md && fail "46.4 PATH 上只有 orca,Enter 不得寫 Orca 區塊"
cl_repo ck-flagmod
out=$(node "$DRIVE" --flags='{"mod":true}' -- "" "" 0 "" "" 2>&1) || fail "46.4 帶 --mod 旗標的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[+] 2) Claude Code mod (--mod)' && has_mod && ! has_sl || fail "46.4 --mod 旗標鎖定 mod 列;0 只拿掉其他 → mod、沒有儀表(got: $out)"
cl_repo ck-foreign; mkdir -p .claude && echo '{"statusLine":{"type":"command","command":"my-sl"}}' > .claude/settings.json
out=$(node "$DRIVE" -- "" "" "" "" "" 2>&1) || fail "46.4 repo 已有別的 statusLine 的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[-] 1) Bottom gauge' && echo "$out" | grep -q 'not available' || fail "46.4 repo 已有別的 statusLine:儀表列標 - 並說明不可用(got: $out)"
[ "$(node -e 'console.log(require("./.claude/settings.json").statusLine.command)')" = my-sl ] || fail "46.4 repo 原有的 statusLine 不得被取代"
has_mod || fail "46.4 儀表不可用時 Enter 仍裝預選的 mod"
cl_repo ck-foreign-pick; mkdir -p .claude && echo '{"statusLine":{"type":"command","command":"my-sl"}}' > .claude/settings.json
out=$(node "$DRIVE" -- "" "" 1 "" "" "" 2>&1) || fail "46.4 選了不可用的儀表後重答應成功(out: $out)"
echo "$out" | grep -qF 'Not available here: 1) bottom gauge' || fail "46.4 選不可用的列應說明並重問(got: $out)"
[ "$(echo "$out" | grep -c 'Enter = the \* ones')" = 2 ] || fail "46.4 不可用時應重問附加元件題一次(got: $out)"
[ "$(node -e 'console.log(require("./.claude/settings.json").statusLine.command)')" = my-sl ] && has_mod || fail "46.4 不可用重問後 Enter = mod、原 statusLine 不動"
cl_repo ck-foreign-flag; mkdir -p .claude && echo '{"statusLine":{"type":"command","command":"my-sl"}}' > .claude/settings.json
out=$(node "$DRIVE" --flags='{"statusline":true}' -- "" "" "" "" "" 2>&1) || fail "46.4 別的 statusLine + --statusline 的 setup 應成功(out: $out)"
echo "$out" | grep -qF 'already has another statusLine — not overwriting' || fail "46.4 --statusline 遇到別的 statusLine 不得默默丟掉,應印 install 的原因(got: $out)"
[ "$(node -e 'console.log(require("./.claude/settings.json").statusLine.command)')" = my-sl ] || fail "46.4 --statusline 也不得取代 repo 原有的 statusLine"
newrepo "$TMP/ck-codex-sl" >/dev/null
out=$(node "$DRIVE" --flags='{"statusline":true,"agents":["codex"]}' -- "" "" "" "" 2>&1) || fail "46.4 codex + --statusline 的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[+] 1) bottom gauge (--statusline)' && echo "$out" | grep -qF 'add-ons=gauge' && has_sl || fail "46.4 codex + --statusline:旗標列鎖定並安裝儀表(同 init --statusline --agents=codex)(got: $out)"
newrepo "$TMP/ck-codex-mod" >/dev/null
out=$(node "$DRIVE" --flags='{"mod":true,"agents":["codex"]}' -- "" "" "" "" 2>&1) || fail "46.4 codex + --mod 的 setup 應成功(out: $out)"
echo "$out" | grep -qF 'skip flightwake-mod' && ! has_mod || fail "46.4 codex + --mod:install 應說明 mod 只給 Claude Code 並略過(got: $out)"
echo "$out" | grep -qF 'add-ons=-' || fail "46.4 codex + --mod:摘要不得列出不會安裝的 mod(got: $out)"
cl_repo ck-usersl
out=$(node "$DRIVE" --user-statusline=1 -- "" "" "" "" "" 2>&1) || fail "46.4 使用者已有 status line 的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[ ] 1) Bottom gauge' && echo "$out" | grep -q 'your own status line' || fail "46.4 使用者已有 status line:儀表不預選並說明(got: $out)"
! has_sl && has_mod || fail "46.4 使用者已有 status line:Enter = 只有 mod"
cl_repo ck-oldcl
out=$(node "$DRIVE" --claude=2.1.100 -- "" "" "" "" "" 2>&1) || fail "46.4 舊版 Claude Code 的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[ ] 2) Claude Code mod —' && echo "$out" | grep -qF '2.1.100' || fail "46.4 Claude Code 太舊:mod 不預選並說明版本(got: $out)"
! has_mod && has_sl || fail "46.4 Claude Code 太舊:Enter = 只有儀表"
cl_repo ck-newcl
out=$(node "$DRIVE" --claude=2.1.300 -- "" "" "" "" "" 2>&1) || fail "46.4 新版 Claude Code 的 setup 應成功(out: $out)"
echo "$out" | grep -qF '[*] 2) Claude Code mod —' || fail "46.4 Claude Code 夠新:mod 預選(got: $out)"
cl_repo ck-priv; git add CLAUDE.md; git commit -qm base
out=$(node "$DRIVE" --flags='{"private":true}' -- "" "" "" "" "" 2>&1) || fail "46.4 private 的 setup 應成功(out: $out)"
echo "$out" | grep -q 'teammates see it' && fail "46.4 private 時不得說儀表寫進會 commit 的 settings.json(got: $out)"
grep -q statusLine .claude/settings.local.json && [ ! -e .claude/settings.json ] || fail "46.4 private 的儀表應寫進 settings.local.json"
[ -z "$(git --no-optional-locks status --porcelain)" ] || fail "46.4 private 安裝後 git status 應乾淨(got: $(git --no-optional-locks status --porcelain))"
cl_repo ck-sw
summary_vs_writes "新裝:清單預設(gauge+mod)" -- "" "" "" "" ""
has_sl && has_mod || fail "46.4 測試前提:清單預設應裝儀表與 mod"
pass "46.4 附加元件清單:預選(儀表+mod,roles 不)、0 / 編號 / 名稱 / 逗號取代語意、錯誤重問、codex / Orca(env 預選、PATH 不預選)、--mod 鎖定、別的 statusLine 不可選、個人 status line 與舊版 Claude 不預選、private、摘要 == 寫入"

# 46.5 已安裝 repo:升級並加裝(只加不減、使用者資料不動)、全裝好 → 原流程、codex、旗標預設選 2、private、sessions 0700
newrepo "$TMP/ad1" >/dev/null; echo "# 我的" > CLAUDE.md; node "$CLI" init --agents=claude >/dev/null
for f in STATE DECISIONS TRAPS; do echo "SENTINEL-$f" >> .flightwake/$f.md; done
echo MINE > .claude/skills/fw-record/MINE.md
jedit .claude/settings.json 'j.mine=1'
sums() { shasum .flightwake/STATE.md .flightwake/DECISIONS.md .flightwake/TRAPS.md; }
before=$(sums)
sed -i.bak 's/flightwake:begin v[0-9.]*/flightwake:begin v0.0.1/' CLAUDE.md && rm -f CLAUDE.md.bak
rc=0; out=$(node "$DRIVE" -- 2 "" "" 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "46.5 升級並加裝應 exit 0(rc=$rc: $out)"
echo "$out" | grep -qF 'Upgrade and add add-ons (not installed yet: bottom gauge, Claude Code mod, team roles)' || fail "46.5 選項 2 應列出尚未安裝的附加元件(got: $out)"
has_mod && has_sl || fail "46.5 加裝預選的儀表與 mod"
has_roles && fail "46.5 roles 未選不得安裝"
[ "$before" = "$(sums)" ] || fail "46.5 加裝不得改 STATE / DECISIONS / TRAPS"
[ "$(cat .claude/skills/fw-record/MINE.md 2>/dev/null)" = MINE ] || fail "46.5 skill 資料夾裡的自加檔應保留"
[ "$(node -e 'console.log(require("./.claude/settings.json").mine)')" = 1 ] || fail "46.5 settings.json 裡使用者的 key 應保留"
grep -q "flightwake:begin v$FWV lang=en" CLAUDE.md || fail "46.5 加裝也一併升級到 v$FWV、語言不變(got: $(markers))"
for s in 'quit it and start Claude Code again' '/fw-mod' 'flightwake-mod@skills-dir' 'added: bottom gauge, Claude Code mod' 'commit the new files'; do
  echo "$out" | grep -qF -- "$s" || fail "46.5 加裝結尾缺「$s」(got: $out)"
done
no_notice "setup(加裝)" "$out"
node "$CLI" doctor >/dev/null 2>&1 || fail "46.5 加裝後 doctor 應 0"
rc=0; out=$(node "$DRIVE" -- 2 3 "" 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "46.5 第二次加裝(roles)應成功(rc=$rc: $out)"
for s in '(not installed yet: team roles)' '[✓] 1) bottom gauge (installed)' '[✓] 2) Claude Code mod (installed)' '[ ] 3) Team roles' 'Roles: ask your agent'; do
  echo "$out" | grep -qF -- "$s" || fail "46.5 第二次加裝缺「$s」(got: $out)"
done
has_roles || fail "46.5 第二次加裝選 3 應裝 fw-roles"
no_notice "setup(加裝 roles)" "$out"
rc=0; out=$(node "$DRIVE" -- "" 2>&1) || rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -qF 'All add-ons that apply here are installed.' || fail "46.5 全部裝好時應說明並走原本的升級流程(rc=$rc: $out)"
echo "$out" | grep -q 'What would you like to do?' && fail "46.5 全部裝好時不得出三選一(got: $out)"
no_notice "setup(全裝好)" "$out"
newrepo "$TMP/ad-codex" >/dev/null; node "$CLI" init >/dev/null
rc=0; out=$(node "$DRIVE" -- 2 0 "" 2>&1) || rc=$?
[ "$rc" = 0 ] && echo "$out" | grep -qF '→ no add-ons; upgrade only' || fail "46.5 codex:選 2 後答 0 = 只升級(rc=$rc: $out)"
[ -e .agents/skills/fw-roles ] || [ -e .claude/skills/fw-roles ] && fail "46.5 codex:答 0 不得裝 fw-roles"
newrepo "$TMP/ad-codex-sl" >/dev/null; node "$CLI" init >/dev/null
out=$(node "$DRIVE" --flags='{"statusline":true}' -- 2 "" "" 2>&1) || fail "46.5 codex + --statusline 選 2 應成功(out: $out)"
echo "$out" | grep -qF '(not installed yet: bottom gauge, team roles)' && has_sl || fail "46.5 codex + --statusline:選 2 也應裝儀表(與選 1 一致)(got: $out)"
newrepo "$TMP/ad-codex-sl1" >/dev/null; node "$CLI" init >/dev/null
node "$DRIVE" --flags='{"statusline":true}' -- 1 "" >/dev/null 2>&1 && has_sl || fail "46.5 codex + --statusline:選 1 應裝儀表"
newrepo "$TMP/ad-orcaflag" >/dev/null; echo "# 我的" > CLAUDE.md; node "$CLI" init --agents=claude --statusline --mod >/dev/null && node "$CLI" roles install >/dev/null
out=$(node "$DRIVE" --flags='{"orca":true}' -- "" "" 2>&1) || fail "46.5 全裝好 + --orca(不在 Orca 裡)應成功(out: $out)"
echo "$out" | grep -qF 'All add-ons that apply here are installed.' && fail "46.5 --orca 還有東西要加時不得說都已安裝(got: $out)"
echo "$out" | grep -qF '(not installed yet: Orca collaboration)' && echo "$out" | grep -qF 'added: Orca collaboration.' && grep -q 'flightwake-orca:begin' CLAUDE.md || fail "46.5 --orca:三選一列出 Orca、結尾點名加裝的 Orca(got: $out)"
newrepo "$TMP/ad-flag" >/dev/null; echo "# 我的" > CLAUDE.md; node "$CLI" init --agents=claude >/dev/null
out=$(node "$DRIVE" --flags='{"mod":true}' -- "" "" "" 2>&1) || fail "46.5 帶 --mod 旗標的已安裝 setup 應成功(out: $out)"
echo "$out" | grep -q '^\[2\] $' && echo "$out" | grep -qF '[+] 2) Claude Code mod (--mod)' && has_mod || fail "46.5 旗標的附加元件未安裝時預設選 2,mod 列鎖定並安裝(got: $out)"
newrepo "$TMP/ad-sw" >/dev/null; echo "# 我的" > CLAUDE.md; node "$CLI" init --agents=claude >/dev/null
summary_vs_writes "已安裝 → 加裝 mod+roles" -- 2 "2 3" ""
has_mod && has_roles && ! has_sl || fail "46.5 測試前提:應加裝 mod 與 roles、沒有儀表"
newrepo "$TMP/ad-priv" >/dev/null; echo x > README; git add README; git commit -qm i
node "$CLI" init --private --agents=claude >/dev/null
rc=0; out=$(node "$DRIVE" -- 2 2 "" 2>&1) || rc=$?
[ "$rc" = 0 ] && has_mod || fail "46.5 private:加裝 mod 應成功(rc=$rc: $out)"
[ -z "$(git --no-optional-locks status --porcelain)" ] || fail "46.5 private:加裝後 git status 應乾淨(got: $(git --no-optional-locks status --porcelain))"
grep -q 'flightwake-mod' .git/info/exclude || fail "46.5 private:mod 資料夾應進排除清單"
echo "$out" | grep -q 'commit the new files' && fail "46.5 private 不得叫人 commit 新檔(got: $out)"
[ -e .claude/settings.json ] && fail "46.5 private 加裝不得建共用的 .claude/settings.json"
newrepo "$TMP/ad-fleet" >/dev/null; echo "# 我的" > CLAUDE.md; node "$CLI" init --agents=claude >/dev/null
out=$(FLIGHTWAKE_HOME="$TMP/fleet-sa" node "$DRIVE" -- 2 2 "" 2>&1) || fail "46.5 setup 加裝 mod 應成功(out: $out)"
[ "$(modeof "$TMP/fleet-sa/sessions")" = 700 ] || fail "46.5 setup 加裝 mod 也應建 0700 的 sessions(got: $(modeof "$TMP/fleet-sa/sessions" 2>&1))"
echo "$out" | sed -n '/These paths will be written:/,/Proceed?/p' | grep -qxF "  $TMP/fleet-sa/sessions/" || fail "46.5 確認前的路徑清單應列出 repo 外要建的 sessions 資料夾(got: $out)"
newrepo "$TMP/ad-flag1" >/dev/null; echo "# 我的" > CLAUDE.md; node "$CLI" init --agents=claude >/dev/null
rc=0; out=$(node "$DRIVE" --flags='{"mod":true}' -- 1 "" 2>&1) || rc=$?
[ "$rc" = 0 ] && has_mod || fail "46.5 --mod + 選 1 應加裝 mod(rc=$rc: $out)"
for s in '(same as `npx flightwake update --mod`)' 'added: Claude Code mod.'; do echo "$out" | grep -qF -- "$s" || fail "46.5 --mod + 選 1 缺「$s」(got: $out)"; done
echo "$out" | grep -qF 'keeping these options' && fail "46.5 --mod + 選 1 的標籤不得說沿用原選項(got: $out)"
newrepo "$TMP/ad-lang" >/dev/null; echo "# 我的" > CLAUDE.md; node "$CLI" init --agents=claude >/dev/null
out=$(node "$DRIVE" --flags='{"lang":"ja"}' -- 1 n 2>&1) || true
for s in 'lang:en → ja(--lang で切り替え)' '`npx flightwake update --lang=ja` と同じ' 'lang=ja · agents=claude'; do echo "$out" | grep -qF -- "$s" || fail "46.5 --lang=ja 的已安裝 setup 缺「$s」(got: $out)"; done
echo "$out" | grep -qF -e 'ここでは変えません' -e 'このオプションのまま' && fail "46.5 --lang 有切換時不得說語言不變 / 沿用選項(got: $out)"
grep -q "flightwake:begin v$FWV lang=en" CLAUDE.md || fail "46.5 答 n 不得切換語言(got: $(markers))"
newrepo "$TMP/ad-orcanm" >/dev/null; echo "# 共用" > CLAUDE.md; echo "# 本地" > CLAUDE.local.md; git add -A; git commit -qm base
node "$CLI" init --private --agents=claude >/dev/null
[ -z "$(markers)" ] || fail "46.5 測試前提:沒有 marker(got: $(markers))"
rc=0; out=$(node "$DRIVE" --flags='{"orca":true}' -- 2 0 "" 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "46.5 無 marker 的 private + --orca 應成功(rc=$rc: $out)"
echo "$out" | grep -qF -e '[+] 4) Orca' -e 'added: Orca' -e 'orca ·' && fail "46.5 無 marker 時 --orca 裝不上,不得列出、不得進摘要、不得說加裝(got: $out)"
echo "$out" | grep -q '^\[1\] ' || fail "46.5 無 marker 時 --orca 不得把預設改成選 2(got: $out)"
grep -q orca CLAUDE.md CLAUDE.local.md && fail "46.5 無 marker 時不得寫 Orca 區塊"
pass "46.5 已安裝:升級並加裝(只加、使用者資料與自加檔/設定 key 不動、版本升級、mod 重開說明、commit 提示)、第二次只剩 roles、全裝好走原流程、codex 答 0、旗標預設選 2、摘要 == 寫入、private 乾淨、sessions 0700 且確認前列出;選 1 + --mod 標籤與結尾點名;--lang 切換照實說;無 marker 的 --orca 不列不說"

# 46.6 init/update 結尾一行未安裝的適用附加元件:建議 setup 或 update --flag / roles install(不建議 init 旗標);不提問、不自動加
newrepo "$TMP/nt1" >/dev/null; echo "# 我的" > CLAUDE.md
out=$(ncli init 2>&1) || fail "46.6 init 應成功"
[ "$(echo "$out" | grep -c "$NOTICE")" = 1 ] || fail "46.6 init 結尾應恰好一行附加元件提示(got: $out)"
echo "$out" | grep "$NOTICE" | grep -qF 'not installed: bottom gauge, Claude Code mod, team roles.' || fail "46.6 提示應依序點名儀表、mod、roles(got: $out)"
echo "$out" | grep -qF 'npx flightwake update --statusline --mod · npx flightwake roles install' && echo "$out" | grep -qF 'npx flightwake setup' || fail "46.6 提示應給 setup 與 update --statusline --mod / roles install(got: $out)"
echo "$out" | grep -q 'Orca' && fail "46.6 不在 Orca 裡不得提 Orca(got: $out)"
echo "$out" | grep -q 'Bottom gauge not installed' && fail "46.6 舊的「儀表未安裝」提示應已刪除(got: $out)"
[ -e $MODREL ] && fail "46.6 提示不得自動安裝 mod"
grep -q statusLine .claude/settings.json && fail "46.6 提示不得自動安裝儀表"
out=$(ncli update 2>&1) || fail "46.6 update 應成功"
[ "$(echo "$out" | grep -c "$NOTICE")" = 1 ] || fail "46.6 update 結尾應恰好一行附加元件提示(got: $out)"
out=$(ORCA_APP_VERSION=1 ncli update 2>&1) || fail "46.6 在 Orca 裡的 update 應成功"
echo "$out" | grep "$NOTICE" | grep -q 'Orca collaboration' && echo "$out" | grep -qF -- 'update --statusline --mod --orca' || fail "46.6 在 Orca 裡提示應含 Orca 與 --orca(got: $out)"
grep -q 'flightwake-orca' CLAUDE.md && fail "46.6 update 不得自動加 Orca 區塊"
newrepo "$TMP/nt-codex" >/dev/null; ncli init >/dev/null
out=$(ncli update 2>&1) || fail "46.6 codex 的 update 應成功"
echo "$out" | grep "$NOTICE" | grep -qF 'not installed: team roles.' && echo "$out" | grep -qF 'or directly: npx flightwake roles install' || fail "46.6 只有 codex:提示只點名 roles,指令只有 roles install(got: $out)"
echo "$out" | grep -qF -- '--mod' && fail "46.6 只有 codex 不得建議 --mod(got: $out)"
newrepo "$TMP/nt-foreign" >/dev/null; mkdir -p .claude && echo '{"statusLine":{"type":"command","command":"my-sl"}}' > .claude/settings.json
out=$(ncli init --agents=claude 2>&1) || fail "46.6 repo 已有別的 statusLine 的 init 應成功"
echo "$out" | grep "$NOTICE" | grep -q 'bottom gauge' && fail "46.6 repo 已有別的 statusLine 時提示不得點名儀表(got: $out)"
echo "$out" | grep -q "$NOTICE" || fail "46.6 repo 已有別的 statusLine 時仍應提示 mod / roles(got: $out)"
for l in en zh-TW zh-CN ja; do
  case $l in en) k='available here but not installed';; zh-TW) k='尚未安裝的選配附加元件';; zh-CN) k='尚未安装的选配附加组件';; ja) k='未インストールのオプション';; esac
  newrepo "$TMP/nt-$l" >/dev/null
  out=$(ncli init --lang=$l --agents=claude 2>&1) || fail "46.6 $l init 應成功"
  echo "$out" | grep -qF "$k" || fail "46.6 $l 的提示應有「$k」(got: $out)"
  echo "$out" | grep -q 'undefined' && fail "46.6 $l 的輸出不得有 undefined(got: $out)"
done
newrepo "$TMP/nt-all" >/dev/null; echo "# 我的" > CLAUDE.md
ncli init --agents=claude --statusline --mod >/dev/null && ncli roles install >/dev/null || fail "46.6 全裝的前提應成功"
out=$(ncli update 2>&1) || fail "46.6 全裝後 update 應成功"
[ "$(echo "$out" | grep -c "$NOTICE")" = 0 ] || fail "46.6 適用的附加元件都裝了就不印提示(got: $out)"
newrepo "$TMP/nt-quiet" >/dev/null; echo "# 我的" > CLAUDE.md; ncli init --agents=claude >/dev/null
out=$(ncli doctor 2>&1); no_notice "doctor" "$out"
out=$(echo '{}' | PATH="$NOCL" "$NODE_BIN" .flightwake/hooks/statusline.mjs 2>&1); no_notice "儀表" "$out"
out=$(PATH="$NOCL" "$NODE_BIN" .flightwake/hooks/state-check.mjs </dev/null 2>&1); no_notice "state-check hook" "$out"
newrepo "$TMP/nt-refused" >/dev/null; ncli init >/dev/null
rm .flightwake/hooks/state-check.mjs && ln -s ../STATE.md .flightwake/hooks/state-check.mjs
rc=0; out=$(ncli update 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "46.6 拒寫的 update 應 exit 1(rc=$rc: $out)"
no_notice "拒寫的 update" "$out"
newrepo "$TMP/nt-markerless" >/dev/null; echo "# 共用" > CLAUDE.md; echo "# 本地" > CLAUDE.local.md; git add -A; git commit -qm base
ncli init --private --agents=claude >/dev/null || fail "46.6 無 marker 的 private 安裝前提應成功"
[ -z "$(markers)" ] || fail "46.6 測試前提:兩個 Claude 指令檔都受追蹤 → 沒有 marker(got: $(markers))"
out=$(ORCA_APP_VERSION=1 ncli update 2>&1) || fail "46.6 無 marker 的 private update 應成功(got: $out)"
echo "$out" | grep "$NOTICE" | grep -qF 'not installed: bottom gauge, Claude Code mod, team roles' || fail "46.6 無 marker 的 private update 仍應提示其他附加元件(got: $out)"
echo "$out" | grep "$NOTICE" | grep -q 'Orca' && fail "46.6 沒有 marker 可掛 Orca 區塊時不得建議 Orca(got: $out)"
FAKEORCA="$TMP/fake-orca-bin"; mkdir -p "$FAKEORCA"; printf '#!/bin/sh\nexit 0\n' > "$FAKEORCA/orca"; chmod +x "$FAKEORCA/orca"
newrepo "$TMP/nt-orcapath" >/dev/null; echo "# 我的" > CLAUDE.md
out=$(PATH="$NOCL:$FAKEORCA" "$NODE_BIN" "$CLI" init --agents=claude 2>&1) || fail "46.6 PATH 上只有 orca 的 init 應成功"
echo "$out" | grep "$NOTICE" | grep -q 'Orca' && fail "46.6 PATH 上只有 orca(可能是 GNOME 螢幕閱讀器)時 init 提示不得提 Orca(got: $out)"
out=$(PATH="$NOCL:$FAKEORCA" "$NODE_BIN" "$CLI" update 2>&1) || fail "46.6 PATH 上只有 orca 的 update 應成功"
echo "$out" | grep -q "$NOTICE" && ! echo "$out" | grep -qF -- '--orca' || fail "46.6 PATH 上只有 orca 時 update 提示不得提 Orca / --orca(got: $out)"
ncli update --statusline --mod >/dev/null && ncli roles install >/dev/null || fail "46.6 PATH-only orca 全裝前提應成功"
out=$(node "$DRIVE" --orca=path -- "" 2>&1) || fail "46.6 PATH 上只有 orca、其他全裝好的 setup 應成功(out: $out)"
echo "$out" | grep -qF 'All add-ons that apply here are installed.' || fail "46.6 PATH 上只有 orca 不得逼出三選一(got: $out)"
newrepo "$TMP/nt-privhint" >/dev/null; echo x > README; git add README; git commit -qm i
ncli init --private --agents=claude >/dev/null || fail "46.6 private 前提應成功"
rc=0; out=$(ncli setup </dev/null 2>&1) || rc=$?
[ "$rc" = 1 ] && echo "$out" | grep -qF 'npx flightwake update' || fail "46.6 已安裝時非 TTY 的 setup 應指向 update(rc=$rc: $out)"
echo "$out" | grep -qF 'init --' && fail "46.6 private 安裝上非 TTY 的 setup 不得建議 init 旗標(會丟掉 --private)(got: $out)"
echo "# 手改" >> .claude/skills/fw-record/SKILL.md
out=$(ncli update 2>&1) || fail "46.6 private 有手改框架檔的 update 應成功"
echo "$out" | grep -qF 'npx flightwake update --lang=<lang>' || fail "46.6 覆蓋手改的警告應建議 update --lang=(got: $out)"
echo "$out" | grep -qF 'init --lang=' && fail "46.6 private 上任何輸出都不得建議 init --lang=(got: $out)"
echo "$out" | grep -q 'init --agents=.* --force' && fail "46.6 private 上任何輸出都不得建議 init --agents=… --force(got: $out)"
[ -z "$(git --no-optional-locks status --porcelain)" ] || fail "46.6 private 的 update 後 git status 應乾淨(got: $(git --no-optional-locks status --porcelain))"
pass "46.6 init/update 結尾一行未安裝提示(點名、update --flag / roles install / setup、四語、Orca 只在 Orca 裡、別的 statusLine 不提儀表、全裝好不印);doctor / 儀表 / hook / setup / 拒寫不印;無 marker 不提 Orca"

# 46.7 update 的加裝/切換路徑:update --mod 印重開說明並建 0700 sessions;bare update 不加;private 下 --statusline / --lang 仍乾淨
newrepo "$TMP/up1" >/dev/null; echo "# 我的" > CLAUDE.md; ncli init --agents=claude >/dev/null
out=$(FLIGHTWAKE_HOME="$TMP/fleet-u1" ncli update --mod 2>&1) || fail "46.7 update --mod 應成功"
has_mod || fail "46.7 update --mod 應加裝 mod"
for s in 'quit it and start Claude Code again' '/fw-mod' 'trust'; do echo "$out" | grep -qF -- "$s" || fail "46.7 update --mod 應印「$s」(got: $out)"; done
[ "$(modeof "$TMP/fleet-u1/sessions")" = 700 ] || fail "46.7 update --mod 應建 0700 的 sessions(got: $(modeof "$TMP/fleet-u1/sessions" 2>&1))"
echo "$out" | grep "$NOTICE" | grep -q 'Claude Code mod' && fail "46.7 mod 裝好後提示不得再點名 mod(got: $out)"
newrepo "$TMP/up2" >/dev/null; echo "# 我的" > CLAUDE.md; ncli init --agents=claude >/dev/null
FLIGHTWAKE_HOME="$TMP/fleet-u2" ncli update >/dev/null || fail "46.7 bare update 應成功"
[ -e "$TMP/fleet-u2/sessions" ] && fail "46.7 bare update 不加 mod,也不建 sessions"
has_mod && fail "46.7 bare update 不得加 mod"
newrepo "$TMP/up3" >/dev/null; echo x > README; git add README; git commit -qm i
ncli init --private --agents=claude >/dev/null && ncli update --statusline >/dev/null || fail "46.7 private 的 update --statusline 應成功"
grep -q statusLine .claude/settings.local.json && [ ! -e .claude/settings.json ] || fail "46.7 private 的 update --statusline 應寫進 settings.local.json"
[ -z "$(git --no-optional-locks status --porcelain)" ] || fail "46.7 private 的 update --statusline 後 git status 應乾淨(got: $(git --no-optional-locks status --porcelain))"
newrepo "$TMP/up4" >/dev/null; echo x > README; git add README; git commit -qm i
ncli init --private --agents=claude --statusline --mod >/dev/null || fail "46.7 private + 儀表 + mod 的 init 應成功"
st=$(shasum < .flightwake/STATE.md)
ncli update --lang=zh-TW >/dev/null || fail "46.7 private 的 update --lang=zh-TW 應成功"
markers | grep -q 'lang=zh-TW' || fail "46.7 update --lang=zh-TW 後 marker 應為 zh-TW(got: $(markers))"
grep -q statusLine .claude/settings.local.json && has_mod || fail "46.7 update --lang 應保留儀表與 mod"
[ "$st" = "$(shasum < .flightwake/STATE.md)" ] || fail "46.7 update --lang 不得改 STATE"
[ -z "$(git --no-optional-locks status --porcelain)" ] || fail "46.7 private 的 update --lang 後 git status 應乾淨(got: $(git --no-optional-locks status --porcelain))"
newrepo "$TMP/up5" >/dev/null; echo "# 共用" > CLAUDE.md; echo "# 本地" > CLAUDE.local.md; git add -A; git commit -qm base
ncli init --private --agents=claude --lang=ja >/dev/null || fail "46.7 無 marker 的 private ja 前提應成功"
[ -z "$(markers)" ] || fail "46.7 測試前提:沒有 marker(got: $(markers))"
grep -q '^# flightwake:begin v[0-9.]* lang=ja' .git/info/exclude || fail "46.7 無 marker 時 exclude 標頭應記 lang=ja(got: $(grep 'flightwake:begin' .git/info/exclude))"
out=$(ncli update --statusline 2>&1) || fail "46.7 無 marker 的 private ja 的 update --statusline 應成功"
grep -q '締め' .claude/skills/fw-record/SKILL.md || fail "46.7 照提示 update --statusline 不得把 ja 安裝換成英文(got: $(grep -m1 description .claude/skills/fw-record/SKILL.md))"
echo "$out" | grep -q 'v[0-9.]* に更新しました' || fail "46.7 無 marker 的 ja 安裝,update 輸出應為 ja(got: $out)"
ncli update >/dev/null && grep -q '締め' .claude/skills/fw-record/SKILL.md || fail "46.7 再一次 bare update 仍應是 ja"
[ -z "$(git --no-optional-locks status --porcelain)" ] || fail "46.7 無 marker private 的 update 後 git status 應乾淨(got: $(git --no-optional-locks status --porcelain))"
newrepo "$TMP/up6" >/dev/null; echo "# 共用" > CLAUDE.md; echo "# 本地" > CLAUDE.local.md; git add -A; git commit -qm base
ncli init --private --agents=claude --lang=zh-TW >/dev/null || fail "46.7 無 marker 的 private zh-TW 前提應成功"
python3 -c "import sys; p=sys.argv[1]; s=open(p, encoding='utf-8').read(); open(p, 'w', encoding='utf-8').write(s.replace(' lang=zh-TW', ''))" .git/info/exclude
grep -q 'lang=' .git/info/exclude && fail "46.7 測試前提:exclude 標頭應像 0.15.0 一樣沒有 lang="
st=$(shasum < .flightwake/STATE.md)
ncli update >/dev/null || fail "46.7 舊標頭(無 lang=)的無 marker private 的 update 應成功"
grep -q '^# flightwake:begin v[0-9.]* lang=zh-TW' .git/info/exclude || fail "46.7 舊標頭時應從 state-check.mjs 取回 zh-TW(got: $(grep 'flightwake:begin' .git/info/exclude))"
grep -q "^const LANG = 'zh-TW';" .flightwake/hooks/state-check.mjs || fail "46.7 舊標頭的 update 不得把 hook 換成英文"
[ "$st" = "$(shasum < .flightwake/STATE.md)" ] || fail "46.7 舊標頭的 update 不得改 STATE"
newrepo "$TMP/up7" >/dev/null; echo "# 我的" > CLAUDE.md
out=$(HOME=relhome FLIGHTWAKE_HOME= ncli init --agents=claude --mod 2>&1) || fail "46.7 相對 HOME 的 init 應成功(registry 是盡力而為)(out: $out)"
[ -e relhome ] && fail "46.7 相對 HOME 時不得把 registry.json 寫進 repo 裡(got: $(git --no-optional-locks status --porcelain))"
echo "$out" | grep -qF 'cross-repo registry skipped' || fail "46.7 相對 HOME 時應說明略過跨 repo 登記(got: $out)"
pass "46.7 update --mod 印重開 / trust / /fw-mod 並建 0700 sessions;bare update 不加;private 的 update --statusline / --lang 寫 local、保留附加元件與 STATE、git status 乾淨;舊標頭從 hook 取回語言;相對 HOME 不寫 registry 進 repo"

# 46.8 真的 pty 下 locale 接到 setup:LC_MESSAGES=zh_TW → 語言題預設 [2]、說明依據;不送游標/清除序列
if [ "$HAVE_PY" = 1 ]; then
  PTYANS="$SRC/test/pty-answers.py"; PY3="$(command -v python3)"
  newrepo "$TMP/lc-pty" >/dev/null
  rc=0; env LC_MESSAGES=zh_TW.UTF-8 PATH="$NOCL" "$PY3" "$PTYANS" 60 "$NODE_BIN" "$CLI" setup -- "" 1 "" "" n > "$TMP/lc-pty.out" 2>&1 || rc=$?
  [ "$rc" = 1 ] || fail "46.8 最終確認答 n 應退出 1(rc=$rc)"
  node -e '
    const raw = require("fs").readFileSync(process.argv[1], "utf8"); const bad = [];
    if (/\x1b\[/.test(raw)) bad.push("output contains cursor/erase control sequences");
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/\r/g, "").trimEnd());
    if (!raw.includes("LC_MESSAGES=zh_TW.UTF-8")) bad.push("missing: the locale the guess came from");
    if (!lines.some((l) => /\[2\] ?$/.test(l))) bad.push("missing: language prompt preselected [2] answered with Enter");
    if (!raw.includes("你在這裡用哪些 AI coding 工具")) bad.push("missing: the agents question in zh-TW");
    if (bad.length) { console.log(bad.join("\n") + "\n---\n" + lines.join("\n")); process.exit(1); }
  ' "$TMP/lc-pty.out" || fail "46.8 pty 下 locale 預選與畫面不對($(head -c 300 "$TMP/lc-pty.out" | tr -d '\033'))"
  [ ! -e .flightwake ] || fail "46.8 取消後不得寫入"
  pass "46.8 pty:LC_MESSAGES=zh_TW 預選 [2]、說明依據、後續題目變繁中;無控制序列;取消零寫入"
else
  echo "  skip: 沒有 python3,略過 46.8(pty)"
fi

echo ""
echo "✅ smoke 全過"
