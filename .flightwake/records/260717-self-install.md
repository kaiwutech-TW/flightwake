---
record_id: 260717-self-install
session: Claude(Fable 5)
date: 2026-07-17
repos: [flightwake]
tests: smoke 全過(8 項檢查:非 git 擋下/初裝齊全/冪等/--force/Stop hook 等)
prod_changes: none
---

# flightwake 自我安裝(dogfooding)— 本 repo 開始用自己的框架管理工作

**TL;DR**:flightwake 原始碼 repo 本身一直沒有安裝 flightwake。本次用本地 `bin/cli.mjs init` 完成自我安裝(`.flightwake/` + 4 個 skill + Stop hook),並初始化 STATE。從此本 repo 的開發工作適用自己的觸發義務表——框架吃自己的狗糧。

## 關鍵發現(重要性排序)

1. **repo 沒有 CLAUDE.md 時,init 只警告不建檔**:安裝器在找不到 CLAUDE.md/.claude/CLAUDE.md 時輸出「請手動貼 snippet」就結束。本次手動建了 CLAUDE.md 並貼入片段;注意標記必須寫成 `<!-- flightwake:begin v0.2.0 -->`(含版本號)才與安裝器寫入格式一致,`--force` 升級的 regex 才能正確替換。是否讓 init 直接建檔是待議事項(見未完)。

## 交付 / Commits

| 內容 | Commit/位置 |
|---|---|
| 自我安裝:`.flightwake/`(模板+Stop hook)、`.claude/skills/fw-*`、`.claude/settings.json`、CLAUDE.md 觸發義務表 | 本 record 前一個 commit |
| 初始化 STATE + 本飛行紀錄 | 本 commit |

## 驗證證據

- `bash test/smoke.sh` → `✅ smoke 全過`(8 項:非 git repo 擋下、初裝檔案齊全、無 .DS_Store、settings.json hook 正確、CLAUDE.md 片段一份、重跑冪等、--force 更新正確、Stop hook 行為正確)
- `.claude/skills/` 下四個 skill(fw-coldstart/fw-record/fw-trap/fw-handoff)已被 Claude Code 識別為可用 skill(本 record 即由 /fw-record 產出)

## 未完 / 交接

- 待議:init 在目標 repo 無 CLAUDE.md 時是否直接建檔(目前只警告);若改,smoke 需加對應 case
- 開源前 checklist 仍在進行(見 f50f174:伺服器端舊 objects 清理注意事項)
