# Antigravity(agy)真機探針

- 目的:驗證 A2(`docs/plans/narrow-and-launch.md`)依官方文件寫的部分在真的 agy 上成立。
- 依據:antigravity.google/docs/hooks(2026-11-10 讀;頁面未標更新日)。文件**沒寫**的事:hook 指令的工作目錄、環境變數、exit code 語意、workspace hook 要不要信任、迴圈防護。
- 已知(Kai 2026-11-10 實測):agy 讀得到 `.agents/skills/fw-*`,能跑 `fw-coldstart`。
- 狀態:**已跑完,P1–P8 全部成立**(2026-11-10)。結果在每項的「結果」欄。

## 準備

在一個拋棄式 repo 做,不要在真專案上:

```bash
mkdir -p /tmp/agy-probe && cd /tmp/agy-probe && git init -q && git commit -q --allow-empty -m init
npx flightwake@<含 agy 的版本> init --agents=agy      # 發版前改用:node /Users/kaiwu/orca/flightwake/bin/cli.mjs init --agents=agy
git add -A && git commit -qm base
for i in 1 2 3; do git commit -q --allow-empty -m "w$i"; done   # 讓 STATE 落後 3 個 commit
```

## 項目

| # | 要驗的事 | 怎麼做 | 預期 | 結果 |
|---|---|---|---|---|
| P1 | agy 有沒有載入 workspace hook | 在 `/tmp/agy-probe` 開 agy,輸入 `/hooks` | 列出 `flightwake-state-check` 的 `Stop` | **成立**。`/hooks` → Stop 列出 `[flightwake-state-check] … (workspace)`,同列還有 Orca 的 `orca-status (global)` |
| P2 | 有沒有信任或確認提示 | 同上,第一次開時注意畫面 | 記下有或沒有、內容 | 有一次**資料夾**信任提示:「Do you trust the contents of this project? … read, edit, and execute files here」。沒有針對 hook 的提示;信任後 hook 直接載入 |
| P3 | Stop hook 會不會被呼叫、hook 指令能不能找到腳本 | 請 agy 做一件小事(例如「列出這個資料夾的檔案」)然後讓它結束回合 | agy 收到一則系統訊息說 STATE 落後 3 個 commit、要它跑 fw-record,並繼續工作 | **成立**。transcript 第 7 步是 `SYSTEM_MESSAGE`:「Stop hook blocked termination: flightwake: .flightwake/STATE.md lags 3 commits behind. Run fw-record …」,agy 接著又跑一輪 |
| P4 | 迴圈防護 | P3 之後不要讓它收尾,直接讓它再結束一次 | 第二次不再提醒(同一個對話、同一個 HEAD 只提醒一次) | **成立**。下一回合 Stop 有被呼叫(擷取到 `executionNum: 0`),但沒有再提醒;`$TMPDIR/flightwake-agy-stop/<conversationId>` 存的是 HEAD sha。`/clear` 開新對話後會再提醒一次(新的 conversationId),符合設計 |
| P5 | stdin 長什麼樣 | 在 `.agents/hooks.json` 暫時加一條 Stop:`{"type":"command","command":"cat > /tmp/agy-stop-stdin.json"}`,觸發一次後看那個檔 | 有 `conversationId`、`workspacePaths`、`terminationReason`,沒有 `hook_event_name` | **成立**。欄位:`conversationId`、`workspacePaths`、`terminationReason`(`NO_TOOL_CALL`)、`fullyIdle`、`executionNum`、`error`、`lastUserInput`、`modelName`、`transcriptPath`、`artifactDirectoryPath`;沒有 `hook_event_name`、`stop_hook_active`。環境變數另有 `ANTIGRAVITY_CONVERSATION_ID` |
| P6 | 工作目錄 | 同 P5,改成 `pwd > /tmp/agy-stop-cwd.txt` | 記下實際路徑;不在 repo 裡的話,`$(git rev-parse --show-toplevel)` 會找不到腳本,要改指令 | `<repo>/.agents`(hooks.json 所在的資料夾),不是 repo 根目錄。在 repo 裡,所以 `git rev-parse --show-toplevel` 找得到腳本,**指令不必改**;腳本也不能拿 cwd 當 repo 根目錄(`hooks/state-check.mjs` 已註明) |
| P7 | 義務表 | 在有 `.flightwake/` 的 repo 開新對話,只說「接手這個 repo」 | agy 自己先跑 `fw-coldstart`(依 `AGENTS.md` 的義務表) | **成立**。讀了 fw-coldstart 的 SKILL.md 與 STATE,補完未初始化的 STATE 再回報。連 P3 那句「列出檔案」它都先讀了 fw-coldstart |
| P8 | 其他三個 skill | 分別請它跑 `fw-trap`、`fw-record`、`fw-handoff` | 都找得到、照 skill 做 | **成立**。fw-trap 有把握度判斷與理由、錨點、`retire_when`;fw-record 做了去識別化掃描,commit 只含 record、STATE、TRAPS;fw-handoff 寫了 CONTEXT 與 DECISIONS |

跑的人與日期:主線 agent(Opus 5.5)透過 Orca 可見分頁操作 agy CLI 1.5.3(Gemini 4 Argon,medium),2026-11-10(Kai 開好 agy 後交給主線操作);拋棄式 repo 在 session scratchpad。
P5、P6 用同一條暫加的 Stop hook 一次擷取 stdin、cwd、env。

**附帶觀察(各只看到一次,當線索)**:
- 被 flightwake 擋下的那一次 Stop(`executionNum` 0)沒有擷取到,繼續後的那一次(`executionNum` 1)才有。看起來 agy 依名稱順序跑 Stop hook,遇到擋下就不跑後面的;Orca 的 `orca-status` 在那一次可能也沒跑,下一次才跑。
- `executionNum` 可以當成迴圈防護(大於 0 就是被擋下後繼續的那一輪),但目前的 `agyOnce` 已經夠用,沒改。
- fw-trap 照 skill 先跑 `npx flightwake traps similar`,npm 上的 0.17.0 還沒有這個指令,所以失敗;agy 改成直接寫入。0.18.0 發佈後就會好。
- 模型本身的瑕疵:fw-record 把 health 標成 green,依據只是 `state-check --ci` 通過;fw-handoff 寫 stdin 有 `trajectoryId`、`status`,實際上沒有這兩個欄位。都和安裝無關。
- `uninstall` 只拿掉 flightwake 那一條,暫加的 hook 和 Orca 的 hook 都留著;registry 登記也一併移除。

做完把 P5、P6 暫加的那兩條 hook 刪掉。

## 依結果的處置

- P3 沒觸發而 P6 顯示工作目錄不在 repo:改 `HOOK_CMD_GIT` 對 agy 的寫法(例如用絕對路徑或 `cd` 到 `workspacePaths`),在 `bin/install.mjs` 的 4c 段。
- P4 一直重複提醒:`hooks/state-check.mjs` 的 `agyOnce` 沒生效,先看 `$TMPDIR/flightwake-agy-stop/` 有沒有檔。
- P5 的欄位和文件不同:改 `state-check.mjs` 的 `AGY` 判斷。
- P7 沒有自己跑:義務表在 agy 上只能靠人提醒,文件要寫明。
- 全部成立:`docs/multi-agent.md` 的「真機驗證」欄改成「有」,`bin/doctor.mjs` 拿掉 agy 的「尚未真機驗證」提示,TRAPS 不必登記。
