---
updated: 2026-09-02
updated_by: Claude(Fable 5.1)
latest_record: records/260902-codex-gemini-native.md
health: green  # v0.13.0 npm 實回 0.13.0;smoke 28/28 + Codex 真機皆過;Gemini hook 僅照官方 reference、未真機(機隊零 GEMINI.md)
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake **v0.13.0(2026-09-02 已發,npm latest)**,**已開源上線(2026-07-18)、i18n 完成(2026-07-19)**:trusted publishing 連六次 Release 零失誤、英文預設 + `--lang=zh-TW`、`update` 就地升級、儀表含下一步提示/真實視窗/新版提示(本 repo、kaiwuweb、salesmartly_chain、marketing_dashboard 實跑中,前三者已 update 至 0.9.0)。HN 已發(Show HN,留言被 auto-flag 待版主回覆)。缺口 1–7 全落地、兩 gate 全關、benchmarks n=2(非自我參照,零糾正)、宣傳素材全齊(三稿 + 三張截圖 + context 開銷故事線)。**GSD 全域已拆除(2026-07-18 晚,手冊 docs/cleanGSD.md);A/B 已量、開場底盤已分解到底**。新增 docs/workflow.md 分階段實戰手冊(四語 README 有入口)。**2026-07-23 外部評測後補強 → v0.10.0 已發佈**(fw-trap 跨 repo 坑雙寫、state-check health=green 證據檢查、hook 盲區文件化;同類專案掃描確認差異化象限無人佔據)。**Demo GIF 已上 README 首屏**(本 repo 實錄 /fw-coldstart,docs/demo.gif 244KB,四語嵌入)。npm 0.10.0 已上(驗證證據見 latest_record);**0.10.1(儀表常駐版本號)已 bump 在 main、刻意未發**——等下批新功能一起出 Release(使用者 2026-07-23 定的)。**2026-07-27 首批 dependabot PR 全處理完、PR 流程硬化**:閘門不再誤擋 bot commit(state-check + statusline 同步)、main 開 required status checks、補齊 CONTRIBUTING/CHANGELOG/CoC/issue+PR 模板/.gitignore(見 [[260727-oss-pr-flow-hardening]]);Scorecard 實測 7.2/10。**同日安裝內容擴到四語**(en/zh-TW/zh-CN/ja;刻意不做語言自動偵測、覆蓋本地修改改為逐檔點名,見 [[260727-four-language-install]])——日文/簡中翻譯未經母語者校對,待推廣後徵求。**這批連同擱置的 0.10.1 一起發成 v0.11.0**(minor 而非 patch:含新功能;第七次 Release 零失誤,驗證證據見 latest_record)。剩:發宣傳(三稿最終版在使用者桌面)。定位:給強模型(Fable 5 級)的事後記錄框架,補持久性與紀律、不補智力。
**2026-08-03:TRAPS 根因加 `confidence` 三級 + 不對稱門檻(四語 14 檔,smoke 23/23)**——起點是使用者問「寫進 TRAPS 卻還是又踩,是設計還是呼叫問題」,稽核下游 106 條後答案是兩者皆非:失效在**誤診被寫成定案**(22% 帶更正標記)。見 [[260803-trap-confidence]]。同批第二項:**fw-handoff 的 Scope 加「驗收」一行**(四語)——Scope 原本定義做什麼/不做什麼,沒定義怎樣算做完。同時評估並**否決**了「把開場模板做成第五個 skill」(理由見 DECISIONS 2026-08-03 首條:那是開工前 intake gate,違反本框架第一原則,且會把事件觸發成本變成常駐成本)。兩個下游 repo 共 50 條 trap 已標註完畢,marketing_dashboard 另做了 STATE 瘦身(197→110 行,常備事實 28→6,慣例拆到該 repo 的 docs/conventions.md)。
**2026-08-11:跨 repo 查詢層 `flightwake-tower` 完成(獨立 repo `~/orca/flightwake-tower`)+ 核心 registry 登記**——tower 唯讀(TRAPS 跨 repo 搜尋 + STATE 總覽含 SCOPE+ 行與 health_note,CLI 皆有 --json + 手寫零依賴 MCP stdio);核心唯一改動 = init/update 寫 `~/.flightwake/registry.json`、uninstall 移除。真實機隊 21 repo 入冊(worktree 跳過)、驗收全過;架構三決策(獨立 repo/手寫 MCP/命名)見 DECISIONS 2026-08-11,詳見 [[260811-tower-and-registry]]。**核心 0.13.0 與 tower 0.1.0 都未發版**;Phase 2(session 成本/工時:token + 5 分鐘 gap-capping)未動工。
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

1. **發宣傳**:三稿最終版(已改寫為不點名 GSD,含 HN 留言預備)在使用者桌面 `~/Desktop/flightwake-launch-copy.md`;截圖三張在使用者手上;HN 挑能盯留言的時段發
2. HN 後續:等 hn@ycombinator.com 回覆(作者留言被 auto-flag)→ 解 flag 後補「v0.9.0 已兌現 English defaults」留言
3. **0.13.0 後續**:常用 repo `npx flightwake update`(**有 AGENTS.md 的 16 個機隊 repo 會長出 `.agents/skills` 與 `.codex/hooks.json`,每個 repo 首次開 Codex 會被問一次信任 hook**)→ 建 kaiwutech-TW/flightwake-tower repo + trusted publishing → 發 tower 0.1.0
3b. **Gemini CLI hook 真機驗證**:第一個真的用 Gemini 的 repo 驗 AfterAgent 是否觸發、`deny` 的 reason 是否成為下一則 prompt(結構來自官方 reference,未實跑;見 [[260902-codex-gemini-native]] 未完節)
4. **SCOPE+ 格式向使用者確認**(機隊目前零筆,是待啟用的新慣例);Phase 2 session 成本/工時規格見 [[260811-tower-and-registry]] 未完節
5. **向使用者要「最近重複踩到的那條 trap」**,對照三型(誤診/危險側通則/忘了查)驗證 confidence 修正是否命中
6. 宣傳後:盯 issues/討論回饋(含徵求日文/簡中母語者校對);GSD 側對照實測待補(benchmarks 公平性);範例 repo 降為 nice-to-have

# 常備事實(這個 repo 的 3-5 條保命知識)

- 零執行期依賴是硬承諾:安裝器與 hook 只能用 Node 內建模組 + `git`(無 shell),不得引入任何 npm 依賴
- 使用者資料(STATE/DECISIONS/TRAPS/records)任何情況不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段
- 驗證一律跑 `bash test/smoke.sh`(在暫存目錄自建 git repo 測 init,不污染本 repo)
- CLAUDE.md 片段以 `<!-- flightwake:begin vX.Y.Z -->` / `<!-- flightwake:end -->` 包裹,升級 regex 靠這對標記;同一份 snippet 依平台改寫呼叫語法(Claude `/fw-`、Codex `$fw-`、Gemini 裸名),改 snippet 時只寫 `` `/fw-x` `` 形式
- CI workflow 釘 SHA、最小權限,改 workflow 時不得放寬(開源前安全硬化的既定決策,見 3762515)
