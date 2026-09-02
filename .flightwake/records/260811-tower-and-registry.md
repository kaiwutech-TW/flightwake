---
record_id: 260811-tower-and-registry
session: Claude(Fable 5)
date: 2026-08-11
repos: [flightwake, flightwake-tower]
tests: flightwake bash test/smoke.sh 26/26 全過(新增 registry 測項);flightwake-tower bash test/smoke.sh 7 節全過;真實 21-repo 驗收(state 21/21 可讀、traps 跨 repo 命中、MCP stdio 手動管線 initialize/tools/list/tools/call 全通)
prod_changes: 無(npm 未發版;core 的 registry 變更待下個 minor 0.13.0,tower 0.1.0 尚未 publish)
---

# 跨 repo 查詢層:flightwake-tower + 核心 registry 登記

**TL;DR**:新建獨立 repo `~/orca/flightwake-tower`(唯讀跨 repo 查詢層:TRAPS 搜尋 +
STATE 總覽,CLI + 手寫零依賴 MCP stdio server)。核心唯一改動:init/update 收尾 best-effort
寫 `~/.flightwake/registry.json`、uninstall 移除該筆。真實機隊 21 repo(20 既有 + tower 自己)
全數入冊並驗收通過。架構三決策(獨立 repo / 手寫 MCP / 命名 tower)使用者拍板,見 DECISIONS
2026-08-11。

## 關鍵發現(重要性排序)

1. **真實機隊的 STATE 格式偏差比 fixture 想像的多,讀取端容忍要三級**:
   ①frontmatter 前有 HTML 註解(舊模板,fence 不在檔案開頭);②值帶尾註解
   (`health: yellow  # 一句話現況`——這個註解其實是推播最想要的資訊,已收為 `health_note`);
   ③fence 根本沒關(tw_erp:開 `---` 後直接接全行 `#` 註解)。最終解法是逐行掃描單一路徑:
   開 fence 後收 `key: value` 與 `#` 行,遇其他行即停——同時吃掉有關/無關 fence 兩形態。
2. **worktree 不入冊**:Orca 的 `workspaces/<專案>/<任務>` 與 kaiwuweb 的 `.claude/worktrees/*`
   都是 git worktree(`git rev-parse --git-common-dir` 指向主 repo),種子腳本以此判定跳過
   5 個,避免同一 repo 重複計入。核心 init 端未加此判定(worktree 裡跑 init 本來就會裝出
   自己的 .flightwake,屬既有行為),遇到實際困擾再議。
3. **SCOPE+ 範圍變更行**(state 總覽新需求):全機隊 grep 確認**目前零筆**——這是使用者要
   開始用的新慣例,不是既有資料。實作認定:DECISIONS.md 中行首或表格決策欄開頭為 `SCOPE+`
   的行,兩形態都有 fixture 覆蓋;格式若與使用者想的不同,改 `lib/state.mjs` 的 `scopeLines()`。
4. macOS mktemp 的 `/var` symlink 讓 shell 路徑與 Node `process.cwd()` 字串永不相等,
   smoke 測項首次紅燈即此因,已登 TRAPS([[macos-mktemp-symlink-cwd-mismatch]])。

## 本批變更

- **flightwake(未 commit 前的 diff)**:`bin/cli.mjs`(registry 讀寫三函式 + init/update 收尾
  `registerRepo()` + uninstall `unregisterRepo()`;壞 registry 原樣保留不覆蓋)、
  `test/smoke.sh`(FLIGHTWAKE_HOME 隔離——**沒有這行,既有測項就會把暫存 repo 寫進真
  registry**;新增測項 20:登記/registered 日期不變/移除/壞檔容錯)
- **flightwake-tower(新 repo)**:`bin/cli.mjs`(repos/traps/state/mcp 四指令,traps 與 state
  皆有 --json)、`lib/registry.mjs`(stale 標記不靜默丟棄)、`lib/traps.mjs`(OKF 解析 + AND
  搜尋,confidence 語意隨輸出附規則)、`lib/state.mjs`(state-check 同語意落後計算 + SCOPE+)、
  `lib/mcp.mjs`(newline-delimited JSON-RPC,約 50 行)、`test/smoke.sh`(7 節)
- **registry 種子**:一次性腳本把 20 個既有 repo 入冊(scratchpad,不入 repo;之後靠 0.13.0
  的 update 自然刷新);tower 由本地核心 dogfood init 入冊(= 新核心碼對真 registry 的實測)

## 驗證證據

- flightwake `bash test/smoke.sh`:26/26(含新 registry 測項)
- flightwake-tower `bash test/smoke.sh`:7 節全過(含 MCP 五問五答、唯讀保證 git status 乾淨)
- 真實驗收:`state` 21/21 repo 讀得到 health(修格式偏差前 3 個 unknown);`traps stdin` 跨
  repo 命中 3 條(flightwake ×2 + salesmartly_chain,後者 confidence=confirmed 過濾正確);
  MCP stdio 真管線 `initialize`→`tools/call traps_search` 回正確結果

## 未完 / 交接

- **tower 未 publish、GitHub repo 未建**:發 npm 前需建 kaiwutech-TW/flightwake-tower + trusted
  publishing 設定(參考核心 release runbook;gh 操作前先 `gh auth switch -u kaiwutech-TW`)
- **核心 0.13.0 未發**:registry 變更已在本地 commit,發版走既有 Release 流程;發版後把三個
  常用 repo `npx flightwake update`(同時解 STATE 既列的 0.12.0 更新事項並自動刷新 registry)
- **SCOPE+ 格式待使用者確認**(機隊目前零筆,見關鍵發現 3)
- **Phase 2(session 成本/工時)未動工**:規格已定——repo 路徑映射 `~/.claude/projects/<slug>/*.jsonl`
  加總 usage token,工時用訊息 timestamp、單一 gap 上限 5 分鐘;只涵蓋 Claude Code transcript
- 推播(使用者提及「給後續推播用」)只做了資料面(`state --json` 含 health_note/SCOPE+),
  推播機制本身未在本次範圍
