---
updated: 2026-07-18
updated_by: Claude(Fable 5)
latest_record: records/260718-gaps-1-3.md
health: green
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake v0.3.0,內部測試中(kaiwutech-TW private),準備開源。缺口 1–3 已落地(去識別化、superseded 時效管理、多平台安裝),去重原則已入義務表(record 的 commits 表改薄為 range)。剩缺口 4–7。定位已確立:給強模型(Fable 5 級)的事後記錄框架,刻意不做 GSD 式導航——強模型自己會開車。

# 進行中(未完成勿刪)

開源前缺口清單(優先序見 DECISIONS 2026-07-18):

- [x] 1. 敏感資訊防護 ✅ ce4c563(檢查清單+grep 自查;掃描器評估結論:不內建,見 DECISIONS)
- [x] 2. 記錄增長+時效管理 ✅ dd3c082(superseded 生命週期;壓實併入既有 skill,不新增 fw-curate)
- [x] 3. 多平台安裝 ✅ fd02225(偵測 + --agents;全無指令檔建 AGENTS.md;v0.3.0)
- [ ] 4. `--private` flag:.git/info/exclude + settings.local.json,安裝時印出代價說明
- [ ] 5. uninstall 指令(寫入範圍固定 + 標記包裹片段,可逆性已具備)
- [ ] 6. CI 端 STATE 落後檢查(把 Stop hook 的紀律帶到 Claude Code 之外)
- [ ] 7. monorepo 政策:單 repo 一份或允許 workspace 子目錄各裝,開源前想清楚
- [ ] 開源前 checklist(既有):伺服器端舊 objects 清理(見 commit f50f174 的 docs)
- [x] 冷啟動實測 ✅ 首筆有效樣本入 docs/benchmarks.md(2026-07-18;flightwake 邊際 ≈ 2.6K 讀 + 2K 出,接手零猶豫)
- 已定案待觀察:慣例演進採讀取端容忍(見 DECISIONS 2026-07-18),容忍不了時再議遷移工具

# 下一步入口

1. 缺口 4 `--private` → `bin/cli.mjs` 加 flag(寫 .git/info/exclude + settings.local.json)+ smoke case
2. 缺口 5 uninstall → `bin/cli.mjs` 加子指令(寫入範圍固定,反向刪除 + 移除標記區塊)

# 常備事實(這個 repo 的 3-5 條保命知識)

- 零執行期依賴是硬承諾:安裝器與 hook 只能用 Node 內建模組 + `git`(無 shell),不得引入任何 npm 依賴
- 使用者資料(STATE/DECISIONS/TRAPS/records)任何情況不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段
- 驗證一律跑 `bash test/smoke.sh`(在暫存目錄自建 git repo 測 init,不污染本 repo)
- CLAUDE.md 片段以 `<!-- flightwake:begin vX.Y.Z -->` / `<!-- flightwake:end -->` 包裹,升級 regex 靠這對標記
- CI workflow 釘 SHA、最小權限,改 workflow 時不得放寬(開源前安全硬化的既定決策,見 3762515)
