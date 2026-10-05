---
updated: 2026-10-05
updated_by: Claude(Opus 5.5)
latest_record: records/261005-integration.md
health: green  # v0.15.0 已發佈(2026-10-05;PR #11 merge commit 4605ee0,main 的 ci/codeql/scorecard success,release run 37269098434,npm latest 0.15.0 + provenance;tarball 與 npx@0.15.0 實裝、兩個真實 repo update 後 doctor 0 失敗);本 repo dogfood 副本未刷新(待 Kai)
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake **v0.15.0(2026-10-05 已發,npm latest;前版 v0.14.0 2026-09-28)**,**已開源上線(2026-07-18)、i18n 完成(2026-07-19)**:trusted publishing 連六次 Release 零失誤、英文預設 + `--lang=zh-TW`、`update` 就地升級、儀表含下一步提示/真實視窗/新版提示(本 repo、kaiwuweb、salesmartly_chain、marketing_dashboard 實跑中,前三者已 update 至 0.9.0)。HN 已發(Show HN,留言被 auto-flag 待版主回覆)。缺口 1–7 全落地、兩 gate 全關、benchmarks n=2(非自我參照,零糾正)、宣傳素材全齊(三稿 + 三張截圖 + context 開銷故事線)。**GSD 全域已拆除(2026-07-18 晚,手冊 docs/cleanGSD.md);A/B 已量、開場底盤已分解到底**。新增 docs/workflow.md 分階段實戰手冊(四語 README 有入口)。**2026-07-23 外部評測後補強 → v0.10.0 已發佈**(fw-trap 跨 repo 坑雙寫、state-check health=green 證據檢查、hook 盲區文件化;同類專案掃描確認差異化象限無人佔據)。**Demo GIF 已上 README 首屏**(本 repo 實錄 /fw-coldstart,docs/demo.gif 244KB,四語嵌入)。npm 0.10.0 已上(驗證證據見 latest_record);**0.10.1(儀表常駐版本號)已 bump 在 main、刻意未發**——等下批新功能一起出 Release(使用者 2026-07-23 定的)。**2026-07-27 首批 dependabot PR 全處理完、PR 流程硬化**:閘門不再誤擋 bot commit(state-check + statusline 同步)、main 開 required status checks、補齊 CONTRIBUTING/CHANGELOG/CoC/issue+PR 模板/.gitignore(見 [[260727-oss-pr-flow-hardening]]);Scorecard 實測 7.2/10。**同日安裝內容擴到四語**(en/zh-TW/zh-CN/ja;刻意不做語言自動偵測、覆蓋本地修改改為逐檔點名,見 [[260727-four-language-install]])——日文/簡中翻譯未經母語者校對,待推廣後徵求。**這批連同擱置的 0.10.1 一起發成 v0.11.0**(minor 而非 patch:含新功能;第七次 Release 零失誤,驗證證據見 latest_record)。剩:發宣傳(三稿最終版在使用者桌面)。定位:給強模型(Fable 5 級)的事後記錄框架,補持久性與紀律、不補智力。
**2026-08-03:TRAPS 根因加 `confidence` 三級 + 不對稱門檻(四語 14 檔,smoke 23/23)**——起點是使用者問「寫進 TRAPS 卻還是又踩,是設計還是呼叫問題」,稽核下游 106 條後答案是兩者皆非:失效在**誤診被寫成定案**(22% 帶更正標記)。見 [[260803-trap-confidence]]。同批第二項:**fw-handoff 的 Scope 加「驗收」一行**(四語)——Scope 原本定義做什麼/不做什麼,沒定義怎樣算做完。同時評估並**否決**了「把開場模板做成第五個 skill」(理由見 DECISIONS 2026-08-03 首條:那是開工前 intake gate,違反本框架第一原則,且會把事件觸發成本變成常駐成本)。兩個下游 repo 共 50 條 trap 已標註完畢,marketing_dashboard 另做了 STATE 瘦身(197→110 行,常備事實 28→6,慣例拆到該 repo 的 docs/conventions.md)。
**2026-08-11:跨 repo 查詢層 `flightwake-tower` 完成(獨立 repo `~/orca/flightwake-tower`)+ 核心 registry 登記**——tower 唯讀(TRAPS 跨 repo 搜尋 + STATE 總覽含 SCOPE+ 行與 health_note,CLI 皆有 --json + 手寫零依賴 MCP stdio);核心唯一改動 = init/update 寫 `~/.flightwake/registry.json`、uninstall 移除。真實機隊 21 repo 入冊(worktree 跳過)、驗收全過;架構三決策(獨立 repo/手寫 MCP/命名)見 DECISIONS 2026-08-11,詳見 [[260811-tower-and-registry]]。**核心 0.13.0 與 tower 0.1.0 都未發版**;Phase 2(session 成本/工時:token + 5 分鐘 gap-capping)未動工。
**2026-10-05:第一階段 setup 完成於分支 `kaiwutech-TW/setup-wizard`(已隨 v0.15.0 發佈)**——`npx flightwake setup` 引導式安裝(確認前零寫入、摘要 = 安裝函式 dry-run)、唯讀 `doctor`、`--profile=notes`、Orca 協作附加元件、`--git-init`、init/setup 先驗 git、fw-coldstart 未初始化分支;smoke 34/34;驗收通過後再做 Kai 兩項 UX(無指令檔直接問工具、確認預設是)與 Astra 四輪共 17 項修正(含 main 既有的 symlink/hardlink 覆蓋 STATE;現在先預檢、後寫入,寫入一律暫存檔 + rename 且保留原權限),smoke 39 節。決策見 DECISIONS 2026-10-05,詳見 [[261005-setup-wizard]]。
**2026-10-05(分支 kaiwutech-TW/mods,已隨 v0.15.0 發佈):Claude Code mod `flightwake-mod` 完成並真機載入**——`mods/flightwake/` 一個外掛五個可開關功能(STATE 快照注入、輸入框上方橫條、session 行車記錄 `/fw-log`、TRAPS `paths`/`commands` 絆線、選配角色守門 `deny-write`);計畫 `docs/plans/mods.md` 第 2 版,證據與未驗證項見 [[261005-flightwake-mod]];驗收三輪的修正都已完成(F3 正面證明含環境與旗標值、F4 候選 cwd 有上限;見同 record)。安裝器整合等 setup-wizard 分支合併後再做。
**2026-10-05:第三階段完成並以 v0.15.0 發佈(PR #11 merge commit 4605ee0;驗證證據見 [[261005-integration]] 發佈補記)**——setup-wizard 為基底合併 mods;`setup`(只對 Claude Code 問、預設否)/`init --mod`/`update`(只刷新既有)/`uninstall`/`doctor` 認得 `flightwake-mod`(裝到 `.claude/skills/flightwake-mod/`,只裝 manifest/hooks/types);fw-record 取用 `/fw-log`、TRAPS `paths`/`commands` 欄位說明(四語)、manifest author;四語 `docs/mod*.md`;順手修 main 的 private Claude 安裝 update 退回 Codex。查證:Claude Code 2.1.289 只在沒有 CLAUDE 指令檔時讀 AGENTS.md(TRAPS `claude-code-loads-agents-md-when-no-claude-md`)。詳見 [[261005-integration]]。
**2026-09-28(晚):roles v2 完成並在下游真實團隊驗收**——座位表、待命角色原生定義(只給無座位角色)、`roles card`/`assign`、manifest 清理;Codex 真機實測、兩家實際衍生通過;改為與現行 roles 合併以 0.14.0 發佈(DECISIONS 2026-09-28)。
**2026-09-28:roles 從零實測通過、範本擴為 9 個、四語文件、v2 計劃經 Codex 兩輪審查定案(0.14.0 發現行、v2→0.15.0,見 DECISIONS 2026-09-28)**。
**2026-09-27:`flightwake roles` 選配附加元件完成(未發版,dogfood 中)**——起點是使用者的四 agent 團隊(Codex 專案經理/Claude 技術總監/Claude 寫手/Codex 審核,跨兩個 repo)在 /clear 後專案經理忘了派工、自己寫 code。角色改寫進各 agent 開場必讀的指令檔(Codex→AGENTS.md、Claude→CLAUDE.md),不用 hook;一份 `.flightwake/ROLES.md` 可跨 repo,`fw-roles` skill 推薦/預覽/客製,`roles apply` 套用。兩個下游 repo 誘導題 4/4。定位(選配、不進核心)與實作取捨見 DECISIONS 2026-09-27,詳見 [[260927-roles-addon]]。
**2026-09-05:OKF v0.2 互通定案——不對齊源格式,tower 做單向 `export --okf`**(當天實作完:v0.2 conformant bundle,實跑 19 repo/235 條;不揑造 verified、confidence 以 extension 保留。理由與重評條件見 DECISIONS 2026-09-05,詳見 [[260905-okf-interop-decision]])。
**2026-09-02:v0.13.0 已發佈並驗證(npm 實回 0.13.0,證據見 latest_record;PR #9 merge commit,含 registry + Codex/Gemini 原生支援)**——起點是使用者在 Codex 裡發現義務表叫它跑 `/fw-coldstart` 但 Codex 沒這指令:多平台安裝原本只是把 Claude 的表貼進 AGENTS.md,skill 只裝 `.claude/skills/`、hook 只進 `.claude/settings.json`。現在偵測到 Codex/Gemini 就多裝 `.agents/skills/fw-*`(兩家共讀)、`.codex/hooks.json`(Stop)/`.gemini/settings.json`(AfterAgent,同腳本以 hook_event_name 切 block/deny)、義務表按平台改寫 `$fw-`/裸名;uninstall 對稱;四語 README + CHANGELOG(含補記 registry)+ **docs/multi-agent.md(en/zh-TW:三個模型共用一個資料夾的實際用法)**。smoke 28/28;Codex 0.147.0 真機:四個 skill 被發現、Stop hook 的 reason 成為續跑 prompt。決策見 DECISIONS 2026-09-02,詳見 [[260902-codex-gemini-native]]。
**2026-08-05:v0.12.0 已發佈並驗證(npm 實回 0.12.0,證據見 latest_record)**——handoff 教學補強(fw-record 未完節指路 + workflow 分界規則與 CONTEXT 實例;起點數據:本 repo 23 record、0 CONTEXT)連同 260803 的 trap-confidence 批一起出貨,PR #8(merge commit 合併——record 引用了分支 commit hash,rebase/squash 會改寫使其失效)。同 session 完成 **Codex/MCP 原生支援調研**(結論與邊界見 [[260805-v0120-handoff-teaching]] 未完節;方向未拍板,動工前先問使用者)。

# 進行中(未完成勿刪)

開源前缺口清單(優先序見 DECISIONS 2026-07-18):

- [x] 1. 敏感資訊防護 ✅ ce4c563(檢查清單+grep 自查;掃描器評估結論:不內建,見 DECISIONS)
- [x] 2. 記錄增長+時效管理 ✅ dd3c082(superseded 生命週期;壓實併入既有 skill,不新增 fw-curate)
- [x] 3. 多平台安裝 ✅ fd02225(偵測 + --agents;全無指令檔建 AGENTS.md;v0.3.0)
- [x] 4. `--private` flag ✅(exclude 標記區塊 + settings.local.json + CLAUDE.local.md;細則見 DECISIONS 2026-07-18;v0.4.0)
- [x] 5. uninstall 指令 ✅(反向清除固定寫入範圍;使用者資料預設保留、--purge 才刪,見 DECISIONS 2026-07-18;v0.5.0)
- [x] 6. CI 端 STATE 落後檢查 ✅(state-check.mjs --ci 雙模式 + README 範例,本 repo ci.yml 已 dogfood;見 DECISIONS 2026-07-18;v0.6.0)
- [x] 7. monorepo 政策 ✅(單 repo 一份、裝 git root、子目錄擋下指路;見 DECISIONS 2026-07-18;v0.7.0)
- [x] 開源收殘 ✅(MIT + 英文 README + release.yml + flip runbook;舊 objects 清理併入 runbook 第 1 步;v0.7.1)
- [x] 冷啟動實測 ✅ 首筆有效樣本入 docs/benchmarks.md(2026-07-18;flightwake 邊際 ≈ 2.6K 讀 + 2K 出,接手零猶豫)
- 已定案待觀察:慣例演進採讀取端容忍(見 DECISIONS 2026-07-18),容忍不了時再議遷移工具
- v0.9 已全數出貨(2026-07-19:i18n 英文預設、update 子指令、儀表新版提示);zh-CN/ja 安裝內容待 issue 需求再擴(DECISIONS 重評條件)

# 下一步入口

0a. **v0.15.0 已發佈(2026-10-05)**:setup 引導式安裝、doctor、`--profile=notes`、Orca 協作、Claude Code mod 在 npm latest(驗證見 [[261005-integration]] 發佈補記;mod 0.1.0,之後改了 mod 發行檔才 bump,見 DECISIONS 2026-10-05)。**待 Kai 決定**:①本 repo 自己的 dogfood 安裝副本要不要用 0.15.0 刷新(`npx flightwake update`;目前仍是舊版);②項目 7 對 roles 座位設計的影響(只有 AGENTS.md 的 repo 會讓 Claude 讀到 Codex 座位);③TRAPS 兩條 python 3.11 重複條目的壓實;④`~/.claude/projects` 下五個 scratch session 資料夾是否刪除。仍未驗證:Windows、真正的 resume/compact、setup 中 mod 題的其他語言外觀、zh-CN/ja 母語校對;各項見 [[261005-integration]]、[[261005-setup-wizard]]、[[261005-flightwake-mod]] 未完節
0. **v0.14.0(2026-09-28)**:roles + v2(驗證見 [[260928-roles-v2]] 補記)。後續:常用 repo `npx flightwake update`(現在直接到 0.15.0);觀察下游團隊日常 /clear 後角色與待命角色派工;Gemini 原生待命定義待驗證後再做
1. **發宣傳**:三稿最終版(已改寫為不點名 GSD,含 HN 留言預備)在使用者桌面 `~/Desktop/flightwake-launch-copy.md`;截圖三張在使用者手上;HN 挑能盯留言的時段發
2. HN 後續:等 hn@ycombinator.com 回覆(作者留言被 auto-flag)→ 解 flag 後補「v0.9.0 已兌現 English defaults」留言
3. **0.13.0 後續**:常用 repo `npx flightwake update`(**有 AGENTS.md 的 16 個機隊 repo 會長出 `.agents/skills` 與 `.codex/hooks.json`,每個 repo 首次開 Codex 會被問一次信任 hook**)(tower 已凍結,不發版,見 DECISIONS 2026-09-28)
3b. **Gemini CLI hook 真機驗證**:第一個真的用 Gemini 的 repo 驗 AfterAgent 是否觸發、`deny` 的 reason 是否成為下一則 prompt(結構來自官方 reference,未實跑;見 [[260902-codex-gemini-native]] 未完節)
4. **SCOPE+ 格式向使用者確認**(機隊目前零筆,是待啟用的新慣例);tower Phase 2 隨 tower 凍結暫停
5. **向使用者要「最近重複踩到的那條 trap」**,對照三型(誤診/危險側通則/忘了查)驗證 confidence 修正是否命中
6. 宣傳後:盯 issues/討論回饋(含徵求日文/簡中母語者校對);GSD 側對照實測待補(benchmarks 公平性);範例 repo 降為 nice-to-have

# 常備事實(這個 repo 的 3-5 條保命知識)

- 零執行期依賴是硬承諾:安裝器與 hook 只能用 Node 內建模組 + `git`(無 shell),不得引入任何 npm 依賴
- 使用者資料(STATE/DECISIONS/TRAPS/records)任何情況不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段
- 驗證一律跑 `bash test/smoke.sh`(在暫存目錄自建 git repo 測 init,不污染本 repo)
- CLAUDE.md 片段以 `<!-- flightwake:begin vX.Y.Z -->` / `<!-- flightwake:end -->` 包裹,升級 regex 靠這對標記;同一份 snippet 依平台改寫呼叫語法(Claude `/fw-`、Codex `$fw-`、Gemini 裸名),改 snippet 時只寫 `` `/fw-x` `` 形式
- CI workflow 釘 SHA、最小權限,改 workflow 時不得放寬(開源前安全硬化的既定決策,見 3762515)
