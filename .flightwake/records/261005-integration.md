---
record_id: 261005-integration
session: Claude(Opus 5.5) 主實作 + 4 個 Claude(Sonnet 5.5) 文件撰寫者(四語 mod 文件與 README,產出經主實作者逐檔審閱、修正後採用)
date: 2026-10-05
repos: [flightwake(分支 kaiwutech-TW/integration)]
tests: (CodeQL 修正後,6c63ffc)bash test/smoke.sh 44 節全過(Python 3.12 在 PATH 前);claude plugin test mods/flightwake 299 pass / 0 fail(11 檔);claude plugin validate 通過;tsc 5.9.3(對 2.1.289 型別檔,含 hooks/ 與 tests/ 共 25 檔)clean;git-readonly-check 三項通過;node --check bin/ hooks/ test/ 全過;真機:setup 安裝後 mod 以 @skills-dir 載入、zh-TW、F1–F4 抽驗生效,F5 由驗收者真機實測通過
prod_changes: npm publish flightwake@0.15.0(2026-10-05,release run 37269098434,provenance;PR #11 merge commit 4605ee0,驗證證據見末節「發佈補記」)
---
<!-- flightwake record — 飛行紀錄。 -->

# 第三階段:合併 setup-wizard 與 mods,把 Claude Code mod 接進安裝器

**TL;DR**:依 `docs/plans/integration.md`,先把 `kaiwutech-TW/mods` 合併進以 setup-wizard 為基底的本分支(只有 `.flightwake` 三檔衝突,兩邊條目全留),
合併後所有測試綠;再讓 `setup`/`init --mod`/`update`/`uninstall`/`doctor` 認得 `flightwake-mod`,補上第二階段延後的三件事,四語文件,
並查證 Claude Code 何時讀 AGENTS.md。最後用真的 `setup` 在暫存 repo 安裝、在真的互動 session 接受信任後確認 mod 載入、語言正確、四個功能生效。

## 關鍵發現(重要性排序)

1. **Claude Code 2.1.289 只在沒有任何 CLAUDE 指令檔時才載入 AGENTS.md**(項目 7)。由內建外掛 `cc-plugin-agents-md` 負責,
   在祖先目錄找 `CLAUDE.md`、`.claude/CLAUDE.md`、`CLAUDE.local.md`,都沒有才找 `AGENTS.md`、`.claude/AGENTS.md`。
   → 有 Claude 座位的 repo(必有 CLAUDE.md)座位假設成立;**只有 AGENTS.md 的 repo 開 Claude Code 會讀到 Codex 座位與 `$fw-` 方言的義務表**。
   mod 的角色守門只讀 Claude marker,不受影響。依任務說明只查證不改,設計變更留給 Kai。TRAPS `claude-code-loads-agents-md-when-no-claude-md`(confirmed)。
2. **main 既有錯誤:`--private` 的 Claude 安裝跑 `update` 會退回 Codex**——Claude 的義務表在 CLAUDE.local.md,偵測只看 CLAUDE.md,
   於是新建 AGENTS.md、`.agents/skills`、`.codex/hooks.json`,並把 CLAUDE.local.md 從排除區塊拿掉(出現在 git status)。main(9dd685c)實測同樣重現。
   40.5「private + mod 後 update 仍乾淨」測到;已修(帶 marker 的 CLAUDE.local.md 算 claude),DECISIONS 2026-10-05 末條。
3. **未加引號的 heredoc 會執行反引號**:合併 STATE 時用 `python3 - <<EOF` 寫含 `` `npx flightwake update` `` 的文字,
   shell 真的從 npm 抓 0.14.0 在本 worktree 跑了 update——改了 10 個 dogfood 檔、在真實 `~/.flightwake/registry.json` 加了本 worktree 一筆。
   未 commit;依設計者指示還原(git checkout 該 10 檔;registry 只刪那一筆,其餘與事前備份逐鍵相同)。TRAPS `unquoted-heredoc-runs-backticks`,另存使用者層記憶。
   之後所有 CLI 執行都設 `FLIGHTWAKE_HOME` 指向暫存目錄。
4. 真機的資料夾信任對話框**預設選項是「No, exit」**;自動化接受信任要先按 ↓ 再 Enter(第一次只按 Enter → 拒絕、程序結束、不留紀錄)。
5. 外掛以 `.claude/skills/` 載入時引擎**沒有**在外掛資料夾寫 `.claude-plugin/types/` 或 `tsconfig.json`(mods record 的開放問題:那只發生在 `--plugin-dir`),
   因此安裝器不需要另外忽略它們;update 逐檔取代也會保留它們。

## 交付 / Commits

9274a09..(本 record 的 commit)。合併(9274a09)→ 任務說明入版控 → 紅燈測試(465e8e8,smoke 40 節;6 組選了 Claude 的 setup 答案序列各補一個答案)→
安裝器實作(6992c75)→ DECISIONS ×7 → 延後三件事(fe463c3,smoke 41 節——只是關鍵字的文字檢查,不驗證 agent 行為)→ 四語文件、README、CHANGELOG(d8694db)→ 項目 7 的 TRAPS。

檔案:`bin/install.mjs`(`MOD_REL`/`modShips`/`modShipList`、writer `cp` 的 `filter`、步驟 5c、`printModNotes`、`detectedAgents` 修正)、
`bin/setup.mjs`(mod 題)、`bin/cli.mjs`(`--mod`、help、uninstall)、`bin/doctor.mjs`(`checkMod`、private 排除含 mod)、`test/smoke.sh`(40、41 節)、
`skills/*/fw-record`、`skills/*/fw-trap`、`templates/*/TRAPS.md`、`mods/flightwake/.claude-plugin/plugin.json`(author)、
`docs/mod{,.zh-TW,.zh-CN,.ja}.md`(新)、`README*.md`、`CHANGELOG.md`。

## 合併的衝突處理

只有 `.flightwake/{DECISIONS,TRAPS,STATE}.md` 衝突(與任務說明預期一致)。DECISIONS/TRAPS 兩邊的新增都是在同一位置的純插入,
以腳本從兩邊原檔重組:兩邊條目全部保留、同日期各自成段(setup-wizard 段在上,其分支最後 commit 較晚),唯一的行內差異是 setup-wizard 既有的一個 superseded 標記;
STATE 以 setup-wizard 版為底、加入 mods 段落並改寫 frontmatter 與下一步。兩邊 record 都保留。
**重複事實(提議壓實,未動)**:TRAPS 的 `smoke-needs-python311-tomllib`(setup-wizard)與 `smoke-needs-python-311`(mods)是同一件事,依壓實規則需 Kai 同意後再把其中一條標 superseded。

## 與任務說明的偏離 / 自行定案(皆記於 DECISIONS 2026-10-05)

- 安裝內容 = manifest + `hooks/**` + `types/**`(manifest 以 `"types"` 指名);舊版發行過、新版已刪除的檔不清掉(只有 hooks.json 列的模組會被載入)。
- 語言不蓋章,沿用 mod 讀 marker;smoke 40.6 直接 import mod 的 `core.ts` 驗四種安裝(setup zh-TW、notes ja、CLAUDE.local.md zh-CN、只剩 AGENTS.md ja)。
  「只有 AGENTS.md 的 repo」在 active agents 沒有 claude 時 mod 會被略過,所以以「兩個 Claude 指令檔都受追蹤的 private 安裝、只剩 AGENTS.md 有 marker」驗證。
- `init --mod` 遇既有資料夾、沒給 `--force` → 比照 skill 印「已存在」;`--force`/`update` 刷新任何既存的 mod(不看 active agents)。
- 非 private 執行但已有 private 排除區塊時,新加的 mod 進該區塊(比照 `roles install`)。
- doctor 除了版本,也在版本相同時比對發行檔內容(手改 → 提醒)。
- setup 的 mod 題放在儀表題之後,所以選了 Claude Code 的 setup 多一題(既有 6 組 smoke 答案序列各補一個答案)。
- 修了 main 的 private 偵測錯誤(見發現 2)——不在任務範圍,但不修則 mod 的 private 承諾在第一次 update 就失效。
- 項目 7 實測版本是 2.1.289(任務說明寫 2.1.288;本機只有 289)。

## 驗證證據

- **合併後**(開工前):smoke 39 節 `✅ smoke 全過`;`claude plugin test` 276/276;validate 通過(僅 author 警告);tsc clean;git-readonly-check 三項 ok。
- **先紅後綠**:465e8e8 時 smoke 停在 `❌ FAIL: 36.7 測試前提:全選項應已安裝`;實作後依序修掉 40.5(private update,見發現 2)、40.7(grep 太寬,
  比到 doctor 的「Claude Code mod: not installed」)、40.9(變體目錄名把 CJK 全換成 `_` 而撞名,改用計數器)兩個測試本身的問題,最後全過。
  41 節(關鍵字文字檢查)加入時 `❌ FAIL: 41 en TRAPS 範本條目應有空的 paths / commands 欄位`,修文字後過。
- **最終**:smoke 41 節 `✅ smoke 全過`;`claude plugin test mods/flightwake` → `276 pass / 0 fail, Ran 276 tests across 10 files`;
  `claude plugin validate mods/flightwake` → `✔ Validation passed`(零警告);安裝後的子集 `.claude/skills/flightwake-mod` 單獨 validate 也通過;
  tsc clean;git-readonly-check:control 讓 index 雜湊改變、mod 的指令組讓 index 位元組不變。
- **`claude --version` 無副作用**:暫存 repo 檔案清單與 `~/.claude.json` mtime/大小前後相同,耗時 0.007 秒。
- **真機載入**(暫存 repo `scratchpad/realload`,`FLIGHTWAKE_HOME` 指向暫存):
  - 以 pty 跑真的 `node bin/cli.mjs setup`(繁中、Claude Code、mod 答 y)→ exit 0;摘要列出 `.claude/skills/flightwake-mod/`;結尾 doctor 0 失敗、mod 注意事項(2.1.287、信任、根目錄、角色守門鍵、非安全邊界)為 zh-TW。
  - 信任前對照組:`claude -p` 答不出 STATE 暗號,debug log 無任何 flightwake-mod 行。
  - 互動 session(Claude Code 2.1.289、Haiku 4.5,pty 驅動,↓+Enter 接受信任):debug log
    `hooks module flightwake-mod@skills-dir loaded (worker, environment 1, tier user); events: session.start,session.end,prompt.compose,turn.complete,tool.call,ui.render,command.run`、
    `plugin.register: flightwake-mod (user, flightwake-mod@skills-dir), judged by core alone: admitted`;flightwake-mod 的 hook 失敗/拒繪行 0。
  - F1:模型逐字引出 `以下是 .flightwake/STATE.md 在上次收尾時的內容,於 session 開始時取的快照。` 與暗號 `HERON-STATE-5521`(zh-TW)。
  - F2:輸入框上方 `✈ flightwake · ●yellow · STATE 同步 → 先處理未驗證項再疊新工作(讀 STATE)`。
  - F4:`echo flightwake-probe` 後模型引出 `probe-echo-trap [probable] 命中 echo flightwake-probe`。
  - F3:`/fw-log` 印出 zh-TW 表格,`npm test`(script 為 `node -e "process.exit(0)"`)記為 `未知 | not-a-known-runner`(正面證明規則下正確),頁尾含 pass 的意義。
  - F5(角色守門,預設關閉):當時未抽驗;**後由驗收者 Fable 5.1 在真實 session 實測通過**——pm 座位寫入 `src/` 被擋並給出說明;使用者輸入 `/fw-role-release src/**` 後 `src/add.js` 可寫、狀態列持續顯示放行警告;重疊的 `src/private/**` 仍被擋;revoke 後恢復阻擋。
- **項目 7**(2.1.289,`claude -p`、讀檔工具全關、各 3 次):只有 AGENTS.md → 3/3 答出 AGENTS 暗號,debug `no CLAUDE.md found; AGENTS.md loaded`;
  兩者都有 → 3/3 只有 CLAUDE 暗號(AGENTS 暗號答 no);都沒有 → `NONE`。只測了 `-p`;機制是同一個內建外掛,互動模式未另測。

## 留在 worktree 之外的東西

- `~/.flightwake/registry.json`:誤跑 update 加的本 worktree 一筆**已刪**(其餘與事前備份相同;備份在 scratchpad)。
- `~/.claude.json`:真機 session 在 `projects` 加了 `scratchpad/realload` 的信任紀錄**已刪**(只刪該鍵、權限 0600 保留;備份在 scratchpad)。
  互動 session 啟動本身會更新 `~/.claude.json` 的計數類欄位(如 numStartups),那部分無法還原。`-p` 的三個 AGENTS.md 測試 repo 沒有留下信任紀錄。
- `~/.claude/projects/` 下四個 session 資料夾(`…-scratchpad-agentsmd-{only-agents,both,neither}`、`…-scratchpad-realload`):scratch 測試 session 的紀錄,**未刪**,交 Kai 決定。
- 使用者層記憶:`~/.claude/projects/-Users-kaiwu-orca-flightwake/memory/unquoted-heredoc-executes-backticks.md` 與 MEMORY.md 一行(fw-trap 的跨 repo 規則)。
- npm 快取:`npx -p typescript@5.9.3`(型別檢查)、誤跑的 `npx flightwake`(抓了已發佈的 0.14.0)。

## 未完 / 交接

- ~~未 push、未 bump、未發版;CI 未跑~~ → 已解決:驗收、Astra 複審、PR #11 CI 全綠、v0.15.0 已發佈(見末節「發佈補記」)。
- 待 Kai 決定:①項目 7 對 roles 座位設計的影響(只有 AGENTS.md 的 repo);②TRAPS 兩條 python 3.11 重複條目的壓實;③`~/.claude/projects` scratch session 資料夾(後增為五個,見「版本 0.15.0」節)是否刪除。
- 本 repo 自己的 dogfood 安裝副本仍未刷新——0.15.0 已發,要不要刷新交 Kai 決定(STATE 下一步)。
- 未驗證(發版後仍成立):mod 題在 setup 中的其他語言外觀;真的 resume/compact(沿用 mods record 的未驗證清單);Windows;zh-CN 與 ja 安裝內容與文件未經母語者校對。角色守門(F5)已由驗收者真機實測,不再列入。
- 已知限制沿用 [[261005-flightwake-mod]] 的「驗證範圍」與 [[261005-setup-wizard]] 的已知限制;mod 文件的限制段依該 record 撰寫。

## 驗收修正(同日,b9d38f5..)

驗收者(Fable 5.1)獨立驗過後通過整合本身;GPT-6 Astra 讀 diff(原文 `docs/plans/integration.diff-review-astra.md`,審至 284ceef)判定兩項合併前必修,驗收者採納。
先寫測試(b9d38f5)、跑出失敗再修:

1. **uninstall 會刪掉使用者在 mod 資料夾自己加的檔**——規格(任務說明「移除 mod 資料夾」)本身與資料保護衝突,以資料保護為準。
   紅:`❌ FAIL: 40.4 uninstall 不得刪除使用者在 mod 資料夾自己加的檔`(原 40.4 刪掉 40.3 建立的 MY-NOTES.md 卻只檢查 STATE)。
   修:uninstall 依目前套件的發行清單逐檔經受防護 writer 移除,再由深到淺移除變空的目錄;剩下的(MY-NOTES.md、引擎寫的 `.claude-plugin/types/x.d.ts`)保留並列出;
   `--purge` 只針對 `.flightwake/`。沒有自加檔時整個資料夾消失。任務說明對應段落已改。
   限制:發行清單取自執行 uninstall 的套件版本;舊版發行過、新版已刪除的檔會被當成「不是 flightwake 發行的」而保留並列出(寧可多留,不誤刪)。
2. **mod 複製的預檢漏掉內層型別衝突**:`hooks/register.ts` 是目錄時 `init --agents=claude --mod --force` 先寫了 STATE/skills/settings/指令檔才 EISDIR。
   紅:`❌ FAIL: 40.8 mod 發行檔位置是目錄:應在第一個寫入前中止、零寫入`。修:writer 的 `cp`(非整目錄替換時)對每個要寫的發行檔做單檔寫入同一套檢查;
   **skill 的複製有同樣缺口**,一併修、一併測(`.claude/skills/fw-record/SKILL.md` 是目錄 → update 預檢中止)。fw-roles 是整目錄替換,內部型別衝突本來就會被換掉,加測確認仍成功。
3. 文件:mod 文件四語的「檢查每個可能的 cwd」改為如實描述(最多 16 個候選,超過改用路徑尾段比對);uninstall 的描述同步改(mod 文件、README、CHANGELOG 四語)。
4. 41 節的測試名稱與本 record 的描述改成如實寫「只是關鍵字的文字檢查」。

驗證:smoke 41 節 `✅ smoke 全過`;`claude plugin test` 276 pass / 0 fail;validate `✔ Validation passed`(零警告);tsc clean;git-readonly-check 三項 ok。
本輪未重做真機載入(改動在安裝器的移除與預檢,mod 本身未變)。DECISIONS 2026-10-05 首兩條。
Astra 列為可延後、未修:未寫入的自加 symlink 仍會讓 update 被拒(沿用既定的 symlink 相容性取捨)。

## 試裝回饋修正(同日,6d35a0f..)

驗收者確認 Astra 兩項必修通過後,在一個真實的既有安裝上試裝本分支(筆記型、只有 AGENTS.md、原本 0.14.0;
`init --force --lang=zh-TW --agents=claude,codex --statusline --profile=notes --orca --mod`):安裝成功、使用者資料雜湊不變、doctor 0 失敗。實際使用發現兩個小問題:

1. **STATE 已初始化時,結尾「下一步」仍說 fw-coldstart 會寫出第一版 STATE** → 依 STATE 是否仍為未填範本(與 doctor 同一判定)決定;已初始化只提示 commit。
   紅:`❌ FAIL: 42 STATE 已初始化時,init --agents=claude --force 的結尾不得再說會寫出第一版 STATE`;涵蓋 init --force(含 --mod)、update、private、zh-TW。
2. **沒有 record 的 repo,doctor 回報「latest_record 指向的 (尚無) 不存在」** → 正規寫法 `latest_record: none`(fw-coldstart 四語明寫唯一拼法);
   doctor 對 `none` 與「records/ 為空時的任何值」列資訊,records/ 有檔卻指向不存在才提醒。smoke 42 驗 `none`、`(尚無)`、範本殘值三種,以及 records/ 有檔時仍提醒。
   fw-coldstart 文字的檢查是關鍵字檢查。

驗證:smoke 42 節 `✅ smoke 全過`;plugin test 276/276;validate 零警告;tsc clean;git-readonly-check 三項 ok。DECISIONS 2026-10-05 首兩條。

**已知現象(不修)**:這次試裝印出「7 個框架檔有本地修改、已被覆蓋」。原因是本分支改了這些框架檔(skill、範本)但版本號仍是 0.14.0,
「同版同語言才判定本地修改」的覆蓋防護因此把分支的新內容當成使用者修改。正式發版會 bump 版本,使用者不會遇到;開發中的分支(版本未 bump)裝到既有同版安裝時會出現,訊息無害、檔案內容是分支的版本。

## 真機回饋修正(同日,5103430..)

驗收者在全新真實資料夾用真的終端機跑互動式 setup,並在真的 Claude Code session 實測 mod(F1、F2、F4 實際生效;F4 的提示讓 agent 在改 schema 前先備份)。
回報四項,另追加兩項(Kai 同意)。逐項先紅後綠:

1. **setup 已回答的題目從畫面消失**(Orca 終端機、繁中)。在真的 Orca 終端機重現:正好是「有打字作答」的行讀回來是空白;pyte 在 60/80/100 欄都看不到,
   純 ASCII 的 `[1] 2` 也會消失 → 不是全形寬度問題,是 readline terminal 模式的重繪序列(`ESC[1G ESC[0J … ESC[<n>G`)。
   修:`readline` 改 `terminal: false`(cooked tty、驅動回顯、純文字 prompt;Ctrl-C 為真 SIGINT,同樣零寫入 exit 130)。
   紅:smoke 43.1 `[1G[0J[1] [5G1`;綠:43.1 四語通過(新 `test/pty-answers.py` 等輸出穩定才逐題作答);**在真的 Orca 終端機複驗**:每題與答案都留住
   (`[1]2`、`…:1`、`[y/N]y` ×4、`[1]2`;Orca 讀取時會吃掉答案前的空格,但答案在)。測試用的兩個 Orca 終端機已確認回到閒置 shell 後關閉。TRAPS `readline-terminal-mode-loses-answer-lines`(probable)。
2. **F3 漏記 shell 改動** → `lib/shell` 新增 `shellWriteTargets`(重導向、cp/mv/rm/tee/sed -i),`/fw-log` 另成一區「由指令推斷,可能不完整」,與工具確定的改動分開。
3. **/fw-log 時間是 UTC** → 本地時間+偏移再附 UTC(偏移取自 `date +%z`;讀不到只顯示 UTC)。
4. **串接執行的測試很少產出 pass** → 判定不變;每 session 一次經工具結果附加說明提示 agent 單獨執行;fw-record 四語加同一句。
5. **F2 沒有儀表時常駐並帶 context 百分比**(取代「一切正常時保持安靜」;有儀表維持原狀;STATE 範本時顯示 `●?` 與 coldstart 提示)。
6. **新增唯讀 `/fw-mod`**:五個功能開啟/關閉/閒置、原因、怎麼讓它生效,加上版本、語言、profile;doctor 與安裝結尾改指向它。

測試:`mods/flightwake/tests/feedback.test.ts`(紅:先是 import 失敗、載入後 9 個失敗);既有 band 測試依新規則改寫(健康時不再安靜等 4 條、2 條把「安靜」當代理的斷言改為直接斷言提示與落後量);
3 條「已註冊指令恰為…」的斷言改為只斷言各自的指令(`/fw-mod` 永遠註冊)。smoke 43.2:MOD_VERSION 與 plugin.json 一致、安裝結尾與 doctor 指向 `/fw-mod`、
無儀表時的橫條說明、fw-record 四語(關鍵字檢查)。途中 validate 拒載一次:`$.state` 參照必須是本檔字面值 → TRAPS `mod-state-refs-must-be-literal`(confirmed)。

驗證:smoke 43 節 `✅ smoke 全過`;`claude plugin test` 289 pass / 0 fail;validate `✔ Validation passed`;tsc clean;git-readonly-check 三項 ok。
**真機**(暫存 repo `realload`,以本分支 `update` 刷新 mod,`FLIGHTWAKE_HOME` 指向暫存;Haiku 4.5;Bash 在該暫存 repo 預先允許以免停在權限提示):
mod 以 `@skills-dir` 載入、hook 失敗行 0;橫條沒有儀表時顯示 `✈ flightwake · ●yellow · STATE 落後1c·27% → …`(27% 在舊規則下不會出現);
`echo '-- touched' >> notes.txt && cp …` 後 `/fw-log` 的推斷區列出 `notes.txt (>>)`、`notes-copy.txt (cp)`;`echo start && npm test 2>&1; echo exit=$?`
記為 `未知 | compound`,agent 逐字引出提示「這次的測試是和其他指令串在一起跑的…請把測試指令單獨執行一次」;時間欄 `2026-10-05 04:02:27 +0800 … (20:02:27 UTC)`;
`/fw-mod` 列出 v0.1.0、zh-TW、code 與五項(STATE 已注入、橫條代替儀表、記錄 2 個 shell 推斷/2 次測試、絆線監看 1 條、角色守門關閉附開啟方式)。
真機中刷新 mod 時又出現「框架檔有本地修改」的訊息,即上一節記的已知現象(版本未 bump)。

worktree 之外:`~/.claude.json` 的暫存 repo 信任紀錄又加了一次、已再刪(只刪該鍵、0600 保留,備份在 scratchpad);`~/.claude/projects/` 的四個暫存 session 資料夾集合不變(沿用);
在 Orca 開過兩個測試終端機(已關)。未驗證:有儀表時的真機外觀、F5 開啟時 `/fw-mod` 的真機輸出、Windows 下 `date +%z`(預期退回 UTC)。

## 收尾複審修正(同日,d05b72c..)

驗收者逐項實測真機回饋六項通過;GPT-6 Astra 收尾複審(原文 `docs/plans/integration.diff-review-astra-2.md`,審至 5153c17)確認上輪兩個反例通過、
setup 的 Ctrl-C/EOF/多行貼上、`date +%z`、提示共用管道、`/fw-mod` 唯讀、改寫過的測試斷言都核對通過,列三項合併前必修(驗收者採納)。逐項先紅後綠:

1. **F3 shell 推斷把非路徑寫進日誌**(`sed -i '' -e 's/foo/bar/' -e 's/password/SECRET_REVIEW/' config.txt` → `s/password/SECRET_REVIEW` 被列為檔名)。
   修:`shellWriteTargets` 依各指令參數語法取出目標(sed `-e/-f/-l/--expression/--file`、cp/mv `-t/-S/--target-directory/--suffix` 的值不是路徑;展開與萬用字元略過);
   通用防線:候選要在指令執行後由 git 回報為 repo 內有變更(`git --literal-pathspecs status --porcelain -z --untracked-files=all -- …`,唯讀)才列出,
   刪除因此只對受追蹤的檔成立;不是 git repo 就不列。`/fw-log` 頁尾與 docs/mod 四語改為「只列出能確認的路徑,可能漏記」。
   途中:`io.git` 會 trim 輸出,第一筆狀態碼的前導空白被吃掉 → 改以樣式解析;並以真 git(修改/未追蹤/刪除/不存在/sed 腳本字)複驗只認前三者。
2. **uninstall 遇「應為檔案的位置是目錄」遞迴刪除**(`hooks/register.ts/KEEP` 被刪,exit 0)。修:新 `bin/remove.mjs` 逐檔移除發行清單、型別不符保留並列出、變空目錄由深到淺移除;
   四個 skill、fw-roles(uninstall 與 roles remove)、mod 共用。行為變更:skill 資料夾裡自加的檔也保留(原本整個刪)。
3. **cwd 不確定後仍推斷相對路徑**(`cd /tmp; rm private.txt` 被記成 repo 的 private.txt)。修:只有開頭的 `cd X &&` 鏈(子 shell 外)算確定,其他 cd 之後不解析相對路徑;repo 外絕對路徑不記。
   DECISIONS 寫明 F3(紀錄,寧可漏記)與 F4(提示,寧可多提示)取捨相反是刻意的。
4. 測試缺口:`/fw-mod` 唯讀測試補「已安裝情境下實際呼叫前後,檔案與 session 狀態不變」。

紅:mod 測試 6 個失敗(d05b72c 前);smoke 44 `❌ FAIL: 44 … register.ts 是目錄(型別不符)時 uninstall 不得刪除其中的使用者檔`。
**環境插曲**:本輪 shell 帶 `FORCE_COLOR=3`,node 連管道輸出都上色,smoke 第 4 節的字串比對失敗(與本次改動無關)→ smoke 開頭 `unset FORCE_COLOR`,TRAPS `force-color-colours-piped-node-output`。
另:scratchpad 目錄在本輪中途失效,驗證工具改放 `$TMPDIR/fw-integration-verify`;一次診斷時把 smoke 前段複製到該處執行,`FW` 由腳本位置推得而把整個系統暫存目錄
複製進 smoke 自己的暫存目錄(只讀取、smoke 結束時由 trap 刪除,已確認不殘留),之後改為把診斷腳本暫放 `test/` 執行並刪除。

驗證:smoke 44 節 `✅ smoke 全過`;`claude plugin test` 297 pass / 0 fail;validate `✔ Validation passed`;tsc clean;git-readonly-check 三項 ok。本輪未重做真機 Claude session(改動為判定與解析,已以真 git 複驗解析)。
worktree 之外:`$TMPDIR/fw-integration-verify`(驗證工具與隔離的 FLIGHTWAKE_HOME)。


**最後確認(同日)**:驗收者 Fable 5.1 複核三項修正通過;GPT-6 Astra 最後確認(原文 `docs/plans/integration.diff-review-astra-3.md`,審至 6211fd2)結論**依約定標準可合併、無剩餘合併前必修**(補跑一般 cp/mv/重導向正確記錄;它追加測試後 302/302,追加的測試未進本分支)。它列的未驗證範圍:本輪未重跑 tsc、真實 Claude session、Windows、CI、競態/磁碟故障;git 確認只證明事後有變更、不證明是該指令造成(日誌維持「推斷」定位)。功能凍結;未 push/bump/發版,等 Kai 決定。

## 版本 0.15.0(同日,未發版)

Kai 決定:只 push 本分支、開一個 PR,在此 PR 內把版本改成 0.15.0;CI 通過並合併後才發版(今天不發)。push 與開 PR 由驗收者做。
- 比照 4f6427a(v0.14.0):`package.json` 0.15.0;CHANGELOG `Unreleased` 改為 `[0.15.0] — 2026-10-05`、底部連結補 0.15.0 並把 Unreleased 比較基準改為 v0.15.0。
  其他 `0.14.0` 出現處都是歷史敘述(roles「v0.14.0 起」、計畫書)或 mod 測試的 marker 範例,不同步。CLI 版本由 `bin/cli.mjs` 讀 package.json,無其他需改處。
- **mod 維持 0.1.0**(第一次隨套件發行;之後改了 mod 發行檔就 bump mod 版本):理由見 DECISIONS 2026-10-05 首條。
- 不打 tag、不建 GitHub Release、不 npm publish、不 push;dogfood 副本照舊不在本分支刷新。
- 驗證(改版號後):smoke 44 節 `✅ smoke 全過`;`297 pass / 0 fail, Ran 297 tests across 11 files`;`✔ Validation passed`;tsc 5.9.3 對 Claude Code 2.1.289 型別檔 exit 0
  (型別檔取得方式:把 mod 複製到暫存目錄,`claude --plugin-dir <副本> --model haiku -p` 載入一次,引擎在副本寫出 `tsconfig.json` 與 `.claude-plugin/types/`);git-readonly-check 三項 ok。
- 觀察(未改,屬打包範圍):`npm pack --dry-run` 共 107 檔,其中 mod 29 檔含 `mods/flightwake/tests/`;安裝器只複製 manifest/hooks/types,所以只影響套件大小。
- worktree 之外:取型別檔時誤用 `claude plugin init`,它在 `~/.claude/skills/probe/` 建了一個會自動載入的外掛,**已當下刪除**(兩個檔與兩層目錄,查看內容後刪);
  `--plugin-dir -p` 那次留下 `~/.claude/projects/-Users-kaiwu--claude-jobs-0553c654-tmp-empty/`(session 紀錄,未刪,同前述 scratch 資料夾交 Kai)。

## PR #11 的 CodeQL 警示修正(同日,b82f215..6c63ffc)

驗收者 push 後開 PR #11:smoke(ubuntu、macOS)、state-fresh、CodeQL analyze 通過,但 CodeQL 檢查因 5 個新 high 警示失敗——
`recorder.ts:258` 的 `cell()` 只跳脫 `|`、三個 acceptance 測試同寫法(js/incomplete-sanitization);`traps.ts:34` 單次 replace 去 HTML 註解(js/incomplete-multi-character-sanitization)。
比照 6c587d8 改程式、不壓警示。先紅後綠:
- 紅(b82f215):`renderLog` 的指令 `npm test -- -t 'a\|b' | tee out.txt`、script `jest -t 'x\|y'` → 列被切成 10 格(應 8);
  TRAPS 檔頭 `<!<!-- x -->--` 後接範例 frontmatter → 範例 `ghost-example` 被當成條目(含 `commands: ["git push"]`,會變成假絆線)。
- 修(6c63ffc):`tableCell` 移到 `lib/core.ts`(先 `\` → `\\` 再 `|` → `\|`),recorder 與三個測試共用;`tests/world.ts` 的 `tableCells` 是它的反函式(未跳脫的 `|` 才分格,再還原 `\x`),
  取代測試各自的 `(?<!\\)\|` 切法(那種切法遇 `\\|` 會錯)。去註解改為重複 replace 直到不再變化;未閉合的 `<!--` 照舊當一般文字留著(不會吃掉其後的條目)。
- 取捨:/fw-log 的指令放在反引號 code span 裡,依 GFM 規則表格只會還原 `\|`,所以**渲染後**含反斜線的指令會多顯示一個 `\`;原始文字(fw-record 與模型讀的就是原始文字)則無歧義、可完整還原。
- 驗證:smoke 44 節全過;外掛測試 299/299;validate;tsc(25 檔);git-readonly-check;node --check。**PR #11 第二輪 CI(head 89b56e9)全數通過**:`smoke (ubuntu-latest)`、`smoke (macos-latest)`、`state-fresh`、`analyze`、`CodeQL` 皆 pass(smoke/state-fresh 由 push 與 pull_request 兩個 run 各跑一次,run 37233553325、37233556587;analyze 在 37233556587);本 PR 未解決 code-scanning 警示 0、mergeStateStatus CLEAN(驗收者回報,另以 `gh pr checks 11` / `gh pr view 11` 唯讀複核)。
- mod 版本仍 0.1.0:mod 尚未發行過,依 DECISIONS 2026-10-05 的規則不需 bump。`bin/install.mjs` 兩處 `^<!--…-->` 只去自家 snippet 開頭一段,CodeQL 未報,未動。

## 發佈補記(2026-10-05 同日)

比照 [[260928-roles-v2]] 的補記;合併與發版由 Kai 決定、驗收者執行,以下各點本 session 以唯讀指令再查證一次(`gh pr view 11`、`gh run list --commit`、`gh release view`、`git ls-remote`、`gh run view`、`npm view`)。
- PR #11 2026-10-05T05:41:40Z 以 **merge commit** 合併進 main:`4605ee0c03df4ceba0c0a3206bb86dcde75a6935`(parents 9dd685c、ab1b89a,保留全部 commit——record 引用的分支 hash 仍有效)。
- main 上 4605ee0 的 workflow:`ci`(run 37268913169、37269098352)、`codeql`(37268913168)、`scorecard`(37268913113)皆 success。
- GitHub Release `v0.15.0`(2026-10-05T05:44:11Z,https://github.com/kaiwutech-TW/flightwake/releases/tag/v0.15.0),tag 指向 4605ee0。
- release run **37269098434** success:job `publish` 依序 `bash test/smoke.sh` → `npm publish --provenance --access public`,各步 success。
- `npm view flightwake`:version **0.15.0**、dist-tags.latest **0.15.0**、gitHead 4605ee0、`dist.attestations.provenance.predicateType` = `https://slsa.dev/provenance/v1`。
- 實裝驗證(驗收者執行、回報):合併前以 `npm pack` 的 tarball 實裝(`init --mod --orca --profile=notes --statusline`、`doctor`、`roles`、`claude plugin validate`、`uninstall`);
  發版後在暫存資料夾 `npx flightwake@0.15.0 init --mod` + `doctor` → 顯示 v0.15.0、0 失敗;兩個真實 repo 以正式版 `update` 後 doctor 0 失敗 0 提醒,且不再出現「框架檔有本地修改」誤報。
- 本 repo dogfood 副本未刷新(交 Kai 決定)。

