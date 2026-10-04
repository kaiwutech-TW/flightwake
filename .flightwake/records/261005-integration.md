---
record_id: 261005-integration
session: Claude(Opus 5.5) 主實作 + 4 個 Claude(Sonnet 5.5) 文件撰寫者(四語 mod 文件與 README,產出經主實作者逐檔審閱、修正後採用)
date: 2026-10-05
repos: [flightwake(分支 kaiwutech-TW/integration)]
tests: bash test/smoke.sh 41 節全過(Python 3.12 在 PATH 前);claude plugin test mods/flightwake 276 pass / 0 fail;claude plugin validate 通過(零警告);tsc 5.9.3(對 2.1.289 型別檔)clean;git-readonly-check 三項通過;node --check bin/ test/ hooks/ 全過;真機:setup 安裝後 mod 以 @skills-dir 載入、zh-TW、F1–F4 抽驗生效
prod_changes: none(未 push、未 bump、未發版)
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
  - F5 預設關閉,本次未抽驗。
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

- 未 push、未 bump、未發版;CI 未跑。之後由獨立審查者讀 diff 驗收、GPT-6 Astra 複審。
- 待 Kai 決定:①項目 7 對 roles 座位設計的影響(只有 AGENTS.md 的 repo);②TRAPS 兩條 python 3.11 重複條目的壓實;③`~/.claude/projects` 四個 scratch session 資料夾是否刪除。
- 本 repo 自己的 dogfood 安裝副本仍未刷新(刻意留到發版後,同前一階段)。
- 未驗證:F5 與 mod 題在 setup 中的其他語言外觀;真的 resume/compact(沿用 mods record 的未驗證清單);Windows。
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

