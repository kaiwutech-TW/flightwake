# flightwake 第三階段任務說明:把 mod 接進安裝器

對象 repo:`/Users/kaiwu/orca/flightwake`。本分支以 `kaiwutech-TW/setup-wizard` 為基底。
狀態:第 1 版。前兩個分支都已通過設計者驗收與 GPT-6 Astra 的收尾確認(各自的 `docs/plans/*.diff-review-astra-4.md`)。

## 前置:合併兩個分支

1. 把 `kaiwutech-TW/mods` 合併進本分支。程式碼不衝突;衝突只在 `.flightwake/DECISIONS.md`、`.flightwake/TRAPS.md`、`.flightwake/STATE.md`。
2. DECISIONS 與 TRAPS 是只增不改的紀錄,兩邊的條目都保留,依日期排序規則放好。STATE 重寫成反映合併後的現況。兩邊的 record 檔都保留。
3. 合併後先確認:完整 smoke、`claude plugin validate`、`claude plugin test`、型別檢查、零寫入檢查全部通過,再開始下面的工作。

## 為什麼做

mod 已經做好,但目前只是 repo 裡的 `mods/flightwake/` 原始碼,使用者沒有任何方式安裝它。安裝器(setup / init / update / uninstall / doctor)要認得它。另外第二階段因為不能動 `skills/`、`templates/` 而延後的三件事,現在可以做了。

## 不可違反的承諾

沿用前兩階段的全部承諾,特別是:

- mod 是選配附加元件,預設不裝。
- 所有寫入與刪除都走既有的受防護 writer 與預檢;不新增繞過它的寫入路徑。
- 寫入範圍:mod 安裝到目標 repo 的 `.claude/skills/flightwake-mod/`,在 flightwake 既有的寫入範圍(`.claude/skills/`)之內。README 的寫入範圍清單要補上這個路徑。
- `init` 不提問;既有旗標與行為不變。
- 新增輸出一律四語。

## 項目 1:安裝、更新、移除

- `init --mod`:安裝 mod。只在 active agents 含 claude 時有意義;沒有 claude 時說明並略過(不算錯誤)。
- setup:在附加元件階段多問一題(只在選了 Claude Code 時問,預設否)。題目要用一般人看得懂的話說明它做什麼,並提到需要 Claude Code 2.1.287 以上、第一次要在 Claude Code 接受這個資料夾的信任。
- 安裝內容:把 `mods/flightwake/` 的發行內容複製到 `.claude/skills/flightwake-mod/`。測試檔、開發用腳本不需要裝進使用者的 repo;實際要帶哪些檔由你依外掛載入所需決定,並記進 DECISIONS。
- 安裝時把安裝語言傳給 mod 的方式:mod 目前從指令檔 marker 讀語言,確認經由 setup / init 安裝後語言正確(含 `profile=notes` 的 marker、只有 AGENTS.md 的 repo)。
- `update`:只在已安裝的地方刷新(比照 roles、Orca 的做法)。使用者在該資料夾裡自己加的檔要保留。
- `uninstall`:移除 mod 資料夾。
- `--private`:mod 資料夾要進排除清單;排除失敗的處理與其他 private 必要條件一致。
- 預檢與 setup 的寫入摘要要包含 mod 的路徑。

## 項目 2:doctor

- 回報 mod 是否安裝(選配,未安裝不算問題)。
- 已安裝時檢查:manifest 存在且可解析、hooks 模組存在、安裝的版本與套件內的版本是否一致(不一致列為提醒並指向 `update`)。
- 能唯讀取得 Claude Code 版本時(例如 `claude --version` 可執行),低於 2.1.287 列為提醒;取不到就只印提示,不算失敗。
- 明確印出 doctor 看不到的兩件事:工作區信任是否已接受、是否從 repo 根目錄啟動。請使用者在 Claude Code 裡實際確認 mod 有載入。

## 項目 3:儀表與 mod 並存

mod 的橫條會自行隱藏與舊儀表重複的欄位。setup 兩題都保留;兩者都選時,在結尾用一句話說明橫條和底部儀表各顯示什麼。不要因為選了 mod 就自動不裝儀表,也不要移除既有的儀表設定。

## 項目 4:角色守門的啟用說明

外掛選項不會從專案設定讀取,安裝器無法替使用者開啟角色守門。安裝 mod 後,在結尾訊息與文件說明怎麼自己開(使用者設定或 `/config`,鍵為 `flightwake-mod@skills-dir`),並重申它不是安全邊界。

## 項目 5:第二階段延後的三件事

- `fw-record` skill(四語)加一句:有 `/fw-log` 時先取用它的輸出作為 `tests:` 證據與變更清單的依據;並說明 unknown 的項目需要自己判斷,pass 的意義以 `/fw-log` 的說明為準。
- TRAPS 範本與 `fw-trap` skill(四語)說明兩個選填欄位 `paths`、`commands`:什麼時候值得填、格式、不填也可以。措辭要讓寫坑的成本維持很低。
- manifest 補上 author,消除 validate 的唯一警告。

## 項目 6:文件

- 四語 README:附加元件段落加入 mod;寫入範圍清單補上路徑;setup 流程的說明同步。
- 新增 mod 的使用說明文件,比照 `docs/roles.*.md` 的四語做法:五個功能各做什麼、各自的開關、已知限制(pass 的意義、路徑別名可繞過角色守門、cwd 不確定時會多提示、只支援 Claude Code、信任與根目錄啟動的要求)。已知限制要寫得和 record 一致,不可寫得比實際驗證過的更強。
- CHANGELOG。

## 項目 7:一個要查證並回報的事實(不要據此改程式)

`docs/roles.md` 寫「Claude Code 不讀 AGENTS.md(已在 2.1 驗證)」,座位設計依賴這一點。但在 Claude Code 2.1.288,一個只有 AGENTS.md、沒有 CLAUDE.md 的資料夾,session 開場會把 AGENTS.md 當成專案指示載入。請在暫存 repo 實測並記錄:

- 只有 AGENTS.md 時,Claude Code 是否載入它。
- CLAUDE.md 與 AGENTS.md 都存在時,是否兩個都載入。

把結果與證據寫進 record,並登記一條 TRAPS(confidence 依實測結果)。這會影響 roles 的座位假設與 mod 的角色守門,但本階段只查證與記錄,要不要改設計留給 Kai 決定。

## 測試

- smoke 新增:`init --mod`、setup 選 mod、update 只刷新既有、uninstall 移除、`--private` 排除、沒有 claude 時略過、預檢與摘要包含 mod 路徑、doctor 的各種狀態。
- 權限、symlink、hardlink 的既有防護測試要涵蓋 mod 的路徑。
- 外掛測試、validate、型別檢查、零寫入檢查維持通過。
- 真實載入:在暫存 repo 用 `setup`(不是手動複製)安裝後,開一個真實的 Claude Code session 確認 mod 有載入、語言正確,並抽驗至少兩個功能。證據寫進 record。

## 不在本階段範圍

roles 設計的任何變更;用 mod 取代 node Stop hook;Codex 與 Gemini 的對應功能;版本號與發版。

## 工作方式

- 你是主要實作者。安裝器的核心改動自己寫;四語文件可以派給 model 設為 sonnet 的 subagent,產出自己讀過再採用。
- 遵守該 repo 的 flightwake 紀律。本任務說明放進 `docs/plans/integration.md`。
- 先紅後綠:行為改動先加會失敗的測試。
- 可以在本分支 commit;不 push、不 bump 版本、不發版。
- 任務說明與現況不符或設計有問題時,把問題列出來;能合理自行定案的就定案並記進 DECISIONS 後繼續,只有會改變功能範圍的才停下來問。
- 完成後回報:檔案清單、各項測試的實際輸出、偏離任務說明之處與原因、未解決的問題。之後有獨立審查者直接讀 diff 驗收,並由 GPT-6 Astra 複審。
