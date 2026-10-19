---
record_id: 261019-console-realmachine
session: Claude Code (Opus 5.5), 2026-10-19
date: 2026-10-19
repos: [flightwake]
tests: claude plugin test mods/flightwake 501 pass / 0 fail(單獨執行);claude plugin validate --strict 通過;tsc 5.9.3 對 Claude Code 2.1.301 型別 clean;bash test/smoke.sh 46 節全過(Python 3.12 在 PATH 前)
prod_changes: none(未發版;修正在 main,下次 release 才到 npm)
---

# mod 0.3.0 中控台與 F7 真機驗證、修兩個 bug、TRAPS 壓實

**TL;DR**:STATE 長期掛 yellow 的兩張清單(中控台按鈕/面板開關、F7 一般權限 session 行為)在 Orca 裡用暫存 repo 逐項實測,幾乎都過。測出兩個要修的 bug:對 Codex 按「收尾」指令不會送出、意外中斷的接回 toast 被截斷。兩個都修好並真機重測通過。TRAPS 依實測壓實,active 從 31 降到 30,仍超過 20 條紅線。

## 關鍵發現(重要性排序)

1. **Codex 的 `$` skill 選單吃掉同一次寫入的 Enter**:`orca terminal send --text '$fw-record' --enter` 回 accepted,但指令停在 Codex 輸入框(`terminal read --json` 的 `draft` 欄,不在 tail 裡)。補一次單獨的 Enter 才送出。已登 TRAPS `codex-dollar-skill-enter-eaten-by-picker`(confirmed)。修法:送完等 800 ms 讀回 `draft`,仍「正好是那條指令」才補 Enter;任何別的草稿都視為使用者在打字,不碰(`pressEnterIfHeld`,ac9031e)。
2. **Claude Code 2.1.303 的 toast 約 40 欄寬、最多三行**,超出部分以 `…` 截掉。舊提示把 `claude --resume <36 字元 id>` 塞進去,id 被截成 `148d4…`,照抄接不回去。改成 toast 只點名 8 字元短 id 並指向 `/fw-fleet`;`/fw-fleet` 表格本來就印完整指令。
3. **用 Orca 合成 SGR 滑鼠點擊不可靠**:放開事件的序列會漏進 Claude 輸入框,曾把 `/exit` 和一行指令當聊天送出(無害)。測面板改用鍵盤:ctrl+x tab 進窗格,Tab 移焦點,Enter 按下;debug log 的 `ui.focus … onto flightwake-mod's <key>` 與 `ui.press flightwake-mod/<key>` 可確認焦點與按下的按鈕。已登 TRAPS `orca-send-sgr-mouse-leaks-into-claude-composer`(probable)。
4. **面板「本 session」那一列永遠顯示工作中**:`features/panel.ts` 寫死 `isSelf ? 'working'`,狀態檔其實是 idle。未修,使用者這次只要求修前兩個。
5. **`/fw-fleet` 表格把指令裡的反斜線加倍**:`tableCell` 對整格做 `\` → `\\`,但指令在 code span 裡,markdown 不會還原。路徑含單引號時(`'\''`)抄出來的指令是錯的。罕見,未修;fleet.test.ts 的斷言刻意只檢查 cd 前綴與 `--resume`。

## 交付 / Commits

ac9031e(修正 + 四語文件 + CHANGELOG `[Unreleased]` + TRAPS 壓實 + dogfood 副本刷新)

TRAPS 壓實內容(使用者逐項放行):
- python 3.11 兩條重複條目合併,保留帶 commands 比對的那條。
- 6 條補上或升級 confidence。
- `codeql-action-version-lockstep` 與 `readline-terminal-mode-loses-answer-lines` 標 superseded,因為程式已修。
- 新增兩條(見發現 1、3)。

## 驗證證據

所有測試都在 scratchpad 暫存 repo 進行(`fwt-console` 開面板、`fwt-target` 放目標 agent),不碰使用者的真實分頁。

| 項目 | 結果 |
|---|---|
| 面板重開後自動開、每 10 秒輪詢 | 過。debug log 每 10 秒一次 `orca terminal list` |
| 跳過去 | 過。`ui.press …/go-term_…` 之後 Orca `activeTabId` 換成目標 |
| 收尾,Claude 目標 | 過。第一下出現「確定送出 /fw-record / 取消」;取消後目標零輸入;確定後目標開始執行。修正後重測:呼叫序列是 list → send(含 Enter)→ read,沒有補 Enter |
| 收尾,Codex 目標 | 修前失敗,停在 `draft`。修後重測過:send(8 參數)→ send 結束約 0.8 秒後 read(6 參數)→ 補 Enter(6 參數);Codex 顯示 `› $fw-record` 與 `• Working`;中控台該列 10 秒內轉工作中 |
| Codex 狀態判讀 | 過。閒置判為閒置;核准提示讓標題變 `[ . ] Action Required`,10 秒內顯示 ⛔;按 Esc 後回閒置 |
| 手動關閉 ctrl+x x | 過。`panelOpen` 變 false,`ui.close` 之後零次 orca 呼叫;下個 session 不開也不輪詢。`/fw-panel on` 還原,store 與備份一致 |
| F7 權限對話框(manual 模式) | 過。狀態檔 `blocked`(kind permission,tool Bash),中控台與底部儀表顯示 ⛔ 等你回覆;Esc 後回 idle |
| F7 AskUserQuestion | 過。`blocked`(kind question),回答後解除 |
| F7 `/clear` | 過。舊 id ended(reason clear),新 id 以 `adopt:clear` 接手並記 parent |
| F7 `/exit` | 過。ended(reason prompt_input_exit) |
| F7 `kill -9` | 過。心跳過 120 秒,`flightwake fleet` 標失聯並附 `claude --resume`;同 repo 新 session 跳 toast。修正後重測:toast 完整三行,標題 `flightwake-mod`、`flightwake:session <8 碼> 在 2m / 前意外中斷(當時閒置)——/fw-fleet / 有接回指令`;`/fw-fleet` 該列印出完整 `claude --resume <完整 id>` |

## 未完 / 交接

- **修正尚未發版**:ac9031e 在 main 的 `[Unreleased]`。下次 release 時要把 mod 版號從 0.3.0 往上推。
- **面板本 session 列寫死工作中**(發現 4)、**`/fw-fleet` 反斜線加倍**(發現 5):各是一處小修,待決定。
- **沒驗證的部分**:
  - `/fw-fleet` 的四語輸出(只看過 zh-TW)。
  - 真引擎 PermissionRequest 的 `tool_input` 是否等於 `tool.check` 的 input。
  - Codex `--dangerously-bypass-hook-trust` 的對照重跑(auto 模式分類器擋下,沒有繞)。
- **刻意沒還原的副作用**:暫存 repo 的資料夾信任紀錄留在 `~/.claude.json` 與 `~/.codex/config.toml`(可能和執行中的 session 互相覆寫,沒動);暫存 session 的 ended 狀態檔留在 `~/.flightwake/sessions/`(kill -9 產生的失聯檔已刪)。
- **TRAPS active 30 條,仍超過 20**:要在 DECISIONS 接受 >20,或調整 fw-coldstart 的門檻,待使用者決定。
