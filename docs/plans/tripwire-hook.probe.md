# A5 探針結果(2026-11-11)

- 設計:`tripwire-hook.md`(「審查後的修訂」第 1、4、5 點)。執行:主線 Claude Code(Opus 5.5)。
- Codex 部分在 Orca 可見分頁「A5 codex probe」跑:Codex CLI 0.167.0、模型 GPT-6.1-Sol,暫存 repo(在 session scratchpad,不在本 repo)。
- 探針結束後,`~/.codex/config.toml` 裡這次加的三筆信任(資料夾一筆、hook 兩筆)已移除,其餘內容不變(先備份再比對)。

## 結論

| # | 問題 | 結果 |
|---|---|---|
| Q1 | Codex 的 PreToolUse 提示,模型在工具執行前看得到嗎? | **看不到**。提示會送到模型,但要等工具跑完、下一次模型請求才讀到,和 Claude Code 一樣。所以 A5 在 Codex 上一樣不是「執行前提示」 |
| Q2 | `apply_patch` 的 patch 在哪、檔名在哪一行 | 在 `tool_input.command`;檔名在 `*** Add File: <path>`、`*** Delete File: <path>` 標頭,這次是絕對路徑 |
| Q3 | 改了什麼要重新信任 | 改 `hooks.json` 裡的條目:那一條**默默停用**,啟動時不問,只有 `/hooks` 顯示「needs review」。只改腳本內容:不必重新信任,照樣執行 |
| Q4 | 多個 PreToolUse 的順序與合併 | 兩個 hook 幾乎同時跑(同一毫秒),兩段提示各自變成一則訊息送到模型 |
| Q5 | mod 的 TS 能不能 import 外掛內的 `.mjs` | **能**。`lib/glob.ts` 改成從 `lib/traps-core.mjs` 轉出(附 `.d.mts` 型別)後,`claude plugin validate --strict` 通過、tsc 5.9.3 無錯、`claude plugin test` 546/546(Claude Code 2.1.322) |

## 證據

### Q1 時序(nonce)

兩個 PreToolUse hook(`h1`、`h2`)都只回 `hookSpecificOutput.additionalContext`,內容帶隨機 nonce:「如果你在這次呼叫執行**之前**讀到,不要照原計畫執行,改建 `B.txt` 寫入 nonce;已經執行過就只在最後回覆列出 nonce」。請 Codex 用 `apply_patch` 把 `A.txt` 改成 `hello`,再跑 `cat A.txt`。

- 結果:`A.txt` 是 `hello`,**沒有 `B.txt`**。Codex 最後列出八個 nonce,說全都在呼叫執行之後才收到。
- Codex 的 session 紀錄(rollout JSONL)依序是:模型送出工具呼叫(`custom_tool_call exec`,裡面包著 `tools.apply_patch(...)` 或 `tools.exec_command(...)`)→ 兩則帶 nonce 的訊息(hook 跑完時插入)→ 工具輸出(`custom_tool_call_output`)→ 下一次模型回覆。工具呼叫送出之後、工具跑完之前,中間**沒有**任何模型回合,所以模型沒有機會改變這次呼叫。
- 備註:這版 Codex 讓模型透過一個 `exec` 工具呼叫 `tools.apply_patch` / `tools.exec_command`;hook 照樣對裡面的每個工具觸發,`tool_name` 是 `apply_patch` 或 `Bash`。

### Q2 stdin

Codex 給 PreToolUse 的 stdin 欄位:`session_id`、`turn_id`、`transcript_path`、`cwd`、`hook_event_name`、`model`、`permission_mode`、`tool_name`、`tool_input`、`tool_use_id`。

- `cwd` 是 session 的工作目錄(這次剛好是 repo 根目錄)。
- `apply_patch`:`tool_input.command` 是整段 patch,例如 `*** Begin Patch\n*** Delete File: /abs/A.txt\n*** Add File: /abs/A.txt\n+hello\n*** End Patch`。同一個 patch 裡先刪後加同一個檔被拒,Codex 改成分兩次送,每次都觸發 hook。
- `Bash`:`tool_input.command` 是指令字串(`cat A.txt`)。

### Q3 信任

- 第一次開:先問信任資料夾,再問「2 hooks are new or changed」,選 Trust all。
- 只在腳本檔尾加一行註解,重開:沒有任何提示,兩個 hook 都照跑(log 兩筆)。
- 在 `hooks.json` 的 `h1` 條目加 `"timeout": 5`,重開:啟動時**沒有提示**;下一次工具呼叫只有 `h2` 跑。`/hooks` 顯示 PreToolUse「Installed 3 · Active 2 · Review 1」。
- 信任存在 `~/.codex/config.toml`:`[hooks.state."<repo>/.codex/hooks.json:pre_tool_use:<群組序號>:<hook 序號>"] trusted_hash = "sha256:…"`。**鍵裡有序號**:在既有條目前面插入新的一組,後面每一組的序號都會變。

### Q5 mod import `.mjs`

`mods/flightwake/hooks/lib/traps-core.mjs`(純 JS)+ `traps-core.d.mts`(型別),`lib/glob.ts` 只剩一行 `export { matchGlob, matchAny } from './traps-core.mjs'`。三個關卡都過(見上表)。

## 對設計的影響

1. **「執行前提示」兩家都不成立**,DECISIONS 2026-11-10 那一條照舊;Codex 也不能寫「改之前先提醒」。A5 的價值維持:沒裝 mod 的 Claude Code 與 Codex 也拿到提示(下一步就看到),以及解析器收成一份。
2. **Codex 端照做**(DECISIONS 2026-11-11 的重評條件沒有觸發:Codex 能收到 context)。
3. **安裝器寫 `.codex/hooks.json` 時,新的 PreToolUse 一律加在最後**,不重排、不改既有條目;否則使用者自己的 hook 會因序號變了而默默停用。我們自己那一條的指令字串要固定,`update` 只換腳本內容、不改條目——改條目就會讓使用者的 Codex 默默停掉這個 hook。
4. `doctor` 不能從檔案判斷 Codex 是否信任了 hook;安裝後說明要提醒「Codex 第一次會問;之後若在 `/hooks` 看到 needs review,要再信任一次」。
5. patch 路徑可能是絕對路徑:用 `relToRoot` 換成 repo 相對路徑再比對。
