---
record_id: 261110-narrow-b3-a5-draft
session: Claude Code(Opus 5.5),2026-11-10(接續 [[261110-narrow-a3-a10]])
date: 2026-11-10
repos: [flightwake]
tests: 無 runtime 面(只有文件與計畫);上一份 record 的 smoke 證據仍適用,本段沒有改程式碼
prod_changes: none
---

# 證據頁、B1 候選句與安裝計時、A5 設計稿

**TL;DR**:等 Kai 跑 agy 探針的空檔,做了不需要 Kai 決定的部分:英文與繁中的證據頁 `docs/evidence.md`(用本 repo 自己的 `.flightwake/` 當例子,22% 誤診那次稽核寫成自我揭露、不當基準)、`docs/benchmarks.md` 開頭註明 n=2 且對照組沒實跑、B1 的三個候選句與安裝計時寫進計畫、A5(絆線改成一般 PreToolUse hook)的設計稿 `docs/plans/tripwire-hook.md` 待審。

## 關鍵發現

1. **安裝本身很快,慢的是接手**:乾淨 repo 裡 `init --agents=claude,codex` 三次各約 0.1 秒;`npx` 下載(約 1.1 MB、119 個檔)沒量。README 的時間宣稱應以「新 session 冷啟動接手」計,那要在 agent 裡量。
2. **Codex 的 PreToolUse 能在執行前給 context**(learn.chatgpt.com/docs/hooks.md,2026-11-10 逐字):`hookSpecificOutput.additionalContext`,預設上限約 2,500 token;matcher 只比對工具名;`apply_patch` 的 patch 文字在 `tool_input.command`,沒有路徑欄位;專案 hook 要信任、信任綁在 hook 的 hash 上。`codex exec` 是否載入專案 hook 頁面沒寫。
3. **A5 最大的設計選擇是把解析器收成一份**:TRAPS 解析、glob、shell 分段放進一支純 ES 模組,mod、CLI 與一般 hook 共用。能不能讓 mod 的 TS import 外掛內的 `.mjs` 並過 `validate --strict` 是探針 Q5。

## 交付 / Commits

fe38a4c..3c69cf6(證據頁、B1 候選句與計時、A5 設計稿)。

## 驗證證據

- 證據頁的數字由頁面上列出的指令現算(2026-11-10):45 份 record、127 條決策、20 條 active、22 條 superseded 的坑。
- 稽核數字(106 條中 24 條)與「正式環境壞了三天」對照 `records/260803-trap-confidence.md` 原文。

## 未完 / 交接

- **[Kai]** agy 探針 → 發 0.18.0;B1 從三句候選選一句;A5 設計稿的審查(要一個可見的 Orca 分頁,請另一個 agent 唯讀審)。
- A5 的探針 Q1–Q5 在審查前或審查後做都可以;Q1(Claude Code 的 PreToolUse 是否支援 additionalContext)決定 Claude 端要不要改。
