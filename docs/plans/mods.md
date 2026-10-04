# flightwake 第二階段任務說明:Claude Code mod(一個外掛、五個功能)

對象 repo:`/Users/kaiwu/orca/flightwake`,以 main 為基底開新分支與 worktree。
狀態:**第 2 版(2026-10-05)**。第 1 版方向已由 Kai 確認(一個外掛、五個可開關的功能、可平行開發);第 2 版採納設計者(Fable 5.1)依 GPT-6 Astra 唯讀審查(`docs/plans/mods.review-astra.md`)所做的修訂,見下方「第 2 版修訂」——**與正文衝突時以修訂為準**。實作期間的定案記在 `.flightwake/DECISIONS.md` 2026-10-05 各條。

## 第 2 版修訂(優先於正文)

- **讀取範圍**明列唯讀來源:`.flightwake/`、git 狀態、CLAUDE.md / `.claude/CLAUDE.md` / CLAUDE.local.md 的 flightwake 與 roles marker、AGENTS.md / GEMINI.md 的 flightwake marker(只為取得語言;驗收修正加入)、package.json 的 scripts、`.claude/settings` 的 statusLine 設定(取有效設定);其餘不讀。git 一律帶 `--no-optional-locks`(嚴格零寫入,含 `.git/index`)。
- **F1** session 開始時取一次穩定快照,不每回合重讀重寫系統提示;過長時不截前 N 字,優先保留 health、進行中、下一步入口與原檔路徑。
- **F2** 落後量對齊 state-check 完整語意(STATE 有未 commit 變更=正在更新;尚未 commit 過的基線不計;計算出錯不可顯示成同步);偵測舊儀表看有效設定而非檔案存在;重複時由 mod 自己隱藏重複欄位,不改使用者設定。
- **F3** 只記觀測到的指令完成結果:已知測試指令 + 可靠完成事件 + 退出碼才標通過/失敗;逾時、取消、背景未完成、結果缺失標 unknown;含 `|| true`、管線或複合指令者不以整體退出碼宣稱通過;`npm test` 類要確認 script 內容;每筆記 cwd、時間、當時 revision 與 dirty 狀態;不推算通過數;只存本 session,不建跨 session 歷史;指令參數可能含敏感資訊,要遮蔽。
- **F4** 只加兩個選填欄位:`paths`(repo 相對 glob 清單)與 `commands`(指令 token 前綴清單),任一命中即提示;不開放 regex;缺 status 視為 active;缺 confidence 視為 unknown 並以線索呈現;跳過含 `{{…}}` 的範本條目;去重以條目內容版本為準,條目被修改後要能再提示。
- **F5** 縮為明確的工具與路徑規則:只攔 Edit/Write 寫入明列禁寫路徑;不把自然語言的禁止事項自動編譯成權限,不用 shell 黑名單冒充全面守門;尊重派工卡與明確子 agent 指派對座位角色的覆寫,不可誤擋合法 worker;角色變更於新 session 生效;放行由使用者明確啟動、限定規則與 session、持續可見、可撤銷;文件維持「不是安全邊界」,在取得 Claude Code 實際攔截的證據前不改寫 roles 文件中「角色是指引,不是權限」的定位。
- **測試**補生命週期案例:/clear、resume、compact、reload、切換工作目錄、worktree、子 agent、外部程序改檔或 commit、單一模組拋錯不影響其他功能。validate 與單元測試通過不代表真的載入:完成前在暫存 repo 以 `.claude/skills/` 方式實際載入驗證一次,證據寫進 record。
- **本分支限制**(管理者補):另一個 worktree(setup-wizard 分支)在改安裝器,本分支不動 `bin/`、`templates/`、`snippets/`、`skills/` 與 README。因此 F3「fw-record skill 加一句」延後到該分支合併後(DECISIONS 2026-10-05)。
- **偏離處理**(管理者補):任務說明與現況不符或設計有問題時,能自行合理定案者定案並記進 DECISIONS 後繼續;只有會改變功能範圍的才停下來問。

## 為什麼做

flightwake 有幾處靠「模型自覺」或外部 node 腳本在撐,Claude Code 的 mod(function hooks 外掛,2.1.287 起)可以在 session 內直接做到:

1. 冷啟動要手動跑 skill。
2. 「碰得到某條 trap 的領域,動手前先查」完全靠模型記得;2026-08-03 的稽核把「忘了查」列為重踩的三種原因之一。
3. roles 是指引不是權限,實測唯讀角色照樣寫檔。
4. record 的 `tests:` 證據是模型自己填的。
5. 儀表是一支 node 腳本。

## 定位與不可違反的承諾

- mod 是 **Claude Code 專屬的加值層**。`.flightwake/` 的 Markdown 仍是唯一事實來源;Codex 與 Gemini 沒有對應機制,現有的 skill 與 hook 全部保留,行為不變。
- mod 沒裝、沒載入、或載入失敗時,flightwake 的一切照常運作。mod 的任何錯誤都必須安靜降級,不得擋住使用者的工作。
- **只讀 `.flightwake/` 與 git 狀態;不連網;不寫使用者資料**(STATE / DECISIONS / TRAPS / records / ROLES.md)。唯一的寫入是 mod 自己的 session 狀態與跨 session 儲存。要寫進 record 的內容一律交給 agent 透過 `fw-record` 寫。
- 「記錄追隨工作,不引導工作」:mod 可以呈現事實、提醒、在明確規則下擋下動作,不得新增開工前的關卡或規劃步驟。
- 五個功能各自有開關(manifest 的 `userConfig`),任何一個關掉都不影響其他。
- 所有顯示文字四語(en、zh-TW、zh-CN、ja),語言跟隨安裝時記錄的語言。

## 技術前提(2026-10-05 已查證)

- 作者指引:Claude Code 內建的 `plugin-authoring` skill(載入後會給出該版本的型別檔與範例路徑、reference.md)。API 以該型別檔為準,不要憑記憶寫。
- 外掛結構:`.claude-plugin/plugin.json`、`hooks/hooks.json`(`{"modules": ["./register.tsx"]}`)、hooks 模組;用到 `$.state` 時另有 `types/index.d.ts` 契約。執行環境沒有 Node、沒有 DOM,對外一律經由 `$`。
- 發布方式:把外掛資料夾放進目標 repo 的 `.claude/skills/<name>/`,Claude Code 會以 `<name>@skills-dir` 自動載入,不需要市集(來源:code.claude.com/docs/en/plugins/loading)。限制:需 ≥2.1.287;使用者須接受該資料夾的工作區信任;只從 session 的主要工作目錄載入(從子目錄啟動不會載入);個人目錄的同名外掛會蓋過專案的。
- 驗證與測試:`claude plugin validate <folder>`、`claude plugin test <folder>`(`*.test.ts`)。

## 檔案配置

- 原始碼放在 repo 的 `mods/flightwake/`(並加入 `package.json` 的 `files`)。
- 每個功能一個獨立模組檔,`register` 只負責依開關組裝。共用的讀檔與解析(STATE frontmatter、TRAPS 條目、marker)放在共用模組。**這個切法是為了讓五個功能可以由不同的人平行開發而不互相衝突。**
- 外掛名稱要夠獨特,避免和使用者個人目錄的外掛撞名。

## 五個功能

### F1 開場自動載入 STATE

- 把 `.flightwake/STATE.md` 的內容加為系統提示的一個 session 區段,並附一句:這是上次收尾時的現況,動手前仍要核對 git 狀態。
- STATE 仍是未填範本時不注入範本內容,改注入一句「STATE 尚未初始化,請先跑冷啟動」。
- STATE 過長時(門檻由實作者定,並記進 DECISIONS)截斷並提示壓實。
- 不取代 `fw-coldstart` skill:落後量檢查、讀最新 record 仍由 skill 做。

### F2 橫條與提示

- 輸入框上方一列:health 顏色、STATE 落後量(與 `state-check.mjs` 同一套計算,bot commit 不計)、context 用量、依狀態提示的下一個指令。一切正常時保持安靜。
- context 超過門檻時 toast 一次,建議收尾。
- 與既有 `statusline.mjs` 的關係:兩者不應同時顯示同樣資訊。mod 的橫條啟用時如何處理舊儀表,提出方案並記進 DECISIONS(安裝器的整合屬於後續項目,本階段只需讓 mod 能偵測到舊儀表已安裝)。

### F3 自動行車記錄

- 在 session 內記下事實:改動過的檔案、執行過的測試指令與結果(通過或失敗、時間)、commit 次數。
- 測試指令的辨識要保守:只認得出的才記(常見的 test runner 與 repo 自己在 STATE 或 package 指令裡宣告的),認不出的不猜。
- 提供一個斜線指令印出本 session 的記錄摘要;`fw-record` 的 skill 文字加一句:有這個指令時先取用它的輸出作為 `tests:` 證據與變更清單的依據。
- 不自動寫 record。

### F4 踩坑絆線

- agent 要改檔或執行指令時,比對 TRAPS 的 active 條目;命中時把該條的重點與 confidence 提示給 agent,**不擋下動作**。
- 比對依據是 TRAPS 條目新增的選填欄位(適用路徑樣式、指令樣式)。沒有這個欄位的舊條目不參與比對,也不報錯。
- 同一條在同一個 session 只提示一次。superseded 的條目不比對。`probable` / `suspected` 的條目提示時要標明是線索不是定論。
- TRAPS 範本與 `fw-trap` skill 的欄位說明要同步改(四語)。**這部分會動到共用範本,和第一階段分支有衝突風險,排在第一階段合併之後再做;本階段先以 mod 內的解析與測試夾具完成比對邏輯。**

### F5 角色守門

- 讀取本資料夾、本廠牌座位的角色(roles 寫進 `CLAUDE.md` 的 marker 區塊),把該角色「禁止」清單中可機械判定的項目變成對寫檔與指令的攔截。
- 只處理能明確判定的規則(例如「不寫產品程式碼」對應到寫入非文件、非 `.flightwake/` 的路徑)。無法機械判定的禁止事項不攔。
- 攔下時說明是哪個角色的哪條規則,並指出該怎麼做(派工或召喚待命角色)。
- 必須有明確的放行方式(使用者一句話或一個指令即可對本 session 放行),放行要留下可見痕跡。
- 預設關閉。沒有安裝 roles、或座位沒有角色時完全不作用。
- 文件要更新 roles 的「角色是指引,不是權限」一節,說清楚 mod 啟用後哪些變成強制、哪些仍是指引。

## 測試

- 每個功能至少一個 `*.test.ts`,涵蓋主要行為與「關閉時不作用」。
- `claude plugin validate` 通過;型別檢查通過。
- 共同案例:沒有 `.flightwake/`、STATE 是未填範本、TRAPS 為空、沒有 roles、不是 git repo。每一種都必須安靜降級。
- `test/smoke.sh` 現有測試不受影響。

## 不在本階段範圍

- 安裝器整合(setup 選單的 mod 選項、複製到 `.claude/skills/`、`update` / `uninstall` / doctor 的對應)。等第一階段分支合併後另做。
- 用 mod 取代 Claude Code 的 node Stop hook。
- Codex、Gemini 的對應功能。

## 工作方式

- 管理者:Opus 5.5。先建立外掛骨架、共用模組與各功能的介面約定並 commit,再把 F1–F5 平行派出去,每個功能一個實作者(Sonnet 5.5),各自在隔離的 worktree 工作,只改自己的模組檔與測試檔。
- 管理者負責合併、跑全部測試與 validate、解決介面不一致,並自己讀過每個功能的程式碼再採用。
- 遵守該 repo 的 flightwake 紀律:冷啟動、DECISIONS、收尾 record 與 STATE。本任務說明放進 `docs/plans/mods.md`。
- 可以在本分支 commit;不 push、不 bump 版本、不發版。
- 任務說明與現況不符或設計有問題時:能自行合理定案的定案並記進 DECISIONS 後繼續;會改變功能範圍的才停下來問(第 2 版修訂)。
- 完成後回報:檔案清單、validate 與測試的實際輸出、偏離任務說明之處與原因、未解決的問題。之後有獨立審查者直接讀 diff 驗收。

## 請審查者特別看的問題

1. F4 的 TRAPS 新欄位該長什麼樣,才不會讓寫坑的成本變高到沒人填?
2. F5 哪些「禁止」能可靠地機械判定?放行機制會不會讓守門形同虛設?
3. F3 的測試結果辨識,保守到什麼程度才不會誤記?
4. F1 把 STATE 放進系統提示,對每個 session 的固定成本與提示快取有沒有不良影響?
5. 這五個功能有沒有哪一個其實違反「記錄追隨工作,不引導工作」?

## 驗收修正(2026-10-05,驗收者採納 `docs/plans/mods.diff-review-astra.md` 七項;優先於上文)

1. **F3** 不把未通過或未執行的測試記成通過:package script 的本體與輸入的指令同樣判定(複合、管線、指令替換 → `unknown`/`script-compound`;吞錯 → `script-masks-exit`);runner 帶 `--help`/`--version`/`--list`/`--collect-only`/`--listTests`/`--watch` 等、或 `vitest list` 這類只列不跑的模式,不收錄。
2. **F5** 目標路徑命中多條 `deny-write` 時,全部命中的規則都已放行才放行;放行 `src/**` 不連帶放行 `src/private/**`。
3. 沒有安裝 flightwake(缺 `.flightwake/STATE.md`)的目錄一律靜默:F3 不記錄、不註冊 `/fw-log`;F5 不攔、不註冊 `/fw-role-release`。F5 的快照綁定 (session, root),同一 session 換到另一個 root 不沿用舊座位與放行。
4. 嚴格零寫入:所有 git 呼叫帶 `--no-optional-locks`;`mods/flightwake/scripts/git-readonly-check.sh` 以真 git 驗證 `.git/index` 位元組不變(含對照組證明普通 `git status` 會改寫)。
5. **F4** 相對路徑依實際 cwd 與指令中的 `cd` 解析後再比對;共用指令解析遇 `#` 只略過該行剩餘部分。提示在工具執行**後**才出現(維持既有決策):它防的是**下一次**,不是這一次——提示文字本身也這樣說。
6. **F1** 未初始化只認範本自己的 frontmatter 欄位(`{{DATE}}`、`{{SESSION_OR_PERSON}}`、`{{YYMMDD}}`、`{{slug}}`),STATE 內容裡合法的 `{{…}}` 不算;marker 解析容忍額外屬性(`lang=zh-TW profile=notes`),語言另可從 AGENTS.md / GEMINI.md 的 marker 取得。
7. `/fw-role-release` 只接受來源為 composer(使用者本人在輸入框按 Enter);沒有來源的一律拒絕。

## 驗收修正第 2 輪(2026-10-05,驗收者依 `docs/plans/mods.diff-review-astra-2.md` 改判定方式;優先於上文)

1. **F3 正面證明**:結果預設 unknown;只有「單一、直接呼叫已知 runner(非 `sh -c`/`bash -c`/`eval`/`xargs`/`env`/`time` 等包裝,非複合、非管線、非指令替換),且每個旗標都落在該 runner 自己的表內」才記 pass/fail。表在 `mods/flightwake/hooks/lib/testcmd.ts`(每個 runner:安全旗標、帶值旗標、代表不執行測試的旗標,mvn 另有 `-D` 鍵表、cargo 另有 `--` 之後的表)。經 npm/pnpm/yarn/bun script 執行時,script 本體(含引號內的 shell 本體、加上額外參數)走同一判定,可遞迴。STATE 或 package 宣告的指令沒有豁免;唯一的額外允許是「直接執行一個腳本檔」(`bash test/smoke.sh`、`node scripts/test.js`),因為那是 repo 自己點名的測試檔。不滿足的照樣收錄,標 unknown 並附原因、保留退出碼與原指令;不因旗標不認得而整筆不收錄。`cd X &&` 前綴:exit 0 可證明,非 0 可能是 cd 失敗 → unknown。
2. **F5**:「全部放行」改存獨立旗標 `isAllReleased`,與字面規則 `*` 不共用值。
3. **F4**(只提示、不攔):只有連續的 `cd X &&` 視為確定切換;`||`、`&`、管線、`;`、換行之後或子 shell 內無法確定 cwd 時,把路徑在每個可能的 cwd 下都解析,任一命中就提示;`( … )` 子 shell 會被走進去解析。同一條每 session 仍只提示一次。
4. **生命週期**:測試引擎只能手動觸發事件——自動測試「模擬」/clear(session.end + 新 id)與模組重載(同 id 再觸發 session.start),測試名稱照實寫;真正的 resume/compact 未重現。真機只觀察過一次熱重載。未驗證項列在 record。
5. 路徑別名(symlink 等)可繞過 F5:維持「不是安全邊界」,roles 文件限制段已點明,不修。

## 介面約定(管理者,2026-10-05;實作者照此開發)

外掛:`mods/flightwake/`,名稱 `flightwake-mod`(之後安裝到 `.claude/skills/flightwake-mod/`)。

```
.claude-plugin/plugin.json   manifest + userConfig 五個布林開關(stateInject/band/recorder/tripwire 預設開,roleGuard 預設關)
hooks/hooks.json             { "modules": ["./register.ts"] }
hooks/register.ts            只依開關逐行呼叫 registerX(on);每個包 try/catch
hooks/lib/core.ts            Io 介面與 IO_OF_TEMPLATE、M()/語言、frontmatter、STATE 範本判定、落後量、舊儀表、package scripts、contentHash
hooks/lib/glob.ts            matchGlob / matchAny(TRAPS paths、roles deny-write 共用)
hooks/lib/traps.ts           parseTraps(含預設值、範本跳過、內容版本)
hooks/lib/roles.ts           parseSeatBlock / parseCard(deny-write)
hooks/lib/shell.ts           parseCommand / startsWithTokens(F3、F4 共用的保守指令切分)
hooks/features/<f>.ts        state-inject(F1) band(F2) recorder(F3) tripwire(F4) role-guard(F5)
types/index.d.ts             $.state 契約(全部功能的鍵由管理者維護;實作者需要新鍵時回報,不自改)
tests/world.ts               測試夾具:installWorld(on) 回答 session/fs/process/settings;fakeIo 直測 lib
tests/<f>.test.ts            各功能測試
```

硬規則(載入器強制,違反即整個模組不載入,見 TRAPS `mod-dollar-cannot-cross-import`):
- `$` 不能跨 import 傳遞。功能檔內自建 `ioOf($)`(照抄 core.ts 的 IO_OF_TEMPLATE)再把 `Io` 傳給 lib;`$` 一律寫成 `$.noun.event(...)`。
- `on` 只能直接傳給具名函式;register 逐行呼叫。
- 測試中外掛向 `$` 要的一切都必須由測試的 hook 回答,否則拋錯——每個測試先 `installWorld(on, …)`。
- mod 永不寫檔(`fs.write` 在夾具中一律拒絕並記錄);只用 `$.state`,不用 `$.store`。

各功能對外的約定:

| 功能 | 註冊的事件 / 指令 | `$.state` 鍵 | 對其他功能的承諾 |
|---|---|---|---|
| F1 state-inject | `session.start`(取快照)、`session.end` reason=clear(作廢)、`prompt.compose`(加 `flightwake-mod:state` 區段,scope session) | `stateSnapshot` | 不讀 git;快照以 session id 為鍵 |
| F2 band | `session.start`、`turn.complete`、`tool.call`(Bash commit 後重算)、`ui.render` AbovePrompt;toast | `bandView`、`bandToastSession` | render 內只讀 state、不打 git |
| F3 recorder | `tool.call`(Edit/Write/NotebookEdit/Bash)、`session.start`、指令 `/fw-log` | `flightLog` | 不改寫工具結果;只記觀測 |
| F4 tripwire | `tool.call`(Edit/Write/NotebookEdit/Bash),結果後附 `context`(防下一次,不是這一次) | `trapsHinted` | 永不 deny |
| F5 role-guard | `session.start`、`prompt.submit`(派工卡)、`tool.call`(Edit/Write/NotebookEdit,僅主 loop)、指令 `/fw-role-release` | `roleGuard` | 只 deny 寫入 deny-write 路徑;無 roles 時完全不作用 |

顯示文字一律經 `M(lang, { en, 'zh-TW', 'zh-CN', ja })`,lang 來自 `fwContext(io)`。沒有 `.flightwake/STATE.md` 時 `fwContext` 為 null,所有功能靜默。
