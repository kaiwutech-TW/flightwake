# roles v2 計劃(r3 定案 — Claude 起草、Codex 兩輪審查)

> 工作文件,定案後結論進 DECISIONS。r1 → Codex 審查(`roles-v2.review-codex.md`)→ 本版 r2。
> r3 變更:整合 Codex「r2 回覆」四點(worker 卡片覆寫座位身分、舊格式 assign 契約、manifest 範圍、唯讀結論的邊界)。
> r2 變更摘要:放棄「定義檔 = 硬限制」;v2 延到 0.15.0;phase 不做;補 ownership/清理、assign 寫入規則、座位區塊範圍、角色卡契約、驗收矩陣。

## 0. 問題(不變)

1. 階段性角色(security/designer/release/qa)沒位子。
2. 座位的實際工作會漂移,沒有乾淨的重新指派。
3. 禁止事項只是提示文字。

## 1. 出貨切法(已共識)

- **0.14.0 = 現行 roles**(座位區塊 + 9 範本 + fw-roles skill + 四語文件),不含任何 v2 內容。
  fw-roles 從零推薦流程已於 2026-09-27 在暫存雙資料夾團隊實跑:掃描→推薦→預覽→客製(有界例外)→dry-run→apply→四角色誘導題 4/4
  (見 records/260927-roles-addon 後續補記);STATE 的對應待辦要更新。
- **0.15.0 = v2**:角色/座位分離、`roles card`、`roles assign`、待命角色原生定義檔。**只承諾已驗證的 runtime 行為**。
- **不做(延後,需 dogfood 證據)**:phase、座位硬化、Gemini 定義檔、任何 path 級 deny。

## 2. v2 設計

### 2.1 角色與座位分離
- `ROLES.md` 角色定義格式不變;新增選填 `### When to call`(給 pm 觸發清單與原生 description 用,CLI 不從 prose 猜條件)。
- 新增 `## seats` **表格**:`| repo | vendor | role |`(表格,不是空白切詞——路徑可含空白)。
  - 有 seats 時它是唯一座位來源;角色內仍有 `agent/repo` 且與 seats 矛盾 → 退出非零。無 seats → 舊格式照讀(每個角色內的 agent/repo 視為一個座位)。
  - 同一角色可占多個座位;每個 `(realpath(repo), vendor)` 最多一個;未知 role/vendor、重複座位、保留名稱 `seats` 先驗證。
- **seated / on-call 是「派工方式」,不是互斥種類**:任何角色都可被當待命叫出,即使它在別處有座位。

### 2.2 待命角色的落地
- 原生定義檔產生到**座位表出現過的每個 (repo, vendor)**:`.claude/agents/fw-<id>.md`、`.codex/agents/fw-<id>.toml`;dry-run 明列。沒有座位的 team 需顯式指定目標,不猜。
- 兩條叫出路徑都保留,skill 提供單一入口「派給 <role> 做 X」後依能力選路:
  - 同廠牌短任務 → 座位 agent 原生衍生子 agent。
  - 跨廠牌或長任務 → pm 用 Orca `worker-start --spec`,spec 前面接 `roles card <id>` 的輸出。
- pm 衍生/派工的最低契約:先確認可用 agent type;spawn 失敗 → 回報能力不足,**禁止**改用 default 子 agent 或自己做完。派工帶:任務、cwd、檔案責任範圍、驗收、回報方式;回報帶:角色 id、狀態、證據、未完成。

### 2.3 權限:只講實話
- **v2 不宣稱任何硬限制**。Codex 0.157.1 實測:custom agent `sandbox_mode="read-only"` 未約束衍生子 agent(子 rollout effective sandbox = workspace-write,shell 與 apply_patch 皆寫入成功);只有整個主 session `-s read-only` 擋得住。Claude 的 `disallowedTools` 也不涵蓋 Bash 與可寫 MCP。
- 角色欄位若有權限意圖,文件與產出一律標「guidance(非強制)」;將來要做強制,逐 runtime 補權限驗收矩陣(Codex exec/TUI × 既有/隔離設定 × 父 writable/read-only;Claude 子 agent;Orca worker)後才承諾,未跑的格子標未驗證。
- 已觀察到的有效唯讀:本次 Codex 0.157.1 CLI 對照中,整個主 session 以 `-s read-only` 啟動已阻擋 shell 與 apply_patch 寫入。這不排除其他方式,也未驗證 MCP/connector 的遠端副作用。Orca 目前無法對 worker 傳此參數 → 文件寫明。

### 2.4 座位區塊不污染子角色
- 座位區塊文字限定為「本資料夾**主 session** 的角色;被顯式指派為子角色時,以子角色職責為準」,保留 flightwake repo 紀律(測試、記錄、安全規則)。
- Orca worker 是**新的主 session**(不是原生子 agent),在有座位的 repo 啟動仍會讀到座位身分 → 座位區塊明訂:**顯式派工卡可在該次任務覆寫座位身分**,repo 共用紀律仍保留。人工 gate 必須在「已有不同座位角色」的 repo 測 worker 卡片。
- 不採 `omitClaudeMd: true`(會連 repo 共用規則一起丟)。

### 2.5 `roles card <id>`
- stdout 只有卡片;錯誤走 stderr 且非零。文件的派工範例先檢查 card 成功再送,避免送出沒有角色的 worker。
- 卡片與原生定義共用角色 body,但**不帶**座位身分(不寫「本資料夾的 X」「← 你」);帶 role id、來源、When to call、回報對象。

### 2.6 `roles assign <repo>:<vendor> <role-id>`
- vendor 從**最後一個冒號**切(Windows 路徑安全)。只以座位 `(repo, vendor)` 定位,不以 role id 猜(同角色多座位時才不會改錯)。
- **舊格式(無 seats 表)**:assign 退出非零並說明需先遷移;遷移由 fw-roles skill 展示完整預覽(角色內 agent/repo → seats 表)、使用者確認後才寫。CLI 不默默轉寫整份檔。
- 座位不存在 → 預設錯誤;要新增座位須顯式 `--add`。
- 寫 ROLES.md 是使用者顯式授權的例外:只改 seats 表那一行,保留註解/內文/順序/空白,不重新 serialize;支援 `--dry-run`;寫入前比對讀取時的內容(防與另一個 agent 互蓋);與產物更新同一個驗證計畫,全部驗證成功才寫。
- 完成訊息明示「**新 session 後生效**」與進行中工作如何交接;不寫 DECISIONS(由 fw-roles skill 補 why)。

### 2.7 產生檔 ownership 與清理
- 產生的原生檔帶 ownership marker;另存最小 manifest(放 `.flightwake/`):指令檔(AGENTS.md/CLAUDE.md)只追蹤**產生區塊**的 hash,整份檔永遠不是可刪產物,區塊外的使用者編輯不擋清理也不被動;原生角色檔追蹤整檔 hash。
- manifest 帶 team 來源(ROLES.md 路徑);清理只刪 manifest 內、且位於允許目錄(`.claude/agents/`、`.codex/agents/`)的路徑,不把任意路徑交給 rm。兩個 team 在同一目的地產生同名角色檔 → 報來源衝突。
- 同名使用者檔或使用者改過的產生檔 → 報衝突,**不覆蓋、不刪除**,等使用者顯式處置。
- 角色改名/刪除/換 vendor/換 repo、remove、uninstall:依 manifest 清**以前**產生的檔,不掃使用者檔。這也修掉現行 apply 的既有問題:repo 整個從 ROLES.md 移除時舊區塊不在遍歷範圍。
- 跨 repo:全部先驗證再寫;I/O 失敗明確報部分完成,重跑可收斂。

### 2.8 序列化與路徑
- TOML 多行字串(`"""`、反斜線、Unicode)與 YAML frontmatter 可靠 escape;role body 不能注入額外 model/permission 欄位。
- repo 需存在且為目錄;realpath 正規化;產物路徑經 symlink 指到他處 → dry-run 顯示真實路徑或拒絕。

## 3. 驗收

- smoke(零依賴、不呼叫模型):舊格式相容/矛盾拒絕、含空白路徑、同角色多座位、原生檔衝突與清理、assign 保留無關文字、card 錯誤不派工、序列化 escape。
- 發版前人工 gate(真機):Codex/Claude 各自衍生待命角色一次、Orca spec worker 帶卡一次;誘導題(守規則)與權限(真的被擋)分開列,後者在 v2 預期為「未強制」。

## 4. 仍待決(r3 起 Codex 無其他異議)

- `### When to call` 是否要在 0.14.0 範本就先加(不影響 CLI,讓 0.15.0 有資料可讀)?傾向:0.14.0 先不動範本,避免擴大已驗收範圍。
- 手上真實團隊(下游 repo)的 tech-lead 漂移:0.15.0 前先用現行方式改 ROLES.md 手動處理。

## 來源

見 r1 來源清單;Codex 審查與暫存實測紀錄:`docs/plans/roles-v2.review-codex.md` 第二節。
