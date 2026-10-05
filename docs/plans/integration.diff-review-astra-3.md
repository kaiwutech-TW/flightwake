**結論：依先前約定的標準，可以合併。** 審至 `6211fd2`。三項必修均已修好；本輪範圍內未再發現敏感內容進日誌、使用者資料損失或 private 假成功。

**依據：**

- **sed 洩漏已修復。** 重跑原多組 `-e` 反例，日誌只列 `config.txt`，沒有替換內容；參數值已與檔案分開解析。[shell.ts:227](/Users/kaiwu/orca/workspaces/flightwake/integration/mods/flightwake/hooks/lib/shell.ts:227)。
- **repo 外誤記已修復。** `cd /tmp; rm private.txt` 不再列入紀錄；cwd 不確定時略過相對路徑，候選另經 Git 確認。[recorder.ts:194](/Users/kaiwu/orca/workspaces/flightwake/integration/mods/flightwake/hooks/features/recorder.ts:194)。
- **uninstall 已保留型別不符的目錄。** 原 `hooks/register.ts/KEEP` 反例內容完整保留，輸出點名原因；正常安裝後卸載則清掉 mod／skills 空資料夾，保留 STATE。[remove.mjs:42](/Users/kaiwu/orca/workspaces/flightwake/integration/bin/remove.mjs:42)。
- **未見失去實用性的回歸。** 原兩個失敗 hook 測試通過；補跑一般 `cp`、`mv`、重導向，使用真實 Git 狀態輸出餵入 hook，均正確記錄。原版外掛 **297／297**，追加後 **302／302**；完整 smoke **44 節全過**，validate、Git 唯讀檢查通過。

**沒有驗證的部分：**本輪未重跑 tsc、真實 Claude session、Windows、CI 或競態／磁碟故障。Git 確認的是事後有變更，仍不證明變更必由該指令造成；日誌維持「推斷」定位。所有實跑均在暫存副本並隔離 `FLIGHTWAKE_HOME`，受審 worktree 未修改。

**考慮過但不採用的做法：**不再擴搜刻意構造的語法或檔案系統情境，也不要求完整 shell 解析。無法確認時漏記、更多指令覆蓋及跨平台驗證可延後，這次沒有剩餘合併前必修。