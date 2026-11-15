# 全域模式(計畫 B):skills 與 hooks 只裝一份

> 2026-11-15,Kai 要求「多個資料夾都要個別升級很麻煩」。A(`update --all`,8ac41ab)先解決「一次升級全部」;
> B 要讓升級本身變成一處:skills 與 hooks 放在使用者層級,repo 裡只留紀錄與規則。本稿是設計與探針結果(探針已全部清除,設定與備份逐檔相同),**還沒實作**。

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
| G2 Codex plugin 的 hook | **會執行,但每次更新都要重新信任**。`hooks/list`(唯讀)列出 `fwprobe@fwprobe-mkt:hooks/hooks.json:stop:0:0`,`source: plugin`、`untrusted`;`.codex-plugin/plugin.json` 的 `"hooks": "./hooks/codex.json"` 可指定別的檔,同一資料夾有 `.claude-plugin/` 時 Codex 讀自己的 `.codex-plugin/`。Kai 在 `/hooks` 信任後(Codex 0.169.0),SessionStart 與 Stop 都執行,cwd 是 session 的資料夾,`PLUGIN_ROOT` 與 `CLAUDE_PLUGIN_ROOT` 都指 plugin 快取資料夾。**但信任記了 `trusted_content_hash`,涵蓋整個 plugin**:只改版號、只改 skill、在 `hooks/` 加檔或改檔,重裝後都變 `modified`;內容改回原樣又變 trusted。`/new` 開新 session 時沒有提示 | `config.toml` 的 `[hooks.state."fwprobe@…"]` 有 `trusted_hash` 與 `trusted_content_hash`;專案層條目只有 `trusted_hash`。`--dangerously-bypass-hook-trust` 被 auto mode 擋下,未用。TRAPS `codex-plugin-hook-trust-covers-whole-plugin` |
| G3 agy 1.5.5 plugin | **成立,不需信任;更新也照常**(改 skill 與版號後 `agy plugin install` 顯示 replaced existing installation,新內容立即生效)。資料夾放 `plugin.json`、`skills/<name>/SKILL.md`、根目錄 `hooks.json`(agy 格式:具名條目)→ `agy plugin validate` 通過 → `agy plugin install <dir>` 複製到 `~/.gemini/config/plugins/<name>`。在未信任的暫存 repo 跑 `agy -p`:答出 skill 的暗號;plugin 的 Stop hook 有執行,cwd 是 plugin 資料夾、`PLUGIN_ROOT` 有值 | 使用者層級 skill 也可放 `~/.gemini/config/skills/<name>/`(agy 說明文字)。`hooks/hooks.json` 這個位置 agy 不讀 |
| G4 Claude Code plugin | 0.19.0 已有(A9,smoke 52);本機沒裝,未重測 | — |

## 修正後的形狀

`npx flightwake global install [--lang=…] [--agents=claude,codex,agy]`:
1. 依語言在 `~/.flightwake/plugin/` 產生一份 plugin(該語言的四個 skill、兩支 hook 腳本與 traps-core、三家的 manifest:
   `.claude-plugin/`、`.codex-plugin/`、agy 的 `plugin.json` + 根目錄 `hooks.json`)。順便解決 A9 的 plugin 只有英文。
2. 用各家自己的指令安裝:`claude plugin marketplace add` + `claude plugin install`、`codex plugin marketplace add` +
   `codex plugin add`、`agy plugin install`。
3. **Codex 的 plugin 只放 skill**:hook 放進 plugin 會在每次更新後悄悄失效(G2)。Codex 的 hook 繼續用各 repo 的
   `.codex/hooks.json`(條目固定、腳本由 `update --all` 刷新,信任不掉)。Claude Code 與 agy 的 hook 放 plugin。

`global update` = 重新產生 + 各家重裝;`global uninstall` = 各家移除。repo 端的 `init --global`(標記 `global=1`)與
`update --all` 對 `global=1` 的 repo 刷新規則區塊、範本與 Codex 的 hook 腳本(Codex 的 hook 仍在 repo)。hook 腳本的 `--plugin` 模式要補:
agy 下檢查 `.agents/hooks.json` 是否已有 repo 自己那份(現在只看 `.claude/settings*.json`)。

## 仍要處理的風險

- **別人 clone**:沒裝全域的人拿到的 repo 只有紀錄與規則。規則區塊要寫明「沒有 fw-coldstart 時跑 `npx flightwake global install`,
  或 `npx flightwake update` 改成 repo 安裝」。
- **從 repo 安裝改成全域**:現在 `update --plugin` 不移除 repo 裡既有的 skills 與 hook 條目(doctor 只警告重複)。遷移要能拿掉
  repo 裡 Claude Code 與 agy 的那份;Codex 的 hook 條目保留(拿掉再加回來就要重新信任)。
- **重複提示**:repo 自己有一份、全域也有一份時只響一次(Claude Code 已做到,smoke 52;agy 要補上述判斷;Codex 的 hook 不進 plugin,沒有這個問題)。

## 待 Kai 決定

- 全域模式是否只給自己的機器用(預設 repo 安裝不變),還是之後要讓 `setup` 推薦它。
