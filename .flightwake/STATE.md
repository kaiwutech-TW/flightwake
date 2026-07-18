---
updated: 2026-07-18
updated_by: Claude(Fable 5)
latest_record: records/260718-oss-prep.md
health: green
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake v0.7.1,內部測試中(kaiwutech-TW private)。**開源前缺口 1–7 全部落地 + 開源收殘完成**:MIT license、英文 README(README.en.md)、npm Trusted Publishing workflow(release.yml)、flip 日 runbook(docs/design.md)。5–7 回顧修了模式混用重複安裝的真 bug。剩:內部試跑、範例 repo、flip 日執行 runbook。定位已確立:給強模型(Fable 5 級)的事後記錄框架,刻意不做 GSD 式導航——強模型自己會開車。

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

# 下一步入口

1. **flip 判準(2026-07-18 改):兩個 gate 關掉即上,不等 8/1**(搶先機決策見 DECISIONS)——
   gate 1 活範例指引 ✅(README 指向本 repo .flightwake/);gate 2 第二 repo 冷啟動實測(唯一未關)
2. **gate 2 執行法**:挑一個內部真實 repo(最好有 GSD 歷史)→ `npx github:kaiwutech-TW/flightwake init` → 做一段真實工作收尾 → 下個 session 開場 /fw-coldstart 計時 + tools/session-cost.mjs --since 量 token → 數據進 benchmarks.md 第二筆
3. gate 2 關掉 → 執行 flip runbook(docs/design.md);npm 已佔位 ✅(flightwake@0.7.1 手動發布,2026-07-18,registry 實裝驗證過;runbook 的 npm 步驟只剩 trusted publisher 登記)

# 常備事實(這個 repo 的 3-5 條保命知識)

- 零執行期依賴是硬承諾:安裝器與 hook 只能用 Node 內建模組 + `git`(無 shell),不得引入任何 npm 依賴
- 使用者資料(STATE/DECISIONS/TRAPS/records)任何情況不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段
- 驗證一律跑 `bash test/smoke.sh`(在暫存目錄自建 git repo 測 init,不污染本 repo)
- CLAUDE.md 片段以 `<!-- flightwake:begin vX.Y.Z -->` / `<!-- flightwake:end -->` 包裹,升級 regex 靠這對標記
- CI workflow 釘 SHA、最小權限,改 workflow 時不得放寬(開源前安全硬化的既定決策,見 3762515)
