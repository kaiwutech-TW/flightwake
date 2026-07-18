---
updated: 2026-07-18
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

開源前缺口清單(優先序見 DECISIONS 2026-07-18):

- [ ] 1. 敏感資訊防護:TEMPLATE-record + fw-record skill 加「驗證證據去識別化」檢查;評估 record commit 前的簡易 secret 掃描(擋開源,最優先)
- [ ] 2. 記錄增長+時效管理:TRAPS/DECISIONS 條目加 superseded 標記、設計觸發式壓實義務(如 fw-curate);防「舊條目與新現況衝突」的偏差
- [ ] 3. 多平台安裝:init 偵測 CLAUDE.md/AGENTS.md/GEMINI.md 貼片段(都無則建 AGENTS.md)+ `--agents` flag;此決策同時解掉「無 CLAUDE.md 只警告」的舊待議
- [ ] 4. `--private` flag:.git/info/exclude + settings.local.json,安裝時印出代價說明
- [ ] 5. uninstall 指令(寫入範圍固定 + 標記包裹片段,可逆性已具備)
- [ ] 6. CI 端 STATE 落後檢查(把 Stop hook 的紀律帶到 Claude Code 之外)
- [ ] 7. monorepo 政策:單 repo 一份或允許 workspace 子目錄各裝,開源前想清楚
- [ ] 開源前 checklist(既有):伺服器端舊 objects 清理(見 commit f50f174 的 docs)

# 下一步入口

1. 敏感資訊防護 → `templates/TEMPLATE-record.md` + `skills/fw-record/SKILL.md` 加檢查項,`test/smoke.sh` 加 case
2. init 多平台偵測 → `bin/cli.mjs` 第 90 行起的 CLAUDE.md 區塊改多候選偵測
3. 開源後發布 → npm Trusted Publishing(附 provenance),README「安全性」段已承諾

# 常備事實(這個 repo 的 3-5 條保命知識)

- 零執行期依賴是硬承諾:安裝器與 hook 只能用 Node 內建模組 + `git`(無 shell),不得引入任何 npm 依賴
- 使用者資料(STATE/DECISIONS/TRAPS/records)任何情況不覆蓋;`--force` 只更新框架擁有的 skill/hook/模板/片段
- 驗證一律跑 `bash test/smoke.sh`(在暫存目錄自建 git repo 測 init,不污染本 repo)
- CLAUDE.md 片段以 `<!-- flightwake:begin vX.Y.Z -->` / `<!-- flightwake:end -->` 包裹,升級 regex 靠這對標記
- CI workflow 釘 SHA、最小權限,改 workflow 時不得放寬(開源前安全硬化的既定決策,見 3762515)
