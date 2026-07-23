---
record_id: 260723-v0101-version-gauge
session: Claude(Fable 5)
date: 2026-07-23
repos: [flightwake]
tests: bash test/smoke.sh 全過;儀表手測輸出含暗色版本號(`✈️ flightwake v0.10.1 │ ●green…`)
prod_changes: none(0.10.1 刻意未發,見 STATE)
---

# v0.10.0 發佈後小增強:儀表常駐版本號;/fw-update 判定不做

**TL;DR**:接續 [[260723-v0100-release]]。使用者問兩件事:「有 /fw-update 嗎」「版本號能上儀表嗎」。前者答不加——update 是 CLI 子指令,skill 只會是包 bash 的殼,守 4-skill 最小表面;後者做了——儀表第一欄常駐暗色版本號,放寬 2026-07-18「只放三項」決策(兩者皆入 DECISIONS 2026-07-23)。0.10.1 已 bump 在 main、**刻意未發**,等下批功能一起出 Release。

## 關鍵發現

1. **gh active account 會被其他 session 切走且錯誤訊息誤導** → 已登 TRAPS [[gh-active-account-drift]] 並依 fw-trap step 6 同步存使用者層記憶(機器級通用坑,本 session 實咬於 v0.10.0 發佈時)
2. 儀表版本號的實作點:沿用安裝器既有的 FW_VERSION 蓋章,顯示端判 `!== '0.0.0'` 才出——未蓋章(dev 直跑源頭檔)時自動隱藏,零新機制

## 交付 / Commits

2d8db62..4382c5e(statusline 源頭+安裝副本、DECISIONS 一行、STATE 記未發狀態)

## 驗證證據

- smoke 全過(22 組);`echo '{}' | node .flightwake/hooks/statusline.mjs` 實際輸出 `✈️ flightwake v0.10.1 │ ●green · STATE 同步 │ → 開工先 /fw-coldstart`
- 安裝副本與源頭 diff 僅 LANG/FW_VERSION 蓋章差異

## 未完 / 交接

- 0.10.1 隨下批功能一起發 Release(發佈時本段變更含入,record 記發佈證據即可)
- 其餘待辦不變,見 STATE 下一步入口
