# roles v2：Codex 0.157.1 真實環境實測

日期：2026-09-28（Asia/Taipei）。目的：供合併至 0.14.0 的 roles v2 實作使用。測試使用 Kai 原本的 `~/.codex`，未切換 CODEX_HOME。測試材料全部放在 `~/fw-codex-probe-tmp/`，本 repo 只新增本報告，未改程式、未 commit。

## 結論

**真實 CODEX_HOME 可以載入並衍生專案自訂角色。上輪的核心障礙是專案未真正受信任，並非必須隔離 CODEX_HOME。** 本輪找到並對照驗證：

1. `~/` 已受信任，不代表其下新建的 **Git repo** 也受信任。
2. `-c 'projects."/path".trust_level="trusted"'` 在這版會產生包含引號字元的錯誤 key；改用 TOML inline table 才正確作用於目標路徑。
3. 正確信任後，一般 exec、ephemeral exec、TUI（shared daemon 與 `--no-daemon`）均成功。
4. `agents.enabled=false` 會讓 spawn 工具消失。單獨 `--disable multi_agent` 或 `--disable multi_agent_v2` 在本輪仍能衍生，不應用這兩個 feature flag 判定能力。
5. TOML 的未知欄位不是安全地忽略該欄：它會使**整份角色定義不被載入**，但主 session 仍可能 exit 0。
6. reviewer 座位下衍生的 `fw-security` 自認 security；Orca 獨立 worker 的 security 卡片也成功覆寫座位，且保留共用 repo 規則。

Confidence：上述均為 **confirmed（本機版本、本輪測試條件）**；不推論其他版本、帳號或作業系統。

## 環境與共用 fixture

```text
codex --version                    → codex-cli 0.157.1
codex app-server daemon version     → CLI / managed / running server 都是 0.157.1
orca status --json                 → appVersion 1.4.215，runtime ready
CODEX_HOME                         → 未設定；使用 /Users/kaiwu/.codex
```

現有 user config 沒有 `[agents]`；features 明列 hooks、js_repl、memories、chronicle，未顯式設定 multi_agent 或 multi_agent_v2。`[projects."/Users/kaiwu"]` 已是 trusted。

每個測試 fixture 都是測試根目錄內獨立 `git init` 的 repo，沒有 commit。基本角色檔：

```toml
# .codex/agents/fw-security.toml
name = "fw-security"
description = "Security specialist. Use for requests to audit authentication, payments, or personal data. Identity test marker FW_DESC_923."
developer_instructions = "You are security, role marker FW_SECURITY_923. Answer identity questions with your actual role, shared repo rule marker if present, and your effective sandbox. Do not change files or call external services."
```

座位 fixture：

```markdown
<!-- flightwake-roles:begin v0.14.0 -->
# Your role: reviewer
This seated identity applies to the primary session. When explicitly dispatched to a custom subagent role or given an explicit role card, use that task role instead. Shared repository rules still apply.
Never modify product code. Shared rule marker: FW_SHARED_923. Report your role honestly.
<!-- flightwake-roles:end -->
```

以下命令用 `probe_root=/Users/kaiwu/fw-codex-probe-tmp`；`$case_dir` 是其中該列 fixture 的絕對路徑。所有 `exec` 均以 `</dev/null` 關閉 stdin，模型未要求寫檔或變更設定。

## 1. 何時會發現、何時能衍生

### 1.1 信任與上輪失敗的原因

**命令與對照**：

```sh
# A：只有既有的 ~/ 信任
codex exec -C "$probe_root/repo" -s read-only --json "$probe_prompt" </dev/null

# B：上輪使用的寫法，有問題
codex exec -C "$probe_root/repo" -s read-only \
  -c 'projects."/Users/kaiwu/fw-codex-probe-tmp/repo".trust_level="trusted"' \
  --json "$probe_prompt" </dev/null

# C：正確的單次啟動 override；不寫入 user config
codex exec -C "$probe_root/repo" -s read-only \
  -c 'projects={"/Users/kaiwu/fw-codex-probe-tmp/repo"={trust_level="trusted"}}' \
  --json "$probe_prompt" </dev/null
```

`probe_prompt` 要求：以 `agent_type=fw-security`、fresh context 衍生一次，等待身分與共用 marker；不可換成 default，不可自己代做，找不到時回報選取欄位。

另用本機 `codex app-server --stdio` 查設定，不呼叫模型：initialize → initialized →

```json
{"id":2,"method":"config/read","params":{"cwd":"/Users/kaiwu/fw-codex-probe-tmp/repo","includeLayers":true}}
```

**結果**：

| 條件 | 設定層證據 | 模型／工具結果 |
|---|---|---|
| A | project layer 的 disabledReason 要求信任該 Git repo 的精確路徑 | spawn schema 只有 task_name/message/fork_turns/model/reasoning_effort，沒有 agent_type |
| B | effective projects 的 key 實際是 `\"/Users/kaiwu/fw-codex-probe-tmp/repo\"`，包含引號；project layer 仍 disabled | 同 A |
| C | 正確的路徑 key；project layer 的 disabledReason 為 null | agent_type 可用，fw-security 成功衍生並回傳 FW_SECURITY_923 與 FW_SHARED_923 |

B 的錯誤不是 shell 把引號吃掉：`config/read` 已直接顯示它被留進 key。加開 multi_agent、multi_agent_v2、agents.enabled 也不能補救一個仍未受信任的專案。

**結論**：對本輪「沒有角色選取欄位」，精確 project trust 是已確認的原因；隔離 CODEX_HOME 只是上輪碰巧提供正確 trust entry 的不同設定環境。先看有效 project layer 是否載入，再查角色檔的解析診斷。這不代表所有「沒有 agent_type」都由 trust 造成；後面的壞 TOML 也能造成相同表象。

Confidence：**confirmed**。關鍵 thread：A `01a0e3a0-89a4-7a02-a4a2-2a6684415cff`；B `01a0e3a1-22c9-7fa1-bd39-a4bf9d090a0a`；C `01a0e3a2-8dc8-7d42-b5f7-10c631d1f897`。

### 1.2 features、agents.enabled、ephemeral、TUI

**命令**：每個 case 複製相同 fixture，使用正確 inline trust。exec 基底：

```sh
codex exec -C "$case_dir" -s read-only \
  -c "projects={\"$case_dir\"={trust_level=\"trusted\"}}" \
  [該列額外旗標] --json "$probe_prompt" </dev/null
```

**結果**：

| 額外條件 | 結果 | thread |
|---|---|---|
| 無；也沒有專案 `.codex/config.toml` | 成功；不需先寫 `[agents] enabled=true` | `01a0e3a3-af66-7240-a6f7-5583c027c454` |
| `--ephemeral` | 成功 | `01a0e3a3-b0a8-7ba1-8c93-dd0d4207a54f` |
| `--disable multi_agent` | 仍成功 | `01a0e3a3-af6d-75d1-bee8-d506738454f3` |
| `--disable multi_agent_v2` | 仍成功 | `01a0e3a3-f40a-74b1-8b30-d95ce5a62460` |
| `-c agents.enabled=false` | spawn 工具不可用，沒有衍生 | `01a0e3a3-efe4-7d72-b165-92372867fef1` |

TUI 使用 PTY 啟動，讀取完成答案後 `/exit`：

```sh
codex --no-alt-screen -C "$case_dir" -s read-only -a never \
  -c "projects={\"$case_dir\"={trust_level=\"trusted\"}}" "$tui_probe_prompt"

# 第二個對照只多此旗標：
codex --no-daemon --no-alt-screen -C "$case_dir" -s read-only -a never \
  -c "projects={\"$case_dir\"={trust_level=\"trusted\"}}" "$tui_probe_prompt"
```

兩者都完成 fw-security 衍生；TUI 原始 thread 紀錄也顯示 security 身分及共用 marker。shared daemon：`01a0e3a7-210b-7f63-93f0-5afa1799311f`；no-daemon：`01a0e3a5-5817-7fd3-a500-940bfa1f7c76`。

**結論**：本輪不用改動真實 multi-agent 設定。0.157.1 上用 `agents.enabled` 判定是否禁用，並以實際 agent_type 清單與成功 spawn 為驗收。上輪隔離環境的 ephemeral `no thread with id` 沒有在本輪重現，不能把「必須非 ephemeral」寫成需求；該次錯誤的更深層原因仍未定。

Confidence：矩陣結果 **confirmed**；feature flag 在其他 runtime 是否全部等同無效，**未驗證**。

## 2. TOML 欄位與 description

### 2.1 實際接受、拒絕與生效的界線

**命令／測法**：每份 agent 檔都包含基本三欄，逐份加入下表一個欄位，用該 repo 的正確 trust 啟動：

```sh
codex app-server --stdio -c "projects={\"$case_dir\"={trust_level=\"trusted\"}}"
```

經 initialize 後送 `thread/start`（cwd、ephemeral=true、sandbox=read-only、approvalPolicy=never），記錄 **stderr 的角色解析診斷**。另將有效設定組合與無效設定置於同一 repo，用 `codex exec ... --json` 逐一真的 spawn；不能只看 thread/start 成功與否。

| 額外欄位／值 | 實測結果 | 可承諾的範圍 |
|---|---|---|
| `model = "gpt-6-astra"` | 接受且成功 spawn；子 turn_context.model 為該值 | 字串欄位可用；未窮舉模型可用性 |
| `model_reasoning_effort = "low"` | 接受；父 medium、子 low | 確認 override 生效 |
| `sandbox_mode = "read-only"` | 接受；本輪父也是 read-only，子 effective read-only | 僅證明接受；不推翻上輪 writable 父下的反例 |
| `approval_policy = "never"` | 接受；子 effective never | 本輪父也 never，沒有證明可壓過父 runtime override |
| `nickname_candidates = ["FieldProbe"]` | 接受；子 session_meta.agent_nickname 為 FieldProbe | 確認生效 |
| `[mcp_servers.fw_disabled_probe]` 下 `command="false"`、`enabled=false` | 接受，組合角色可 spawn | 驗到設定接受；未連外、未測 MCP 權限隔離 |
| `[[skills.config]]` 下 `path=".../nonexistent/SKILL.md"`、`enabled=false` | 接受，組合角色可 spawn | 驗到 disabled entry 的接受；未測完整 skills 覆寫語意 |
| `model = 17` | 角色被忽略：`invalid type: integer 17, expected a string` | 型別錯誤會使角色消失 |
| `sandbox_mode = "banana"` | 角色被忽略；錯誤列出 read-only/workspace-write/danger-full-access | 有 enum 驗證 |
| `approval_policy = "banana"` | 角色被忽略；unknown variant | 有 enum 驗證；不代表 enum 裡每個舊值都建議使用 |
| `model_reasoning_effort = "banana"` | 角色可進入選取流程，spawn 時拒絕：該模型不支援此 effort | 語法接受不代表 runtime 能啟動 |
| `mcp_servers.probe.command = 17` | 角色被忽略；expected a string | 有巢狀型別驗證 |
| `skills = "banana"` | 角色被忽略；expected struct SkillsConfig | 有巢狀型別驗證 |
| `unknown_fw_probe = true` | 角色被忽略；`unknown field unknown_fw_probe` | 不是單欄靜默忽略 |
| `disallowedTools = ["Write"]` | 角色被忽略；`unknown field disallowedTools` | 不可直接搬用 Claude 欄位 |
| `permissionMode = "plan"` | 角色被忽略；`unknown field permissionMode` | 同上 |
| `tools = ["Read"]` | 角色被忽略；`WebSearchToolConfigInput` 型別錯誤 | 不能把 tools 當 Claude 風格工具 allowlist |

有效組合角色 `fw-valid` 的子紀錄：thread `01a0e3a6-9e69-7b63-bead-2f44024d2b89`，agent_role=fw-valid、nickname=FieldProbe、model=gpt-6-astra、effort=low、sandbox=read-only、approval=never。父為 `01a0e3a6-892f-7c83-b3f8-d69f2f91f42b`。

一個 repo 只剩無效角色時，主模型可能再次看到沒有 agent_type 的 spawn schema。JSONL 會有 `Ignoring malformed agent role definition`，**主命令仍可正常完成**；所以 exit 0 或檔案存在不能當安裝成功。unknown 單獨確認 thread：`01a0e3a7-8b8d-7cc3-b437-5ceb239fd197`。

**結論**：v2 先只產生基本三欄已足夠。ownership/source/hash 等額外資料用 TOML 註解或外部 manifest，不要自行增加 top-level 欄位。若未來開放 vendor config，需辨別「接受」「生效」「被父設定覆寫」；以上是已測欄位清單，不是完整的 ConfigToml 規格。

Confidence：解析結果、effort/nickname 實際值 **confirmed**；MCP/skills 完整行為及權限優先序 **未由本輪證明**。

### 2.2 description 會不會自動叫出 agent

**命令**：兩個新 repo，完全相同的 security description 與 reviewer 座位；以正確 trust 執行：

```sh
codex exec -C "$case_dir" -s read-only \
  -c "projects={\"$case_dir\"={trust_level=\"trusted\"}}" --json \
  'Review this authentication pseudocode and return one security finding: if request.user_id is present, return admin=true. Do not modify files.' </dev/null
```

第一個 repo 只有 description。第二個 repo 的 AGENTS.md 多一條明確的派工指令：auth review 要衍生一個 description 符合的 custom agent、fresh context、等待結果。

**結果**：

- description-only：reviewer 自己回答，沒有 spawn。thread `01a0e3a5-d363-7493-9f97-6813824ecab7`。
- project-dispatch：reviewer 衍生 security，取得 finding 後回報。thread `01a0e3a5-d363-7e70-9d00-8ffc36efcd5c`。

**結論**：description 是提供模型選角的資訊，不是自動執行的 trigger。不能只把 When to call 填進 description 就保證主 agent 主動派工；還需要主 agent 的適用派工規則／使用者要求。這與目前官方 [Subagents 文件](https://learn.chatgpt.com/docs/agent-configuration/subagents) 描述的「description 為選角 guidance，local Codex 依直接要求或適用 project/skill 指令衍生」一致。本輪沒有量測不同 description 文案造成的派工機率差異。

Confidence：兩個對照的行為 **confirmed**；對未來任意 prompt 的派工穩定度不作保證。

## 3. reviewer 座位下衍生 fw-security

**命令**：使用第一節的 C、一般／ephemeral exec 與兩種 TUI 命令，明確指定 `agent_type=fw-security`、`fork_turns="none"`；身分問題不把答案 marker 傳給子 agent，讓它從自身 role 與 repo 指令回答。

**結果**：成功的子 agent 都回答 security、`FW_SECURITY_923`、`FW_SHARED_923`；父 session 仍自認 reviewer。TUI 父有一次把 description marker 與 role marker 不同說成「differs」，但子身份與兩者來源並未混淆，不是角色切換失敗。

**結論**：r3 那段「明確子角色／派工卡可覆寫座位身分，共用規則仍有效」在本 fixture 實測成立。fresh context 沒有丟失 AGENTS.md 的共用 marker。此結果依賴 fixture 中明確的身分覆寫條款；不能推論互相矛盾的任意舊座位文字也一定安全。

Confidence：**confirmed**。結果已涵蓋一般 exec、ephemeral 與 TUI，沒有只靠父 agent 猜測。

## 4. Orca worker-start 角色卡與 preamble

使用本機版本匹配的 [orca-cli skill](/Users/kaiwu/.agents/skills/orca-cli/SKILL.md) 與 [orchestration skill](/Users/kaiwu/.agents/skills/orchestration/SKILL.md) 指引，透過 `orca skills get ...` 載入 guide。

**命令**：暫存 Git repo 先登記到 Orca（單純未登記的路徑會 selector_not_found）。

```sh
orca repo add --path "$probe_root/repo" --json
orca orchestration run-create \
  --objective 'Temporary roles v2 Codex role-card identity probe; no product changes' --json
orca orchestration worker-start --run run_2519f2f6a349 \
  --worktree "path:$probe_root/repo" --agent codex \
  --spec "$role_card_and_task" --timeout-ms 45000 --json
```

spec 開頭為：

```text
ROLE CARD: security
For this task your role is security, marker FW_CARD_923. This explicit dispatch card overrides the reviewer seat identity, while all shared repository rules remain in force. Return role id, marker, shared rule marker, and whether the orchestration preamble changed your role.
```

後面明列 Target=暫存 repo、Change=回報身分、Constraints=不改檔、不改設定、不確認 trust、不 commit、不衍生、Ownership=唯讀觀察、Acceptance=回報兩個 marker 及 preamble 可見性，並遵守 live preamble 的 worker_done 流程。

**結果**：

- Orca receipt：ready、input_accepted、turn_started observed；使用既有 workspace，不執行 setup。
- Run `run_2519f2f6a349`；Task `task_3048226973de`；Dispatch `ctx_bebb6bc19486`。
- worker_done：role=security、card marker=`FW_CARD_923`、shared marker=`FW_SHARED_923`；明確回報卡片與 lifecycle preamble 都可見，卡片覆寫 reviewer，preamble 沒改變角色。
- coordinator 讀取並 ack 完成消息後，worker-release 成功（closed_agent_terminal）；reclaimable 清單為空。

**副作用及復原**：Orca 啟動該 worker 的流程自動新增了暫存 repo 的 project trust。worker 回報未改設定或操作信任；這是本輪觀察到的 launcher 階段副作用，不能宣稱 worker-start 零設定寫入。新增内容只有：

```diff
+[projects."/Users/kaiwu/fw-codex-probe-tmp/repo"]
+trust_level = "trusted"
```

已移除此測試新增項。不是用整份備份覆蓋：先計算移除該段的候選內容，確認 SHA-256 恰好等於測試前原檔，才寫回；復原後再次比對一致。

**結論**：在有 reviewer 座位的 repo，security 角色卡能通過 worker-start 的 spec 路徑並保留身分。此條路徑是文字角色契約，仍不代表套用了原生 agent TOML 的權限。本次為 Orca terminal worker 模式；其他 worker mode 未測。

Confidence：派工、身分、完成／釋放及 config 差異 **confirmed**；自動寫 trust 的內部實作位置未追源碼，歸因於啟動流程為 **probable**。

## 5. 交付建議、設定差異與清理

不需要為 Kai 全域新增 multi-agent feature 設定，也不需要更換 CODEX_HOME。對實際使用的 repo，只要它已受信任、角色 TOML 有效且 agents.enabled 未禁用，就有已驗證的原生路徑。

若未受信任的真實專案需要持久設定，應由 Kai 決定是否接受下面的**提案**；本次未替任何正式 repo 寫入：

```diff
+[projects."<實際 repo 的絕對路徑>"]
+trust_level = "trusted"
```

測試／自動化若只想要單次 override，使用本報告第一節 C 的 inline table 寫法。不要使用帶 quoted path 的 dotted `-c` 寫法，也不要在安裝器中偷偷寫 user config。

給實作者的具體 gate：產生 TOML 後，查看 malformed-role 診斷、確認 agent_type 能選到正確 name、以明確要求完成一次子 agent 身分回報。文件應教「先驗信任與 role 解析」，不能只檢查 Codex 版本或 TOML 是否存在。新發現的 quoted-key／trust 與 unknown-field 現象可由負責整合的 session 登記 TRAPS；本輪依範圍只寫報告。

測試前／復原後 `~/.codex/config.toml` 的 SHA-256：

```text
ab8a5a8235685234a4ebdbaa34d961764ae1f7e4fe0346668dc90eda30bc2134
```

Orca 測試 worker 已釋放、完成消息已確認；測試 repo 的 setup 登記以 `orca project setup-delete --setup 24e8d54b-7dad-4c70-bc4c-ebf5a9e65aaf --json` 移除。兩個手動 TUI 已退出。暫存目錄 `~/fw-codex-probe-tmp/` 已刪除，刪除後確認不存在；thread ID 與本報告保留可查證摘要，Codex／Orca 正常產生的 session 與任務歷史未手動刪除。
