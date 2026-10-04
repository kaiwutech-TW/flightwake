---
record_id: 261005-setup-wizard
session: Claude(Opus 5.5) 主實作 + 兩個 sonnet subagent(四語文件、smoke 案例,產出經主實作者逐檔審閱後採用);任務說明設計者 Fable 5.1 代 Kai 回覆澄清
date: 2026-10-05
repos: [flightwake]
tests: bash test/smoke.sh 38 節全過(60 個 ok;Python 3.12 在 PATH 前;含驗收後新增的 35、36.1–36.7、37.1–37.6、38.1–38.5),node --check bin/*.mjs test/*.mjs 全過(本 repo 無 TypeScript)
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
   - 36.6 fw-coldstart 只剩一行範本也直接跳第 5 步 → 四語 skill 文字改成「有歷史就續走第 2–4 步」(36.6 是文字檢查:確認 skill 文字包含這個指示,未驗證 agent 實際會遵循)
   - 測試面:doctor 負向案例改為斷言具體失敗行且不得崩潰;36.7 比對 setup 摘要與實際寫入集合(雜湊 + mtime 快照,同內容重寫也算;
     故意讓摘要少列一個路徑時確實失敗)

教訓:**doctor 的檢查清單若由「現存的設定」推導,刪掉的東西會連同它該觸發的檢查一起消失**——必要集合要從另一個來源(安裝產物)推導。

### 仍未解決(新增)

- `--private` 下**核心義務表**的 marker 若已在受追蹤檔(先一般安裝、後改 private),`--force`/update 仍會改寫它(main 既有行為;本次只修 Orca)
- symlink 防護只在安裝寫入層;`uninstall`、`roles` 的寫入與 `refreshRolesSkill` 未套用(→ 複審後 refreshRolesSkill 與 roles install 已納入,見下節;uninstall 與 roles apply 仍未套用)
- `CLAUDE.md → AGENTS.md` 這類 repo 內 symlink 現在一律拒寫(DECISIONS 2026-10-05 記重評條件)

## 複審後修正(同日,182779f..fdc62ed)

Astra 複審(原文 `docs/plans/setup.diff-review-astra-2.md`)確認上次六項的原始反例都不再重現,但找到五個延伸缺口,驗收者全數採納。
每項先寫測試、跑出失敗再修(37.4–37.6 因 smoke 遇第一個失敗就停,改用暫時複製的單組 smoke 分別跑出失敗,跑完即刪):

- 37.1 `init --agents=constructor` 被接受並寫入(重現:rc=0)→ 工具名稱改以 `Object.hasOwn(GROUPS, x)` 判斷(setup 複選題與 `--agents`)
- 37.2 `CLAUDE.md` 與 `CLAUDE.local.md` 都受追蹤時,`init --private --orca` 仍把區塊加進後者(重現:+17 行)→ 改寫後對新目的地再查是否受追蹤
- 37.3 `registry.json` 是 symlink 讓安裝 exit 1(main 是 0)→ registry 問題只提醒、不經由 symlink 寫入、不影響退出碼
- 37.4 `.claude/skills` 連到 repo 外時 update 刪除並重建外部的 fw-roles(重現:KEEP 檔消失)→ roles 的安裝與刷新改走 install.mjs 的 `createWriter`
- 37.5 settings.json 是 repo 內 symlink 時留下半套安裝且印 ✅ done(重現);懸空的 `.claude` 會拋 ENOENT → **先預檢、後寫入**:
  同一條安裝路徑先 dry-run,任何必要路徑被拒就在第一個寫入前整個中止、列出路徑與原因、exit 1;預檢沒料到的中途停止印「未完成」;
  setup 在 doctor 失敗時不印成功;懸空 symlink 有自己的拒寫原因
- 37.6 symlink 防護的測試從 hooks 擴到 skills 目錄、settings.json、指令檔、roles skill;settings.json 案例原本目標雖沒被寫,但只回報「不是合法 JSON」並 exit 0 →
  合併寫入的設定檔改成讀取前先檢查
- 測試名稱收斂:36.3 改為只宣稱 hook 檔與 hooks 目錄;36.6 改為「skill 文字包含續走流程的指示(未驗證 agent 是否遵循)」

教訓:**「拒寫」與「完成」不能各自判斷**——逐檔拒寫、其餘照寫,最後一定會留下半套安裝和矛盾的成功訊息;判斷要在第一個寫入之前,用同一條程式的 dry-run 做完。

### 仍未解決(更新)

- `uninstall` 與 `roles apply`/`remove`/`assign` 的寫入仍未走受防護的 writer
- `--private` 下核心義務表若已在受追蹤檔,`--force`/update 仍會改寫(main 既有行為)
- 預檢與實際寫入之間樹被改動的情況只能事後回報「未完成」,沒有回滾(DECISIONS 2026-10-05 記重評條件)

## 第三輪修正(同日,f2d46b2..)

Astra 第三輪(原文 `docs/plans/setup.diff-review-astra-3.md`)確認第二輪五項修好,但判定不能合併,列五項合併前必修,驗收者全數採納。
先寫 38.1–38.5,用暫時複製的單組 smoke 分別跑出失敗(跑完即刪),再修:

- 38.1 `state-check.mjs` hardlink 到 STATE、skill 檔 hardlink 到 DECISIONS → update 把使用者資料蓋掉(重現)→ 所有寫入改成暫存檔 + rename;skill 目錄逐檔 rename
- 38.2 `.claude/skills` 連到 repo 外 → uninstall 刪掉外部 KEEP(重現);manifest symlink 到 `records/saved.json` → apply/assign 會覆寫 →
  uninstall 與 roles remove/apply/assign 全部改走受防護 writer 並先預檢;跨 repo roles 每個目標 repo 一個 writer(各自為邊界)
- 38.3 `.git/info/exclude` 是目錄時 `init --private` 印「privacy NOT in effect」卻 exit 0 + ✅(重現)→ exclude 寫不進去、或要排除的產物已受追蹤
  (含 `.flightwake/`)= 拒寫,預檢中止;**相容性變更**:main 對已受追蹤的 `.flightwake` 是警告照裝
- 38.4 `.claude` 是檔案時 init 先寫 STATE 才 ENOTDIR(重現)→ 預檢加祖先/目的地型別檢查;roles install 例外改為未完成訊息 + exit 1
- 38.5 新回歸:`--private` 下受追蹤且為 symlink 的 `.codex/hooks.json` 讓整個安裝被拒(重現:rc=1)→ 拿掉讀取前的提早檢查,只檢查實際會寫的目的地
- 測試面:37.2 補退出碼;37.4–37.6 的快照改用含 mtime 的 `fsnap`(同內容重寫也抓得到);36.2/37.2 的「先共享再轉私有」改為只追蹤指令檔
  (`.flightwake` 受追蹤時 private 不可能生效,改由 38.3 測);37.6 的 settings 案例改成指向會被寫入的 JSON 使用者紀錄
  (指向非 JSON 的 STATE 時本來就只會跳過——依「只檢查實際會寫的目的地」回 0 才對)

教訓:**「只檢查 symlink」防不了別名;改寫法(rename 取代)才能讓一整類問題消失**。另外,預檢要檢查的是「會寫的目的地」,
不是「碰得到的路徑」——檢查得太早,會把 main 本來合法跳過的情況變成拒裝。

### 已知限制(Astra 同意留到之後)

- 預檢與實際寫入之間樹被改動(競態)、磁碟耗盡等不可預測的 I/O 失敗:不回滾,只保證印「未完成」並以非零退出
- 放寬更多安全的 symlink 用法(例如 `CLAUDE.md → AGENTS.md`):目前一律拒寫,是記錄在案的相容性取捨
- `--private` 下核心義務表的 marker 若已在受追蹤檔,`--force`/update 仍會改寫(main 既有行為,未動)
