---
record_id: 261005-flightwake-mod
session: Claude(Opus 5.5) 管理者 + 5 個 Claude(Sonnet 5.5) 實作者(各自隔離 worktree)
date: 2026-10-05
repos: [flightwake(分支 kaiwutech-TW/mods)]
tests: (驗收修正後)claude plugin test mods/flightwake 210 pass / 0 fail(8 檔;初版 173);scripts/git-readonly-check.sh 通過;claude plugin validate 通過(僅 author 警告);tsc(5.9.3,對 2.1.289 型別檔)clean;bash test/smoke.sh 全過(Python 3.13 在 PATH 前);真機載入 F1–F5 全數實際生效(見下)
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

- 單元/整合:`claude plugin test mods/flightwake` → `173 pass / 0 fail, Ran 173 tests across 7 files`;其中 `tests/lifecycle.test.ts` 10 個案例同時開五個功能,涵蓋 /clear(新 session id)、reload/compact/resume(同 id)、切工作目錄、子 agent、外部程式改檔與 commit、git 與設定都失敗時其他功能照常、什麼都沒裝時全靜默、全關時不改任何東西、讀取範圍只限明列來源。
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
