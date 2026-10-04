#!/usr/bin/env bash
# flightwake installer smoke test — runs init in temp git repos (fresh/rerun/--force/lang/update),
# verifying idempotency and user-data safety.
set -euo pipefail

# Keep tests deterministic and offline: never let the statusline spawn a background update check
export FLIGHTWAKE_NO_UPDATE_CHECK=1

FW="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# macOS: mktemp gives /var/... (a symlink) while node's process.cwd() reports /private/var/... —
# resolve to the physical path so registry keys (recorded from cwd) match the paths tests compare against
TMP="$(cd "$TMP" && pwd -P)"
# Isolate the cross-repo registry — without this, every test repo below lands in the real ~/.flightwake/registry.json
export FLIGHTWAKE_HOME="$TMP/fw-home"

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
# 各附加元件單獨回 y(其餘預設)
newrepo "$TMP/sd-sl" >/dev/null; echo "# 我的" > CLAUDE.md
node "$DRIVE" --orca=0 -- "" "" y "" "" y >/dev/null || fail "statusline 單選 setup 應成功"
grep -q 'statusLine' .claude/settings.json || fail "statusline 答 y 應寫入 statusLine"
[ -e .claude/skills/fw-roles ] && fail "只答 statusline 不得裝 roles"
grep -q 'flightwake-orca' CLAUDE.md && fail "只答 statusline 不得有 Orca 區塊"
newrepo "$TMP/sd-roles" >/dev/null
node "$DRIVE" --orca=0 -- "" 2 y "" y >/dev/null || fail "roles 單選 setup 應成功"
[ -f .claude/skills/fw-roles/SKILL.md ] || [ -f .agents/skills/fw-roles/SKILL.md ] || fail "roles 答 y 應裝 fw-roles"
grep -q 'statusLine' .claude/settings.json && fail "只答 roles 不得裝 statusLine"
grep -rq 'flightwake-orca' --include='*.md' . && fail "只答 roles 不得有 Orca 區塊"
newrepo "$TMP/sd-orca" >/dev/null
out=$(node "$DRIVE" --orca=1 -- "" 2 "" y "" y 2>&1) || fail "Orca 單選 setup 應成功(out: $out)"
echo "$out" | grep -q 'Orca collaboration (' || fail "--orca=1 時應出現 Orca 題目"
grep -q 'flightwake-orca:begin' AGENTS.md || fail "Orca 答 y 應寫入 Orca 區塊"
[ -e .claude/skills/fw-roles ] || [ -e .agents/skills/fw-roles ] && fail "只答 Orca 不得裝 roles"
grep -q 'statusLine' .claude/settings.json && fail "只答 Orca 不得裝 statusLine"
# Orca 題答 n(預設)→ 不寫區塊
newrepo "$TMP/sd-orca-n" >/dev/null
node "$DRIVE" --orca=1 -- "" 2 "" "" "" y >/dev/null || fail "Orca 預設否 setup 應成功"
grep -q 'flightwake-orca' AGENTS.md && fail "Orca 題預設否,不得寫區塊"
# repo 類型選 2 → notes
newrepo "$TMP/sd-notes" >/dev/null
node "$DRIVE" --orca=0 -- "" 2 "" 2 y >/dev/null || fail "筆記型 setup 應成功"
grep -q 'flightwake:begin v[0-9.]* lang=en profile=notes' AGENTS.md || fail "選筆記型 marker 應帶 profile=notes"
# 旗標視為該題答案(不再提問)
newrepo "$TMP/sd-flags" >/dev/null
out=$(node "$DRIVE" --orca=0 --flags='{"lang":"en","agents":["codex"],"profile":"notes"}' -- "" y 2>&1) || fail "帶旗標 setup 應成功(out: $out)"
echo "$out" | grep -q 'Language' && fail "給了 lang 旗標就不該再問語言"
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
rc=0; out=$(node "$DRIVE" -- n 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "已安裝時確認答 n 應退出 1(got $rc)"
echo "$out" | grep -qi 'already installed' || fail "已安裝時應告知「already installed」(got: $out)"
[ "$b" = "$(snap)" ] || fail "已安裝時確認答 n 不得改任何檔案"
rc=0; out=$(node "$DRIVE" -- "" 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "已安裝時最終確認 Enter(預設是)應執行更新並退出 0(got $rc)"
echo "$out" | grep -q '\[Y/n\]' || fail "最終確認應顯示 [Y/n]"
echo "$out" | grep -q 'Language' && fail "已安裝時不應再問語言等題(只有最終確認)"
sed -i.bak 's/flightwake:begin v[0-9.]*/flightwake:begin v0.0.1/' AGENTS.md && rm -f AGENTS.md.bak
rc=0; out=$(node "$DRIVE" -- y 2>&1) || rc=$?
[ "$rc" = 0 ] || fail "已安裝時確認答 y 應成功更新(got $rc: $out)"
grep -q "flightwake:begin v$FWV lang=en" AGENTS.md || fail "setup 更新應沿用既有語言並升到目前版本(got: $(grep 'flightwake:begin' AGENTS.md))"
pass "setup:拒絕 git init 零寫入;已安裝 y 更新 / n 不動"

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
chk_zero "roles 題 ^C(中間題)" "" 2 ^C
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
doc_variant() { # $1 名稱 $2 在副本內執行的破壞指令(shell);預期 doctor 退出 1
  local name="$1" dir="$TMP/doc-v-$(echo "$1" | tr -c 'a-zA-Z0-9\n' _)"
  cp -R "$TMP/doc-base" "$dir"; ( cd "$dir" && eval "$2" )
  local rc=0 out; out=$(cd "$dir" && node "$CLI" doctor 2>&1) || rc=$?
  [ "$rc" = 1 ] || fail "doctor:$name 應退出 1(rc=$rc: $out)"
}
doc_variant "缺 skill 目錄" 'rm -rf .claude/skills/fw-record'
doc_variant "移除 Stop hook" 'jedit .claude/settings.json "delete j.hooks.Stop"'
doc_variant "改 hook command" 'jedit .claude/settings.json "j.hooks.Stop[0].hooks[0].command+=\" --extra\""'
doc_variant "JSON 損毀" 'echo "{ not json" > .claude/settings.json'
doc_variant "hook 重複登記" 'jedit .claude/settings.json "j.hooks.Stop.push(JSON.parse(JSON.stringify(j.hooks.Stop[0])))"'
doc_variant "缺 hook 腳本" 'rm .flightwake/hooks/state-check.mjs'
doc_variant "缺 .flightwake" 'rm -rf .flightwake'
newrepo "$TMP/doc-gem" >/dev/null
node "$CLI" init --agents=gemini >/dev/null
rc=0; node "$CLI" doctor >/dev/null 2>&1 || rc=$?
[ "$rc" = 0 ] || fail "gemini 新裝 doctor 應退出 0(rc=$rc)"
jedit .gemini/settings.json 'j.hooks.Stop=j.hooks.AfterAgent; delete j.hooks.AfterAgent'
rc=0; out=$(node "$CLI" doctor 2>&1) || rc=$?
[ "$rc" = 1 ] || fail "Gemini hook 登記在 Stop(應為 AfterAgent)doctor 應退出 1(rc=$rc: $out)"
echo "$out" | grep -q 'AfterAgent' || fail "doctor 應指出 Gemini 應為 AfterAgent"
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
out=$(node "$DRIVE" --orca=0 -- "" "" 1 "" "" "" "" 2>&1) || fail "無指令檔時選 claude 的 setup 應成功(out: $out)"
echo "$out" | grep -q 'Which AI coding tools' || fail "無指令檔時應直接問用哪些工具"
echo "$out" | grep -q 'detected:' && fail "無指令檔時不得顯示偵測結果或預選"
echo "$out" | grep -q 'Pick at least one' || fail "無指令檔時直接 Enter 應要求至少選一個(不得預設 codex)"
echo "$out" | grep -q 'Bottom gauge in Claude Code' || fail "選了 claude 應問到儀表那一題"
grep -q 'flightwake:begin' CLAUDE.md || fail "選 claude 應寫入 CLAUDE.md"
[ -e AGENTS.md ] && fail "只選 claude 不得建 AGENTS.md"
newrepo "$TMP/ag-names" >/dev/null
node "$DRIVE" --orca=0 -- "" "claude,gemini" "" "" "" "" >/dev/null || fail "以名稱複選應成功"
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

echo ""
echo "✅ smoke 全過"
