---
record_id: 261005-setup-wizard
session: Claude(Opus 5.5) 主實作 + 兩個 sonnet subagent(四語文件、smoke 案例,產出經主實作者逐檔審閱後採用);任務說明設計者 Fable 5.1 代 Kai 回覆澄清
date: 2026-10-05
repos: [flightwake]
tests: bash test/smoke.sh 36 節全過(49 個 ok;Python 3.12 在 PATH 前;含驗收後新增的 35、36.1–36.7),node --check bin/*.mjs test/*.mjs 全過(本 repo 無 TypeScript)
prod_changes: none(未 push、未 bump、未發版)
---
<!-- flightwake record — 飛行紀錄。 -->

# 第一階段:引導式 setup、唯讀 doctor、repo 類型(notes)、冷啟動補洞、Orca 協作附加元件

**TL;DR**:依 `docs/plans/setup.md` 第 3 版實作。安裝邏輯抽成 `bin/install.mjs` 單一函式(寫入走 facade、可 dry-run),
`init`/`update`/`setup` 共用;新增 `setup`(互動、可注入 io、確認前零寫入)、`doctor`(唯讀)、`--profile=notes`、`--orca`、
`--git-init`,`init` 與 setup 都先驗 git。fw-coldstart 四語加「STATE 未初始化」分支。smoke 由 22 節擴到 34 節全過。
開工前提出的四處任務說明矛盾已由設計者裁定,並改正進任務說明。

## 關鍵發現(重要性排序)

1. **setup 的寫入摘要只能用 dry-run 產生**:任務說明同時要求「摘要以程式實際寫入為準」和「不複製安裝邏輯」,手寫清單必然漂移
   → 安裝流程重構成函式、所有寫入過 facade,摘要就是同一函式 `dry: true` 的回傳。實跑比對:摘要與實際寫入逐行一致(DECISIONS 2026-10-05)。
2. **任務說明 v3 有四處與現況/自身矛盾**(開工前停下提出,設計者裁定):第 8 步依附已刪除的「逐項設定」模式 → private 只認旗標;
   「init 行為不變」vs「有 .git 時也要驗 git」→ 都擋(否則 --private 的受追蹤檢查靜默失效、可能寫進受追蹤檔);範本預填
   `health: green` vs「不能猜 green」→ 未初始化時視為未填;「文件」段寫 `npx flightwake` 為入口 → 改 `setup`。都已改正進 setup.md(823ea9f)。
3. **readline 在預先灌入的輸入下會丟行**:`rl.question` 只接「提問當下之後」的行,pty/管道先到的輸入會被當成 `line` 事件丟掉
   → io 改成行佇列。真 TTY(python pty)實測:Ctrl-C 退出 130、Ctrl-D 退出 1,兩者零寫入;正常確認 0。
4. **smoke 第 22 節在 macOS 系統 python 上必失敗**(tomllib 需 3.11+,與本次改動無關,main 同樣失敗)→ TRAPS
   `smoke-needs-python311-tomllib`(confirmed)。

## 交付 / Commits

823ea9f..9c21e84(任務說明與審查入版控、核心實作、DECISIONS、四語文件與 CHANGELOG、smoke 23–34 節)。檔案:
`bin/install.mjs`(新)、`bin/setup.mjs`(新)、`bin/doctor.mjs`(新)、`bin/cli.mjs`(改為分派 + uninstall)、`bin/roles.mjs`
(抽出 `installRolesSkill`,private 補 exclude)、`snippets/*/CLAUDE-md-snippet.notes.md`、`addons/orca/*/orca-snippet.md`、
四語 fw-coldstart / fw-record 描述 / record 範本觸發行、四語 README、CHANGELOG、docs/workflow(.zh-TW).md、
`test/smoke.sh`、`test/setup-drive.mjs`、`test/pty-run.py`。

## 與任務說明的偏離(皆記在 DECISIONS 2026-10-05)

- `profile` 屬性**只在 notes 時寫入** marker(缺屬性 = code),讓舊版 CLI 讀新 marker 時判斷語言的 regex 不受影響
- notes 的 skill 文字處理採**中性措辭**(fw-record 描述與 record 範本改成「schema/prod 僅限程式專案」),不依 profile 在安裝時改寫 skill——
  改寫會破壞「同版同語言才判本地修改」的覆蓋防護
- setup 的「已安裝」分支沿用命令列旗標(與 `update --lang=…` 一致);roles 題沒有對應旗標(init 本來就沒有 `--roles`)
- `init` 結尾的「下一步」文字改指向 fw-coldstart(旗標與行為不變,只是輸出文字)
- 「既有安裝」= 有 marker 或 private exclude 區塊;只剩 `.flightwake/`(uninstall 未 purge)走全新安裝

## 驗證證據

- smoke 34/34 節:輸出結尾 `✅ smoke 全過`;新增 23–34 節逐項對應任務說明「測試」段(非 TTY、無 git 三情境、非 repo/--git-init、
  無指令含 TTY、setup 全預設/各附加元件/拒絕 git init/已安裝、Orca、中斷零寫入(含 `.git` 不得出現、registry 雜湊)、
  worktree/submodule/子目錄、doctor 各破壞情境 + 唯讀證明(含被忽略檔與 registry)、profile 雙向與 private 無 marker、private+roles)
- 手動實跑:暫存目錄完整 setup(zh-TW、claude+codex、三個附加元件、notes)→ doctor 0 失敗 1 提醒;update 沿用 notes/Orca;
  uninstall 清除 Orca 區塊;`init --private --profile=notes` + `roles` 後 `git status` 乾淨
- 真 TTY:python pty 驅動 `node bin/cli.mjs setup`:^C → 130、^D → 1(皆只剩 `.git`)、全 Enter + y → 0

## 未完 / 交接

- 未 push、未 bump、未發版(依指示,需先問 Kai);CI 未跑
- 本 repo 自己 dogfood 的安裝副本(`.claude/skills`、`.agents/skills`、CLAUDE.md/AGENTS.md 區塊)未用新版 update 刷新——
  update 會寫真實的 `~/.flightwake/registry.json`(worktree 外),留給發版後
- `roles apply` 在 --private 下仍會把角色區塊寫進受追蹤的指令檔與 `.claude/agents`(本階段範圍外,只修了 install 的排除)
- Orca 協作區塊與 Gemini AfterAgent hook 均未真機驗證;zh-CN/ja 新文字未經母語者校對;Windows 未測(detectOrca 的 PATH 掃描不檢查執行權限)

## 驗收後修正(同日,393b096..267cf32)

驗收者(Fable 5.1)獨立比對 main 與分支後通過,接著兩批修改:

1. **Kai 的兩項 setup 體驗修改**(393b096):偵測不到任何指令檔時,agent 題改成直接問用哪些工具(可複選、不預選、不可空白),
   用 Claude Code 的人因此問得到儀表題;最終「確定執行?」改成預設是 `[Y/n]`。smoke 第 35 節 + 調整既有答案序列。
2. **GPT-6 Astra 審 diff 的六項**(原文 `docs/plans/setup.diff-review-astra.md`,全數採納;2182e99、267cf32)。
   每項都先寫測試、跑出失敗,再修到通過(smoke 36.1–36.6):
   - 36.1 doctor private 檢查原本只看「剩下的排除項」→ 刪掉 `.flightwake/` 仍回 0(重現:rc=0)→ 改從安裝產物推導、`check-ignore` 驗實效
   - 36.2 `init --private --orca` 把 Orca 區塊寫進受追蹤的 CLAUDE.md/AGENTS.md(重現:各 +17 行)→ claude 改寫 CLAUDE.local.md、其他跳過並警告
   - 36.3 **main 就有**:hook 檔 symlink 到 `../STATE.md`,update 覆蓋 STATE(重現)→ 寫入層拒絕 symlink 與 repo 外落點,非零退出
   - 36.4 刪 marker 後壞掉的 `.codex/hooks.json` 被忽略(重現:rc=0)→ 平台也從產物推導;hook 驗 type;結構異常逐項回報
   - 36.5 有 `.git` 無 git 時 uninstall 被擋(重現:rc=1)→ git 前置檢查只限 init/setup
   - 36.6 fw-coldstart 只剩一行範本也直接跳第 5 步 → 四語改成有歷史就續走第 2–4 步
   - 測試面:doctor 負向案例改為斷言具體失敗行且不得崩潰;36.7 比對 setup 摘要與實際寫入集合(雜湊 + mtime 快照,同內容重寫也算;
     故意讓摘要少列一個路徑時確實失敗)

教訓:**doctor 的檢查清單若由「現存的設定」推導,刪掉的東西會連同它該觸發的檢查一起消失**——必要集合要從另一個來源(安裝產物)推導。

### 仍未解決(新增)

- `--private` 下**核心義務表**的 marker 若已在受追蹤檔(先一般安裝、後改 private),`--force`/update 仍會改寫它(main 既有行為;本次只修 Orca)
- symlink 防護只在安裝寫入層;`uninstall`、`roles` 的寫入與 `refreshRolesSkill` 未套用
- `CLAUDE.md → AGENTS.md` 這類 repo 內 symlink 現在一律拒寫(DECISIONS 2026-10-05 記重評條件)
