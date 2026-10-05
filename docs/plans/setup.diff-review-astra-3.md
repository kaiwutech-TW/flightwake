**結論：目前不建議合併。** 審查範圍 `0982dcf..18e9949`。第二輪五個原始反例已修好；完整 smoke **37 節、55 個 ok 全過**。但共用程式路徑不等於預檢完整，仍有可重現的資料損失、private 假成功及相容性回歸。

**依據：以下為合併前必修，按嚴重程度排序。**

1. **P1：受防護 writer 仍可透過 hardlink 覆蓋 STATE。**  
   將 `.flightwake/hooks/state-check.mjs` hardlink 到 `STATE.md`，`update` 預檢通過、exit 0，STATE 被覆蓋成程式，還宣稱使用者資料未動。檢查只辨識 symlink，實際使用原地寫入。這是既存別名風險，但與本輪資料保護承諾直接衝突。  
   [install.mjs:255](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:255)、[install.mjs:262](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:262)。

2. **P1：未受防護的四個入口都有實際資料損失，不能只列已知限制。**  
   `.claude/skills` 指向 repo 外時，`uninstall`、`roles remove` 都刪掉外部 `fw-roles/KEEP`，exit 0。另將 `roles-manifest.json` symlink 到 `records/saved.json`，內含合法 JSON 與使用者資料；`roles apply`、`roles assign` 都覆蓋該紀錄，exit 0。這些是既存缺口，不是本次新增回歸，但應補目的地／刪除範圍保護。  
   [cli.mjs:156](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/cli.mjs:156)、[roles.mjs:422](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/roles.mjs:422)、[roles.mjs:371](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/roles.mjs:371)。

3. **P1：必要的 private 排除失敗，仍被當成成功。**  
   `.git/info/exclude` 是目錄，或 symlink 到目錄時，dry-run 的讀取例外被吞掉，未加入拒寫結果；實際 `init --private` 寫入安裝產物後，印「privacy NOT in effect」，卻仍 exit 0、印 `✅ done (--private)`。必要排除失敗必須傳回失敗，不能比照選配 registry。  
   [install.mjs:670](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:670)。

4. **P2：不需任何競態，預檢仍會通過可預知的結構錯誤。**  
   `.claude` 是一般檔案時，init 先寫 STATE，才因 ENOTDIR 中止；此路徑有正確「未完成」與 exit 1。更嚴重的是已安裝 repo 的 `.agents` 為檔案、存在 AGENTS.md：`roles install` 先裝 Claude roles，再拋未捕捉 ENOTDIR、留下半套。應補目的地／祖先型別檢查，並統一 roles 的例外處理。  
   [install.mjs:265](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:265)、[roles.mjs:502](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/roles.mjs:502)。

5. **P2，新回歸：預檢拒絕根本不會寫入的檔案。**  
   受 git 追蹤的 `.codex/hooks.json` 是 repo 內合法 symlink；`init --private --agents=codex` 在 main 會跳過它、exit 0，HEAD 卻整個拒裝、exit 1。`W.check` 放在 tracked 跳過判定之前；應只檢查實際預計寫入的目的地。Gemini 使用同一路徑。  
   [install.mjs:515](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:515)。

**可以留到之後：**競態、磁碟耗盡等不可完全預測的 I/O 失敗之回滾；在統一非零退出與「未完成」訊息後，可維持不回滾。允許更多安全 symlink 用法也可延後；目前拒絕指令檔 symlink 是已記錄的相容性取捨。實測 **private worktree、private submodule、repo 內 `.claude` 目錄 symlink** 均安裝成功且 doctor 0。

**測試判讀：**37.1–37.6 確實驗到列出的固定反例；但未涵蓋上述 hardlink、必要 exclude 讀取失敗、型別衝突及「應跳過」路徑。37.2 未斷言退出碼；37.4–37.6 使用的 `snap` 只比路徑與內容，不能排除同內容重寫。因此「這些反例零變動」成立，「所有必要目的地預檢完整」尚不成立。  
[smoke.sh:1114](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/test/smoke.sh:1114)、[smoke.sh:615](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/test/smoke.sh:615)。

**沒有驗證的部分：**Windows、CI、真實並行改樹、磁碟耗盡、完整權限組合與系統呼叫層級零寫入。所有實跑皆在暫存目錄並隔離 `FLIGHTWAKE_HOME`；受審 worktree 未修改。

**考慮過但不採用的做法：**不要求全面交易／回滾才合併；先補可預知的拒寫與失敗傳遞。不把跨 repo roles 一律限制於目前 repo，應以各個明確目標 repo 為保護邊界；也不因風險早已存在，就把已重現的資料損失降為文件事項。