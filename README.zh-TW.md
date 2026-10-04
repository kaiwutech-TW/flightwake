<!-- 繁體中文版。主版:README.md(英文);其他:README.zh-CN.md / README.ja.md — 改任一版必同步其他版。 -->
# flightwake ✈️

> **記錄是工作飛過後自然留下的航跡,不是起飛前必須申報的飛行計畫。**

[![npm](https://img.shields.io/npm/v/flightwake)](https://www.npmjs.com/package/flightwake) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/kaiwutech-TW/flightwake/badge)](https://scorecard.dev/viewer/?uri=github.com/kaiwutech-TW/flightwake)

🌐 [English](README.md) · **繁體中文** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

給強模型(Claude Fable 5 世代起)的極輕量工作記錄框架。零執行期依賴、純 Markdown、一切進 git。

![本 repo 的真實冷啟動:/fw-coldstart 讀 STATE 與最新 record,約 30 秒回報安全接手](https://raw.githubusercontent.com/kaiwutech-TW/flightwake/main/docs/demo.gif)

*就在本 repo 實錄:一個指令、兩次讀檔,全新 session 準確回報上次做到哪、這次從哪接。*

## 安裝

```bash
cd your-repo
npx flightwake setup    # 引導式安裝:問幾個問題、列出將寫入的每個路徑,你確認後才安裝
```

`setup` 需要終端機。它先檢查 git(目錄不是 repo 時會問要不要 `git init`,預設 No,且只在最後確認後才執行),接著問語言、agent(資料夾已有 CLAUDE.md / AGENTS.md / GEMINI.md 時列出偵測結果;都沒有時直接問你用哪些工具,可複選、不預選)、選配附加項(每項預設 No:底部儀表、Claude Code mod、roles、Orca 協作;mod 這一題只在你選了 Claude Code 時才會問)與 repo 類型(code / notes),列出將寫入的所有路徑,再問「確定執行? [Y/n]」——按 Enter 即安裝;`n`、EOF 或 Ctrl-C 都不會寫入任何東西。若已安裝 flightwake,只會提供就地升級(`update`)。它與 `init` 走同一條安裝路徑,裝完跑 `doctor` 並印出下一步。命令列上給的旗標會直接回答對應的問題;`--private` 只能用旗標,從不詢問。

**非互動形式**——`npx flightwake init [旗標]`(直接打 `npx flightwake` 效果相同)從不提問:給自動化、agent、CI 與已經知道要什麼的進階使用者用:

```bash
npx flightwake init --lang=zh-TW --statusline   # 繁體中文 + 底部儀表
npx flightwake init --lang=zh-TW --statusline --agents=claude,codex,gemini   # 三家一次裝齊(Claude Code + Codex + Gemini CLI)
npx flightwake update                           # 就地升級,沿用你裝過的選項(lang/statusline/private)
```

**選你的語言**(非互動形式;`setup` 會幫你問)— 安裝的模板、skill 與所有 CLI/儀表輸出都跟著它走。**刻意不做自動偵測**:終端的 `LANG` 與作業系統語系經常不一致(實測過:系統是 zh_TW,終端卻回報 `en_US.UTF-8`),猜錯又講得很有自信,比明講預設更糟。直接複製你要的那行:

| 語言 | 全新安裝 | 已經裝成其他語言 |
|---|---|---|
| 繁體中文 | `npx flightwake init --lang=zh-TW --statusline` | `npx flightwake init --lang=zh-TW --force --statusline` |
| 简体中文 | `npx flightwake init --lang=zh-CN --statusline` | `npx flightwake init --lang=zh-CN --force --statusline` |
| 日本語 | `npx flightwake init --lang=ja --statusline` | `npx flightwake init --lang=ja --force --statusline` |
| English | `npx flightwake init --statusline` | `npx flightwake init --lang=en --force --statusline` |

切語言是安全的:`--force` 只換框架擁有的檔案(模板、skill、hook、marker 區塊),你的 STATE / DECISIONS / TRAPS / records **完全不動**,維持你當初寫下的語言。不要儀表的話,把 `--statusline` 拿掉即可。加 `--agents=claude,codex,gemini`(可任選子集)明確指定要裝哪些 agent;不加的話,init 依既有的指令檔(CLAUDE.md / AGENTS.md / GEMINI.md)自動偵測。

**不要手動翻譯裝好的檔案。** marker 記著你裝的是哪個語言,下次 `update` 會用那個語言的來源刷新,你的修改會消失。要換語言請重跑 init 加 `--lang`;若已經手改過,現在 init/update 會逐檔列出它覆蓋了什麼。

init 會:建 `.flightwake/`(模板 + Stop hook)、複製 4 個 skill 到 `.claude/skills/`、把 Stop hook 併入 `.claude/settings.json`、把觸發義務表(含 `<!-- flightwake:begin/end -->` 標記)附加到**偵測到的 agent 指令檔**(CLAUDE.md / AGENTS.md / GEMINI.md,有哪個貼哪個;全都沒有就建 AGENTS.md;`--agents=claude,codex,gemini` 可明確指定)。**偵測到的每個平台都拿到同一套 skill 與 hook,用它自己的方言**:Codex 與 Gemini CLI 從 `.agents/skills/fw-*` 讀 skill,STATE 檢查分別進 `.codex/hooks.json`(Stop)與 `.gemini/settings.json`(AfterAgent),義務表對 Codex 寫 `$fw-coldstart`、對 Claude Code 寫 `/fw-coldstart`、對 Gemini 寫裸 skill 名。Codex 首次執行會要你信任這個 repo hook 一次。**純檔案複製,零執行期依賴**(Node ≥18 只在安裝與 hook 時用)。使用者資料(STATE/DECISIONS/TRAPS)任何情況下都不覆蓋;`--force` 只更新框架擁有的檔案。

## 使用教學

### 第一次安裝後

1. 在 repo 裡開一個 agent session,執行 `/fw-coldstart`——它會發現 STATE 還是未填的範本,並依 repo 現況寫出第一份 STATE(health 絕不亂猜成 green:沒有實際驗證前一律是 yellow)
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

忘了收尾也沒關係:STATE 落後 ≥3 commits 時,Stop hook 會在 session 結束前擋一次提醒(STATE 標 health=green 但最新 record 沒有測試證據時,也會提醒);CI 端用 `--ci` 把同一道關卡帶給其他 agent 與人類協作者。誠實標注這張網的邊界:落後量只數**人**的 commit——bot 的 commit(`dependabot[bot]`、`renovate[bot]` 等)不計入,因為依賴升版不會讓 STATE 變錯,而 bot 的 PR 也永遠無法自己補 STATE。零 commit 的 session(研究、ops 操作)或 squash/rebase 流程會從網下溜過;網接住的是「忘記」,不取代 session 結束時的義務。要跨 session 停手的大工程,停手前說「交接」讓模型跑 `/fw-handoff`。

### 你唯一要盯的事

STATE 的 health 誠不誠實(green/yellow/red)。框架的品質指標只有一個:**新 session 從 `/fw-coldstart` 到安全接手花了多久**——超過 5 分鐘,代表你的記錄在退化。其他一切——記錄多寡、格式合規——都不重要。

燈亮了也不用你動手保養,說一句:「**這次冷啟動花了 X 分鐘,診斷慢在哪並壓實**」。模型會帶著診斷(STATE 太長?上次沒收尾?TRAPS/DECISIONS 過時條目太多?)和逐條處置清單回來——哪條標 superseded、為什麼、哪些合併——你一個字放行即可。提示的訣竅是給事實不給情緒:「超過 5 分鐘代表下個 session 會接錯手」模型能推理;「這很嚴重!」它只能表演緊張。

### 想看實際長相

本 repo 自己就 dogfooding 這套框架:[`.flightwake/`](.flightwake/) 裡是真實的 STATE、DECISIONS 與 records——框架從缺口清單到開源上線的每一步都記錄在裡面,那就是裝進你 repo 後會自然長出的東西。

### 分階段實戰手冊

剛開始跟強模型協作?[docs/workflow.md](docs/workflow.md) 是一張階段地圖:每個階段**你**該做什麼、該對模型說什麼——主線給新手,「⚙ 進階」摺疊給 Claude Code 老手。

同一個 repo 用不只一個模型?[docs/multi-agent.zh-TW.md](docs/multi-agent.zh-TW.md) 說明 Claude Code、Codex、Gemini CLI 怎麼共用同一份 `.flightwake/`——init 替各家裝了什麼、各工具怎麼叫 skill、以及讓交接不分模型都一樣的「收尾 → commit → 冷啟動」循環。(英文版:[multi-agent.md](docs/multi-agent.md))

用一組 agent 組團隊(專案經理、技術總監、寫手、審核)?[docs/roles.zh-TW.md](docs/roles.zh-TW.md) 說明 `flightwake roles`(選配,v0.14.0 起):agent 依你的專案推薦一組角色,你預覽、客製,每個角色被寫進該 agent 每次開場都會重讀的指令檔——`/clear` 之後沒人忘記自己的工作,團隊橫跨多個 repo 也行。(英文版:[roles.md](docs/roles.md))

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
├── .claude/skills/fw-*/     # 四個 skill(Claude Code)
├── .claude/settings.json    # init 併入 Stop hook 設定
├── .agents/skills/fw-*/     # 同一套四個 skill 給 Codex / Gemini CLI(偵測到 AGENTS.md / GEMINI.md 才裝)
├── .codex/hooks.json        # Codex 的 Stop hook(偵測到 AGENTS.md 才裝)
└── .gemini/settings.json    # Gemini CLI 的 AfterAgent hook(偵測到 GEMINI.md 才裝)
```

skill 與 hook 是各平台的便利糖衣——同一套四個 skill、同一份檢查腳本,裝到 Claude Code、Codex、Gemini CLI 各自會去找的位置;`.flightwake/` 本體是進 git 的純 Markdown,所以每個 agent(和每個人)讀寫的是同一份狀態。其他 agent 讀指令檔也能手動遵循同一套觸發義務。與既有 GSD `.planning/` 可並存(舊紀錄即歷史檔案)。

## 進階安裝

**`--private`** 讓紀錄**只留本機、不進 git**:所有寫入登進 `.git/info/exclude`(純本地,不在 repo 留痕跡),hook 改進 `.claude/settings.local.json`,義務表改寫 `CLAUDE.local.md`(受 git 追蹤的既有指令檔一律不碰)。代價:紀錄不隨 repo 共享、重新 clone 後要重跑 `init --private`——「進 git 隨 repo 共享」才是 flightwake 的預設與存在理由,`--private` 是給「在別人的 repo 裡私用」的逃生口。

**`doctor`**(`npx flightwake doctor`)是唯讀、不連網的安裝結構檢查:git 與 git root、Node ≥18、`.flightwake/`、STATE(未填的範本欄位算警告)、`latest_record`、標記區塊及其 version/lang/profile 是否一致、skill、hook 註冊(JSON 合法、指令完全一致、事件正確——Claude Code/Codex 為 Stop,Gemini CLI 為 AfterAgent——無重複、腳本存在)、`--private` 的 exclude 是否真的生效,以及選配附加項狀態。每行輸出 ok / warning / fail;有任何 fail 即 exit 1。它只驗證安裝結構,不保證 hook 在執行期真的會觸發(Codex 是否信任 hook 路徑無法檢查,只會印出提示)。不寫入任何東西。

**`--profile=code|notes`**(預設 `code`)選擇義務表。`notes` 給非程式碼的 repo(寫作、研究、筆記):拿掉「測試綠 + typecheck 乾淨」、「prod 驗證證據」與 schema/prod 收尾觸發,保留冷啟動、決策、坑、交接、≥3 commit 收尾、破壞性操作先確認、session 結束時 STATE 誠實。安裝的檔案相同。profile 記在標記裡(`profile=notes`);`update` 會沿用,`update --profile=code` 可切回。

**`--orca`**(選配;`setup` 也會問,但只在偵測到 Orca 時)在每個啟用平台的指令檔加一個標記區塊:跨 agent 討論與審查要用看得見的 Orca 分頁,不要用藏在背景的執行;並附單一寫手審查協議(被請來審查的 agent 不寫 record、不碰 STATE;提問方把採納的結論寫進自己的 record)。`uninstall` 會移除;`update` 只在已安裝處刷新。

**`--mod`**(選配;`setup` 也會問,但只在你選了 Claude Code 時)安裝 Claude Code mod(`flightwake-mod`)到 `.claude/skills/flightwake-mod/`:一組 function hook,在 session 裡注入 STATE、顯示 band、記錄飛行日誌、觸發 TRAPS 絆線,並可選配角色守門。只支援 Claude Code(需要 2.1.287+、接受資料夾信任提示、從 repo 根目錄開始);若這次沒有設定 Claude Code,會印說明並略過。`update` 只在已安裝處刷新,`uninstall` 只移除發行的檔,你在該資料夾自己加的檔會保留並列出。完整說明見 [docs/mod.zh-TW.md](docs/mod.zh-TW.md)。

**`--git-init`** 讓 `init` 在目錄不是 git repo 時先建立它——只有明確給旗標才會做;沒給就停下並告知。`init` 與 `setup` 都會先檢查 git 是否已安裝,沒有則依平台給出安裝提示。

**`uninstall`** 反向清除 init 的固定寫入範圍:刪 skill 與框架檔、從 settings 摘除 flightwake 的 Stop hook(使用者其他 hook 原樣保留)、移除指令檔與 `.git/info/exclude` 的標記區塊(由 flightwake 建的檔案清空後刪除)。**`.flightwake/` 是使用者資料,預設保留**,`uninstall --purge` 才連同刪除。

**monorepo 政策:單 repo 一份,裝在 git root。** 工作是 session 形狀的——一個 session 常橫跨多個 package,記錄跟著 session 走;拆到子目錄各裝會把同一段工作切碎成多份 record,也讓「該讀哪份 STATE」變成新的冷啟動歧義。子目錄執行 init 會擋下並指路 root。submodule 有自己的 `.git`,視為獨立 repo 各裝各的。多團隊高流量 monorepo 若覺得 CI 落後檢查誤報,先調 `--threshold`。

### 從 GSD 遷移

先把手上的 milestone 收完,然後:

1. `npx flightwake init`——與 `.planning/` 並存,什麼都不會被刪
2. 對你的 agent 說:「**這個 repo 從 GSD 轉用 flightwake:讀 `.planning/` 的現況,用 /fw-record 初始化 `.flightwake/STATE.md`,未完事項寫進下一步入口;從現在起 `.planning/` 只是歷史檔案,不要再更新它**」
3. 把 CLAUDE.md 裡 GSD 自己的指令段移除(或註解掉),避免兩套規則搶模型的服從

### 底部儀表(選配)

`npx flightwake init --statusline` 在 Claude Code 底部裝一條常駐儀表:

```
✈️ flightwake │ ●green · STATE 落後 2c │ ▓▓░░░░░░░░ 23%
```

health 顏色(你唯一要盯的事)、STATE 落後量(與 Stop hook 同一套 rev-list 邏輯,但從「結束時提醒」變成「隨時看得到」)、context 用量。儀表還會依狀態**直接提示下一個指令**:剛開場 → `→ 開工先 /fw-coldstart`;STATE 落後 ≥3 → `→ /fw-record 收尾`;context 快滿 → `→ /fw-record → /clear → /fw-coldstart`;一切正常 → 安靜。絕不覆蓋既有 statusline(單值設定),且 repo 層設定優先於使用者層,與全域儀表工具可並存。

注意:純 `npx flightwake init` **不會**裝儀表——它是選配。已經 init 過才想裝?再跑一次 `npx flightwake init --statusline` 即可,只會補上儀表(其他已裝的全部 skip),下一個 Claude Code session 就會看到 bar。

儀表也會在 flightwake 有新版時提示(`→ 可更新 v0.9.1:npx flightwake update`)——只在沒有更要緊的事時顯示。檢查是每 24 小時最多一次對 npm registry 的匿名 GET,快取在系統暫存目錄,永遠在背景進程執行(渲染絕不等網路)。不想要:`FLIGHTWAKE_NO_UPDATE_CHECK=1`。

### CI 端收尾檢查(選配)

hook 只在 Claude Code、Codex、Gemini CLI 的 session 裡觸發;要把「STATE 不落後」的紀律帶到其他 agent 與人類協作者,在 CI 跑同一份腳本——STATE 落後 HEAD ≥3 commits 即失敗(`--threshold=N` 可調):

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

**Claude Code 記憶功能**:持久記憶與 flightwake 同形(frontmatter + `[[連結]]`)但不同層——記憶是單機單人的;flightwake 的檔案進 git,隨 repo 共享給團隊、CI 與任何 agent。分工規則:repo 的事實(坑、決策、狀態)進 flightwake;個人偏好與跨專案習慣進記憶。同一件事不要雙寫——唯一的刻意例外:**不是本 repo 特有的通用坑**(平台/語言層)兩邊都存,因為 repo 登記簿必須自足,而你的其他 repo 也需要這個警告(跨範疇各存是分工不是重複)。

**[Google OKF](https://github.com/GoogleCloudPlatform/knowledge-catalog/tree/main/okf)**:OKF 管**知識層**(系統事實:schema、指標口徑、代碼對照),flightwake 管**過程層**(發生了什麼、為什麼、現在在哪)。flightwake 的知識型產物採 OKF 慣例(YAML frontmatter + `[[連結]]`),兩邊在「純 Markdown + frontmatter」底層天然相容。

## 安全性

- **零依賴、無網路、無 install script**:安裝器只做檔案複製;hook 只用 `git`(無 shell)做唯讀查詢。
- **寫入範圍固定**:`init` 只碰 `.flightwake/`、`.claude/skills/fw-*`、`.claude/settings.json`、agent 指令檔裡的標記區塊(含 Orca 區塊,僅在你選用時)、`~/.flightwake/registry.json`(init/update 會寫;uninstall 移除本 repo 的條目)、`.claude/skills/fw-roles` / `.agents/skills/fw-roles`(僅在你選用 roles 時)、`.claude/skills/flightwake-mod/`(僅在你選用 mod 時;`uninstall` 只移除發行的檔、保留你自己加的;`--private` 時加進 exclude 區塊),以及(偵測到 Codex / Gemini CLI 時)`.agents/skills/fw-*`、`.codex/hooks.json`、`.gemini/settings.json`;`--private` 時改碰 `.claude/settings.local.json`、`CLAUDE.local.md` 與 `.git/info/exclude` 裡的標記區塊(Codex/Gemini 那幾個檔只在未受追蹤時才寫,並加進 exclude)。`uninstall` 反向清除同一範圍。任何寫入都不經由 symlink、也不落在 repo 之外:安裝前先預檢,有必要路徑會被拒寫就在寫入任何東西之前中止並點名該路徑(以非零退出)。檔案一律以「暫存檔 + rename」取代,不原地覆寫;uninstall 與 roles 指令遵守同樣規則。`--private` 若隱私無法生效(要排除的東西已受追蹤,或 `.git/info/exclude` 寫不進去)會在一開始就拒絕。`doctor` 不寫入任何東西(裝了 mod 時,它會執行唯讀的 `claude --version`)。「只複製檔案」唯一的例外是 `git init`:只在你於 `setup` 最後摘要確認後,或你傳了 `--git-init` 時才會執行。
- **hook 進 git**:`.flightwake/hooks/state-check.mjs` 是 repo 內的檔案,能 commit 的人就能改——與所有 repo-local 設定同級,Claude Code 載入時會要求確認。
- 漏洞回報見 [SECURITY.md](SECURITY.md)。以 npm Trusted Publishing 發布(附 provenance),可用 `npm audit signatures` 驗證。

## 狀態

🚧 v0.x——持續 dogfooding 中;慣例仍可能演進(append-only 檔案有 `superseded` 生命週期,讀取端容忍讓舊安裝不受影響)。

## License

[MIT](LICENSE)
