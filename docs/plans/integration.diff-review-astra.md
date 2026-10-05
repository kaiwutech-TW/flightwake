**結論：目前不能合併。** 審至 `284ceef`；有兩項合併前必修。暫存副本的完整 smoke **41 節全過**、外掛 **276 pass／0 fail**、validate 零警告、Git 唯讀檢查通過；受審 worktree 未修改。

**依據：**

1. **P1，必修：uninstall 會刪除使用者自加資料。**  
   實測 mod 內新增 `my-notes.md`，update 保留，uninstall 卻整個刪除、exit 0。實作符合「移除整個資料夾」這條規格，但規格本身與資料保護目標有衝突。應保留非發行檔，或發現額外內容時中止、要求明確清除選項。尤其 private 下這些資料可能未進 Git。  
   [cli.mjs:183](/Users/kaiwu/orca/workspaces/flightwake/integration/bin/cli.mjs:183)。測試 40.4 接著刪掉 40.3 建立的 `MY-NOTES.md`，只檢查 STATE 保留，**沒有驗證自加資料安全**。[smoke.sh:1347](/Users/kaiwu/orca/workspaces/flightwake/integration/test/smoke.sh:1347)。

2. **P2，必修：mod 複製預檢漏掉內層型別衝突，仍會留下半套。**  
   實測既有 `flightwake-mod/hooks/register.ts` 是目錄，執行 `init --agents=claude --mod --force`：預檢通過，先建立 STATE、skills、settings、指令檔，才因 `EISDIR` 退出 1。訊息正確，但這是可預先檢查的結構錯誤，不是不可預測 I/O。`W.cp` 只檢查根目錄與 symlink，應依實際發行檔逐一檢查目的地及祖先型別。  
   [install.mjs:350](/Users/kaiwu/orca/workspaces/flightwake/integration/bin/install.mjs:350)。40.8 未涵蓋此情況。

3. **其餘核對通過。**  
   合併保留兩邊 records 與 DECISIONS/TRAPS 條目，差異僅既有決策的 superseded 標記；STATE 已反映整合。兩邊程式與測試未因合併遺失。mod 的 symlink、hardlink、`0600` 保留、private 排除、setup 摘要及 doctor 案例均通過。Claude private 修正只讓帶 marker 的 `CLAUDE.local.md` 參與偵測，40.5 驗到 update 不再新增 Codex 產物，未見副作用。[install.mjs:188](/Users/kaiwu/orca/workspaces/flightwake/integration/bin/install.mjs:188)。

**可延後：**四語新增 skill／範本文字大致符合實作；41 節確實只是關鍵字檢查，不代表 agent 行為驗證。文件的「檢查每個可能 cwd」應改為「最多 16 個，超過後尾段比對」，避免描述比實作更強；其餘主要已知限制有保留。[mod.md:116](/Users/kaiwu/orca/workspaces/flightwake/integration/docs/mod.md:116)。未寫入的自加 symlink 仍會阻擋 update，可沿用既定相容性限制。

**沒有驗證的部分：**本輪未重跑 tsc、真機載入、AGENTS.md 載入實驗、resume／compact、Windows／CI；doctor 的新增唯讀測試使用假 `claude --version`，不能據此保證所有 CLI 版本均無副作用。

**考慮過但不採用的做法：**不要求完整交易回滾、不擴搜檔案系統攻擊，也不重開已接受的 mod 根本限制；但不能以「規格寫整目錄刪除」或「測試全綠」豁免已重現的自加資料損失。