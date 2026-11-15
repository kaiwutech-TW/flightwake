# 全域模式(計畫 B):skills 與 hooks 只裝一份

> 2026-11-15,Kai 要求「多個資料夾都要個別升級很麻煩」。A(`update --all`,8ac41ab)先解決「一次升級全部」;
> B 要讓升級本身變成一處:skills 與 hooks 放在使用者層級,repo 裡只留紀錄與規則。本稿是設計與探針結果,**還沒實作**。

## 目標與界線

- 每個 repo 只留:`.flightwake/`(STATE、records、DECISIONS、TRAPS——使用者資料,跟著 repo 走)、CLAUDE.md / AGENTS.md
  的規則區塊(agent 從 repo 讀)、agy 的坑規則檔(由該 repo 的 TRAPS 產生,本來就是 repo 資料)。
- 使用者層級一份:四個 skill、收尾提醒(state-check)、坑提示(trap-check + traps-core)。升級 = 一個指令換掉這一份。
- 既有的 repo 安裝方式不拿掉:clone 下來就能用、團隊共用的 repo 仍以 repo 安裝為主。全域是 opt-in。

## 探針結果(2026-11-15,Kai 同意後實測;設定先備份到 `~/.flightwake/backups/261115-global-probe/`)

三家都有自己的 plugin 系統,能把 skills 與 hooks 裝在使用者層級。**不必碰 Orca 管的 `~/.codex/hooks.json` 或 `~/.gemini/config/hooks.json`。**

| # | 結果 | 證據 |
|---|---|---|
| G1 Codex 0.167.2 plugin 的 skill | **成立**。本機 marketplace(`.agents/plugins/marketplace.json`,source local)→ `codex plugin marketplace add <dir>` → `codex plugin add fwprobe@fwprobe-mkt`;在未信任的暫存 repo 跑 `codex exec`,它讀了 plugin 快取裡的 SKILL.md 並答出暗號 | 安裝在 `~/.codex/plugins/cache/<mkt>/<plugin>/<version>`;config.toml 只多 `[marketplaces.…]` 與 `[plugins."…"]` 兩段 |
| G2 Codex plugin 的 hook | **找得到,要信任一次**。`codex app-server` 的 `hooks/list`(唯讀)列出 `fwprobe@fwprobe-mkt:hooks/hooks.json:stop:0:0`,`source: plugin`、`untrusted`。信任的鍵是「plugin@marketplace:檔名:事件:序號」,和安裝路徑、和 Orca 的全域檔都無關。`.codex-plugin/plugin.json` 的 `"hooks": "./hooks/codex.json"` 可指定別的檔;同一資料夾同時有 `.claude-plugin/` 時 Codex 讀自己的 `.codex-plugin/` | `codex exec` 不跑未信任的 hook(探針檔沒產生);`--dangerously-bypass-hook-trust` 被 Claude Code auto mode 擋下,未用。**還沒驗**:信任後實際執行、cwd、`PLUGIN_ROOT` 是否有值(Codex 二進位裡有 `PLUGIN_ROOT`、`CLAUDE_PLUGIN_ROOT` 字串)|
| G3 agy 1.5.5 plugin | **成立,不需信任**。資料夾放 `plugin.json`、`skills/<name>/SKILL.md`、根目錄 `hooks.json`(agy 格式:具名條目)→ `agy plugin validate` 通過 → `agy plugin install <dir>` 複製到 `~/.gemini/config/plugins/<name>`。在未信任的暫存 repo 跑 `agy -p`:答出 skill 的暗號;plugin 的 Stop hook 有執行,cwd 是 plugin 資料夾、`PLUGIN_ROOT` 有值 | 使用者層級 skill 也可放 `~/.gemini/config/skills/<name>/`(agy 說明文字)。`hooks/hooks.json` 這個位置 agy 不讀 |
| G4 Claude Code plugin | 0.19.0 已有(A9,smoke 52);本機沒裝,未重測 | — |

## 修正後的形狀

`npx flightwake global install [--lang=…] [--agents=claude,codex,agy]`:
1. 依語言在 `~/.flightwake/plugin/` 產生一份 plugin(該語言的四個 skill、兩支 hook 腳本與 traps-core、三家的 manifest:
   `.claude-plugin/`、`.codex-plugin/`、agy 的 `plugin.json` + 根目錄 `hooks.json`)。順便解決 A9 的 plugin 只有英文。
2. 用各家自己的指令安裝:`claude plugin marketplace add` + `claude plugin install`、`codex plugin marketplace add` +
   `codex plugin add`、`agy plugin install`。
3. hook 指令字串固定(`node "${PLUGIN_ROOT}/…" --plugin`),`global update` 只換腳本與 skill 內容,Codex 的信任不會掉。

`global update` = 重新產生 + 各家重裝;`global uninstall` = 各家移除。repo 端的 `init --global`(標記 `global=1`)與
`update --all` 對 `global=1` 的 repo 只刷新規則區塊與範本。hook 腳本的 `--plugin` 模式要改:Codex 下檢查 `.codex/hooks.json`、agy 下檢查
`.agents/hooks.json` 是否已有 repo 自己那份(現在只看 `.claude/settings*.json`);trap-check 的 host 由參數決定(各家 manifest 指不同的 hooks 檔)。

## 仍要處理的風險

- **別人 clone**:沒裝全域的人拿到的 repo 只有紀錄與規則。規則區塊要寫明「沒有 fw-coldstart 時跑 `npx flightwake global install`,
  或 `npx flightwake update` 改成 repo 安裝」。
- **從 repo 安裝改成全域**:現在 `update --plugin` 不移除 repo 裡既有的 skills 與 hook 條目(doctor 只警告重複)。遷移要能拿掉
  repo 那份;Codex 的 repo hook 條目拿掉不影響信任,加回來才要重新信任。
- **重複提示**:repo 自己有一份、全域也有一份時只響一次(Claude Code 已做到,smoke 52;Codex、agy 要補上述判斷)。

## 待 Kai 決定

- 全域模式是否只給自己的機器用(預設 repo 安裝不變),還是之後要讓 `setup` 推薦它。
- G2 剩下的一步要 Kai 在 Codex 介面裡信任探針 hook(`/hooks`),才能看到它實際執行。
