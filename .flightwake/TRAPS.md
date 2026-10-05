<!-- flightwake TRAPS — 坑 registry。非顯而易見、會再咬人的事實。 -->
<!-- 條目採 OKF 式慣例:frontmatter 區塊 + 內文;可用 [[名稱]] 互連。新的加最上面。 -->
<!-- 時效:條目過時(功能合併/重構後不再成立)不刪 — status 改 superseded 並指向取代者;讀的人只信 active。 -->

# 坑 Registry

---
name: force-color-colours-piped-node-output
type: gotcha
status: active
tags: [test, smoke, node, environment, color]
discovered: 2026-10-05
confidence: confirmed
paths: ["test/smoke.sh"]
---

**症狀**:`bash test/smoke.sh` 在第 4 節左右失敗:`❌ FAIL: 重跑後 Codex Stop hook 重複`,但 `.codex/hooks.json` 實際只有一個 hook;同一份程式先前一直全過。
**根因**:環境裡有 `FORCE_COLOR`(這次是 `3`):node 連輸出到管道都上色,`node -e "console.log(1)"` 輸出 `ESC[33m1ESC[39m`(`od -c` 實看),所有拿 node 輸出做字串比對的斷言都會錯。
**解法/繞法**:smoke 開頭 `unset FORCE_COLOR`(已加)。其他會比對 node 輸出的腳本同樣要清掉它;CI 若設 FORCE_COLOR 也會中。
**佐證**:record 261005-integration「收尾複審修正」;commit 304eec9 前後同一環境一敗一過

---
name: readline-terminal-mode-loses-answer-lines
type: gotcha
status: active
tags: [setup, readline, tty, orca, terminal]
discovered: 2026-10-05
confidence: probable
paths: ["bin/setup.mjs"]
---

**症狀**:真實終端機(Orca、繁中)跑 `npx flightwake setup`,已回答的題目從畫面消失;`orca terminal read` 讀回來,正好是「有打字作答」的那幾行是空白(`[1] 2`、`輸入編號…:1`、`安裝 Claude Code mod? [y/N] y`),只按 Enter 的題目保留。pyte 模擬器在 60/80/100 欄都看不到。
**根因**:`readline` 的 terminal 模式每題送 `ESC[1G ESC[0J <prompt> ESC[<n>G`(移到第 1 欄、清到螢幕尾、寫 prompt、再跳到它自己算的絕對欄位),打字回顯接在絕對欄位之後;Orca 的終端機讀取把這種行讀成空白。不是全形寬度計算問題(純 ASCII 的 `[1] 2` 也消失)。xterm 實際畫面是否也消失未另外驗證。
**解法/繞法**:問答不需要行編輯時用 `createInterface({ terminal: false })`:tty 維持 cooked、由驅動回顯,prompt 是純文字,Ctrl-C 變成真的 SIGINT(要自己接)。改後同一 Orca 終端機每題與答案都留住。
**佐證**:record 261005-integration「真機回饋修正」;smoke 43.1(四語、斷言輸出沒有游標/清除控制序列)

---
name: mod-state-refs-must-be-literal
type: gotcha
status: active
tags: [mods, claude-code, plugin-loader, state]
discovered: 2026-10-05
confidence: confirmed
paths: ["mods/flightwake/hooks/**"]
---

**症狀**:`claude plugin validate` 失敗、整個外掛不載入(所有 plugin test 跟著失敗):`$.state.get takes a reference whose plugin and key are string literals ({ plugin: "p", key: "k" }, written there or in a const of this file; only id may be computed)`。觸發的寫法是共用 helper `get(key)` 再組 `{ plugin, key }`。
**根因**:載入器靜態檢查每個 `$.state` 參照,plugin 與 key 必須是本檔裡的字面值(直接寫在呼叫處或本檔的 const),以便對照 `types/index.d.ts` 的契約;用變數組 key 一律拒絕。與 [[mod-dollar-cannot-cross-import]] 同屬載入器的靜態規則。
**解法/繞法**:每個 key 宣告一個 `const X_REF = { plugin: 'flightwake-mod', key: '…' } as const`,呼叫處直接用。
**佐證**:validate 錯誤訊息原文(Claude Code 2.1.289);改成字面 const 後 validate 通過、289 測試全過(commit c4d4f42 前後)

---
name: claude-code-loads-agents-md-when-no-claude-md
type: gotcha
status: active
tags: [claude-code, agents-md, roles, seats, mods, instruction-files]
discovered: 2026-10-05
confidence: confirmed
paths: ["bin/roles.mjs", "docs/roles*.md", "mods/flightwake/hooks/features/role-guard.ts"]
---

**症狀**:`docs/roles.md` 寫「Claude Code 不讀 AGENTS.md(已在 2.1 驗證)」,座位設計靠這點把 Codex 的座位寫進 AGENTS.md、Claude 的寫進 CLAUDE.md;但在 Claude Code 2.1.289,只有 AGENTS.md 的資料夾裡,`claude -p` 逐字答出只寫在 AGENTS.md 的暗號,debug log:`[cc-plugin-agents-md] $.ui.log (to debug): no CLAUDE.md found; AGENTS.md loaded: …/only-agents/AGENTS.md`。
**根因**:內建外掛 `cc-plugin-agents-md`(`agents-md@builtin`,事件 session.start/prompt.context/agent.spawn/tool.call)在祖先目錄(實測掃 8 層)找 `CLAUDE.md`、`.claude/CLAUDE.md`、`CLAUDE.local.md`;**一個都沒有時**才找 `AGENTS.md`、`.claude/AGENTS.md` 並載入。只要有任何 CLAUDE 指令檔(含 private 安裝的 CLAUDE.local.md),AGENTS.md 就不載入。它有外掛選項(`pluginConfigs["agents-md@builtin"]`),內容未查。
**解法/繞法**:有 Claude 座位的 repo 一律有 CLAUDE.md(roles apply 會寫),座位假設成立;**只有 AGENTS.md 的 repo**(只裝給 Codex、或只有 Codex 座位)裡開 Claude Code,會讀到 Codex 座位的角色與 `$fw-` 方言的義務表。mod 的角色守門只讀 Claude 的 marker,不受影響。要不要改 roles 設計留給 Kai(integration 任務項目 7 只查證不改)。
**佐證**:2.1.289,scratchpad 三組暫存 repo(只有 AGENTS.md / 兩者都有 / 都沒有),讀檔工具全關,各 3 次:只有 AGENTS.md → 3/3 答出 AGENTS 暗號;兩者都有 → 3/3 只有 CLAUDE 暗號、AGENTS 暗號「no」;都沒有 → NONE。debug log 兩種情況的 ancestors 掃描行。record 261005-integration「項目 7」

---
name: unquoted-heredoc-runs-backticks
type: gotcha
status: active
tags: [shell, heredoc, flightwake-records, registry, agent-tooling]
discovered: 2026-10-05
confidence: confirmed
---

**症狀**:用 `python3 - <<EOF`(分隔字未加引號)把含反引號的 STATE 文字寫進檔案,輸出出現 `(eval):1: permission denied: docs/plans/integration.md`、`no such file or directory: kaiwutech-TW/integration`,python 報 `SyntaxError: EOL while scanning string literal`,字串中段變成 `flightwake update v0.13.0 → v0.14.0 (lang=zh-TW, statusline) → /Users/…/integration`;之後 `git status` 多出十個 dogfood 檔(skills、CLAUDE.md/AGENTS.md marker、statusline.mjs)的修改,`~/.flightwake/registry.json` 多一筆該 worktree。
**根因**:未加引號的 heredoc 會做指令替換,flightwake 紀錄慣用的 `` `指令` `` 標記被當成要執行的指令;STATE 裡的 `` `npx flightwake update` `` 因此真的從 npm 抓已發佈版本、在當前目錄執行 update(寫 dogfood 副本與全域 registry)。
**解法/繞法**:寫任何含反引號或 `$` 的文字時,heredoc 分隔字一律加引號(`<<'EOF'`),需要的變數改由環境變數傳入;或用 Write/Edit 工具。
**佐證**:bash 手冊 Here Documents 一節(分隔字未加引號時內文做參數展開、指令替換、算術展開);本次實際發生於合併 commit 9274a09 之前(record 261005-integration)

---
name: smoke-needs-python311-tomllib
type: gotcha
status: active
tags: [test, smoke, python, macos, environment]
discovered: 2026-10-05
confidence: confirmed
---

**症狀**:本機 `bash test/smoke.sh` 跑到 roles v2 那節停下:`ModuleNotFoundError: No module named 'tomllib'` → `❌ FAIL: TOML 應可解析且 escape 正確`,看起來像產生的 TOML 壞了;CI 卻是綠的。
**根因**:smoke 第 22 節用 `python3 -c 'import tomllib'` 驗 TOML,`tomllib` 是 Python 3.11 才進標準庫;macOS 內建 `/usr/bin/python3` 是 3.9.6。CI runner 的 python 夠新。
**解法/繞法**:PATH 前面放一個 3.11+ 的 `python3` 再跑(例如把 uv 裝的 `python3.12` symlink 成某個目錄裡的 `python3`,`PATH="<該目錄>:$PATH" bash test/smoke.sh`)。這個失敗不代表程式有問題。
**佐證**:同一份程式碼在 3.9.6 失敗、換 3.12.14 全過,main(9dd685c)與 setup-wizard 分支各做一次(record 261005-setup-wizard 驗證段)

---
name: plain-git-status-rewrites-index
type: gotcha
status: active
tags: [git, read-only, mods, hooks]
discovered: 2026-10-05
confidence: confirmed
paths: ["mods/**", "hooks/*.mjs"]
---

**症狀**:號稱唯讀的工具只跑了 `git status --porcelain`,stdout 為空,`.git/index` 的位元組卻變了(Astra 驗收 diff 時在暫存 repo 實測到 mod 的 F2 指令)。
**根因**:`git status` 發現工作樹檔案的 stat 資訊與 index 不符(內容相同、mtime 變了)時,會順手刷新並寫回 index——這是 optional lock 下的寫入;`git --no-optional-locks` 關掉它。
**解法/繞法**:唯讀承諾的 git 呼叫一律 `git --no-optional-locks …`;驗證要比對真實 `.git/index` 位元組並附對照組(普通 status 確實會改),見 `mods/flightwake/scripts/git-readonly-check.sh`。既有 `hooks/state-check.mjs` 與 `statusline.mjs` 也跑普通 `git status`,屬核心、本分支未改。
**佐證**:`git-readonly-check.sh` 對照組 index 雜湊改變、帶旗標的同組指令不變(records/261005-flightwake-mod.md 驗收補記)

---
name: mod-options-not-read-from-project-settings
type: gotcha
status: active
tags: [claude-code, mods, plugin, config, installer]
discovered: 2026-10-05
confidence: confirmed
paths: ["mods/**"]
---

**症狀**:暫存 repo 的 `.claude/settings.json` 寫了 `pluginConfigs["flightwake-mod"].options.roleGuard = true`,角色守門卻沒開;換成 `--settings` 檔、鍵寫 `flightwake-mod` 也沒開(從 `.claude/skills/` 載入時)。
**根因**:Claude Code 2.1.289 只從 user / `--settings` / managed 設定讀外掛選項,**不讀專案設定**(debug log 原文:`no pluginConfigs["flightwake-mod@skills-dir"].options in user, --settings or managed settings (project settings are not read)`);且鍵依載入方式而異:`.claude/skills/` 載入是 `<name>@skills-dir`,`--plugin-dir` 是 `<name>` 或 `<name>@inline`。
**解法/繞法**:文件教使用者在 `/config` 或 `~/.claude/settings.json` 用 `flightwake-mod@skills-dir` 鍵設定;安裝器(後續)不能靠寫專案 settings 幫使用者開 F5——這是每人一份的選擇。
**佐證**:records/261005-flightwake-mod.md「真機載入」;兩次 debug log 對照(鍵 `flightwake-mod` 不生效、`flightwake-mod@skills-dir` 生效並實際擋下寫入)

---
name: project-skills-dir-mod-needs-trust
type: gotcha
status: active
tags: [claude-code, mods, plugin, trust, headless]
discovered: 2026-10-05
confidence: probable
---

**症狀**:mod 放在暫存 repo 的 `.claude/skills/flightwake-mod/`,`claude -p` 跑起來完全沒載入(沒有系統提示區段、沒有 /fw-log,debug log 也沒提到它);同一資料夾以互動模式接受工作區信任後,立刻以 `flightwake-mod@skills-dir` 載入。
**根因**:推測專案 skills 目錄的外掛只在資料夾**已受信任**時採用;`-p` 跳過信任對話框但不等於授予信任(與 Astra 審查的警告一致)。只觀察一組對照(同資料夾、信任前 -p 不載、信任後互動載入),信任後的 `-p` 未再測。
**解法/繞法**:驗收真機載入要用互動 session 並接受信任(或改 `--plugin-dir` 驗功能,但那驗不到 skills-dir 路徑);文件與安裝器要說明「首次需信任此資料夾」。
**佐證**:records/261005-flightwake-mod.md「真機載入」(load-debug.log vs load-debug4.log)

---
name: smoke-needs-python-311
type: gotcha
status: active
tags: [smoke, python, macos, test]
discovered: 2026-10-05
confidence: confirmed
commands: ["bash test/smoke.sh"]
---

**症狀**:`bash test/smoke.sh` 在 roles v2 節失敗:`ModuleNotFoundError: No module named 'tomllib'` → `❌ FAIL: TOML 應可解析且 escape 正確`。
**根因**:smoke 用 `python3 -c "import tomllib"` 驗 TOML;macOS 內建 `/usr/bin/python3` 是 3.9,tomllib 3.11 才有。CI 的 runner 是新版 Python,所以只在本機咬人。
**解法/繞法**:把 3.11+ 的 python3 放到 PATH 前面再跑(例:`uv python find '>=3.11'` 取路徑,建一個 `python3` 連結的目錄加到 PATH 前面);smoke 本身未改(本分支不動測試基礎設施)。
**佐證**:同一 commit,PATH 換成 Python 3.13 後 smoke 全過(records/261005-flightwake-mod.md)

---
name: mod-dollar-cannot-cross-import
type: constraint
status: active
tags: [claude-code, mods, plugin, hooks]
discovered: 2026-10-05
confidence: confirmed
paths: ["mods/**"]
---

**症狀**:`claude plugin validate` / `claude plugin test` 拒載模組:`$ is passed to "fwContext", imported from "../lib/core": $ is followed only into a function declared in this same file, never across an import`;變體二:`"on" is passed to something other than a function named at the top of this file or imported from one of the module's own files`(把 `on` 放進表格再迴圈呼叫);變體三:`on("session.start") is registered twice without a matcher`(兩個功能模組各自 `on('session.start', hook)`——每個功能單獨測都過,合併後整個外掛不載入)。
**根因**:Claude Code 2.1.289 的載入器靜態追蹤 `$` 與 `on`:`$` 只能在同檔宣告的函式間傳遞且一律寫成 `$.noun.event(...)`;`on` 只能直接傳給頂層具名或 import 的函式;同一外掛對同一事件**最多一個無 matcher 的註冊**(有 matcher 的不限,連重複的 matcher 也可以)。違反者整個 hooks 模組不載入(不是只跳過那個 hook)。
**解法/繞法**:共用模組只放純函式;需要世界存取時,在功能檔內寫 `function ioOf($)` 回傳閉包物件(`{ read: (p) => $.fs.read(p), … }`)再傳給 import 的函式——閉包跨 import 可通過(validate 會顯示 `$.fs.read (via ioOf)`)。`register` 對每個功能逐行呼叫,不用表格迴圈。多個模組要掛同一事件時一律帶 matcher;要「全部都接」就寫空 matcher `on('session.start', {}, hook)`——實測 validate 通過、執行期每次都觸發。
**佐證**:本分支 scratchpad 探針(同一模組改兩種寫法,validate 一拒一過,plugin test 一敗一過;重複註冊另以 5 種組合探針:無 matcher×2 拒、其餘皆過,空 matcher 兩個 hook 執行期都觸發);DECISIONS 2026-10-05 首條

---
name: codex-project-trust-exact-path
type: gotcha
status: active
tags: [codex, trust, subagents, config]
discovered: 2026-09-28
confidence: confirmed
---

**症狀**:repo 有有效的 `.codex/agents/fw-x.toml`,Codex 的 spawn 工具卻沒有 `agent_type` 欄位,叫不出自訂角色;`~/` 明明已在 `~/.codex/config.toml` 設成 trusted。
**根因**:專案層(`.codex/`)只在**該 git repo 的精確路徑**受信任時才載入;上層目錄受信任不涵蓋底下新建的 git repo(`codex app-server` 的 `config/read` 顯示 project layer disabledReason 要求精確路徑)。另外 `-c 'projects."/path".trust_level="trusted"'` 這種 dotted 寫法在 0.157.1 會把引號留進 key,等於沒設;單次 override 要用 inline table:`-c 'projects={"/path"={trust_level="trusted"}}'`。
**解法/繞法**:確認實際工作的 repo(含 Orca worktree 路徑,例如 `workspaces/<repo>/<name>`)各自在信任清單裡;驗收看 agent_type 清單與一次真的 spawn,不是看 TOML 存在。
**佐證**:docs/plans/roles-v2.codex-probe.md §1.1(A/B/C 對照,threads 01a0e3a0… / 01a0e3a1… / 01a0e3a2…)

---
name: codex-agent-toml-unknown-field-drops-role
type: gotcha
status: active
tags: [codex, subagents, toml]
discovered: 2026-09-28
confidence: confirmed
---

**症狀**:`.codex/agents/*.toml` 加了一個 Codex 不認得的欄位(如 `disallowedTools`、`permissionMode`、任意自訂 key)或型別錯誤,該角色從選單消失;主命令照樣 exit 0。
**根因**:角色定義嚴格解析,未知欄位/型別錯誤 → 整份角色被忽略(JSONL 有 `Ignoring malformed agent role definition`),不是只忽略那一欄。
**解法/繞法**:產生器只寫 `name` / `description` / `developer_instructions`;ownership 等額外資料放 TOML 註解或外部 manifest。不要把 Claude 的欄位搬過來。
**佐證**:docs/plans/roles-v2.codex-probe.md §2.1(Codex 0.157.1,逐欄對照)

---
name: orca-worker-start-writes-codex-trust
type: gotcha
status: active
tags: [orca, codex, config, side-effect]
discovered: 2026-09-28
confidence: probable
---

**症狀**:用 `orca orchestration worker-start --agent codex` 在一個未受信任的 repo 啟動 worker 後,`~/.codex/config.toml` 多了 `[projects."<repo>"] trust_level = "trusted"`。
**根因**:推測是 Orca 的 worker 啟動流程自動確認信任(worker 本身回報沒改設定);未追原始碼。
**解法/繞法**:在暫存/測試 repo 用 worker-start 後,檢查並移除多出的信任項;不要宣稱 worker-start 零設定寫入。也因此 Orca 管理過的 repo 通常已受信任,而沒跑過 worker 的 worktree 路徑可能沒有。
**佐證**:docs/plans/roles-v2.codex-probe.md §4(Run run_2519f2f6a349,已比對 SHA-256 復原)

---
name: codex-custom-agent-sandbox-not-enforced
type: gotcha
status: active
tags: [codex, subagents, sandbox, security]
discovered: 2026-09-27
confidence: probable
---

**症狀**:`.codex/agents/<id>.toml` 設 `sandbox_mode = "read-only"`,主 session 以 workspace-write 啟動並成功衍生該 agent(子 rollout 帶有定義裡的 developer_instructions),子 agent 用 shell 與 apply_patch 都**寫檔成功**;子 rollout 的 effective `sandbox_policy.type` 是 workspace-write。
**根因**:未完全確定。推測自訂 agent 檔只是一層 config,衍生時父 turn 的 live permission 會重套(官方 Subagents 文件有此描述),因此不能當成優先於 runtime 的政策。現象本身已在一個隔離環境重現(Codex 0.157.1);TUI、Orca worker、既有使用者設定未逐一驗證。
**解法/繞法**:不要把「產生了 read-only 的 agent 定義檔」當成強制唯讀。需要唯讀時,本次同環境實測以唯讀啟動**整個 session**(`codex exec -s read-only`)可擋 shell 與 apply_patch;其他方式與 MCP 遠端副作用未驗證。文件與產出若有權限意圖,只能標 guidance。
**佐證**:2026-09-27 roles v2 審查,Codex 暫存實測(父 thread 01a0e395-d1a8…、子 thread 01a0e395-f61e…),見 docs/plans/roles-v2.review-codex.md 第二節

---
name: codex-exec-project-hooks-not-loaded
type: gotcha
status: active
tags: [codex, hooks, testing]
discovered: 2026-09-27
confidence: suspected
---

**症狀**:在暫存 repo 放 `.codex/hooks.json`(SessionStart/Stop/UserPromptSubmit 探針 hook,寫檔留痕),用 `codex exec` 跑,探針檔始終沒有產生。加 `--dangerously-bypass-hook-trust`、`-c 'projects."<path>".trust_level="trusted"'`、放在已信任的 `~` 底下、補空的 `.codex/config.toml`,全都一樣。輸出裡的 `hook: SessionStart` 行是全域 `~/.codex/hooks.json`(Orca 的 hook)觸發的,不是專案 hook。
**根因**:未確定。推測 `codex exec` 在「沒有持久化信任紀錄的新專案 hook」時不載入專案層 hook;真實 repo 的 Stop hook 是在 TUI 裡被信任過(`~/.codex/config.toml` 的 `[hooks.state]` 有 trusted_hash)才生效。
**解法/繞法**:不要用 `codex exec` 驗證新的專案 hook,改在 TUI 開新對話、信任 hook 後再驗。需要「/clear 後仍在」的內容,優先寫進 `AGENTS.md`,它不需要信任就會載入。實測 Codex 0.157.0 只讀 AGENTS.md、不讀 CLAUDE.md,Claude Code 2.1.283 則相反。
**佐證**:2026-09-27 roles 調研,Codex 0.157.0;同一個 hook 腳本在 Claude Code `claude -p` 下的 SessionStart 注入實測成功

---
name: macos-mktemp-symlink-cwd-mismatch
type: gotcha
status: active
tags: [macos, testing, node, paths]
discovered: 2026-08-11
confidence: confirmed
---

**症狀**:測試在暫存 repo 裡把 `process.cwd()` 記下的路徑(如 registry 條目)拿去和 shell 的 `$TMP` 比對,比對永遠落空——兩邊看起來是同一個目錄。
**根因**:macOS `mktemp -d` 回傳 `/var/folders/…`,而 `/var` 是 `/private/var` 的 symlink;bash 保留邏輯路徑,Node 的 `process.cwd()` 回實體路徑,字串永不相等。
**解法/繞法**:測試腳本拿到 `$TMP` 後立刻 `TMP="$(cd "$TMP" && pwd -P)"` 正規化成實體路徑再往下用(smoke.sh 已內建)。任何「shell 路徑 vs Node cwd」的字串比對都適用本條。
**佐證**:本 repo test/smoke.sh registry 測項首次紅燈(2026-08-11),正規化後綠

---
name: codeql-action-version-lockstep
type: trap
status: active
tags: [ci, github-actions, dependabot, codeql]
discovered: 2026-07-27
---

**症狀**:dependabot 開的 codeql-action 升版 PR,CI 紅在 `##[error]Loaded a configuration file for version '4.37.1', but running version '4.37.3'` → `CodeQL job status was configuration error`。PR 內容本身只是換一行 SHA,看起來完全無辜。
**根因**:`github/codeql-action/init`、`analyze`、`upload-sarif` 在 dependabot 眼中是**三個獨立套件**,會拆成三個 PR;但 CodeQL 要求同一 workflow 內所有 codeql-action step 同版,任一 PR 單獨存在時 branch 上就是 init 舊版 + analyze 新版。init 步驟其實有先警告(`Not all workflow steps that use github/codeql-action actions use the same version`),但它只是 warning,真正炸在 analyze。
**解法/繞法**:`.github/dependabot.yml` 用 `groups` 把 `github/codeql-action*` 併成單一 PR(已設,2026-07-27)。若手動升版:三處 SHA 一起換。看到 configuration error 先 `grep codeql-action .github/workflows/` 比對版本註解,別去查 CodeQL 設定檔。
**佐證**:PR #1/#4/#5(2026-07-26 dependabot 批次),失敗 run 30184467406

---
name: gh-active-account-drift
type: gotcha
status: active
tags: [gh, github, multi-account]
discovered: 2026-07-23
---

**症狀**:`gh release create` 失敗說 "workflow scope may be required";或 `git push` 403 denied to 另一個帳號——明明這個 session 剛 `gh auth switch` 成功過。
**根因**:gh 的 active account 是**全域狀態**,其他 session/終端切帳號會直接影響本 session;且錯誤訊息誤導——說缺 workflow scope,實際是 active 帳號對 repo 無權限。
**解法/繞法**:本 repo 任何 gh 或 push 操作**前**先 `gh auth switch -u kaiwutech-TW`(別信上次的切換還在);看到 workflow scope 錯誤先 `gh auth status` 查 active 帳號,不要急著 `gh auth refresh` 加 scope。
**佐證**:[[260723-v0100-release]](push main 成功後、開 Release 前被切回 kaiwu-aideamed)

---
name: hook-stdin-tty-block
type: trap
status: active
tags: [hooks, node, stdin]
discovered: 2026-07-19
---

**症狀**:hook/statusline 腳本手動執行(終端機直接跑、沒接 pipe)時永久卡住,無錯誤訊息。
**根因**:`readFileSync(0)` 在 stdin 是 TTY 時等 EOF 等不到——Claude Code 情境永遠 pipe JSON 進來所以沒事,手動測試必卡。
**解法/繞法**:所有讀 stdin 的 hook 開頭先判 `process.stdin.isTTY`,是 TTY 就跳過讀取。**已咬兩次**:state-check 2026-07-17 修過(dashboard 手測 2 分鐘 timeout 坐實),statusline 2026-07-18 新寫時重犯——寫任何新 hook 前查本條。
**佐證**:salesmartly_chain repo TRAPS 同名條目(當時只記在那邊,本 repo 漏登,故重犯)

---
name: dogfood-dual-copy-drift
type: gotcha
status: active
tags: [dogfooding, hooks, release]
discovered: 2026-07-18
---

**症狀**:修了 statusline/hook 的 bug,本機儀表變正常,但發版後使用者拿到的還是舊行為(或反過來:改了源頭,本機看不到效果)。
**根因**:本 repo dogfood 自己——同一份 hook 存在兩處:`hooks/`(npm 發佈的源頭)與 `.flightwake/hooks/`(本 repo 的安裝副本)。改任一邊都不會自動同步另一邊。
**解法/繞法**:改 hook/skill 時兩份都要動(`diff hooks/X .flightwake/hooks/X` 確認一致再 commit);已在其他 repo 裝過的副本(如 kaiwuweb)npm 發版前只能手動 cp。
**佐證**:4b9abd8(context_window 修正,當下先改了安裝副本、diff 才發現源頭沒動)

---
name: {{kebab-case-slug}}
type: trap          # trap | gotcha | constraint
status: active      # active | superseded(過時不刪,改此欄並在內文指向 [[取代條目]] 或 record)
tags: [{{標籤}}]
discovered: {{YYYY-MM-DD}}
---

**症狀**:{{看到什麼(錯誤訊息/怪行為)}}
**根因**:{{一句話}}
**解法/繞法**:{{怎麼處理}}
**佐證**:{{commit/record 連結}}

---
name: codex-exec-stdin-hang
type: trap
status: active
tags: [codex, stdin, automation]
discovered: 2026-09-02
confidence: confirmed
---

**症狀**:從腳本/agent 的 Bash 呼叫 `codex exec '<prompt>'`,印出 `Reading additional input from stdin...` 後永久卡住,零 CPU、不開 session、無錯誤。
**根因**:`codex exec` 在 stdin 不是 TTY 時會**額外**讀 stdin 到 EOF 當補充輸入(即使已給 prompt 參數);agent 的 shell stdin 是不會關的 pipe,EOF 永遠不來。與 [[hook-stdin-tty-block]] 同一家族,只是這次卡的是 Codex 本體而非我們的 hook。
**解法/繞法**:非互動呼叫一律 `codex exec … </dev/null`(或 `echo | codex exec …`)。macOS 沒有 `timeout` 指令,別指望它救場。
**佐證**:[[260902-codex-gemini-native]](真機驗證第一次卡 9 分鐘 0% CPU;加 `</dev/null` 後同指令 100 秒內完成——開關對照一次;第二次 Stop-hook 測試同法直接過,合計兩次)
