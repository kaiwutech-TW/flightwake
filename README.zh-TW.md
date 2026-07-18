<!-- 繁體中文版。主版:README.md(英文);其他:README.zh-CN.md / README.ja.md — 改任一版必同步其他版。 -->
# flightwake ✈️

> **記錄是工作飛過後自然留下的航跡,不是起飛前必須申報的飛行計畫。**

[![npm](https://img.shields.io/npm/v/flightwake)](https://www.npmjs.com/package/flightwake) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kaiwutech-TW/flightwake/badge)](https://scorecard.dev/viewer/?uri=github.com/kaiwutech-TW/flightwake)

🌐 [English](README.md) · **繁體中文** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

給強模型(Claude Fable 5 世代起)的極輕量工作記錄框架。零執行期依賴、純 Markdown、一切進 git。

## 安裝

```bash
cd your-repo
npx flightwake init        # 升級既有安裝:加 --force
```

init 會:建 `.flightwake/`(模板 + Stop hook)、複製 4 個 skill 到 `.claude/skills/`、把 Stop hook 併入 `.claude/settings.json`、把觸發義務表(含 `<!-- flightwake:begin/end -->` 標記)附加到**偵測到的 agent 指令檔**(CLAUDE.md / AGENTS.md / GEMINI.md,有哪個貼哪個;全都沒有就建 AGENTS.md;`--agents=claude,codex,gemini` 可明確指定)。**純檔案複製,零執行期依賴**(Node ≥18 只在安裝與 hook 時用)。使用者資料(STATE/DECISIONS/TRAPS)任何情況下都不覆蓋;`--force` 只更新框架擁有的檔案。

## 使用教學

### 第一次安裝後

1. 開一個 Claude Code session,說「**用 /fw-record 初始化 STATE**」——讓模型把 repo 現況寫成第一份 STATE
2. `git add .flightwake .claude CLAUDE.md && git commit`
3. 之後每個 session 都是下面的日常循環

### 日常循環

你(和模型)只需要記得一件事:**開工先 `/fw-coldstart`,其餘義務模型自己會觸發**——義務表已貼在指令檔裡,強模型讀得懂也守得住。一個典型 session 長這樣:

```text
你:  /fw-coldstart
模型:(讀 STATE + 最近 record,約 1 分鐘)
      「上次做到 X,health green,下一步入口是 Y。有沒有未驗證的變更:無。從 Y 接手?」
你:  對,做吧
模型:(直接動手。過程中做了關掉其他選項的決策 → 自動一行進 DECISIONS;
      踩到非顯而易見的坑 → 自動 /fw-trap 登記)
你:  收尾
模型:(/fw-record:寫飛行紀錄、更新 STATE、敏感資訊自查)
```

忘了收尾也沒關係:STATE 落後 ≥3 commits 時,Stop hook 會在 session 結束前擋一次提醒;CI 端用 `--ci` 把同一道關卡帶給其他 agent 與人類協作者。要跨 session 停手的大工程,停手前說「交接」讓模型跑 `/fw-handoff`。

### 你唯一要盯的事

STATE 的 health 誠不誠實(green/yellow/red)。框架的品質指標只有一個:**新 session 冷啟動多久能安全接手**(>5 分鐘 = 記錄在退化)。其他一切——記錄多寡、格式合規——都不重要。

### 想看實際長相

本 repo 自己就 dogfooding 這套框架:[`.flightwake/`](.flightwake/) 裡是真實的 STATE、DECISIONS 與 records——框架從缺口清單到開源上線的每一步都記錄在裡面,那就是裝進你 repo 後會自然長出的東西。

## 為什麼會有這個專案

Fable 5 級的模型不需要人教它怎麼做事——但有四件事再強的模型也做不到,而且全是**結構性**的,不會隨模型變強而消失:

1. **session 必死,context 有限**。工作跨 session 時記憶歸零;沒有記錄,每次接手都是一場 git 考古——強模型只是考古得比較快,不是不用考古。
2. **git 記 what,不記 why**。commit 查得到改了什麼,查不到「當時為什麼不選另一條路」和「這個坑的根因」——而這兩樣恰好是下個 session(或下個 agent)最貴的資訊。
3. **紀律會在長 session 裡漂移**。「測試還沒跑就回報完成」「動了 prod 沒留驗證證據」這類滑坡與模型智力無關,需要模型之外的硬防護。
4. **多 agent 不共享狀態**。Claude、Codex、Gemini 與人類隊友各看各的;狀態進了 git 才是大家的。

所以 flightwake 補的是**持久性與紀律,不是智力**。前身思想來自 GSD:GSD 是**導航**(turn-by-turn 引導模型每一步),flightwake 是**行車記錄器 + 儀表警示燈 + 路標**——強模型自己會開車,框架只負責三件事:

1. **行車記錄器**:決策、發現、驗證證據,事後記錄(`records/`、`DECISIONS.md`、`TRAPS.md`)
2. **儀表警示燈**:模型強弱無關的硬防護(測試綠才算完成、prod 變更必留驗證證據、破壞性操作先確認)
3. **路標**:任何 session 死掉,下一個 session 讀 `STATE.md` 2 分鐘內安全接手

起源是一個真實的三日 session(2026-07-15~17:雙 repo、19 commits、4 條 cron、2 個深層 bug 修復,全程無事前計畫、零走偏)。它證明了強模型不需要導航——但它留下的 SUMMARY/CONTEXT/記憶檔,也就是讓下一個 session 能接手的東西,全是臨場發明的。flightwake 把那套臨場發明變成可安裝的慣例。

## 核心原則:記錄追隨工作,而非引導工作

GSD 是 **stage-driven**(research→plan→execute→verify 關卡制);flightwake 是 **trigger-driven**(事件觸發義務制):

| 觸發事件 | 義務 | 工具 |
|---|---|---|
| 開始動一個 repo | 先讀 STATE + 最近一筆 record | `/fw-coldstart` |
| 做出「關掉其他選項」的決策 | 一行進 DECISIONS(append-only,記 why) | 直接寫 |
| 踩到非顯而易見的坑 | 一則進 TRAPS | `/fw-trap` |
| 動 schema / 動 prod / 超過 ~3 commit | 收尾留 record | `/fw-record` |
| 工作會跨 session | **停手前**(非開工前)寫 handoff/CONTEXT | `/fw-handoff` |
| session 要關 | 更新 STATE 的位置與下一步入口 | `/fw-record` 內含 |

**升級規則(與 GSD 相反)**:預設一切都是 quick、直接動手;只有「跨多 session 的建設」才升級成 phase(一份 CONTEXT,plan 拆分交給模型臨場判斷)。

## 檔案結構(安裝進目標 repo 後)

```
your-repo/
├── .flightwake/
│   ├── STATE.md             # 現在在哪、下一步入口(永遠短、永遠新)
│   ├── DECISIONS.md         # append-only 決策日誌(一行一決策,記 why)
│   ├── TRAPS.md             # 坑 registry(OKF 式 frontmatter 條目)
│   ├── TEMPLATE-record.md   # 飛行紀錄模板
│   ├── hooks/state-check.mjs  # Stop hook:STATE 落後 ≥3 commits 時提醒收尾
│   └── records/             # 飛行紀錄(每次有意義的收尾一份)
├── .claude/skills/fw-*/     # 四個 skill
└── .claude/settings.json    # init 併入 Stop hook 設定
```

skill 與 Stop hook 是 Claude Code 上的便利糖衣;`.flightwake/` 本體是純 Markdown,任何 agent 讀指令檔即可遵循同一套觸發義務。與既有 GSD `.planning/` 可並存(舊紀錄即歷史檔案)。

## 進階安裝

**`--private`** 讓紀錄**只留本機、不進 git**:所有寫入登進 `.git/info/exclude`(純本地,不在 repo 留痕跡),hook 改進 `.claude/settings.local.json`,義務表改寫 `CLAUDE.local.md`(受 git 追蹤的既有指令檔一律不碰)。代價:紀錄不隨 repo 共享、重新 clone 後要重跑 `init --private`——「進 git 隨 repo 共享」才是 flightwake 的預設與存在理由,`--private` 是給「在別人的 repo 裡私用」的逃生口。

**`uninstall`** 反向清除 init 的固定寫入範圍:刪 skill 與框架檔、從 settings 摘除 flightwake 的 Stop hook(使用者其他 hook 原樣保留)、移除指令檔與 `.git/info/exclude` 的標記區塊(由 flightwake 建的檔案清空後刪除)。**`.flightwake/` 是使用者資料,預設保留**,`uninstall --purge` 才連同刪除。

**monorepo 政策:單 repo 一份,裝在 git root。** 工作是 session 形狀的——一個 session 常橫跨多個 package,記錄跟著 session 走;拆到子目錄各裝會把同一段工作切碎成多份 record,也讓「該讀哪份 STATE」變成新的冷啟動歧義。子目錄執行 init 會擋下並指路 root。submodule 有自己的 `.git`,視為獨立 repo 各裝各的。多團隊高流量 monorepo 若覺得 CI 落後檢查誤報,先調 `--threshold`。

### CI 端收尾檢查(選配)

Stop hook 只在 Claude Code 生效;要把「STATE 不落後」的紀律帶到其他 agent 與人類協作者,在 CI 跑同一份腳本——STATE 落後 HEAD ≥3 commits 即失敗(`--threshold=N` 可調):

```yaml
# .github/workflows/flightwake.yml(範例;依你的 repo 慣例建議把 actions 釘到 SHA)
name: flightwake
on: [push, pull_request]
permissions:
  contents: read
jobs:
  state-fresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # rev-list 數落後量需要完整歷史
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: node .flightwake/hooks/state-check.mjs --ci
```

flightwake 不會把 workflow 寫進你的 repo——`.github/workflows/` 權限敏感,這超出「寫入範圍固定」的承諾;範例請自行複製。

## 與鄰近系統的分界

**Claude Code 記憶功能**:持久記憶與 flightwake 同形(frontmatter + `[[連結]]`)但不同層——記憶是單機單人的;flightwake 的檔案進 git,隨 repo 共享給團隊、CI 與任何 agent。分工規則:repo 的事實(坑、決策、狀態)進 flightwake;個人偏好與跨專案習慣進記憶。同一件事不要雙寫。

**[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)**:OKF 管**知識層**(系統事實:schema、指標口徑、代碼對照),flightwake 管**過程層**(發生了什麼、為什麼、現在在哪)。flightwake 的知識型產物採 OKF 慣例(YAML frontmatter + `[[連結]]`),兩邊在「純 Markdown + frontmatter」底層天然相容。

## 安全性

- **零依賴、無網路、無 install script**:安裝器只做檔案複製;hook 只用 `git`(無 shell)做唯讀查詢。
- **寫入範圍固定**:`init` 只碰 `.flightwake/`、`.claude/skills/fw-*`、`.claude/settings.json`,以及 agent 指令檔裡的標記區塊;`--private` 時改碰 `.claude/settings.local.json`、`CLAUDE.local.md` 與 `.git/info/exclude` 裡的標記區塊。`uninstall` 反向清除同一範圍。
- **hook 進 git**:`.flightwake/hooks/state-check.mjs` 是 repo 內的檔案,能 commit 的人就能改——與所有 repo-local 設定同級,Claude Code 載入時會要求確認。
- 漏洞回報見 [SECURITY.md](SECURITY.md)。以 npm Trusted Publishing 發布(附 provenance),可用 `npm audit signatures` 驗證。

## 狀態

🚧 v0.x——持續 dogfooding 中;慣例仍可能演進(append-only 檔案有 `superseded` 生命週期,讀取端容忍讓舊安裝不受影響)。

## License

[MIT](LICENSE)
