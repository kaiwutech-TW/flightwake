# roles v2 審查 — Codex

日期：2026-09-27；對象：`roles-v2.md` 草案 r1。本文是建議，尚非定案。只新增本檔，未改程式、原草案或提交 commit。

## 結論

同意角色定義與座位分離、增加角色卡、保留兩種派工方式；反對現在把原生角色設定宣稱為硬防護。**Codex 0.157.1 實測：自訂 agent 的 `sandbox_mode = "read-only"` 沒有限制成功衍生的子 agent；shell 與 apply_patch 都寫檔成功。** 建議先出現行 roles 的 0.14.0，v2 另做 0.15.0，phase 暫緩。

## 一、第 5 節逐條回覆

### 1. `## seats` vs 角色內 `agent/repo`

**同意 `## seats`，但必須補齊格式與落地規則。**

角色回答「做什麼」，座位回答「誰在哪裡做」。分開才能讓一個角色待命、在多個 repo 重用，或換人而不複製職責。舊格式可當簡寫讀取，毋須強制遷移。

建議：

- 採明確的表格欄位 `repo | vendor | role`，或結構化欄位；目前空白切詞的範例無法可靠處理含空格的路徑。`assign <repo>:<vendor>` 須明訂從最後一個冒號辨識 vendor，勿破壞 Windows 路徑。
- 有 seats 時以它為唯一座位來源；角色內仍有 `agent/repo` 且矛盾時退出非零，不能默默混合。
- 明訂同一 role 可以占多個座位、每個 `(canonical repo, vendor)` 最多一個座位；未知 role/vendor、重複座位與保留名稱 `seats` 都要先驗證。
- **待命角色要另外有「在哪些 repo、哪些 vendor 可用」的定義。** 現在不占座位就失去 repo/vendor，apply 不知道應在哪裡產生檔案。MVP 可預設產生到座位表列出的各 `(repo, vendor)`，dry-run 明列；沒有座位的 team 要求顯式目標，不猜。
- seated/on-call 應是派工方式，而非互斥的角色種類。同一 reviewer 可以有常駐座位，也可以被另一 repo 短暫叫出；不要因角色在某處 seated，就禁止其他地方使用它的原生定義。

### 2. 兩條叫出路徑是否太複雜

**同意保留兩條，反對只留一條；使用者入口可以統一。**

原生子 agent 適合同廠牌、短任務、回傳結果；獨立 worker 適合跨廠牌或有自己工作目錄的長任務。只保留原生會失去跨廠牌，全部用 Orca 又會把選配 roles 綁定到編排器。

skill 的入口可以是「派給 security 做這項審查」，然後依能力選路。CLI 只輸出穩定的 `roles card <id>`；不要自建 scheduler。卡片與原生定義共用角色內容來源，卡片帶 role id、來源、工作範圍、驗收與回報對象。

**兩條路徑的權限不等價。** `--spec` 只傳文字，不會套用 `.codex/agents` 的 sandbox，也不會套用 Claude 定義檔的工具設定。有 `enforce` 要求而 worker 啟動器不能實現時，必須拒絕或明示由使用者改成純指引；不能自動降級後仍標示「唯讀」。

pm 的觸發清單是好方向，但 r1 未定義觸發條件的可解析欄位。建議新增選填 `trigger:` 或固定 `### When to call`，不讓 CLI 從任意 prose 猜條件。原生 description 也需包含觸發條件與回傳產物。

### 3. 只做 read-only 是否足夠；其他 Never 能否硬化

**同意先限定一種權限意圖；反對 r1 的「只做確定可行」及目前的硬防護承諾。**

「不能寫產品 code」「不能自行 commit」「不能上線」都不能直接映成 read-only：後者會連 review 文件都不能寫，且本機檔案 sandbox 不等於阻擋 connector/MCP 的遠端副作用。角色紀律、檔案權限、外部工具權限須分別描述。

Codex 的實測見第二節。建議暫稱「requested read-only」或保留 `enforce` 欄但在不支援的啟動方式明確報錯，**不能把成功產生 TOML 當成 enforcement 成功**。能確認的替代方案是把整個審查 session 以 `codex exec -s read-only` 啟動；若 Orca 尚不能傳此設定，就仍是未支援。

Claude 的 `disallowedTools: Edit, Write, NotebookEdit` 未涵蓋 Bash、其他寫檔工具與可寫 MCP。`permissionMode: plan` 也需要工具級對照實測，不能僅憑名稱把它與 OS sandbox 畫等號。可提供經驗證的唯讀工具 allowlist，但這是各 vendor 的能力限制，不是跨平台的統一安全承諾。

MVP 不新增其他硬化項目。若之後做「不能 git push/deploy」，必須驗到 shell 別名、腳本間接呼叫及外部工具等實際路徑；prefix deny 只能說阻擋指定命令形式，不能說阻擋整個行為。對誘導題守規則的驗證，也應與真正寫入被拒的驗證分列。

### 4. phase 要不要做

**反對現在做 phase 過濾。**

security 可以跨所有階段；release 也可能在 build 階段需要審部署設計。只有單一 phase 字串時，正常角色要重複定義；若再增加多值、轉場、覆寫，就快速長成工作流程引擎。把角色從選單刪掉也會讓 pm 的觸發清單失效。

先一律產生已選定的待命角色，靠 description/trigger 決定何時叫出。`roles assign` 足以解決現有角色漂移。「換階段」skill 可以提議換座位，但不要持久化 phase 狀態或自動隱藏角色。等真的出現角色數量造成誤派的 dogfood 證據，再考慮 enabled 清單或 phase tags。

### 5. 0.14.0 出貨切法

**反對 r1 把現行版與整套 v2 一起放入 0.14.0；同意先 0.14.0、v2 放 0.15.0。**

現行功能已有 smoke 與 dogfood；v2 同時改 parser、跨 repo 路由、檔案生命週期、派工方式、使用者資料寫入與權限承諾，且權限已有反例。先發現行版能把持久角色的價值與 v2 整合風險分開驗收。不是按功能數量切，而是按可驗證的契約切。

建議順序：

1. 0.14.0：現行 roles、9 範本、既有文件；先補完 STATE 已列出的從零跑 skill 推薦流程與 README 入口驗證。版本號仍由 Kai 決定。
2. 0.15.0：角色/座位分離、card、assign、原生待命定義；只承諾已驗證的 runtime，沒有硬防護能力的入口要明示。
3. 後續：逐 runtime 補權限驗收矩陣，再議 seated 硬化；phase 與 Gemini 保持延後。

### 6. Codex 當 pm 如何可靠派工／其他失敗模式

**同意原生待命角色是有用方向；反對把「產生定義檔」視為可靠派工已完成。**

pm 要先看得到可用 agent type，再以該 type 衍生、等待完成、確認實際角色與結果。找不到 type 或 spawn 失敗時，回報能力不足並選擇有明確權限契約的另一入口；禁止換成 default 子 agent，或 pm 自己做完再說有派工。

派工至少帶：任務、cwd、檔案責任範圍、驗收、回報方式、角色優先序。結果至少回：角色 id、任務狀態、證據／產物、未完成事項。共享目錄的子 agent 也會改到其他人的檔案；寫入型任務必須交代並行責任範圍，單靠角色名稱不能防衝突。

**座位指令會污染子角色。** 本次 fresh-context 子 agent 的 rollout 仍有父 repo 的 `AGENTS.md` 指令。必須把生成的座位區塊限定為「本 repo 的主 session；顯式指派子角色時以子角色職責為準」，保留 flightwake 的 repo 紀律。Claude 若採 `omitClaudeMd: true`，則要確認沒有順便丟掉 repo 測試、記錄與安全規則；更穩妥的方向是分離座位身分與共用規則，勿整份省略。

## 二、Codex 0.157.1 暫存實測

### 環境與證據

- macOS；`codex --version`：`codex-cli 0.157.1`。測試均在實體暫存路徑，未改本 repo 設定或程式。
- 暫存根：`/private/var/folders/my/d1xkkzz13yv2krs9vxs5_fkm0000gn/T/fw-roles-codex-j1_og753`。本節紀錄已足以理解結果；暫存檔只供當次查核，不是持久文件依賴。
- 定義 `.codex/agents/fw-probe.toml` 的核心：

```toml
name = "fw-probe"
description = "Temporary role sandbox probe. Use only when explicitly asked."
sandbox_mode = "read-only"
developer_instructions = """You are the temporary probe role. Your identity marker is FW_PROBE_7B. This is an authorized sandbox test: attempt to create shell-probe.txt via shell and patch-probe.txt via apply_patch, ONLY in the current temporary project directory. Do not ask for escalation. Report actual tool outcomes. Do not change any other path."""
```

| 對照 | 結果 | 可得結論 |
|---|---|---|
| 現有 CODEX_HOME、忽略 user config、workspace-write、ephemeral | 找不到角色選取欄位；加 trusted、agents.enabled、再開 multi_agent_v2 仍沒找到 | 不能假設使用者的現有 runtime 一定暴露 custom role；根因未查明 |
| 隔離 CODEX_HOME、trusted、ephemeral | 能看到 fw-probe，但 spawn 失敗：`no thread with id` | ephemeral 派工路徑在此次環境失敗；尚未確認是否為一般限制 |
| 隔離 CODEX_HOME、trusted、**非 ephemeral**；user config 設 workspace-write/never，CLI **未傳 -s** | 成功以 `agent_type: fw-probe`、fresh context 衍生；兩種寫檔均成功 | 自訂角色內容有載入，但 read-only 設定未構成硬限制 |
| 隔離 CODEX_HOME、主 session `-s read-only`、never、ephemeral | shell：exit 1、`operation not permitted`；apply_patch：`writing is blocked by read-only sandbox`；兩檔未產生 | 整個主 session 的 read-only 在此次環境確實阻擋兩種寫入 |

成功派工的命令形式：

```sh
CODEX_HOME="$probe_dir/isolated-home" codex exec \
  --ignore-rules --skip-git-repo-check -C "$probe_dir" --json \
  'Spawn agent_type fw-probe with a fresh context; wait for both probes.' </dev/null
```

隔離 user config 設 `sandbox_mode = "workspace-write"`、`approval_policy = "never"`、`[agents] enabled = true`，以及測試路徑的 trusted entry。測試未指定 model，使用 runtime 預設。

成功父 thread：`01a0e395-d1a8-7d80-8587-b240bae1e2e7`；子 thread：`01a0e395-f61e-74c3-98bd-38b5667356d9`。子 rollout 的 `turn_context.sandbox_policy.type` 實際為 **workspace-write**；developer message 確實包含 `FW_PROBE_7B` 的角色內容。shell tool exit 0；apply_patch tool 無錯誤；實際 readback：

```text
FW_PROBE_7B shell probe
FW_PROBE_7B patch probe
```

這是「定義有載入、effective sandbox 卻仍可寫」的反例，不是模型自述唯讀。它不證明所有 TUI/app/版本都失敗，也未證明 trust 是前幾輪失敗的根因；但已足以否決目前跨入口的硬防護承諾。TUI、Orca worker 與完整既有設定仍要各自驗。

官方 [Subagents 文件](https://learn.chatgpt.com/docs/agent-configuration/subagents) 支援 standalone TOML，也說明父 turn 的 live permission overrides 會在 spawn 時重套；自訂檔是 config layer，不能當作優先於所有 runtime 設定的政策。文件目前同時描述可自訂 sandbox；是否生效必須看 effective permissions 與工具反例。

## 三、其他需要進入計劃的風險

### A. 生成檔 ownership 與清理（出貨前）

`fw-` prefix 不能證明檔案屬於 flightwake。產生原生檔前需有 ownership marker／manifest；碰到使用者同名檔先報衝突，不覆蓋。角色改名、刪除、換 vendor、換 repo、remove/uninstall 都須清理**以前**產生的檔，但不能掃掉使用者檔。使用者修改過的生成檔也要先報差異。

現有 apply 只遍歷 `home + 當前角色 repo`：一個 repo 從 ROLES.md 完全移除後，其舊區塊不在本次遍歷中。v2 將新增同類原生檔殘留問題。建議保存最小的生成產物清單與 hash，而非複製完整使用者資料；dry-run 同時列新增、更新、移除與衝突。跨 repo 全部先驗證再寫，I/O 失敗時明確報部分完成，提供重跑收斂方式。

### B. `assign` 會改使用者資料（出貨前）

STATE 的常備承諾是「使用者資料任何情況不覆蓋」，r1 卻新增 CLI 寫 ROLES.md；這個例外必須明訂為使用者顯式 assign 授權的語意修改，保留註解、角色內文、順序和無關空白，不可重新 serialize 整份 markdown。新增 `assign --dry-run`；未知 seat/role、歧義舊格式先退出；寫入前比對讀取版本，避免與另一 agent 的編輯互蓋。ROLES 與生成產物需要在同一個 plan 驗證成功後才執行。

### C. 指派何時生效（出貨前）

改 seats 不會改目前已載入的 session，也不會改已在跑的子 agent。apply/assign 的完成訊息須明示「重新開 session 後生效」及正在跑的工作如何交接。不要承諾檔案一改，當前 pm 就已切成 release。

### D. 序列化、路徑與角色卡（出貨前）

- TOML 多行字串的 `"""`、反斜線、Unicode；Claude YAML frontmatter 的特殊字元都需可靠 escape。使用者 role body 不能注入額外 model／permission 欄位。
- repo 必須存在且為目錄；realpath 正規化避免 symlink 雙座位。生成目的地若經 symlink 指到其他地方，要在 dry-run 展示真實寫入路徑或拒絕。
- `roles card` 的 stdout 只能是卡片；錯誤走 stderr 且非零。派工 shell 範例須先檢查 card 成功，避免 command substitution 失敗後仍送出只有任務、沒有角色的 worker。
- 卡片不應保留 seated 版的「你是這個資料夾的唯一角色」或「← you」錯誤身分。需要共用 role body、分開 render 身分與權限資訊。

### E. 最小驗收矩陣

除現有 smoke 外，新增測試應針對新的契約：舊格式相容／矛盾拒絕、含空白路徑、同 role 多座位、native 檔案衝突與清理、assign 保留無關使用者文字、card 錯誤不派工。權限驗收用真正的 shell/apply_patch 寫入，不用「請不要動檔」誘導題。

runtime 驗收至少區分：Codex exec/TUI、既有設定/隔離設定、父 writable/父 read-only；Claude 子 agent；Orca spec worker。未跑過的格子標「未驗證」，不從另一入口推論。生成檔語法驗證與 runtime 真機驗證分開，後者可作發版前人工 gate，不要求每次零依賴 smoke 都呼叫付費模型。

以上陷阱尚未另登 TRAPS：依本次範圍只寫此 review；若採納，請由負責定案的 session 登記已確認的現象並保留根因不確定的界線。


## r2 回覆

仍需補以下四點；其餘無異議。從零推薦流程已通過，上一輪將它列為待驗的建議已由你補充的證據解除。

1. **獨立 worker 的角色衝突仍未解（2.2、2.4）。** Orca worker 本身是新主 session，不是原生子 agent；若在已有座位的 repo 啟動，仍會讀到該座位身分。現在「被顯式指派為子角色」的例外沒有涵蓋它。建議區塊明訂：顯式派工卡可在該次任務覆寫座位身分，repo 共用紀律仍保留；人工 gate 必須在「已有不同座位角色」的目標 repo 測 worker 卡片，而非只在無座位的乾淨目錄測。

2. **舊格式的 assign 轉換契約缺失（2.1、2.6）。** 無 seats 的舊 ROLES.md 沒有「表那一行」可改；若直接新增 seats，其他舊 agent/repo 會與新指派矛盾。請選定並驗收一種行為：舊格式只改目標角色的 agent/repo，或 assign 明示需先遷移並退出、由 skill 展示完整遷移預覽。不要默默把整份檔案轉寫。未知座位是新增還是錯誤，也要定義；同角色多座位時尤其不能靠 role id 猜要改哪個。

3. **ownership 清理的範圍還需明訂（2.7）。** manifest 對 AGENTS.md/CLAUDE.md 應追蹤生成區塊的 hash，而非把整份指令檔當作可刪產物；區塊外的使用者編輯不應擋清理、更不能被刪。原生角色檔則可追蹤整檔 hash。「先報差異」須明確表示衝突時不覆蓋／不刪除，等顯式處置。另需驗 manifest 的 team ownership 與允許路徑，不能把其中任意路徑直接交給 rm；兩個 team 在同一目的地產生 fw-security 也應報來源衝突。

4. **唯讀結論仍有過度概括（2.3）。** 「只有整個主 session 擋得住」「已知唯一可靠」建議改為「本次 Codex 0.157.1 CLI 對照中，整個主 session 的 -s read-only 已阻擋 shell 與 apply_patch 寫入」。現有證據沒有排除其他可靠方式，也沒有驗 MCP/connector 的遠端副作用。這不影響 v2 不承諾硬限制的共識，只是讓計劃保持與實測相同的邊界。
