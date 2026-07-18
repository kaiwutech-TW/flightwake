---
record_id: 260718-coldstart-gap4
session: Claude(Fable 5)
date: 2026-07-18
repos: [flightwake]
tests: smoke 全過(12 項,含本次新增 --private case)
prod_changes: none
---

# 冷啟動實測首筆數據 + 缺口 4 `--private` 本機模式

**TL;DR**:本 session 開場即是冷啟動實測——首筆有效樣本(全新 session 真冷啟動)入 `docs/benchmarks.md`,flightwake 邊際成本 ≈ 2.6K 讀 + 2K 出 tok,接手零猶豫。接著落地缺口 4:`init --private` 讓紀錄只留本機不進 git(exclude 標記區塊 + settings.local.json + CLAUDE.local.md),版本 0.3.0 → 0.4.0,smoke 12 項全過。

## 關鍵發現(重要性排序)

1. **exclude 對已追蹤檔不生效,決定了 --private 的整個寫入細則**:受 git 追蹤的檔案寫了必留痕跡,所以義務表不能碰既有 CLAUDE.md——claude 群組改寫 `CLAUDE.local.md`,codex/gemini 無本地等價檔只能跳過警告(細則與 why 見 DECISIONS 2026-07-18)。
2. **冷啟動的 token 成本要拆歸因才有意義**:/cost 全額 $0.75 裡 146K cache read 是 harness 底盤(系統 prompt + 工具 schema),任何指令都要付;框架自身邊際只有讀取面 7.2KB。不拆開會把框架成本高估 30 倍(數據與方法見 benchmarks.md)。
3. **模型端看不到自身 token 用量**:實測數據必須靠使用者回填 /cost,這摩擦點已明寫進 fw-coldstart 步驟 5(bbb0ae7),別靠臨場想起。

## 交付 / Commits

`091f473..bbb0ae7`(3 commits):實測數據入 benchmarks、`--private` 實作 + smoke case + README + DECISIONS 細則、fw-coldstart 補 /cost 步驟。

## 驗證證據

- `bash test/smoke.sh` → `✅ smoke 全過`,12 項:原 11 項 + `--private`(exclude 區塊與條目、hook 進 settings.local.json 且不建 settings.json、受追蹤 CLAUDE.md 不碰、義務表進 CLAUDE.local.md、**git status 乾淨**、重跑冪等不重複)
- `node bin/cli.mjs init --force` 於本 repo 實跑兩次:使用者資料全 skip、CLAUDE.md 標記升至 v0.4.0

## 未完 / 交接

- 缺口 5–7 未動:uninstall(注意 --private 多了三處標記區塊要反向清)、CI 端 STATE 檢查、monorepo 政策(入口見 STATE)
- benchmarks 仍缺 GSD 側實跑對照(公平比較的另一半)
- --private 未在真實「別人的 repo」場景試用過,細則等團隊回饋重評
