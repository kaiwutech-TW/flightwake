# 全域模式(計畫 B):skills 與 hooks 只裝一份

> 2026-11-15,Kai 要求「多個資料夾都要個別升級很麻煩」。A(`update --all`,8ac41ab)先解決「一次升級全部」;
> B 要讓升級本身變成一處:skills 與 hooks 放在使用者層級,repo 裡只留紀錄與規則。本稿是設計與探針清單,**還沒實作**。

## 目標與界線

- 每個 repo 只留:`.flightwake/`(STATE、records、DECISIONS、TRAPS——使用者資料,跟著 repo 走)、CLAUDE.md / AGENTS.md
  的規則區塊(agent 從 repo 讀)、agy 的坑規則檔(由該 repo 的 TRAPS 產生,本來就是 repo 資料)。
- 使用者層級一份:四個 skill、收尾提醒(state-check)、坑提示(trap-check + traps-core)。升級 = 一個指令換掉這一份。
- 既有的 repo 安裝方式不拿掉:clone 下來就能用、團隊共用的 repo 仍以 repo 安裝為主。全域是 opt-in。

## 各平台現況(2026-11-15 本機唯讀觀察)

| 平台 | 使用者層級 skills | 使用者層級 hooks | 狀態 |
|---|---|---|---|
| Claude Code | plugin(A9,0.19.0 已發) | plugin 的 `hooks/hooks.json` | **已有**。本機沒裝 flightwake plugin(`~/.claude/settings.json` 的 enabledPlugins 沒有) |
| Codex 0.167.2 | `~/.codex/skills/` 存在(放著 imagegen、skill-creator 等) | `~/.codex/hooks.json` 存在,**由 Orca 管理**,九個事件各一組 | 待探針 |
| agy 1.5.5 | `~/.gemini/skills/orca-cli` 存在(Orca 放的),agy 是否讀它未知 | 未知 | 待探針 |

## 已知的風險

1. **Codex 全域 hook 的信任是按序號記的**:`~/.codex/config.toml` 有 `[hooks.state."~/.codex/hooks.json:stop:0:0"]` 這類鍵
   (TRAPS `codex-hook-entry-change-silently-untrusted`:條目內容或序號一變,那條就默默變回未信任)。Orca 每個事件都寫在
   群組 0;flightwake 若附加成群組 1,而 Orca 之後重寫檔案時改了順序或丟掉別人的群組,兩邊都可能默默失效。要先探 Orca 何時、
   怎麼重寫這個檔。
2. **語言**:hook 腳本的訊息語言是安裝時蓋上去的(`const LANG`)。全域只有一份,要改成執行時讀該 repo 標記的 `lang=`。
3. **重複提示**:repo 自己有一份、全域也有一份時要只響一次。Claude Code plugin 模式已做到(`--plugin`:repo 自己登記了就安靜,
   smoke 52);全域版沿用同一個判斷。
4. **別人 clone**:沒裝全域的人拿到的 repo 只有紀錄與規則,沒有 skill 與提醒。規則區塊要寫明「沒有 `/fw-coldstart` 時跑
   `npx flightwake global install` 或 `npx flightwake update`(改成 repo 安裝)」。
5. **從 repo 安裝改成全域**:現在 `update --plugin` 不會移除 repo 裡既有的 `.claude/skills/fw-*` 與 hook 條目(doctor 只警告重複)。
   遷移要能拿掉 repo 那份;Codex 的 repo hook 條目拿掉不影響信任,加回來才要重新信任。

## 預計形狀(探針後再定)

- `npx flightwake global install | update | uninstall | status`:把 skills 與 hooks 裝到使用者層級(Claude Code 走 plugin;
  Codex、agy 依探針結果),腳本放在 `~/.flightwake/hooks/`(fleetBase,與 registry 同一處),`update` 只換腳本內容、條目不動。
- repo 端:`init --global`(標記 `global=1`,比照 `plugin=1`)只裝 `.flightwake/`、規則區塊、agy 規則;`update` 沿用。
- `update --all` 對 `global=1` 的 repo 只刷新規則區塊與範本。

## 探針(都需要 Kai 同意:會動使用者層級設定)

| # | 問題 | 做法 | 會動到 |
|---|---|---|---|
| G1 | Codex 是否載入 `~/.codex/skills/fw-*`(`$fw-coldstart` 可點名) | 放一個探針 skill,開 Codex TUI 點名 | `~/.codex/skills/`(探完移除) |
| G2 | Codex 全域 hook 在沒信任的 repo 與已信任的 repo 是否都跑;新增群組 1 是否要求信任、Orca 重啟後是否還在 | 備份 `~/.codex/hooks.json` 與 `config.toml`,附加探針群組,重啟 Orca 前後比對 | `~/.codex/hooks.json`、`config.toml`(備份、探完還原) |
| G3 | agy 是否讀 `~/.gemini/skills/`,有沒有使用者層級 hooks | 查 agy 文件 + 放探針 skill | `~/.gemini/skills/`(探完移除) |
| G4 | Claude Code plugin 與 repo 安裝並存時只響一次(已有 smoke 52),本機實裝 plugin 後真機看一次 | `claude plugin install`(市集)| `~/.claude/settings.json` |

## 待 Kai 決定

- 全域模式是否只給自己的機器用(預設 repo 安裝不變),還是之後要讓 `setup` 推薦它。
- G2 動到 Orca 管理的 `~/.codex/hooks.json`;不想碰的話,Codex 先維持 repo 安裝,用 `update --all` 升級。
