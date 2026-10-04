**結論：目前仍不能合併；只剩一項本輪新增必修。** 審至 `c9a9eb8`。上輪五項原反例均已修好，完整 smoke **60 個 ok 全過**；但 rename 寫入會放寬既有設定檔權限，是一般使用情境即可重現的回歸。

**依據：**

- **合併前必修：保留既有檔案的權限。** 暫存實測：將含使用者設定的 `.claude/settings.local.json` 設為 `0600`，以一般 `umask 022` 執行 `init --private --agents=claude`。main 維持 `0600`；HEAD 回報成功，卻變成 **`0644`**。內容若含憑證，讀取權限便被放寬。原因是暫存檔以預設 mode 建立，rename 前沒有繼承目的地權限；`append` 同樣如此。應在寫入暫存內容時維持保護，並補權限回歸測試。[install.mjs:277](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:277)、[install.mjs:295](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:295)。
- **原五項已修復。** 重跑涵蓋 hardlink、四個未防護入口、exclude 目錄／symlink、祖先型別衝突，以及應跳過的 tracked symlink，結果符合要求。未再重現原本的資料覆寫、刪除或 private 假成功。[smoke.sh:1192](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/test/smoke.sh:1192)。這些測試確實驗到原反例，但未涵蓋上述 mode 回歸。
- **接受 tracked `.flightwake` 的相容性變更。** 預檢拒絕並提示解除追蹤，比警告後宣稱 private 完成合理；沒有自動更動 index。[install.mjs:737](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:737)。
- **rename 本身可保留。** 實測既有開啟的檔案描述元仍讀到完整舊內容，新開啟讀到完整新內容；同一使用者下 uid/gid 未變。未發現需要因此退回原地覆寫的理由。

**沒有驗證的部分：**跨所有者／群組、ACL、Windows、真實 hook 執行中更新、競態與磁碟耗盡。本輪測試皆在暫存目錄並隔離 `FLIGHTWAKE_HOME`；受審 worktree 未修改。

**考慮過但不採用的做法：**不擴搜刻意構造的檔案系統攻擊、不要求完整回滾，也不恢復 hardlink 不安全的原地寫入。不可預測 I/O 失敗不回滾、更多 symlink 相容性仍可延後；**既有私密檔案 `0600 → 0644` 不宜列為延後限制。**