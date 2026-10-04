**結論：建議修正後再合併。** 審查範圍為 `9dac1e3..0982dcf`。上次六項的原始反例已不再重現；但第 2、3 項仍有延伸缺口，不能宣稱全面修好。兩項 UX 修改基本符合要求。

**依據與問題，按嚴重程度排序：**

1. **P1：private 的 Orca 修正仍會寫入受追蹤檔。**  
   實測先安裝 Claude，再將 `CLAUDE.md`、`CLAUDE.local.md` 都加入 git；執行 `init --private --orca --agents=claude`，後者仍被追加 Orca 區塊，exit 0。切換目的地後沒有重新檢查 tracked。  
   [install.mjs:605](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:605)

2. **P1：symlink 防護沒有涵蓋完整安裝路徑。**  
   實測把 `.claude/skills` 連到暫存 repo 外，執行 `update`：核心 skills 被拒寫，但 `refreshRolesSkill` 仍刪除、重建外部 `fw-roles`，其中測試用檔案消失。setup 的 roles 安裝也繞過寫入防護。這是 record 已承認的既存缺口，仍不符合「安裝寫入一律防護」的宣稱。  
   [install.mjs:395](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:395)、[roles.mjs:430](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/roles.mjs:430)、[setup.mjs:75](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/setup.mjs:75)

3. **P2：拒寫確實留下半套安裝，成功訊息與退出碼矛盾。**  
   repo 內共用 `settings.json` 的 symlink 被拒寫後，STATE、skills、指令檔已建立；exit 1，卻仍印 `✅ done`。setup 同樣可能 doctor 失敗後印成功。懸空的 `.claude` 目錄 symlink 則直接拋 ENOENT，沒有一致的拒寫診斷。拒絕合理 symlink 用法是已記錄的取捨，但應先檢查必要目的地，並正確回報部分完成。  
   [install.mjs:291](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:291)、[cli.mjs:238](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/cli.mjs:238)、[setup.mjs:77](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/setup.mjs:77)

4. **P2：registry 的 best-effort 契約退化。**  
   實測 `registry.json` 是 symlink：main 安裝 exit 0，HEAD exit 1。拒寫可保留，但選配索引失敗不應讓安裝失敗；目前 symlink 進入 `refused`，其他 registry 例外卻只提醒，處理不一致。  
   [install.mjs:195](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:195)、[install.mjs:676](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:676)

5. **P3：工具題仍接受非工具名稱。**  
   `constructor`、`toString`、`__proto__` 被 `GROUPS[x]` 當成合法選項；確認後真的寫入，再由 doctor 判失敗。這是沿用驗證方式的缺口，應檢查 own property 或明確名稱集合。  
   [setup.mjs:219](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/setup.mjs:219)

**驗證結果與測試限制：**

- Python 3.12、暫存副本及隔離 `FLIGHTWAKE_HOME` 下，完整 smoke **36 節、49 個 ok 全過**。上次 private 漏查、doctor 平台／type／結構診斷、無 git uninstall 均通過；四語 coldstart 已改為有歷史就續走原流程。
- 真實 PTY 等到最後 `[Y/n]` 才送 `n`／EOF／Ctrl-C：分別 exit **1／1／130**，檔案內容與 mtime 不變，也未建立 `.git`。Enter 安裝、無預選、空白重問、名稱／數字混選、去重及一般錯誤輸入均符合預期。
- 常規 init／update／uninstall 測試通過，但上述 symlink 與 registry 行為表示**不能宣稱完全等同 main**。
- doctor 負向測試已補具體診斷及不得崩潰；摘要測試也加入 mtime。惟 36.3 只測 hooks，不能支持「所有路徑一律拒寫」；36.6 是文字檢查，不能證明 agent 實際遵循。  
  [smoke.sh:1020](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/test/smoke.sh:1020)、[smoke.sh:1053](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/test/smoke.sh:1053)、[smoke.sh:1063](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/test/smoke.sh:1063)

**沒有驗證的部分：**Windows、CI、實際 agent／hook 執行、並行修改與所有檔案別名情況；快照也不等於系統呼叫層級的零寫入證明。受審 worktree 未修改。

**考慮過但不採用的做法：**不全面放行 repo 內 symlink，以免再次覆蓋 STATE；不先做複雜回滾，優先共用寫入防護與必要路徑預檢；不把既存 roles 缺口誤稱為本次新增回歸。