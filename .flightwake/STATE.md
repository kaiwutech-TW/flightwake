---
updated: 2026-07-23
updated_by: Claude(Fable 5)
latest_record: records/260723-v0101-version-gauge.md
health: green
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake v0.10.0,**已開源上線(2026-07-18)、i18n 完成(2026-07-19)**:trusted publishing 連六次 Release 零失誤、英文預設 + `--lang=zh-TW`、`update` 就地升級、儀表含下一步提示/真實視窗/新版提示(本 repo、kaiwuweb、salesmartly_chain、marketing_dashboard 實跑中,前三者已 update 至 0.9.0)。HN 已發(Show HN,留言被 auto-flag 待版主回覆)。缺口 1–7 全落地、兩 gate 全關、benchmarks n=2(非自我參照,零糾正)、宣傳素材全齊(三稿 + 三張截圖 + context 開銷故事線)。**GSD 全域已拆除(2026-07-18 晚,手冊 docs/cleanGSD.md);A/B 已量、開場底盤已分解到底**。新增 docs/workflow.md 分階段實戰手冊(四語 README 有入口)。**2026-07-23 外部評測後補強 → v0.10.0 已發佈**(fw-trap 跨 repo 坑雙寫、state-check health=green 證據檢查、hook 盲區文件化;同類專案掃描確認差異化象限無人佔據)。**Demo GIF 已上 README 首屏**(本 repo 實錄 /fw-coldstart,docs/demo.gif 244KB,四語嵌入)。npm 0.10.0 已上(驗證證據見 latest_record);**0.10.1(儀表常駐版本號)已 bump 在 main、刻意未發**——等下批新功能一起出 Release(使用者 2026-07-23 定的)。剩:發宣傳(三稿最終版在使用者桌面)。定位:給強模型(Fable 5 級)的事後記錄框架,補持久性與紀律、不補智力。

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
3. 宣傳後:盯 issues/討論回饋 + dependabot 升版 PR(PR 流程練習);GSD 側對照實測待補(benchmarks 公平性);範例 repo 降為 nice-to-have
4. 擇時:其他已裝 repo(kaiwuweb、salesmartly_chain、marketing_dashboard)`npx flightwake update` 到 0.10.0

# 常備事實(這個 repo 的 3-5 條保命知識)

- 零執行期依賴是硬承諾:安裝器與 hook 只能用 Node 內建模組 + `git`(無 shell),不得引入任何 npm 依賴
- 使用者資料(STATE/DECISIONS/TRAPS/records)任何情況不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段
- 驗證一律跑 `bash test/smoke.sh`(在暫存目錄自建 git repo 測 init,不污染本 repo)
- CLAUDE.md 片段以 `<!-- flightwake:begin vX.Y.Z -->` / `<!-- flightwake:end -->` 包裹,升級 regex 靠這對標記
- CI workflow 釘 SHA、最小權限,改 workflow 時不得放寬(開源前安全硬化的既定決策,見 3762515)
