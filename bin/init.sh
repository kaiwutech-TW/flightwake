#!/usr/bin/env bash
# flightwake init — 安裝進目標 repo(在目標 repo 根目錄執行)
# 純檔案複製,零執行期依賴;可與 GSD .planning/ 並存。
set -euo pipefail

FW_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="$(pwd)"

if [ ! -d "$TARGET/.git" ]; then
  echo "⚠️  目前目錄不是 git repo($TARGET)— flightwake 依賴 git 作為記錄底層。先 git init。"
  exit 1
fi

echo "flightwake init → $TARGET"

# 1. .flightwake/ 模板(已存在的檔案不覆蓋)
mkdir -p "$TARGET/.flightwake/records"
for f in STATE.md DECISIONS.md TRAPS.md; do
  if [ -e "$TARGET/.flightwake/$f" ]; then
    echo "  skip .flightwake/$f(已存在)"
  else
    cp "$FW_SRC/templates/$f" "$TARGET/.flightwake/$f"
    echo "  add  .flightwake/$f"
  fi
done
cp -n "$FW_SRC/templates/records/TEMPLATE-record.md" "$TARGET/.flightwake/records/" 2>/dev/null \
  && echo "  add  .flightwake/records/TEMPLATE-record.md" || echo "  skip records/TEMPLATE(已存在)"

# 2. 四個 skill → .claude/skills/
mkdir -p "$TARGET/.claude/skills"
for s in fw-coldstart fw-record fw-handoff fw-trap; do
  if [ -e "$TARGET/.claude/skills/$s" ]; then
    echo "  skip .claude/skills/$s(已存在)"
  else
    cp -R "$FW_SRC/skills/$s" "$TARGET/.claude/skills/$s"
    echo "  add  .claude/skills/$s"
  fi
done

# 3. CLAUDE.md 片段(存在 CLAUDE.md 就附加;已含標記則跳過)
SNIPPET="$FW_SRC/snippets/CLAUDE-md-snippet.md"
if [ -e "$TARGET/CLAUDE.md" ] || [ -e "$TARGET/.claude/CLAUDE.md" ]; then
  CMD_FILE="$TARGET/CLAUDE.md"; [ -e "$TARGET/.claude/CLAUDE.md" ] && CMD_FILE="$TARGET/.claude/CLAUDE.md"
  if grep -q "flightwake 工作紀律" "$CMD_FILE"; then
    echo "  skip CLAUDE.md 片段(已安裝)"
  else
    { echo ""; cat "$SNIPPET"; } >> "$CMD_FILE"
    echo "  append CLAUDE.md ← 觸發義務表($CMD_FILE)"
  fi
else
  echo "  ⚠️  找不到 CLAUDE.md — 請手動把 snippets/CLAUDE-md-snippet.md 貼進你的 CLAUDE.md"
fi

echo ""
echo "✅ done。下一步:"
echo "   1. 編輯 .flightwake/STATE.md 填入現況(或讓 Claude 用 /fw-record 初始化)"
echo "   2. git add .flightwake .claude/skills CLAUDE.md && git commit"
