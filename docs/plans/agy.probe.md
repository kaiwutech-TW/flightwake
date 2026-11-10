# Antigravity(agy)真機探針

- 目的:驗證 A2(`docs/plans/narrow-and-launch.md`)依官方文件寫的部分在真的 agy 上成立。
- 依據:antigravity.google/docs/hooks(2026-11-10 讀;頁面未標更新日)。文件**沒寫**的事:hook 指令的工作目錄、環境變數、exit code 語意、workspace hook 要不要信任、迴圈防護。
- 已知(Kai 2026-11-10 實測):agy 讀得到 `.agents/skills/fw-*`,能跑 `fw-coldstart`。
- 跑的人:Kai。結果填在每項的「結果」欄,填完交回主線 agent。

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
| P1 | agy 有沒有載入 workspace hook | 在 `/tmp/agy-probe` 開 agy,輸入 `/hooks` | 列出 `flightwake-state-check` 的 `Stop` | |
| P2 | 有沒有信任或確認提示 | 同上,第一次開時注意畫面 | 記下有或沒有、內容 | |
| P3 | Stop hook 會不會被呼叫、hook 指令能不能找到腳本 | 請 agy 做一件小事(例如「列出這個資料夾的檔案」)然後讓它結束回合 | agy 收到一則系統訊息說 STATE 落後 3 個 commit、要它跑 fw-record,並繼續工作 | |
| P4 | 迴圈防護 | P3 之後不要讓它收尾,直接讓它再結束一次 | 第二次不再提醒(同一個對話、同一個 HEAD 只提醒一次) | |
| P5 | stdin 長什麼樣 | 在 `.agents/hooks.json` 暫時加一條 Stop:`{"type":"command","command":"cat > /tmp/agy-stop-stdin.json"}`,觸發一次後看那個檔 | 有 `conversationId`、`workspacePaths`、`terminationReason`,沒有 `hook_event_name` | |
| P6 | 工作目錄 | 同 P5,改成 `pwd > /tmp/agy-stop-cwd.txt` | 記下實際路徑;不在 repo 裡的話,`$(git rev-parse --show-toplevel)` 會找不到腳本,要改指令 | |
| P7 | 義務表 | 在有 `.flightwake/` 的 repo 開新對話,只說「接手這個 repo」 | agy 自己先跑 `fw-coldstart`(依 `AGENTS.md` 的義務表) | |
| P8 | 其他三個 skill | 分別請它跑 `fw-trap`、`fw-record`、`fw-handoff` | 都找得到、照 skill 做 | |

做完把 P5、P6 暫加的那兩條 hook 刪掉。

## 依結果的處置

- P3 沒觸發而 P6 顯示工作目錄不在 repo:改 `HOOK_CMD_GIT` 對 agy 的寫法(例如用絕對路徑或 `cd` 到 `workspacePaths`),在 `bin/install.mjs` 的 4c 段。
- P4 一直重複提醒:`hooks/state-check.mjs` 的 `agyOnce` 沒生效,先看 `$TMPDIR/flightwake-agy-stop/` 有沒有檔。
- P5 的欄位和文件不同:改 `state-check.mjs` 的 `AGY` 判斷。
- P7 沒有自己跑:義務表在 agy 上只能靠人提醒,文件要寫明。
- 全部成立:`docs/multi-agent.md` 的「真機驗證」欄改成「有」,`bin/doctor.mjs` 拿掉 agy 的「尚未真機驗證」提示,TRAPS 不必登記。
