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

不連網。它**從不寫你的紀錄**(STATE、DECISIONS、TRAPS、records、ROLES.md),唯一的狀態是每個 session 各自一份(`$.state`)。
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

- **`npx flightwake setup`**:在選配附加項那一步多一個問題,只在你選了 Claude Code 時才會問,預設 No。它會用白話說明這個 mod,
  並提到 2.1.287 的版本需求與信任提示。
- **`npx flightwake init --mod`**:直接安裝。如果這次要設定的 agent 裡沒有 Claude Code,它會印一則說明並略過 mod(不算錯誤)。
  資料夾已經存在時,`init --mod` 會略過,除非加 `--force`。
- **複製了什麼**:外掛的 manifest(`.claude-plugin/plugin.json`)、`hooks/` 與 `types/`——不含它的測試與開發用腳本。
- **`npx flightwake update`**(以及 `init --force`)只在已經裝了 mod 的地方刷新它,逐檔處理;你自己加在
  `.claude/skills/flightwake-mod/` 裡的檔案會保留。`update` 不會替你新增 mod。
- **`npx flightwake uninstall`** 只移除 flightwake 發行到這裡的檔,以及因此變空的資料夾。`.claude/skills/flightwake-mod/` 裡的其他東西(你自己加的檔、Claude Code 寫的檔)會保留,並在輸出列出;flightwake 發行的是檔案、那個位置卻是目錄時,也原樣保留並列出,絕不遞迴刪除。`uninstall --purge` 只針對 `.flightwake/`,也不會刪它們。
- **`--private`**:mod 資料夾會進 `.git/info/exclude` 的標記區塊。如果該資料夾已經被 git 追蹤,`--private` 會在寫入任何東西之前
  就拒絕(與其他 private 的前置條件相同)。之後才對 private 安裝補跑 `init --mod`,也會把它加進 exclude 區塊。

### 底部儀表與 band 一起用

`setup` 兩個問題都會問。兩者都裝時,收尾訊息會說明分工:底部儀表顯示 health、STATE 落後量與 context 用量;提示列上方的 band 在儀表
開著時會隱藏這些相同的欄位、保持安靜,只在 context 偏高時跳一次 toast。選 mod 絕不會把儀表移除。沒有儀表時,band 一律顯示,並在 Claude Code 回報時一直帶著 context 百分比,頂替儀表的位置;安裝器的收尾訊息也會這樣說明。

### 裝完之後

安裝器會印出:需要 Claude Code 2.1.287+;要從 repo 根目錄開始並接受信任提示;怎麼自己打開角色守門(下面的 `pluginConfigs` 設定,或 `/config`);
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

## 五個功能,各有各的開關

四個預設開、角色守門預設關。開關是外掛選項,放在 Claude Code 的 `/config`,或你的*使用者*設定裡:

```json
"pluginConfigs": { "flightwake-mod@skills-dir": { "options": { "<開關>": true } } }
```

外掛選項不讀專案設定,所以安裝器沒辦法替你設定。

| 開關 | 預設 | 做什麼 |
|---|---|---|
| `stateInject` | 開 | session 開始時,把 `.flightwake/STATE.md`(每個 session 只取一次的快照)放進 system prompt,並註明這是上次收尾時的狀態,仍應檢查 git。STATE 還是未填的範本時,改放一行「請先跑冷啟動」。超過 6000 字元時,不是截掉前 N 個字,而是注入 frontmatter、「進行中」與「下一步入口」兩段以及檔案路徑,並提示你壓實 STATE。它不取代 `fw-coldstart`(落後檢查與讀最新 record 仍是 skill 的工作)。 |
| `band` | 開 | 提示列上方的一行:health 顏色、STATE 落後量(與 Stop hook 檢查同一個算法;bot 的 commit 不計)、context 用量,以及建議的下一個指令。沒有生效中的底部儀表(`statusline.mjs` 不是狀態列)時,band 一律顯示,Claude Code 有回報 context 百分比就一律帶上;它不再等到 60%,一切正常時也不消失,而是頂替儀表。顏色門檻不變(≥60% 黃、≥80% 紅),context 到 80% 時照樣跳一次 toast。STATE 還是未填的範本時,health 顯示為 `?`,並提示「STATE 尚未初始化——先跑 /fw-coldstart」。若 flightwake 的底部儀表(`statusline.mjs`)就是生效中的狀態列,band 會隱藏儀表已經顯示的欄位並保持安靜,只剩 80% 的 toast。 |
| `recorder` | 開 | session 飛行日誌:改了哪些檔案、commit,以及認得出的測試指令與結果。`/fw-log` 會把它印出來,供 `fw-record` 當作 `tests:` 證據與變更清單;經由 shell 指令改動的檔案會另列一段(推斷而來,可能不完整),時間以本地時間加 UTC 偏移顯示、後面接 UTC。它從不寫 record。 |
| `tripwire` | 開 | 當 agent 編輯的檔案或執行的指令,符合某則啟用中的 TRAPS 條目的選填欄位 `paths` / `commands` 時,會把該條目的重點與信心程度給 agent 看,每個 session 一次——是在工具跑完*之後*,所以保護的是下一次嘗試,不是這一次。從不阻擋。`probable` / `suspected` 的條目會標成線索,不是結論。 |
| `roleGuard` | 關 | 針對這個資料夾 Claude 座位上的角色,角色內文(ROLES.md)裡的 `deny-write: [globs]` 行會變成對主 session 的 `Edit` / `Write` / `NotebookEdit` 寫入這些路徑的攔截,訊息會說明是哪個角色、哪條規則、改怎麼做。只有使用者本人能用 `/fw-role-release`(在輸入框打)為本 session 放行;放行期間狀態列持續顯示。細節見 [roles.zh-TW.md](roles.zh-TW.md) 的「選配:Claude Code mod 的角色守門」。 |

### tripwire 用到的 TRAPS 欄位

兩個都是選填;沒有這兩個欄位的舊條目就是不會被比對到:

```yaml
paths: ["src/db/**", "*.sql"]          # repo 相對的 glob;不含 / 的樣式會比對任何深度的該檔名
commands: ["npm run migrate", "psql"]  # 指令前綴,逐個 token 比對
```

不支援正規表示式。已被 superseded 的條目永遠不會被比對。

### 查看它現在在做什麼:`/fw-mod`

`/fw-mod` 是唯讀指令,列出五個功能各自是開、關還是閒置(idle)、原因,以及要怎麼讓它生效。例如:band 因為偵測到底部儀表而隱藏;
tripwire 開著但閒置,因為沒有任何啟用中的 TRAPS 條目有 `paths` 或 `commands`;角色守門關著(並說明怎麼打開),或開著但閒置,因為這個資料夾的座位沒有角色、
或角色沒有 `deny-write`;STATE 本 session 已注入,或因為 STATE 還沒初始化而只注入「請先跑 /fw-coldstart」的提示。它也會顯示 mod 版本、偵測到的語言與 profile。
它不改任何東西,也不是五個開關之一——只要裝了 flightwake,隨時都能用。

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
- 只支援 Claude Code。需要 2.1.287 以上、已接受資料夾信任提示、而且從 repo 根目錄開始。
- 已在一個真實的 Claude Code session 裡驗證過一次(五個功能都生效)。**還沒有**在真實 session 驗證的:重啟後接續 session、compaction
  之後的行為、80% 的 toast、桌面版 / VS Code 的外觀,以及 `/config` 是否真的列出這些選項(文件是這樣描述的)。
