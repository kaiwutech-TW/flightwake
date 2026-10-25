<!-- flightwake TRAPS — 坑 registry。非顯而易見、會再咬人的事實。 -->
<!-- 條目採 OKF 式慣例:frontmatter 區塊 + 內文;可用 [[名稱]] 互連。新的加最上面。 -->
<!-- 時效:條目過時(功能合併/重構後不再成立)不刪 — status 改 superseded 並指向取代者;讀的人只信 active。 -->

# 坑 Registry

---
name: plugin-test-kit-denies-unanswered-permission-request
type: gotcha
status: active
tags: [claude-code, mods, testing, fleet, permission]
discovered: 2026-10-26
confidence: probable
paths: ["mods/flightwake/tests/fleet.test.ts"]
commands: ["claude plugin test"]
---

**症狀**:`claude plugin test mods/flightwake` 在 Claude Code 2.1.310(子代理回報 2.1.309 相同)出現 25 個 fleet 測試失敗(13 permission、6 question/plan、4 parallel/ESC/寫入量/順序、1 reload、1 privacy),clean HEAD(`git archive HEAD`)同一組 25 個;2026-10-19 在 2.1.303 是 501/501。典型斷言:預期 `state: "blocked", why: "permission-dialog"`,實得 `state: "working", why: "unblocked:tool-done"`。
**根因**:測試底層的 `tool.call` hook 自己呼叫 `$.tool.check`(得 `ask`)與 `$.classic.PermissionRequest`(回 `{}`,沒人答),然後把呼叫掛住等 `release`。2.1.310 下 mod 的 hooks 都有跑(check、perm 配對、evidence 設起),但 mod 的 `tool.call` 的 `next(e)` 在底層還掛著時就回了 `Permission to use Bash has been denied…`——推測新版測試環境對「沒人回答的權限請求」直接判拒絕並結束呼叫。機制未看到原始碼(2.1.310 型別不在磁碟上),只用 toast 探針觀察到。和 [[permission-request-has-no-tool-use-id]]、[[plugin-tool-check-cannot-carry-tool-use-id-in-tests]] 不同:那兩條是引擎輸入欄位,這條是測試環境行為隨版本改變。
**解法/繞法**:未修。判斷新功能是否打壞東西時,拿 `git archive HEAD` 的乾淨副本跑同一版 `claude plugin test`,比對失敗清單(`grep '^(fail)' | sed 's/ \[.*//' | sort` 後 diff)。要修得先拿到 2.1.310 的 testing 型別/文件,找出讓權限請求保持「等待中」的方式;真引擎(互動 session)是否也改了行為要另做真機驗證。
**佐證**:2026-10-26 本 session:基線與工作樹失敗清單 diff 相同(SAME-SET);探針副本在 scratchpad `modprobe/`,toast 顯示 `PROBE check {decision:ask}`、`PROBE perm {r:{}, asks 已配對, inFlight 有該 id}`、`PROBE next-resolved … Permission to use Bash has been denied`。record [[261026-traps-similar-and-trips]]

---
name: codex-dollar-skill-enter-eaten-by-picker
type: gotcha
status: active
tags: [codex, orca, fleet-console, skills, input]
discovered: 2026-10-19
confidence: confirmed
paths: ["mods/flightwake/hooks/lib/orca.ts", "mods/flightwake/hooks/features/panel.ts"]
---

**症狀**:中控台對 Codex 按「收尾」→「確定送出 $fw-record」,`orca terminal send --text '$fw-record' --enter` 回 `accepted: true`、寫入 23 bytes,Codex 卻沒開始做事;Orca 回執附警告「no turn start was observed, so the Enter may have been swallowed」。`orca terminal read` 的畫面與串流都看不到這段字。
**根因**:Codex 0.163 輸入框打 `$` 會開 skill 選單,同一次寫入裡的 Enter 被選單拿去「選取」,不是送出;字留在輸入框草稿。Orca 的 `terminal read` 把輸入框草稿放在另外的 `draft` 欄位,不在 `tail` 裡,所以看起來像什麼都沒收到。Claude Code 的 `/fw-record` + Enter 不受影響。
**解法/繞法**:對 Codex 送 `$skill` 時,文字與 Enter 分兩次送(中間等選單出現),或送完後用 `--wait-submit` / 回執的 `turn_started` 確認真的開始;驗證時讀 `terminal read --screen --json` 的 `draft`。中控台的 Codex 收尾已改成送完讀回 `draft`,仍是原指令才補一次 Enter(2026-10-19,`pressEnterIfHeld`;真機複驗見 record)。
**佐證**:2026-10-19 真機:panel 送出後 Codex 草稿為 `"$fw-record"`;手動再送一次 Enter 才開始執行 fw-record。Orca 1.4.229、Codex 0.163.0、mod 0.3.0

---
name: orca-send-sgr-mouse-leaks-into-claude-composer
type: gotcha
status: active
tags: [orca, claude-code, mods, testing, panel]
discovered: 2026-10-19
confidence: probable
---

**症狀**:想用 `orca terminal send --text $'\e[<0;C;RM\e[<0;C;Rm'` 模擬點擊側邊面板的按鈕來真機驗證;一次「跳過去」有效,之後的點擊沒觸發按鈕,放開序列 `\e[<0;166;20m` 以文字留在 Claude Code 輸入框,接著送的 `/exit` 變成一般訊息送給模型。
**根因**:未追到底。合成的滑鼠序列是否被當成滑鼠事件,看 Claude Code 當下的輸入狀態;失敗時整段序列進了輸入框。
**解法/繞法**:真機操作面板改用鍵盤:ctrl+x tab 讓面板取得焦點,Tab 移動、Enter 按下。帶 `--debug-file` 啟動,log 的 `ui.focus Pane flightwake (person) onto flightwake-mod's <key>` 會寫出焦點落在哪個按鈕,`ui.press flightwake-mod/<key>` 證明按下;送任何指令前先讀 `draft` 確認輸入框是空的(ctrl+c 清空)。
**佐證**:2026-10-19 中控台真機驗證(Claude Code 2.1.303、Orca 1.4.229);鍵盤方式完成跳過去、收尾、取消、確定送出四種按下

---
name: wrangler-pages-create-delegates-to-workers
type: gotcha
status: active
tags: [cloudflare, wrangler, pages, astro]
discovered: 2026-10-11
confidence: suspected
paths: ["website/astro.config.mjs", "website/package.json", "website/wrangler.jsonc"]
commands: ["wrangler pages project create"]
---

**症狀**:在 `website/` 執行 Wrangler 4.149.0 的 `pages project create flightwake --production-branch main`,CLI 印出 `Delegating to the latest version of Cloudflare Pages, now part of Cloudflare Workers`、`Configuring project for Astro with "astro add cloudflare"`,改了 package/config/tsconfig,直接部署到 `flightwake.witkaiy.workers.dev`;`wrangler pages project list` 仍沒有 `flightwake`。
**根因(暫定)**:這個版本在此 Astro 專案與命令組合下把 Pages 建立請求導向 Workers 的 framework configure + deploy 流程;尚未排除是否與本機已登入的 account、新版預設或專案名稱衝突有關。
**繞法**:建立純靜態 Pages 專案時,用 Cloudflare Pages API 的 `POST /accounts/{account_id}/pages/projects` 建立 Direct Upload 專案;在 Astro 目錄外執行 `wrangler pages deploy website/dist --project-name flightwake --branch main`。先核對 Pages project list 確有該專案。若誤觸,用 git diff 核對並還原 CLI 自動改寫的本地檔案;額外建立的 Worker 另行處理。
**佐證**:2026-10-11 本 session 的 Wrangler 4.149.0 CLI 輸出與 `git diff -- website`,對照 `wrangler pages project list --json` 無 flightwake;改用 Pages API 建立後,從 `/tmp` 執行 `wrangler pages deploy` 成功,`flightwake.pages.dev` HTTP 200。官方文件: https://developers.cloudflare.com/pages/get-started/direct-upload/

---
name: init-flags-on-private-install-drop-private
type: gotcha
status: active
tags: [install, private, cli, hints]
discovered: 2026-10-11
confidence: confirmed
paths: ["bin/install.mjs", "bin/cli.mjs", "bin/setup.mjs", "bin/doctor.mjs"]
commands: ["npx flightwake init"]
---

**症狀**:`--private` 安裝(`git status` 乾淨)上照著提示跑 `npx flightwake init --statusline`,`git status --porcelain` 出現 `?? .claude/`——共用、會被 commit 的 `.claude/settings.json` 被寫出來,隱私安裝悄悄變成一半共用。
**根因**:`resolveOptions` 只在 update 時繼承既有的 private(`private: flags.private || (update && det.private)`),init 不帶 `--private` 就是共用安裝。任何對既有安裝說「跑 init 加某旗標」的提示(儀表提示、語言提示、非 TTY 的 setup 說明、覆蓋手改警告、doctor 的不一致提示)都會把 private 丟掉。
**解法/繞法**:對已安裝的 repo 一律提示 `npx flightwake update --<flag>` / `update --lang=` / `update --agents=` 與 `roles install`(update 沿用 private/儀表/profile/語言);init 的例子只給全新 repo。smoke 46.6 驗 private 安裝上非 TTY setup 與覆蓋警告的輸出不含 `init --`。
**佐證**:2026-10-11 在 scratchpad 兩次重現:`init --private --agents=claude` 後 `[]`,再 `init --statusline --agents=claude` → `[?? .claude/ ]`;對照組 `update --statusline` → `[]`(b4db041,安裝/升級流程修正這輪)

---
name: intl-locale-mirrors-posix-env
type: gotcha
status: active
tags: [node, intl, locale, macos, setup]
discovered: 2026-10-11
confidence: confirmed
paths: ["bin/install.mjs"]
---

**症狀**:想用 `Intl.DateTimeFormat().resolvedOptions().locale` 當「OS 語系」的後備,但在系統語言是繁中(`defaults read -g AppleLocale` = `zh_TW`)的 macOS 上,LANG/LC_* 全不設時 Node 回 `en-US`;`LANG=C` 也是 `en-US`;`LC_MESSAGES=`(空字串)+ `LANG=ja_JP.UTF-8` 竟回 `und`。
**根因**:Node 的 ICU 預設語系取自 POSIX 環境變數(LC_ALL → LC_MESSAGES → LANG),不讀 macOS 的 AppleLocale;沒設就用 ICU 的預設 en-US,有變數但是空字串時解析成 `und`。所以在 macOS(Linux 同理,但本輪未在 Linux 實測)Intl 不是獨立訊號,只是環境變數的鏡子;只有 Windows 上才可能多給資訊。
**解法/繞法**:`detectLocale` 先看三個環境變數(第一個**非空**的為準,C/POSIX 就停),三者皆空才問 Intl;`localeToLang` 把 `und`/`c`/`posix` 都當 en。不要拿 Intl 推論「使用者的 OS 是什麼語言」。
**佐證**:2026-10-11 Node v26.9.0 / macOS 實測(unset → en-US、C → en-US、zh_TW.UTF-8 → zh-TW、ja_JP.UTF-8 → ja-JP、空 LC_MESSAGES + ja → und);smoke 46.1 的對照表

---
name: permission-request-has-no-tool-use-id
type: gotcha
status: active
tags: [mods, claude-code, permission, fleet, hooks]
discovered: 2026-10-11
confidence: confirmed
paths: ["mods/flightwake/hooks/features/fleet.ts", "mods/flightwake/tests/fleet.test.ts"]
---

**症狀**:F7 要知道「哪個 tool call 的權限對話框開著」,但 `classic.PermissionRequest` 的 `e` 沒有 `tool_use_id`,無法直接對到 `tool.call` 的那一筆;用工具名稱亂配會把別的 call 的對話框清掉(R2 PermissionDenied 用工具名稱 fallback 時,auto-mode classifier 拒絕的另一個 Bash 就清掉了開著的 Bash 對話框)。
**根因**:引擎型別 `PermissionRequestHookInput = BaseHookInput & { tool_name; tool_input; permission_suggestions?; mcp_server? }`(claude-code.d.ts 2.1.289 第 7175 行),沒有 id;`PermissionDeniedHookInput` 反而必有 `tool_use_id`(第 7151 行)。另外 AskUserQuestion / ExitPlanMode 也走權限路徑(check 為 `ask`、會觸發 PermissionRequest),同一個 call 會先有 question/plan 證據、再來一個 permission。
**解法/繞法**:`tool.check` 結果為 `ask` 時記下 `tool_use_id → tool`,PermissionRequest 再按工具名配「最舊、未配對、仍在飛行中」的那筆;配到的 key 若已有 question/plan 證據就保留它(kind 與 since 不變——since 是讀者的去重鍵);沒有任何同名 call 在飛行中就不設 blocked(那個 call 已結束,沒人會清)。PermissionDenied 只清自己 `tool_use_id` 的證據,不按工具名。
**佐證**:fleet.test.ts「AskUserQuestion through the permission dialog as well」「PermissionDenied for another call」「a PermissionRequest for no running call」;F7 複審 2026-10-11 R1/R2 各條

---
name: render-hook-state-set-refused-and-after-may-drop
type: gotcha
status: active
tags: [mods, claude-code, ui-render, state, clock]
discovered: 2026-10-11
confidence: confirmed
paths: ["mods/flightwake/hooks/features/fleet.ts", "mods/flightwake/tests/fleet.test.ts"]
---

**症狀**:在 `ui.render`(ToolProgress)hook 裡更新 `$.state` 會被拒;改用 `$.clock.after(0, …)` 延後後,若用旗標「已排一個 after(0)」去重,一旦那次 after 被拒,旗標永遠不復位,之後所有清除都被吞掉,紀錄卡在 blocked(心跳還一直把它寫成新鮮的)。
**根因**:d.ts:`$.state.set` 「Refused while a `ui.render` hook draws」(第 3303 行);`$.clock.after`「`fn` runs when it resolves, and never when a hook refuses it」(第 3349 行附近),而且回傳的 Timer 不會告訴你被拒了。
**解法/繞法**:render 裡只改模組記憶體,寫入延到 `after(0)`;去重旗標要能被任何一次重新推導(`apply`)清掉,`after` 丟例外時也清;寫檔前若 `state === 'blocked'` 卻沒有證據就先重新推導(blocked 與 null 永不同時寫出);call 結束時發現同樣情況也重新推導。
**佐證**:fleet.test.ts「a ToolProgress clear whose after(0) is refused」兩則(測試用包住 mock.clock 的 on 來拒絕 after(0))

---
name: classic-hook-empty-matcher-accepted
type: constraint
status: active
tags: [mods, claude-code, plugin-loader, classic-hooks]
discovered: 2026-10-11
confidence: confirmed
paths: ["mods/flightwake/hooks/features/fleet.ts"]
commands: ["claude plugin validate mods/flightwake"]
---

**症狀**:不確定 `on('classic.PermissionRequest', {}, hook)` 這種在 classic 事件上用空 matcher 的寫法載入器收不收(spec §6 要求若被拒就改成不帶 matcher 並記錄)。
**根因**:無——實測接受。
**解法/繞法**:F7 的 `classic.SessionStart` / `classic.PermissionRequest` / `classic.PermissionDenied` 都用 `{}`。`claude plugin validate mods/flightwake` 通過(2026-10-11,2.1.289 型別),`claude plugin test` 實際載入整個 hooks module 並觸發這三個事件(fleet.test.ts)。若日後 validate 拒絕,因為每個事件只有 F7 一個註冊,可以直接改成不帶 matcher。
**佐證**:2026-10-11 `claude plugin validate mods/flightwake` → ✔ Validation passed;fleet.test.ts /clear、權限各則

---
name: plugin-tool-check-cannot-carry-tool-use-id-in-tests
type: gotcha
status: active
tags: [mods, claude-code, testing, permission]
discovered: 2026-10-11
confidence: confirmed
paths: ["mods/flightwake/tests/fleet.test.ts", "mods/flightwake/tests/world.ts"]
---

**症狀**:測試想模擬「引擎把 call 交給模式的決策者」(`tool.check` 帶 `tool_use_id`),從外掛自己的 `$.tool.check` 查詢發出去的永遠沒有 id,K1 不記、R1 永遠配不到,看起來像配對邏輯壞了。另:測試的 `on` 同一事件只能註冊一次(第二次整個 hooks module 不載入:`on("clock.after") registered twice`),所以不能在 `mock.clock` 之外再掛一個 `clock.after`。
**根因**:只有引擎(也就是測試的 `$`)raise 的 `tool.check` 會帶 id;外掛的 `$.tool.check` 是查詢,沒有 call 可對。測試 kit 每個事件只收一個測試 hook。
**解法/繞法**:在最底層的測試 `tool.call` hook 裡,用測試自己的 `$`(closure 抓住的引擎 `$`)raise `$.tool.check({ tool, input, tool_use_id })` 與 `$.classic.PermissionRequest(...)`;要改寫 mock 的行為(例如拒絕 after(0))就把包過的 `on` 傳給 `mock.clock`,在它註冊時包住 handler。
**佐證**:fleet.test.ts 檔頭註解與 `boot()`(`onClock` 包裝、`isAfter0Refused`)

---
name: mod-installed-into-running-session-is-invisible-until-restart
type: gotcha
status: active
tags: [mods, claude-code, plugin-loader, install, doctor, session]
discovered: 2026-10-09
confidence: confirmed
paths: ["bin/install.mjs", "docs/mod*.md", "mods/flightwake/**"]
commands: ["npx flightwake init --mod", "npx flightwake update", "npx flightwake setup"]
---

**症狀**:在本 repo `update`/`init --mod` 裝好 `.claude/skills/flightwake-mod/` 後,`doctor` 回報 `ok flightwake-mod v0.1.0`、`Claude Code 2.1.294(mod 需要 2.1.287 以上)`、失敗 0,但正在用的 Claude Code session 裡什麼都沒變:沒有 `/fw-mod`、`/fw-log`,system prompt 沒有 STATE 快照,輸入框上方沒有 band——看起來像 mod 壞了。
**根因**:hooks module 只在 Claude Code **程序啟動時**載入;`.claude/skills/` 不是熱監看的資料夾(只有 `~/.claude/dev-mods/<session>/` 與 `--plugin-dir` 會熱重載)。這次的 session 程序(pid 72962,`~/.claude/sessions/72962.json`)是 2026-10-04 以 2.1.289 啟動的,mod 2026-10-09 03:34 才裝進去;同一資料夾用新程序實跑(`claude -p --debug-file`,2.1.294)debug log 就有 `hooks module flightwake-mod@skills-dir loaded` 與 `plugin.register: flightwake-mod … admitted`。坐實:舊 session 無 `/fw-mod`、無快照段;2026-10-09 重開 session 後 `/fw-mod` 列出五項且 stateInject 回報「已在本 session 注入 STATE」——同一資料夾、同一安裝,只差程序重啟。
**解法/繞法**:裝完 mod 要**重開 Claude Code session**(從 repo 根目錄、同一個已信任的資料夾),再跑 `/fw-mod` 確認。安裝器那一半已補(2026-10-11,安裝/升級流程修正這輪,b4db041):`printModNotes` 在 init / `update --mod` / setup 加裝 mod 時都印「已開著的 Claude Code 要結束、從 repo 根目錄重開」,setup 的 mod 列也寫明;`doctor` 那一半仍待補(它只說用 `/fw-mod` 確認有載入,沒提重開)。另注意:就算載入了,band 在 `statusline.mjs` 是生效中狀態列時刻意安靜,所以「看不到東西」不等於沒載入——`/fw-mod` 才是判準。
**佐證**:`~/.claude/sessions/72962.json`(procStart Oct 4 16:22、version 2.1.289);`.claude/skills/flightwake-mod/hooks` mtime Oct 9 03:34;scratchpad `dbg.txt` 第 452、459 行(2026-10-09 headless 實跑);plugin-authoring skill 說明「hot reloading」只及於 dev-mods 與 `--plugin-dir`
**補充(2026-10-11,2.1.296)**:反向情況不成立——**已載入的 mod 檔案被改動會在同一個 session 內重新載入**。證據:本 session 程序(pid 17296)是 2026-10-10 23:34 以 `claude --resume` 啟動,workflow agent 於 2026-10-11 14:59–15:02 用 `node bin/cli.mjs update` 覆寫 `.claude/skills/flightwake-mod/hooks/*`,F7 fleet 14:59:51 就開始寫 `~/.flightwake/sessions/<本 session id>.json`,使用者之後跑 `/fw-mod` 看到 v0.2.0 七個開關含 fleet 行,全程沒重開。副作用:module memory 歸零(`/fw-mod` 的 spend 列顯示「token 不明」)。所以「要重開」只確定適用於**新裝**的 mod 資料夾;升級既有 mod 後先用 `npx flightwake fleet` 或 `/fw-mod` 看是否已自動重載。使用者層記憶 `claude-code-plugins-load-at-process-start` 已同步。

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
status: superseded
tags: [setup, readline, tty, orca, terminal]
discovered: 2026-10-05
confidence: probable
paths: ["bin/setup.mjs"]
---

**已不再觸發**(2026-10-19):`bin/setup.mjs` 已用 `terminal: false`,smoke 43.1 斷言輸出無游標/清除序列;保留作歷史,改問答程式時看 smoke 43.1 即可。

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
status: superseded
tags: [test, smoke, python, macos, environment]
discovered: 2026-10-05
confidence: confirmed
---

**已併入** [[smoke-needs-python-311]]:兩條內容相同,2026-10-19 壓實時保留帶指令比對、hook 會提醒的那條。

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
confidence: confirmed
---

**症狀**:mod 放在暫存 repo 的 `.claude/skills/flightwake-mod/`,`claude -p` 跑起來完全沒載入(沒有系統提示區段、沒有 /fw-log,debug log 也沒提到它);同一資料夾以互動模式接受工作區信任後,立刻以 `flightwake-mod@skills-dir` 載入。
**根因**:專案 skills 目錄的外掛只在資料夾**已受信任**時採用;`-p` 跳過信任對話框但不等於授予信任(與 Astra 審查的警告一致)。只觀察一組對照(同資料夾、信任前 -p 不載、信任後互動載入),2026-10-19 補上信任後 `-p` 的對照,見佐證。
**解法/繞法**:驗收真機載入要用互動 session 並接受信任(或改 `--plugin-dir` 驗功能,但那驗不到 skills-dir 路徑);文件與安裝器要說明「首次需信任此資料夾」。
**佐證**:records/261005-flightwake-mod.md「真機載入」(load-debug.log vs load-debug4.log);2026-10-19 複驗(Claude Code 2.1.303,同版 mod):未信任暫存 repo 的 `claude -p` debug log 完全沒有 flightwake-mod(4 個專案 skill 照常載入),已信任的本 repo `claude -p` 有 `hooks module flightwake-mod@skills-dir loaded` 與 `plugin.register … admitted`;`-p` 跑完也沒有替暫存資料夾寫入信任紀錄

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
**佐證**:同一 commit,PATH 換成 Python 3.13 後 smoke 全過(records/261005-flightwake-mod.md);原 smoke-needs-python311-tomllib 併入本條,其佐證為 main 9dd685c 與 setup-wizard 分支各一次(record 261005-setup-wizard 驗證段);2026-10-19 複驗:`/usr/bin/python3` 仍是 3.9.6、smoke 第 637 行仍 import tomllib,PATH 換 3.13 後 smoke 全過

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
confidence: probable
---

**症狀**:在暫存 repo 放 `.codex/hooks.json`(SessionStart/Stop/UserPromptSubmit 探針 hook,寫檔留痕),用 `codex exec` 跑,探針檔始終沒有產生。加 `--dangerously-bypass-hook-trust`、`-c 'projects."<path>".trust_level="trusted"'`、放在已信任的 `~` 底下、補空的 `.codex/config.toml`,全都一樣。輸出裡的 `hook: SessionStart` 行是全域 `~/.codex/hooks.json`(Orca 的 hook)觸發的,不是專案 hook。
**根因**:Codex 只執行有持久化 hook 信任的專案 hook。0.163 的 `codex exec --help` 對 `--dangerously-bypass-hook-trust` 的說明是「Run enabled hooks without requiring persisted hook trust」;新專案的 hook 沒有信任紀錄,所以不跑。但 0.157 時加這個旗標也沒跑,0.163 加旗標的情況未驗。真實 repo 的 Stop hook 是在 TUI 裡被信任過(`~/.codex/config.toml` 的 `[hooks.state]` 有 trusted_hash)才生效。
**解法/繞法**:不要用 `codex exec` 驗證新的專案 hook,改在 TUI 開新對話、信任 hook 後再驗。需要「/clear 後仍在」的內容,優先寫進 `AGENTS.md`,它不需要信任就會載入。實測 Codex 0.157.0 只讀 AGENTS.md、不讀 CLAUDE.md,Claude Code 2.1.283 則相反。
**佐證**:2026-09-27 roles 調研,Codex 0.157.0;同一個 hook 腳本在 Claude Code `claude -p` 下的 SessionStart 注入實測成功;2026-10-19 複驗(Codex 0.163.0):暫存 repo 放 SessionStart/UserPromptSubmit/Stop 探針,`codex exec` 跑完探針檔沒產生,畫面上的 hook 行全來自全域 `~/.codex/hooks.json`;`~/.codex/config.toml` 前後雜湊相同。加旗標的重跑被 Claude Code auto mode 擋下,未做

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
status: superseded
tags: [ci, github-actions, dependabot, codeql]
discovered: 2026-07-27
confidence: confirmed
---

**已不再觸發**(2026-10-19):`.github/dependabot.yml` 的 codeql-action group 已把三個 step 併成單一 PR,三處同釘 e4fba86(v4.37.3);保留作歷史,手動升版時仍要三處一起換。

**症狀**:dependabot 開的 codeql-action 升版 PR,CI 紅在 `##[error]Loaded a configuration file for version '4.37.1', but running version '4.37.3'` → `CodeQL job status was configuration error`。PR 內容本身只是換一行 SHA,看起來完全無辜。
**根因**:`github/codeql-action/init`、`analyze`、`upload-sarif` 在 dependabot 眼中是**三個獨立套件**,會拆成三個 PR;但 CodeQL 要求同一 workflow 內所有 codeql-action step 同版,任一 PR 單獨存在時 branch 上就是 init 舊版 + analyze 新版。init 步驟其實有先警告(`Not all workflow steps that use github/codeql-action actions use the same version`),但它只是 warning,真正炸在 analyze。
**解法/繞法**:`.github/dependabot.yml` 用 `groups` 把 `github/codeql-action*` 併成單一 PR(已設,2026-07-27)。若手動升版:三處 SHA 一起換。看到 configuration error 先 `grep codeql-action .github/workflows/` 比對版本註解,別去查 CodeQL 設定檔。
**佐證**:PR #1/#4/#5(2026-07-26 dependabot 批次),失敗 run 30184467406;2026-10-19 複驗:init、analyze、upload-sarif 同釘 e4fba86(v4.37.3),dependabot 的 codeql-action group 仍在

---
name: gh-active-account-drift
type: gotcha
status: active
tags: [gh, github, multi-account]
discovered: 2026-07-23
confidence: probable
---

**症狀**:`gh release create` 失敗說 "workflow scope may be required";或 `git push` 403 denied to 另一個帳號——明明這個 session 剛 `gh auth switch` 成功過。
**根因**:gh 的 active account 是**全域狀態**,其他 session/終端切帳號會直接影響本 session;且錯誤訊息誤導——說缺 workflow scope,實際是 active 帳號對 repo 無權限。
**解法/繞法**:本 repo 任何 gh 或 push 操作**前**先 `gh auth switch -u kaiwutech-TW`(別信上次的切換還在);看到 workflow scope 錯誤先 `gh auth status` 查 active 帳號,不要急著 `gh auth refresh` 加 scope。
**佐證**:[[260723-v0100-release]](push main 成功後、開 Release 前被切回 kaiwu-aideamed);2026-10-19 複驗:gh 目前只登入 kaiwutech-TW 一個帳號,無法重現;active 帳號記在全域 `~/.config/gh/hosts.yml` 的機制不變

---
name: hook-stdin-tty-block
type: trap
status: active
tags: [hooks, node, stdin]
discovered: 2026-07-19
confidence: confirmed
---

**症狀**:hook/statusline 腳本手動執行(終端機直接跑、沒接 pipe)時永久卡住,無錯誤訊息。Node 26 下則可能直接丟 `EAGAIN: resource temporarily unavailable, read`,不卡;兩種都是讀不到。
**根因**:`readFileSync(0)` 在 stdin 是 TTY 時等 EOF 等不到——Claude Code 情境永遠 pipe JSON 進來所以沒事,手動測試必卡。
**解法/繞法**:所有讀 stdin 的 hook 開頭先判 `process.stdin.isTTY`,是 TTY 就跳過讀取。**已咬兩次**:state-check 2026-07-17 修過(dashboard 手測 2 分鐘 timeout 坐實),statusline 2026-07-18 新寫時重犯——寫任何新 hook 前查本條。
**佐證**:salesmartly_chain repo TRAPS 同名條目(當時只記在那邊,本 repo 漏登,故重犯);2026-10-19 複驗(Node 26.9.0,`script` 偽終端機且輸入保持開著):未防護的 `readFileSync(0)` 丟 EAGAIN,`hooks/statusline.mjs` 有 isTTY 防護、正常輸出;兩份 hook 與安裝副本都有防護

---
name: dogfood-dual-copy-drift
type: gotcha
status: active
tags: [dogfooding, hooks, release]
discovered: 2026-07-18
confidence: confirmed
---

**症狀**:修了 statusline/hook 的 bug,本機儀表變正常,但發版後使用者拿到的還是舊行為(或反過來:改了源頭,本機看不到效果)。
**根因**:本 repo dogfood 自己——同一份 hook 存在兩處:`hooks/`(npm 發佈的源頭)與 `.flightwake/hooks/`(本 repo 的安裝副本)。改任一邊都不會自動同步另一邊。
**解法/繞法**:改 hook/skill 時兩份都要動(改完源頭跑 `node bin/cli.mjs update` 刷新本 repo 副本;直接 diff 兩份永遠會差 `LANG` 與 `FW_VERSION` 兩行,那是安裝時代入的值,不算漂移);已在其他 repo 裝過的副本(如 kaiwuweb)npm 發版前只能手動 cp。
**佐證**:4b9abd8(context_window 修正,當下先改了安裝副本、diff 才發現源頭沒動);2026-10-19 複驗:`.flightwake/hooks/` 仍是獨立副本,state-check 與 statusline 只差安裝代入的兩行

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

---
name: mod-test-kit-no-ui-close-no-state-noun
type: gotcha
status: active
tags: [claude-code, mod, tests]
discovered: 2026-10-11
confidence: confirmed
paths: ["mods/flightwake/tests/**"]
---

**症狀**:mod 測試裡寫 `$.ui.close({ id, origin: { kind: 'person' } })` 或 `$.state.set(...)`,得到 `$.ui.close is not a function` / `undefined is not an object (evaluating '$.state.set')`。
**根因**:`claude plugin test` 給測試的 `$` 只有 kit 自己的 `ui` 名詞(mount / render / press / input / select),沒有 close;也沒有 `state` 名詞(Claude Code 2.1.296)。因此「使用者手動關 pane」(`ui.close` origin person)無法從測試觸發。
**解法/繞法**:要預放某個 `$.state` 值,就在測試裡自己掛 `on('state.get')` / `on('state.set')` 以 Map 回答(band.test.ts、panel.test.ts 的作法),session.start 之後再寫 Map。person 關閉的行為只能真機驗。
**佐證**:[[261011-mod-side-panel]]
