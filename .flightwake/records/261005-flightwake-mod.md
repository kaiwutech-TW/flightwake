---
record_id: 261005-flightwake-mod
session: Claude(Opus 5.5) 管理者 + 5 個 Claude(Sonnet 5.5) 實作者(各自隔離 worktree)
date: 2026-10-05
repos: [flightwake(分支 kaiwutech-TW/mods)]
tests: (驗收第 3 輪後)claude plugin test mods/flightwake 276 pass / 0 fail(10 檔;初版 173、第 1 輪 210、第 2 輪 249);scripts/git-readonly-check.sh 通過;claude plugin validate 通過(僅 author 警告);tsc(5.9.3,對 2.1.289 型別檔)clean;bash test/smoke.sh 全過(Python 3.13 在 PATH 前);真機載入 F1–F5 全數實際生效(見下)
prod_changes: none(未 push、未 bump、未發版)
---

# flightwake-mod:Claude Code mod 一個外掛五個功能(STATE 注入、橫條、行車記錄、踩坑絆線、角色守門)完成並真機載入

**TL;DR**:依 `docs/plans/mods.md`(第 2 版,採設計者依 Astra 審查的修訂)在 `mods/flightwake/` 做出外掛 `flightwake-mod`:管理者先立骨架、共用純函式與 `$.state` 契約,再平行派 5 個實作者各做一個功能,合併後自讀全部程式、補整合修正與跨功能生命週期測試。最後在暫存 repo 以 `.claude/skills/` 方式真機載入,五個功能都觀察到實際效果。安裝器整合、fw-record skill 那一句、TRAPS 範本欄位說明屬後續,未做。

## 關鍵發現(重要性排序)

1. **外掛載入器有三條靜態規則,違反即整個模組不載入**:`$` 不能跨 import 傳遞;`on` 不能經表格迴圈呼叫;同一事件最多一個無 matcher 的註冊(各功能單測都過、一合併就全掛)。對策:共用模組只放純函式 + 各功能檔自建 `ioOf($)` 閉包、`register` 逐行呼叫、共用事件一律帶 `{}` matcher → TRAPS `mod-dollar-cannot-cross-import`(confirmed),DECISIONS 2026-10-05 首條。
2. **外掛選項不讀專案設定,且鍵依載入方式而異**(`.claude/skills/` → `flightwake-mod@skills-dir`)→ 角色守門只能由每個人在 `/config` 或使用者設定打開;安裝器不能替人開 → TRAPS `mod-options-not-read-from-project-settings`、DECISIONS 2026-10-05。
3. **專案 `.claude/skills/` 的 mod 要資料夾受信任才載入**:信任前 `claude -p` 完全沒載入,互動接受信任後立刻以 `@skills-dir` 載入 → TRAPS `project-skills-dir-mod-needs-trust`(probable,單組對照)。所以「validate + 單元測試通過 ≠ 真的載入」這條驗收要求是對的。
4. 工具結果的 `context`(F4 的提示管道)在真引擎上確實送到模型面前,核心結果帶 `ref` 時加 context 也有效——單元測試證明不了的部分已由真機補上。
5. 本機 smoke 需要 Python 3.11+(`tomllib`),系統 3.9 會在 roles v2 節失敗;與本次改動無關 → TRAPS `smoke-needs-python-311`。

## 交付 / Commits

fa92acd..1bdafff(骨架與計畫第 2 版 → 共用指令切分 → F1–F5 各一個 commit(cherry-pick 自實作者 worktree)→ 整合修正與生命週期測試 → 文件與 TRAPS)。偏離任務說明之處見 DECISIONS 2026-10-05 各條與 `docs/plans/mods.md`「第 2 版修訂」。

## 驗證證據

- 單元/整合(初版):`claude plugin test mods/flightwake` → `173 pass / 0 fail, Ran 173 tests across 7 files`。`tests/lifecycle.test.ts` 同時開五個功能,但測試引擎只能手動觸發事件:它**模擬** /clear(session.end + 新 session id)與模組重載(同 id 再觸發 session.start),外加切工作目錄、子 agent、外部程式改檔與 commit、能力失敗、什麼都沒裝、全關、讀取範圍。真正的 reload/resume/compact 不是這些測試證明的(見文末「驗證範圍」)。
- `claude plugin validate mods/flightwake` → `✔ Validation passed with warnings`(唯一警告為 manifest 沒有 author)。
- 型別:對 Claude Code 2.1.289 型別檔跑 tsc 5.9.3 → clean。
- `bash test/smoke.sh`(PATH 前置 Python 3.13)→ `✅ smoke 全過`。
- 真機(暫存 repo,`npx flightwake init --lang=zh-TW` 後填入非範本 STATE、一條 `commands: ["echo flightwake-probe"]` 的 TRAPS、含 `deny-write: ["src/**"]` 的座位區塊,mod 複製到 `.claude/skills/flightwake-mod/`):
  - 互動 session 接受信任後 debug log:`hooks module flightwake-mod@skills-dir loaded … events: session.start,session.end,prompt.compose,turn.complete,tool.call,ui.render,command.run`、`plugin.register: flightwake-mod … admitted`。
  - F1:模型逐字引出注入區段首行(zh-TW 標頭)與 STATE 裡的暗號。
  - F2:輸入框上方實際畫出 `✈ flightwake · ●yellow · STATE 同步 → 先處理未驗證項再疊新工作(讀 STATE)`。
  - F3:`/fw-log` 印出 `npm test | package-script (node -e "process.exit(0)") | 通過 | 0 | … | 589077f | .`。
  - F4:`echo flightwake-probe` 後模型逐字引出 `flightwake TRAPS:probe-echo-trap [probable] 命中 echo flightwake-probe` 與「是線索,不是定論」。
  - F5(使用者設定鍵 `flightwake-mod@skills-dir` 開啟):Write `src/x.txt` 被擋(zh-TW 訊息含角色、規則、該怎麼做、「不是安全邊界」);docs/ 照寫;在輸入框打 `/fw-role-release src/**` 後同一寫入成功,狀態列持續顯示 `⚠ 角色守門已放行:src/**(本 session)`;以 stream-json(SDK 來源)送的放行被拒。
  - 兩份 debug log 都沒有 flightwake-mod 的 hook 失敗/拒繪紀錄。

## 未完 / 交接

- **未驗證**:`$.session.append` 的放行紀錄列在真機沒有獨立顯示(無錯誤紀錄;可見痕跡是指令輸出 + 狀態列);`/config` 是否列出 mod 選項未在真機看過(文件依 reference 寫);F2 toast(context ≥80%)與桌面版外觀未真機觀察。
- **安裝器分支合併後**:安裝器整合(複製到 `.claude/skills/flightwake-mod/`、update/uninstall/doctor、首次需信任的提示);fw-record 四語 skill 加「有 /fw-log 時先取用」一句;TRAPS 範本與 fw-trap skill 補 `paths`/`commands` 欄位說明(四語)。
- 開放問題:沒有 CLAUDE.md、只有 AGENTS.md 的安裝,語言 marker 在讀取範圍外 → mod 顯示英文;`--plugin-dir` 載入時引擎會在外掛資料夾寫入 `tsconfig.json` 與 `.claude-plugin/types/`(skills-dir 載入未觀察到),安裝器需決定是否 ignore。

## 驗收補記(2026-10-05 同 session)

驗收者(Fable 5.1)採納 GPT-6 Astra 讀 diff 的七項(`docs/plans/mods.diff-review-astra.md`);先寫會失敗的測試再修(DECISIONS 2026-10-05「驗收修正」)。

- **先紅後綠**:eb618ff 只加反例(`tests/acceptance.test.ts` + 夾具),該 commit 實跑 `179 pass / 31 fail`;a16e4a0 修正後 `210 pass / 0 fail`。
- 最值得記的兩件:①F3 原本把 `npm test`(script 是 `… | cat`)與 `pytest --help` 記成 pass——「辨識出 runner + exit 0」不是測試證據;②mod 的 `git status` 會改寫 `.git/index`(TRAPS `plain-git-status-rewrites-index`)。另外,F5 實作者「roles 不需要 STATE」的偏離被推翻:缺 STATE 一律靜默是全功能共同契約。
- 驗證:`claude plugin validate` 通過(僅 author 警告);tsc clean;`bash mods/flightwake/scripts/git-readonly-check.sh` → 靜態檢查通過、對照組普通 `git status` 讓 index 雜湊改變、mod 的指令組讓 index 位元組不變;`bash test/smoke.sh`(Python 3.13)全過。
- 真機抽驗(同一暫存 repo、互動 session、`.claude/skills/` 載入):`npm test`(script `node -e "process.exit(1)" | cat`,shell 回報 exit 0)在 `/fw-log` 顯示 `未知 | script-compound`,不是通過;`node --test --help` 未被記錄;放行 `src/**` 後 `src/a.ts` 寫入成功、`src/private/x.ts` 被擋(debug log:`deny: … 不可寫入 src/private/x.ts(規則 deny-write: src/private/**)`)。另做了一次**真的熱重載**(外部 touch 模組檔):debug log `hooks module flightwake-mod@skills-dir reloaded`,重載後 `/fw-log` 仍保有先前兩筆——同 id 的 session.start 測試之外的實證。
- 清理:五個實作者 worktree 與分支逐一確認「fe04dea 之後恰一個 commit、內容與本分支 cherry-pick 結果相同、無未提交檔」後刪除。
- 仍未驗證/留給後續:真的 resume、compact 只能靠「同 id 保留」推論;核心 `hooks/state-check.mjs`、`statusline.mjs` 也跑普通 `git status`(同一個 index 改寫問題,屬核心,本分支未改)。

## 驗收第 2 輪(2026-10-05 同 session)

驗收者複核第 1 輪後採納 Astra 第 2 份審查(`docs/plans/mods.diff-review-astra-2.md`:23 個鄰近案例 12 個失敗),並要求**改判定方式而不是補黑名單**(DECISIONS 2026-10-05「F3 改為正面證明」)。

- **先紅後綠**:b9a9335 只加測試(Astra 12 例 + 新契約案例),該 commit `220 pass / 29 fail`;52e11c7 修正後 `249 pass / 0 fail`。
- F3:新的 `hooks/lib/testcmd.ts`——每個 runner 一張旗標表,只有單一直接呼叫且旗標全在表內才記 pass/fail;script 本體與 STATE 宣告走同一判定;其餘照收、標 unknown、留退出碼(`mvn test -V` 回到 pass,第 1 輪的旗標黑名單把它整筆丟了)。第 1 輪「help/list 不收錄」的測試依新契約改為「收錄為 unknown」。
- F5:「全部放行」改為獨立旗標 `isAllReleased`;F4:候選 cwd 集合 + 走進子 shell(共用解析器把 `( … )` 變成明確的分組標記,`$( … )` 與反引號留在字內)。
- 驗證:`claude plugin validate` 通過(僅 author 警告);tsc clean;`git-readonly-check.sh` 三項通過;`bash test/smoke.sh`(Python 3.13)全過。本輪**沒有**重做真機載入(驗收者未要求;改動都在純函式判定與已載入過的 hook 內)。

## 驗收第 3 輪(2026-10-05 同 session)

依 `docs/plans/mods.diff-review-astra-3.md`(Astra 以真實 pytest/Go 驗證反例)修兩項必修 + 三項低成本補強(DECISIONS 2026-10-05「F3 證明納入環境與值」)。

- **先紅後綠**:47e4e15 只加測試,該 commit `257 pass / 18 fail`,其中 F4 的 24 個不確定 `cd` 案例跑了 11–23 秒才逾時/失敗;修正後 `276 pass / 0 fail`,整套 2.1 秒。
- F3:環境變數無害清單、帶值旗標的值範圍(每個 runner 一張);會讓零命中也回 0 的過濾旗標改記 unknown——第 2 輪把 `go test -v -run TestX` 當 pass 的測試依此改為 unknown。`/fw-log` 頁尾四語寫明 pass 的意義與看不到的東西。
- F4:候選 cwd 上限 16,超過降級為路徑尾段比對;`cd -- dir`、重導向目標路徑納入。
- 驗證:validate 通過(僅 author 警告);tsc clean;`git-readonly-check.sh` 三項通過;smoke(Python 3.13)全過。本輪未重做真機載入。

## 驗證範圍(照實分開寫)

- **自動測試證明的**:各功能在測試引擎內的行為,含手動觸發的 session.start / session.end / prompt.compose / tool.call / command.run;「同 session id 再觸發 session.start」(模組重載會做的事)時狀態保留;「session.end reason clear + 新 id」時重取;切 root、子 agent、能力失敗、未安裝時靜默、讀取範圍、git 帶 `--no-optional-locks`。
- **真機只觀察過一次的**:`.claude/skills/` 載入(需資料夾信任)、F1–F5 的實際效果(第 1 次與驗收第 1 輪抽驗)、一次真的熱重載後 `/fw-log` 保留先前紀錄。
- **已知限制(不修)**:pass 看不到設定檔與外部環境(pytest.ini addopts、建置 profile 等);路徑別名可繞過 F5;F4 在 cwd 不確定或降級時會多提示。
- **未驗證**:真的 resume(重開程序後接續)與 compaction 之後各功能的狀態;真的 /clear(只模擬過);桌面版與 VS Code 外觀;F2 的 80% toast;`/config` 是否列出選項;`$.session.append` 放行紀錄列;composer 來源不可被偽造(依引擎文件,未測);worktree / symlink 下引擎回報的 root;各 runner 真實執行時的退出行為(F3 的表依各 runner 文件編寫,只在測試引擎內以模擬結果驗證)。
