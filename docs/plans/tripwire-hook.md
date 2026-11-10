# 設計:絆線改成一般 hook,在工具執行前提示(A5)

- 狀態:**設計稿,待審**(2026-11-10,Opus 5.5)。審查回覆存成 `docs/plans/tripwire-hook.review-<審查者>.md`。
- 計畫來源:`docs/plans/narrow-and-launch.md` A5。決定:DECISIONS 2026-11-10(絆線只對瞄準的目標提示)。

## 為什麼

現在的絆線是 Claude Code mod 的功能,有三個限制:

1. **只有 Claude Code 加 mod 才有。** Codex 改到有坑的檔不會被提醒;沒裝 mod 的 Claude Code 也不會。
2. **工具跑完才提示。** 它擋不了這一次,只提醒下一次(`docs/mod.md`:「it protects the next attempt, not this one」)。
3. **解析器有兩份**(`bin/traps.mjs` 與 `mods/flightwake/hooks/lib/traps.ts`),再加一份 shell 解析就是三份。

對外想說「換一個 agent 改到同一個檔之前會先看到這個坑」,目前做不到。

## 要做什麼

新增一支零依賴的 `hooks/trap-check.mjs`,安裝到 `.flightwake/hooks/`,掛在 Claude Code 與 Codex 的 `PreToolUse`。它比對 active
條目的 `paths` / `commands`,命中就在**執行前**用附加 context 提示,永不擋。比對規則和 mod 現在一樣(DECISIONS 2026-11-10):
Edit/Write 目標、Bash 指令前綴、Bash 寫入的路徑;只讀或提到的路徑不算。

| | Claude Code | Codex | Antigravity |
|---|---|---|---|
| 設定檔 | `.claude/settings.json` 的 `PreToolUse` | `.codex/hooks.json` 的 `PreToolUse` | 不做(見下) |
| matcher | `Edit\|Write\|NotebookEdit\|Bash` | `Bash\|apply_patch`(matcher 只比對工具名) | — |
| 輸入 | `tool_name`、`tool_input.file_path` / `tool_input.command` | `tool_name`、`tool_input.command`(`apply_patch` 的 patch 文字也在 `command`) | — |
| 輸出 | `hookSpecificOutput.additionalContext`(**待驗**:Claude Code 的 PreToolUse 是否支援) | `hookSpecificOutput.additionalContext`(官方文件 2026-11-10 逐字確認;預設上限約 2,500 token) | — |
| 去重 | 每個 session 每條一次 | 同左 | — |

Antigravity 的 `PreToolUse` 文件沒有記載不擋又能給 context 的欄位,所以不做;它改由 A6(錨點產生 `.agents/rules/` 的 glob 規則)補。

## 一份解析器(本設計最大的改動)

hook 是整支複製進使用者 repo 的,必須能獨立執行,不能 import npm 套件。提案:

- 把**純函式**收成一個 ES 模組 `mods/flightwake/hooks/lib/traps-core.mjs`:TRAPS 解析、glob 比對、shell 分段(`parseCommand`)、
  指令前綴比對、`segmentWrites`、`apply_patch` 路徑解析、比對主函式。只用語言內建功能,不碰 fs、不碰 `$`。
- 三個地方用同一份:
  1. mod 的 TS 直接 import 這支 `.mjs`(載入器允許 import 外掛自己的 `.mjs`;純函式不涉及 `$` 的跨檔限制,見 TRAPS `mod-loader-static-rules`)。
  2. `bin/traps.mjs` 從套件路徑 import(取代它自己的解析器)。
  3. 安裝器把它複製成 `.flightwake/hooks/traps-core.mjs`,`trap-check.mjs` 用相對路徑 import。
- 結果:TRAPS 解析器從兩份變一份,shell 解析不必再寫第三份。代價是一次重構 mod 的 `lib/traps.ts`、`lib/shell.ts`、`lib/glob.ts`,
  要靠現有 546 個 mod 測試與 smoke 守住行為不變。

## 去重與紀錄

- hook 是無狀態的行程。去重紀錄寫在 `<base>/hints/<session id>.json`(`<base>` 同 fleet 的規則),資料夾 0700,與 `trips` 同一套拒寫規則;
  寫不進去時照樣提示(寧可多提示一次也不漏)。
- **觸發紀錄(trips)仍只由 mod 寫。** 一般 hook 不寫 trips,避免兩個寫手;stats 的說明照舊寫「只有裝 mod 的 Claude Code session」。

## 和 mod 並存

- 裝了一般 hook 時,mod 的絆線只記觸發、不提示,避免同一條提示兩次。mod 以「`.claude/settings.json` 或 `.claude/settings.local.json` 有
  `trap-check.mjs` 的 PreToolUse 登記」判斷。
- 沒裝一般 hook(舊安裝、使用者拿掉)時,mod 照舊在事後提示。

## 安裝與移除

- `init` / `update`:預設安裝(這是核心功能,不是附加元件),寫 `.flightwake/hooks/trap-check.mjs` 與 `traps-core.mjs`,並在
  Claude Code 與 Codex 的設定檔合併一條 PreToolUse。`--private` 規則同 Stop hook。
- `uninstall`:只拿掉自己那一條,其他 hook 保留。`doctor`:檢查登記、指令、腳本存在。
- 效能:每次符合 matcher 的工具呼叫多跑一個 node 行程。TRAPS 沒有任何帶錨點的 active 條目時,腳本讀完檔就結束。要量:
  20 條 active 的 TRAPS.md 上,一次呼叫的牆鐘時間(目標 < 100 ms)。

## 要先做的探針(寫程式之前)

| # | 問題 | 怎麼驗 |
|---|---|---|
| Q1 | Claude Code 的 `PreToolUse` 回 `hookSpecificOutput.additionalContext` 時,模型在工具執行前看得到嗎? | 讀當版 hooks 文件;在暫存 repo 掛一個固定回 additionalContext 的 hook,請模型複述 |
| Q2 | Codex 的 `apply_patch` 在 `tool_input.command` 裡的 patch 格式(哪一行帶檔名) | 暫存 repo 掛一個把 stdin 寫檔的 PreToolUse hook,請 Codex 改一個檔,看內容 |
| Q3 | Codex 專案 hook 的信任:新增 PreToolUse 後要重新信任嗎?`update` 改了腳本內容會不會又要信任一次? | TUI 裡 `/hooks` 觀察;官方文件說信任綁在 hook 的 hash 上 |
| Q4 | 兩家同時有多個 PreToolUse 時的順序與輸出合併(官方:Codex 同事件多個 hook 併行) | 和使用者既有的 PreToolUse 並存測一次 |
| Q5 | mod 的 TS 能不能 import 外掛內的 `.mjs` 並通過 `claude plugin validate --strict` | 改一個小函式試 |

Q1 不成立的話,Claude Code 端維持 mod 的事後提示,一般 hook 只給 Codex。Q5 不成立的話,解析器維持兩份,另加一致性測試。

## 不做

- 不擋任何呼叫(`deny`)。提示是線索,`probable` / `suspected` 條目照舊標成線索。
- 不比對只讀或只提到的路徑(DECISIONS 2026-11-10)。
- Antigravity 不在這一項(A6)。

## 審查請求要包含的四項

照 CLAUDE.md 的 Orca 協作規則,請另一個 agent 在可見的 Orca 分頁唯讀審查,回覆要有:結論;依據(檔案與行號);沒有驗證的部分;
考慮過但不採用的做法。特別請審:單一解析器的重構範圍是否值得、去重檔案的位置、mod 與 hook 並存時的判斷方式。
