**結論：方向可行，但建議修訂規格後再平行開發。** F1–F4 可做成觀測與提醒；F5 應定位為選配的「有限攔截」，目前不足以宣稱角色權限強制化。全程唯讀，未修改檔案。

**五個問題的回答與依據**

1. **F4 欄位：只加兩個選填欄位。** 例如 `paths: ["hooks/**"]`、`commands: ["git push"]`；前者是 repo 相對 glob，後者是命令 token 前綴，任一命中即提示。不開放任意 regex、不要求回填舊條目。缺 `status` 視為 active；缺 `confidence` 視為 unknown，提示為線索。依據：[既有相容決策](/Users/kaiwu/orca/flightwake/.flightwake/DECISIONS.md:44)、[TRAPS 範本](/Users/kaiwu/orca/flightwake/templates/zh-TW/TRAPS.md:10)。另須排除 `{{…}}` 範本條目，現有 registry 確實含有：[TRAPS:143](/Users/kaiwu/orca/flightwake/.flightwake/TRAPS.md:143)。

2. **F5 能可靠判定的是工具與明確路徑，不是自然語言職責。** 可攔直接 Edit/Write 至明列的禁寫路徑；不能把「非文件＝產品程式碼」視為可靠定義：文件可能含可執行 MDX，測試與設定也未必屬於角色禁區。Shell、MCP、子 agent 的副作用不能靠命令字串完整判定。放行宜由使用者明確指令啟動，限定規則／session，顯示持續提示並可撤銷；如此能防誤操作，但不是安全邊界。既有「唯讀失效」證據限於 Codex，根因仍標 probable，不能直接外推 Claude：[TRAPS:50](/Users/kaiwu/orca/flightwake/.flightwake/TRAPS.md:50)。

3. **F3 只記「觀測到的命令完成結果」。** 已知測試命令＋可靠完成事件＋退出碼，才標成功／失敗；timeout、取消、背景工作未完成、結果缺失標 unknown。`test || true`、管線與複合命令不能用整體 exit 0 宣稱測試通過；`npm test` 也要確認 script，不能只看名稱。記錄 cwd、時間及當時 revision／dirty 狀態，避免改碼後沿用舊成功；不推算 passed 數。現有要求是實際數字／輸出／連結：[fw-record:27](/Users/kaiwu/orca/flightwake/skills/zh-TW/fw-record/SKILL.md:27)。

4. **F1 有固定 context 成本，快取也不能消除它。** session 內保持注入內容穩定，有利快取；若反覆更新 system 區段，可能使其後前綴重算。這是依[官方快取原理](https://code.claude.com/docs/en/prompt-caching#how-the-cache-is-organized)推論，實際 mod 插入位置仍須量測。現有 STATE 第 13 行本身就是長篇歷史，單純截取前 N 字會漏掉後方未完事項；應優先保留 health、未完、下一步與原檔指標，並避免 coldstart 再重複全文讀取。[STATE:13](/Users/kaiwu/orca/flightwake/.flightwake/STATE.md:13)、[coldstart:12](/Users/kaiwu/orca/flightwake/skills/zh-TW/fw-coldstart/SKILL.md:12)。

5. **F5 確實屬於「引導工作」，但既有決策允許 opt-in 附加元件。** 不必取消，只需清楚標明例外，維持預設關閉。F1–F4 若只呈現事實、不新增開工門檻，符合原則；F2 不宜演變成派工或規劃建議。[DECISIONS:14](/Users/kaiwu/orca/flightwake/.flightwake/DECISIONS.md:14)、[DECISIONS:17](/Users/kaiwu/orca/flightwake/.flightwake/DECISIONS.md:17)。

**與現況牴觸、風險及漏項**

- **讀取範圍自相矛盾。** 草案只准讀 `.flightwake/` 與 git，卻要求讀 package scripts、CLAUDE.md、舊儀表設定及安裝語言。應明列必要唯讀來源；語言目前記在指令檔 marker，還有 `CLAUDE.local.md` 等位置。[任務:20](/Users/kaiwu/orca/workspaces/flightwake/mods/docs/plans/mods.md:20)、[CLI:101](/Users/kaiwu/orca/flightwake/bin/cli.mjs:101)。
- **F5 漏了角色覆寫契約。** 派工卡與明確子 agent 指派可覆寫主 session 座位；只讀 CLAUDE.md 會誤擋合法 worker。角色變更也約定新 session 才生效。[roles:43](/Users/kaiwu/orca/flightwake/docs/roles.md:43)、[roles:123](/Users/kaiwu/orca/flightwake/docs/roles.md:123)。修改「不宣稱硬限制」定位前，須有 Claude runtime 的實際攔截證據：[DECISIONS:11](/Users/kaiwu/orca/flightwake/.flightwake/DECISIONS.md:11)。
- **載入描述大致正確，但驗收不足。** 官方確認主工作目錄、精確資料夾信任及個人副本優先；另有 `defaultEnabled`／設定覆寫，`-p` 本身不能代替信任，同名 marketplace 或 session 外掛也可能遮蔽專案副本。因此 validate／unit test 通過不代表真的載入。[官方載入文件](https://code.claude.com/docs/en/plugins/loading#plugins-shared-through-a-repository)、[名稱優先序](https://code.claude.com/docs/en/plugins/loading#name-conflicts)。
- **F2 要對齊完整落後語意。** 不只扣 bot，還包含 STATE dirty 視為正在更新、未 commit 基線不計；錯誤不能顯示成「同步」。[state-check:63](/Users/kaiwu/orca/flightwake/hooks/state-check.mjs:63)。舊儀表「檔案存在」也不等於有效啟用；本階段宜偵測有效設定後讓 mod 自行隱藏重複欄位，不改使用者設定。
- **缺生命周期與歸屬測試。** 補 `/clear`、resume、compact、reload、切工作目錄、worktree、子 agent、外部程序改檔／commit、並行事件與单一模組拋錯。F3 不能把 git 看見的所有變更都算成本 session；F4「一次提示」至少應以條目版本去重，避免修正後仍被抑制。持久資料須定義隔離鍵、大小上限、清除方式及敏感命令參數處理。[record 脫敏要求](/Users/kaiwu/orca/flightwake/skills/zh-TW/fw-record/SKILL.md:29)。

**我會刪減／簡化，以及考慮但不採用的做法**

- 保留五個功能開關；F5 首版縮至明確工具／路徑規則。**不採自然語言 Never 自動編譯成權限，也不採 shell 黑名單冒充全面守門。**
- F3 首版只保存 session 內必要事件；**不先建跨 session 歷史資料庫**，目前沒有明確消費者，且會增加脫敏與過期問題。
- F4 採簡單 glob／token 前綴；**不採 regex DSL、語意分類器或批次遷移舊 TRAPS**。
- F1 採一次穩定快照；**不每回合重讀並重寫 system prompt**。F2 自行避讓舊儀表；**不自動移除／覆蓋 statusLine**。[既有儀表決策](/Users/kaiwu/orca/flightwake/.flightwake/DECISIONS.md:35)。

**未驗證部分：**未執行 Claude、載入 `plugin-authoring`、查本機型別契約，亦未跑 validate、plugin test、smoke、typecheck、真機攔截或 token/cache 量測。因此 ≥2.1.287、`$.state`、UI／事件 API 與測試命令的可用性仍待實證；第一階段分支與合併衝突也未審查。上述是規格及現況的唯讀審查，不是實作驗收。
