---
updated: 2026-07-18
updated_by: Claude(Fable 5)
latest_record: records/260718-v081-actionable-statusline.md
health: green
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake v0.8.1,**已開源上線(2026-07-18)**:公開 repo、npm 0.8.1(trusted publishing 連三次 Release 零失誤)、README 四語含 GSD 遷移指南、--statusline 儀表含下一步指令提示(本 repo 與 marketing_dashboard 實跑中)。缺口 1–7 全落地、兩 gate 全關、benchmarks n=2(非自我參照,零糾正)、宣傳素材全齊(三稿 + 三張截圖)。剩:發宣傳。定位:給強模型(Fable 5 級)的事後記錄框架,補持久性與紀律、不補智力。

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
- v0.9 規劃:完整 i18n(CLI 輸出英文化 + `--lang` 模板語言;README 已四語但 CLI/skill/模板仍 zh-TW,英文 README 有註記;程式註解翻譯併入,不單獨做半套)+ statusline context 視窗改為依模型推斷(現 200k 硬編碼,大視窗模型會高估)

# 下一步入口

1. **發宣傳**(素材全齊:HN/X 中文串/X 英文短版三稿在 2026-07-18 session 對話中,截圖紅 99%/綠 43%/開場提示三張在使用者手上;HN 挑能盯留言的時段發)
2. 宣傳後:盯 issues/討論回饋;GSD 階段二全域拆除(使用者所有 repo 轉完後,拆前備份 ~/.claude/settings.json)
3. v0.9 見進行中清單;GSD 側對照實測待補(benchmarks 公平性);範例 repo 降為 nice-to-have

# 常備事實(這個 repo 的 3-5 條保命知識)

- 零執行期依賴是硬承諾:安裝器與 hook 只能用 Node 內建模組 + `git`(無 shell),不得引入任何 npm 依賴
- 使用者資料(STATE/DECISIONS/TRAPS/records)任何情況不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段
- 驗證一律跑 `bash test/smoke.sh`(在暫存目錄自建 git repo 測 init,不污染本 repo)
- CLAUDE.md 片段以 `<!-- flightwake:begin vX.Y.Z -->` / `<!-- flightwake:end -->` 包裹,升級 regex 靠這對標記
- CI workflow 釘 SHA、最小權限,改 workflow 時不得放寬(開源前安全硬化的既定決策,見 3762515)
