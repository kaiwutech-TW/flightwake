# flightwake 第一階段任務說明:引導式 setup、doctor、repo 類型、冷啟動補洞、Orca 協作選配

對象 repo:`/Users/kaiwu/orca/flightwake`(main @ 9dd685c,v0.14.0)
狀態:第 3 版,可動工。已依 GPT-6 Astra 的唯讀審查(2026-10-05)修訂,Kai 已就進入點、元件預設、Orca 協作三點做出決定。

## 為什麼做

1. 安裝後容易卡住。實例:在一個新 repo 跑完 `init`,STATE 仍是滿是 `{{DATE}}` 的原始範本,冷啟動 skill 沒有處理這種情況的分支。
2. `init` 遇到缺 `.git` 的目錄只印「Run git init first」就退出(`bin/cli.mjs` 52–63 行)。這條分支裡沒裝 git 和沒 init 得到同一條訊息;而目錄已有 `.git` 時,完全不會先驗證 git 是否可用。
3. roles(v0.14.0)是選配,但 `init` 完全不提,新使用者不知道它存在。
4. 「測試綠 + typecheck 乾淨」「prod 留證據」這些義務,在純討論、筆記型的 repo 用不上。(Stop hook 的證據檢查只看最新 record 的 `tests:` 是否非空,範本也允許填「無 runtime 面」,所以 hook 本身不需要為此改動。)

## 不可違反的既有承諾

- 零執行期依賴:只用 Node 內建模組(互動提問用 `node:readline`)。
- 不連網、無 install script。
- 寫入範圍固定(README「安全性」一節列出的清單)。本次唯一新增的寫入動作是經使用者同意後執行 `git init`,必須補進該清單,並明寫這是「只複製檔案」的例外。該清單現況漏列 `~/.flightwake/registry.json`(init/update 實際會寫,`cli.mjs` 73、602 行),一併補上;setup 的寫入摘要要以程式實際寫入為準,不能照抄 README。
- 使用者資料(STATE / DECISIONS / TRAPS / records / ROLES.md)任何情況下都不覆蓋。
- 本次新增的 CLI 輸出一律走 `M()` 四語表(en、zh-TW、zh-CN、ja),缺 key 回退英文。現有的 help 與 git 錯誤訊息仍是硬編英文,本次有改到的訊息順手納入,其餘不強求。
- 語言不做自動偵測(既有決策)。
- 不新增每個 session 的開工關卡(DECISIONS 2026-08-03 否決過 intake gate)。setup 是一次性安裝流程,不在此限。
- **本次會取代一條舊決策,必須在 DECISIONS 明記**:2026-07-18「不做 GSD 式互動選單」。當時的理由有兩個:互動 prompt 違反零依賴(用內建 `node:readline` 即不成立),以及會卡死 agent 與 CI 的非互動安裝(仍然成立,所以 `init` 必須維持完全不提問)。
- roles 是 opt-in 附加元件(DECISIONS 2026-09-27),setup 不得在使用者沒有明確同意的情況下安裝它。
- `init` / `update` / `uninstall` / `roles` 現有行為與旗標不變,既有 smoke 測試全數維持通過。

## 項目 1:引導式 setup

### 進入點

- `npx flightwake setup`:進入互動式 setup。stdin 不是 TTY 時印出說明(改用 `init` 加旗標)並以非零退出。
- `npx flightwake`(無指令)與 `init`:行為完全不變,不提問。
- README 把 `npx flightwake setup` 列為主要入口,`init` 列為給自動化與進階使用者的非互動用法。

Kai 的決定(2026-10-05):收回 2026-07-18「不做互動選單」。當時設想的使用者是自己和技術人員;實際使用者多為非技術人員,需要引導。

### 流程

1. **git 是否安裝**:`git --version` 失敗 → 印出各平台安裝指引,非零退出。這個區分也要套用到 `init`,不再和「不是 repo」共用訊息;目錄已有 `.git` 但找不到 git 時,`init` 與 setup 同樣擋下並印專屬訊息(2026-10-05 設計者確認)。
2. **是否為 git repo**:
   - 在某個 repo 的子目錄 → 維持現有 monorepo 訊息並退出。
   - 完全不是 repo → 問「要在這裡執行 git init 嗎?[y/N]」,預設否;拒絕則退出並說明。**同意後不立刻執行**,而是記下選擇,等第 9 步最終確認後才以 `execFileSync('git', ['init'])` 執行,確保在最終確認前取消時零寫入。
   - `init` 對應新增 `--git-init` 旗標(明確給旗標才建,不提問)。
3. **已有安裝**:偵測到既有安裝時告知現況(版本、語言、已裝選項),只提供「沿用現有選項升級(等同 update)」或離開。完整的「調整選項」介面本階段不做:現有程式對 private / statusline 是以 OR 沿用,無法表達取消(`cli.mjs` 131–132 行),減少 agent 也不會清理舊產物,要做對需要另一輪設計。
4. **語言**:四選一;預設為既有安裝的語言,否則英文。
5. **agent**:偵測到指令檔(CLAUDE.md/AGENTS.md/GEMINI.md)時列出偵測結果,按 Enter 沿用、可改選(對應 `--agents`);**一個都偵測不到時直接問使用者用哪些工具**(claude、codex、gemini 可複選,不預選、不能空白),不沿用 init 的 codex 預設——否則用 Claude Code 的人問不到儀表那一題。`init` 的非互動預設不變(2026-10-05 Kai 決定)。
6. **附加元件**:核心一律安裝,不提供「全部安裝」的捷徑。核心之外的每個附加元件各問一題,預設皆為否:
   - 底部儀表(對應 `--statusline`;只在選了 Claude Code 時問)
   - 角色(只安裝 `fw-roles` skill,等同 `roles install`;結尾提示對 agent 說「跑 fw-roles」)
   - Orca 協作(只在偵測到 Orca 時問,見項目 5)
   - mod 屬於第二階段,本階段不出現。
   提問放在摘要確認之前,實際安裝順序是核心先、附加元件後。
7. **repo 類型**:程式專案(預設)或筆記型,見項目 3。
8. **`--private`**:setup 不提問,只認命令列旗標(`npx flightwake setup --private`);一般使用者的流程裡不出現這題。(第 3 版原文「只在逐項設定時才問」是修訂殘句,第 3 版已無逐項設定模式;2026-10-05 設計者確認改正。)
9. **摘要與確認**:列出即將寫入的路徑(依解析出的選項),確認後才寫。「確定執行?」**預設是**(`[Y/n]`,Enter 即執行);`n`、EOF、Ctrl-C 仍零寫入並非零退出。git init 那一題維持預設否(2026-10-05 Kai 決定)。
10. **執行**:setup 只負責解析選項,安裝本身走與 `init` 完全相同的程式路徑,不複製安裝邏輯。
11. **收尾**:自動跑一次 doctor,並印出下一步(開一個 agent session 跑冷啟動)。

### 中斷處理

EOF、Ctrl-C、任何一步拒絕,在最終確認之前都必須零寫入並以非零退出。旗標與提問的優先序:命令列已給的旗標視為該題的答案,不再提問。

### 可測試性

把問答抽成可注入輸入輸出的函式,測試直接餵答案。不加用來繞過 TTY 判斷的隱藏環境變數。

### private 與 roles 並用

`roles install` 目前另外複製 skill,不會更新 `.git/info/exclude`(`roles.mjs` 486 行附近)。setup 在 `--private` 下又選了 roles 時,角色檔會出現在 git status。本階段要補上這個排除。

## 項目 2:doctor

`npx flightwake doctor`:唯讀、不寫任何檔、不連網。

檢查項目:
- git 已安裝;目前目錄是 git root。
- Node 版本 ≥18。
- STATE 是否仍含**已知範本欄位**的未填佔位符(見項目 4 的判定方式)。
- `.flightwake/` 存在;STATE 存在;STATE 的 `latest_record` 指向的檔案存在。
- marker 區塊存在於預期的指令檔;各平台 marker 的版本、語言是否彼此一致;與目前套件版本是否一致(不一致列為提醒,並指向 `update`)。
- skill 已安裝。注意 `.claude` 的 skill 與 hook 目前是無條件安裝,檢查清單不能只按 active agents 推導。
- hook 註冊:設定檔是合法 JSON;事件名稱正確(Claude Code 與 Codex 是 `Stop`,Gemini CLI 是 `AfterAgent`);command 完全符合預期而非只是包含檔名(現有安裝判定是字串包含,`cli.mjs` 383 行附近,doctor 不可沿用);沒有重複註冊;指向的腳本檔存在。
- `--private` 安裝:排除項目是否仍然有效。
- 選配:儀表、roles 是否安裝(僅回報狀態,未安裝不算問題)。

doctor 只能宣稱「安裝結構正確」,不能宣稱 hook 在執行期確實生效。Codex 的路徑信任無法唯讀可靠判定(TRAPS 已有 confirmed 紀錄:檔案存在不代表已載入),只印提示請使用者實際觸發一次確認,不列為通過或失敗。

輸出每項一行,分 ok / 提醒 / 失敗,四語。有任何失敗則退出碼 1,只有提醒則 0。

## 項目 3:repo 類型

- 新旗標 `--profile=code|notes`,預設 `code`。
- 記在 marker 裡(例如 `profile=notes`)。現有的 marker 解析 regex 不接受額外屬性(`cli.mjs` 106 行),要改成能容忍未知屬性。沒有 profile 的舊 marker 一律視為 `code`;`update` 要沿用已記錄的 profile。
- 要定義的邊界情況:`--private` 安裝可能沒有任何 marker,profile 要有別的保存位置;多個指令檔的 marker 記錄不一致時以哪個為準。
- `notes` 的差異:
  - 安裝的檔案集合不變。筆記專案同樣需要坑、決策與交接。
  - 義務表改用精簡版:保留冷啟動、決策紀錄、坑登記、交接、落後 ≥3 commits 收尾、破壞性操作先確認、session 結束時 STATE 反映現況;只拿掉「測試綠 + typecheck」「prod 驗證證據」以及以 schema / prod 為觸發條件的部分。
  - skill 文字裡以 schema / prod 為觸發的描述(例如 `fw-record` 的 description)要一併處理,不能只改義務表。
  - hook 不改。

## 項目 4:冷啟動補洞

`fw-coldstart` skill(所有已提供的語言版本)加一個分支:STATE 仍留有**已知範本欄位**的佔位符時(frontmatter 的 `{{DATE}}`、`{{SESSION_OR_PERSON}}`、`records/{{YYMMDD}}-{{slug}}.md` 等範本原文),視為尚未初始化,依 repo 現況寫出第一版 STATE,回報後才繼續。

- 不能把任何 `{{…}}` 都當成未初始化,使用者內容裡可能有合法的大括號範例。
- 只補未填的欄位,已填的內容原樣保留。
- 定義缺料時的行為:沒有任何 record、沒有 commit、沒有 README。
- health 不能猜 green;沒有驗證依據時如實標示。未初始化的 STATE 裡,範本預填的 `health: green` 視為未填:有驗證依據才標 green,否則標 yellow 並寫明原因;範本本身不動(2026-10-05 設計者確認)。

README 的「第一次安裝後」步驟同步更新。

## 項目 5:Orca 協作(選配附加元件)

背景:Kai 的習慣是讓不同廠牌的 agent 互相審查,並且要在 Orca 的分頁裡看得到整段對話。agent 預設會另外啟動背景程序(例如 `codex exec`)去問,使用者在分頁裡什麼都看不到。

- 性質與 roles 相同:屬於「引導工作」,只能是 opt-in,不進核心。
- 偵測:環境裡有 Orca(CLI 可執行,或 Orca 匯出的環境變數存在)才在 setup 提問;`init` 對應一個明確旗標。偵測不到就完全不提。
- 安裝內容:一段有 marker 包住的指示,寫進各 active 平台的指令檔(四語)。要點:
  - 在 Orca 裡要找另一個 agent 討論或審查時,優先把訊息送進使用者已開的可見分頁,再從該分頁讀回覆;不要另起背景程序。
  - 純審查的請求要在訊息裡明講只讀不改(可見分頁不一定有唯讀限制)。
  - 找不到合適的既有分頁時,先告訴使用者,不要自行決定改走背景。
  - (2026-10-05 Kai 補充,以下五點)被找來討論或審查的 agent 不寫 record、不改 STATE,把結論交回給找它的 agent。
  - 找人審查的 agent 負責把採納的結論寫進自己的 record。
  - 請對方審查時,要求回覆包含四項:結論、依據(檔案與行號)、沒有驗證的部分、考慮過但不採用的做法。
  - 會影響決策的審查回覆,原文要存成 repo 裡的檔案(比照 `docs/plans/*.review-*.md`),因為終端機畫面不會留存。
  - 審查者只讀不改,要改由主線 agent 改,讓所有變更都留在同一邊的紀錄。
  - 理由:Stop hook 在兩個廠牌的 session 都會催收尾,不講清楚誰是寫手就會兩邊同時改 STATE;而且主線只拿得到審查者的最終結論,拿不到過程。
- 不要把 Orca 的指令語法寫死在指示裡。指向 Orca 自己隨版本提供的說明(`orca skills get orca-cli`),避免 Orca 改版後過時。
- `uninstall` 要能移除這段;`update` 只在已安裝的地方刷新;`--private` 下遵守同樣的排除規則;doctor 回報其安裝狀態。

## 測試(擴充 `test/smoke.sh`)

- `setup` 且非 TTY → 非零退出並有指引。
- PATH 中沒有 git → 專屬訊息、非零退出(init 與 setup 皆然)。
- 非 repo:`init` 不帶旗標 → 退出;帶 `--git-init` → 建立 repo 並完成安裝。
- 無指令 → 行為等同 `init`,不提問(TTY 與否皆然)。
- setup 的問答流程:全部預設(只裝核心)、各附加元件單獨選是、拒絕 git init、既有安裝。
- Orca 協作:偵測不到 Orca 時不提問、不安裝;安裝後 marker 區塊存在;`uninstall` 移除;`update` 沿用。
- 最終確認時拒絕、EOF、Ctrl-C:零寫入(含不留下 `.git`)。
- worktree 與 submodule 下的行為。
- doctor:全新安裝 → 0;刪掉一個 skill 或 hook、hook command 被改錯、設定檔 JSON 損毀 → 1;STATE 未填 → 提醒但不失敗。唯讀驗證要涵蓋被 git 忽略的檔案與外部的 registry,不能只看 git diff。
- `--profile=notes`:marker 有記錄;義務表為精簡版;`update` 後仍是 notes;舊 marker 視為 code;code 與 notes 雙向切換;private 安裝下 profile 仍能保存。
- 既有測試全數通過。

## 文件

- README 四語:安裝段落改以 `npx flightwake setup` 為主要入口(`npx flightwake` 無指令仍等同 `init`,不提問),`init` 列為非互動用法;新增 doctor、profile 說明;「安全性」寫入範圍清單補上 `git init`。
- CHANGELOG。
- CLI 的 `--help` 文字。

## 工作方式

- 在新的分支與 worktree 進行,不直接動 main。
- 遵守該 repo 自己的 flightwake 紀律:先冷啟動;關掉選項的決策寫進 DECISIONS;收尾寫 record 並更新 STATE。
- 本任務說明複製到 `docs/plans/setup.md` 一併進版控(比照 `docs/plans/roles-v2.md`)。
- 不 bump 版本、不 push、不發版;這些要先問 Kai。
- 核心改動(`bin/cli.mjs`、hook)由主要實作者自己寫;四語文件同步與 smoke 測試案例可派給 subagent。

## 不在本階段範圍

mod、SessionStart 自動載入、roles 本身的變更(private 排除的修補除外)、既有安裝的「調整選項」介面、flightwake-tower。

## Kai 的決定(2026-10-05)

1. 進入點採明確的 `setup` 指令,無指令行為不變;同時收回「不做互動選單」的舊決策。
2. 先裝核心,再逐項詢問附加元件,不做「Enter 全部安裝」。
3. 新增 Orca 協作附加元件(項目 5)。

這三點以及被取代的 2026-07-18 決策,都要寫進 DECISIONS。

## 審查紀錄

GPT-6 Astra 唯讀審查全文:`setup.review-astra.md`(第 1 版任務說明的審查)。
