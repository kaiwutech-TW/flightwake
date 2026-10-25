# Claude Code mod——把 flightwake 的狀態放進 session 裡

> English:[mod.md](mod.md) · 简体中文:[mod.zh-CN.md](mod.zh-CN.md) · 日本語:[mod.ja.md](mod.ja.md)

**選用附加元件,只支援 Claude Code。** `init` 預設不會安裝它,要用 `init --mod` 或在 `setup` 裡選。

## 它是什麼

`flightwake-mod` 是一個 Claude Code 外掛(plugin,也就是 mod),由一組 function hook 組成。它只服務 Claude Code:Codex 與
Gemini CLI 沒有對應的機制;而 flightwake 其他一切(skill、Stop hook、底部儀表)不論有沒有它,運作都完全一樣。
**`.flightwake/` 的 Markdown 仍然是唯一的事實來源。**

它讀的東西:

- `.flightwake/`
- git 狀態(一律用 `git --no-optional-locks`,所以不會改寫 `.git/index`)
- CLAUDE.md / .claude/CLAUDE.md / CLAUDE.local.md 裡 flightwake 與 roles 的標記區塊
- AGENTS.md / GEMINI.md 裡 flightwake 的標記(只讀語言)
- `package.json` 的 scripts
- 實際生效的 `statusLine` 設定
- `spend` 用:本 session 自己在 `~/.claude/projects/` 下的 transcript(只加總 token)
- `fleet` 用:`<base>/sessions/*.json` 的 session 檔(見下方「session 狀態回報」)、別的 session 在 `~/.claude/projects/` 下的 transcript 是否還在(只看存不存在,而且只認那個 session 自己的 transcript 路徑),以及 `<base>` 是不是紀錄資料夾或位在 git repo 裡(`<base>/STATE.md`,和 `<base>` 及其上層各資料夾的 `.git` 與 `.flightwake/STATE.md`;只看存不存在),還有 repo 根目錄與 `<base>/sessions` 實際落在哪裡(會跟著連結走的 `stat`)
- `tripwire` 的命中次數用:對 `<base>/trips` 與本 session 自己那個檔做同樣的檢查
- `panel` 用(只在 Orca 裡):Orca 的終端機清單(透過 `orca` CLI),以及清單上每個 repo 的 `.flightwake/STATE.md` 與指令檔標記(唯讀)

不連網。它**從不寫 repo 裡的東西,也不寫你的紀錄**(STATE、DECISIONS、TRAPS、records、ROLES.md),狀態是每個 session 各自一份(`$.state`),
有兩個例外:**它唯一寫入的檔案是每個互動 session 兩個檔,都放在 repo 外的 `<base>` 底下**——`<base>/sessions/<id>.json`(`fleet` 功能)與
`<base>/trips/<id>.json`(`tripwire` 功能的命中次數);`<base>` 是絕對路徑的 `FLIGHTWAKE_HOME`,否則是 `~/.flightwake`——以及 `panel` 功能會在 mod 自己的 Claude Code 外掛儲存區記一個是/否——你上次是開啟還是關閉側邊面板。`<base>` 落在 session 的 repo 裡、是 flightwake 紀錄資料夾、或位在任何 git repo 裡時,兩個檔都不寫。
它出任何錯都會悄悄降級,不打擾你。在沒有 `.flightwake/STATE.md` 的資料夾裡,它什麼都不做。
顯示語言跟著安裝當時記在指令檔標記裡的語言走。

## 需求

mod 要同時滿足以下條件才會載入:

- Claude Code 2.1.287 或更新版本。
- Claude Code 從專案的 `.claude/skills/flightwake-mod/` 以 `flightwake-mod@skills-dir` 載入它——而且要你已經接受該資料夾的
  工作區信任提示(第一次開啟時會問)。
- session 必須從 repo 根目錄開始;從子目錄開始不會載入。

如果你的個人目錄裡有同名的外掛,它會優先於專案裡的這一個。

## 安裝、更新與移除

- **`npx flightwake setup`**:附加元件是一題清單(Enter = 標 `*` 的、輸入編號 = 就是這些、`0` = 都不要)。選了 Claude Code
  時 mod 是第 2 列、預先標 `*`,並用白話說明:需要 Claude Code 2.1.287 以上;從 repo 根目錄啟動、接受資料夾信任後才會載入;
  已經開著的 session 要重開。`claude --version` 回報較舊的版本時,這一列會說明並且不預選;讀不到版本(沒有 `claude`,或
  5 秒內沒回應)時維持預選。
- **`npx flightwake update --mod`**:替既有的安裝加上 mod,其他選項沿用。
- **`npx flightwake init --mod`**:直接安裝。如果這次要設定的 agent 裡沒有 Claude Code,它會印一則說明並略過 mod(不算錯誤)。
  資料夾已經存在時,`init --mod` 會略過,除非加 `--force`。
- **複製了什麼**:外掛的 manifest(`.claude-plugin/plugin.json`)、`hooks/` 與 `types/`——不含它的測試與開發用腳本。
- **`npx flightwake update`**(以及 `init --force`)只在已經裝了 mod 的地方刷新它,逐檔處理;你自己加在
  `.claude/skills/flightwake-mod/` 裡的檔案會保留。單純的 `update` 不會替你新增 mod;`update --mod`(或在已安裝的 repo
  跑 setup → 「升級並加裝附加元件」)才會加上,並沿用你其他的選項。選了 Claude Code 卻沒裝 mod 時,`update` 與 `init`
  結尾會多印一行說明;在有人要求之前什麼都不加(輸出明寫要 agent 先問使用者)。
- **`npx flightwake uninstall`** 只移除 flightwake 發行到這裡的檔,以及因此變空的資料夾。`.claude/skills/flightwake-mod/` 裡的其他東西(你自己加的檔、Claude Code 寫的檔)會保留,並在輸出列出;flightwake 發行的是檔案、那個位置卻是目錄時,也原樣保留並列出,絕不遞迴刪除。`uninstall --purge` 只針對 `.flightwake/`,也不會刪它們。
- **`--private`**:mod 資料夾會進 `.git/info/exclude` 的標記區塊。如果該資料夾已經被 git 追蹤,`--private` 會在寫入任何東西之前
  就拒絕(與其他 private 的前置條件相同)。之後才對 private 安裝補跑 `update --mod`,會維持 private,並把它加進 exclude 區塊。

### 底部儀表與 band 一起用

`setup` 把兩者列成同一題清單裡的兩列(第 1 列儀表、第 2 列 mod),可以只選一個、兩個都選或都不選。兩者都裝時,收尾訊息會說明分工:底部儀表顯示 health、STATE 落後量與 context 用量;提示列上方的 band 在儀表
開著時會隱藏這些相同的欄位、保持安靜,只在 context 偏高時跳一次 toast。選 mod 絕不會把儀表移除。沒有儀表時,band 一律顯示,並在 Claude Code 回報時一直帶著 context 百分比,頂替儀表的位置;安裝器的收尾訊息也會這樣說明。

### 裝完之後

安裝器會印出:需要 Claude Code 2.1.287+;要從 repo 根目錄開始並接受信任提示;這個 repo 已經開著 Claude Code 的話,
那個 session 看不到 mod——請結束它,從 repo 根目錄重新啟動 Claude Code(mod 在 Claude Code 啟動時載入);怎麼自己打開角色守門(下面的 `pluginConfigs` 設定,或 `/config`);
以及它不是安全邊界。要確認有載入、各功能在做什麼,就在 Claude Code 裡跑 `/fw-mod`。

### 確認它有沒有載入

`npx flightwake doctor` 會回報 mod 是否已安裝(選配;沒裝不算問題)。裝了的話它會檢查:

- manifest 存在且能解析;
- `hooks/hooks.json` 以及它列出的模組都在;
- 每個隨附的檔案都在;
- 已安裝的版本與套件裡的版本一致(不一致是警告,並指向 `update`);
- 隨附檔案有沒有被手改過(警告;`update` 會還原)。

如果能執行 `claude --version`,它會與 2.1.287 比較(較舊是警告;讀不到只是提示,絕不算失敗)。`doctor` 仍然不寫入任何東西。

`doctor` 看不到資料夾有沒有被信任、session 是不是從 repo 根目錄開始——它會明說這一點。**請在 Claude Code 裡確認 mod 真的載入了**,
例如跑 `/fw-mod`(見下面「查看它現在在做什麼」)。

## 八個功能,各有各的開關

七個預設開、角色守門預設關。(側邊面板的開關只決定 `/fw-panel` 能不能用;面板本身不問你就不會開。)開關是外掛選項,放在 Claude Code 的 `/config`,或你的*使用者*設定裡:

```json
"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "<開關>": true } } }
```

外掛選項不讀專案設定,所以安裝器沒辦法替你設定。

| 開關 | 預設 | 做什麼 |
|---|---|---|
| `stateInject` | 開 | session 開始時,把 `.flightwake/STATE.md`(每個 session 只取一次的快照)放進 system prompt,並註明這是上次收尾時的狀態,仍應檢查 git。STATE 還是未填的範本時,改放一行「請先跑冷啟動」。超過 6000 字元時,不是截掉前 N 個字,而是注入 frontmatter、「進行中」與「下一步入口」兩段以及檔案路徑,並提示你壓實 STATE。它不取代 `fw-coldstart`(落後檢查與讀最新 record 仍是 skill 的工作)。 |
| `band` | 開 | 提示列上方的一行:health 顏色、STATE 落後量(與 Stop hook 檢查同一個算法;bot 的 commit 不計)、context 用量、token 與費用(見 `spend`),以及建議的下一個指令。沒有生效中的底部儀表(`statusline.mjs` 不是狀態列)時,band 一律顯示,Claude Code 有回報 context 百分比就一律帶上;它不再等到 60%,一切正常時也不消失,而是頂替儀表。顏色門檻不變(≥60% 黃、≥80% 紅),context 到 80% 時照樣跳一次 toast。STATE 還是未填的範本時,health 顯示為 `?`,並提示「STATE 尚未初始化——先跑 /fw-coldstart」。若 flightwake 的底部儀表(`statusline.mjs`)就是生效中的狀態列,band 會隱藏儀表已經顯示的欄位並保持安靜,只剩 80% 的 toast。 |
| `recorder` | 開 | session 飛行日誌:改了哪些檔案、commit,以及認得出的測試指令與結果。`/fw-log` 會把它印出來,供 `fw-record` 當作 `tests:` 證據與變更清單;經由 shell 指令改動的檔案會另列一段(推斷而來,可能不完整),時間以本地時間加 UTC 偏移顯示、後面接 UTC。它從不寫 record。 |
| `tripwire` | 開 | 當 agent 編輯的檔案或執行的指令,符合某則啟用中的 TRAPS 條目的選填欄位 `paths` / `commands` 時,會把該條目的重點與信心程度給 agent 看,每個 session 一次——是在工具跑完*之後*,所以保護的是下一次嘗試,不是這一次。從不阻擋。`probable` / `suspected` 的條目會標成線索,不是結論。 |
| `roleGuard` | 關 | 針對這個資料夾 Claude 座位上的角色,角色內文(ROLES.md)裡的 `deny-write: [globs]` 行會變成對主 session 的 `Edit` / `Write` / `NotebookEdit` 寫入這些路徑的攔截,訊息會說明是哪個角色、哪條規則、改怎麼做。只有使用者本人能用 `/fw-role-release`(在輸入框打)為本 session 放行;放行期間狀態列持續顯示。細節見 [roles.zh-TW.md](roles.zh-TW.md) 的「選配:Claude Code mod 的角色守門」。 |
| `spend` | 開 | 本 session 用了多少 token、換算成 API 牌價是多少錢。金額是 Claude Code 自己的帳(與 `/cost` 相同,按 API 牌價計;訂閱用戶不會另外被收這筆);token 從 `~/.claude/projects/` 下的 session transcript 加總,每次 API 回應只算一次(子 agent 有自己的 transcript,不計在內)。顯示在 band 最後一欄(`1.2M tok · ≈$4.99`)——底部儀表是生效中的狀態列時,儀表會顯示同一欄、band 保持安靜——以及 `/fw-mod` 的一行;`/fw-cost` 印出明細(未快取輸入/寫入快取/讀取快取/輸出)。每回合結束後更新。 |
| `fleet` | 開 | 把本 session 的狀態——工作中、等你回覆、閒置或已結束——回報到 repo 外的 `<base>/sessions/<id>.json`,供 `/fw-fleet`、`npx flightwake fleet`、底部儀表的 `⛔` 欄位使用,並在某個 session 意外中斷後提示一次 `claude --resume`。只限互動 session;絕不寫 prompt 或指令內容。見下方「session 狀態回報」。 |
| `panel` | 開 | `/fw-panel` 在 transcript 旁開一個窗格:這個 repo(health、落後量、context 條、費用、需要留意的事,以及 STATE 的「進行中」與「下一步入口」)和整個 fleet——在 Orca 裡是每個 agent 終端機(Claude Code 與 Codex),依 repo 分組,附 **跳過去** 按鈕與要確認的 **收尾** 按鈕。只在你要求時才開;開過之後,往後的 session 會自動重開,直到你關掉為止。見下方「側邊面板」。 |

### tripwire 用到的 TRAPS 欄位

兩個都是選填;沒有這兩個欄位的舊條目就是不會被比對到:

```yaml
paths: ["src/db/**", "*.sql"]          # repo 相對的 glob;不含 / 的樣式會比對任何深度的該檔名
commands: ["npm run migrate", "psql"]  # 指令前綴,逐個 token 比對
```

不支援正規表示式。已被 superseded 的條目永遠不會被比對。

**命中次數。** 每一次符合某則條目的工具呼叫也會被計數——包括「每個 session 只提示一次」而沒再提示的那幾次——依條目名稱記下次數與第一次、最後一次的時間,
寫到 repo 外的 `<base>/trips/<session id>.json`:`<base>` 與拒寫規則都跟 session 狀態回報檔相同(不在 repo 裡、不是紀錄資料夾也不在任何 git repo 裡、
絕不經由 symlink、絕不覆蓋不是自己的檔),只限互動 session,每次命中的呼叫之後整檔重寫。格式見下方「trip 檔」。它是日後壓縮 TRAPS 的依據:
`npx flightwake traps stats` 會把這些檔加總。計數從不阻擋,也不改變提示;拒寫或寫入失敗都不出聲。只有 `tripwire` 開著時才記,所以只有裝了 mod 的
Claude Code session 會留下命中紀錄——Codex、Gemini CLI 與沒裝 mod 的 Claude Code 不會,總數只能當下限看。`/clear` 之後會開一個新檔。

### 查看它現在在做什麼:`/fw-mod`

`/fw-mod` 是唯讀指令,列出八個功能各自是開、關還是閒置(idle)、原因,以及要怎麼讓它生效(含本 session 的 token 與 API 等值費用一行;明細用 `/fw-cost`)。例如:band 因為偵測到底部儀表而隱藏;
tripwire 開著但閒置,因為沒有任何啟用中的 TRAPS 條目有 `paths` 或 `commands`;角色守門關著(並說明怎麼打開),或開著但閒置,因為這個資料夾的座位沒有角色、
或角色沒有 `deny-write`;STATE 本 session 已注入,或因為 STATE 還沒初始化而只注入「請先跑 /fw-coldstart」的提示;本 session 以「閒置」回報在 `~/.flightwake/sessions/…`,
或因為是 `-p` 執行、資料夾會落在 repo 裡而沒有回報。它也會顯示 mod 版本、偵測到的語言與 profile。
它不改任何東西,也不是八個開關之一——只要裝了 flightwake,隨時都能用。

## 側邊面板(`panel`)

底部儀表開著時,band 會隱藏自己,所以兩個都裝的話,mod 的東西在畫面上一個都看不到。側邊面板是一個可以一直開著的地方:上面是這個 repo,下面是整個 fleet。各區塊畫成卡片,文字會依窗格寬度換行。

- **這個 repo**(卡片顏色跟著 health):health、STATE 落後量(取 band 的讀數;只有 band 關著時,面板才自己計算)、context 條(綠色,60% 起黃色,80% 起紅色)、本 session 的 token 與費用、flightwake 安裝版本與 mod 版本,以及——只在有事時才出現——以 `!` 標記的行:context 到 80% 以上(該收尾了:`/fw-record` → `/clear` → `/fw-coldstart`);health 是黃色或紅色的原因(STATE 的 `health:` 值後面的註解);工作樹裡尚未 commit 的檔案;STATE 的 `latest_record` 所指 record 的「未完成 / 交接」項目(只認 `.flightwake/` 底下的 `records/<name>.md`);啟用中的 TRAPS 條目超過 20 則(fw-coldstart 提示該壓實的那一條)。
- **Fleet**——在 Orca 裡:Orca 有的每個 agent 終端機(Claude Code、Codex 與其他 agent CLI;一般 shell 不列),每個 repo 一張卡片;有 agent 在等你回覆的 repo 排最前(`⛔`,紅色邊框),接著是工作中(`●`),最後是閒置(`○`)。每張卡片的第一行是 repo,附它的 health 與 flightwake 版本,讀自該 repo 自己的 `.flightwake/STATE.md` 與指令檔標記(唯讀;與這個 repo 不同時標 `≠`)。每個 agent 一列:agent、分頁的任務標題、座位角色、狀態與持續多久。有 mod 0.3.0+ 的 Claude Code session 會在它的 session 狀態回報檔裡回報確切的狀態、context 用量與角色,以那份為準;其他 agent 的狀態則從分頁標題(Claude Code 的 `✳` / 轉圈圖示、Codex 的「Action Required」)和它最近一次輸出的時間判斷,所以只是推測,面板也會這樣標明。
  - **跳過去**:把 Orca 切到那個分頁。
  - **收尾**:只出現在閒置、而且 flightwake 有對應指令的 agent 上;按一下會先問(「確定送出 /fw-record」/「取消」);再按確認時會重新取一次清單,agent 仍是閒置才送出 `/fw-record`(Claude Code)或 `$fw-record`(Codex)。Codex 的 `$` skill 選單會吃掉跟指令一起送的 Enter,所以面板會讀回一次輸入框,只有裡面還是那條指令時才再按一次 Enter。除此之外,絕不會有任何東西被打進別的 agent。
  - 在 Orca 之外,或 Orca 沒有回應時,fleet 區塊改為列出各 Claude Code session 自己回報的狀態(等你回覆的排最前,附角色;context 到 80% 以上時多一行收尾提示;flightwake 或 mod 版本不同時也多一行)。
- **進行中 / 下一步:** STATE 這兩段的頂層項目(分別最多 5 與 6 項,多的以「還有 n 項」一行帶過),依標題比對,四種範本語言都認得,Markdown 化為純文字。
- **本 session:** 飛行日誌的計數(檔案、由 shell 推斷的檔案、測試執行次數與 ✓/✗、commit)、最近幾次測試執行,以及最近改動的檔案。

**開啟與關閉。** `/fw-panel` 切換開關;`/fw-panel on` 與 `/fw-panel off` 則明確指定。你沒要求就絕不會開:你開過一次之後,往後的 session(任何有 flightwake 的 repo)啟動時都會開,而關閉它——`/fw-panel`、它的關閉記號,或 ctrl+x x——就會停止這個行為。它出現在哪裡由 Claude Code 決定:全螢幕版面且終端機寬度在 110 欄以上時,在 transcript 旁邊,否則在提示列上方;session 開始時重開、但終端機太窄的話,會先不畫,等你把終端機拉寬或執行 `/fw-panel`。在終端機的主畫面(`CLAUDE_CODE_NO_FLICKER=0`,或 tmux 預設)一律開在提示列上方。

**它執行什麼。** 繪製時不執行任何東西;資料是在繪製之外收集的。在 Orca 裡(有設 `ORCA_TERMINAL_HANDLE`)而且只在窗格開著時,它每 10 秒執行一次 `orca terminal list --json`(用 `ORCA_CLI_BIN_DIR` 裡的 CLI,否則用 `PATH` 上的 `orca`),並且每個清單上 repo 的 STATE frontmatter 與標記最多每分鐘重讀一次;`orca terminal switch` 與 `orca terminal send` 只在你照上面所述按下按鈕時才執行。關掉窗格就停止輪詢。

## session 狀態回報(`fleet`)

每個互動 session 把一件事——**它需不需要你**——回報到 repo 外的一個小檔,讓你一次看到所有 Claude Code session:哪個在等你回覆、
哪些在跑、哪些閒置、哪些意外中斷可以接回去。讀它的有 `/fw-fleet`、`npx flightwake fleet`、底部儀表上的 `⛔` 欄位,以及其他工具
(Orca),經由下面的「session 檔契約」。

**狀態。** `working`(回合進行中,或手動 `/compact`)、`blocked`(等你回覆)、`idle`(回合之間)、`ended`(session 已結束,附原因)。
只有以下情況才算 `blocked`:

- **權限對話框**開著——互動 session 裡,一個下層沒有答掉的 `PermissionRequest`(沒有任何 settings hook 給出決定)。單單一個 `ask`
  判定不算:auto 模式、分類器或 headless 決策者都不會問人,所以永遠不會顯示成 blocked;
- 或主迴圈有 **`AskUserQuestion` 或 `ExitPlanMode`** 正在進行。子 agent 的提問不算;子 agent 的權限對話框算(標成 `(子 agent)`)。

**放在哪裡。** `<base>/sessions/<session id>.json`。`FLIGHTWAKE_HOME` 設成**絕對**路徑時 `<base>` 就是它,否則是 `$HOME/.flightwake`
(Windows 是 `%USERPROFILE%\.flightwake`)。空的或相對的 `FLIGHTWAKE_HOME` 會被忽略。`npx flightwake init --mod`、`update --mod` 與 setup 的「升級並加裝附加元件」
在 `<base>/sessions` 不存在時以權限 `0700` 建立它(既有的資料夾絕不改權限,遇到 symlink 就拒絕);如果是 mod 先建立資料夾,檔案權限跟著你的 umask(通常 `0644`)。

**什麼時候寫。** 狀態改變時、`/clear` 或 `/resume` 之後接手新 id 時,以及每 30 秒一次心跳。一般的工具呼叫、prompt 或指令絕不觸發寫入——
大約每回合 2 次、每個對話框 2 次、每 30 秒 1 次。每次都整檔重寫。

**絕不寫的東西。** prompt 文字、Bash 指令文字、提問/選項/計畫文字、URL、查詢、樣式、repo 外的任何路徑、權限的 `tool_input`、MCP 訊息、
git remote 或 branch、模型、費用。檔案裡只有 id、repo 路徑、工具名稱、Edit / Write / MultiEdit / Read / NotebookEdit
的 repo 相對路徑、時間與計數,以及(mod 0.3.0 起)context 百分比、座位角色 id 與 flightwake 版本。

**什麼時候完全不寫。** 每一種都會在 `/fw-mod` 顯示成閒置原因,其他功能不受影響:

- `-p` / SDK 執行(沒有人能回覆,而且 CI 會灌爆資料夾);
- 找不到家目錄(`HOME` / `USERPROFILE` 都沒設,或不是絕對路徑);
- `<base>` 落在**這個 session 的 repo 裡**——請把 `FLIGHTWAKE_HOME` 設成 repo 外的絕對路徑(每次寫入前都會再檢查:repo 根目錄會跟著 `/cd` 與 worktree 移動)。也看實際路徑,所以 `<base>` 上層有連結通進 repo 也算;拿不到實際路徑時什麼都不寫;
- `<base>` 是 flightwake 紀錄資料夾(裡面有 `STATE.md`:裝在 `$HOME` 的 repo,或 `FLIGHTWAKE_HOME` 指到某個 repo 的 `.flightwake`),或位在**任何 git repo 或 flightwake 根目錄**裡(`<base>` 或其上層有 `.git` 或 `.flightwake/STATE.md`,實際路徑也查)——檔案會出現在那個 repo 裡,它的 `uninstall --purge` 也會碰到。查不到答案的探測一律算命中;
- `<base>`、`sessions` 資料夾或檔案本身是符號連結(絕不透過它寫入;每次心跳都會再檢查;查不到答案就當成連結);
- 檔案已存在但不是 flightwake 的 session 檔(不動它;每次心跳都會再檢查,之後才放上去的也不會被覆蓋);
- session id 不能當檔名;
- 寫入失敗——下次狀態變化時重試。

沒有 `.flightwake/STATE.md` 的資料夾:沒有檔、沒有計時器、沒有指令、沒有提示。

**開關。** `fleet`,預設開。在同一個 `pluginConfigs` 鍵下設 `"fleet": false` 就關掉;已經寫出的檔之後會變成失聯(可能被當成接回候選
提示一次)——`npx flightwake fleet --prune` 可刪掉。

### `/fw-fleet`

唯讀。列出近 7 天的 session 檔(最新 200 個),等你回覆的排最前(等最久的在前),接著是工作中、閒置、失聯、已結束(已結束最多 10 列);
`/fw-fleet all` 放寬到 30 天。心跳超過 120 秒的 session 顯示為**失聯**,絕不顯示成工作中或等你回覆。讀不了的檔(正在寫入或已損壞)在頁尾計數;
格式不明、時鐘比你快 60 秒以上、或兩個程序共用同一個 session,一律顯示為「不明」。失聯的 session,以及已結束的 session——正常退出、登出或意外結束都算,
但 `/clear`、`/resume` 之後的不算(那個程序已換成另一個 id 繼續)——只要至少跑過一個回合、而且 transcript 還在,就會附上接回指令。
(一次性的「接回提示」比較窄:只針對意外中斷。)

```
## /fw-fleet

**3 個進行中 · ⛔ 1 個等你回覆 · 1 個可接回** — ~/.flightwake/sessions(近 7 天)

| 狀態 | session | repo | 持續 | 細節 |
|---|---|---|---:|---|
| ⛔ 等你回覆 | `3f9a2c1e` | api | 2m | 權限確認 · Bash |
| ● 工作中 | `8b21d0aa`(本 session) | flightwake | 12s | Edit src/a.ts |
| ● 工作中 | `c0ffee12` | orca ⎇ feat-x | 1m | Read(子 agent) |
| ○ 閒置 | `77aa0b3c` | web | 5m | 已回覆 |
| ◌ 失聯 | `1234abcd` | flightwake | 2h | 沒有心跳(原本工作中)——當掉或睡眠中? · `claude --resume 1234abcd-…` |
| – 已結束 | `deadbeef` | web | 1d | 已退出 |

另有 2 個較舊的已結束檔未列出——`/fw-fleet all` 顯示 30 天。
唯讀:/fw-fleet 不改任何東西。`npx flightwake fleet --prune` 會刪掉 7 天前已結束/失聯的檔。
```

`orca ⎇ feat-x` 是 repo `orca` 的一個 worktree(`feat-x`)。如果那個 session 是在別的資料夾啟動的,接回指令前面會加上 `cd '…' && `——
`claude --resume` 必須在 session 啟動的位置執行。

### `npx flightwake fleet`

在終端機看同一份清單,任何資料夾都能跑(不需要 repo;不執行 git)。除了 `--prune` 之外都是唯讀。

```
npx flightwake fleet                     # 文字,等你回覆的排前面
npx flightwake fleet --json              # 給工具用的單一 JSON 物件(只增不改,與檔案相同)
npx flightwake fleet --all               # 30 天,已結束不設上限
npx flightwake fleet --root=/abs/path    # 只列 repo 或主工作樹是這個路徑的 session
npx flightwake fleet --prune [--days=N] [--dry-run]   # 刪掉超過 N 天(預設 7)的已結束/失聯檔
```

`--lang=` 指定語言(否則用目前資料夾的 flightwake 語言,再否則英文)。接回指令一律帶 `cd '…' && ` 前綴。`--prune` 只動資料夾裡直接放著的
一般 `<id>.json` 檔:結束時間超過 N 天的已結束檔、最後心跳超過 N 天的失聯檔,或在那之前最後修改的、我們自己寫到一半的檔(開頭是 `{"schema":"flightwake.session/`)
或不認得版本的 `flightwake.session/` 檔;不是我們的檔(其他任何 JSON)絕不刪,120 秒內修改過的檔絕不刪,資料夾本身也不刪。資料夾位在 repo 或紀錄資料夾裡時,
它會拒絕(exit 1,什麼都不刪)。這是 `<base>/sessions` 裡**唯一**的刪除途徑:`npx flightwake uninstall` 與 `--purge` 都保留這個資料夾(所有 repo 共用),
並印一行說明。

### 底部儀表的欄位

當另一個 session 已經等你回覆至少 2 秒、而且心跳還活著,底部儀表(`statusline.mjs`)會在品牌名稱後面顯示一個紅色欄位(放在第二欄,截斷時也留得住):
一個時是 `⛔ api 等你回覆`(repo 名稱,最多 16 字元),多個時是 `⛔ 2 個 session 等你回覆`。你自己的 session 永遠不計。它只讀 120 秒內修改過的檔,
不寫入、不連網。

### 接回提示

新 session 開始時(重新載入、`/clear`、`/resume` 都不算),最多一次:如果**同一個 repo 資料夾**裡有個 session 在近 7 天內意外中斷——心跳失聯
(當掉、`kill -9`、斷電),或以原因 `other` 結束——至少跑過一個回合、transcript 還在、而且之後沒有人在那個資料夾開過新 session,就跳一則 toast
點名那個 session,並指向 `/fw-fleet`(完整的接回指令在那裡;toast 只有約 40 欄寬,放不下 session id):

```
flightwake:session 1234abcd 在 2h 前意外中斷(當時工作中)——/fw-fleet 有接回指令
```

正常的 `/exit`、`/clear`、`/resume` 或登出絕不觸發。「只提示一次」靠檔案本身判斷:那個資料夾有更新的 session 啟動過,候選就作廢——不另外儲存任何東西。

### session 檔契約

schema `flightwake.session/1`。JSON(`JSON.stringify(rec, null, 2)` 加一個換行)、UTF-8,通常小於 1.2 KB,每次寫入整檔重寫。每個欄位一律存在;
`null` 表示不明,絕不用假的 0。時間是 epoch 毫秒。

| 欄位 | 意義 |
|---|---|
| `schema` | `"flightwake.session/1"` |
| `mod` | 寫入者的 mod 版本 |
| `sessionId` | session id;等於檔案的主檔名 |
| `instance` | 每個程序一個的寫入者記號(熱重載後不變) |
| `state` | `working` / `blocked` / `idle` / `ended` |
| `why` | 上次狀態改變的機器可讀原因(例如 `permission-dialog`、`turn.complete:answer`、`adopt:clear`);心跳不改它 |
| `stateSince`、`seq`、`heartbeatAt`、`heartbeatMs` | 狀態上次改變的時間;每次寫入 +1;上次寫入時間(結束後凍結);`30000` |
| `startedAt` | 這個程序接手這個 id 的時間 |
| `root`、`repoRoot`、`launchCwd` | session 的工作根目錄(跟著 `/cd` 與 worktree 移動);主工作樹或 null;session 啟動的位置——`claude --resume` 必須在這裡執行 |
| `lang`、`surface` | 顯示語言;`terminal` 等,或 null |
| `blocked` | null,或 `{kind: permission / question / plan, tool, target, agent, since}`——恰好在 `state` 為 `blocked` 時不是 null;取最早開始的等待 |
| `activity` | null,或 `{tool, target, agent, at}`——最近開始的工具呼叫 |
| `inFlight`、`turns` | 目前正在跑的工具呼叫數;到目前為止的回合數 |
| `lastTurn` | null,或最後一個主迴圈回合的 `{reason, at, durationMs}` |
| `ended` | null,或 `{reason, at, stateAtEnd}`——`reason` 是 Claude Code 的 session 結束原因或 `id-changed` |
| `resume` | `{id, resumable}`——`resumable` 表示至少跑過一個回合 |
| `transcript` | transcript 路徑,或 null |
| `parent` | null,或 `{sessionId, via: clear / resume / fork / id-changed}`——同一個程序裡被這個 session 取代的那一個 |
| `contested` | 兩個程序共用同一個 id 時為 true |
| `host` | 只有環境變數有設的鍵:`orcaTerminal`(`ORCA_TERMINAL_HANDLE`)、`orcaWorkspace`(`ORCA_WORKSPACE_ID`)、`tmuxPane`(`TMUX_PANE`) |
| `context` | mod 0.3.0+:null,或 `{percent}`——最近一個回合或心跳時的 context 用量,取整 |
| `role` | mod 0.3.0+:這個資料夾 Claude 座位的角色 id(來自 `.claude/CLAUDE.md` / `CLAUDE.md` 的 roles 區塊),或 null |
| `fwVersion` | mod 0.3.0+:repo 指令檔標記裡的 flightwake 版本(`0.16.0`),或 null |

`target` 是 Edit / Write / MultiEdit / Read / NotebookEdit 在 repo 內的 repo 相對路徑,否則為 null;子 agent 發出的呼叫 `agent` 為 true。

讀取端的規則:

- v1 **只增不改**。忽略不認得的欄位;缺少的欄位當成 null;不認得的 `state` 或 `kind` 一律當成 `unknown`;主版本不認得時顯示 `unknown`,
  附上 id 與心跳。
- 解析失敗是暫時的(寫到一半):這一輪略過該檔,沿用上次的正確值。
- **失聯:**`now − heartbeatAt > max(4 × clamp(heartbeatMs, 5000, 600000), 90000)`,沒有 `heartbeatMs` 時用 30000(目前是 120 秒)。失聯的檔絕不算工作中或等你回覆。`contested: true`,
  或 `heartbeatAt` 比現在晚 60 秒以上,算 `unknown`。
- 等你回覆的**通知**只在 `now − blocked.since ≥ 2000` 時發,以 `${sessionId}:${blocked.since}` 去重。
- 刪除只透過 `npx flightwake fleet --prune`。

給 Orca 與其他工具的建議:

- 監看資料夾(`fs.watch`,200 ms 去抖動,5 秒輪詢備援),只重讀有變的檔。不要每次輪詢都執行 `npx flightwake fleet --json`。
- 以 `host.orcaTerminal` 對應到窗格,沒有時退回 `root` / `launchCwd`(`heartbeatAt` 最新者優先)。
- `/clear` 之後沿著 `parent.sessionId` 接續。
- 接回按鈕:在 `launchCwd` 執行 `claude --resume ${resume.id}`。

#### trip 檔

`<base>/trips/<session id>.json`,由 `tripwire`(不是 `fleet`)寫入;`<base>`、檔名規則與寫入防護都與 session 檔相同。每個 session id 一個檔,
每次有工具呼叫命中條目之後整檔重寫(`JSON.stringify(t, null, 2)` 加一個換行):

```json
{
  "v": 1,
  "sessionId": "<id>",
  "repo": "/abs/path/of/the/repo",
  "updated": "2026-10-26T08:00:00.000Z",
  "trips": { "<trap name>": { "n": 3, "first": "<ISO>", "last": "<ISO>" } }
}
```

- `repo` 是最近一次命中時 session 的根目錄(絕對路徑,照 Claude Code 回報的);`updated` 是最近一次命中的時間。時間是 ISO 8601、UTC。
- `trips` 以條目的 `name` 為鍵(條目改過內容仍記在同一個名稱下)。`n` ≥ 1,是命中該條目的工具呼叫次數,不論有沒有提示;一次呼叫對每則條目只算一次。
- 該路徑上若有檔案不是 `v: 1` 且 `sessionId` 相同,就絕不覆蓋。mod 從不刪除 trip 檔。

## 限制——請先讀這段

- **`/fw-log` 裡的「pass」** 的意思是:一個被直接呼叫、認得出的測試執行器,以可辨識的方式跑完並回傳 0。它看不到設定檔或環境裡讓測試
  根本沒跑的設定(例如 pytest.ini 的 `addopts`、略過測試的 build profile),也不保證測試檢查的內容是對的。任何它無法證明的情況,
  都會記成「unknown」並附上結束碼,而不是 pass。
- **角色守門不是安全邊界。** Bash 與其他工具不會被檢查,子 agent 不會被檢查,被禁止路徑的 symlink 或其他別名也擋不到。
- **`/fw-log` 裡經由 shell 指令改動的檔案可能不完整。** 那一段是從指令推斷的:repo 內輸出重導向(`>`、`>>`)的目標,以及 `cp`、`mv`、`rm`、`tee`、`sed -i`。
  用其他方式寫入的(腳本、其他程式、git)看不到;「agent 改的檔案」清單仍然只含 Edit / Write / NotebookEdit 工具回報的。
- **只列出能確認的路徑——可能漏記,但不該錯記。** 每個指令依它自己的參數語法讀取,參數值(sed 的 `-e`/`-f` 腳本、cp 的 `-t`/`-S`)不會被當成路徑;相對路徑只在工作目錄確定時解析(一開始,或開頭的 `cd 目錄 &&` 之後),其他任何 `cd` 之後就不猜;repo 外的路徑不記;候選路徑還要在指令執行後由 git 確認在 repo 內有變更才列出。不是 git repo 就什麼都不列。(踩坑絆線刻意做相反的取捨:它只是提示,寧可多提示;記錄是紀錄,寧可漏記。)
- **測試指令與其他指令串在一起時,結果記成「unknown」。** 例如 `echo … && npm test 2>&1; echo exit=$?`:只看得到整串的結束碼。每個 session 會對 agent 提示一次
  (附在那次工具結果上):這樣的執行不能算作通過的證據,需要證據時請把測試指令單獨跑一次。這則提示只是說明,不會阻擋任何事。
- tripwire 無法確定工作目錄時(例如 `||` 之後的 `cd`、子 shell 裡),會在候選目錄下逐一比對——最多 16 個,超過就改成比對路徑的尾段——所以可能提示得比必要的多。
- **session 狀態回報:權限對話框可能停留過久。** 沒有事件標示「對話框已回覆」:你核准之後,工具在同一個呼叫裡執行,所以 session 會一直是
  `blocked`,直到工具跑完。在終端機裡,工具的進度標示一畫出來就會解除;MCP 工具與 WebFetch 會一直等到跑完。「持續」欄從 `blocked.since`
  起算,畫面上寫的是「權限確認」,不是「對話框開著」。
- **桌面版、VS Code 與 Remote Control 上的 session 狀態回報尚未驗證。** 那些環境若不發出權限事件,對話框會顯示成工作中——是漏報,不是誤報。
- **session 狀態回報與同步的家目錄:** 另一台機器上進行中的 session 看起來也是進行中(檔案裡沒有主機名稱)。
- **兩個程序共用同一個 session id**(例如在兩個終端機各跑一次 `claude --resume <id>`)會顯示為「不明」。其中一個結束而另一個還在時,
  檔案最多有 30 秒顯示已結束,直到另一個的下一次心跳。
- **session 中途關掉 `fleet`**:檔案會變成失聯,可能被當成接回候選提示一次。`npx flightwake fleet --prune` 可刪掉。
- **政策面。** 有 `fleet` 時,hooks 模組會用到 `fs.write`、`fs.list` 與六個環境變數讀取(`FLIGHTWAKE_HOME`、`HOME`、`USERPROFILE`、
  `ORCA_TERMINAL_HANDLE`、`ORCA_WORKSPACE_ID`、`TMUX_PANE`);有 `tripwire` 時,為了 trip 檔會用到 `fs.write` 與其中前三個環境變數。有 `panel` 時,還會讀 `ORCA_CLI_BIN_DIR`,並在 Orca 裡執行 `orca` CLI(見上方「側邊面板」)。拒絕會寫檔或執行程序的外掛的受管政策會拒絕**整個** mod,不只這個功能。
- **Fleet 面板的狀態有一部分是猜的。** 沒有 session 狀態回報檔的 agent(Codex、其他 CLI、沒裝 mod 的 Claude Code),工作中 / 閒置 / 等你回覆是從分頁標題和最近的輸出判斷的,最多可能慢 10 秒,agent 改了標題格式時也可能判斷錯。**收尾**在送出前會重新檢查,但用的仍是同一套推測。
- 只支援 Claude Code。需要 2.1.287 以上、已接受資料夾信任提示、而且從 repo 根目錄開始。
- 已在一個真實的 Claude Code session 裡驗證過一次(前五個功能都生效)。**還沒有**在真實 session 驗證的:`spend` 功能、重啟後接續 session、compaction
  之後的行為、80% 的 toast、桌面版 / VS Code 的外觀,`/config` 是否真的列出這些選項(文件是這樣描述的),以及整個 `fleet` 功能(發版前必須在真實 session 裡
  驗過對話框、auto 模式、AskUserQuestion、`/clear`、`/exit` 與 `kill -9` 各情況)。
