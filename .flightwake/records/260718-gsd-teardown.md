---
record_id: 260718-gsd-teardown
session: Claude(Fable 5)
date: 2026-07-18
repos: [flightwake]
tests: 無 runtime 面(本 repo 只動 docs 與 .flightwake);GSD 拆除以檔案系統與新 session 狀態驗證
prod_changes: "none(repo 側);使用者機器全域環境變更:~/.claude 的 GSD 1.7.0 完整移除,證據見下"
---

# 從「statusline 顯示 22% 是不是 bug」查到 GSD 全域拆除完成,沉澱 cleanGSD.md 手冊

**TL;DR**:使用者質疑冷啟動後 context 就佔 22% 是儀表 bug。解析本機 transcript 對帳:不是 bug——session 第一筆 usage 已 40,377 tokens(20.2%),是「還沒打字就存在」的固定底盤,最大可移除項為 GSD 全域安裝(71 skill + 34 agent 清單 + 7 類 hooks);coldstart 邊際僅 ~5.4k(2.7%),與 docs/benchmarks.md 吻合。使用者當場決定提前執行 GSD 全域拆除(原定等所有 repo 轉完,見 DECISIONS 2026-07-18),依 GSD 自帶 manifest(591 檔)精準刪除並清 settings,方法沉澱為 `docs/cleanGSD.md`。

## 關鍵發現(重要性排序)

1. **儀表數字要拆成「固定底盤 vs 邊際成本」才有意義**:transcript 第一筆 usage 就是底盤(本例 20.2%),任何框架的真實成本是邊際增量。這也是文案的敘事角度(常駐成本 vs 事件觸發成本),素材與紅線已入個人記憶(gsd-context-overhead-case)。
2. **GSD 自帶 file manifest(含 SHA-256)是乾淨拆除的關鍵**:591 檔逐一列名,可先驗證「manifest 外沒有使用者檔案混居」再精準刪除,刪空目錄才移除。手冊化於 `docs/cleanGSD.md`。
3. **文案引用對比前必須補 A/B**:移除後新 session 的開場 usage 還沒量,底盤 40k 非 100% 是 GSD(含系統提示與其他 plugin),沒量之前不得寫成「GSD 佔 40k」。

## 交付 / Commits

本段無程式碼變更;交付為 `docs/cleanGSD.md`(拆除手冊)、DECISIONS 一行(拆除決策含還原路徑)、個人記憶一則(文案素材)。

## 驗證證據

- 儀表算法對帳:transcript 第一筆 usage 合計 40,377 tokens(20.2%),當下最後一筆 45,735(22.9%),coldstart+對話邊際 5,358——儀表顯示 22% 正確
- 拆除後檔案系統:`~/.claude` 下 `gsd-core`、`gsd-file-manifest.json`、`gsd-install-state.json`、`gsd-migration-journal` 全數消失;`skills/`、`agents/`、`hooks/` 刪空後整目錄移除;settings.json 僅剩使用者自有設定(model/theme/plugin/permissions.deny)
- 同 session 內 GSD 的 34 個 agent 型別即時從可用清單消失(harness 端確認)
- 回滾保障:整包備份 2.1MB(`~/.claude/backups/gsd-full-backup-20260718.tar.gz` + settings 快照)

## 未完 / 交接

- **A/B 底盤量測**:下次開新 session 量第一筆 usage,對比 40,377——文案引用前必做(入口:個人記憶 gsd-context-overhead-case 有紅線註記)
- 發宣傳(素材全齊,新增本次 context 開銷故事線)
- v0.9 既有項不變(見 STATE)
