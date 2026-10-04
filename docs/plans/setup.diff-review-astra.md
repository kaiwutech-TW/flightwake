**結論：建議修正後再合併。** 上次建議大多落實：明確 `setup` 才互動、附加元件預設否、git init 延後、共用安裝流程、notes 持久化及 private＋roles 排除都有實作。取消前零寫入與 doctor 唯讀，在已測案例成立；但隱私檢查、doctor 完整性及既有行為仍有缺口。

審查基準為 `9dd685c..9dac1e3`，實際是 **7 個 commit**。以下依嚴重程度排列，連結均指向受審 worktree。

1. **P1：doctor 會把已失效的 private 保護判為正常。**  
   實測刪除 exclude 區塊中的 `.flightwake/`，STATE 已不被忽略，doctor 仍 exit 0、印「排除生效」。原因是只檢查「剩下的排除項」，沒有檢查必要項是否缺失。應從安裝產物推導必要排除集合，再驗證實際效果。  
   依據：[doctor.mjs:159](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/doctor.mjs:159)。

2. **P1：新增 Orca 路徑會違反 private 的受追蹤檔保護。**  
   實測先一般安裝、`git add CLAUDE.md`，再跑 `init --private --orca --agents=claude`：受追蹤的 CLAUDE.md 被追加 Orca 區塊。既有 marker 分支直接選中原檔，Orca 寫入前未重查 tracked。這是新增功能的問題，不只是 record 已列出的 `roles apply` 限制。  
   依據：[install.mjs:498](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:498)、[install.mjs:549](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:549)。

3. **P1，既存風險：不能保證任何路徑都不覆蓋使用者資料。**  
   實測將 `.flightwake/hooks/state-check.mjs` 設為指向 `../STATE.md` 的 symlink，`update` 會把 STATE 覆蓋成 hook 程式。**main 同樣可重現，並非本次拆檔造成**；但「任何情況不覆蓋」承諾仍不成立。寫入框架檔前須檢查 symlink／實際落點，不能只保護 STATE 的字面路徑。  
   依據：[install.mjs:233](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:233)、[install.mjs:289](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/install.mjs:289)。

4. **P2：doctor 有循環判定與結構漏查。**  
   實測刪除 AGENTS.md 的 marker、保留使用者內容，再破壞 `.codex/hooks.json`，doctor 仍 exit 0：平台清單只來自仍存在的 marker，壞掉的平台反而消失。另把 hook `type` 改為 `prompt`，command 不變，也被判正常；將 `hooks` 改為物件則直接拋例外，沒有逐項診斷。  
   依據：[doctor.mjs:85](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/doctor.mjs:85)、[doctor.mjs:113](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/doctor.mjs:113)。

5. **P2：`uninstall` 既有行為確實改變。**  
   新的 git 前置檢查套到所有命令。實測有 `.git`、PATH 無 git：main 的 uninstall 成功移除框架，新分支 exit 1、完全不移除。任務指定新增檢查的是 init／setup；應限制適用命令，或明確核准這項相容性變更。  
   依據：[cli.mjs:113](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/cli.mjs:113)、[任務:24](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/docs/plans/setup.md:24)。

6. **P2：冷啟動補洞會跳過既有安全接手步驟。**  
   STATE 只剩一行未填模板，也會被視為首次啟用並「直接跳到第 5 步」，略過最新 record、相關 TRAPS／DECISIONS 與落後檢查。部分初始化不代表沒有歷史；補欄後應繼續適用的原流程。  
   依據：[fw-coldstart:13](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/skills/zh-TW/fw-coldstart/SKILL.md:13)。

**測試與確認到的部分**

- 在暫存副本、隔離 `FLIGHTWAKE_HOME` 下，新增 **23–34 節全部通過**；`bin/*.mjs` 語法檢查通過。確認前執行 dry-run、確認後才 git init，程式路徑也支持取消不寫入的結果。[setup.mjs:58](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/setup.mjs:58)、[setup.mjs:248](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/bin/setup.mjs:248)。
- doctor 沒有發現寫入呼叫；現有快照測試涵蓋 ignored 檔、`.git` 與 registry，前後一致。
- **測試宣稱仍偏強：**doctor 負向案例只要求 exit 1，程式崩潰也能過；未自動比對 setup 摘要與實際寫入集合。快照驗證內容未變，也不等同追蹤所有寫入系統呼叫。[smoke.sh:615](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/test/smoke.sh:615)、[smoke.sh:861](/Users/kaiwu/orca/workspaces/flightwake/setup-wizard/test/smoke.sh:861)。

**沒有驗證的部分：**完整 smoke 在既有第 22 節因系統 Python 缺 `tomllib` 中止，因此沒有重現「完整 34 節一次全過」；新增章節是另外執行。未驗 CI、Windows、agent 實際遵循冷啟動文字、hook／Orca 真機效果，也未做並行寫入與所有檔案別名測試。repo／家目錄未修改。

**考慮過但不採用的做法：**不以 doctor 自動修復掩蓋漏報；不把所有異常都降成提醒；不因部分 smoke 通過便宣稱完全相容；也不把已在 main 重現的 symlink 問題誤列為拆檔回歸。