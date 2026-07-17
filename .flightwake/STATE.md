---
updated: 2026-07-17
updated_by: Claude(Fable 5)
latest_record: records/260717-self-install.md
health: green
---
<!-- flightwake STATE — 永遠短、永遠新。新 session 的第一站。 -->
<!-- 規則:只寫「現在」與「下一步」;歷史去 records/,決策去 DECISIONS.md。 -->
<!-- 冷啟動契約:讀完本檔 + latest_record 必須能在 5 分鐘內安全接手。 -->

# 現在在哪

flightwake v0.2.0,內部測試中(kaiwutech-TW private),準備開源。本 repo 已完成自我安裝(dogfooding),開發工作從此適用自己的觸發義務表。安全硬化(CI 最小權限、Scorecard、SECURITY.md)與內部資訊匿名化已完成。

# 進行中(未完成勿刪)

- [ ] 開源前 checklist:伺服器端舊 objects 清理(見 commit f50f174 的 docs)
- [ ] 待議:init 在目標 repo 無 CLAUDE.md 時是否直接建檔(目前只警告,本次自裝就撞到)

# 下一步入口

1. 繼續開源前 checklist → 讀 `docs/` 下的 checklist 相關文件與 commit f50f174
2. 開源後發布 → npm Trusted Publishing(附 provenance),README「安全性」段已承諾
3. 改 init 的 CLAUDE.md 建檔行為 → `bin/cli.mjs` 第 90 行起的區塊 + `test/smoke.sh` 加 case

# 常備事實(這個 repo 的 3-5 條保命知識)

- 零執行期依賴是硬承諾:安裝器與 hook 只能用 Node 內建模組 + `git`(無 shell),不得引入任何 npm 依賴
- 使用者資料(STATE/DECISIONS/TRAPS/records)任何情況不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段
- 驗證一律跑 `bash test/smoke.sh`(在暫存目錄自建 git repo 測 init,不污染本 repo)
- CLAUDE.md 片段以 `<!-- flightwake:begin vX.Y.Z -->` / `<!-- flightwake:end -->` 包裹,升級 regex 靠這對標記
- CI workflow 釘 SHA、最小權限,改 workflow 時不得放寬(開源前安全硬化的既定決策,見 3762515)
