# 設計:絆線改成一般 hook,在工具執行前提示(A5)

- 狀態:**已實作,未發版**(2026-11-11,Kai 選 (a),DECISIONS 同日;CHANGELOG `[Unreleased]`)。探針結果見 [`tripwire-hook.probe.md`](tripwire-hook.probe.md):Codex 也沒有執行前提示;Q5 成立。審查完於 2026-11-10。審查:Codex(GPT-6.1-Sol),原文 [`tripwire-hook.review-codex.md`](tripwire-hook.review-codex.md)。
  下面「審查後的修訂」一節優先於本稿其他段落;兩者衝突時以那一節為準。
- 計畫來源:`docs/plans/narrow-and-launch.md` A5。決定:DECISIONS 2026-11-10(絆線只對瞄準的目標提示;A5 不承諾執行前提示)。

## 審查後的修訂(2026-11-10,主線採納)

**核心承諾改了。** Claude Code 官方 hooks 文件(code.claude.com/docs/en/hooks,2026-11-10 主線另行讀過原文):
PreToolUse 的 `additionalContext` 是「String added to Claude's context alongside the tool result」,「Add context for Claude」一節列
「PreToolUse, PostToolUse, …: next to the tool result」,並說 Claude 在下一次模型請求才讀到。也就是說,**在 Claude Code 上,一般 hook
的提示時機和現在的 mod 一樣,都在工具跑完之後**,本稿「為什麼」第 2 點要消除的限制並不會消除。Codex 是否不同,文件沒寫,要用
探針驗(見下)。所以 A5 的價值只剩兩項:讓**沒裝 mod 的 Claude Code 與 Codex** 也拿到按目標篩選的提示,以及把解析器收成一份。
對外不寫「改到之前先提醒」(DECISIONS 2026-11-10)。

採納的修訂(依據見審查原文各節):

1. **探針 Q1 改成能分辨時序的版本**(審查 §1)。在暫存環境讓模型寫檔 A;hook 只回一段帶隨機 nonce 的指示,要它改寫 B。記錄 hook 回傳、
   工具實際寫入、下一次模型請求的順序。只有工具執行前就改成 B 才算「執行前可見」;事後改成 B 或複述 nonce 都不算。Claude Code 端
   依文件預期不成立,Codex 端必測。
2. **mod 與一般 hook 並存不看 settings 登記**(審查 §2)。mod 照舊記 trips;只有在 hints 紀錄裡讀到「一般 hook 已為同一個 `tool_use_id`、
   同一條目版本產生提示」時才省略自己的提示,讀不到就照樣提示(寧可重複,不可漏)。這是盡力去重,不保證送達。
3. **hints 的儲存協定要寫清楚**(審查 §3):鍵含 schema 版本、host、session、repo、`name@version`;只把真正輸出的條目標成已提示
   (沿用 mod 一次最多五條的規則);不存指令、patch 或提示內文;任何失敗(沒有 session id、權限、壞 JSON、鎖逾時)都照樣提示;
   寫成「盡力去重」而不是「保證一次」;寫檔用 0600、比照 `features/fleet.ts` 的拒寫規則在 Node 端重做;要有自己的開關與清理入口
   (`fleet --prune` 或 TTL),不借 `trips` 的開關。
4. **共用核心的範圍從依賴圖畫**(審查 §4):除了 TRAPS 解析、glob、shell 分段,還要帶走 `tripwire.ts` 的 `matchFile` / `matchBash`
   (含 cwd 追蹤)與 `core.ts` 的 `relToRoot`;CLI 端 entry 的 `tags` / `discovered` 要保留;F3 recorder 與 F4 的 cwd 策略不能混成一種;
   `.mjs` 要有 JSDoc 或 `.d.mts` 型別。加少量差異測試:同一份 TRAPS fixture、指令、cwd 在 mod、CLI、複製出去的 hook 得到同樣結果。
   Q5 除了 `validate --strict`,還要 `claude plugin test` 與執行期 import 都過。
5. **Codex 側補邊界**(審查 §5):matcher 寫 `^(Bash|apply_patch)$`;輸出只回 `hookSpecificOutput: { hookEventName: "PreToolUse",
   additionalContext }`,不加 `permissionDecision`;patch 只解析 `*** Add/Update/Delete File:` 與 `*** Move to:` 標頭;用 shell 呼叫
   apply_patch 是已知缺口;hook 的 cwd 是 session 的 cwd,不是 repo 根目錄;子代理沿用父 session 的 `session_id`,所以去重不能證明
   每個 agent 都看過;信任分兩層(project 與個別 hook),Q3 分別測改 hooks.json、改腳本、改 traps-core 會不會要重新信任。
6. **安裝與更新**(審查 §6):尊重既有的 `tripwire: false`(關掉的人 update 後不能又開始收到提示);兩支 `.mjs` 成對更新,寫不進去時
   不登記 hook;以 event、handler、指令精確認自己那一條;`--private` 照 Stop hook 的規則,含「Codex 設定已受追蹤就跳過」;
   延遲量多次的中位數與較慢分位,並設短的 fail-open timeout。

不採用的做法照審查 §4 原文(第三份解析器、hook 執行時 npx、daemon、寫進 trips、deny 一次後重試、session 開始注入全部條目)。

**待 Kai 決定**:在「Claude Code 沒有時序優勢」的前提下,A5 還要不要做、做多少。選項:(a) 照修訂後的範圍做,主要給 Codex 與沒裝 mod
的 Claude Code;(b) 先只做共用核心(減少兩份解析器),一般 hook 等 Codex 的 nonce 探針結果再決定;(c) 擱置 A5,先做 A6(agy 規則檔)。

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
